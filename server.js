import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import fs from 'fs';
import pg from 'pg';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
// Origins allowed to call the API from another site (the public website).
// Set ALLOWED_ORIGINS in your environment as a comma-separated list.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://godakandasanchitha-eng.github.io,https://lanka-rides-kappa.vercel.app,https://fast-travel-1.vercel.app,http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors((req, cb) => {
  const origin = req.headers.origin;
  let sameOrigin = false;
  try { sameOrigin = !!origin && new URL(origin).host === req.headers.host; } catch {}
  cb(null, { origin: !origin || sameOrigin || ALLOWED_ORIGINS.includes(origin) });
}));
app.use(express.json());

// Never serve server code, data or dependencies as static files
app.use((req, res, next) => /^\/(data|node_modules|server\.js|package|\.)/i.test(req.path) ? res.status(404).end() : next());

// Serve static frontend assets
app.use(express.static(__dirname));

// In-memory OTP store (stores email -> { otp, expiresAt })
const otpStore = new Map();

// In-memory System Settings store
let settingsStore = {
  brightness: 92,
  nightLight: false,
  adaptiveBrightness: true,
  wallpaper: 'Live wallpaper',
  sleep: 'After 30 seconds of inactivity',
  autoRotate: true,
  screenSaver: 'Clock',
  colors: 'Natural',
  fontSize: 'Default',
  displaySize: 'Default',
  categories: { Sedan: true, SUV: true, KDH: true, Hatchback: true }, // shown on the public website
};

// Configure Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// API Endpoint: Send OTP
app.post('/api/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes expiration

    otpStore.set(email.toLowerCase(), { otp, expiresAt });

    console.log(`[OTP DEBUG] Sent to ${email}: ${otp}`);

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const mailOptions = {
        from: `"TD System" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'TD System - Account Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #2563eb;">Verification Code</h2>
            <p>Your one-time passkey for registering with TD System is:</p>
            <h1 style="letter-spacing: 5px; color: #111827; background: #f3f4f6; padding: 10px 20px; display: inline-block; border-radius: 8px;">${otp}</h1>
            <p>This code will expire in <strong>5 minutes</strong>.</p>
            <p style="font-size: 12px; color: #888;">If you did not request this, please ignore this email.</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
    }

    return res.status(200).json({ success: true, message: 'OTP sent successfully.' });
  } catch (err) {
    console.error('Error sending OTP:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error sending OTP.' });
  }
});

// API Endpoint: Verify OTP
app.post('/api/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
    }

    const normalizedEmail = email.toLowerCase();
    const record = otpStore.get(normalizedEmail);

    if (!record) {
      return res.status(400).json({ success: false, message: 'No OTP requested or code expired.' });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(normalizedEmail);
      return res.status(400).json({ success: false, message: 'OTP code has expired. Please request a new one.' });
    }

    if (record.otp === otp.trim()) {
      otpStore.delete(normalizedEmail);
      return res.status(200).json({ success: true, message: 'OTP verified successfully.' });
    }

    return res.status(400).json({ success: false, message: 'Invalid OTP code. Please try again.' });
  } catch (err) {
    console.error('Error verifying OTP:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error verifying OTP.' });
  }
});

// API Endpoint: Get Current System Settings
app.get('/api/settings', (req, res) => {
  try {
    return res.status(200).json({ success: true, settings: settingsStore });
  } catch (err) {
    console.error('Error fetching settings:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving settings.' });
  }
});

// API Endpoint: Update System Settings
app.post('/api/settings', requireStaff, (req, res) => {
  try {
    const newSettings = req.body;
    settingsStore = { ...settingsStore, ...newSettings };
    db.settings = settingsStore; saveDb();
    console.log('[SETTINGS DEBUG] Updated settings:', settingsStore);
    return res.status(200).json({ success: true, settings: settingsStore, message: 'Settings updated successfully.' });
  } catch (err) {
    console.error('Error updating settings:', err);
    return res.status(500).json({ success: false, message: 'Server error updating settings.' });
  }
});


// ---------------------------------------------------------------------------
// BOOKINGS (website -> backoffice)
// ---------------------------------------------------------------------------
// Simple JSON-file storage so bookings, drivers and fleet survive restarts
// (on hosts with a temporary disk this still resets on redeploy; use a real DB there).
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const COLLECTIONS = ['bookings', 'drivers', 'fleet', 'users'];
let db = { bookings: [], drivers: [], fleet: [], users: [] };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch {}

// PostgreSQL storage (open it in pgAdmin: schema "backoffice").
// If DATABASE_URL is not set, the app keeps using the JSON file only, exactly as before.
const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
    })
  : null;
if (pool) pool.on('error', (e) => console.error('PostgreSQL pool error:', e.message));
let pgReady = false; // only write to PostgreSQL after a successful load, so a failed start can never wipe it

let pgQueue = Promise.resolve();
const saveToPg = () => {
  pgQueue = pgQueue.then(async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      for (const k of COLLECTIONS) {
        const rows = db[k] || [];
        await c.query(`delete from backoffice.${k} where id <> all($1::text[])`, [rows.map((r) => String(r.id))]);
        for (const r of rows) {
          await c.query(
            `insert into backoffice.${k} (id, data) values ($1, $2)
             on conflict (id) do update set data = excluded.data, updated_at = now()`,
            [String(r.id), JSON.stringify(r)]
          );
        }
      }
      if (db.settings) {
        await c.query(
          `insert into backoffice.settings (id, data) values ('main', $1)
           on conflict (id) do update set data = excluded.data`,
          [JSON.stringify(db.settings)]
        );
      }
      await c.query('commit');
    } catch (e) {
      await c.query('rollback').catch(() => {});
      console.error('PostgreSQL save failed:', e.message);
    } finally {
      c.release();
    }
  }).catch((e) => console.error('PostgreSQL connection failed:', e.message));
};

const saveDb = () => {
  // the JSON file stays as a local backup copy
  try { fs.mkdirSync(path.dirname(DB_FILE), { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch (e) { console.error('Save failed:', e.message); }
  if (pool && pgReady) saveToPg();
};

if (pool) {
  try {
    let found = 0;
    for (const k of COLLECTIONS) {
      const r = await pool.query(`select data from backoffice.${k} order by seq`);
      if (r.rows.length) { db[k] = r.rows.map((x) => x.data); found += r.rows.length; }
    }
    const st = await pool.query(`select data from backoffice.settings where id = 'main'`);
    if (st.rows[0]) db.settings = st.rows[0].data;
    pgReady = true;
    if (found) console.log(`PostgreSQL connected. Loaded ${found} records.`);
    else { console.log('PostgreSQL connected. Tables are empty, copying current data into them.'); saveToPg(); }
  } catch (e) {
    console.error('PostgreSQL load failed, using the JSON file only:', e.message);
  }
}
const bookingsStore = db.bookings;
settingsStore = { ...settingsStore, ...(db.settings || {}) }; // restore saved settings
const rateLimit = new Map(); // ip -> [timestamps]

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAHaToGc7F2vlQt6bDXRMMHjnqRf4OANfc';

// Verifies a Firebase ID token (sent by the backoffice) using Google's REST API
async function requireStaff(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ success: false, message: 'Missing auth token.' });
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    });
    if (!r.ok) return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    const data = await r.json();
    req.user = data.users?.[0];
    return next();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Auth check failed.' });
  }
}

const clean = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const PAYMENT_TYPES = ['Cash', 'Card', 'Online transfer'];

// NOTIFY-START
// ---------------------------------------------------------------------------
// CUSTOMER NOTIFICATIONS (email, plus SMS when an SMS provider is configured)
// ---------------------------------------------------------------------------
// TEST MODE: while testing, every customer message is sent to the test email / phone below
// instead of the real customer. When you are ready to go live, set NOTIFY_TEST_MODE=false.
const NOTIFY_TEST_MODE = String(process.env.NOTIFY_TEST_MODE || 'true').toLowerCase() !== 'false';
const TEST_EMAIL = process.env.NOTIFY_TEST_EMAIL || 'tevingampalage29@gmail.com';
const TEST_PHONE = process.env.NOTIFY_TEST_PHONE || '+94754762056';
// Contact details printed at the bottom of every email
const COMPANY = {
  name: 'Lanka Rides',
  email: process.env.COMPANY_EMAIL || 'tevingampalage29@gmail.com',
  phone: process.env.COMPANY_PHONE || '+94754762056',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 0754762056 -> +94754762056
const toE164 = (p) => {
  const d = String(p || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  if (d.startsWith('00')) return '+' + d.slice(2);
  if (d.startsWith('94')) return '+' + d;
  if (d.startsWith('0')) return '+94' + d.slice(1);
  return d ? '+' + d : '';
};
const niceDate = (s) => {
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? s : d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

// SMS through Twilio (set TWILIO_SID, TWILIO_TOKEN and TWILIO_FROM). Without them the SMS is skipped.
async function sendSms(to, body) {
  const { TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM } = process.env;
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.log('[NOTIFY] SMS skipped (no SMS provider configured). Message would be:', body);
    return;
  }
  if (!to) return;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }),
  });
  if (!r.ok) throw new Error('SMS failed: ' + (await r.text()).slice(0, 200));
  console.log('[NOTIFY] SMS sent to', to);
}

// Builds the subject, plain text, HTML and SMS for a customer message
function buildMessage(b, kind, testFor) {
  const first = (b.name || 'there').split(' ')[0];
  const accepted = kind === 'accepted';
  const rows = [
    ['Booking reference', b.id],
    ['Pick-up', b.pickup],
    ['Drop-off', b.dropoff],
    ['Date', niceDate(b.date)],
    ['Time', b.time],
    ['Passengers', b.passengers],
  ];
  if (accepted && b.vehicle) rows.push(['Vehicle', b.vehicle]);
  if (accepted && b.driver) rows.push(['Driver', b.driver]);
  if (accepted && Number(b.fare) > 0) rows.push(['Fare', 'LKR ' + Number(b.fare).toLocaleString('en-US')]);

  const badge = accepted ? 'BOOKING CONFIRMED' : 'BOOKING UPDATE';
  const color = accepted ? ['#d9f4de', '#1c7a2f'] : ['#fde0e0', '#b3262b'];
  const heading = accepted ? 'Your booking has been confirmed' : 'We could not accept your booking';
  const paras = accepted
    ? [
        'Thank you for choosing ' + COMPANY.name + '. We are pleased to confirm that your booking has been accepted.',
        'Our team will contact you soon to confirm the final details of your trip. If anything changes before then, please reply to this email or call us.',
      ]
    : [
        'Thank you for your interest in ' + COMPANY.name + '. Unfortunately we are unable to accept this booking' + (b.reason ? ' (' + b.reason + ')' : '') + '.',
        'We apologise for the inconvenience. You are welcome to submit a new request for another date or vehicle, or contact us and we will gladly help.',
      ];

  const rowHtml = rows.map(([k, v]) =>
    `<tr><td style="padding:11px 0;border-bottom:1px solid #e8edf5;color:#6b7794;font-size:14px;width:38%">${esc(k)}</td>` +
    `<td style="padding:11px 0;border-bottom:1px solid #e8edf5;color:#0b1f4d;font-size:14px;font-weight:600">${esc(v)}</td></tr>`).join('');

  const testNote = testFor
    ? `<tr><td style="background:#fff4d6;color:#8a5a00;padding:10px 28px;font-size:12px">TEST MODE: this message was intended for ${esc(testFor)}.</td></tr>`
    : '';

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5fb">
<div style="padding:24px 12px;background:#f1f5fb;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0b1f4d;padding:22px 28px"><span style="color:#ffffff;font-size:21px;font-weight:700;letter-spacing:.02em">${esc(COMPANY.name)}</span></td></tr>
${testNote}
<tr><td style="padding:30px 28px 8px">
<span style="display:inline-block;background:${color[0]};color:${color[1]};border-radius:20px;padding:5px 13px;font-size:12px;font-weight:700;letter-spacing:.05em">${badge}</span>
<h1 style="margin:16px 0 14px;font-size:25px;line-height:1.25;color:#0b1f4d">${heading}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#2b3652">Dear ${esc(first)},</p>
${paras.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#2b3652">${esc(p)}</p>`).join('')}
</td></tr>
<tr><td style="padding:8px 28px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #0b1f4d">${rowHtml}</table></td></tr>
<tr><td style="padding:22px 28px 8px"><div style="background:#f1f5fb;border-radius:10px;padding:16px 18px;font-size:14px;line-height:1.7;color:#2b3652">
<b style="color:#0b1f4d">Need help?</b><br>
Email: <a href="mailto:${esc(COMPANY.email)}" style="color:#1565e0;text-decoration:none">${esc(COMPANY.email)}</a><br>
Phone: <a href="tel:${esc(COMPANY.phone)}" style="color:#1565e0;text-decoration:none">${esc(COMPANY.phone)}</a>
</div></td></tr>
<tr><td style="padding:22px 28px 28px;font-size:12px;line-height:1.6;color:#8a94ab">Kind regards,<br><b style="color:#0b1f4d">The ${esc(COMPANY.name)} team</b><br><br>This is an automated message about booking ${esc(b.id)}.</td></tr>
</table></div></body></html>`;

  const text = [
    `Dear ${first},`, '', ...paras, '',
    ...rows.map(([k, v]) => `${k}: ${v}`), '',
    `Need help? Email ${COMPANY.email} or call ${COMPANY.phone}.`, '',
    `Kind regards,`, `The ${COMPANY.name} team`,
  ].join('\n');

  const sms = accepted
    ? `${COMPANY.name}: Hi ${first}, your booking ${b.id} (${b.pickup} to ${b.dropoff}, ${b.date} ${b.time}) is confirmed. We will contact you soon. Help: ${COMPANY.phone}`
    : `${COMPANY.name}: Hi ${first}, sorry, we could not accept booking ${b.id}. Please contact ${COMPANY.phone} for help.`;

  return {
    subject: (testFor ? '[TEST] ' : '') + (accepted ? `Booking confirmed - ${b.id} | ${COMPANY.name}` : `Update on your booking ${b.id} | ${COMPANY.name}`),
    html, text, sms,
  };
}

// Sends the email (and SMS if configured). Never throws into the request: errors are logged.
async function notifyCustomer(b, kind) {
  const toEmail = NOTIFY_TEST_MODE ? TEST_EMAIL : b.email;
  const toPhone = NOTIFY_TEST_MODE ? TEST_PHONE : toE164(b.phone);
  const testFor = NOTIFY_TEST_MODE ? `${b.name} <${b.email}> / ${b.phone}` : '';
  const m = buildMessage(b, kind, testFor);

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      await transporter.sendMail({ from: `"${COMPANY.name}" <${process.env.EMAIL_USER}>`, to: toEmail, replyTo: COMPANY.email, subject: m.subject, text: m.text, html: m.html });
      console.log(`[NOTIFY] ${kind} email sent to ${toEmail} for ${b.id}`);
    } catch (e) { console.error('[NOTIFY] Email failed:', e.message); }
  } else {
    console.warn('[NOTIFY] Email NOT sent: set EMAIL_USER and EMAIL_PASS (Gmail app password) in the environment.');
  }
  try { await sendSms(toPhone, m.sms); } catch (e) { console.error('[NOTIFY]', e.message); }
}
// NOTIFY-END

// PUBLIC: called by the website booking form
// Website ride names (Saloon, SUV, Sedan, Van, Hatchback) -> back office vehicle category
const vehicleType = (v) => {
  const s = String(v || '').toLowerCase();
  if (/suv|prado/.test(s)) return 'SUV';
  if (/van|kdh/.test(s)) return 'KDH';
  if (/hatch/.test(s)) return 'Hatchback';
  if (/saloon|sedan/.test(s)) return 'Sedan';
  return '';
};

app.post('/api/bookings', (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
    const now = Date.now();
    const hits = (rateLimit.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
    if (hits.length >= 5) {
      return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
    }
    hits.push(now);
    rateLimit.set(ip, hits);

    const b = req.body || {};
    if (b.website) return res.status(200).json({ success: true }); // honeypot for bots

    const booking = {
      id: 'BK-' + Date.now().toString(36).toUpperCase(),
      status: 'New',
      createdAt: new Date().toISOString(),
      pickup: clean(b.pickup),
      dropoff: clean(b.dropoff),
      date: clean(b.date, 20),
      time: clean(b.time, 10),
      name: clean(b.name, 100),
      email: clean(b.email, 150).toLowerCase(),
      phone: clean(b.phone, 40),
      nationality: clean(b.nationality, 60),
      passengers: Math.min(Math.max(parseInt(b.passengers, 10) || 1, 1), 50),
      requests: clean(b.requests, 1000),
      vehicle: clean(b.vehicle, 60),
      type: vehicleType(b.type),
      service: clean(b.service || b.type, 80),
      flight: clean(b.flight, 30),
      endDate: clean(b.endDate, 20),
      fare: Math.max(0, Number(b.fare) || 0),
      driver: '',
      driverId: '',
      payment: '',
      reason: '',
    };

    const missing = ['pickup', 'dropoff', 'date', 'name', 'email', 'phone']
      .filter(k => !booking[k]);
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Missing fields: ${missing.join(', ')}` });
    }
    if (booking.type && settingsStore.categories?.[booking.type] === false) {
      return res.status(400).json({ success: false, message: `Sorry, ${booking.type} is currently unavailable.` });
    }
    if (!/^\S+@\S+\.\S+$/.test(booking.email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address.' });
    }

    bookingsStore.unshift(booking);
    saveDb();
    console.log('[BOOKING] New booking', booking.id, booking.name);

    // Optional: notify the owner by email
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      transporter.sendMail({
        from: `"TD System" <${process.env.EMAIL_USER}>`,
        to: process.env.BOOKING_NOTIFY_TO || process.env.EMAIL_USER,
        subject: `New booking ${booking.id} - ${booking.name}`,
        text: Object.entries(booking).map(([k, v]) => `${k}: ${v}`).join('\n'),
      }).catch(e => console.error('Booking email failed:', e.message));
    }

    return res.status(201).json({ success: true, id: booking.id, message: 'Booking received.' });
  } catch (err) {
    console.error('Error creating booking:', err);
    return res.status(500).json({ success: false, message: 'Server error creating booking.' });
  }
});

// PROTECTED: backoffice staff only
app.get('/api/bookings', requireStaff, (req, res) => {
  res.status(200).json({ success: true, bookings: bookingsStore });
});

app.patch('/api/bookings/:id', requireStaff, (req, res) => {
  const b = bookingsStore.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ success: false, message: 'Booking not found.' });
  const { status, driver, vehicle, reason, payment, driverId, fare } = req.body || {};
  const prevStatus = b.status;
  if (payment !== undefined && payment !== '' && !PAYMENT_TYPES.includes(payment)) {
    return res.status(400).json({ success: false, message: 'Invalid payment type.' });
  }
  if (status !== undefined) {
    if (!['New', 'Accepted', 'Rejected', 'Completed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    b.status = status;
  }
  if (driver !== undefined) b.driver = clean(driver, 60);
  if (vehicle !== undefined) b.vehicle = clean(vehicle, 60);
  if (reason !== undefined) b.reason = clean(reason, 200);
  if (payment !== undefined) b.payment = payment;
  if (driverId !== undefined) b.driverId = clean(driverId, 40);
  if (fare !== undefined && fare !== '') b.fare = Math.max(0, Number(fare) || 0);
  saveDb();

  // Tell the customer by email (and SMS) when a request is accepted or declined - only when the status changes
  if (['Accepted', 'Rejected'].includes(status) && status !== prevStatus) {
    notifyCustomer(b, status.toLowerCase()).catch(e => console.error('[NOTIFY] failed:', e.message));
  }
  res.status(200).json({ success: true, booking: b });
});

// PUBLIC: which vehicle categories are currently enabled (read by the website)
app.get('/api/categories', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, categories: { Sedan: true, SUV: true, KDH: true, Hatchback: true, ...(settingsStore.categories || {}) } });
});

// DRIVERS (staff only)
const DRIVER_STATUS = ['Available', 'Unavailable', 'On trip'];
const driverFields = (src) => ({
  firstName: clean(src.firstName, 60), lastName: clean(src.lastName, 60), phone: clean(src.phone, 30),
  email: clean(src.email, 120), nic: clean(src.nic, 20), license: clean(src.license, 30),
  address: clean(src.address, 200), city: clean(src.city, 40),
});
// Upgrade drivers saved by the earlier version (available: true/false)
db.drivers.forEach(d => {
  if (!d.status) d.status = d.available ? 'Available' : 'Unavailable';
  if (d.firstName === undefined) { const [f, ...r] = (d.name || '').split(' '); d.firstName = f || ''; d.lastName = r.join(' '); }
});

app.get('/api/drivers', requireStaff, (req, res) => res.json({ success: true, drivers: db.drivers }));
app.post('/api/drivers', requireStaff, (req, res) => {
  const f = driverFields(req.body || {});
  if (!f.firstName || !f.phone) return res.status(400).json({ success: false, message: 'First name and phone number are required.' });
  if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return res.status(400).json({ success: false, message: 'Invalid email address.' });
  const status = DRIVER_STATUS.includes(req.body?.status) ? req.body.status : 'Available';
  const d = { id: 'DR-' + Date.now().toString(36).toUpperCase(), ...f, name: `${f.firstName} ${f.lastName}`.trim(), status, updatedAt: new Date().toISOString() };
  db.drivers.push(d); saveDb();
  res.status(201).json({ success: true, driver: d });
});
app.patch('/api/drivers/:id', requireStaff, (req, res) => {
  const d = db.drivers.find(x => x.id === req.params.id);
  if (!d) return res.status(404).json({ success: false, message: 'Driver not found.' });
  const body = req.body || {};
  if (body.status !== undefined) {
    if (!DRIVER_STATUS.includes(body.status)) return res.status(400).json({ success: false, message: 'Invalid status.' });
    if (body.status !== d.status) d.updatedAt = new Date().toISOString();
    d.status = body.status;
  }
  if (body.firstName !== undefined) {
    const f = driverFields({ ...d, ...body });
    if (!f.firstName || !f.phone) return res.status(400).json({ success: false, message: 'First name and phone number are required.' });
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return res.status(400).json({ success: false, message: 'Invalid email address.' });
    Object.assign(d, f, { name: `${f.firstName} ${f.lastName}`.trim() });
  }
  saveDb();
  res.json({ success: true, driver: d });
});
app.delete('/api/drivers/:id', requireStaff, (req, res) => {
  db.drivers = db.drivers.filter(x => x.id !== req.params.id); saveDb();
  res.json({ success: true });
});

// FLEET (staff only)
const VEHICLE_TYPES = ['Sedan', 'KDH', 'Hatchback'];
const vehicleFields = (src) => ({
  name: clean(src.name, 80), model: clean(src.model, 80), plate: clean(src.plate, 20).toUpperCase(),
  type: VEHICLE_TYPES.includes(src.type) ? src.type : '', color: clean(src.color, 30),
  seats: Math.min(Math.max(parseInt(src.seats, 10) || 0, 0), 60), ac: src.ac === 'Non A/C' ? 'Non A/C' : 'A/C',
});
const vehicleError = (f) => {
  const miss = [['name', 'Vehicle name'], ['model', 'Vehicle model'], ['plate', 'Number plate'], ['type', 'Vehicle type']].filter(([k]) => !f[k]).map(([, l]) => l);
  return miss.length ? `${miss.join(', ')} ${miss.length > 1 ? 'are' : 'is'} required.` : '';
};
app.get('/api/fleet', requireStaff, (req, res) => res.json({ success: true, fleet: db.fleet }));
app.post('/api/fleet', requireStaff, (req, res) => {
  const f = vehicleFields(req.body || {});
  const err = vehicleError(f);
  if (err) return res.status(400).json({ success: false, message: err });
  const v = { id: 'VH-' + Date.now().toString(36).toUpperCase(), ...f };
  db.fleet.push(v); saveDb();
  res.status(201).json({ success: true, vehicle: v });
});
app.patch('/api/fleet/:id', requireStaff, (req, res) => {
  const v = db.fleet.find(x => x.id === req.params.id);
  if (!v) return res.status(404).json({ success: false, message: 'Vehicle not found.' });
  const f = vehicleFields({ ...v, ...(req.body || {}) });
  const err = vehicleError(f);
  if (err) return res.status(400).json({ success: false, message: err });
  Object.assign(v, f); saveDb();
  res.json({ success: true, vehicle: v });
});
app.delete('/api/fleet/:id', requireStaff, (req, res) => {
  db.fleet = db.fleet.filter(x => x.id !== req.params.id); saveDb();
  res.json({ success: true });
});

// USERS (staff only) - records who works in the system and their role.
// NOTE: this does not create a Firebase login; add the person in Firebase Authentication too.
const USER_ROLES = ['Owner', 'Dispatcher', 'Driver', 'Accountant'];
const userFields = (src) => ({
  name: clean(src.name, 80), email: clean(src.email, 120).toLowerCase(), phone: clean(src.phone, 30),
  role: USER_ROLES.includes(src.role) ? src.role : '', status: src.status === 'Inactive' ? 'Inactive' : 'Active',
});
const userError = (f) => {
  if (!f.name || !f.email || !f.role) return 'Full name, email and role are required.';
  if (!/^\S+@\S+\.\S+$/.test(f.email)) return 'Invalid email address.';
  return '';
};
app.get('/api/users', requireStaff, (req, res) => res.json({ success: true, users: db.users }));
app.post('/api/users', requireStaff, (req, res) => {
  const f = userFields(req.body || {});
  const err = userError(f);
  if (err) return res.status(400).json({ success: false, message: err });
  if (db.users.some(u => u.email === f.email)) return res.status(400).json({ success: false, message: 'A user with this email already exists.' });
  const u = { id: 'US-' + Date.now().toString(36).toUpperCase(), ...f, createdAt: new Date().toISOString() };
  db.users.push(u); saveDb();
  res.status(201).json({ success: true, user: u });
});
app.patch('/api/users/:id', requireStaff, (req, res) => {
  const u = db.users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ success: false, message: 'User not found.' });
  const f = userFields({ ...u, ...(req.body || {}) });
  const err = userError(f);
  if (err) return res.status(400).json({ success: false, message: err });
  if (db.users.some(x => x.id !== u.id && x.email === f.email)) return res.status(400).json({ success: false, message: 'A user with this email already exists.' });
  Object.assign(u, f); saveDb();
  res.json({ success: true, user: u });
});
app.delete('/api/users/:id', requireStaff, (req, res) => {
  db.users = db.users.filter(x => x.id !== req.params.id); saveDb();
  res.json({ success: true });
});

// Fallback Route for Single Page Application (index.html, or index_9.html if that is your file name)
app.get(/(.*)/, (req, res) => {
  const page = fs.existsSync(path.join(__dirname, 'index.html')) ? 'index.html' : 'index_9.html';
  res.sendFile(path.join(__dirname, page));
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend server actively listening on port ${PORT}`);
});
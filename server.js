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

const otpStore = new Map();

let settingsStore = {
  onlineBookings: true,
  maintenanceMode: false,
  minNotice: 3,
  maxDuration: 14,
  buffer: 30,
  grace: 15,
  maxPassengers: 50,
  closedDates: '',
  airportSameDayHours: 24,
  cancelFee48: 0,
  cancelFee24: 25,
  cancelFeeUnder24: 50,
  baseFare: 0,
  minimumFare: 0,
  rateSedan: 120,
  rateKDH: 280,
  rateSUV: 0,
  rateHatch: 95,
  airportSurcharge: 0,
  nightSurcharge: 0,
  waitingCharge: 0,
  tollCharges: 'At cost',
  parkingCharges: 'At cost',
  bookingFee: 0,
  seasonalPricing: '',
  currency: 'LKR',
  taxPercent: 0,
  companyName: 'Lanka Rides',
  logoUrl: '',
  heroTitle: 'Discover Sri Lanka, one ride at a time.',
  heroDescription: 'From airport pickups to island tours, explore Sri Lanka with a trusted local driver.',
  contactPhone: '+94 11 234 5678',
  whatsappNumber: '+94 77 123 4567',
  bookingEmail: 'bookings@lankanrides.lk',
  notificationEmail: '',
  workingHours: 'Daily: 6am – 10pm',
  physicalAddress: '',
  footerText: '',
  socialLinks: '',
  seoTitle: 'Lanka Rides',
  seoDescription: '',
  homepageVehicles: 'Sedan,SUV,Hatchback,KDH',
  homepageDestinations: 'Ella,Kandy,Galle,Mirissa,Arugam Bay',
  tours: '',
  promotionalBanner: '',
  bookingConfirmation: 'Manual',
  requiredFields: 'pickup,dropoff,date,name,email,phone',
  flightRequired: false,
  nationalityRequired: false,
  passengerFieldRequired: true,
  depositPercent: 0,
  paymentMethods: 'Cash,Card,Online transfer',
  acceptedEmailTemplate: '',
  rejectedEmailTemplate: '',
  whatsappTemplate: '',
  statusNotifications: true,
  serviceAreas: '',
  unavailableLocations: '',
  vehicleCounts: '',
  destinationAvailability: '',
  driverAvailabilityRules: '',
  vehicleOccupancyLimits: '',
  multiDaySettings: '',
  customRequestHandling: true,
  brightness: 92,
  nightLight: false,
  adaptiveBrightness: true,
  wallpaper: 'Glassy V5',
  sleep: 'After 30 seconds of inactivity',
  autoRotate: true,
  screenSaver: 'Clock',
  colors: 'Natural',
  fontSize: 'Default',
  displaySize: 'Default',
  categories: { Sedan: true, SUV: true, KDH: true, Hatchback: true },
};

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.post('/api/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;

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

app.get('/api/settings', requireStaff, (req, res) => {
  try {
    return res.status(200).json({ success: true, settings: settingsStore });
  } catch (err) {
    console.error('Error fetching settings:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving settings.' });
  }
});

app.post('/api/settings', requireStaff, (req, res) => {
  try {
    const newSettings = req.body || {};
    const booleanKeys = [
      'onlineBookings', 'maintenanceMode', 'flightRequired', 'nationalityRequired',
      'passengerFieldRequired', 'statusNotifications', 'customRequestHandling',
    ];
    for (const key of booleanKeys) {
      if (key in newSettings) {
        newSettings[key] = newSettings[key] === true || String(newSettings[key]).toLowerCase() === 'true';
      }
    }
    const numericKeys = [
      'minNotice', 'maxDuration', 'buffer', 'grace', 'maxPassengers', 'airportSameDayHours',
      'cancelFee48', 'cancelFee24', 'cancelFeeUnder24', 'baseFare', 'minimumFare',
      'rateSedan', 'rateKDH', 'rateSUV', 'rateHatch', 'airportSurcharge', 'nightSurcharge',
      'waitingCharge', 'bookingFee', 'taxPercent', 'depositPercent',
    ];
    for (const key of numericKeys) {
      if (key in newSettings) {
        const value = Number(newSettings[key]);
        if (!Number.isFinite(value) || value < 0) {
          return res.status(400).json({ success: false, message: `${key} must be a non-negative number.` });
        }
        newSettings[key] = value;
      }
    }
    for (const key of ['cancelFee48', 'cancelFee24', 'cancelFeeUnder24', 'depositPercent']) {
      if (key in newSettings && newSettings[key] > 100) {
        return res.status(400).json({ success: false, message: `${key} cannot exceed 100%.` });
      }
    }
    if ('maxPassengers' in newSettings && (newSettings.maxPassengers < 1 || newSettings.maxPassengers > 60)) {
      return res.status(400).json({ success: false, message: 'maxPassengers must be between 1 and 60.' });
    }
    for (const key of ['socialLinks', 'seasonalPricing', 'tours', 'vehicleCounts', 'destinationAvailability', 'vehicleOccupancyLimits']) {
      if (typeof newSettings[key] === 'string' && newSettings[key].trim()) {
        try {
          const parsed = JSON.parse(newSettings[key]);
          if (['socialLinks', 'vehicleCounts', 'destinationAvailability', 'vehicleOccupancyLimits'].includes(key) &&
              (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
            return res.status(400).json({ success: false, message: `${key} must be a JSON object.` });
          }
          if (key === 'tours' && !Array.isArray(parsed)) {
            return res.status(400).json({ success: false, message: 'tours must be a JSON array.' });
          }
        } catch {
          return res.status(400).json({ success: false, message: `${key} must contain valid JSON.` });
        }
      }
    }
    if (newSettings.bookingConfirmation !== undefined && !['Manual', 'Automatic'].includes(newSettings.bookingConfirmation)) {
      return res.status(400).json({ success: false, message: 'Invalid booking confirmation mode.' });
    }
    settingsStore = { ...settingsStore, ...newSettings };
    db.settings = settingsStore;
    saveDb();
    console.log('[SETTINGS DEBUG] Updated settings:', settingsStore);
    return res.status(200).json({ success: true, settings: settingsStore, message: 'Settings updated successfully.' });
  } catch (err) {
    console.error('Error updating settings:', err);
    return res.status(500).json({ success: false, message: 'Server error updating settings.' });
  }
});

const DB_FILE = path.join(__dirname, 'data', 'db.json');
const COLLECTIONS = ['bookings', 'drivers', 'fleet', 'users'];
let db = { bookings: [], drivers: [], fleet: [], users: [] };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch {}

const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
    })
  : null;
if (pool) pool.on('error', (e) => console.error('PostgreSQL pool error:', e.message));
let pgReady = false;

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
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
  } catch (e) {
    console.error('Save failed:', e.message);
  }
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
settingsStore = { ...settingsStore, ...(db.settings || {}) };
const rateLimit = new Map();

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAHaToGc7F2vlQt6bDXRMMHjnqRf4OANfc';

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
const isISODate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const settingObject = (key) => {
  const value = settingsStore[key];
  if (!value) return {};
  return typeof value === 'string' ? JSON.parse(value) : value;
};
const PAYMENT_TYPES = ['Cash', 'Card', 'Online transfer'];

const NOTIFY_TEST_MODE = String(process.env.NOTIFY_TEST_MODE || 'true').toLowerCase() !== 'false';
const TEST_EMAIL = process.env.NOTIFY_TEST_EMAIL || 'tevingampalage29@gmail.com';
const TEST_PHONE = process.env.NOTIFY_TEST_PHONE || '+94754762056';
const COMPANY = {
  name: 'Lanka Rides',
  email: process.env.COMPANY_EMAIL || 'tevingampalage29@gmail.com',
  phone: process.env.COMPANY_PHONE || '+94754762056',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": "'" }[c]));
const toE164 = (p) => {
  const d = String(p || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  if (d.startsWith('00')) return '+' + d.slice(2);
  if (d.startsWith('94')) return '+' + d;
  if (d.startsWith('0')) return '+94' + d.slice(1);
  return d ? '+' + d : '';
};
const niceDate = (s) => {
  const d = new Date(`${s}T00:00:00`);
  return isNaN(d) ? s : d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

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

function buildMessage(b, kind, testFor) {
  const first = (b.name || 'there').split(' ')[0];
  const company = {
    name: settingsStore.companyName || COMPANY.name,
    email: settingsStore.bookingEmail || COMPANY.email,
    phone: settingsStore.contactPhone || COMPANY.phone,
  };
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
  if (accepted && Number(b.fare) > 0) rows.push(['Fare', `${settingsStore.currency || 'LKR'} ${Number(b.fare).toLocaleString('en-US')}`]);

  const badge = accepted ? 'BOOKING CONFIRMED' : 'BOOKING UPDATE';
  const color = accepted ? ['#d9f4de', '#1c7a2f'] : ['#fde0e0', '#b3262b'];
  const heading = accepted ? 'Your booking has been confirmed' : 'We could not accept your booking';
  const paras = accepted
    ? [
        `Thank you for choosing ${company.name}. We are pleased to confirm that your booking has been accepted.`,
        'Our team will contact you soon to confirm the final details of your trip. If anything changes before then, please reply to this email or call us.',
      ]
    : [
        `Thank you for your interest in ${company.name}. Unfortunately we are unable to accept this booking${b.reason ? ` (${b.reason})` : ''}.`,
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
<tr><td style="background:#0b1f4d;padding:22px 28px"><span style="color:#ffffff;font-size:21px;font-weight:700;letter-spacing:.02em">${esc(company.name)}</span></td></tr>
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
Email: <a href="mailto:${esc(company.email)}" style="color:#1565e0;text-decoration:none">${esc(company.email)}</a><br>
Phone: <a href="tel:${esc(company.phone)}" style="color:#1565e0;text-decoration:none">${esc(company.phone)}</a>
</div></td></tr>
<tr><td style="padding:22px 28px 28px;font-size:12px;line-height:1.6;color:#8a94ab">Kind regards,<br><b style="color:#0b1f4d">The ${esc(company.name)} team</b><br><br>This is an automated message about booking ${esc(b.id)}.</td></tr>
</table></div></body></html>`;

  const text = [
    `Dear ${first},`, '', ...paras, '',
    ...rows.map(([k, v]) => `${k}: ${v}`), '',
    `Need help? Email ${company.email} or call ${company.phone}.`, '',
    'Kind regards,', `The ${company.name} team`,
  ].join('\n');

  const sms = accepted
    ? `${company.name}: Hi ${first}, your booking ${b.id} (${b.pickup} to ${b.dropoff}, ${b.date} ${b.time}) is confirmed. We will contact you soon. Help: ${company.phone}`
    : `${company.name}: Hi ${first}, sorry, we could not accept booking ${b.id}. Please contact ${company.phone} for help.`;
  const values = { ...b, name: b.name || '', firstName: first };
  const renderTemplate = (template) => String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => String(values[key] ?? ''));
  const customText = renderTemplate(accepted ? settingsStore.acceptedEmailTemplate : settingsStore.rejectedEmailTemplate);
  const customSms = renderTemplate(settingsStore.whatsappTemplate);

  return {
    subject: (testFor ? '[TEST] ' : '') + (accepted ? `Booking confirmed - ${b.id} | ${company.name}` : `Update on your booking ${b.id} | ${company.name}`),
    html: customText ? `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${esc(customText)}</div>` : html,
    text: customText || text,
    sms: customSms || sms,
  };
}

async function notifyCustomer(b, kind) {
  const toEmail = NOTIFY_TEST_MODE ? TEST_EMAIL : b.email;
  const toPhone = NOTIFY_TEST_MODE ? TEST_PHONE : toE164(b.phone);
  const testFor = NOTIFY_TEST_MODE ? `${b.name} <${b.email}> / ${b.phone}` : '';
  const m = buildMessage(b, kind, testFor);
  const company = {
    name: settingsStore.companyName || COMPANY.name,
    email: settingsStore.bookingEmail || COMPANY.email,
  };

  if (settingsStore.statusNotifications === false) return;
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      await transporter.sendMail({ from: `"${company.name}" <${process.env.EMAIL_USER}>`, to: toEmail, replyTo: company.email, subject: m.subject, text: m.text, html: m.html });
      console.log(`[NOTIFY] ${kind} email sent to ${toEmail} for ${b.id}`);
    } catch (e) { console.error('[NOTIFY] Email failed:', e.message); }
  } else {
    console.warn('[NOTIFY] Email NOT sent: set EMAIL_USER and EMAIL_PASS (Gmail app password) in the environment.');
  }
  try { await sendSms(toPhone, m.sms); } catch (e) { console.error('[NOTIFY]', e.message); }
}

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
    if (b.website) return res.status(200).json({ success: true });
    if (settingsStore.maintenanceMode) {
      return res.status(503).json({ success: false, message: 'Online bookings are temporarily unavailable for maintenance.' });
    }
    if (settingsStore.onlineBookings === false) {
      return res.status(403).json({ success: false, message: 'Online bookings are currently disabled.' });
    }
    const distanceKm = b.distanceKm === undefined || b.distanceKm === '' ? '' : Number(b.distanceKm);
    const waitingHours = b.waitingHours === undefined || b.waitingHours === '' ? 0 : Number(b.waitingHours);
    if (distanceKm !== '' && (!Number.isFinite(distanceKm) || distanceKm < 0)) {
      return res.status(400).json({ success: false, message: 'Distance must be a non-negative number.' });
    }
    if (!Number.isFinite(waitingHours) || waitingHours < 0) {
      return res.status(400).json({ success: false, message: 'Waiting hours must be a non-negative number.' });
    }

    const booking = {
      id: 'BK-' + Date.now().toString(36).toUpperCase(),
      status: settingsStore.bookingConfirmation === 'Automatic' ? 'Accepted' : 'New',
      createdAt: new Date().toISOString(),
      pickup: clean(b.pickup),
      dropoff: clean(b.dropoff),
      date: clean(b.date, 20),
      time: clean(b.time, 10),
      name: clean(b.name, 100),
      email: clean(b.email, 150).toLowerCase(),
      phone: clean(b.phone, 40),
      nationality: clean(b.nationality, 60),
      passengers: Math.min(Math.max(parseInt(b.passengers, 10) || 1, 1), 60),
      requests: clean(b.requests, 1000),
      vehicle: clean(b.vehicle, 60),
      type: vehicleType(b.type),
      service: clean(b.service || b.type, 80),
      flight: clean(b.flight, 30),
      endDate: clean(b.endDate, 20),
      distanceKm,
      waitingHours,
      fare: Math.max(0, Number(b.fare) || 0),
      driver: '',
      driverId: '',
      payment: '',
      reason: '',
    };

    const requiredFields = String(settingsStore.requiredFields || 'pickup,dropoff,date,name,email,phone')
      .split(',').map(field => field.trim()).filter(Boolean);
    if (settingsStore.flightRequired && !booking.flight) requiredFields.push('flight');
    if (settingsStore.nationalityRequired && !booking.nationality) requiredFields.push('nationality');
    if (settingsStore.passengerFieldRequired && !Object.prototype.hasOwnProperty.call(b, 'passengers')) requiredFields.push('passengers');
    const missing = [...new Set(requiredFields)]
      .filter(k => !booking[k]);
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Missing fields: ${missing.join(', ')}` });
    }
    if (booking.type && settingsStore.categories?.[booking.type] === false) {
      return res.status(400).json({ success: false, message: `Sorry, ${booking.type} is currently unavailable.` });
    }
    if (booking.passengers > Number(settingsStore.maxPassengers || 50)) {
      return res.status(400).json({ success: false, message: `Maximum passengers per booking is ${settingsStore.maxPassengers}.` });
    }
    if (booking.type) {
      const occupancyLimits = settingObject('vehicleOccupancyLimits');
      const categoryLimit = Number(occupancyLimits[booking.type]);
      if (Object.prototype.hasOwnProperty.call(occupancyLimits, booking.type) &&
          Number.isFinite(categoryLimit) && booking.passengers > categoryLimit) {
        return res.status(400).json({ success: false, message: `${booking.type} supports up to ${categoryLimit} passengers.` });
      }
    }
    if (!settingsStore.customRequestHandling && booking.requests) {
      return res.status(400).json({ success: false, message: 'Custom trip requests are not currently accepted.' });
    }
    const unavailableLocations = String(settingsStore.unavailableLocations || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    const tripLocations = `${booking.pickup} ${booking.dropoff}`.toLowerCase();
    const unavailableLocation = unavailableLocations.find(location => tripLocations.includes(location));
    if (unavailableLocation) {
      return res.status(400).json({ success: false, message: `Bookings involving ${unavailableLocation} are unavailable.` });
    }
    const serviceAreas = String(settingsStore.serviceAreas || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    if (serviceAreas.length && ![booking.pickup, booking.dropoff].every(location => serviceAreas.some(area => location.toLowerCase().includes(area)))) {
      return res.status(400).json({ success: false, message: 'Pickup and drop-off must be within configured service areas.' });
    }
    if (booking.dropoff) {
      const destinationAvailability = settingObject('destinationAvailability');
      const unavailableDestination = Object.entries(destinationAvailability).find(([name, enabled]) =>
        name.toLowerCase() === booking.dropoff.toLowerCase() && enabled === false);
      if (unavailableDestination) {
        return res.status(400).json({ success: false, message: `${booking.dropoff} is not currently available.` });
      }
    }
    if (booking.date) {
      if (!isISODate(booking.date) || (booking.time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(booking.time))) {
        return res.status(400).json({ success: false, message: 'Invalid pickup date or time.' });
      }
      const pickupDate = new Date(`${booking.date}T${booking.time || '00:00'}:00+05:30`);
      if (Number.isNaN(pickupDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid pickup date or time.' });
      }
      const hoursUntilPickup = (pickupDate.getTime() - Date.now()) / 3600000;
      if (hoursUntilPickup < Number(settingsStore.minNotice || 0)) {
        return res.status(400).json({ success: false, message: `Bookings require at least ${settingsStore.minNotice} hours' notice.` });
      }
      const endDateTime = booking.endDate ? Date.parse(`${booking.endDate}T00:00:00+05:30`) : NaN;
      if (booking.endDate && (!isISODate(booking.endDate) || Number.isNaN(endDateTime))) {
        return res.status(400).json({ success: false, message: 'Invalid trip end date.' });
      }
      const tripDays = booking.endDate
        ? (endDateTime - Date.parse(`${booking.date}T00:00:00+05:30`)) / 86400000
        : 0;
      const maxTripDays = settingsStore.maxDuration === undefined ? 14 : Number(settingsStore.maxDuration);
      if (tripDays < 0 || tripDays > maxTripDays) {
        return res.status(400).json({ success: false, message: `Trip duration cannot exceed ${settingsStore.maxDuration} days.` });
      }
      const closedDates = String(settingsStore.closedDates || '').split(',').map(date => date.trim()).filter(Boolean);
      for (const date of closedDates) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date >= booking.date && date <= (booking.endDate || booking.date)) {
          return res.status(400).json({ success: false, message: `Bookings are unavailable on ${date}.` });
        }
      }
      if (/airport|\bcmb\b/i.test(`${booking.pickup} ${booking.dropoff}`) &&
          hoursUntilPickup < Number(settingsStore.airportSameDayHours || 0)) {
        return res.status(400).json({ success: false, message: `Airport transfers require ${settingsStore.airportSameDayHours} hours' notice.` });
      }
    }
    if (!/^\S+@\S+\.\S+$/.test(booking.email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address.' });
    }
    if (booking.status === 'Accepted' && booking.type) {
      const vehicleCounts = settingObject('vehicleCounts');
      const categoryLimit = Number(vehicleCounts[booking.type]);
      const activeCount = bookingsStore.filter(existing =>
        existing.status === 'Accepted' && existing.type === booking.type && existing.date === booking.date).length;
      if (Number.isFinite(categoryLimit) && categoryLimit >= 0 && activeCount >= categoryLimit) {
        return res.status(409).json({ success: false, message: `No ${booking.type} vehicles are available for this date.` });
      }
    }

    bookingsStore.unshift(booking);
    saveDb();
    console.log('[BOOKING] New booking', booking.id, booking.name);

    if (booking.status === 'Accepted' && settingsStore.statusNotifications !== false) {
      notifyCustomer(booking, 'accepted').catch(e => console.error('[NOTIFY] failed:', e.message));
    }

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      transporter.sendMail({
        from: `"TD System" <${process.env.EMAIL_USER}>`,
        to: settingsStore.notificationEmail || process.env.BOOKING_NOTIFY_TO || process.env.EMAIL_USER,
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

app.get('/api/bookings', requireStaff, (req, res) => {
  res.status(200).json({ success: true, bookings: bookingsStore });
});

app.patch('/api/bookings/:id', requireStaff, (req, res) => {
  const b = bookingsStore.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ success: false, message: 'Booking not found.' });
  const { status, driver, vehicle, reason, payment, driverId, fare, distanceKm, waitingHours } = req.body || {};
  const prevStatus = b.status;
  const paymentTypes = String(settingsStore.paymentMethods || PAYMENT_TYPES.join(',')).split(',').map(type => type.trim()).filter(Boolean);
  if (payment !== undefined && payment !== '' && !paymentTypes.includes(payment)) {
    return res.status(400).json({ success: false, message: 'Invalid payment type.' });
  }
  if (status !== undefined) {
    if (!['New', 'Accepted', 'Rejected', 'Completed', 'Cancelled', 'No-show'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    if (status === 'No-show') {
      if (prevStatus !== 'Accepted' || !isISODate(b.date)) {
        return res.status(400).json({ success: false, message: 'Only accepted bookings can be marked as a no-show.' });
      }
      if (b.time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(b.time)) {
        return res.status(400).json({ success: false, message: 'The booking has an invalid pickup time.' });
      }
      const start = new Date(`${b.date}T${b.time || '00:00'}:00+05:30`).getTime();
      if (Number.isNaN(start)) return res.status(400).json({ success: false, message: 'The booking has an invalid pickup date or time.' });
      const graceEndsAt = start + Number(settingsStore.grace || 0) * 60000;
      if (Date.now() < graceEndsAt) {
        return res.status(400).json({ success: false, message: `Wait until ${settingsStore.grace} minutes after pickup before marking a no-show.` });
      }
    }
  }
  const newAcceptance = status === 'Accepted' && prevStatus !== 'Accepted';
  const assignmentChanged = prevStatus === 'Accepted' && (driver !== undefined || vehicle !== undefined || driverId !== undefined);
  if (newAcceptance || assignmentChanged) {
    const selectedDriverId = driverId !== undefined ? clean(driverId, 40) : b.driverId;
    const selectedDriverName = driver !== undefined ? clean(driver, 60) : b.driver;
    const selectedDriver = selectedDriverId
      ? db.drivers.find(item => item.id === selectedDriverId)
      : db.drivers.find(item => item.name === selectedDriverName);
    if ((selectedDriverId || selectedDriverName) && !selectedDriver) {
      return res.status(400).json({ success: false, message: 'The selected driver was not found.' });
    }
    const alreadyAssignedDriver = selectedDriver && (selectedDriver.id === b.driverId || (!b.driverId && selectedDriver.name === b.driver));
    if (selectedDriver && selectedDriver.status !== 'Available' && !alreadyAssignedDriver) {
      return res.status(409).json({ success: false, message: 'The selected driver is not available.' });
    }
    const selectedVehicle = vehicle !== undefined ? clean(vehicle, 60) : b.vehicle;
    const selectedVehicleRecord = selectedVehicle
      ? db.fleet.find(item => `${item.name} · ${item.plate}` === selectedVehicle || item.id === selectedVehicle)
      : null;
    if (selectedVehicle && !selectedVehicleRecord) {
      return res.status(400).json({ success: false, message: 'The selected vehicle was not found.' });
    }
    if (selectedVehicleRecord && b.type && selectedVehicleRecord.type !== b.type) {
      return res.status(409).json({ success: false, message: 'The selected vehicle does not match the requested category.' });
    }
    if (selectedVehicleRecord && Number(b.passengers) > Number(selectedVehicleRecord.seats || 0)) {
      return res.status(409).json({ success: false, message: `The selected vehicle seats up to ${selectedVehicleRecord.seats} passengers.` });
    }
    const selectedType = b.type;
    if (selectedType) {
      const occupancyLimits = settingObject('vehicleOccupancyLimits');
      const limit = Number(occupancyLimits[selectedType]);
      if (Object.prototype.hasOwnProperty.call(occupancyLimits, selectedType) &&
          Number.isFinite(limit) && Number(b.passengers) > limit) {
        return res.status(409).json({ success: false, message: `${selectedType} supports up to ${limit} passengers.` });
      }
      const vehicleCounts = settingObject('vehicleCounts');
      const categoryLimit = Number(vehicleCounts[selectedType]);
      const activeCount = bookingsStore.filter(existing =>
        existing.id !== b.id && existing.status === 'Accepted' && existing.type === selectedType && existing.date === b.date).length;
      if (Number.isFinite(categoryLimit) && categoryLimit >= 0 && activeCount >= categoryLimit) {
        return res.status(409).json({ success: false, message: `No ${selectedType} vehicles are available for this date.` });
      }
    }
    const bufferMs = Number(settingsStore.buffer || 0) * 60000;
    const candidateStart = new Date(`${b.date}T${b.time || '00:00'}:00+05:30`).getTime();
    const candidateDriver = selectedDriver?.id || selectedDriverId || driver || b.driver;
    const conflicts = bookingsStore.find(existing => {
      if (existing.id === b.id || existing.status !== 'Accepted' || existing.date !== b.date) return false;
      const sharesDriver = candidateDriver && (existing.driverId === candidateDriver || existing.driver === candidateDriver);
      const sharesVehicle = selectedVehicle && existing.vehicle === selectedVehicle;
      if (!sharesDriver && !sharesVehicle) return false;
      const otherStart = new Date(`${existing.date}T${existing.time || '00:00'}:00+05:30`).getTime();
      return Number.isFinite(candidateStart) && Number.isFinite(otherStart) && Math.abs(candidateStart - otherStart) < bufferMs;
    });
    if (conflicts) return res.status(409).json({ success: false, message: `Allow at least ${settingsStore.buffer} minutes between trips assigned to the same driver or vehicle.` });
  }
  const parsedDistance = distanceKm === undefined || distanceKm === '' ? undefined : Number(distanceKm);
  const parsedWaitingHours = waitingHours === undefined || waitingHours === '' ? undefined : Number(waitingHours);
  if (parsedDistance !== undefined && (!Number.isFinite(parsedDistance) || parsedDistance < 0)) {
    return res.status(400).json({ success: false, message: 'Distance must be a non-negative number.' });
  }
  if (parsedWaitingHours !== undefined && (!Number.isFinite(parsedWaitingHours) || parsedWaitingHours < 0)) {
    return res.status(400).json({ success: false, message: 'Waiting hours must be a non-negative number.' });
  }
  if (status !== undefined) b.status = status;
  if (driver !== undefined) b.driver = clean(driver, 60);
  if (vehicle !== undefined) b.vehicle = clean(vehicle, 60);
  if (reason !== undefined) b.reason = clean(reason, 200);
  if (payment !== undefined) b.payment = payment;
  if (driverId !== undefined) b.driverId = clean(driverId, 40);
  if (fare !== undefined && fare !== '') b.fare = Math.max(0, Number(fare) || 0);
  if (parsedDistance !== undefined) b.distanceKm = parsedDistance;
  if (parsedWaitingHours !== undefined) b.waitingHours = parsedWaitingHours;
  if (status === 'No-show') b.noShowAt = new Date().toISOString();
  if (status === 'Cancelled' && prevStatus === 'Accepted') {
    const pickupAt = new Date(`${b.date}T${b.time || '00:00'}:00+05:30`).getTime();
    const hoursUntilPickup = (pickupAt - Date.now()) / 3600000;
    b.cancellationFeePercent = hoursUntilPickup >= 48
      ? Number(settingsStore.cancelFee48) || 0
      : hoursUntilPickup >= 24 ? Number(settingsStore.cancelFee24) || 0 : Number(settingsStore.cancelFeeUnder24) || 0;
    b.cancellationFee = Math.round((Number(b.fare) || 0) * b.cancellationFeePercent / 100);
  }
  saveDb();

  if (settingsStore.statusNotifications !== false && ['Accepted', 'Rejected'].includes(status) && status !== prevStatus) {
    notifyCustomer(b, status.toLowerCase()).catch(e => console.error('[NOTIFY] failed:', e.message));
  }
  res.status(200).json({ success: true, booking: b });
});

app.get('/api/public-config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const publicKeys = [
    'onlineBookings', 'maintenanceMode', 'minNotice', 'maxDuration', 'buffer', 'grace', 'maxPassengers',
    'closedDates', 'airportSameDayHours', 'cancelFee48', 'cancelFee24', 'cancelFeeUnder24',
    'baseFare', 'minimumFare', 'rateSedan', 'rateKDH', 'rateSUV', 'rateHatch',
    'airportSurcharge', 'nightSurcharge', 'waitingCharge', 'tollCharges', 'parkingCharges',
    'bookingFee', 'seasonalPricing', 'currency', 'taxPercent', 'companyName', 'logoUrl',
    'heroTitle', 'heroDescription', 'contactPhone', 'whatsappNumber', 'bookingEmail',
    'workingHours', 'physicalAddress', 'footerText', 'socialLinks', 'seoTitle', 'seoDescription',
    'homepageVehicles', 'homepageDestinations', 'tours', 'promotionalBanner',
    'bookingConfirmation', 'requiredFields', 'flightRequired', 'nationalityRequired',
    'passengerFieldRequired', 'depositPercent', 'paymentMethods', 'statusNotifications',
    'serviceAreas', 'unavailableLocations', 'categories', 'vehicleCounts',
    'destinationAvailability', 'driverAvailabilityRules', 'vehicleOccupancyLimits',
    'multiDaySettings', 'customRequestHandling',
  ];
  const settings = {};
  publicKeys.forEach(key => { settings[key] = settingsStore[key]; });
  return res.json({ success: true, settings });
});

app.get('/api/categories', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, categories: { Sedan: true, SUV: true, KDH: true, Hatchback: true, ...(settingsStore.categories || {}) } });
});

const DRIVER_STATUS = ['Available', 'Unavailable', 'On trip'];
const driverFields = (src) => ({
  firstName: clean(src.firstName, 60), lastName: clean(src.lastName, 60), phone: clean(src.phone, 30),
  email: clean(src.email, 120), nic: clean(src.nic, 20), license: clean(src.license, 30),
  address: clean(src.address, 200), city: clean(src.city, 40),
});
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

const VEHICLE_TYPES = ['Sedan', 'SUV', 'KDH', 'Hatchback'];
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

app.get(/(.*)/, (req, res) => {
  const page = fs.existsSync(path.join(__dirname, 'index.html')) ? 'index.html' : 'index_2.html';
  res.sendFile(path.join(__dirname, page));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend server actively listening on port ${PORT}`);
});
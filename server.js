import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
// Origins allowed to call the API from another site (the public website).
// Set ALLOWED_ORIGINS in your environment as a comma-separated list.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://lanka-rides-kappa.vercel.app,https://fast-travel-1.vercel.app,http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors((req, cb) => {
  const origin = req.headers.origin;
  let sameOrigin = false;
  try { sameOrigin = !!origin && new URL(origin).host === req.headers.host; } catch {}
  cb(null, { origin: !origin || sameOrigin || ALLOWED_ORIGINS.includes(origin) });
}));
app.use(express.json());

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
const bookingsStore = []; // NOTE: in-memory; resets whenever the server restarts. Move to a DB for production.
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

// PUBLIC: called by the website booking form
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
      type: clean(b.type, 40),
      fare: Math.max(0, Number(b.fare) || 0),
      driver: '',
      reason: '',
    };

    const missing = ['pickup', 'dropoff', 'date', 'time', 'name', 'email', 'phone', 'nationality']
      .filter(k => !booking[k]);
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Missing fields: ${missing.join(', ')}` });
    }
    if (!/^\S+@\S+\.\S+$/.test(booking.email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address.' });
    }

    bookingsStore.unshift(booking);
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
  const { status, driver, vehicle, reason } = req.body || {};
  if (status !== undefined) {
    if (!['New', 'Accepted', 'Rejected', 'Completed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    b.status = status;
  }
  if (driver !== undefined) b.driver = clean(driver, 60);
  if (vehicle !== undefined) b.vehicle = clean(vehicle, 60);
  if (reason !== undefined) b.reason = clean(reason, 200);

  // Email the customer when a request is accepted or declined
  if (['Accepted', 'Rejected'].includes(status) && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter.sendMail({
      from: `"Lanka Rides" <${process.env.EMAIL_USER}>`,
      to: b.email,
      subject: `Your booking ${b.id} was ${status.toLowerCase()}`,
      text: status === 'Accepted'
        ? `Hi ${b.name}, your trip ${b.pickup} to ${b.dropoff} on ${b.date} ${b.time} is confirmed.`
        : `Hi ${b.name}, sorry, we could not accept booking ${b.id}. Reason: ${b.reason || 'not specified'}.`,
    }).catch(e => console.error('Customer email failed:', e.message));
  }
  res.status(200).json({ success: true, booking: b });
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
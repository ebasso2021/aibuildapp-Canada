/*
 * Aibuildapp — appointment booking endpoint (Vercel serverless function).
 *
 * POST /api/book  (JSON, called from the contact form on aibuildapp.net)
 * 1. Re-checks the slot against the same rules as the calendar on the site.
 * 2. Reserves the slot in the bookings database (Vercel Blob, see lib/db.js),
 *    so the same time can't be booked twice.
 * 3. Builds an .ics calendar invite (iCalendar, RFC 5545).
 * 4. Emails the invite through Resend to the visitor AND to the team.
 *
 * Environment variables (set in the Vercel project, never in this file):
 *   RESEND_API_KEY   API key from resend.com                      (required)
 *   OWNER_EMAIL      inbox that receives new bookings             (required)
 *   FROM_EMAIL       verified sender, e.g. "Aibuildapp <info@aibuildapp.net>" (required)
 *   ALLOWED_ORIGINS  comma list; default https://aibuildapp.net,https://www.aibuildapp.net
 *   BLOB_READ_WRITE_TOKEN  added automatically when the Blob store is connected
 */
const cors = require('../lib/cors');
const db = require('../lib/db');

const TZ = 'America/Edmonton';
const RULES = { days: [1, 2, 3, 4, 5], start: 9, end: 17, step: 30, leadMins: 60, maxDays: 60, duration: 30 };

const T = {
  en: {
    locale: 'en-US', at: ' at ', tzLabel: 'Edmonton time',
    summary: 'Aibuildapp appointment',
    location: 'Online — we will send you the meeting details',
    subject: 'Your Aibuildapp appointment',
    hello: (n) => `Hi ${n},`,
    body: 'Thanks for booking with Aibuildapp. Your appointment is set for:',
    attach: 'The calendar invite is attached (invite.ics) — open it to add the appointment to Outlook, Google Calendar or Apple Calendar.',
    change: 'Need to change or cancel? Just reply to this email, text us at 780-782-3341 or write to info@aibuildapp.net.',
    sign: 'The Aibuildapp team',
    topic: 'Topic',
  },
  es: {
    locale: 'es-ES', at: ' a las ', tzLabel: 'hora de Edmonton',
    summary: 'Cita con Aibuildapp',
    location: 'En línea — te enviaremos los detalles de la reunión',
    subject: 'Tu cita con Aibuildapp',
    hello: (n) => `Hola ${n}:`,
    body: 'Gracias por reservar con Aibuildapp. Tu cita quedó para:',
    attach: 'Adjuntamos la invitación de calendario (invite.ics): ábrela para agregar la cita a Outlook, Google Calendar o Apple Calendar.',
    change: '¿Necesitas cambiarla o cancelarla? Responde a este correo, escríbenos por SMS al 780-782-3341 o a info@aibuildapp.net.',
    sign: 'El equipo de Aibuildapp',
    topic: 'Tema',
  },
};

/* ---------- time-zone helpers (no external libraries) ---------- */
function partsIn(tz, ms) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).forEach((x) => { if (x.type !== 'literal') p[x.type] = parseInt(x.value, 10); });
  return p;
}
function offsetMs(tz, ms) {
  const p = partsIn(tz, ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
/* local wall time in tz -> UTC milliseconds */
function zonedToUtc(tz, y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo, d, h, mi);
  let utc = guess - offsetMs(tz, guess);
  utc = guess - offsetMs(tz, utc); // second pass handles DST edges
  return utc;
}

/* ---------- validation ---------- */
function checkSlot(start) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(start || ''));
  if (!m) return { error: 'bad_start' };
  const y = +m[1], mo = +m[2] - 1, d = +m[3], h = +m[4], mi = +m[5];
  const local = new Date(Date.UTC(y, mo, d));
  if (local.getUTCMonth() !== mo || local.getUTCDate() !== d) return { error: 'bad_start' };
  const mins = h * 60 + mi;
  if (RULES.days.indexOf(local.getUTCDay()) < 0) return { error: 'closed_day' };
  if (mins < RULES.start * 60 || mins + RULES.step > RULES.end * 60 || (mins - RULES.start * 60) % RULES.step) return { error: 'closed_time' };
  const startUtc = zonedToUtc(TZ, y, mo, d, h, mi);
  const now = Date.now();
  if (startUtc < now + RULES.leadMins * 60000) return { error: 'too_soon' };
  if (startUtc > now + (RULES.maxDays + 1) * 86400000) return { error: 'too_far' };
  return { startUtc, endUtc: startUtc + RULES.duration * 60000, y, mo, d, h, mi };
}
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- iCalendar ---------- */
function icsDate(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function icsText(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function fold(line) {
  // RFC 5545: lines max 75 octets, continuation lines start with a space
  const out = []; let cur = ''; let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
function buildIcs({ uid, startUtc, endUtc, summary, description, location, organizer, attendee }) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aibuildapp//Booking//EN', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'UID:' + uid,
    'DTSTAMP:' + icsDate(Date.now()),
    'DTSTART:' + icsDate(startUtc),
    'DTEND:' + icsDate(endUtc),
    'SUMMARY:' + icsText(summary),
    'DESCRIPTION:' + icsText(description),
    'LOCATION:' + icsText(location),
    'ORGANIZER;CN=Aibuildapp:mailto:' + organizer,
    'ATTENDEE;CN="' + String(attendee.name).replace(/["\r\n]/g, ' ') + '";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:' + attendee.email,
    'STATUS:CONFIRMED', 'SEQUENCE:0', 'TRANSP:OPAQUE',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(summary), 'TRIGGER:-PT1H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/* ---------- email ---------- */
async function sendEmail(payload) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('resend ' + res.status + ': ' + (await res.text()).slice(0, 300));
  return res.json();
}

function emailAddr(from) { const m = /<([^>]+)>/.exec(from); return (m ? m[1] : from).trim(); }

/* ---------- handler ---------- */
module.exports = async function handler(req, res) {
  const c = cors(req, res, 'POST');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
  if (c.origin && !c.ok) return res.status(403).json({ ok: false, error: 'origin' });
  if (!process.env.RESEND_API_KEY || !process.env.OWNER_EMAIL || !process.env.FROM_EMAIL) return res.status(500).json({ ok: false, error: 'not_configured' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== 'object') return res.status(400).json({ ok: false, error: 'bad_json' });
  if (b._honey) return res.status(200).json({ ok: true }); // bot trap: pretend success

  const lang = b.lang === 'es' ? 'es' : 'en';
  const L = T[lang];
  const name = clean(b.fullName, 120);
  const email = clean(b.email, 200);
  const company = clean(b.company, 160);
  const need = clean(b.need, 120);
  const details = clean(b.details, 4000);
  const laptop = clean(b.laptopModel, 200);
  if (!name || !EMAIL_RE.test(email) || !details) return res.status(400).json({ ok: false, error: 'missing_fields' });
  const slot = checkSlot(b.start);
  if (slot.error) return res.status(400).json({ ok: false, error: slot.error });

  const when = new Date(Date.UTC(slot.y, slot.mo, slot.d, 12)).toLocaleDateString(L.locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    + L.at + new Date(Date.UTC(2000, 0, 1, slot.h, slot.mi)).toLocaleTimeString(L.locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
    + ' (' + L.tzLabel + ')';
  const fromAddr = emailAddr(process.env.FROM_EMAIL);
  const id = slot.startUtc.toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const uid = id + '@aibuildapp.net';

  // Reserve the slot first. If the database is down we still take the booking
  // (better than losing a customer) and warn the team in the email.
  let saved = false;
  try {
    await db.reserve({ id, start: b.start, startUtc: slot.startUtc, status: 'booked', name, email, company, need, laptop, details, lang, createdAt: new Date().toISOString() });
    saved = true;
  } catch (e) {
    if (e instanceof db.SlotTakenError) return res.status(409).json({ ok: false, error: 'slot_taken' });
    console.error('db reserve failed', e.message);
  }
  const descr = [need && (L.topic + ': ' + need), laptop && ('Laptop: ' + laptop), details].filter(Boolean).join('\n');
  const ics = buildIcs({
    uid, startUtc: slot.startUtc, endUtc: slot.endUtc,
    summary: L.summary + ' — ' + name, description: descr, location: L.location,
    organizer: fromAddr, attendee: { name, email },
  });
  const attachment = { filename: 'invite.ics', content: Buffer.from(ics, 'utf8').toString('base64') };

  const visitorHtml =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#2B2140">`
    + `<p>${esc(L.hello(name))}</p><p>${esc(L.body)}</p>`
    + `<p style="font-size:17px;font-weight:bold;color:#1F8A70">${esc(when)}</p>`
    + (need ? `<p>${esc(L.topic)}: ${esc(need)}</p>` : '')
    + `<p>${esc(L.attach)}</p><p>${esc(L.change)}</p><p>${esc(L.sign)}<br>aibuildapp.net</p></div>`;
  const rows = [['Name', name], ['Email', email], ['Company', company], ['Need', need], ['Laptop', laptop], ['Appointment', when], ['Language', lang], ['Details', details], ['Booking ID', id], ['Saved in database', saved ? 'yes' : 'NO — database unavailable, check for double bookings']]
    .filter((r) => r[1]).map((r) => `<tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold">${r[0]}</td><td style="padding:6px 10px;border:1px solid #ddd;white-space:pre-wrap">${esc(r[1])}</td></tr>`).join('');
  const ownerHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px"><p>New appointment booked on aibuildapp.net:</p><table style="border-collapse:collapse">${rows}</table><p>The calendar invite is attached (invite.ics).</p></div>`;

  try {
    // Team first, so a booking is never lost even if the visitor's address bounces.
    await sendEmail({ from: process.env.FROM_EMAIL, to: [process.env.OWNER_EMAIL], reply_to: email, subject: 'New appointment — ' + name + ' — ' + when, html: ownerHtml, attachments: [attachment] });
  } catch (e) {
    console.error('owner email failed', e.message);
    if (saved) { try { await db.release(id); } catch (e2) { console.error('db release failed', e2.message); } }
    return res.status(502).json({ ok: false, error: 'email_failed' });
  }
  let visitorSent = true;
  try {
    await sendEmail({ from: process.env.FROM_EMAIL, to: [email], reply_to: process.env.OWNER_EMAIL, subject: L.subject + ' — ' + when, html: visitorHtml, attachments: [attachment] });
  } catch (e) {
    visitorSent = false;
    console.error('visitor email failed', e.message);
  }
  return res.status(200).json({ ok: true, visitorSent, saved, when });
};

module.exports._test = { checkSlot, buildIcs, zonedToUtc };

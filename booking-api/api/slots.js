/*
 * GET /api/slots -> { taken: ["2026-11-02T10:30", ...] }
 * Times already booked (Edmonton local time), so the calendar on the site can grey them out.
 * Cached for 30 s at Vercel's CDN to keep Blob usage low.
 */
const cors = require('../lib/cors');
const db = require('../lib/db');

module.exports = async function handler(req, res) {
  const c = cors(req, res, 'GET');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method' });
  if (c.origin && !c.ok) return res.status(403).json({ ok: false, error: 'origin' });
  try {
    const taken = await db.takenStarts();
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({ ok: true, taken });
  } catch (e) {
    console.error('slots failed', e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: false, taken: [] });
  }
};

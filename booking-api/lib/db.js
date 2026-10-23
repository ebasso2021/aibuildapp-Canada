/*
 * Bookings "database": one private JSON file in a Vercel Blob store.
 *
 *   bookings/bookings.json  ->  { "bookings": [ { id, start, name, email, ... } ] }
 *
 * Every change re-reads the file and writes it back with the ETag it read
 * (ifMatch). If someone else changed it in between, Blob rejects the write and
 * we retry, so two people can never take the same time slot.
 */
const { put, get, BlobPreconditionFailedError } = require('@vercel/blob');

const PATH = 'bookings/bookings.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function read(fresh) {
  const r = await get(PATH, { access: 'private', useCache: !fresh });
  if (!r || r.statusCode !== 200 || !r.stream) return { data: { bookings: [] }, etag: null };
  const text = await new Response(r.stream).text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('bookings.json is not valid JSON'); }
  if (!data || !Array.isArray(data.bookings)) data = { bookings: [] };
  return { data, etag: r.blob.etag };
}

async function write(data, etag) {
  const opts = { access: 'private', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60 };
  if (etag) { opts.allowOverwrite = true; opts.ifMatch = etag; } // only if nobody changed it since we read it
  // with no etag the file must not exist yet: allowOverwrite stays false, so a parallel first write fails and retries
  await put(PATH, JSON.stringify(data, null, 1), opts);
}

function isConflict(e, hadEtag) {
  if (e instanceof BlobPreconditionFailedError) return true;
  return !hadEtag && /exist/i.test(String(e && e.message));
}

/* Apply fn(data) and save; retries on concurrent changes. fn may throw to abort. */
async function mutate(fn) {
  for (let i = 0; i < 8; i++) {
    const { data, etag } = await read(true);
    const result = fn(data);
    try {
      await write(data, etag);
      return result;
    } catch (e) {
      if (!isConflict(e, !!etag)) throw e;
      await sleep(40 + Math.random() * 160 * (i + 1));
    }
  }
  throw new Error('db_busy');
}

class SlotTakenError extends Error {}

async function reserve(rec) {
  return mutate((data) => {
    if (data.bookings.some((b) => b.start === rec.start && b.status !== 'cancelled')) throw new SlotTakenError('slot_taken');
    data.bookings.push(rec);
    return rec;
  });
}

async function release(id) {
  return mutate((data) => { data.bookings = data.bookings.filter((b) => b.id !== id); return true; });
}

/* Future, active start times ("YYYY-MM-DDTHH:MM", Edmonton local) — no personal data. */
async function takenStarts() {
  const { data } = await read(false);
  const now = Date.now();
  return data.bookings.filter((b) => b.status !== 'cancelled' && b.startUtc > now).map((b) => b.start);
}

module.exports = { reserve, release, takenStarts, SlotTakenError, _read: read };

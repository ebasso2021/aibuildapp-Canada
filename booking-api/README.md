# aibuildapp-booking

Small server functions for appointment bookings on aibuildapp.net.
When a visitor books a date and time, it saves the booking in a database (so the
same time can't be booked twice), builds an `.ics` calendar invite and emails it,
through [Resend](https://resend.com), to the visitor and to the team.

- `api/book.js` (POST): validate → reserve slot → email invite.
- `api/slots.js` (GET): list of booked times, so the calendar greys them out.
- `lib/db.js`: the bookings database (see below).

- Live on Vercel (team "aibuildapp", project `aibuildapp-booking`):
  `https://aibuildapp-booking.vercel.app/api/book`
- The site calls it from `assets/js/site.js` (setting `api` in `window.SITE_APPT`
  in `index.html` and `es/index.html`).
- If the function is not configured or fails, the form falls back to FormSubmit,
  so the request still reaches the team (but without the calendar email).

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | Value |
|---|---|
| `RESEND_API_KEY` | API key from resend.com (mark it **Sensitive**) |
| `OWNER_EMAIL` | the inbox that should receive new bookings |
| `FROM_EMAIL` | `Aibuildapp <info@aibuildapp.net>` (already set; the domain must be verified in Resend) |
| `ALLOWED_ORIGINS` | `https://aibuildapp.net,https://www.aibuildapp.net` (already set) |

After you change environment variables, **redeploy** the project so they take effect.

## Bookings database

Vercel Blob store **`aibuildapp-bookings`** (private, region iad1), connected to the
project (env var `BLOB_READ_WRITE_TOKEN`, added automatically). All bookings are in
one file, `bookings/bookings.json`:

```json
{ "bookings": [ { "id": "...", "start": "2026-11-02T10:30", "startUtc": 1793640600000,
  "status": "booked", "name": "...", "email": "...", "company": "", "need": "...",
  "laptop": "", "details": "...", "lang": "en", "createdAt": "..." } ] }
```

Writes use the file's ETag (`ifMatch`), so two simultaneous bookings for the same
time can't both succeed: the second gets "That time is no longer available".

**To cancel a booking and free the time:** Vercel → Storage → `aibuildapp-bookings`
→ open `bookings/bookings.json`, download it, change that booking's `"status"` to
`"cancelled"` (or delete it), and upload it back with the same name.

Free-plan limits (Hobby): 1 GB storage, 10,000 simple + 2,000 advanced operations
a month. Each booking uses about 1 advanced operation; the calendar's list of booked
times is cached for 30 s.

## Booking rules

Monday–Friday, 9:00–17:00 Edmonton time, 30-minute slots, at least 1 hour ahead,
up to 60 days ahead. These rules are in `api/book.js` (`RULES`) and in
`window.SITE_APPT` in the two HTML files; keep them in sync.

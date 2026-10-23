# aibuildapp-booking

Small server function for appointment bookings on aibuildapp.net.
When a visitor books a date and time, it builds an `.ics` calendar invite and
emails it, through [Resend](https://resend.com), to the visitor and to the team.

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

## Booking rules

Monday–Friday, 9:00–17:00 Edmonton time, 30-minute slots, at least 1 hour ahead,
up to 60 days ahead. These rules are in `api/book.js` (`RULES`) and in
`window.SITE_APPT` in the two HTML files; keep them in sync.

/* CORS: only the Aibuildapp site may call these functions from a browser. */
module.exports = function cors(req, res, methods) {
  const allowed = (process.env.ALLOWED_ORIGINS || 'https://aibuildapp.net,https://www.aibuildapp.net').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin || '';
  const ok = allowed.indexOf(origin) >= 0;
  res.setHeader('Vary', 'Origin');
  if (ok) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', methods + ', OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  return { origin, ok };
};

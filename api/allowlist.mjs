// Vercel serverless function — manage the email allowlist stored in the public
// Storage object config/allowlist.json. Writes use SUPABASE_SERVICE_KEY (held ONLY
// in this server env, never shipped to the browser). Callers must present a valid
// Supabase access token whose email is already on the allowlist (insiders manage).
//
// GET  /api/allowlist            -> { emails: [...] }
// POST /api/allowlist { emails } -> writes the roster (auth required)
//
// If SUPABASE_SERVICE_KEY is not set in the Vercel project, POST returns 501 and the
// app falls back to the owner's manage_allowlist.py channel.

const SB = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const OBJECT = 'config/allowlist.json';
const norm = (e) => String(e).trim().toLowerCase();

async function readRoster() {
  const r = await fetch(`${SB}/storage/v1/object/public/${OBJECT}`, { cache: 'no-store' });
  if (!r.ok) return [];
  const d = await r.json();
  return (Array.isArray(d) ? d : d.emails ?? []).map(norm);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ emails: await readRoster() });
  }
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  if (!SERVICE) return res.status(501).json({ message: 'Allowlist writes not configured (SUPABASE_SERVICE_KEY unset). Use manage_allowlist.py.' });

  // Verify the caller's Supabase session and that they are already allowlisted.
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Missing token' });
  const who = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
  if (!who.ok) return res.status(401).json({ message: 'Invalid session' });
  const email = norm((await who.json()).email || '');
  const roster = await readRoster();
  const owners = ['aimlda.ak@gmail.com', '19.aimlda@gmail.com'];
  if (!roster.includes(email) && !owners.includes(email)) return res.status(403).json({ message: 'Not authorized to manage the allowlist' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const emails = Array.isArray(body.emails) ? [...new Set(body.emails.map(norm).filter(Boolean))] : null;
  if (!emails) return res.status(400).json({ message: 'emails[] required' });

  const put = await fetch(`${SB}/storage/v1/object/${OBJECT}`, {
    method: 'PUT',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body: JSON.stringify({ emails }),
  });
  if (!put.ok) return res.status(502).json({ message: 'Storage write failed: ' + (await put.text()).slice(0, 200) });
  return res.status(200).json({ emails });
}

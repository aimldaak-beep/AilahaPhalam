/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Email allowlist gate. The roster lives in a PUBLIC Supabase Storage object
 * (config/allowlist.json) so any signed-in Google account can read it and the app
 * can decide access client-side. Writes need the service key (server-side only),
 * so management goes through /api/allowlist (Vercel function) or the owner's
 * manage_allowlist.py — never the browser.
 *
 * BOOTSTRAP owners are baked in and always allowed, so a Storage hiccup can never
 * lock the owner out of their own ledger.
 */
const SB = import.meta.env.VITE_SUPABASE_URL as string;
export const ALLOWLIST_URL = `${SB}/storage/v1/object/public/config/allowlist.json`;

// Always-allowed owner accounts (lockout safety net). Union'd with the live roster.
export const BOOTSTRAP_OWNERS = ['aimlda.ak@gmail.com', '19.aimlda@gmail.com'];

const norm = (e: string) => e.trim().toLowerCase();

/** Fetch the live roster (lowercased). Returns [] on any error — the caller unions
 *  it with BOOTSTRAP_OWNERS, so a fetch failure degrades to owner-only, never lockout. */
export async function fetchAllowlist(): Promise<string[]> {
  try {
    const res = await fetch(ALLOWLIST_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    const list: string[] = Array.isArray(data) ? data : (data.emails ?? []);
    return list.map(norm);
  } catch {
    return [];
  }
}

export function isAllowed(email: string | undefined, roster: string[]): boolean {
  if (!email) return false;
  const e = norm(email);
  return BOOTSTRAP_OWNERS.map(norm).includes(e) || roster.includes(e);
}

/** Persist a new roster via the server function (service key held server-side).
 *  Returns {ok, status}. status 501 => the function isn't configured with a key. */
export async function saveAllowlist(emails: string[], accessToken: string): Promise<{ ok: boolean; status: number; message?: string }> {
  try {
    const res = await fetch('/api/allowlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ emails: emails.map(norm) }),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, message: body?.message };
  } catch (e: any) {
    return { ok: false, status: 0, message: String(e?.message ?? e) };
  }
}

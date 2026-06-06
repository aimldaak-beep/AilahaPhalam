/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PIN gate for destructive actions (reset-all, delete-a-trade).
 *
 * This is a deliberate-action / casual-access gate, NOT real cryptographic security:
 * a 4-digit PIN is trivially brute-forceable. We still never store the raw PIN — only
 * a SHA-256 hash (salted with the user id) in the user_settings table, scoped by RLS.
 *
 * Separate storage path; nothing here touches trades, offsets, or syncTradesToSupabase.
 */

import { supabase } from './supabase';

/** SHA-256(userId:pin) as lowercase hex. Salting with the user id ties the hash to the
 *  account and avoids identical hashes across users / trivial rainbow tables. */
export async function hashPin(userId: string, pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${userId}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** The current user's stored PIN hash, or null if they haven't set one yet. */
export async function fetchPinHash(): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('pin_hash')
    .maybeSingle();
  if (error) {
    console.error('Failed to load PIN from Supabase:', error.message);
    return null;
  }
  return data?.pin_hash ?? null;
}

/** Upsert the user's PIN hash (one row per user). */
export async function savePinHash(userId: string, pinHash: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_settings')
    .upsert(
      { user_id: userId, pin_hash: pinHash, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) {
    console.error('Failed to save PIN to Supabase:', error.message);
    return false;
  }
  return true;
}

/** True iff the 4-digit PIN matches the stored hash for this user. */
export async function verifyPin(userId: string, pin: string, pinHash: string): Promise<boolean> {
  const candidate = await hashPin(userId, pin);
  return candidate === pinHash;
}

export const isValidPin = (pin: string): boolean => /^\d{4}$/.test(pin);

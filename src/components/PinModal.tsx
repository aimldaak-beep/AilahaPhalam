/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, ShieldCheck, KeyRound, AlertCircle } from 'lucide-react';
import { hashPin, savePinHash, verifyPin, isValidPin } from '../lib/pin';

interface PinModalProps {
  userId: string;
  pinHash: string | null; // null => no PIN set yet
  intent: 'authorize' | 'change'; // authorize a pending destructive action, or change the PIN
  actionLabel?: string; // shown for context when authorizing
  onAuthorized: () => void; // run the gated action (authorize intent only)
  onPinHashChange: (hash: string) => void; // update App state after create/change
  onClose: () => void;
}

type Screen = 'create' | 'enter' | 'change';

const inputClass =
  'w-full rounded-xl px-4 py-3 focus:outline-none font-mono text-lg tracking-[0.5em] text-center';

const inputStyle = {
  background: 'rgba(201,168,76,0.04)',
  border: '1px solid rgba(201,168,76,0.15)',
  borderRadius: 12,
  color: '#F0E6C8',
} as React.CSSProperties;

export default function PinModal({
  userId,
  pinHash,
  intent,
  actionLabel,
  onAuthorized,
  onPinHashChange,
  onClose,
}: PinModalProps) {
  // Which form to show: no PIN yet => always create; otherwise enter (authorize) or change.
  const screen: Screen = pinHash === null ? 'create' : intent === 'change' ? 'change' : 'enter';
  const authorizeAfter = intent === 'authorize';

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onlyDigits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (screen === 'enter') {
      if (!isValidPin(pin)) return setError('Enter your 4-digit PIN.');
      setBusy(true);
      const ok = await verifyPin(userId, pin, pinHash as string);
      setBusy(false);
      if (!ok) {
        setPin('');
        return setError('Incorrect PIN. Action cancelled.');
      }
      onAuthorized();
      onClose();
      return;
    }

    if (screen === 'create') {
      if (!isValidPin(pin)) return setError('PIN must be exactly 4 digits.');
      if (pin !== confirmPin) return setError('The two PINs do not match.');
      setBusy(true);
      const hash = await hashPin(userId, pin);
      const saved = await savePinHash(userId, hash);
      setBusy(false);
      if (!saved) return setError('Could not save PIN. Please try again.');
      onPinHashChange(hash);
      if (authorizeAfter) onAuthorized();
      onClose();
      return;
    }

    // screen === 'change'
    if (!isValidPin(currentPin)) return setError('Enter your current 4-digit PIN.');
    if (!isValidPin(pin)) return setError('New PIN must be exactly 4 digits.');
    if (pin !== confirmPin) return setError('The two new PINs do not match.');
    setBusy(true);
    const ok = await verifyPin(userId, currentPin, pinHash as string);
    if (!ok) {
      setBusy(false);
      setCurrentPin('');
      return setError('Current PIN is incorrect.');
    }
    const hash = await hashPin(userId, pin);
    const saved = await savePinHash(userId, hash);
    setBusy(false);
    if (!saved) return setError('Could not save new PIN. Please try again.');
    onPinHashChange(hash);
    onClose();
  };

  const title =
    screen === 'create' ? 'Set a Security PIN' : screen === 'change' ? 'Change Security PIN' : 'Enter Security PIN';
  const subtitle =
    screen === 'create'
      ? 'Create a 4-digit PIN to protect destructive actions'
      : screen === 'change'
        ? 'Confirm your current PIN, then set a new one'
        : (actionLabel ?? 'Confirm this action');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
    >
      <div
        id="pin-modal"
        className="w-full max-w-sm shadow-2xl overflow-hidden"
        style={{
          background: 'rgba(8,5,2,0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: 24,
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-4.5"
          style={{ borderBottom: '1px solid rgba(201,168,76,0.08)' }}
        >
          <div className="flex items-center gap-3">
            <span
              className="p-2.5 rounded-xl shadow-md"
              style={{
                background: 'rgba(201,168,76,0.10)',
                border: '1px solid rgba(201,168,76,0.20)',
                color: '#C9A84C',
              }}
            >
              {screen === 'enter' ? <KeyRound className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </span>
            <div>
              <h3
                className="font-extrabold text-sm font-sans uppercase tracking-widest"
                style={{ color: '#C9A84C' }}
              >
                {title}
              </h3>
              <p className="text-[9px] font-bold font-mono uppercase tracking-widest" style={{ color: 'rgba(240,230,200,0.55)' }}>
                Protected Action
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="transition p-2 rounded-xl cursor-pointer"
            style={{ color: 'rgba(240,230,200,0.5)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p
            className="text-[11px] font-mono leading-relaxed rounded-xl px-3.5 py-2.5"
            style={{
              color: 'rgba(240,230,200,0.7)',
              background: 'rgba(201,168,76,0.04)',
              border: '1px solid rgba(201,168,76,0.08)',
            }}
          >
            {subtitle}
          </p>

          {screen === 'change' && (
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black uppercase tracking-widest font-mono" style={{ color: 'rgba(240,230,200,0.5)' }}>Current PIN</label>
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                placeholder="••••"
                value={currentPin}
                onChange={(e) => setCurrentPin(onlyDigits(e.target.value))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[9px] font-black uppercase tracking-widest font-mono" style={{ color: 'rgba(240,230,200,0.5)' }}>
              {screen === 'enter' ? 'PIN' : 'New PIN'}
            </label>
            <input
              id="pin-input"
              type="password"
              inputMode="numeric"
              autoFocus={screen !== 'change'}
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(onlyDigits(e.target.value))}
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {screen !== 'enter' && (
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black uppercase tracking-widest font-mono" style={{ color: 'rgba(240,230,200,0.5)' }}>Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                placeholder="••••"
                value={confirmPin}
                onChange={(e) => setConfirmPin(onlyDigits(e.target.value))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          )}

          {error && (
            <div
              className="flex items-center gap-2 text-[11px] rounded-xl px-3.5 py-2.5 font-mono font-bold"
              style={{
                color: '#FF8080',
                background: 'rgba(255,80,80,0.08)',
                border: '1px solid rgba(255,80,80,0.2)',
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2" style={{ borderTop: '1px solid rgba(201,168,76,0.08)' }}>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-black transition cursor-pointer font-mono uppercase tracking-wider"
              style={{
                background: 'rgba(4,2,0,0.95)',
                border: '1px solid rgba(201,168,76,0.15)',
                color: '#F0E6C8',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="disabled:opacity-50 px-6 py-2.5 rounded-xl text-xs transition cursor-pointer font-mono uppercase tracking-wider shadow-lg"
              style={{
                background: '#C9A84C',
                color: '#1A1200',
                fontWeight: 800,
              }}
            >
              {busy ? 'Working…' : screen === 'enter' ? 'Confirm' : screen === 'change' ? 'Update PIN' : 'Set PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  'w-full bg-slate-950 border border-white/10 focus:border-[#7fb3d5] transition rounded-xl px-4 py-3 text-white focus:outline-none font-mono text-lg tracking-[0.5em] text-center';

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
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-[60] animate-fade-in">
      <div id="pin-modal" className="bg-[#161f2e] border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4.5">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-[#7fb3d5]/10 border border-[#7fb3d5]/20 rounded-xl text-[#7fb3d5] shadow-md">
              {screen === 'enter' ? <KeyRound className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </span>
            <div>
              <h3 className="font-extrabold text-sm text-white font-sans uppercase tracking-widest">{title}</h3>
              <p className="text-[9px] text-[#7fb3d5] font-bold font-mono uppercase tracking-widest">Protected Action</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-2 hover:bg-slate-900 rounded-xl cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-[11px] text-slate-300 font-mono leading-relaxed bg-slate-950/40 border border-white/5 rounded-xl px-3.5 py-2.5">
            {subtitle}
          </p>

          {screen === 'change' && (
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Current PIN</label>
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                placeholder="••••"
                value={currentPin}
                onChange={(e) => setCurrentPin(onlyDigits(e.target.value))}
                className={inputClass}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">
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
            />
          </div>

          {screen !== 'enter' && (
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                placeholder="••••"
                value={confirmPin}
                onChange={(e) => setConfirmPin(onlyDigits(e.target.value))}
                className={inputClass}
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-[11px] text-[#e8a04d] bg-[#e8a04d]/10 border border-[#e8a04d]/30 rounded-xl px-3.5 py-2.5 font-mono font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-950 hover:bg-slate-900 border border-white/5 hover:border-white/10 px-5 py-2.5 rounded-xl text-xs font-black text-slate-200 transition cursor-pointer font-mono uppercase tracking-wider"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="bg-[#7fb3d5] hover:bg-[#5f9fc8] disabled:opacity-50 text-[#161f2e] px-6 py-2.5 rounded-xl text-xs font-black transition cursor-pointer font-mono uppercase tracking-wider shadow-lg shadow-[#7fb3d5]/10"
            >
              {busy ? 'Working…' : screen === 'enter' ? 'Confirm' : screen === 'change' ? 'Update PIN' : 'Set PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { getWeekInfo, Instrument, TradeDirection, TradeStatus, Trade } from '../types';
import { Plus, X, Calendar, DollarSign, HelpCircle, AlertOctagon } from 'lucide-react';

interface NewTradeFormProps {
  onAddTrade: (trade: Trade) => void;
  onClose: () => void;
}

export default function NewTradeForm({ onAddTrade, onClose }: NewTradeFormProps) {
  const [dateInitiated, setDateInitiated] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [symbol, setSymbol] = useState('');
  const [instrument, setInstrument] = useState<Instrument>('DOW');
  const [direction, setDirection] = useState<TradeDirection>('Long');
  const [entryPrice, setEntryPrice] = useState<string>('');
  const [lotSize, setLotSize] = useState<string>('5');
  const [numberOfLots, setNumberOfLots] = useState<string>('1');


  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [usdToInrRate, setUsdToInrRate] = useState<string>('83.24');
  const [realizationOption, setRealizationOption] = useState<'Full' | '80/20'>('80/20');

  const validateAndSetDecimal = (val: string, setter: (val: string) => void) => {
    // Strip any characters that are not digits or decimal point
    const sanitized = val.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    if (parts.length > 2) return; // ignore extra dots
    if (parts[1] && parts[1].length > 4) {
      parts[1] = parts[1].slice(0, 4); // restrict to 4 decimal places
    }
    setter(parts.join('.'));
  };

  // Dynamic automatic info display
  const weekInfo = getWeekInfo(dateInitiated);

  // Auto-fill default lot sizes based on standard instruments
  useEffect(() => {
    switch (instrument) {
      case 'Futures':
      case 'NSE Futures':
        setLotSize('250');
        setCurrency('INR');
        setRealizationOption('Full');
        break;
      case 'Option':
      case 'NSE Options':
        setLotSize('50');
        setCurrency('INR');
        setRealizationOption('Full');
        break;
      case 'DOW':
        setLotSize('5');
        setCurrency('USD');
        setRealizationOption('80/20');
        break;
      case 'Nasdaq':
        setLotSize('20');
        setCurrency('USD');
        setRealizationOption('80/20');
        break;
      case 'SnP':
        setLotSize('50');
        setCurrency('USD');
        setRealizationOption('80/20');
        break;
      case 'NG':
        setLotSize('1250');
        setCurrency('USD');
        setRealizationOption('80/20');
        break;
      case 'Nikkei':
        setLotSize('100');
        setCurrency('USD');
        setRealizationOption('80/20');
        break;
      case 'Gift Nifty':
        setLotSize('50');
        setCurrency('INR');
        setRealizationOption('80/20');
        break;
    }
  }, [instrument]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol || !entryPrice) return;

    const parsedEntryPrice = parseFloat(entryPrice);
    if (isNaN(parsedEntryPrice) || parsedEntryPrice <= 0) return;

    const status: TradeStatus = direction === 'Long' ? 'CarryForwardLong' : 'CarryForwardShort';
    const tradeRate = currency === 'USD' ? parseFloat(usdToInrRate) || 83.24 : 1.0;

    const trade: Trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      symbol: symbol.toUpperCase(),
      instrument,
      direction,
      dateInitiated,
      buyPrice: direction === 'Long' ? parsedEntryPrice : null,
      sellPrice: direction === 'Short' ? parsedEntryPrice : null,
      buyDate: direction === 'Long' ? dateInitiated : null,
      sellDate: direction === 'Short' ? dateInitiated : null,
      lotSize: parseFloat(lotSize) || 1,
      numberOfLots: parseFloat(numberOfLots) || 1,
      status,
      currency,
      usdToInrRate: tradeRate,
      fridayUsdToInrRates: {},
      realizationRate: realizationOption === '80/20' ? 0.8 : 1.0,
      fridayClosingPrices: {},
    };

    onAddTrade(trade);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 backdrop-blur-xl overflow-y-auto p-6">
      <div
        id="new-trade-form-card"
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl transition-all duration-200"
        style={{background:'rgba(8,5,2,0.92)',backdropFilter:'blur(24px)',WebkitBackdropFilter:'blur(24px)',border:'1px solid rgba(201,168,76,0.2)',borderRadius:12,marginTop:'5vh',width:'90vw',maxWidth:680}}
      >
        <div className="flex items-center justify-between px-6 py-4.5" style={{borderBottom:'1px solid rgba(201,168,76,0.08)'}}>
          <div className="flex items-center gap-4">
            <span className="p-2.5 rounded-xl shadow-md" style={{background:'rgba(201,168,76,0.1)',border:'1px solid rgba(201,168,76,0.2)',color:'#C9A84C'}}>
              <Plus className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm font-sans uppercase tracking-widest" style={{color:'#F0E6C8'}}>
                Initiate New Contract
              </h3>
              <p className="text-[13px] font-bold font-mono uppercase tracking-widest" style={{color:'#C9A84C'}}>
                Ailaha Phalam Ledger Logistics Engine
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="transition p-2 rounded-xl cursor-pointer"
            style={{color:'rgba(240,230,200,0.5)'}}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          maxWidth: '100%',
        }}>
          {/* Metadata Display */}
          <div className="rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 text-sm" style={{background:'rgba(4,2,0,0.95)',border:'1px solid rgba(201,168,76,0.08)'}}>
            <div className="flex items-center gap-2 font-semibold font-mono text-[12px] uppercase tracking-wider" style={{color:'rgba(240,230,200,0.7)'}}>
              <Calendar className="w-4 h-4" style={{color:'#C9A84C'}} />
              <span>Initiation Date Week:</span>
            </div>
            <div className="flex items-center gap-2 font-black font-mono">
              <span className="px-2.5 py-1 rounded-lg text-[12px] uppercase font-mono tracking-widest shadow-sm" style={{background:'rgba(201,150,12,0.2)',border:'1px solid rgba(201,150,12,0.4)',color:'#C9A84C'}}>
                Week {weekInfo.weekNum}
              </span>
              <span className="font-mono text-sm" style={{color:'rgba(240,230,200,0.7)'}}>
                {weekInfo.weekRange}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Symbol */}
            <div className="space-y-1.5 animate-fade-in">
              <label className="block text-[13px] font-black uppercase tracking-widest font-mono" style={{color:'rgba(240,230,200,0.55)'}}>
                Symbol / Security Identifier
              </label>
              <input
                id="symbol-input"
                type="text"
                required
                placeholder="e.g. NIFTY25S"
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                onFocus={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.15)'}
                className="w-full px-3.5 py-3 text-base focus:outline-none font-bold font-mono tracking-wide transition rounded-xl"
                style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:12,color:'#F0E6C8'}}
              />
            </div>

            {/* Instrument dropdown */}
            <div className="space-y-1.5 animate-fade-in">
              <label className="block text-[13px] font-black uppercase tracking-widest font-mono" style={{color:'rgba(240,230,200,0.55)'}}>
                Instrument Type
              </label>
              <select
                id="instrument-select"
                value={instrument}
                onChange={e => setInstrument(e.target.value as Instrument)}
                onFocus={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.15)'}
                className="w-full px-3 py-3 text-base focus:outline-none font-bold cursor-pointer font-mono transition rounded-xl"
                style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:12,color:'#F0E6C8'}}
              >
                <option value="NSE Futures" style={{background:'#0A0804',color:'#F0E6C8'}}>NSE Futures</option>
                <option value="NSE Options" style={{background:'#0A0804',color:'#F0E6C8'}}>NSE Options</option>
                <option value="DOW" style={{background:'#0A0804',color:'#F0E6C8'}}>DOW</option>
                <option value="Nikkei" style={{background:'#0A0804',color:'#F0E6C8'}}>Nikkei</option>
                <option value="Nasdaq" style={{background:'#0A0804',color:'#F0E6C8'}}>Nasdaq</option>
                <option value="NG" style={{background:'#0A0804',color:'#F0E6C8'}}>NG (Natural Gas)</option>
                <option value="SnP" style={{background:'#0A0804',color:'#F0E6C8'}}>S&P 500</option>
                <option value="Gift Nifty" style={{background:'#0A0804',color:'#F0E6C8'}}>Gift Nifty</option>
              </select>
            </div>
          </div>

          {/* Direction toggle */}
          <div className="space-y-2">
            <label className="block text-[13px] font-black uppercase tracking-widest font-mono" style={{color:'rgba(240,230,200,0.55)'}}>
              Trade Direction
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                id="dir-long-btn"
                onClick={() => setDirection('Long')}
                className="py-3 px-4 rounded-xl text-sm font-black transition text-center flex items-center justify-center gap-1.5 cursor-pointer font-mono tracking-widest"
                style={
                  direction === 'Long'
                    ? {background:'rgba(103,122,103,0.2)',border:'1px solid #677A67',color:'#677A67'}
                    : {background:'rgba(4,2,0,0.95)',border:'1px solid rgba(201,168,76,0.08)',color:'rgba(240,230,200,0.5)'}
                }
              >
                <span className="w-1.5 h-1.5 rounded-full inline-block animate-ping" style={{background:'#677A67'}} />
                LONG / BUY FIRST
              </button>
              <button
                type="button"
                id="dir-short-btn"
                onClick={() => setDirection('Short')}
                className="py-3 px-4 rounded-xl text-sm font-black transition text-center flex items-center justify-center gap-1.5 cursor-pointer font-mono tracking-widest"
                style={
                  direction === 'Short'
                    ? {background:'rgba(201,150,12,0.15)',border:'1px solid #C9960C',color:'#C9960C'}
                    : {background:'rgba(4,2,0,0.95)',border:'1px solid rgba(201,168,76,0.08)',color:'rgba(240,230,200,0.5)'}
                }
              >
                <span className="w-1.5 h-1.5 rounded-full inline-block animate-ping" style={{background:'#C9960C'}} />
                SHORT / SELL FIRST
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Entry Price */}
            <div className="space-y-1.5">
              <label className="block text-[13px] font-black uppercase tracking-widest font-mono" style={{color:'rgba(240,230,200,0.55)'}}>
                {direction === 'Long' ? 'Buy Price' : 'Sell Price'}
              </label>
              <input
                id="entry-price-input"
                type="text"
                inputMode="decimal"
                required
                placeholder="0.00"
                value={entryPrice}
                onChange={e => validateAndSetDecimal(e.target.value, setEntryPrice)}
                onFocus={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.15)'}
                className="w-full px-3.5 py-3 text-base focus:outline-none font-bold font-mono transition rounded-xl"
                style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:12,color:'#F0E6C8'}}
              />
            </div>

            {/* Lot Size */}
            <div className="space-y-1.5">
              <label className="block text-[13px] font-black uppercase tracking-widest font-mono" style={{color:'rgba(240,230,200,0.55)'}}>
                Multiplier Size
              </label>
              <input
                id="lot-size-input"
                type="text"
                inputMode="decimal"
                required
                value={lotSize}
                onChange={e => validateAndSetDecimal(e.target.value, setLotSize)}
                onFocus={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.15)'}
                className="w-full px-4 py-3 text-base focus:outline-none font-bold font-mono transition rounded-xl"
                style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:12,color:'#F0E6C8'}}
              />
            </div>

            {/* Lots count */}
            <div className="space-y-1.5">
              <label className="block text-[13px] font-black uppercase tracking-widest font-mono" style={{color:'rgba(240,230,200,0.55)'}}>
                No. of Lots
              </label>
              <input
                id="lots-input"
                type="text"
                inputMode="decimal"
                required
                value={numberOfLots}
                onChange={e => validateAndSetDecimal(e.target.value, setNumberOfLots)}
                onFocus={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.15)'}
                className="w-full px-4 py-3 text-base focus:outline-none font-bold font-mono transition rounded-xl"
                style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:12,color:'#F0E6C8'}}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Initiation date */}
            <div className="space-y-1.5">
              <label className="block text-[13px] font-black uppercase tracking-widest font-mono" style={{color:'rgba(240,230,200,0.55)'}}>
                Initiation Date Form
              </label>
              <input
                id="date-initiated-input"
                type="date"
                required
                value={dateInitiated}
                onChange={e => setDateInitiated(e.target.value)}
                onFocus={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.15)'}
                className="w-full px-3.5 py-3 text-base focus:outline-none font-bold font-mono transition rounded-xl"
                style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:12,color:'#F0E6C8'}}
              />
            </div>
          </div>

          {/* Currency and Realization Configuration Panel */}
          <div className="pt-4 mt-2 space-y-3" style={{borderTop:'1px solid rgba(201,168,76,0.08)'}}>
            <span className="text-[13px] font-black uppercase tracking-widest block font-mono" style={{color:'#C9A84C'}}>
              Accounting & Currency Parameters
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg" style={{background:'rgba(4,2,0,0.95)',border:'1px solid rgba(201,168,76,0.08)'}}>
              {/* Currency Select */}
              <div className="space-y-1.5">
                <label className="block text-[13px] font-black uppercase tracking-widest font-mono" style={{color:'rgba(240,230,200,0.5)'}}>
                  Accounting Currency
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl" style={{background:'rgba(8,5,2,0.9)',border:'1px solid rgba(201,168,76,0.08)'}}>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrency('INR');
                      if (realizationOption === '80/20' && instrument !== 'Gift Nifty') {
                        setRealizationOption('Full');
                      }
                    }}
                    className="px-3 py-1.5 text-sm rounded-lg transition flex items-center justify-center gap-1 font-black font-mono cursor-pointer"
                    style={
                      currency === 'INR'
                        ? {background:'rgba(103,122,103,0.15)',color:'#677A67',border:'1px solid rgba(103,122,103,0.3)'}
                        : {color:'rgba(240,230,200,0.5)'}
                    }
                  >
                    ₹ INR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrency('USD');
                      setRealizationOption('80/20');
                    }}
                    className="px-3 py-1.5 text-sm rounded-lg transition flex items-center justify-center gap-1 font-black font-mono cursor-pointer"
                    style={
                      currency === 'USD'
                        ? {background:'rgba(201,150,12,0.2)',color:'#C9960C',border:'1px solid rgba(201,150,12,0.3)'}
                        : {color:'rgba(240,230,200,0.5)'}
                    }
                  >
                    $ USD
                  </button>
                </div>
              </div>

              {/* Realization Rate selection */}
              <div className="space-y-1.5">
                <label className="block text-[13px] font-black uppercase tracking-widest font-mono" title="USD and Gift Nifty default to 80/20 book profits" style={{color:'rgba(240,230,200,0.5)'}}>
                  Realization Rate Multiplier
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl" style={{background:'rgba(8,5,2,0.9)',border:'1px solid rgba(201,168,76,0.08)'}}>
                  <button
                    type="button"
                    onClick={() => setRealizationOption('Full')}
                    className="px-3 py-1.5 text-sm rounded-lg transition font-black font-mono cursor-pointer"
                    style={
                      realizationOption === 'Full'
                        ? {background:'rgba(103,122,103,0.15)',color:'#677A67',border:'1px solid rgba(103,122,103,0.3)'}
                        : {color:'rgba(240,230,200,0.5)'}
                    }
                  >
                    FULL (1.0)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRealizationOption('80/20')}
                    className="px-3 py-1.5 text-sm rounded-lg transition font-black font-mono cursor-pointer"
                    style={
                      realizationOption === '80/20'
                        ? {background:'rgba(201,150,12,0.2)',color:'#C9960C',border:'1px solid rgba(201,150,12,0.3)'}
                        : {color:'rgba(240,230,200,0.5)'}
                    }
                  >
                    80% (0.8)
                  </button>
                </div>
              </div>

              {/* Conditionally ask for USD to INR exchange rate */}
              {currency === 'USD' && (
                <div className="col-span-1 sm:col-span-2 pt-3 animate-in fade-in space-y-1.5" style={{borderTop:'1px solid rgba(201,168,76,0.08)'}}>
                  <label className="block text-[13px] font-black uppercase tracking-widest flex items-center gap-1.5 font-mono" style={{color:'#C9960C'}}>
                    <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{background:'#C9960C'}}></span>
                    USD to INR Conversion Rate
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="e.g. 83.24"
                    value={usdToInrRate}
                    onChange={e => validateAndSetDecimal(e.target.value, setUsdToInrRate)}
                    onFocus={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.5)'}
                    onBlur={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.15)'}
                    className="w-full px-4 py-3 text-base font-mono focus:outline-none transition rounded-xl"
                    style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:12,color:'#F0E6C8'}}
                  />
                  <span className="text-[12px] mt-1 block leading-normal font-bold" style={{color:'rgba(240,230,200,0.5)'}}>
                    * USD base values will translate to INR ledger automatically using this rate.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Info Banner on Rollover */}
          <div className="pt-4 mt-2" style={{borderTop:'1px solid rgba(201,168,76,0.08)'}}>
            <div className="p-4 rounded-lg flex gap-4 text-[13px] leading-relaxed font-bold" style={{background:'rgba(103,122,103,0.06)',border:'1px solid rgba(103,122,103,0.2)',color:'#677A67'}}>
              <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5 animate-pulse" style={{color:'#677A67'}} />
              <div>
                <span className="font-black block mb-1 text-[12px] uppercase tracking-widest font-mono" style={{color:'#677A67'}}>
                  Active Trade Initiation Modality
                </span>
                This contract will initiate as open-trading in the active positions roster. You can close, check current PnL, or carry it forward at any time from the Weekly Reporting view.
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-4 justify-end pt-4" style={{borderTop:'1px solid rgba(201,168,76,0.08)'}}>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-xl text-sm font-black transition cursor-pointer font-mono uppercase tracking-wider"
              style={{background:'rgba(201,168,76,0.08)',border:'1px solid rgba(201,168,76,0.2)',color:'#C9A84C'}}
            >
              Cancel
            </button>
            <button
              type="submit"
              id="confirm-btn"
              className="px-6 py-3 rounded-xl text-sm transition cursor-pointer font-mono uppercase tracking-wider shadow-lg"
              style={{background:'#C9A84C',color:'#1A1200',fontWeight:800}}
            >
              Confirm & Deploy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

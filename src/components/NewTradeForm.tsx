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

  /* ─── shared style tokens ─────────────────────────────────────────── */
  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '2.5px',
    textTransform: 'uppercase',
    color: 'rgba(240,230,200,0.55)',
    display: 'block',
    marginBottom: 6,
  };

  const inputStyle: React.CSSProperties = {
    background: 'rgba(201,168,76,0.04)',
    border: '1px solid rgba(201,168,76,0.15)',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#F0E6C8',
    fontSize: 13,
    fontWeight: 500,
    outline: 'none',
    width: '100%',
    fontFamily: "'DM Sans', sans-serif",
    boxSizing: 'border-box' as const,
  };

  const inputMonoStyle: React.CSSProperties = {
    ...inputStyle,
    fontFamily: "'DM Mono', 'Courier New', monospace",
  };

  const inactiveBtnStyle: React.CSSProperties = {
    background: 'rgba(4,2,0,0.95)',
    border: '1px solid rgba(201,168,76,0.1)',
    color: 'rgba(240,230,200,0.4)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'center' as const,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    transition: 'all 0.15s',
  };

  /* ─── JSX ─────────────────────────────────────────────────────────── */
  return (
    /* 7A — overlay */
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        overflowY: 'auto',
        padding: '40px 20px',
      }}
    >
      {/* 7B — modal card */}
      <div
        id="new-trade-form-card"
        style={{
          width: '100%',
          maxWidth: 640,
          background: 'rgba(8,5,2,0.95)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        {/* 7C — header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid rgba(201,168,76,0.1)',
          }}
        >
          {/* left: icon badge + title stack */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span
              style={{
                padding: '8px',
                borderRadius: 10,
                background: 'rgba(201,168,76,0.1)',
                border: '1px solid rgba(201,168,76,0.2)',
                color: '#C9A84C',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plus style={{ width: 18, height: 18 }} />
            </span>
            <div>
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#F0E6C8',
                  letterSpacing: '-0.2px',
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                Initiate New Contract
              </h3>
              <p
                style={{
                  fontSize: 9,
                  color: 'rgba(201,168,76,0.4)',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  margin: 0,
                  marginTop: 2,
                }}
              >
                Ailaha Phalam Ledger Logistics Engine
              </p>
            </div>
          </div>

          {/* right: close button */}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(240,230,200,0.5)',
              cursor: 'pointer',
              padding: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* 7D — form body */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Metadata Display */}
          <div
            style={{
              borderRadius: 8,
              padding: '12px 14px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              background: 'rgba(4,2,0,0.95)',
              border: '1px solid rgba(201,168,76,0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(240,230,200,0.7)',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              <Calendar style={{ width: 14, height: 14, color: '#C9A84C' }} />
              <span>Initiation Date Week:</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  fontFamily: "'DM Mono', 'Courier New', monospace",
                  letterSpacing: '1.5px',
                  fontWeight: 700,
                  background: 'rgba(201,150,12,0.2)',
                  border: '1px solid rgba(201,150,12,0.4)',
                  color: '#C9A84C',
                }}
              >
                Week {weekInfo.weekNum}
              </span>
              <span
                style={{
                  fontFamily: "'DM Mono', 'Courier New', monospace",
                  fontSize: 12,
                  color: 'rgba(240,230,200,0.7)',
                }}
              >
                {weekInfo.weekRange}
              </span>
            </div>
          </div>

          {/* 7G — grid: Symbol + Instrument */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Symbol */}
            <div>
              <label style={labelStyle}>
                Symbol / Security Identifier
              </label>
              <input
                id="symbol-input"
                type="text"
                required
                placeholder="e.g. NIFTY25S"
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)')}
                style={inputStyle}
              />
            </div>

            {/* Instrument dropdown */}
            <div>
              <label style={labelStyle}>
                Instrument Type
              </label>
              <select
                id="instrument-select"
                value={instrument}
                onChange={e => setInstrument(e.target.value as Instrument)}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)')}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="NSE Futures" style={{ background: '#0A0804', color: '#F0E6C8' }}>NSE Futures</option>
                <option value="NSE Options" style={{ background: '#0A0804', color: '#F0E6C8' }}>NSE Options</option>
                <option value="DOW" style={{ background: '#0A0804', color: '#F0E6C8' }}>DOW</option>
                <option value="Nikkei" style={{ background: '#0A0804', color: '#F0E6C8' }}>Nikkei</option>
                <option value="Nasdaq" style={{ background: '#0A0804', color: '#F0E6C8' }}>Nasdaq</option>
                <option value="NG" style={{ background: '#0A0804', color: '#F0E6C8' }}>NG (Natural Gas)</option>
                <option value="SnP" style={{ background: '#0A0804', color: '#F0E6C8' }}>S&P 500</option>
                <option value="Gift Nifty" style={{ background: '#0A0804', color: '#F0E6C8' }}>Gift Nifty</option>
              </select>
            </div>
          </div>

          {/* 7H — Direction toggle */}
          <div>
            <label style={labelStyle}>
              Trade Direction
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <button
                type="button"
                id="dir-long-btn"
                onClick={() => setDirection('Long')}
                style={
                  direction === 'Long'
                    ? {
                        background: 'rgba(103,122,103,0.15)',
                        border: '1px solid #677A67',
                        color: '#677A67',
                        borderRadius: 8,
                        padding: '10px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        textAlign: 'center',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        fontFamily: "'DM Mono', 'Courier New', monospace",
                        transition: 'all 0.15s',
                      }
                    : {
                        ...inactiveBtnStyle,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        fontFamily: "'DM Mono', 'Courier New', monospace",
                      }
                }
              >
                <span className="w-1.5 h-1.5 rounded-full inline-block animate-ping" style={{ background: '#677A67' }} />
                LONG / BUY FIRST
              </button>
              <button
                type="button"
                id="dir-short-btn"
                onClick={() => setDirection('Short')}
                style={
                  direction === 'Short'
                    ? {
                        background: 'rgba(201,150,12,0.12)',
                        border: '1px solid #C9960C',
                        color: '#C9960C',
                        borderRadius: 8,
                        padding: '10px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        textAlign: 'center',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        fontFamily: "'DM Mono', 'Courier New', monospace",
                        transition: 'all 0.15s',
                      }
                    : {
                        ...inactiveBtnStyle,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        fontFamily: "'DM Mono', 'Courier New', monospace",
                      }
                }
              >
                <span className="w-1.5 h-1.5 rounded-full inline-block animate-ping" style={{ background: '#C9960C' }} />
                SHORT / SELL FIRST
              </button>
            </div>
          </div>

          {/* 7G — grid: Entry Price + Lot Size + No. of Lots */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            {/* Entry Price */}
            <div>
              <label style={labelStyle}>
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
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)')}
                style={inputMonoStyle}
              />
            </div>

            {/* Lot Size */}
            <div>
              <label style={labelStyle}>
                Multiplier Size
              </label>
              <input
                id="lot-size-input"
                type="text"
                inputMode="decimal"
                required
                value={lotSize}
                onChange={e => validateAndSetDecimal(e.target.value, setLotSize)}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)')}
                style={inputMonoStyle}
              />
            </div>

            {/* Lots count */}
            <div>
              <label style={labelStyle}>
                No. of Lots
              </label>
              <input
                id="lots-input"
                type="text"
                inputMode="decimal"
                required
                value={numberOfLots}
                onChange={e => validateAndSetDecimal(e.target.value, setNumberOfLots)}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)')}
                style={inputMonoStyle}
              />
            </div>
          </div>

          {/* Initiation date — full width */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>
                Initiation Date Form
              </label>
              <input
                id="date-initiated-input"
                type="date"
                required
                value={dateInitiated}
                onChange={e => setDateInitiated(e.target.value)}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)')}
                style={inputMonoStyle}
              />
            </div>
          </div>

          {/* Currency and Realization Configuration Panel */}
          <div style={{ paddingTop: 14, marginTop: 2, borderTop: '1px solid rgba(201,168,76,0.1)' }}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '2.5px',
                textTransform: 'uppercase',
                color: '#C9A84C',
                display: 'block',
                marginBottom: 10,
              }}
            >
              Accounting & Currency Parameters
            </span>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 14,
                padding: '14px',
                borderRadius: 8,
                background: 'rgba(4,2,0,0.95)',
                border: '1px solid rgba(201,168,76,0.1)',
              }}
            >
              {/* 7I — Currency Select */}
              <div>
                <label style={labelStyle}>
                  Accounting Currency
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 6,
                    padding: 4,
                    borderRadius: 8,
                    background: 'rgba(8,5,2,0.9)',
                    border: '1px solid rgba(201,168,76,0.08)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setCurrency('INR');
                      if (realizationOption === '80/20' && instrument !== 'Gift Nifty') {
                        setRealizationOption('Full');
                      }
                    }}
                    style={
                      currency === 'INR'
                        ? {
                            background: 'rgba(103,122,103,0.15)',
                            color: '#677A67',
                            border: '1px solid rgba(103,122,103,0.3)',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: "'DM Mono', 'Courier New', monospace",
                            letterSpacing: '0.5px',
                          }
                        : {
                            background: 'transparent',
                            border: '1px solid transparent',
                            color: 'rgba(240,230,200,0.4)',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: "'DM Mono', 'Courier New', monospace",
                            letterSpacing: '0.5px',
                          }
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
                    style={
                      currency === 'USD'
                        ? {
                            background: 'rgba(201,150,12,0.2)',
                            color: '#C9960C',
                            border: '1px solid rgba(201,150,12,0.3)',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: "'DM Mono', 'Courier New', monospace",
                            letterSpacing: '0.5px',
                          }
                        : {
                            background: 'transparent',
                            border: '1px solid transparent',
                            color: 'rgba(240,230,200,0.4)',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: "'DM Mono', 'Courier New', monospace",
                            letterSpacing: '0.5px',
                          }
                    }
                  >
                    $ USD
                  </button>
                </div>
              </div>

              {/* 7I — Realization Rate selection */}
              <div>
                <label
                  style={labelStyle}
                  title="USD and Gift Nifty default to 80/20 book profits"
                >
                  Realization Rate Multiplier
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 6,
                    padding: 4,
                    borderRadius: 8,
                    background: 'rgba(8,5,2,0.9)',
                    border: '1px solid rgba(201,168,76,0.08)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setRealizationOption('Full')}
                    style={
                      realizationOption === 'Full'
                        ? {
                            background: 'rgba(103,122,103,0.15)',
                            color: '#677A67',
                            border: '1px solid rgba(103,122,103,0.3)',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: "'DM Mono', 'Courier New', monospace",
                            letterSpacing: '0.5px',
                          }
                        : {
                            background: 'transparent',
                            border: '1px solid transparent',
                            color: 'rgba(240,230,200,0.4)',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: "'DM Mono', 'Courier New', monospace",
                            letterSpacing: '0.5px',
                          }
                    }
                  >
                    FULL (1.0)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRealizationOption('80/20')}
                    style={
                      realizationOption === '80/20'
                        ? {
                            background: 'rgba(201,150,12,0.2)',
                            color: '#C9960C',
                            border: '1px solid rgba(201,150,12,0.3)',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: "'DM Mono', 'Courier New', monospace",
                            letterSpacing: '0.5px',
                          }
                        : {
                            background: 'transparent',
                            border: '1px solid transparent',
                            color: 'rgba(240,230,200,0.4)',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: "'DM Mono', 'Courier New', monospace",
                            letterSpacing: '0.5px',
                          }
                    }
                  >
                    80% (0.8)
                  </button>
                </div>
              </div>

              {/* Conditionally ask for USD to INR exchange rate */}
              {currency === 'USD' && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    paddingTop: 12,
                    borderTop: '1px solid rgba(201,168,76,0.08)',
                  }}
                >
                  <label
                    style={{
                      ...labelStyle,
                      color: '#C9960C',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 6,
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: '#C9960C' }}></span>
                    USD to INR Conversion Rate
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="e.g. 83.24"
                    value={usdToInrRate}
                    onChange={e => validateAndSetDecimal(e.target.value, setUsdToInrRate)}
                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)')}
                    style={inputMonoStyle}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      marginTop: 4,
                      display: 'block',
                      lineHeight: 1.5,
                      fontWeight: 600,
                      color: 'rgba(240,230,200,0.5)',
                    }}
                  >
                    * USD base values will translate to INR ledger automatically using this rate.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Info Banner on Rollover — olive accent */}
          <div style={{ paddingTop: 14, marginTop: 2, borderTop: '1px solid rgba(201,168,76,0.1)' }}>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                display: 'flex',
                gap: 12,
                fontSize: 12,
                lineHeight: 1.6,
                fontWeight: 600,
                background: 'rgba(103,122,103,0.06)',
                border: '1px solid rgba(103,122,103,0.2)',
                color: '#677A67',
              }}
            >
              <AlertOctagon
                className="animate-pulse"
                style={{ width: 18, height: 18, flexShrink: 0, marginTop: 1, color: '#677A67' }}
              />
              <div>
                <span
                  style={{
                    fontWeight: 800,
                    display: 'block',
                    marginBottom: 4,
                    fontSize: 9,
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    fontFamily: "'DM Mono', 'Courier New', monospace",
                    color: '#677A67',
                  }}
                >
                  Active Trade Initiation Modality
                </span>
                This contract will initiate as open-trading in the active positions roster. You can close, check current PnL, or carry it forward at any time from the Weekly Reporting view.
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'flex-end',
              paddingTop: 14,
              borderTop: '1px solid rgba(201,168,76,0.1)',
            }}
          >
            {/* 7K — Cancel */}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(201,168,76,0.08)',
                border: '1px solid rgba(201,168,76,0.2)',
                borderRadius: 8,
                color: '#C9A84C',
                padding: '10px 24px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                fontFamily: "'DM Mono', 'Courier New', monospace",
              }}
            >
              Cancel
            </button>

            {/* 7J — Confirm & Deploy */}
            <button
              type="submit"
              id="confirm-btn"
              style={{
                background: '#C9A84C',
                color: '#1A1200',
                border: 'none',
                borderRadius: 8,
                padding: '10px 28px',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                fontFamily: "'DM Mono', 'Courier New', monospace",
              }}
            >
              Confirm &amp; Deploy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

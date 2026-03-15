import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, XCircle, MapPin } from 'lucide-react';
import { SlideSheet } from './SlideSheet';
import { Report } from '../types';

interface ZoneDetailsModalProps {
  zone: Report;
  onClose: () => void;
  onConfirm: () => void;
  onDecline: () => void;
  userLocation: [number, number];
  t: any;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  suspicious:  { label: 'Persoană suspectă',    color: '#ef4444', bg: '#fff1f2' },
  dogs:        { label: 'Câini agresivi',        color: '#f97316', bg: '#fff7ed' },
  intoxicated: { label: 'Persoane turbulente',   color: '#eab308', bg: '#fefce8' },
  gathering:   { label: 'Grup nesigur',          color: '#8b5cf6', bg: '#f5f3ff' },
  lighting:    { label: 'Pickpocketi',           color: '#6366f1', bg: '#eef2ff' },
  blocked:     { label: 'Cale blocată',          color: '#64748b', bg: '#f8fafc' },
  harassment:  { label: 'Hărțuire',             color: '#ec4899', bg: '#fdf2f8' },
  other:       { label: 'Altceva',               color: '#94a3b8', bg: '#f8fafc' },
};

function riskInfo(weight: number) {
  if (weight >= 5) return { text: 'Risc ridicat', color: '#ef4444', bg: '#fff1f2' };
  if (weight >= 3) return { text: 'Risc moderat', color: '#f97316', bg: '#fff7ed' };
  return { text: 'Risc scăzut', color: '#eab308', bg: '#fefce8' };
}

function distM(a: [number, number], b: [number, number]): number {
  const cos = Math.cos((a[0] * Math.PI) / 180);
  return Math.sqrt(
    Math.pow((a[0] - b[0]) * 111320, 2) +
    Math.pow((a[1] - b[1]) * 111320 * cos, 2)
  );
}

const NEARBY_THRESHOLD_M = 200;

export const ZoneDetailsModal = ({ zone, onClose, onConfirm, onDecline, userLocation }: ZoneDetailsModalProps) => {
  const risk     = riskInfo(zone.weight);
  const dist     = distM(userLocation, [zone.lat, zone.lng]);
  const isNearby = dist <= NEARBY_THRESHOLD_M;

  return (
    <SlideSheet onClose={onClose} zIndex={80}>
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div style={{ width: 40, height: 4, borderRadius: 4, background: '#e2e8f0' }} />
      </div>

      {/* Header strip */}
      <div style={{ background: '#fff1f2', borderBottom: '1px solid #fecaca', padding: '10px 20px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Icon */}
          <div style={{ width: 36, height: 36, borderRadius: 12, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={17} color="#ef4444" />
          </div>

          {/* Title block */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f87171', marginBottom: 2, fontFamily: 'inherit' }}>
              Zonă periculoasă
            </p>
            {/* Use <p> not <h2> to avoid the global display-font CSS rule */}
            <p style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', fontFamily: 'inherit', margin: 0, lineHeight: 1.2 }}>
              Incident raportat
            </p>
          </div>

          {/* Risk badge */}
          <span style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 10, fontSize: 11, fontWeight: 800, background: risk.bg, color: risk.color, whiteSpace: 'nowrap' }}>
            {risk.text}
          </span>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>
            <Clock size={11} color="#94a3b8" /> {zone.timestamp}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: zone.isLive ? '#10b981' : '#94a3b8', display: 'inline-block' }} />
            <span style={{ color: zone.isLive ? '#10b981' : '#94a3b8' }}>{zone.isLive ? 'Se întâmplă acum' : 'Raportat anterior'}</span>
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>{zone.weight} confirmări</span>
        </div>
      </div>

      {/* Category chips */}
      <div style={{ padding: '14px 20px 8px' }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 10 }}>
          Tipuri de pericol
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {zone.categories.map((cat, i) => {
            const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.other;
            return (
              <span key={`${cat}-${i}`}
                style={{ padding: '5px 12px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30` }}>
                {cfg.label}
              </span>
            );
          })}
        </div>

        {zone.details && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: 12, color: '#475569', fontWeight: 500, lineHeight: 1.5, margin: 0 }}>{zone.details}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '8px 20px 16px' }}>
        {isNearby ? (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
              <button onClick={onConfirm}
                style={{ flex: 1, height: 50, borderRadius: 16, background: '#0f172a', color: 'white', fontWeight: 700, fontSize: 13, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 14px rgba(15,23,42,0.2)', cursor: 'pointer' }}>
                <CheckCircle2 size={16} color="white" /> Confirmă
              </button>
              <button onClick={onDecline}
                style={{ flex: 1, height: 50, borderRadius: 16, background: '#f8fafc', color: '#64748b', fontWeight: 700, fontSize: 13, border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
                <XCircle size={16} color="#64748b" /> Respinge
              </button>
            </div>
            <p style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
              Ești la ~{Math.round(dist)} m · poți confirma sau respinge
            </p>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 12, background: '#f8fafc', border: '1.5px solid #e2e8f0', marginBottom: 10 }}>
              <MapPin size={14} color="#94a3b8" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 12, color: '#475569', fontWeight: 500, margin: 0, lineHeight: 1.5 }}>
                Trebuie să fii la mai puțin de <strong>{NEARBY_THRESHOLD_M} m</strong> pentru a vota.
                Ești la ~{Math.round(dist)} m distanță.
              </p>
            </div>
            <button onClick={onClose}
              style={{ width: '100%', height: 50, borderRadius: 16, background: '#f1f5f9', color: '#1e293b', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }}>
              Închide
            </button>
          </>
        )}
      </div>
    </SlideSheet>
  );
};
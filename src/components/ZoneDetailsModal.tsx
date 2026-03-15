import React, { useRef } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Clock, AlertTriangle, XCircle, MapPin } from 'lucide-react';
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
  lighting:    { label: 'Iluminat slab',         color: '#6366f1', bg: '#eef2ff' },
  blocked:     { label: 'Cale blocată',          color: '#64748b', bg: '#f8fafc' },
  harassment:  { label: 'Hărțuire',             color: '#ec4899', bg: '#fdf2f8' },
  other:       { label: 'Altceva',               color: '#94a3b8', bg: '#f8fafc' },
};

function riskLabel(weight: number) {
  if (weight >= 5) return { text: 'Risc ridicat', color: '#ef4444', bg: '#fff1f2' };
  if (weight >= 3) return { text: 'Risc moderat', color: '#f97316', bg: '#fff7ed' };
  return { text: 'Risc scăzut', color: '#eab308', bg: '#fefce8' };
}

/** Haversine-lite distance in metres between two [lat, lng] points */
function distanceM(a: [number, number], b: [number, number]): number {
  const cos = Math.cos((a[0] * Math.PI) / 180);
  return Math.sqrt(
    Math.pow((a[0] - b[0]) * 111320, 2) +
    Math.pow((a[1] - b[1]) * 111320 * cos, 2)
  );
}

/** Users within this distance (metres) of a zone can confirm or decline */
const NEARBY_THRESHOLD_M = 200;

export const ZoneDetailsModal = ({ zone, onClose, onConfirm, onDecline, userLocation, t }: ZoneDetailsModalProps) => {
  const risk = riskLabel(zone.weight);
  const dist = distanceM(userLocation, [zone.lat, zone.lng]);
  const isNearby = dist <= NEARBY_THRESHOLD_M;

  // ── Drag-to-close (same JS-only pattern as ReportModal) ──────────────────
  const sheetRef   = useRef<HTMLDivElement>(null);
  const dragStart  = useRef(0);
  const dragDelta  = useRef(0);
  const closingRef = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if (closingRef.current) return;
    dragStart.current = e.touches[0].clientY; dragDelta.current = 0;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (closingRef.current) return;
    const d = e.touches[0].clientY - dragStart.current;
    dragDelta.current = d;
    if (d > 0 && sheetRef.current) {
      sheetRef.current.style.transition = 'none';
      sheetRef.current.style.transform = `translateY(${d}px)`;
    }
  };
  const onTouchEnd = () => {
    if (closingRef.current) return;
    if (dragDelta.current > 80) {
      closingRef.current = true;
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.22s ease-in';
        sheetRef.current.style.transform = 'translateY(110%)';
      }
      setTimeout(onClose, 220);
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)';
        sheetRef.current.style.transform = 'translateY(0)';
      }
    }
    dragDelta.current = 0;
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[79]"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      />

      {/* Sheet — NO exit prop */}
      <motion.div
        ref={sheetRef}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 34, stiffness: 360, mass: 0.8 }}
        className="fixed bottom-0 left-0 right-0 z-[80] bg-white"
        style={{
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -4px 40px rgba(0,0,0,0.13)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          maxWidth: '100vw',
          overflowX: 'hidden',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-3" style={{ background: '#fff1f2', borderBottom: '1px solid #fecaca' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0" style={{ background: '#fee2e2' }}>
              <AlertTriangle size={17} style={{ color: '#ef4444' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase font-semibold tracking-widest leading-none mb-0.5" style={{ color: '#f87171' }}>
                Zonă periculoasă
              </p>
              <h2 className="text-base font-black text-slate-900 leading-tight">Incident raportat</h2>
            </div>
            <span className="shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-black whitespace-nowrap"
              style={{ background: risk.bg, color: risk.color }}>
              {risk.text}
            </span>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Clock size={11} style={{ color: '#94a3b8' }} />
              <span className="text-[11px] font-semibold text-slate-400">{zone.timestamp}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: zone.isLive ? '#10b981' : '#94a3b8' }} />
              <span className="text-[11px] font-semibold" style={{ color: zone.isLive ? '#10b981' : '#94a3b8' }}>
                {zone.isLive ? 'Se întâmplă acum' : 'Raportat anterior'}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-slate-400">{zone.weight} confirmări</span>
          </div>
        </div>

        {/* Categories */}
        <div className="px-5 pt-3 pb-2">
          <p className="text-[10px] uppercase font-semibold tracking-widest text-slate-400 mb-2">Tipuri de pericol</p>
          <div className="flex flex-wrap gap-1.5">
            {zone.categories.map((cat, idx) => {
              const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.other;
              return (
                <span key={`${cat}-${idx}`} className="px-3 py-1.5 rounded-xl text-[11px] font-bold"
                  style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}25` }}>
                  {cfg.label}
                </span>
              );
            })}
          </div>
          {zone.details && (
            <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-xs text-slate-600 font-medium leading-relaxed">{zone.details}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 pt-2">
          {isNearby ? (
            <>
              {/* Nearby: show both confirm and decline */}
              <div className="flex gap-2.5 mb-2">
                <button onClick={onConfirm}
                  className="flex-1 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                  style={{ height: 50, background: '#0f172a', color: 'white', boxShadow: '0 4px 14px rgba(15,23,42,0.2)' }}>
                  <CheckCircle2 size={16} /> Confirmă
                </button>
                <button onClick={onDecline}
                  className="flex-1 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                  style={{ height: 50, background: '#f8fafc', color: '#64748b', border: '1.5px solid #e2e8f0' }}>
                  <XCircle size={16} /> Respinge
                </button>
              </div>
              <p className="text-center text-[10px] text-slate-400">
                Ești la ~{Math.round(dist)} m de această zonă
              </p>
            </>
          ) : (
            <>
              {/* Too far: show distance and read-only info */}
              <div className="flex items-center gap-2 p-3 mb-3 rounded-xl" style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0' }}>
                <MapPin size={14} style={{ color: '#94a3b8' }} className="shrink-0" />
                <p className="text-xs text-slate-500 font-medium">
                  Trebuie să fii la mai puțin de {NEARBY_THRESHOLD_M} m pentru a confirma sau respinge.
                  Ești la <span className="font-bold text-slate-700">~{Math.round(dist)} m</span>.
                </p>
              </div>
              <button onClick={onClose}
                className="w-full rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                style={{ height: 50, background: '#f1f5f9', color: '#1e293b' }}>
                Închide
              </button>
            </>
          )}
        </div>
      </motion.div>
    </>
  );
};
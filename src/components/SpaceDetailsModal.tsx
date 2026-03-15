import React, { useRef } from 'react';
import { motion } from 'motion/react';
import { Navigation, Phone, Clock, MapPin, Globe, ShoppingCart, Shield, Stethoscope, Store } from 'lucide-react';
import { SafeSpace } from '../types';

interface SpaceDetailsModalProps {
  space: SafeSpace;
  onClose: () => void;
  onNavigate: () => void;
  t: any;
}

const TYPE_CONFIG: Record<string, { Icon: React.ElementType; color: string; label: string }> = {
  pharmacy:    { Icon: Stethoscope,  color: '#10b981', label: 'Farmacie' },
  hospital:    { Icon: Stethoscope,  color: '#3b82f6', label: 'Spital' },
  police:      { Icon: Shield,       color: '#6366f1', label: 'Poliție' },
  supermarket: { Icon: ShoppingCart, color: '#f97316', label: 'Supermarket' },
  convenience: { Icon: Store,        color: '#f59e0b', label: 'Magazin' },
  doctors:     { Icon: Stethoscope,  color: '#14b8a6', label: 'Cabinet Medical' },
  clinic:      { Icon: Stethoscope,  color: '#06b6d4', label: 'Clinică' },
};

function formatDist(m?: number) {
  if (!m) return null;
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
function convertTo24h(time: string) {
  const match = time.match(/(\d+):(\d+)\s?(AM|PM)/i);
  if (!match) return time;
  let hour = parseInt(match[1]);
  const minute = match[2], period = match[3].toUpperCase();
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, '0')}:${minute}`;
}
function parseOpeningHours(hours?: string) {
  if (!hours) return [];
  const dayMap: Record<string, string> = { Monday: 'Luni', Tuesday: 'Marți', Wednesday: 'Miercuri', Thursday: 'Joi', Friday: 'Vineri', Saturday: 'Sâmbătă', Sunday: 'Duminică' };
  return hours.split('|').map(part => {
    const idx = part.indexOf(':');
    const day = part.slice(0, idx).trim();
    const time = part.slice(idx + 1).trim();
    if (time.toLowerCase().includes('open 24')) return { day: dayMap[day] || day, hours: 'Deschis 24h' };
    const [start, end] = time.split('–');
    return { day: dayMap[day] || day, hours: `${convertTo24h(start?.trim())} – ${convertTo24h(end?.trim())}` };
  });
}

export const SpaceDetailsModal = ({ space, onClose, onNavigate }: SpaceDetailsModalProps) => {
  const cfg      = TYPE_CONFIG[space.type] || { Icon: Shield, color: '#64748b', label: 'Spațiu Sigur' };
  const { Icon } = cfg;
  const ex       = space as any;
  const dist     = formatDist(ex.distance);
  const schedule = parseOpeningHours(ex.openingHours);
  const today    = new Date().getDay();

  // ── Drag-to-close (same pattern as ReportModal — JS only, no Framer exit) ──
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
      {/* Backdrop — tap outside to close */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[79]"
        style={{ background: 'rgba(0,0,0,0.35)' }}
        onClick={onClose}
      />

      {/* Sheet — NO exit prop; manual JS handles close animation */}
      <motion.div
        ref={sheetRef}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 34, stiffness: 360, mass: 0.8 }}
        className="fixed bottom-0 left-0 right-0 z-[80] bg-white overflow-hidden"
        style={{
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -4px 40px rgba(0,0,0,0.13)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Header */}
        <div style={{ background: cfg.color }} className="px-6 pt-3 pb-6">
          <div className="flex justify-center mb-4">
            <div className="w-10 h-1 bg-white/40 rounded-full" />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <Icon size={22} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white/60 text-[11px] font-medium uppercase tracking-widest mb-0.5">{cfg.label}</p>
              <h2 className="text-white leading-snug truncate" style={{ fontSize: '18px', fontWeight: 600 }}>{space.name}</h2>
            </div>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            <Pill><span className="w-1.5 h-1.5 bg-white rounded-full" /> Deschis acum</Pill>
            {dist && <Pill><Navigation size={10} />{dist}</Pill>}
          </div>
        </div>

        {/* Info rows */}
        <div className="px-6 py-4 flex flex-col gap-3">
          {ex.address && <InfoRow icon={<MapPin size={15} />} color={cfg.color}>{ex.address}</InfoRow>}
          {schedule.length > 0 && (
            <InfoRow icon={<Clock size={15} />} color={cfg.color}>
              <div className="flex flex-col gap-1 text-sm w-full">
                {schedule.map((d: any, i: number) => {
                  const isToday = i === (today === 0 ? 6 : today - 1);
                  return (
                    <div key={i} className="flex justify-between">
                      <span className={isToday ? 'font-semibold text-black' : 'text-slate-500'}>{d.day}</span>
                      <span className={isToday ? 'font-semibold' : 'font-medium'}>{d.hours}</span>
                    </div>
                  );
                })}
              </div>
            </InfoRow>
          )}
          {ex.phone && (
            <InfoRow icon={<Phone size={15} />} color={cfg.color}>
              <a href={`tel:${ex.phone}`} style={{ color: cfg.color }} className="font-semibold">{ex.phone}</a>
            </InfoRow>
          )}
          {ex.website && (
            <InfoRow icon={<Globe size={15} />} color={cfg.color}>
              <a href={ex.website} target="_blank" rel="noreferrer" style={{ color: cfg.color }} className="font-semibold truncate block">
                {ex.website.replace(/^https?:\/\//, '').split('/')[0]}
              </a>
            </InfoRow>
          )}
        </div>

        <div className="px-6 pb-6 pt-1">
          <button onClick={onNavigate} style={{ background: cfg.color }}
            className="w-full h-14 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2.5 active:scale-95 transition-transform">
            <Navigation size={19} /> Navighează aici
          </button>
        </div>
      </motion.div>
    </>
  );
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 text-white"
      style={{ background: 'rgba(255,255,255,0.22)' }}>{children}</span>
  );
}
function InfoRow({ icon, color, children }: { icon: React.ReactNode; color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ color, background: color + '15' }}>{icon}</div>
      <div className="text-sm text-slate-600 pt-1.5 leading-snug flex-1 min-w-0">{children}</div>
    </div>
  );
}
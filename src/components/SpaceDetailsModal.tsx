import React from 'react';
import { Navigation, Phone, Clock, MapPin, Globe, ShoppingCart, Shield, Stethoscope, Store } from 'lucide-react';
import { SlideSheet } from './SlideSheet';
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

  return (
    <SlideSheet onClose={onClose} zIndex={80}>
      {/* Drag handle */}
      <div className="flex justify-center pt-3 mb-0">
        <div style={{ width: 40, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.4)' }} />
      </div>

      {/* Coloured header */}
      <div style={{ background: cfg.color, padding: '8px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={22} color="white" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>
              {cfg.label}
            </p>
            <p style={{ fontSize: 17, fontWeight: 700, color: 'white', margin: 0, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
              {space.name}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <Pill color={cfg.color}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', display: 'inline-block' }} /> Deschis acum
          </Pill>
          {dist && <Pill color={cfg.color}><Navigation size={10} color="white" />{dist}</Pill>}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ex.address && <InfoRow icon={<MapPin size={14} />} color={cfg.color}><span style={{ fontSize: 13, color: '#475569', lineHeight: 1.4 }}>{ex.address}</span></InfoRow>}

        {schedule.length > 0 && (
          <InfoRow icon={<Clock size={14} />} color={cfg.color}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
              {schedule.map((d: any, i: number) => {
                const isToday = i === (today === 0 ? 6 : today - 1);
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: isToday ? '#0f172a' : '#64748b', fontWeight: isToday ? 700 : 400 }}>{d.day}</span>
                    <span style={{ color: isToday ? '#0f172a' : '#64748b', fontWeight: isToday ? 700 : 500 }}>{d.hours}</span>
                  </div>
                );
              })}
            </div>
          </InfoRow>
        )}

        {ex.phone && (
          <InfoRow icon={<Phone size={14} />} color={cfg.color}>
            <a href={`tel:${ex.phone}`} style={{ color: cfg.color, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>{ex.phone}</a>
          </InfoRow>
        )}

        {ex.website && (
          <InfoRow icon={<Globe size={14} />} color={cfg.color}>
            <a href={ex.website} target="_blank" rel="noreferrer"
              style={{ color: cfg.color, fontWeight: 600, fontSize: 13, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
              {ex.website.replace(/^https?:\/\//, '').split('/')[0]}
            </a>
          </InfoRow>
        )}
      </div>

      {/* Navigate button */}
      <div style={{ padding: '4px 20px 20px' }}>
        <button onClick={onNavigate}
          style={{ width: '100%', height: 54, borderRadius: 16, background: cfg.color, color: 'white', fontWeight: 700, fontSize: 15, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer' }}>
          <Navigation size={18} color="white" /> Navighează aici
        </button>
      </div>
    </SlideSheet>
  );
};

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: 'white', background: 'rgba(255,255,255,0.22)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {children}
    </span>
  );
}

function InfoRow({ icon, color, children }: { icon: React.ReactNode; color: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: color + '18', color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 6 }}>{children}</div>
    </div>
  );
}
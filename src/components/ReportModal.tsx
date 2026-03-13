import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, CheckCircle2, Clock, AlertTriangle, Dog, Users, Lightbulb, Ban, MessageSquareWarning, HelpCircle, UserX } from 'lucide-react';

interface ReportModalProps {
  onClose: () => void;
  onSubmit: (categories: string[], details: string, isLive: boolean) => void;
  t: any;
  reportLocation: [number, number] | null;
}

const CATEGORIES = [
  { id: 'suspicious', label: 'Persoană suspectă', Icon: UserX,              color: '#ef4444' },
  { id: 'dogs',       label: 'Câini agresivi',    Icon: Dog,                color: '#f97316' },
  { id: 'intoxicated',label: 'Persoane turbulente',Icon: AlertTriangle,     color: '#eab308' },
  { id: 'gathering',  label: 'Grup nesigur',       Icon: Users,             color: '#8b5cf6' },
  { id: 'lighting',   label: 'Iluminat slab',      Icon: Lightbulb,         color: '#6366f1' },
  { id: 'blocked',    label: 'Cale blocată',        Icon: Ban,              color: '#64748b' },
  { id: 'harassment', label: 'Hărțuire',           Icon: MessageSquareWarning, color: '#ec4899' },
  { id: 'other',      label: 'Altceva',             Icon: HelpCircle,       color: '#94a3b8' },
];

export const ReportModal = ({ onClose, onSubmit, t, reportLocation }: ReportModalProps) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState('');
  const [isLive, setIsLive] = useState(true);
  const [minimized, setMinimized] = useState(false);

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  // Minimized state — small floating pill so user can tap the map
  if (minimized) {
    return (
      <motion.button
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        onClick={() => setMinimized(false)}
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-white text-sm font-bold"
        style={{ background: '#ef4444', boxShadow: '0 8px 32px rgba(239,68,68,0.4)' }}
      >
        <MapPin size={18} />
        {reportLocation ? 'Locație marcată — atinge pentru a continua' : 'Atinge harta pentru a marca locația'}
        <div className="w-2 h-2 rounded-full bg-white/60 animate-ping absolute -top-1 -right-1" />
      </motion.button>
    );
  }

  return (
    <motion.div
      id="report-modal-overlay"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 320 }}
      className="fixed inset-x-0 bottom-0 z-[70] bg-white flex flex-col pointer-events-auto"
      style={{ borderRadius: '24px 24px 0 0', maxHeight: '88vh', boxShadow: '0 -4px 40px rgba(0,0,0,0.13)' }}
    >
      {/* Header */}
      <div className="px-6 pt-5 pb-4" style={{ background: '#ef4444', borderRadius: '24px 24px 0 0' }}>
        
        {/* Handle / Buton de închidere centrat */}
        <div className="flex items-center justify-center relative mb-4">
          <button
            onClick={onClose}
            className="p-3 -m-3 transition-opacity hover:opacity-70 active:opacity-50"
            aria-label="Închide modalul"
          >
            <div className="w-10 h-1 bg-white/40 rounded-full" />
          </button>
        </div>

        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/60 text-[11px] font-medium uppercase tracking-widest mb-0.5">Raportează</p>
            <h2 className="text-white text-xl font-semibold" style={{ letterSpacing: '-0.2px' }}>
              Ce se întâmplă?
            </h2>
          </div>

          {/* Minimize button */}
          <button
            onClick={() => setMinimized(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
            style={{ background: 'rgba(255,255,255,0.2)' }}
          >
            <MapPin size={13} />
            {reportLocation ? 'Schimbă locația' : 'Marchează locația'}
          </button>
        </div>

        {/* Location status pill */}
        <div className="mt-3">
          {reportLocation ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl w-fit" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <CheckCircle2 size={14} className="text-white" />
              <span className="text-white text-xs font-semibold">Locație marcată</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl w-fit" style={{ background: 'rgba(0,0,0,0.15)' }}>
              <MapPin size={14} className="text-white/70" />
              <span className="text-white/70 text-xs font-semibold">Locație nemarcată</span>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6 pb-32">

        {/* Categories */}
        <div>
          <p className="text-xs uppercase text-slate-400 font-semibold tracking-widest mb-3">Selectează tipul</p>
          <div className="grid grid-cols-2 gap-2.5">
            {CATEGORIES.map(cat => {
              const isSelected = selected.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => toggle(cat.id)}
                  className="flex items-center gap-3 p-4 rounded-2xl text-left transition-all active:scale-95"
                  style={{
                    background: isSelected ? cat.color : '#f8fafc',
                    border: `1.5px solid ${isSelected ? cat.color : '#e2e8f0'}`,
                    boxShadow: isSelected ? `0 4px 16px ${cat.color}30` : 'none',
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: isSelected ? 'rgba(255,255,255,0.25)' : cat.color + '18', color: isSelected ? 'white' : cat.color }}
                  >
                    <cat.Icon size={16} />
                  </div>
                  <span
                    className="text-xs font-semibold leading-tight"
                    style={{ color: isSelected ? 'white' : '#374151' }}
                  >
                    {cat.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Details textarea */}
        <div>
          <p className="text-xs uppercase text-slate-400 font-semibold tracking-widest mb-3">Detalii (opțional)</p>
          <textarea
            placeholder="Descrie situația..."
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            className="w-full rounded-2xl px-4 py-3.5 text-sm text-slate-800 resize-none focus:outline-none"
            style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0' }}
          />
        </div>

        {/* Happening now toggle */}
        <div
          className="flex items-center justify-between p-4 rounded-2xl"
          style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#ef444418', color: '#ef4444' }}>
              <Clock size={16} />
            </div>
            <p className="text-sm font-semibold text-slate-700">Se întâmplă acum?</p>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setIsLive(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: isLive ? '#ef4444' : '#e2e8f0', color: isLive ? 'white' : '#94a3b8' }}
            >
              Da
            </button>
            <button
              onClick={() => setIsLive(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: !isLive ? '#1e293b' : '#e2e8f0', color: !isLive ? 'white' : '#94a3b8' }}
            >
              Nu
            </button>
          </div>
        </div>
      </div>

      {/* Submit button */}
      <div className="px-6 pb-10 pt-3 border-t border-slate-100 bg-white">
        <button
          disabled={selected.length === 0 || !reportLocation}
          onClick={() => onSubmit(selected, details, isLive)}
          className="w-full h-14 rounded-2xl font-bold text-base transition-all active:scale-95"
          style={{
            background: (!reportLocation || selected.length === 0) ? '#e2e8f0' : '#ef4444',
            color: (!reportLocation || selected.length === 0) ? '#94a3b8' : 'white',
            boxShadow: (!reportLocation || selected.length === 0) ? 'none' : '0 8px 24px rgba(239,68,68,0.3)',
          }}
        >
          {!reportLocation ? 'Marchează mai întâi locația' : selected.length === 0 ? 'Selectează o categorie' : 'Raportează zona'}
        </button>
      </div>
    </motion.div>
  );
};
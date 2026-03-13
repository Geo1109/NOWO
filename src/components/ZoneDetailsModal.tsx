import React from 'react';
import { motion } from 'motion/react';
import { X, CheckCircle2 } from 'lucide-react';
import { Report } from '../types';

interface ZoneDetailsModalProps {
  zone: Report;
  onClose: () => void;
  onConfirm: () => void;
  t: any;
}

export const ZoneDetailsModal = ({ zone, onClose, onConfirm, t }: ZoneDetailsModalProps) => (
  <motion.div 
    initial={{ y: '100%' }}
    animate={{ y: 0 }}
    exit={{ y: '100%' }}
    className="fixed bottom-0 left-0 right-0 z-[80] glass rounded-t-[40px] p-10 pb-14 shadow-2xl border-t-2 border-rose-100"
  >
    <div className="w-16 h-1.5 bg-slate-200 rounded-full mx-auto mb-10" />
    
    <div className="flex items-start justify-between mb-8">
      <div>
        <h2 className="text-3xl font-black text-rose-500 mb-2 tracking-tight">{t.dangerZone}</h2>
        <p className="text-sm text-slate-400 font-bold">{zone.weight} {t.reports} • {zone.timestamp}</p>
      </div>
      <button onClick={onClose} className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
        <X size={24} />
      </button>
    </div>

    <div className="flex flex-wrap gap-3 mb-10">
      {zone.categories.map((cat, idx) => (
        <div key={`${cat}-${idx}`} className="px-4 py-2 glass rounded-2xl text-xs font-bold text-slate-600">
          {t.categories[cat] || cat}
        </div>
      ))}
    </div>

    <button 
      onClick={onConfirm}
      className="w-full h-16 bg-slate-900 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl"
    >
      <CheckCircle2 size={24} />
      {t.confirmNear}
    </button>
  </motion.div>
);

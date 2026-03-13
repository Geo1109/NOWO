import React from 'react';
import { motion } from 'motion/react';
import { X, ShoppingBag, Stethoscope, Shield, Building2, Navigation } from 'lucide-react';
import { SafeSpace } from '../types';

interface SpaceDetailsModalProps {
  space: SafeSpace;
  onClose: () => void;
  onNavigate: () => void;
  t: any;
}

export const SpaceDetailsModal = ({ space, onClose, onNavigate, t }: SpaceDetailsModalProps) => {
  const iconMap: any = {
    pharmacy: <ShoppingBag size={24} />,
    store: <ShoppingBag size={24} />,
    hospital: <Stethoscope size={24} />,
    police: <Shield size={24} />
  };

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      className="fixed bottom-0 left-0 right-0 z-[80] glass rounded-t-[40px] p-10 pb-14 shadow-2xl border-t-2 border-emerald-100"
    >
      <div className="w-16 h-1.5 bg-slate-200 rounded-full mx-auto mb-10" />
      
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            {iconMap[space.type] || <Building2 size={24} />}
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">{space.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[10px] font-black uppercase tracking-widest">{t.openNow}</span>
              <p className="text-xs text-slate-400 font-bold">{t.distance}</p>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
          <X size={24} />
        </button>
      </div>

      <p className="text-slate-500 text-sm font-bold mb-10 leading-relaxed">
        {space.details}. This location is verified as a Safe Space. You can seek assistance here 24/7.
      </p>

      <button 
        onClick={onNavigate}
        className="w-full h-16 bg-emerald-600 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl shadow-emerald-100"
      >
        <Navigation size={24} />
        Navigate to Safe Space
      </button>
    </motion.div>
  );
};

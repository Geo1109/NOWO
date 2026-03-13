import React from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';

interface SettingsScreenProps {
  onClose: () => void;
  t: any;
}

export const SettingsScreen = ({ onClose, t }: SettingsScreenProps) => (
  <motion.div 
    initial={{ x: '100%' }}
    animate={{ x: 0 }}
    exit={{ x: '100%' }}
    className="fixed inset-0 z-[60] bg-slate-50 flex flex-col"
  >
    <div className="p-8 flex items-center justify-between">
      <h2 className="text-2xl font-black tracking-tight text-slate-900">{t.alerts}</h2>
      <button onClick={onClose} className="w-12 h-12 glass rounded-2xl flex items-center justify-center text-slate-600">
        <X size={20} />
      </button>
    </div>
    
    <div className="px-8 flex-1 overflow-y-auto flex flex-col gap-6 pb-32">
      <div className="p-6 glass rounded-3xl flex items-center justify-between">
        <div className="flex-1 pr-4">
          <p className="text-sm font-bold text-slate-800">{t.alertNearMe}</p>
          <p className="text-xs text-slate-400 font-bold">Radius: 500m</p>
        </div>
        <div className="w-14 h-8 bg-primary rounded-full relative shadow-inner">
          <div className="absolute right-1 top-1 w-6 h-6 bg-white rounded-full shadow-lg" />
        </div>
      </div>

      <div className="p-6 glass rounded-3xl flex items-center justify-between">
        <div className="flex-1 pr-4">
          <p className="text-sm font-bold text-slate-800">{t.notifyFlagged}</p>
        </div>
        <div className="w-14 h-8 bg-slate-200 rounded-full relative shadow-inner">
          <div className="absolute left-1 top-1 w-6 h-6 bg-white rounded-full shadow-lg" />
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-xs uppercase text-slate-400 font-black tracking-widest mb-6">{t.emergencyContact}</h3>
        <div className="flex flex-col gap-4">
          <div className="relative">
            <input 
              type="text" 
              placeholder={t.name}
              className="w-full h-14 glass rounded-2xl px-6 text-sm font-bold focus:outline-none text-slate-900"
            />
          </div>
          <div className="relative">
            <input 
              type="tel" 
              placeholder={t.phone}
              className="w-full h-14 glass rounded-2xl px-6 text-sm font-bold focus:outline-none text-slate-900"
            />
          </div>
        </div>
      </div>

      <button className="w-full h-16 bg-slate-900 text-white rounded-2xl font-black text-lg mt-4 shadow-xl active:scale-95 transition-all">
        {t.save}
      </button>
    </div>
  </motion.div>
);

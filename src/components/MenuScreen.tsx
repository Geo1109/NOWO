import React from 'react';
import { motion } from 'motion/react';
import { X, Info, Shield } from 'lucide-react';

interface MenuScreenProps {
  onClose: () => void;
  t: any;
}

export const MenuScreen = ({ onClose, t }: MenuScreenProps) => (
  <motion.div 
    initial={{ x: '100%' }}
    animate={{ x: 0 }}
    exit={{ x: '100%' }}
    className="fixed inset-0 z-[60] bg-slate-50 flex flex-col"
  >
    <div className="p-8 flex items-center justify-between">
      <h2 className="text-2xl font-black tracking-tight text-slate-900">Menu</h2>
      <button onClick={onClose} className="w-12 h-12 glass rounded-2xl flex items-center justify-center text-slate-600">
        <X size={20} />
      </button>
    </div>
    <div className="px-8 flex-1 overflow-y-auto flex flex-col gap-4 pb-32">
      <div className="p-6 glass rounded-3xl flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <Info size={24} />
          </div>
        </div>
        <div>
          <h3 className="font-bold text-slate-800">About NoWo</h3>
          <p className="text-xs text-slate-400">Version 1.2.4 (Beta)</p>
        </div>
      </div>
      <div className="p-6 glass rounded-3xl flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500">
          <Shield size={24} />
        </div>
        <div>
          <h3 className="font-bold text-slate-800">Privacy Policy</h3>
          <p className="text-xs text-slate-400">Your data is encrypted</p>
        </div>
      </div>
    </div>
  </motion.div>
);

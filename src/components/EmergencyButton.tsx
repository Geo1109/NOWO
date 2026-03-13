import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, X } from 'lucide-react';

interface EmergencyButtonProps {
  t: any;
}

export const EmergencyButton = ({ t }: EmergencyButtonProps) => {
  const [active, setActive] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="fixed top-24 right-6 z-40 flex flex-col items-end gap-3">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 ${active ? 'bg-danger text-white animate-pulse' : 'glass text-danger border-danger/40'}`}
      >
        <Shield size={24} className={active ? 'text-white' : 'text-danger'} />
        {active && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
            <div className="w-2 h-2 bg-danger rounded-full animate-ping" />
          </div>
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ opacity: 0, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            className="glass rounded-3xl p-5 shadow-2xl border-danger/10 w-72"
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold leading-tight text-danger">{t.emergency}</h4>
              <button onClick={() => setIsExpanded(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            
            <p className="text-xs text-slate-500 mb-4 font-medium">
              {active ? "Live location is being shared with emergency contacts." : "Tap to start sharing your live location with emergency contacts."}
            </p>

            <button 
              onClick={() => setActive(!active)}
              className={`w-full py-3 rounded-xl text-xs font-bold transition-all ${active ? 'bg-slate-100 text-slate-900' : 'bg-danger text-white shadow-lg shadow-danger/20'}`}
            >
              {active ? 'Stop Sharing' : 'Start Sharing'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';

interface SettingsScreenProps {
  onClose: () => void;
  t: any;
}

export const SettingsScreen = ({ onClose, t }: SettingsScreenProps) => {
  // --- States with localStorage fallback ---
  const [alertNearMe, setAlertNearMe] = useState<boolean>(() => {
    return localStorage.getItem('alertNearMe') === 'true';
  });
  const [notifyFlagged, setNotifyFlagged] = useState<boolean>(() => {
    return localStorage.getItem('notifyFlagged') === 'true';
  });
  const [emergencyName, setEmergencyName] = useState<string>(() => {
    return localStorage.getItem('emergencyName') || '';
  });
  const [emergencyPhone, setEmergencyPhone] = useState<string>(() => {
    return localStorage.getItem('emergencyPhone') || '';
  });

  // --- Save changes to localStorage automatically ---
  useEffect(() => {
    localStorage.setItem('alertNearMe', String(alertNearMe));
  }, [alertNearMe]);

  useEffect(() => {
    localStorage.setItem('notifyFlagged', String(notifyFlagged));
  }, [notifyFlagged]);

  useEffect(() => {
    localStorage.setItem('emergencyName', emergencyName);
  }, [emergencyName]);

  useEffect(() => {
    localStorage.setItem('emergencyPhone', emergencyPhone);
  }, [emergencyPhone]);

  return (
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
        {/* Alert Toggles */}
        <div className="p-6 glass rounded-3xl flex items-center justify-between">
          <div className="flex-1 pr-4">
            <p className="text-sm font-bold text-slate-800">{t.alertNearMe}</p>
            <p className="text-xs text-slate-400 font-bold">Radius: 500m</p>
          </div>
          <div 
            onClick={() => setAlertNearMe(prev => !prev)}
            className={`w-14 h-8 rounded-full relative shadow-inner cursor-pointer ${alertNearMe ? 'bg-primary' : 'bg-slate-200'}`}
          >
            <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg transition-all ${alertNearMe ? 'right-1' : 'left-1'}`} />
          </div>
        </div>

        <div className="p-6 glass rounded-3xl flex items-center justify-between">
          <div className="flex-1 pr-4">
            <p className="text-sm font-bold text-slate-800">{t.notifyFlagged}</p>
          </div>
          <div 
            onClick={() => setNotifyFlagged(prev => !prev)}
            className={`w-14 h-8 rounded-full relative shadow-inner cursor-pointer ${notifyFlagged ? 'bg-primary' : 'bg-slate-200'}`}
          >
            <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg transition-all ${notifyFlagged ? 'right-1' : 'left-1'}`} />
          </div>
        </div>

        {/* Emergency Contacts */}
        <div className="mt-4">
          <h3 className="text-xs uppercase text-slate-400 font-black tracking-widest mb-6">{t.emergencyContact}</h3>
          <div className="flex flex-col gap-4">
            <input 
              type="text"
              placeholder={t.name}
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              className="w-full h-14 glass rounded-2xl px-6 text-sm font-bold focus:outline-none text-slate-900"
            />
            <input 
              type="tel"
              placeholder={t.phone}
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              className="w-full h-14 glass rounded-2xl px-6 text-sm font-bold focus:outline-none text-slate-900"
            />
          </div>
        </div>

        <button
          onClick={() => alert(t.savedSuccessfully || 'Settings saved!')}
          className="w-full h-16 bg-slate-900 text-white rounded-2xl font-black text-lg mt-4 shadow-xl active:scale-95 transition-all"
        >
          {t.save}
        </button>
      </div>
    </motion.div>
  );
};
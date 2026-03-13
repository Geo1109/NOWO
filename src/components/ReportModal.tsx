import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, LocateFixed, CheckCircle2, Clock } from 'lucide-react';

interface ReportModalProps {
  onClose: () => void;
  onSubmit: (categories: string[], details: string, isLive: boolean) => void;
  t: any;
  reportLocation: [number, number] | null;
}

export const ReportModal = ({ onClose, onSubmit, t, reportLocation }: ReportModalProps) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState('');
  const [isLive, setIsLive] = useState(true);

  const categories = [
    { id: 'suspicious', label: t.categories.suspicious },
    { id: 'dogs', label: t.categories.dogs },
    { id: 'intoxicated', label: t.categories.intoxicated },
    { id: 'gathering', label: t.categories.gathering },
    { id: 'lighting', label: t.categories.lighting },
    { id: 'blocked', label: t.categories.blocked },
    { id: 'harassment', label: t.categories.harassment },
    { id: 'other', label: t.categories.other },
  ];

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  return (
    <motion.div 
      id="report-modal-overlay"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      className="fixed inset-x-0 bottom-0 z-[70] bg-slate-50 flex flex-col rounded-t-[40px] shadow-2xl max-h-[85vh] pointer-events-auto"
    >
      <div className="p-8 flex items-center justify-between">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">{t.whatIsHappening}</h2>
        <button onClick={onClose} className="w-12 h-12 glass rounded-2xl flex items-center justify-center text-slate-600">
          <X size={20} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto px-8 flex flex-col gap-8 pb-32">
        {!reportLocation ? (
          <div className="p-6 bg-rose-50 rounded-3xl border border-rose-100 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center text-white">
              <LocateFixed size={20} />
            </div>
            <p className="text-sm font-bold text-rose-600">Tap on the map behind this panel to mark the location</p>
          </div>
        ) : (
          <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white">
              <CheckCircle2 size={20} />
            </div>
            <p className="text-sm font-bold text-emerald-600">Location marked successfully</p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {categories.map(cat => (
            <button 
              key={cat.id}
              onClick={() => toggle(cat.id)}
              className={`px-5 py-4 rounded-2xl text-xs font-bold transition-all border ${selected.includes(cat.id) ? 'bg-rose-500 text-white border-rose-500 glow-accent scale-105' : 'glass text-slate-500 border-slate-100'}`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-xs uppercase text-slate-400 font-black tracking-widest">Additional Details</h3>
          <textarea 
            placeholder={t.addDetails}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="w-full h-40 glass rounded-3xl p-6 text-sm font-bold focus:outline-none resize-none shadow-inner text-slate-900 border border-slate-100"
          />
        </div>

        <div className="flex items-center justify-between p-6 glass rounded-3xl border border-slate-100">
          <div className="flex items-center gap-4">
            <Clock size={20} className="text-slate-400" />
            <p className="text-sm font-bold text-slate-700">{t.happeningNow}</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsLive(true)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isLive ? 'bg-rose-500 text-white shadow-lg shadow-rose-200' : 'bg-slate-100 text-slate-400'}`}
            >
              {t.yes}
            </button>
            <button 
              onClick={() => setIsLive(false)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!isLive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}
            >
              {t.no}
            </button>
          </div>
        </div>
      </div>

      <div className="p-8 border-t border-slate-200 bg-white">
        <button 
          disabled={selected.length === 0 || !reportLocation}
          onClick={() => onSubmit(selected, details, isLive)}
          className={`w-full h-16 rounded-2xl font-black text-lg transition-all active:scale-95 ${(!reportLocation || selected.length === 0) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-rose-500 text-white glow-accent shadow-xl shadow-rose-100'}`}
        >
          {t.reportZone}
        </button>
      </div>
    </motion.div>
  );
};

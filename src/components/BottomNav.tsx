import React from 'react';
import { Home, Navigation, AlertTriangle, Bell, Settings as SettingsIcon } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (t: string) => void;
  t: any;
}

export const BottomNav = ({ activeTab, setActiveTab, t }: BottomNavProps) => (
  <nav className="fixed bottom-0 left-0 right-0 h-20 glass border-t border-slate-200 flex items-center justify-around px-8 z-50 pb-2">
    <button 
      onClick={() => setActiveTab('home')}
      className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'home' ? 'text-primary scale-105' : 'text-slate-400'}`}
    >
      <Home size={22} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
      <span className="text-[9px] font-bold uppercase tracking-widest">Home</span>
    </button>

    <button 
      onClick={() => setActiveTab('route')}
      className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'route' ? 'text-primary scale-105' : 'text-slate-400'}`}
    >
      <Navigation size={22} strokeWidth={activeTab === 'route' ? 2.5 : 2} />
      <span className="text-[9px] font-bold uppercase tracking-widest">{t.safeRoute}</span>
    </button>
    
    <div className="relative -mt-10">
      <button 
        onClick={() => setActiveTab('report')}
        className="w-14 h-14 rounded-2xl bg-accent glow-accent text-white shadow-xl active:scale-90 transition-all flex items-center justify-center"
      >
        <AlertTriangle size={24} />
      </button>
    </div>

    <button 
      onClick={() => setActiveTab('alerts')}
      className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'alerts' ? 'text-primary scale-105' : 'text-slate-400'}`}
    >
      <Bell size={22} strokeWidth={activeTab === 'alerts' ? 2.5 : 2} />
      <span className="text-[9px] font-bold uppercase tracking-widest">{t.alerts}</span>
    </button>

    <button 
      onClick={() => setActiveTab('settings')}
      className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'settings' ? 'text-primary scale-105' : 'text-slate-400'}`}
    >
      <SettingsIcon size={22} strokeWidth={activeTab === 'settings' ? 2.5 : 2} />
      <span className="text-[9px] font-bold uppercase tracking-widest">Menu</span>
    </button>
  </nav>
);

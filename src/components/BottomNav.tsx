import React from 'react';
import { Home, AlertTriangle, User } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (t: string) => void;
  t: any;
}

export const BottomNav = ({ activeTab, setActiveTab, t }: BottomNavProps) => (
  <nav
    className="fixed bottom-0 left-0 right-0 glass border-t border-slate-200 flex items-center justify-around px-10 z-50"
    style={{
      // Reserve space for the Android/iOS gesture nav bar
      paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
      paddingTop: 12,
      minHeight: 64,
    }}
  >
    {/* Acasă */}
    <button
      onClick={() => setActiveTab('home')}
      className={`flex flex-col items-center gap-1 transition-all duration-300 ${
        activeTab === 'home' ? 'text-primary scale-105' : 'text-slate-400'
      }`}
    >
      <Home size={22} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
      <span className="text-[9px] font-bold uppercase tracking-widest">Acasă</span>
    </button>

    {/* Raportează (centru, ridicat) */}
    <div className="relative" style={{ marginBottom: 'env(safe-area-inset-bottom)', marginTop: -28 }}>
      <button
        onClick={() => setActiveTab('report')}
        className="w-14 h-14 rounded-2xl bg-accent glow-accent text-white shadow-xl active:scale-90 transition-all flex items-center justify-center"
      >
        <AlertTriangle size={24} />
      </button>
    </div>

    {/* Cont */}
    <button
      onClick={() => setActiveTab('alerts')}
      className={`flex flex-col items-center gap-1 transition-all duration-300 ${
        activeTab === 'alerts' || activeTab === 'settings' ? 'text-primary scale-105' : 'text-slate-400'
      }`}
    >
      <User size={22} strokeWidth={activeTab === 'alerts' || activeTab === 'settings' ? 2.5 : 2} />
      <span className="text-[9px] font-bold uppercase tracking-widest">Cont</span>
    </button>
  </nav>
);
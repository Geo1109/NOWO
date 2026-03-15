import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BellRing, X, PhoneCall, Check, Clock } from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

interface EmergencyButtonProps {
  t: any;
  userLocation: [number, number] | null;
  onTimerActive?: (active: boolean) => void;
}

async function showLocalNotification(title: string, body: string) {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.schedule({ notifications: [{ title, body, id: Date.now() % 2_000_000_000, schedule: { at: new Date(Date.now() + 300) }, sound: 'default', smallIcon: 'ic_stat_icon_config_sample', iconColor: '#ef4444' }] });
    } catch (e) { console.error(e); }
  } else {
    if (Notification.permission === 'granted') new Notification(title, { body, icon: '/icon.png' });
  }
}

async function requestPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const { display } = await LocalNotifications.requestPermissions();
    return display === 'granted';
  }
  return (await Notification.requestPermission()) === 'granted';
}

const PRESETS = [5, 15, 30];

export const EmergencyButton = ({ t, userLocation, onTimerActive }: EmergencyButtonProps) => {
  const [isExpanded, setIsExpanded]     = useState(false);
  const [customTime, setCustomTime]     = useState('');
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [awaitingConf, setAwaitingConf] = useState(false);
  const [sending, setSending]           = useState(false);
  const [sent, setSent]                 = useState(false);
  const timerRef   = useRef<NodeJS.Timeout | null>(null);
  const confirmRef = useRef<NodeJS.Timeout | null>(null);

  const user     = auth.currentUser;
  const isActive = timerSeconds !== null || awaitingConf || sent;

  useEffect(() => { onTimerActive?.(isActive); }, [isActive]);

  useEffect(() => {
    if (timerSeconds === null) return;
    if (timerSeconds <= 0) {
      clearInterval(timerRef.current!);
      setTimerSeconds(null); setAwaitingConf(true); setIsExpanded(true);
      showLocalNotification('⏰ Timer SafeWalk expirat', 'Ai ajuns? Alertă automată în 15s.');
      confirmRef.current = setTimeout(() => sendAlert(), 15000);
      return;
    }
    timerRef.current = setInterval(() => setTimerSeconds(p => (p !== null ? p - 1 : null)), 1000);
    return () => clearInterval(timerRef.current!);
  }, [timerSeconds]);

  const startTimer = async (mins: number) => {
    if (!mins || mins <= 0) return;
    await requestPermission();
    const secs = mins * 60;
    setTotalSeconds(secs); setTimerSeconds(secs); setIsExpanded(false);
    showLocalNotification('🚶 Timer SafeWalk pornit', `Alertă automată în ${mins} minute.`);
  };

  const stopTimer = () => {
    clearInterval(timerRef.current!); clearTimeout(confirmRef.current!);
    setTimerSeconds(null); setTotalSeconds(0); setAwaitingConf(false); setSent(false); setCustomTime('');
  };

  const sendAlert = async () => {
    clearTimeout(confirmRef.current!); setAwaitingConf(false);
    if (!user) { stopTimer(); return; }
    setSending(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const contacts: { name: string; phone?: string; uid?: string }[] = userDoc.data()?.emergencyContacts || [];
      const lat = userLocation?.[0], lng = userLocation?.[1];
      const mapsLink = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : 'locație indisponibilă';
      const message = `🚨 ALERTĂ SafeWalk\n${user.displayName || 'Un utilizator'} are nevoie de ajutor!\nLocație: ${mapsLink}`;
      const phoneContacts = contacts.filter(c => c.phone && !c.uid);
      if (phoneContacts.length > 0)
        window.open(`sms:${phoneContacts.map(c => c.phone).join(',')}?body=${encodeURIComponent(message)}`, '_blank');
      for (const contact of contacts.filter(c => c.uid))
        await updateDoc(doc(db, 'users', contact.uid!), { incomingAlerts: arrayUnion({ from: user.displayName || user.email, fromUid: user.uid, location: { lat, lng }, mapsLink, timestamp: new Date().toISOString(), read: false }) });
      setSent(true);
    } catch (e) { console.error(e); }
    finally { setSending(false); stopTimer(); }
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  const progress = timerSeconds !== null && totalSeconds ? timerSeconds / totalSeconds : 0;

  return (
    <div className="fixed top-24 right-6 z-40 flex flex-col items-end gap-3">

      {/* Bell button — replaces Shield */}
      <button onClick={() => setIsExpanded(!isExpanded)}
        className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 relative"
        style={{ background: isActive ? '#ef4444' : 'white', border: isActive ? 'none' : '1.5px solid #fecaca', boxShadow: isActive ? '0 4px 20px rgba(239,68,68,0.4)' : '0 2px 12px rgba(0,0,0,0.1)' }}>
        {timerSeconds !== null && (
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
            <circle cx="24" cy="24" r="20" fill="none" stroke="white" strokeWidth="3"
              strokeDasharray={2 * Math.PI * 20} strokeDashoffset={2 * Math.PI * 20 * (1 - progress)} strokeLinecap="round" />
          </svg>
        )}
        <BellRing size={20} style={{ color: isActive ? 'white' : '#ef4444', position: 'relative', zIndex: 1 }} />
        {isActive && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
          </span>
        )}
      </button>

      {/* Timer badge */}
      {timerSeconds !== null && !isExpanded && (
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
          style={{ background: '#ef4444', boxShadow: '0 2px 8px rgba(239,68,68,0.4)' }}>
          {fmt(timerSeconds)}
        </motion.div>
      )}

      {/* Panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="bg-white rounded-3xl shadow-2xl overflow-hidden"
            style={{ border: '1.5px solid #fee2e2', width: 'min(252px, calc(100vw - 60px))' }}>

            <div className="flex items-center justify-between px-4 pt-4 pb-3"
              style={{ background: isActive ? '#ef4444' : '#fff1f2' }}>
              <div className="min-w-0 flex-1 mr-2">
                <p className="text-[9px] uppercase font-bold tracking-widest truncate"
                  style={{ color: isActive ? 'rgba(255,255,255,0.7)' : '#f87171' }}>Urgență</p>
                <h4 className="font-bold text-sm truncate" style={{ color: isActive ? 'white' : '#991b1b' }}>
                  {awaitingConf ? 'Ai ajuns?' : timerSeconds !== null ? 'Timer activ' : sent ? 'Alertă trimisă' : 'Timer de siguranță'}
                </h4>
              </div>
              <button onClick={() => setIsExpanded(false)}
                className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: isActive ? 'rgba(255,255,255,0.2)' : '#f1f5f9' }}>
                <X size={14} style={{ color: isActive ? 'white' : '#64748b' }} />
              </button>
            </div>

            <div className="px-4 py-4 flex flex-col gap-2.5">
              {!timerSeconds && !awaitingConf && !sent && (
                <>
                  {!user && <p className="text-[10px] text-slate-400 text-center">Fă cont pentru a alerta contactele.</p>}
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Cât durează drumul?</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {PRESETS.map(mins => (
                      <button key={mins} onClick={() => startTimer(mins)}
                        className="py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
                        style={{ background: '#fff1f2', color: '#ef4444', border: '1.5px solid #fecaca' }}>
                        {mins} min
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-slate-100" />
                    <span className="text-[9px] text-slate-400 font-semibold whitespace-nowrap">sau manual</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  <div className="flex gap-1.5">
                    <div className="flex-1 flex items-center gap-1.5 px-3 h-10 rounded-xl min-w-0"
                      style={{ background: '#f8fafc', border: `1.5px solid ${customTime ? '#ef4444' : '#e2e8f0'}` }}>
                      <Clock size={12} className="shrink-0" style={{ color: customTime ? '#ef4444' : '#94a3b8' }} />
                      <input type="number" inputMode="numeric" min="1" placeholder="minute" value={customTime}
                        onChange={e => { const v = e.target.value; if (v === '' || (parseInt(v) > 0 && !v.includes('-') && !v.includes('.'))) setCustomTime(v); }}
                        className="flex-1 bg-transparent text-sm focus:outline-none font-bold placeholder:font-normal placeholder:text-slate-400 placeholder:text-xs min-w-0"
                        style={{ color: '#1e293b' }} />
                    </div>
                    <button onClick={() => startTimer(parseInt(customTime))} disabled={!customTime || parseInt(customTime) <= 0}
                      className="shrink-0 px-3 h-10 rounded-xl text-xs font-bold transition-all active:scale-95"
                      style={{ background: customTime && parseInt(customTime) > 0 ? '#ef4444' : '#e2e8f0', color: customTime && parseInt(customTime) > 0 ? 'white' : '#94a3b8' }}>
                      Start
                    </button>
                  </div>
                </>
              )}

              {timerSeconds !== null && (
                <>
                  <div className="flex flex-col items-center py-1">
                    <div className="relative w-20 h-20">
                      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="34" fill="none" stroke="#fee2e2" strokeWidth="6" />
                        <circle cx="40" cy="40" r="34" fill="none" stroke="#ef4444" strokeWidth="6"
                          strokeDasharray={2 * Math.PI * 34} strokeDashoffset={2 * Math.PI * 34 * (1 - progress)} strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-black text-red-500">{fmt(timerSeconds)}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Alertă automată la expirare</p>
                  </div>
                  <button onClick={stopTimer} className="w-full h-10 rounded-xl font-bold text-xs"
                    style={{ background: '#f1f5f9', color: '#1e293b' }}>Am ajuns — oprește</button>
                </>
              )}

              {awaitingConf && (
                <>
                  <div className="text-center py-1">
                    <p className="text-xs font-bold text-red-600">Timer expirat!</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Alertă în 15 secunde.</p>
                  </div>
                  <button onClick={stopTimer} className="w-full h-10 rounded-xl font-bold text-xs active:scale-95"
                    style={{ background: '#10b981', color: 'white' }}>✓ Am ajuns în siguranță</button>
                  {user && (
                    <button onClick={sendAlert} disabled={sending}
                      className="w-full h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95"
                      style={{ background: '#ef4444', color: 'white' }}>
                      {sending ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <><PhoneCall size={12} /> Trimite alertă acum</>}
                    </button>
                  )}
                </>
              )}

              {sent && (
                <>
                  <div className="flex items-center gap-2.5 py-1">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                      <Check size={16} className="text-emerald-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800">Alertă trimisă!</p>
                      <p className="text-[10px] text-slate-400">Contactele au fost notificate.</p>
                    </div>
                  </div>
                  <button onClick={stopTimer} className="w-full h-10 rounded-xl font-bold text-xs"
                    style={{ background: '#f1f5f9', color: '#1e293b' }}>Închide</button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
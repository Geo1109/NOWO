import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, X, PhoneCall, Check, Clock } from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

interface EmergencyButtonProps {
  t: any;
  userLocation: [number, number] | null;
  onTimerActive?: (active: boolean) => void;
}

// ---------------------------------------------------------------------------
// Local notification helper — native on Android, Notification API on web
// ---------------------------------------------------------------------------
async function showLocalNotification(title: string, body: string) {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.schedule({
        notifications: [{
          title,
          body,
          // ID must stay within signed int32 range
          id: Date.now() % 2_000_000_000,
          schedule: { at: new Date(Date.now() + 300) },
          sound: 'default',
          smallIcon: 'ic_stat_icon_config_sample', // must exist in Android res/
          iconColor: '#ef4444',
        }],
      });
    } catch (e) {
      console.error('LocalNotifications.schedule error:', e);
    }
  } else {
    // Web fallback
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon.png' });
    }
  }
}

// Request notification permission (native or web)
async function requestPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const { display } = await LocalNotifications.requestPermissions();
    return display === 'granted';
  }
  const result = await Notification.requestPermission();
  return result === 'granted';
}

async function checkPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const { display } = await LocalNotifications.checkPermissions();
    return display === 'granted';
  }
  return Notification.permission === 'granted';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const EmergencyButton = ({ t, userLocation, onTimerActive }: EmergencyButtonProps) => {
  const [isExpanded, setIsExpanded]             = useState(false);
  const [customTime, setCustomTime]             = useState('');
  const [timerSeconds, setTimerSeconds]         = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds]         = useState(0);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [sending, setSending]                   = useState(false);
  const [sent, setSent]                         = useState(false);
  const timerRef  = useRef<NodeJS.Timeout | null>(null);
  const confirmRef = useRef<NodeJS.Timeout | null>(null);

  const user = auth.currentUser;
  const isActive = timerSeconds !== null || awaitingConfirmation || sent;

  useEffect(() => { onTimerActive?.(isActive); }, [isActive]);

  // Countdown
  useEffect(() => {
    if (timerSeconds === null) return;

    if (timerSeconds <= 0) {
      clearInterval(timerRef.current!);
      setTimerSeconds(null);
      setAwaitingConfirmation(true);
      setIsExpanded(true);

      showLocalNotification(
        '⏰ Timer SafeWalk expirat',
        'Ai ajuns la destinație? Dacă nu răspunzi în 15 secunde, contactele vor fi alertate.',
      );

      confirmRef.current = setTimeout(() => sendAlert(), 15000);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimerSeconds(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timerRef.current!);
  }, [timerSeconds]);

  const startTimer = async () => {
    const mins = parseInt(customTime);
    if (isNaN(mins) || mins <= 0) return;

    // Ensure we have notification permission before starting
    const granted = await requestPermission();
    if (!granted) {
      console.warn('Notification permission not granted — timer will still run but no notification will fire');
    }

    const secs = mins * 60;
    setTotalSeconds(secs);
    setTimerSeconds(secs);
    setIsExpanded(false);

    showLocalNotification(
      '🚶 Timer SafeWalk pornit',
      `Vei fi alertat în ${mins} minute dacă nu confirmi că ai ajuns.`,
    );
  };

  const stopTimer = () => {
    clearInterval(timerRef.current!);
    clearTimeout(confirmRef.current!);
    setTimerSeconds(null);
    setTotalSeconds(0);
    setAwaitingConfirmation(false);
    setSent(false);
    setCustomTime('');
  };

  const sendAlert = async () => {
    clearTimeout(confirmRef.current!);
    setAwaitingConfirmation(false);
    if (!user) { stopTimer(); return; }

    setSending(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const contacts: { name: string; phone?: string; uid?: string }[] = userDoc.data()?.emergencyContacts || [];

      const lat = userLocation?.[0];
      const lng = userLocation?.[1];
      const mapsLink = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : 'locație indisponibilă';
      const message = `🚨 ALERTĂ SafeWalk\n${user.displayName || 'Un utilizator'} are nevoie de ajutor!\nLocație: ${mapsLink}`;

      // SMS for phone-only contacts — window.open works on Android via implicit intent
      const phoneContacts = contacts.filter(c => c.phone && !c.uid);
      if (phoneContacts.length > 0) {
        const numbers = phoneContacts.map(c => c.phone).join(',');
        window.open(`sms:${numbers}?body=${encodeURIComponent(message)}`, '_blank');
      }

      // Firestore → Cloud Function → FCM push for app contacts
      for (const contact of contacts.filter(c => c.uid)) {
        await updateDoc(doc(db, 'users', contact.uid!), {
          incomingAlerts: arrayUnion({
            from: user.displayName || user.email,
            fromUid: user.uid,
            location: { lat, lng },
            mapsLink,
            timestamp: new Date().toISOString(),
            read: false,
          }),
        });
      }
      setSent(true);
    } catch (e) {
      console.error('Alert error:', e);
    } finally {
      setSending(false);
      stopTimer();
    }
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const progress = timerSeconds !== null && totalSeconds ? timerSeconds / totalSeconds : 0;

  return (
    <div className="fixed top-24 right-6 z-40 flex flex-col items-end gap-3">

      {/* Shield button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 relative"
        style={{
          background: isActive ? '#ef4444' : 'white',
          border: isActive ? 'none' : '1.5px solid #fecaca',
          boxShadow: isActive ? '0 4px 20px rgba(239,68,68,0.4)' : '0 2px 12px rgba(0,0,0,0.1)',
        }}
      >
        {timerSeconds !== null && (
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
            <circle cx="24" cy="24" r="20" fill="none" stroke="white" strokeWidth="3"
              strokeDasharray={2 * Math.PI * 20}
              strokeDashoffset={2 * Math.PI * 20 * (1 - progress)}
              strokeLinecap="round"
            />
          </svg>
        )}
        <Shield size={20} style={{ color: isActive ? 'white' : '#ef4444', position: 'relative', zIndex: 1 }} />
        {isActive && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
          </span>
        )}
      </button>

      {/* Timer badge */}
      {timerSeconds !== null && !isExpanded && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
          style={{ background: '#ef4444', boxShadow: '0 2px 8px rgba(239,68,68,0.4)' }}
        >
          {formatTime(timerSeconds)}
        </motion.div>
      )}

      {/* Panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-3xl shadow-2xl w-72 overflow-hidden"
            style={{ border: '1.5px solid #fee2e2' }}
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-4 flex items-center justify-between"
              style={{ background: isActive ? '#ef4444' : '#fff1f2' }}>
              <div>
                <p className="text-[10px] uppercase font-semibold tracking-widest"
                  style={{ color: isActive ? 'rgba(255,255,255,0.7)' : '#f87171' }}>
                  Urgență
                </p>
                <h4 className="font-bold text-base"
                  style={{ color: isActive ? 'white' : '#991b1b' }}>
                  {awaitingConfirmation ? 'Ai ajuns?' : timerSeconds !== null ? 'Timer activ' : sent ? 'Alertă trimisă' : 'Buton de urgență'}
                </h4>
              </div>
              <button onClick={() => setIsExpanded(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: isActive ? 'rgba(255,255,255,0.2)' : 'white' }}>
                <X size={16} style={{ color: isActive ? 'white' : '#94a3b8' }} />
              </button>
            </div>

            <div className="px-5 py-5 flex flex-col gap-3">

              {/* Timer setup */}
              {!timerSeconds && !awaitingConfirmation && !sent && (
                <>
                  {!user && (
                    <p className="text-xs text-slate-400 text-center">
                      Fă cont pentru a alerta contacte. Timer-ul funcționează fără cont.
                    </p>
                  )}
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Cât durează plimbarea?</p>
                  <div className="flex items-center gap-3 px-4 h-14 rounded-2xl"
                    style={{ background: '#f8fafc', border: `1.5px solid ${customTime ? '#ef4444' : '#e2e8f0'}` }}>
                    <Clock size={16} style={{ color: customTime ? '#ef4444' : '#94a3b8' }} className="shrink-0" />
                    <input
                      type="number" inputMode="numeric" pattern="[0-9]*" min="1"
                      placeholder="Ex: 20"
                      value={customTime}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || (parseInt(val) > 0 && !val.includes('-') && !val.includes('.'))) {
                          setCustomTime(val);
                        }
                      }}
                      className="flex-1 bg-transparent text-lg focus:outline-none font-bold placeholder:font-normal placeholder:text-slate-400"
                      style={{ color: '#1e293b' }}
                    />
                    <span className="text-sm font-semibold text-slate-400 shrink-0">minute</span>
                  </div>
                  <button
                    onClick={startTimer}
                    disabled={!customTime || parseInt(customTime) <= 0}
                    className="w-full h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                    style={{
                      background: customTime && parseInt(customTime) > 0 ? '#ef4444' : '#e2e8f0',
                      color: customTime && parseInt(customTime) > 0 ? 'white' : '#94a3b8',
                      boxShadow: customTime && parseInt(customTime) > 0 ? '0 4px 16px rgba(239,68,68,0.3)' : 'none',
                    }}
                  >
                    <Clock size={16} />
                    Pornește timer
                  </button>
                </>
              )}

              {/* Timer running */}
              {timerSeconds !== null && (
                <>
                  <div className="flex flex-col items-center py-2">
                    <div className="relative w-28 h-28">
                      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
                        <circle cx="56" cy="56" r="48" fill="none" stroke="#fee2e2" strokeWidth="8" />
                        <circle cx="56" cy="56" r="48" fill="none" stroke="#ef4444" strokeWidth="8"
                          strokeDasharray={2 * Math.PI * 48}
                          strokeDashoffset={2 * Math.PI * 48 * (1 - progress)}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl font-black text-red-500">{formatTime(timerSeconds)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Alertă automată la expirare</p>
                  </div>
                  <button onClick={stopTimer}
                    className="w-full h-12 rounded-2xl font-bold text-sm"
                    style={{ background: '#f1f5f9', color: '#1e293b' }}>
                    Am ajuns — oprește timer
                  </button>
                </>
              )}

              {/* Awaiting confirmation */}
              {awaitingConfirmation && (
                <>
                  <div className="text-center py-2">
                    <p className="text-sm font-bold text-red-600 mb-1">Timer expirat!</p>
                    <p className="text-xs text-slate-400">Alerta se trimite automat în 15 secunde.</p>
                  </div>
                  <button onClick={stopTimer}
                    className="w-full h-12 rounded-2xl font-bold text-sm active:scale-95"
                    style={{ background: '#10b981', color: 'white', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
                    ✓ Am ajuns în siguranță
                  </button>
                  {user && (
                    <button onClick={sendAlert} disabled={sending}
                      className="w-full h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95"
                      style={{ background: '#ef4444', color: 'white', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' }}>
                      {sending
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <><PhoneCall size={15} /> Trimite alertă acum</>}
                    </button>
                  )}
                </>
              )}

              {/* Sent */}
              {sent && (
                <>
                  <div className="flex items-center gap-3 py-2">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
                      <Check size={20} className="text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">Alertă trimisă!</p>
                      <p className="text-xs text-slate-400">Contactele au fost notificate.</p>
                    </div>
                  </div>
                  <button onClick={stopTimer}
                    className="w-full h-12 rounded-2xl font-bold text-sm"
                    style={{ background: '#f1f5f9', color: '#1e293b' }}>
                    Închide
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, X, PhoneCall, Check, Clock, ChevronRight } from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';

interface EmergencyButtonProps {
  t: any;
  userLocation: [number, number] | null;
  onTimerActive?: (active: boolean) => void; // notifies App to stay on map
}

const PRESET_TIMES = [15, 20, 30]; // minutes

export const EmergencyButton = ({ t, userLocation, onTimerActive }: EmergencyButtonProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Timer
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [customTime, setCustomTime] = useState('');
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const confirmRef = useRef<NodeJS.Timeout | null>(null);

  // Alert
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const user = auth.currentUser;
  const isActive = timerSeconds !== null || awaitingConfirmation || sent;

  // Notify parent to keep map visible when timer is running
  useEffect(() => {
    onTimerActive?.(isActive);
  }, [isActive]);

  // Countdown tick
  useEffect(() => {
    if (timerSeconds === null) return;

    if (timerSeconds <= 0) {
      clearInterval(timerRef.current!);
      setTimerSeconds(null);
      setAwaitingConfirmation(true);
      setIsExpanded(true); // auto-open panel when timer ends
      // Auto-send alert after 15s if no confirmation
      confirmRef.current = setTimeout(() => sendAlert(), 15000);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimerSeconds(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timerRef.current!);
  }, [timerSeconds]);

  const startTimer = () => {
    let mins = selectedTime;
    if (selectedTime === -1) {
      const p = parseInt(customTime);
      if (isNaN(p) || p <= 0) return;
      mins = p;
    }
    if (!mins) return;
    const secs = mins * 60;
    setTotalSeconds(secs);
    setTimerSeconds(secs);
    setIsExpanded(false); // collapse panel, user stays on map
  };

  const stopTimer = () => {
    clearInterval(timerRef.current!);
    clearTimeout(confirmRef.current!);
    setTimerSeconds(null);
    setTotalSeconds(0);
    setAwaitingConfirmation(false);
    setSent(false);
    setSelectedTime(null);
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

      // SMS for phone-only contacts
      const phoneContacts = contacts.filter(c => c.phone && !c.uid);
      if (phoneContacts.length > 0) {
        const numbers = phoneContacts.map(c => c.phone).join(',');
        window.open(`sms:${numbers}?body=${encodeURIComponent(message)}`, '_blank');
      }

      // Firestore notification for app contacts
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

  const progress = timerSeconds !== null && totalSeconds
    ? timerSeconds / totalSeconds
    : 0;

  const radius = 20;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="fixed top-24 right-6 z-40 flex flex-col items-end gap-3">

      {/* Main shield button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 relative"
        style={{
          background: isActive ? '#ef4444' : 'white',
          border: isActive ? 'none' : '1.5px solid #fecaca',
          boxShadow: isActive ? '0 4px 20px rgba(239,68,68,0.4)' : '0 2px 12px rgba(0,0,0,0.1)',
        }}
      >
        {/* Timer ring overlay */}
        {timerSeconds !== null && (
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r={radius} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
            <circle
              cx="24" cy="24" r={radius}
              fill="none" stroke="white" strokeWidth="3"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
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

      {/* Mini timer badge when collapsed */}
      {timerSeconds !== null && !isExpanded && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
          style={{ background: '#ef4444', boxShadow: '0 2px 8px rgba(239,68,68,0.4)' }}
        >
          {formatTime(timerSeconds)}
        </motion.div>
      )}

      {/* Expanded panel */}
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
            <div
              className="px-5 pt-5 pb-4 flex items-center justify-between"
              style={{ background: isActive ? '#ef4444' : '#fff1f2' }}
            >
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
              <button
                onClick={() => setIsExpanded(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: isActive ? 'rgba(255,255,255,0.2)' : 'white' }}
              >
                <X size={16} style={{ color: isActive ? 'white' : '#94a3b8' }} />
              </button>
            </div>

            <div className="px-5 py-5 flex flex-col gap-3">

              {/* ── TIMER SELECTION ── */}
              {!timerSeconds && !awaitingConfirmation && !sent && (
                <>
                  {!user && (
                    <p className="text-xs text-slate-400 text-center mb-1">
                      Fă cont pentru a alerta contacte. Timer-ul funcționează fără cont.
                    </p>
                  )}
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Durată plimbare</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PRESET_TIMES.map(min => (
                      <button
                        key={min}
                        onClick={() => { setSelectedTime(min); setCustomTime(''); }}
                        className="py-2.5 rounded-xl text-xs font-bold transition-all"
                        style={{
                          background: selectedTime === min ? '#ef4444' : '#f8fafc',
                          color: selectedTime === min ? 'white' : '#374151',
                          border: `1.5px solid ${selectedTime === min ? '#ef4444' : '#e2e8f0'}`,
                          boxShadow: selectedTime === min ? '0 4px 12px rgba(239,68,68,0.3)' : 'none',
                        }}
                      >
                        {min} min
                      </button>
                    ))}
                  </div>

                  {/* Custom time input — mobil friendly */}
<div
  className="flex items-center gap-3 px-4 h-12 rounded-2xl transition-all"
  style={{
    background: selectedTime === -1 ? '#fff1f2' : '#f8fafc',
    border: `1.5px solid ${selectedTime === -1 ? '#ef4444' : '#e2e8f0'}`,
  }}
>
  <Clock size={15} style={{ color: selectedTime === -1 ? '#ef4444' : '#94a3b8' }} className="shrink-0" />
  <input
    type="number"
    inputMode="numeric"       // tastatură numerică pe mobil
    pattern="[0-9]*"          // asigură numeric-only
    min={1}                   // nu permite valori mai mici decât 1
    placeholder="Alt număr de minute..."
    value={customTime}
    onChange={e => {
      const val = e.target.value;
      // permite doar numere >=1 sau string gol
      if (val === '' || (parseInt(val) > 0 && !val.includes('-'))) {
        setCustomTime(val);
        setSelectedTime(val ? -1 : null);
      }
    }}
    className="flex-1 bg-transparent text-sm focus:outline-none font-medium"
    style={{ color: selectedTime === -1 ? '#ef4444' : '#374151' }}
  />
  {customTime && (
    <span className="text-xs font-semibold shrink-0" style={{ color: '#ef4444' }}>min</span>
  )}
</div>

                  <button
                    onClick={startTimer}
                    disabled={!selectedTime}
                    className="w-full h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                    style={{
                      background: selectedTime ? '#ef4444' : '#e2e8f0',
                      color: selectedTime ? 'white' : '#94a3b8',
                      boxShadow: selectedTime ? '0 4px 16px rgba(239,68,68,0.3)' : 'none',
                    }}
                  >
                    <Clock size={16} />
                    Pornește timer
                  </button>
                </>
              )}

              {/* ── TIMER RUNNING ── */}
              {timerSeconds !== null && (
                <>
                  {/* Circular progress */}
                  <div className="flex flex-col items-center py-2">
                    <div className="relative w-28 h-28">
                      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
                        <circle cx="56" cy="56" r="48" fill="none" stroke="#fee2e2" strokeWidth="8" />
                        <circle
                          cx="56" cy="56" r="48"
                          fill="none" stroke="#ef4444" strokeWidth="8"
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

                  <button
                    onClick={stopTimer}
                    className="w-full h-12 rounded-2xl font-bold text-sm transition-all active:scale-95"
                    style={{ background: '#f1f5f9', color: '#1e293b' }}
                  >
                    Am ajuns — oprește timer
                  </button>
                </>
              )}

              {/* ── AWAITING CONFIRMATION ── */}
              {awaitingConfirmation && (
                <>
                  <div className="text-center py-2">
                    <p className="text-sm font-bold text-red-600 mb-1">Timer expirat!</p>
                    <p className="text-xs text-slate-400">Alerta se trimite automat în 15 secunde.</p>
                  </div>
                  <button
                    onClick={stopTimer}
                    className="w-full h-12 rounded-2xl font-bold text-sm transition-all active:scale-95"
                    style={{ background: '#10b981', color: 'white', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}
                  >
                    ✓ Am ajuns în siguranță
                  </button>
                  {user && (
                    <button
                      onClick={sendAlert}
                      disabled={sending}
                      className="w-full h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                      style={{ background: '#ef4444', color: 'white', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' }}
                    >
                      {sending
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <><PhoneCall size={15} /> Trimite alertă acum</>
                      }
                    </button>
                  )}
                </>
              )}

              {/* ── SENT ── */}
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
                  <button
                    onClick={stopTimer}
                    className="w-full h-12 rounded-2xl font-bold text-sm"
                    style={{ background: '#f1f5f9', color: '#1e293b' }}
                  >
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
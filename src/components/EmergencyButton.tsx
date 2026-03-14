import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, X } from 'lucide-react';

interface EmergencyButtonProps {
  t: any;
}

export const EmergencyButton = ({ t }: EmergencyButtonProps) => {
  const [active, setActive] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Timer select
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [customTime, setCustomTime] = useState('');

  // Timer state
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Confirmation state
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const confirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startTimer = () => {
    let time = selectedTime;

    if (selectedTime === -1) {
      const parsed = parseInt(customTime);
      if (isNaN(parsed) || parsed <= 0) {
        alert("Introduceți un timp valid!");
        return;
      }
      time = parsed;
    }

    if (!time) return;

    setActive(true);
    setTimerSeconds(time * 60);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);

    timerRef.current = null;
    confirmTimeoutRef.current = null;

    setTimerSeconds(null);
    setAwaitingConfirmation(false);
    setActive(false);
  };

  const sendEmergencyAlert = () => {
    const name = localStorage.getItem("emergencyName");
    const phone = localStorage.getItem("emergencyPhone");

    console.log("ALERT SENT TO:", name, phone);

    alert(`⚠️ Emergency contact ${name} (${phone}) notified!`);

    setAwaitingConfirmation(false);
    setActive(false);
  };

  // Countdown
  useEffect(() => {
    if (timerSeconds === null) return;

    if (timerSeconds <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);

      setTimerSeconds(null);
      setAwaitingConfirmation(true);

      confirmTimeoutRef.current = setTimeout(() => {
        sendEmergencyAlert();
      }, 15000);

      return;
    }

    timerRef.current = setInterval(() => {
      setTimerSeconds(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerSeconds]);

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // Circle progress
  const radius = 72;
  const circumference = 2 * Math.PI * radius;

  const totalSeconds =
    selectedTime === -1
      ? parseInt(customTime || "0") * 60
      : (selectedTime || 0) * 60;

  const progress =
    timerSeconds !== null && totalSeconds
      ? timerSeconds / totalSeconds
      : 0;

  return (
    <div className="fixed top-24 right-6 z-40 flex flex-col items-end gap-3">
      {/* Shield Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 ${
          active
            ? 'bg-danger text-white animate-pulse'
            : 'glass text-danger border-danger/40'
        }`}
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
            className="glass rounded-3xl p-5 shadow-2xl border-danger/10 w-72 flex flex-col items-center"
          >
            {/* Header */}
            <div className="flex items-center justify-between w-full mb-4">
              <h4 className="text-sm font-bold text-danger">{t.emergency}</h4>

              <button
                onClick={() => setIsExpanded(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* TIMER SELECTION */}
            {!timerSeconds && !awaitingConfirmation && (
              <>
                <p className="text-xs text-slate-500 mb-4 text-center">
                  Select a timer duration to start
                </p>

                <div className="flex flex-col gap-2 mb-3 w-full">
                  {[15, 20, 30].map(min => (
                    <button
                      key={min}
                      className={`py-2 rounded-xl text-xs font-bold border ${
                        selectedTime === min
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-900'
                      }`}
                      onClick={() => setSelectedTime(min)}
                    >
                      {min} minutes
                    </button>
                  ))}

                  <button
                    className={`py-2 rounded-xl text-xs font-bold border ${
                      selectedTime === -1
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-900'
                    }`}
                    onClick={() => setSelectedTime(-1)}
                  >
                    Other time
                  </button>

                  {selectedTime === -1 && (
                    <input
                      type="number"
                      placeholder="Enter minutes"
                      value={customTime}
                      onChange={e => setCustomTime(e.target.value)}
                      className="border border-black p-2 rounded w-full text-sm text-black"
                    />
                  )}
                </div>

                <button
                  onClick={startTimer}
                  className="w-full py-3 rounded-xl text-xs font-bold bg-green-600 text-white"
                >
                  Start Timer
                </button>
              </>
            )}

            {/* TIMER RUNNING */}
            {timerSeconds !== null && (
              <>
                <div className="relative w-40 h-40 flex items-center justify-center mb-4">
                  <svg className="w-40 h-40 -rotate-90">
                    <circle
                      stroke="#e5e7eb"
                      strokeWidth="8"
                      fill="transparent"
                      r={radius}
                      cx="80"
                      cy="80"
                    />

                    <circle
                      stroke="red"
                      strokeWidth="8"
                      fill="transparent"
                      r={radius}
                      cx="80"
                      cy="80"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - progress)}
                      strokeLinecap="round"
                    />
                  </svg>

                  <div className="absolute text-xl font-bold text-danger">
                    {formatTime(timerSeconds)}
                  </div>
                </div>

                <button
                  onClick={stopTimer}
                  className="w-full py-3 rounded-xl text-xs font-bold bg-red-600 text-white"
                >
                  Arrived / Stop Timer
                </button>
              </>
            )}

            {/* CONFIRMATION */}
            {awaitingConfirmation && (
              <>
                <p className="text-sm font-bold text-danger text-center mb-3">
                  Timer expired. Did you arrive?
                </p>

                <button
                  onClick={() => {
                    if (confirmTimeoutRef.current)
                      clearTimeout(confirmTimeoutRef.current);

                    setAwaitingConfirmation(false);
                    setActive(false);
                  }}
                  className="w-full py-3 rounded-xl text-xs font-bold bg-green-600 text-white"
                >
                  Arrived
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, X, CheckCircle2, Send } from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

interface AuthScreenProps {
  onSuccess: () => void;
  onClose?: () => void;
}

type Mode = 'login' | 'register' | 'verify';

export const AuthScreen = ({ onSuccess, onClose }: AuthScreenProps) => {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const handleSubmit = async () => {
    setError('');
    if (!email || !password) { setError('Completează toate câmpurile.'); return; }
    if (mode === 'register' && !name) { setError('Introdu numele tău.'); return; }
    if (password.length < 6) { setError('Parola trebuie să aibă minim 6 caractere.'); return; }

    setLoading(true);
    try {
      if (mode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid,
          name,
          email: email.toLowerCase(),
          createdAt: serverTimestamp(),
          emergencyContacts: [],
          emailVerified: false,
        });
        await sendEmailVerification(cred.user);
        setMode('verify');
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        if (!cred.user.emailVerified) {
          setMode('verify');
          return;
        }
        onSuccess();
      }
    } catch (e: any) {
      const messages: Record<string, string> = {
        'auth/email-already-in-use': 'Acest email este deja folosit.',
        'auth/invalid-email': 'Adresă de email invalidă.',
        'auth/wrong-password': 'Parolă incorectă.',
        'auth/user-not-found': 'Nu există cont cu acest email.',
        'auth/too-many-requests': 'Prea multe încercări. Încearcă mai târziu.',
        'auth/invalid-credential': 'Email sau parolă incorectă.',
      };
      setError(messages[e.code] || 'A apărut o eroare. Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  };

  const checkVerified = async () => {
    const user = auth.currentUser;
    if (!user) return;
    await user.reload();
    if (user.emailVerified) {
      onSuccess();
    } else {
      setError('Email-ul nu a fost verificat încă. Verifică inbox-ul.');
    }
  };

  const resendVerification = async () => {
    const user = auth.currentUser;
    if (!user || resendCooldown > 0) return;
    await sendEmailVerification(user);
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  // ── Verify screen ──────────────────────────────────────────
  if (mode === 'verify') {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#4f46e5' }}>
        {onClose && (
          <button onClick={onClose} className="absolute top-14 right-6 w-9 h-9 rounded-full flex items-center justify-center z-10" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <X size={18} className="text-white" />
          </button>
        )}
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 15 }}
            className="w-24 h-24 rounded-3xl flex items-center justify-center mb-8"
            style={{ background: 'rgba(255,255,255,0.15)' }}
          >
            <Mail size={44} className="text-white" />
          </motion.div>
          <h2 className="text-white text-3xl font-bold mb-3">Verifică email-ul</h2>
          <p className="text-white/60 text-base mb-2">Am trimis un link de verificare la</p>
          <p className="text-white font-semibold text-lg mb-10">{email}</p>

          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-rose-300 text-sm mb-4">
              {error}
            </motion.p>
          )}

          <button
            onClick={checkVerified}
            className="w-full h-14 rounded-2xl font-bold text-indigo-700 flex items-center justify-center gap-2 mb-4"
            style={{ background: 'white' }}
          >
            <CheckCircle2 size={20} />
            Am verificat email-ul
          </button>

          <button
            onClick={resendVerification}
            disabled={resendCooldown > 0}
            className="flex items-center gap-2 text-sm font-medium"
            style={{ color: resendCooldown > 0 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.8)' }}
          >
            <Send size={14} />
            {resendCooldown > 0 ? `Retrimite în ${resendCooldown}s` : 'Retrimite email-ul'}
          </button>
        </div>
      </div>
    );
  }

  // ── Main auth screen ───────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden" style={{ background: '#f8fafc' }}>

      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-14 right-6 w-10 h-10 rounded-2xl flex items-center justify-center z-10 bg-white shadow-sm border border-slate-100"
        >
          <X size={18} className="text-slate-500" />
        </button>
      )}

      {/* Top visual */}
      <div
        className="relative overflow-hidden flex flex-col items-center justify-end pb-10 pt-20"
        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', minHeight: '38%' }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
        <div className="absolute top-8 -left-8 w-32 h-32 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', transform: 'translateX(-50%) translateY(50%)' }} />

        {/* Logo */}
        <div className="relative flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(10px)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-white text-2xl font-bold tracking-tight">SafeWalk</h1>
            <p className="text-white/50 text-sm mt-0.5">Fii în siguranță. Oriunde.</p>
          </div>
        </div>
      </div>

      {/* Form card */}
      <div className="flex-1 px-6 pt-6 flex flex-col">
        {/* Tab switcher */}
        <div className="flex bg-slate-100 rounded-2xl p-1 mb-5">
          {(['login', 'register'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: mode === m ? 'white' : 'transparent',
                color: mode === m ? '#1e293b' : '#94a3b8',
                boxShadow: mode === m ? '0 1px 6px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {m === 'login' ? 'Intră în cont' : 'Cont nou'}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-3">
          <AnimatePresence mode="wait">
            {mode === 'register' && (
              <motion.div
                key="name"
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Field icon={<User size={17} />} placeholder="Numele tău" value={name} onChange={setName} />
              </motion.div>
            )}
          </AnimatePresence>

          <Field icon={<Mail size={17} />} placeholder="Email" value={email} onChange={setEmail} type="email" />

          <div className="relative">
            <Field
              icon={<Lock size={17} />}
              placeholder="Parolă"
              value={password}
              onChange={setPassword}
              type={showPassword ? 'text' : 'password'}
            />
            <button
              onClick={() => setShowPassword(p => !p)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-rose-500 text-sm font-medium px-1 mt-2"
          >
            {error}
          </motion.p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full h-14 rounded-2xl font-bold text-white flex items-center justify-center gap-2 mt-5 transition-all active:scale-95"
          style={{
            background: loading ? '#a5b4fc' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            boxShadow: loading ? 'none' : '0 8px 24px rgba(79,70,229,0.35)',
          }}
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              {mode === 'login' ? 'Intră în cont' : 'Creează cont'}
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

function Field({ icon, placeholder, value, onChange, type = 'text' }: {
  icon: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 h-14 rounded-2xl bg-white" style={{ border: '1.5px solid #e2e8f0' }}>
      <span className="text-slate-400 shrink-0">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-transparent text-sm text-slate-800 font-medium focus:outline-none placeholder:text-slate-400"
        autoComplete={type === 'password' ? 'current-password' : type === 'email' ? 'email' : 'name'}
      />
    </div>
  );
}
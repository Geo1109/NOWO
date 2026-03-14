import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, X, CheckCircle2, Send, Shield } from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
} from 'firebase/auth';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, requestNotificationPermission } from '../firebase';

interface AuthScreenProps {
  onSuccess: () => void;
  onClose?: () => void;
}

type Mode = 'login' | 'register' | 'verify';

// Same blue as the app's primary color
const PRIMARY = '#3b82f6';

export const AuthScreen = ({ onSuccess, onClose }: AuthScreenProps) => {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const saveTokenToFirestore = async (uid: string) => {
    try {
      const token = await requestNotificationPermission();
      if (token) {
        await updateDoc(doc(db, 'users', uid), { fcmToken: token });
      }
    } catch (e) {
      console.warn('Could not save FCM token:', e);
    }
  };

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
          incomingAlerts: [],
        });
        await sendEmailVerification(cred.user);
        await saveTokenToFirestore(cred.user.uid);
        setMode('verify');
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        if (!cred.user.emailVerified) {
          setMode('verify');
          return;
        }
        await saveTokenToFirestore(cred.user.uid);
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
    setLoading(true);
    await user.reload();
    if (user.emailVerified) {
      await saveTokenToFirestore(user.uid);
      onSuccess();
    } else {
      setError('Email-ul nu a fost verificat încă.');
    }
    setLoading(false);
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

  // ── Verify screen ──────────────────────────────
  if (mode === 'verify') {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: PRIMARY }}>
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
          <p className="text-white/60 text-base mb-1">Am trimis un link la</p>
          <p className="text-white font-semibold text-lg mb-10">{email}</p>

          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-white/70 text-sm mb-4 bg-white/10 px-4 py-2 rounded-xl">
              {error}
            </motion.p>
          )}

          <button
            onClick={checkVerified}
            disabled={loading}
            className="w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2 mb-4 transition-all active:scale-95"
            style={{ background: 'white', color: PRIMARY }}
          >
            {loading
              ? <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: PRIMARY, borderTopColor: 'transparent' }} />
              : <><CheckCircle2 size={20} />Am verificat email-ul</>
            }
          </button>

          <button
            onClick={resendVerification}
            disabled={resendCooldown > 0}
            className="flex items-center gap-2 text-sm font-medium"
            style={{ color: resendCooldown > 0 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)' }}
          >
            <Send size={14} />
            {resendCooldown > 0 ? `Retrimite în ${resendCooldown}s` : 'Retrimite email-ul'}
          </button>
        </div>
      </div>
    );
  }

  // ── Main auth screen ───────────────────────────
  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white">

      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-14 right-6 w-10 h-10 rounded-2xl flex items-center justify-center z-10 bg-slate-100"
        >
          <X size={18} className="text-slate-500" />
        </button>
      )}

      {/* Header — same blue as app */}
      <div
        className="relative overflow-hidden flex flex-col items-center justify-end pb-8 pt-20"
        style={{ background: PRIMARY, minHeight: '36%' }}
      >
        {/* Subtle decorative circles */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="absolute top-6 -left-6 w-28 h-28 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />

        <div className="relative flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <Shield size={28} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-white text-2xl font-bold tracking-tight">SafeWalk</h1>
            <p className="text-white/50 text-sm mt-0.5">Fii în siguranță. Oriunde.</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 px-6 pt-6 flex flex-col">
        {/* Tabs */}
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

        <div className="flex flex-col gap-3">
          <AnimatePresence mode="wait">
            {mode === 'register' && (
              <motion.div key="name" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <Field icon={<User size={17} />} placeholder="Numele tău" value={name} onChange={setName} primary={PRIMARY} />
              </motion.div>
            )}
          </AnimatePresence>

          <Field icon={<Mail size={17} />} placeholder="Email" value={email} onChange={setEmail} type="email" primary={PRIMARY} />

          <div className="relative">
            <Field icon={<Lock size={17} />} placeholder="Parolă" value={password} onChange={setPassword} type={showPassword ? 'text' : 'password'} primary={PRIMARY} />
            <button onClick={() => setShowPassword(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        {error && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-rose-500 text-sm font-medium px-1 mt-2">
            {error}
          </motion.p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full h-14 rounded-2xl font-bold text-white flex items-center justify-center gap-2 mt-5 transition-all active:scale-95"
          style={{
            background: loading ? '#93c5fd' : PRIMARY,
            boxShadow: loading ? 'none' : `0 8px 24px ${PRIMARY}55`,
          }}
        >
          {loading
            ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <>{mode === 'login' ? 'Intră în cont' : 'Creează cont'}<ArrowRight size={18} /></>
          }
        </button>
      </div>
    </div>
  );
};

function Field({ icon, placeholder, value, onChange, type = 'text', primary }: {
  icon: React.ReactNode; placeholder: string; value: string;
  onChange: (v: string) => void; type?: string; primary: string;
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
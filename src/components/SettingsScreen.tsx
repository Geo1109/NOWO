import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, User, Search, Trash2, LogOut, Bell, UserCheck, UserPlus, AlertTriangle, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { auth, db, requestNotificationPermission } from '../firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';

interface SettingsScreenProps {
  onClose: () => void;
  t: any;
  onOpenMenu?: () => void;
}

interface Contact {
  uid: string;
  name: string;
  email: string;
}

interface IncomingAlert {
  from: string;
  fromUid: string;
  mapsLink: string;
  timestamp: string;
  read: boolean;
}

const PRIMARY = '#3b82f6';

// ---------------------------------------------------------------------------
// Preferences helpers — wraps @capacitor/preferences with a localStorage
// fallback so the same code works on web without changes.
// ---------------------------------------------------------------------------
async function getPref(key: string): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key });
    return value;
  }
  return localStorage.getItem(key);
}

async function setPref(key: string, value: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key, value });
  } else {
    localStorage.setItem(key, value);
  }
}

// ---------------------------------------------------------------------------
// Notification permission helpers
// ---------------------------------------------------------------------------
type PermState = 'granted' | 'denied' | 'prompt';

async function getNotifPermission(): Promise<PermState> {
  if (Capacitor.isNativePlatform()) {
    const { display } = await LocalNotifications.checkPermissions();
    // Capacitor returns 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'
    if (display === 'granted') return 'granted';
    if (display === 'denied')  return 'denied';
    return 'prompt';
  }
  // Web
  return (Notification.permission ?? 'prompt') as PermState;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const SettingsScreen = ({ onClose, t, onOpenMenu }: SettingsScreenProps) => {
  const user = auth.currentUser;

  // Prefs are loaded asynchronously — start with safe defaults
  const [alertNearMe, setAlertNearMe]       = useState(false);
  const [notifyFlagged, setNotifyFlagged]   = useState(false);
  const [shakeEmergency, setShakeEmergency] = useState(false);
  const [notifPermission, setNotifPermission] = useState<PermState>('prompt');
  const [adminActive, setAdminActive]       = useState(false);
  const [showAdminInput, setShowAdminInput] = useState(false);
  const [adminCodeInput, setAdminCodeInput] = useState('');
  const [adminError, setAdminError]         = useState('');

  // Secret admin code — change this to whatever you want
  const ADMIN_CODE = 'nowo2024admin';
  const [prefsLoaded, setPrefsLoaded]   = useState(false);

  const [contacts, setContacts]           = useState<Contact[]>([]);
  const [incomingAlerts, setIncomingAlerts] = useState<IncomingAlert[]>([]);
  const [searchEmail, setSearchEmail]     = useState('');
  const [searchResult, setSearchResult]   = useState<Contact | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError]     = useState('');

  // ── Load persisted prefs on mount ────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [alertVal, flaggedVal, shakeVal, adminVal] = await Promise.all([
        getPref('alertNearMe'),
        getPref('notifyFlagged'),
        getPref('shakeEmergency'),
        getPref('adminMode'),
      ]);
      setAlertNearMe(alertVal === 'true');
      setNotifyFlagged(flaggedVal === 'true');
      setShakeEmergency(shakeVal === 'true');
      setAdminActive(adminVal === 'true');
      setPrefsLoaded(true);

      // Check current notification permission
      const perm = await getNotifPermission();
      setNotifPermission(perm);
    };
    load();
  }, []);

  // ── Persist alertNearMe whenever it changes (after initial load) ─────────
  useEffect(() => {
    if (!prefsLoaded) return;
    setPref('alertNearMe', String(alertNearMe));
    if (user) {
      updateDoc(doc(db, 'users', user.uid), { alertNearMe }).catch(() => {});
    }
  }, [alertNearMe, prefsLoaded]);

  // ── Persist notifyFlagged whenever it changes (after initial load) ────────
  useEffect(() => {
    if (!prefsLoaded) return;
    setPref('notifyFlagged', String(notifyFlagged));
    if (user) {
      updateDoc(doc(db, 'users', user.uid), { notifyFlagged }).catch(() => {});
    }
  }, [notifyFlagged, prefsLoaded]);

  useEffect(() => {
    if (!prefsLoaded) return;
    setPref('shakeEmergency', String(shakeEmergency));
  }, [shakeEmergency, prefsLoaded]);

  useEffect(() => {
    if (!prefsLoaded) return;
    setPref('adminMode', String(adminActive));
  }, [adminActive, prefsLoaded]);

  // ── Load contacts + incoming alerts ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) {
        setContacts(snap.data()?.emergencyContacts || []);
        setIncomingAlerts((snap.data()?.incomingAlerts || []).filter((a: IncomingAlert) => !a.read));
      }
    });
  }, [user]);

  // ── Enable push notifications ─────────────────────────────────────────────
  const enableNotifications = async () => {
    if (Capacitor.isNativePlatform()) {
      // Request native permission via LocalNotifications, then get FCM token
      const { display } = await LocalNotifications.requestPermissions();
      const granted = display === 'granted';
      setNotifPermission(granted ? 'granted' : 'denied');

      if (granted) {
        // Also register for remote push (FCM token)
        const token = await requestNotificationPermission();
        if (token && user) {
          await updateDoc(doc(db, 'users', user.uid), { fcmToken: token });
        }
      }
    } else {
      // Web path
      const token = await requestNotificationPermission();
      setNotifPermission(Notification.permission as PermState);
      if (token && user) {
        await updateDoc(doc(db, 'users', user.uid), { fcmToken: token });
      }
    }
  };

  const searchUser = async () => {
    if (!searchEmail.trim()) return;
    setSearchLoading(true);
    setSearchError('');
    setSearchResult(null);
    try {
      if (searchEmail.toLowerCase() === user?.email?.toLowerCase()) {
        setSearchError('Nu te poți adăuga pe tine însuți.');
        return;
      }
      const q = query(collection(db, 'users'), where('email', '==', searchEmail.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) {
        setSearchError('Nu există niciun utilizator cu acest email.');
      } else {
        const data = snap.docs[0].data();
        if (contacts.some(c => c.uid === data.uid)) {
          setSearchError('Acest contact e deja adăugat.');
        } else {
          setSearchResult({ uid: data.uid, name: data.name, email: data.email });
        }
      }
    } catch { setSearchError('Eroare la căutare.'); }
    finally { setSearchLoading(false); }
  };

  const addContact = async (contact: Contact) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), { emergencyContacts: arrayUnion(contact) });
    setContacts(prev => [...prev, contact]);
    setSearchEmail('');
    setSearchResult(null);
  };

  const removeContact = async (contact: Contact) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), { emergencyContacts: arrayRemove(contact) });
    setContacts(prev => prev.filter(c => c.uid !== contact.uid));
  };

  const markAlertRead = async (alert: IncomingAlert) => {
    if (!user) return;
    const allAlerts = (await getDoc(doc(db, 'users', user.uid))).data()?.incomingAlerts || [];
    const updated = allAlerts.map((a: IncomingAlert) =>
      a.timestamp === alert.timestamp ? { ...a, read: true } : a
    );
    await updateDoc(doc(db, 'users', user.uid), { incomingAlerts: updated });
    setIncomingAlerts(prev => prev.filter(a => a.timestamp !== alert.timestamp));
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      className="fixed inset-0 z-[60] bg-white flex flex-col"
    >
      {/* Header */}
      <div className="px-6 pt-14 pb-4 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="w-10 h-10 rounded-2xl flex items-center justify-center bg-slate-100">
            <ChevronLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Setări & Alerte</h2>
            {user && <p className="text-xs text-slate-400">{user.displayName} · {user.email}</p>}
          </div>
        </div>
        {user && (
          <button
            onClick={async () => { await signOut(auth); onClose(); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-500 bg-rose-50"
          >
            <LogOut size={14} />
            Ieși
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6 pb-32">

        {/* Incoming alerts */}
        {incomingAlerts.length > 0 && (
          <Section title="🚨 Alerte primite">
            {incomingAlerts.map((alert, i) => (
              <div key={i} className="p-4 rounded-2xl flex items-start justify-between gap-3"
                style={{ background: '#fff1f2', border: '1.5px solid #fecaca' }}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                    <AlertTriangle size={16} className="text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{alert.from} are nevoie de ajutor!</p>
                    <a href={alert.mapsLink} target="_blank" rel="noreferrer"
                      className="text-xs font-semibold underline" style={{ color: PRIMARY }}>
                      Vezi locația pe hartă
                    </a>
                  </div>
                </div>
                <button onClick={() => markAlertRead(alert)} className="text-xs text-slate-400 shrink-0 mt-1">✕</button>
              </div>
            ))}
          </Section>
        )}

        {/* Notificări push */}
        <Section title="Notificări">
          {notifPermission !== 'granted' && (
            <button
              onClick={enableNotifications}
              className="w-full p-4 rounded-2xl flex items-center gap-3 text-left transition-all active:scale-95"
              style={{ background: `${PRIMARY}10`, border: `1.5px solid ${PRIMARY}30` }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: PRIMARY }}>
                <Bell size={16} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Activează notificările</p>
                <p className="text-xs text-slate-400">Primești alerte despre zone periculoase</p>
              </div>
            </button>
          )}

          <Toggle
            label="Notifică contactele de urgență"
            sublabel="Contactele tale primesc push notification când trimiți o alertă"
            value={alertNearMe}
            onChange={setAlertNearMe}
            primary={PRIMARY}
          />
          <Toggle
            label="Alertă la zonă periculoasă"
            sublabel="Primești notificare când intri într-o zonă raportată (rază 500m)"
            value={notifyFlagged}
            onChange={setNotifyFlagged}
            primary={PRIMARY}
          />
          <Toggle
            label="🆘 Alertă prin scuturare"
            sublabel="Scutură rapid telefonul de 3 ori sau apasă butonul de urgență de 5 ori pentru a alerta contactele automat"
            value={shakeEmergency}
            onChange={setShakeEmergency}
            primary="#ef4444"
          />
        </Section>

        {/* Contacte urgență */}
        <Section title="Contacte de urgență">
          {!user ? (
            <div className="p-4 bg-slate-50 rounded-2xl text-center">
              <p className="text-sm text-slate-500">Creează un cont pentru a adăuga contacte.</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 px-4 h-12 rounded-2xl bg-white" style={{ border: '1.5px solid #e2e8f0' }}>
                  <Search size={15} className="text-slate-400 shrink-0" />
                  <input
                    type="email"
                    inputMode="email"
                    placeholder="Email utilizator SafeWalk..."
                    value={searchEmail}
                    onChange={e => { setSearchEmail(e.target.value); setSearchError(''); setSearchResult(null); }}
                    onKeyDown={e => e.key === 'Enter' && searchUser()}
                    className="flex-1 bg-transparent text-sm text-slate-800 focus:outline-none placeholder:text-slate-400"
                  />
                </div>
                <button
                  onClick={searchUser}
                  disabled={searchLoading || !searchEmail.trim()}
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0"
                  style={{ background: searchEmail.trim() ? PRIMARY : '#e2e8f0' }}
                >
                  {searchLoading
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Search size={15} style={{ color: searchEmail.trim() ? 'white' : '#94a3b8' }} />}
                </button>
              </div>

              {searchError && <p className="text-rose-500 text-xs font-medium px-1">{searchError}</p>}

              <AnimatePresence>
                {searchResult && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-between p-4 rounded-2xl"
                    style={{ background: '#eff6ff', border: `1.5px solid ${PRIMARY}40` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${PRIMARY}20` }}>
                        <User size={16} style={{ color: PRIMARY }} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{searchResult.name}</p>
                        <p className="text-xs text-slate-400">{searchResult.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => addContact(searchResult!)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
                      style={{ background: PRIMARY }}
                    >
                      <UserPlus size={16} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {contacts.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {contacts.map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-4 rounded-2xl"
                      style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                          <UserCheck size={16} className="text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{c.name}</p>
                          <p className="text-xs text-slate-400">{c.email}</p>
                        </div>
                      </div>
                      <button onClick={() => removeContact(c)} className="w-8 h-8 rounded-xl flex items-center justify-center text-rose-400 bg-rose-50">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-2">Niciun contact adăugat încă.</p>
              )}
            </>
          )}
        </Section>

        {/* ── Admin Mode ─────────────────────────────────────────────────── */}
        <Section title="⚙️ Mod Administrator">
          {/* Status card */}
          <div
            className="p-4 rounded-2xl flex items-center justify-between"
            style={{
              background: adminActive ? '#f0fdf4' : '#f8fafc',
              border: `1.5px solid ${adminActive ? '#86efac' : '#e2e8f0'}`,
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: adminActive ? '#dcfce7' : '#f1f5f9' }}>
                {adminActive
                  ? <ShieldCheck size={18} color="#16a34a" />
                  : <ShieldOff size={18} color="#94a3b8" />
                }
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {adminActive ? 'Mod Admin activ' : 'Mod Admin inactiv'}
                </p>
                <p className="text-xs text-slate-400">
                  {adminActive
                    ? 'Fără limită de distanță sau rată de raportare'
                    : 'Introdu codul pentru acces extins'}
                </p>
              </div>
            </div>
            {adminActive ? (
              <button
                onClick={() => { setAdminActive(false); setShowAdminInput(false); }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold"
                style={{ background: '#fee2e2', color: '#ef4444' }}
              >
                Dezactivează
              </button>
            ) : (
              <button
                onClick={() => { setShowAdminInput(v => !v); setAdminError(''); setAdminCodeInput(''); }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold"
                style={{ background: '#e0f2fe', color: '#0284c7' }}
              >
                Activează
              </button>
            )}
          </div>

          {/* Code input */}
          <AnimatePresence>
            {showAdminInput && !adminActive && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} className="overflow-hidden"
              >
                <div className="flex gap-2 mt-1">
                  <div className="flex-1 flex items-center gap-2 px-4 h-12 rounded-2xl bg-white"
                    style={{ border: `1.5px solid ${adminError ? '#fca5a5' : '#e2e8f0'}` }}>
                    <KeyRound size={14} className="text-slate-400 shrink-0" />
                    <input
                      type="password"
                      placeholder="Cod administrator..."
                      value={adminCodeInput}
                      onChange={e => { setAdminCodeInput(e.target.value); setAdminError(''); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (adminCodeInput === ADMIN_CODE) {
                            setAdminActive(true); setShowAdminInput(false);
                          } else {
                            setAdminError('Cod incorect.');
                          }
                        }
                      }}
                      className="flex-1 bg-transparent text-sm text-slate-800 focus:outline-none placeholder:text-slate-400"
                      autoComplete="off"
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (adminCodeInput === ADMIN_CODE) {
                        setAdminActive(true); setShowAdminInput(false);
                      } else {
                        setAdminError('Cod incorect.');
                      }
                    }}
                    className="px-4 h-12 rounded-2xl text-xs font-bold text-white"
                    style={{ background: '#0284c7' }}
                  >
                    OK
                  </button>
                </div>
                {adminError && (
                  <p className="text-xs text-rose-500 font-medium px-1 mt-1">{adminError}</p>
                )}
                <p className="text-[10px] text-slate-400 px-1 mt-1">
                  Când e activ: fără limită de distanță, fără cooldown între rapoarte.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </Section>
      </div>
    </motion.div>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase text-slate-400 font-semibold tracking-widest mb-3">{title}</p>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function Toggle({ label, sublabel, value, onChange, primary }: {
  label: string; sublabel?: string; value: boolean; onChange: (v: boolean) => void; primary: string;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-2xl" style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0' }}>
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className="w-12 h-7 rounded-full relative transition-colors duration-200 shrink-0"
        style={{ background: value ? primary : '#e2e8f0' }}
      >
        <div className="absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all duration-200"
          style={{ left: value ? 'calc(100% - 26px)' : '2px' }} />
      </button>
    </div>
  );
}
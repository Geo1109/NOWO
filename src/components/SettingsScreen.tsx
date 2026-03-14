import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Bell, BellOff, UserPlus, Trash2, Search, Check, LogOut, User } from 'lucide-react';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import {
  doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, query, where, getDocs, serverTimestamp
} from 'firebase/firestore';

interface SettingsScreenProps {
  onClose: () => void;
  t: any;
}

interface Contact {
  uid?: string;
  name: string;
  email?: string;
  phone?: string;
}

export const SettingsScreen = ({ onClose, t }: SettingsScreenProps) => {
  const user = auth.currentUser;

  const [alertNearMe, setAlertNearMe] = useState(() => localStorage.getItem('alertNearMe') === 'true');
  const [notifyFlagged, setNotifyFlagged] = useState(() => localStorage.getItem('notifyFlagged') === 'true');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState<Contact | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { localStorage.setItem('alertNearMe', String(alertNearMe)); }, [alertNearMe]);
  useEffect(() => { localStorage.setItem('notifyFlagged', String(notifyFlagged)); }, [notifyFlagged]);

  // Load contacts from Firestore
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) {
        setContacts(snap.data()?.emergencyContacts || []);
      }
    });
  }, [user]);

  const searchUser = async () => {
    if (!searchEmail.trim()) return;
    setSearchLoading(true);
    setSearchError('');
    setSearchResult(null);
    try {
      const q = query(collection(db, 'users'), where('email', '==', searchEmail.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) {
        setSearchError('Nu există niciun utilizator cu acest email.');
      } else {
        const data = snap.docs[0].data();
        setSearchResult({ uid: data.uid, name: data.name, email: data.email });
      }
    } catch (e) {
      setSearchError('Eroare la căutare.');
    } finally {
      setSearchLoading(false);
    }
  };

  const addContact = async (contact: Contact) => {
    if (!user) return;
    if (contacts.some(c => c.uid === contact.uid || c.email === contact.email)) {
      setSearchError('Acest contact e deja adăugat.');
      return;
    }
    const updated = [...contacts, contact];
    setContacts(updated);
    await updateDoc(doc(db, 'users', user.uid), { emergencyContacts: arrayUnion(contact) });
    setSearchEmail('');
    setSearchResult(null);
  };

  const removeContact = async (contact: Contact) => {
    if (!user) return;
    setContacts(prev => prev.filter(c => c.uid !== contact.uid));
    await updateDoc(doc(db, 'users', user.uid), { emergencyContacts: arrayRemove(contact) });
  };

  const handleLogout = async () => {
    await signOut(auth);
    onClose();
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
      <div className="px-6 pt-14 pb-5 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="w-10 h-10 rounded-2xl flex items-center justify-center bg-slate-100">
            <ChevronLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Setări & Alerte</h2>
            {user && <p className="text-xs text-slate-400">{user.displayName || user.email}</p>}
          </div>
        </div>
        {user && (
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-500 bg-rose-50"
          >
            <LogOut size={14} />
            Ieși
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6 pb-32">

        {/* Notificări */}
        <Section title="Notificări">
          <Toggle
            label={t.alertNearMe}
            sublabel="Rază: 500m"
            value={alertNearMe}
            onChange={setAlertNearMe}
          />
          <Toggle
            label={t.notifyFlagged}
            value={notifyFlagged}
            onChange={setNotifyFlagged}
          />
        </Section>

        {/* Contacte de urgență */}
        <Section title="Contacte de urgență">
          {!user ? (
            <div className="p-4 bg-slate-50 rounded-2xl text-center">
              <p className="text-sm text-slate-500">Creează un cont pentru a adăuga contacte.</p>
            </div>
          ) : (
            <>
              {/* Search by email */}
              <div className="flex gap-2">
                <div
                  className="flex-1 flex items-center gap-2 px-4 h-12 rounded-2xl"
                  style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0' }}
                >
                  <Search size={16} className="text-slate-400 shrink-0" />
                  <input
                    type="email"
                    placeholder="Caută după email..."
                    value={searchEmail}
                    onChange={e => { setSearchEmail(e.target.value); setSearchError(''); setSearchResult(null); }}
                    onKeyDown={e => e.key === 'Enter' && searchUser()}
                    className="flex-1 bg-transparent text-sm text-slate-800 focus:outline-none placeholder:text-slate-400"
                  />
                </div>
                <button
                  onClick={searchUser}
                  disabled={searchLoading}
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold shrink-0"
                  style={{ background: '#4f46e5' }}
                >
                  {searchLoading
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Search size={16} />}
                </button>
              </div>

              {/* Search error */}
              {searchError && (
                <p className="text-rose-500 text-xs font-medium px-1">{searchError}</p>
              )}

              {/* Search result */}
              {searchResult && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-4 rounded-2xl"
                  style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd' }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
                      <User size={16} className="text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{searchResult.name}</p>
                      <p className="text-xs text-slate-400">{searchResult.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => addContact(searchResult!)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
                    style={{ background: '#4f46e5' }}
                  >
                    <UserPlus size={16} />
                  </button>
                </motion.div>
              )}

              {/* Existing contacts */}
              {contacts.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {contacts.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-4 rounded-2xl"
                      style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0' }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                          <User size={16} className="text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{c.name}</p>
                          <p className="text-xs text-slate-400">{c.email || c.phone || 'Contact SafeWalk'}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeContact(c)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-rose-400 bg-rose-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-2">
                  Nu ai contacte de urgență. Caută după email.
                </p>
              )}
            </>
          )}
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

function Toggle({ label, sublabel, value, onChange }: {
  label: string; sublabel?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between p-4 rounded-2xl"
      style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0' }}
    >
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className="w-12 h-7 rounded-full relative transition-colors duration-200"
        style={{ background: value ? '#4f46e5' : '#e2e8f0' }}
      >
        <div
          className="absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all duration-200"
          style={{ left: value ? 'calc(100% - 26px)' : '2px' }}
        />
      </button>
    </div>
  );
}
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles,
  Plus,
  Share2,
  Loader2,
  CheckCircle2,
  Users,
  AlertTriangle,
  LogIn,
  Link as LinkIcon,
  ArrowRight,
  LogOut,
  XCircle,
  Database,
  Camera,
  Image as ImageIcon,
  AlignLeft,
  Upload,
  History,
  Search,
  Clock,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  UserCheck,
  UserX,
  Send,
  MessageSquare,
  Trash2,
  Crown,
  Ban,
  UserPlus,
  MoreVertical
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// Dichiarazione per TypeScript
declare const process: { env: any };

// --- Configurazione Ambiente ---
const JSONBIN_TOKEN = process.env.JSONBIN_TOKEN || "";
const JSONBIN_URL = "https://api.jsonbin.io/v3/b";

// --- Tipi ---
interface User {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  mode?: 'busy' | 'free'; 
}

interface SavedAccount {
  id: string;
  name: string;
  avatar: string;
}

interface EventRecord {
  eventName: string;
  eventDescription?: string;
  eventImage?: string;
  adminId?: string; 
  users: User[];
  unavailableDates: { [date: string]: string[] }; 
  availableDates?: { [date: string]: string[] };   
}

interface HistoryItem {
  id: string;
  name: string;
  lastVisited: number;
}

interface DateGroup {
  startIso: string;
  endIso: string;
  available: number;
  total: number;
}

// --- Costanti UI ---
const COLORS = ['bg-blue-500', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-fuchsia-500'];
const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

// --- Utility per Immagini ---
const processImage = (file: File, maxWidth: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

// --- Utility Date Locali ---
const getLocalISOString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

function App() {
  // Stato Applicazione
  const [view, setView] = useState<'home' | 'event'>('home');
  const [homeMode, setHomeMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error' | 'info'} | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  
  // Chat AI State
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [promptInput, setPromptInput] = useState('');
  
  // Dati Input Evento (Creazione)
  const [inputEventName, setInputEventName] = useState('');
  const [inputEventDesc, setInputEventDesc] = useState('');
  const [inputEventImg, setInputEventImg] = useState<string>('');
  
  // Dati Input Utente (Login/Join)
  const [inputName, setInputName] = useState('');
  const [inputAvatar, setInputAvatar] = useState<string>('');
  const [inputModePreference, setInputModePreference] = useState<'busy' | 'free'>('busy');
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  
  // Dati Evento Caricato
  const [eventName, setEventName] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventImg, setEventImg] = useState('');
  const [adminId, setAdminId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [unavailableDates, setUnavailableDates] = useState<{ [date: string]: string[] }>({});
  const [availableDates, setAvailableDates] = useState<{ [date: string]: string[] }>({});
  
  // Join Input e Storia
  const [joinInput, setJoinInput] = useState('');
  const [eventHistory, setEventHistory] = useState<HistoryItem[]>([]);

  // Dati Utente Corrente (Persistenti)
  const [myId, setMyId] = useState<string | null>(localStorage.getItem('my_id'));
  const [myName, setMyName] = useState(localStorage.getItem('my_name') || '');
  const [myAvatar, setMyAvatar] = useState(localStorage.getItem('my_avatar') || '');
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  
  const [binId, setBinId] = useState<string | null>(new URLSearchParams(window.location.search).get('id'));
  
  // Stato Calendario
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Stato Suggerimenti
  const [expandSuggestions, setExpandSuggestions] = useState(false);

  // Refs e Locks
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const eventImgInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isSaving = useRef(false);

  // Derived state per l'utente corrente nell'evento specifico
  const myUserInEvent = useMemo(() => users.find(u => u.id === myId), [users, myId]);
  const myMode = myUserInEvent?.mode || 'busy';
  const isAdmin = useMemo(() => myId && adminId && myId === adminId, [myId, adminId]);

  // --- Utility History & Accounts ---
  const updateHistory = (id: string, name: string) => {
    const currentHistory: HistoryItem[] = JSON.parse(localStorage.getItem('event_history') || '[]');
    const filtered = currentHistory.filter(h => h.id !== id);
    const newItem = { id, name, lastVisited: Date.now() };
    const newHistory = [newItem, ...filtered].slice(0, 10);
    localStorage.setItem('event_history', JSON.stringify(newHistory));
    setEventHistory(newHistory);
  };

  const loadHistory = () => {
    const h = JSON.parse(localStorage.getItem('event_history') || '[]');
    setEventHistory(h);
  };

  const loadSavedAccounts = () => {
    try {
      const accs = JSON.parse(localStorage.getItem('saved_accounts') || '[]');
      setSavedAccounts(accs);
    } catch (e) {
      setSavedAccounts([]);
    }
  };

  // --- Inizializzazione ---
  useEffect(() => {
    loadSavedAccounts();
    loadHistory();

    let intervalId: any;

    if (binId) {
      setView('event');
      loadEvent(binId);

      intervalId = setInterval(() => {
        // Polling solo se siamo ancora nella view evento e abbiamo un ID
        if (binId) loadEvent(binId, true); 
      }, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [binId]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // --- Gestione Immagini ---
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const base64 = await processImage(e.target.files[0], 150);
        setInputAvatar(base64);
      } catch (err) {
        showToast("Errore caricamento immagine", "error");
      }
    }
  };

  const handleEventImgChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const base64 = await processImage(e.target.files[0], 800);
        setInputEventImg(base64);
      } catch (err) {
        showToast("Errore caricamento immagine", "error");
      }
    }
  };

  // --- Gestione Login/Logout/Account ---
  const handleLogin = () => {
    if (!inputName.trim()) return;
    
    // LOGICA DI MEMORIA: Cerca se esiste già un account salvato LOCALE
    const existingAccounts: SavedAccount[] = JSON.parse(localStorage.getItem('saved_accounts') || '[]');
    const existingAccount = existingAccounts.find(acc => acc.name.toLowerCase() === inputName.trim().toLowerCase());

    let idToUse = "";
    let avatarToUse = inputAvatar;

    if (existingAccount) {
        idToUse = existingAccount.id;
        if (!avatarToUse) avatarToUse = existingAccount.avatar;
    } else {
        idToUse = Math.random().toString(36).substr(2, 9);
    }
    
    localStorage.setItem('my_name', inputName);
    localStorage.setItem('my_avatar', avatarToUse);
    localStorage.setItem('my_id', idToUse);
    
    setMyName(inputName);
    setMyAvatar(avatarToUse);
    setMyId(idToUse);

    // Salva account per il futuro
    let updatedAccounts: SavedAccount[] = [];
    if (existingAccount) {
        updatedAccounts = existingAccounts.map(a => a.id === idToUse ? { ...a, avatar: avatarToUse } : a);
    } else {
        const newAccount: SavedAccount = { id: idToUse, name: inputName, avatar: avatarToUse };
        updatedAccounts = [...existingAccounts, newAccount];
    }
    
    localStorage.setItem('saved_accounts', JSON.stringify(updatedAccounts));
    setSavedAccounts(updatedAccounts);
    
    setIsAddingAccount(false);
    setInputName('');
    setInputAvatar('');
  };

  const loginWithAccount = (acc: SavedAccount) => {
    localStorage.setItem('my_name', acc.name);
    localStorage.setItem('my_avatar', acc.avatar);
    localStorage.setItem('my_id', acc.id);
    
    setMyName(acc.name);
    setMyAvatar(acc.avatar);
    setMyId(acc.id);
  };

  const removeSavedAccount = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = savedAccounts.filter(a => a.id !== id);
    localStorage.setItem('saved_accounts', JSON.stringify(updated));
    setSavedAccounts(updated);
  };

  const handleLogout = () => {
    localStorage.removeItem('my_name');
    localStorage.removeItem('my_id');
    localStorage.removeItem('my_avatar');
    setMyName('');
    setMyId(null);
    setMyAvatar('');
    
    setView('home');
    setHomeMode('menu');
    setShowUserMenu(false);
    loadSavedAccounts();
  };

  // --- API Calls ---
  const loadEvent = async (id: string, silent = false) => {
    if (silent && isSaving.current) return;
    if (!silent) setLoading(true);
    try {
      let data: { record: EventRecord, metadata?: any };
      
      if (JSONBIN_TOKEN) {
        const res = await fetch(`${JSONBIN_URL}/${id}/latest`, {
          headers: { 'X-Master-Key': JSONBIN_TOKEN }
        });
        if (!res.ok) {
             // Se 404/400 o altro errore, assumiamo evento cancellato o inesistente
             if (silent && (res.status === 404 || res.status === 400 || res.status === 403)) {
                throw new Error("EVENT_DELETED");
             }
             throw new Error("Errore fetch");
        }
        data = await res.json();
      } else {
        if (!silent) await new Promise(r => setTimeout(r, 400));
        const localData = localStorage.getItem(`event_${id}`);
        if (!localData) {
            if (silent) throw new Error("EVENT_DELETED");
            throw new Error("Evento non trovato locale");
        }
        data = JSON.parse(localData);
      }

      setEventName(data.record.eventName);
      setEventDesc(data.record.eventDescription || '');
      setEventImg(data.record.eventImage || '');
      setAdminId(data.record.adminId || null);
      
      if (!isSaving.current) {
        // Qui aggiorniamo la lista utenti.
        setUsers(data.record.users || []);
        setUnavailableDates(data.record.unavailableDates || {});
        setAvailableDates(data.record.availableDates || {});
      }
      
      if (!silent) {
        updateHistory(id, data.record.eventName);
        setBinId(id);
        setView('event');
      }
    } catch (e: any) {
      if (e.message === "EVENT_DELETED") {
          // Reset forzato per tutti i partecipanti
          alert("L'evento è stato eliminato dall'amministratore o non esiste più.");
          setBinId(null);
          setView('home');
          const url = new URL(window.location.href);
          url.searchParams.delete('id');
          window.history.pushState({}, '', url.toString());
          return;
      }

      if (!silent) {
        showToast("Evento non trovato o errore di connessione", 'error');
        setBinId(null);
        if (view === 'event') setView('home');
        const url = new URL(window.location.href);
        url.searchParams.delete('id');
        window.history.pushState({}, '', url.toString());
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const syncAndSave = async (modifyFn: (record: EventRecord) => EventRecord): Promise<boolean> => {
    if (!binId) return false;
    isSaving.current = true;
    
    try {
      let currentRecord: EventRecord;
      if (JSONBIN_TOKEN) {
        const res = await fetch(`${JSONBIN_URL}/${binId}/latest`, {
          headers: { 'X-Master-Key': JSONBIN_TOKEN }
        });
        if (!res.ok) throw new Error("Fetch error");
        currentRecord = (await res.json()).record;
      } else {
        const local = JSON.parse(localStorage.getItem(`event_${binId}`) || '{}');
        currentRecord = local.record;
      }

      const updatedRecord = modifyFn(currentRecord);

      if (JSONBIN_TOKEN) {
        await fetch(`${JSONBIN_URL}/${binId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': JSONBIN_TOKEN
          },
          body: JSON.stringify(updatedRecord)
        });
      } else {
         localStorage.setItem(`event_${binId}`, JSON.stringify({ record: updatedRecord, metadata: { id: binId } }));
      }
      
      setUsers(updatedRecord.users);
      setUnavailableDates(updatedRecord.unavailableDates || {});
      setAvailableDates(updatedRecord.availableDates || {});
      setEventName(updatedRecord.eventName);
      setEventDesc(updatedRecord.eventDescription || '');
      setEventImg(updatedRecord.eventImage || '');
      setAdminId(updatedRecord.adminId || null);

      return true;
    } catch (e) {
      console.error(e);
      showToast("Errore di sincronizzazione.", "error");
      loadEvent(binId); 
      return false;
    } finally {
      setTimeout(() => { isSaving.current = false; }, 600);
    }
  };

  const createEvent = async () => {
    if (!inputEventName || !myName) return;
    
    setLoading(true);
    const idToUse = myId || Math.random().toString(36).substr(2, 9);
    // Assicuriamoci che l'ID sia salvato se non lo era
    if (!myId) {
        setMyId(idToUse);
        localStorage.setItem('my_id', idToUse);
    }
    
    const firstUser: User = { 
      id: idToUse, 
      name: myName, 
      color: COLORS[0],
      avatar: myAvatar,
      mode: inputModePreference 
    };

    const payload: EventRecord = { 
      eventName: inputEventName, 
      eventDescription: inputEventDesc, 
      eventImage: inputEventImg,
      adminId: idToUse, 
      users: [firstUser], 
      unavailableDates: {},
      availableDates: {} 
    };
    
    try {
      let newBinId = "";

      if (JSONBIN_TOKEN) {
        const res = await fetch(JSONBIN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': JSONBIN_TOKEN,
            'X-Bin-Private': 'true'
          },
          body: JSON.stringify(payload)
        });
        
        if (!res.ok) throw new Error("Errore creazione");
        const data = await res.json();
        newBinId = data.metadata.id;
      } else {
        await new Promise(r => setTimeout(r, 600));
        newBinId = "local_" + Math.random().toString(36).substr(2, 9);
        localStorage.setItem(`event_${newBinId}`, JSON.stringify({ record: payload, metadata: { id: newBinId } }));
        showToast("Evento creato in locale (Demo Mode)", 'info');
      }
      
      updateHistory(newBinId, inputEventName);
      setBinId(newBinId);
      setEventName(inputEventName);
      setEventDesc(inputEventDesc);
      setEventImg(inputEventImg);
      setAdminId(idToUse);
      setUsers([firstUser]);
      setUnavailableDates({});
      setAvailableDates({});
      
      const url = new URL(window.location.href);
      url.searchParams.set('id', newBinId);
      window.history.pushState({}, '', url.toString());
      setView('event');

    } catch (e: any) {
      showToast(`Errore creazione: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const joinManualEvent = () => {
    let idToJoin = joinInput.trim();
    try {
      const url = new URL(idToJoin);
      const paramId = url.searchParams.get('id');
      if (paramId) idToJoin = paramId;
    } catch (e) { }

    if (idToJoin) loadEvent(idToJoin);
    else showToast("ID o Link non valido", 'error');
  };

  const joinEvent = async () => {
    if (!inputName || !binId) return;

    // --- LOGICA DI JOIN ROBUSTA ---
    // 1. Scarichiamo l'evento fresco per vedere chi c'è
    let currentUsers: User[] = [];
    try {
        let record: EventRecord;
        if (JSONBIN_TOKEN) {
            const res = await fetch(`${JSONBIN_URL}/${binId}/latest`, { headers: { 'X-Master-Key': JSONBIN_TOKEN } });
            if (!res.ok) throw new Error();
            record = (await res.json()).record;
        } else {
            const local = JSON.parse(localStorage.getItem(`event_${binId}`) || '{}');
            record = local.record;
        }
        currentUsers = record.users || [];
    } catch(e) {
        showToast("Errore nel recupero dati evento", 'error');
        return;
    }

    // 2. Controllo Identità: Esiste già un utente con questo nome?
    const existingUser = currentUsers.find(u => u.name.toLowerCase() === inputName.trim().toLowerCase());
    
    let idToUse = myId;
    // Se non ho un ID o se l'ID che ho è diverso da quello nell'evento per il mio nome, uso quello dell'evento (Merge)
    if (existingUser) {
        idToUse = existingUser.id;
    } else if (!idToUse) {
        // Se non esisto e non ho ID, ne creo uno nuovo
        idToUse = Math.random().toString(36).substr(2, 9);
    }
    
    // 3. Aggiorno lo stato locale con l'identità definitiva
    localStorage.setItem('my_name', inputName);
    localStorage.setItem('my_avatar', inputAvatar);
    localStorage.setItem('my_id', idToUse || ''); 
    
    setMyName(inputName);
    setMyAvatar(inputAvatar);
    setMyId(idToUse);

    const newUser = { 
      id: idToUse!, 
      name: inputName, 
      color: COLORS[currentUsers.length % COLORS.length],
      avatar: inputAvatar,
      mode: inputModePreference 
    };
    
    // Aggiornamento Ottimistico UI
    setUsers(prev => {
        const idx = prev.findIndex(u => u.id === idToUse);
        if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = newUser;
            return copy;
        }
        return [...prev, newUser];
    });

    // 4. Salvataggio Remoto
    await syncAndSave((record) => {
       const existingUsers = record.users || [];
       const userIndex = existingUsers.findIndex(u => u.id === idToUse);
       
       let newUsersList = [...existingUsers];
       if (userIndex >= 0) {
           // Aggiorna utente esistente (es. cambio avatar o mode)
           newUsersList[userIndex] = newUser;
       } else {
           // Aggiungi nuovo
           newUsersList.push(newUser);
       }
       return { ...record, users: newUsersList };
    });
    
    showToast(existingUser ? `Bentornato, ${inputName}!` : `Benvenuto, ${inputName}!`, 'success');
  };

  const leaveEvent = async (e?: React.MouseEvent) => {
    e?.preventDefault(); 
    e?.stopPropagation(); 
    if (!myId || !binId) return;
    
    // Controllo sicurezza Admin
    if (adminId === myId) {
      showToast("L'admin deve usare 'Elimina Evento' in fondo alla lista.", 'error');
      return;
    }

    if (!confirm("Sei sicuro di volerti rimuovere da questo evento?")) return;

    setLoading(true);

    // 1. Calcola il nuovo stato LOCALE
    const newUsersList = users.filter(u => u.id !== myId);
    
    // Pulizia date
    const newUnavailableDates = { ...unavailableDates };
    Object.keys(newUnavailableDates).forEach(k => {
      if(Array.isArray(newUnavailableDates[k])) {
        newUnavailableDates[k] = newUnavailableDates[k].filter(id => id !== myId);
        if(newUnavailableDates[k].length === 0) delete newUnavailableDates[k];
      }
    });

    const newAvailableDates = { ...availableDates };
    Object.keys(newAvailableDates).forEach(k => {
      if(Array.isArray(newAvailableDates[k])) {
        newAvailableDates[k] = newAvailableDates[k].filter(id => id !== myId);
        if(newAvailableDates[k].length === 0) delete newAvailableDates[k];
      }
    });

    // 2. APPLICAZIONE IMMEDIATA DELLO STATO LOCALE
    setUsers(newUsersList);
    setUnavailableDates(newUnavailableDates);
    setAvailableDates(newAvailableDates);

    // 3. Sync remoto
    const success = await syncAndSave((record) => {
       const existingUsers = record.users || [];
       const filteredUsers = existingUsers.filter(u => u.id !== myId);

       const recUnavailable = { ...(record.unavailableDates || {}) };
       for(const k in recUnavailable) {
          if (Array.isArray(recUnavailable[k])) {
            recUnavailable[k] = recUnavailable[k].filter(id => id !== myId);
            if(recUnavailable[k].length === 0) delete recUnavailable[k];
          }
       }

       const recAvailable = { ...(record.availableDates || {}) };
       for(const k in recAvailable) {
          if (Array.isArray(recAvailable[k])) {
            recAvailable[k] = recAvailable[k].filter(id => id !== myId);
            if(recAvailable[k].length === 0) delete recAvailable[k];
          }
       }

       return {
         ...record,
         users: filteredUsers,
         unavailableDates: recUnavailable,
         availableDates: recAvailable
       };
    });

    if (success) {
      showToast("Ti sei rimosso dall'evento.", "info");
      // Uscita completa dall'evento (torna alla home)
      setBinId(null);
      setView('home');
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      window.history.pushState({}, '', url.toString());
    } else {
        loadEvent(binId);
    }
    
    setLoading(false);
  };

  const deleteEvent = async () => {
    if (!binId) return;
    if (!confirm("⚠️ SEI L'AMMINISTRATORE ⚠️\n\nVuoi davvero eliminare definitivamente questo evento per tutti? L'azione è irreversibile.")) return;
    
    setLoading(true);
    try {
        if (JSONBIN_TOKEN) {
            await fetch(`${JSONBIN_URL}/${binId}`, {
                method: 'DELETE',
                headers: { 'X-Master-Key': JSONBIN_TOKEN }
            });
        } else {
            localStorage.removeItem(`event_${binId}`);
        }

        showToast("Evento eliminato correttamente.", "success");
        
        // Pulizia cronologia
        const currentHistory = JSON.parse(localStorage.getItem('event_history') || '[]');
        const newHistory = currentHistory.filter((h: any) => h.id !== binId);
        localStorage.setItem('event_history', JSON.stringify(newHistory));
        setEventHistory(newHistory);

        // Reset immediato per fermare il polling
        setBinId(null);
        setView('home');
        const url = new URL(window.location.href);
        url.searchParams.delete('id');
        window.history.pushState({}, '', url.toString());

    } catch(e) {
        showToast("Errore eliminazione evento", "error");
    } finally {
        setLoading(false);
    }
  };

  const joinFromHistory = async (id: string) => {
    if (!myId) return;
    setLoading(true);
    try {
      let record: EventRecord;
      if (JSONBIN_TOKEN) {
        const res = await fetch(`${JSONBIN_URL}/${id}/latest`, { headers: { 'X-Master-Key': JSONBIN_TOKEN } });
        if (!res.ok) throw new Error("Not found");
        record = (await res.json()).record;
      } else {
        const local = localStorage.getItem(`event_${id}`);
        if (!local) throw new Error("Not found");
        record = JSON.parse(local).record;
      }

      // Check duplicati con nome
      const existingUser = record.users.find(u => u.id === myId || u.name.toLowerCase() === myName.toLowerCase());
      
      if (!existingUser) {
        const newUser: User = { 
          id: myId, 
          name: myName, 
          color: COLORS[record.users.length % COLORS.length],
          avatar: myAvatar,
          mode: 'busy' 
        };
        record.users.push(newUser);
        
        if (JSONBIN_TOKEN) {
            await fetch(`${JSONBIN_URL}/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_TOKEN },
              body: JSON.stringify(record)
            });
        } else {
            localStorage.setItem(`event_${id}`, JSON.stringify({ record, metadata: { id } }));
        }
        showToast("Ti sei unito all'evento (Modalità: Assenze)!", 'success');
      } else {
         // Aggiorna ID se necessario (Merge identità)
         if (existingUser.id !== myId) {
             setMyId(existingUser.id);
             localStorage.setItem('my_id', existingUser.id);
         }
      }
      setBinId(id);
      setView('event');
    } catch (e) {
      showToast("Impossibile accedere all'evento (forse è stato eliminato).", 'error');
      const currentHistory = JSON.parse(localStorage.getItem('event_history') || '[]');
      const newHistory = currentHistory.filter((h: any) => h.id !== id);
      localStorage.setItem('event_history', JSON.stringify(newHistory));
      setEventHistory(newHistory);
    } finally {
      setLoading(false);
    }
  };

  // --- Logica Calendario Unificata ---
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();

  const getDayAvailability = (isoDate: string, currentUsers: User[], unavailable: any, available: any) => {
    let count = 0;
    currentUsers.forEach(u => {
      const mode = u.mode || 'busy';
      if (mode === 'busy') {
        const isBusy = (unavailable[isoDate] || []).includes(u.id);
        if (!isBusy) count++;
      } else {
        const isFree = (available[isoDate] || []).includes(u.id);
        if (isFree) count++;
      }
    });
    return count;
  };

  const toggleDate = async (isoDate: string) => {
    if (!myId || !myUserInEvent) {
      showToast("Unisciti all'evento per partecipare", 'error');
      return;
    }

    const mode = myUserInEvent.mode || 'busy';
    
    // Optimistic Update
    if (mode === 'busy') {
      const current = unavailableDates[isoDate] || [];
      const isBusy = current.includes(myId);
      const newDates = { ...unavailableDates };
      if (isBusy) {
        const filtered = current.filter(id => id !== myId);
        if(filtered.length) newDates[isoDate] = filtered; else delete newDates[isoDate];
      } else {
        newDates[isoDate] = [...current, myId];
      }
      setUnavailableDates(newDates);
    } else {
      const current = availableDates[isoDate] || [];
      const isFree = current.includes(myId);
      const newDates = { ...availableDates };
      if (isFree) {
        const filtered = current.filter(id => id !== myId);
        if(filtered.length) newDates[isoDate] = filtered; else delete newDates[isoDate];
      } else {
        newDates[isoDate] = [...current, myId];
      }
      setAvailableDates(newDates);
    }

    // Sync
    await syncAndSave((record) => {
      if (mode === 'busy') {
        const dates = record.unavailableDates || {};
        const dayList = (dates[isoDate] || []).filter(id => id !== myId);
        const wasInList = (dates[isoDate] || []).includes(myId);
        if (!wasInList) dayList.push(myId);
        
        const newD = { ...dates, [isoDate]: dayList };
        if (!dayList.length) delete newD[isoDate];
        return { ...record, unavailableDates: newD };
      } else {
        const dates = record.availableDates || {};
        const dayList = (dates[isoDate] || []).filter(id => id !== myId);
        const wasInList = (dates[isoDate] || []).includes(myId);
        if (!wasInList) dayList.push(myId); 
        
        const newD = { ...dates, [isoDate]: dayList };
        if (!dayList.length) delete newD[isoDate];
        return { ...record, availableDates: newD };
      }
    });
  };

  const setMonthStatus = async (action: 'fill' | 'clear') => {
    if (!myId || !myUserInEvent) return;
    const mode = myUserInEvent.mode || 'busy';
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    // Optimistic
    if (mode === 'busy') {
       const newDates = { ...unavailableDates };
       for (let d = 1; d <= daysInMonth; d++) {
         const iso = getLocalISOString(new Date(year, month, d));
         let list = (newDates[iso] || []).filter(id => id !== myId);
         if (action === 'fill') list.push(myId);
         if (list.length) newDates[iso] = list; else delete newDates[iso];
       }
       setUnavailableDates(newDates);
    } else {
       const newDates = { ...availableDates };
       for (let d = 1; d <= daysInMonth; d++) {
         const iso = getLocalISOString(new Date(year, month, d));
         let list = (newDates[iso] || []).filter(id => id !== myId);
         if (action === 'fill') list.push(myId); 
         if (list.length) newDates[iso] = list; else delete newDates[iso];
       }
       setAvailableDates(newDates);
    }

    await syncAndSave((record) => {
      if (mode === 'busy') {
         const dates = { ...(record.unavailableDates || {}) };
         for (let d = 1; d <= daysInMonth; d++) {
            const iso = getLocalISOString(new Date(year, month, d));
            let list = (dates[iso] || []).filter(id => id !== myId);
            if (action === 'fill') list.push(myId);
            if (list.length) dates[iso] = list; else delete dates[iso];
         }
         return { ...record, unavailableDates: dates };
      } else {
         const dates = { ...(record.availableDates || {}) };
         for (let d = 1; d <= daysInMonth; d++) {
            const iso = getLocalISOString(new Date(year, month, d));
            let list = (dates[iso] || []).filter(id => id !== myId);
            if (action === 'fill') list.push(myId);
            if (list.length) dates[iso] = list; else delete dates[iso];
         }
         return { ...record, availableDates: dates };
      }
    });
    
    let msg = "";
    if (mode === 'busy') msg = action === 'fill' ? "Segnato occupato tutto il mese" : "Segnato libero tutto il mese";
    else msg = action === 'fill' ? "Segnato presente tutto il mese" : "Rimossa presenza tutto il mese";
    showToast(msg, 'info');
  };

  const bestDates = useMemo(() => {
    if (users.length === 0) return [];
    
    // Reset hours to avoid timezone shifting issues during loop
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rawList = [];
    // Esteso a 180 giorni (6 mesi) per coprire meglio le date future
    for (let i = 0; i < 180; i++) {
      const d = new Date(today); 
      d.setDate(today.getDate() + i);
      const iso = getLocalISOString(d);
      const available = getDayAvailability(iso, users, unavailableDates, availableDates);
      
      // Filtra date con 0 disponibilità se ci sono utenti
      if (users.length > 0 && available === 0) continue;
      
      rawList.push({ iso, available, total: users.length, dateObj: d });
    }

    const groups: DateGroup[] = [];
    let currentGroup: DateGroup | null = null;

    for (const item of rawList) {
      let isConsecutive = false;
      if (currentGroup) {
        const [ly, lm, ld] = currentGroup.endIso.split('-').map(Number);
        const lastDate = new Date(ly, lm - 1, ld);
        
        const nextExpectedDate = new Date(lastDate);
        nextExpectedDate.setDate(lastDate.getDate() + 1);
        const nextExpectedIso = getLocalISOString(nextExpectedDate);
        
        if (nextExpectedIso === item.iso && currentGroup.available === item.available) {
          isConsecutive = true;
        }
      }

      if (isConsecutive && currentGroup) {
        currentGroup.endIso = item.iso;
      } else {
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          startIso: item.iso,
          endIso: item.iso,
          available: item.available,
          total: item.total
        };
      }
    }
    if (currentGroup) groups.push(currentGroup);

    return groups.sort((a, b) => {
      if (b.available !== a.available) {
        return b.available - a.available;
      }
      return a.startIso.localeCompare(b.startIso);
    });
  }, [users, unavailableDates, availableDates]);

  const formatGroupDate = (group: DateGroup) => {
    const parseLocalIso = (iso: string) => {
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d);
    };

    const dStart = parseLocalIso(group.startIso);
    const dEnd = parseLocalIso(group.endIso);
    
    const optionsStart: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
    
    if (group.startIso === group.endIso) {
      return dStart.toLocaleDateString('it-IT', optionsStart);
    } else {
      const strStart = dStart.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' });
      const strEnd = dEnd.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
      return `${strStart} - ${strEnd}`;
    }
  };

  const handleSendPrompt = async () => {
    if (!promptInput.trim()) return;
    
    if (!process.env.API_KEY) {
      const newHistory = [...chatHistory, { role: 'user' as const, text: promptInput.trim() }, { role: 'model' as const, text: "Mi dispiace, la chiave API di Google non è configurata. L'amministratore del sito deve aggiungerla per farmi funzionare." }];
      setChatHistory(newHistory);
      setPromptInput('');
      return;
    }
    
    const userMsg = promptInput.trim();
    setPromptInput(''); 
    
    const newHistory = [...chatHistory, { role: 'user' as const, text: userMsg }];
    setChatHistory(newHistory);
    setLoading(true);
  
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const topGroups = bestDates.slice(0, 5);
      const dateContext = topGroups.map(g => `${formatGroupDate(g)}: ${g.available}/${g.total} presenti`).join('\n');
      
      const systemInstruction = `Sei un assistente per l'organizzazione dell'evento "${eventName}".
      Descrizione: ${eventDesc}
      Partecipanti totali: ${users.length}
      Utenti partecipanti: ${users.map(u => u.name).join(', ')}
      
      Le date migliori calcolate dall'algoritmo (in base alle disponibilità segnate) sono:
      ${dateContext}
      
      Rispondi alle domande dell'utente aiutandolo a scegliere una data o a organizzare i dettagli. Sii conciso, utile e simpatico.`;
  
      const contents = newHistory.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
      }));
  
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: systemInstruction,
        },
        contents: contents
      });
  
      const aiText = response.text || "Non so cosa dire.";
      
      setChatHistory([...newHistory, { role: 'model', text: aiText }]);
    } catch (e) {
      setChatHistory([...newHistory, { role: 'model', text: "Errore di connessione con l'IA." }]);
    } finally {
      setLoading(false);
    }
  };

  const openCreateMode = () => {
    setInputEventName(''); setInputEventDesc(''); setInputEventImg(''); 
    setInputModePreference('busy'); 
    setHomeMode('create');
  };

  const openJoinMode = () => {
    setJoinInput(''); 
    setInputModePreference('busy'); 
    loadHistory(); 
    setHomeMode('join');
  };

  // --- UI Components ---

  // Schermata di Login / Selezione Account
  if (view === 'home' && !localStorage.getItem('my_name')) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-slate-100 text-center animate-in fade-in zoom-in duration-300">
          <div className="bg-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg rotate-3 text-white">
            <CalendarIcon size={32} />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-1">Evento Facile</h1>
          <p className="text-slate-500 mb-8 font-medium">Scegli un account</p>

          {!isAddingAccount && savedAccounts.length > 0 ? (
             <div className="space-y-3 mb-6">
                {savedAccounts.map(acc => (
                  <div key={acc.id} onClick={() => loginWithAccount(acc)} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50 cursor-pointer transition-all group text-left">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                          {acc.avatar ? <img src={acc.avatar} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-400">{acc.name.charAt(0)}</div>}
                        </div>
                        <div>
                          <p className="font-bold text-slate-700">{acc.name}</p>
                          <p className="text-[10px] text-slate-400">Accedi</p>
                        </div>
                     </div>
                     <button onClick={(e) => removeSavedAccount(e, acc.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors"><X size={16}/></button>
                  </div>
                ))}
                <button onClick={() => setIsAddingAccount(true)} className="w-full py-3 text-sm font-bold text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors flex items-center justify-center gap-2 border border-dashed border-indigo-200"><UserPlus size={16}/> Aggiungi un altro account</button>
             </div>
          ) : (
            <div className="flex flex-col items-center gap-6 animate-in slide-in-from-right duration-300">
              {isAddingAccount && <button onClick={() => setIsAddingAccount(false)} className="self-start text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-[-10px]"><ChevronLeft size={14}/> Indietro</button>}
              <div 
                className="relative w-24 h-24 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-indigo-500 transition-colors group overflow-hidden"
                onClick={() => avatarInputRef.current?.click()}
              >
                {inputAvatar ? <img src={inputAvatar} className="w-full h-full object-cover" /> : <Camera className="text-slate-400 group-hover:text-indigo-500" size={32} />}
                <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
              </div>
              <div className="w-full space-y-4">
                <input value={inputName} onChange={e => setInputName(e.target.value)} placeholder="Nome Cognome" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-center text-lg" onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
                <button onClick={handleLogin} disabled={!inputName.trim()} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50">Accedi</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'home') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-slate-100 relative overflow-hidden transition-all duration-300">
          <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
          <div className="mb-6 flex items-center justify-center gap-2 text-indigo-600 opacity-90"><CalendarIcon size={20} /><span className="font-bold tracking-tight">Evento Facile</span></div>
          
          <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-4 relative">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center overflow-hidden border border-indigo-200">
                 {myAvatar ? <img src={myAvatar} className="w-full h-full object-cover" /> : <span className="font-bold text-indigo-600">{myName.charAt(0).toUpperCase()}</span>}
               </div>
               <div><p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Bentornato</p><h2 className="text-xl font-bold text-slate-800 truncate max-w-[150px]">{myName}</h2></div>
             </div>
             
             <button onClick={() => setShowUserMenu(!showUserMenu)} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors rounded-xl hover:bg-slate-50 relative"><MoreVertical size={20} /></button>
             
             {showUserMenu && (
               <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-20 animate-in fade-in slide-in-from-top-2">
                 <div className="px-4 py-2 border-b border-slate-50">
                   <p className="text-xs font-bold text-slate-700">{myName}</p>
                   <p className="text-[10px] text-slate-400">Account corrente</p>
                 </div>
                 <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2"><LogOut size={14}/> Esci</button>
               </div>
             )}
          </div>

          {homeMode === 'menu' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <button onClick={openCreateMode} className="w-full group bg-indigo-50 hover:bg-indigo-600 border border-indigo-100 hover:border-indigo-600 p-5 rounded-2xl transition-all duration-300 flex items-center justify-between">
                <div className="flex items-center gap-4"><div className="bg-white group-hover:bg-white/20 p-3 rounded-xl text-indigo-600 group-hover:text-white transition-colors shadow-sm"><Plus size={24} /></div><div className="text-left"><h3 className="font-bold text-slate-800 group-hover:text-white transition-colors">Crea Nuovo</h3><p className="text-xs text-slate-500 group-hover:text-indigo-100 transition-colors">Organizza un evento</p></div></div><ChevronRight className="text-slate-300 group-hover:text-white transition-colors" />
              </button>
              <button onClick={openJoinMode} className="w-full group bg-white hover:bg-slate-50 border border-slate-200 p-5 rounded-2xl transition-all duration-300 flex items-center justify-between">
                <div className="flex items-center gap-4"><div className="bg-slate-100 group-hover:bg-white p-3 rounded-xl text-slate-600 shadow-sm"><LinkIcon size={24} /></div><div className="text-left"><h3 className="font-bold text-slate-800">Partecipa</h3><p className="text-xs text-slate-500">Hai un codice o link?</p></div></div><ChevronRight className="text-slate-300 group-hover:text-slate-500 transition-colors" />
              </button>
            </div>
          )}

          {homeMode === 'create' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
               <button onClick={() => setHomeMode('menu')} className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-2"><ChevronLeft size={16}/> Indietro</button>
               <h3 className="text-lg font-bold text-slate-800">Nuovo Evento</h3>
               <div onClick={() => eventImgInputRef.current?.click()} className="w-full h-32 bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 transition-colors overflow-hidden relative group">
                  {inputEventImg ? <><img src={inputEventImg} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-white text-xs font-bold flex items-center gap-2"><ImageIcon size={16}/> Cambia</span></div></> : <div className="text-slate-400 flex flex-col items-center gap-1"><ImageIcon size={24} /><span className="text-xs">Aggiungi Cover</span></div>}
                  <input type="file" ref={eventImgInputRef} className="hidden" accept="image/*" onChange={handleEventImgChange} />
               </div>
               <div className="space-y-3">
                 <input value={inputEventName} onChange={e => setInputEventName(e.target.value)} placeholder="Nome (es. Calcetto)" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                 <div className="relative"><AlignLeft className="absolute top-3 left-3 text-slate-400" size={18} /><textarea value={inputEventDesc} onChange={e => setInputEventDesc(e.target.value)} placeholder="Descrizione (opzionale)" className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none text-sm min-h-[80px]"/></div>
               </div>
               <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                 <p className="text-xs font-bold text-slate-500 uppercase">La tua modalità</p>
                 <div className="flex gap-2">
                   <button onClick={() => setInputModePreference('busy')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${inputModePreference === 'busy' ? 'bg-white shadow text-rose-600 border border-slate-100' : 'text-slate-400 hover:bg-white/50'}`}><UserX size={14}/> Segna Assenze</button>
                   <button onClick={() => setInputModePreference('free')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${inputModePreference === 'free' ? 'bg-white shadow text-emerald-600 border border-slate-100' : 'text-slate-400 hover:bg-white/50'}`}><UserCheck size={14}/> Segna Presenze</button>
                 </div>
                 <p className="text-[10px] text-slate-400 text-center">{inputModePreference === 'busy' ? 'Consigliato: segni solo i giorni in cui NON puoi.' : 'Segni solo i giorni in cui PUOI.'}</p>
               </div>
               <button onClick={createEvent} disabled={loading || !inputEventName} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed">{loading ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />} Crea Ora</button>
            </div>
          )}

          {homeMode === 'join' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300 h-full flex flex-col">
               <div className="shrink-0">
                 <button onClick={() => setHomeMode('menu')} className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-2"><ChevronLeft size={16}/> Indietro</button>
                 <h3 className="text-lg font-bold text-slate-800">Partecipa a Evento</h3>
                 <p className="text-xs text-slate-500 mb-4">Cerca ID o incolla Link</p>
                 <div className="flex gap-2 mb-4">
                   <div className="relative w-full"><Search className="absolute left-3 top-3.5 text-slate-400" size={18} /><input value={joinInput} onChange={e => setJoinInput(e.target.value)} placeholder="Codice o Link" className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" autoFocus /></div>
                   <button onClick={joinManualEvent} disabled={loading || !joinInput} className="bg-slate-800 text-white px-4 rounded-xl font-bold hover:bg-slate-900 transition-all flex items-center justify-center shadow-md disabled:opacity-50">{loading ? <Loader2 className="animate-spin" /> : <ArrowRight size={20} />}</button>
                 </div>
               </div>
               <div className="grow overflow-hidden flex flex-col pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2"><History size={14}/> Eventi Recenti</h4>
                  <div className="overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {eventHistory.length === 0 ? <div className="text-center py-8 text-slate-400 text-sm italic">Nessun evento visitato di recente.</div> : eventHistory.map(item => (
                        <div key={item.id} onClick={() => joinFromHistory(item.id)} className="p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50 cursor-pointer transition-all flex items-center justify-between group">
                          <div><p className="font-bold text-slate-700 text-sm group-hover:text-indigo-700">{item.name}</p><p className="text-[10px] text-slate-400 flex items-center gap-1"><Clock size={10}/> {new Date(item.lastVisited).toLocaleDateString()}</p></div><ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-400"/>
                        </div>
                    ))}
                  </div>
               </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- UI Evento ---
  const firstDay = (new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay() + 6) % 7;

  return (
    <div className="min-h-screen max-w-5xl mx-auto p-4 lg:p-8 space-y-6">
      <nav className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100 gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => { setView('home'); setBinId(null); window.history.pushState({}, '', window.location.pathname); }} className="bg-slate-50 p-3 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"><ChevronLeft size={24}/></button>
          <div><h2 className="font-bold text-xl text-slate-800 flex items-center gap-2">{eventName || 'Caricamento...'}{!JSONBIN_TOKEN && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 font-normal">LOCALE</span>}</h2><p className="text-xs text-slate-400">Codice: {binId}</p></div>
        </div>
        
        <div className="flex gap-2">
            <button onClick={() => { navigator.clipboard.writeText(window.location.href); showToast("Link copiato!", 'success'); }} className="flex items-center gap-2 text-sm font-semibold text-indigo-600 bg-indigo-50 px-5 py-2.5 rounded-xl hover:bg-indigo-100 transition-colors"><Share2 size={18}/> <span className="hidden sm:inline">Condividi</span></button>
            <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden cursor-pointer hover:border-indigo-500 transition-colors" onClick={() => { setView('home'); }}>
                 {myAvatar ? <img src={myAvatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-indigo-600">{myName.charAt(0)}</div>}
            </div>
        </div>
      </nav>

      <div className="grid lg:grid-cols-12 gap-6">
        {(eventImg || eventDesc) && (
          <div className="lg:col-span-12 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
             {eventImg && <div className="h-48 sm:h-64 w-full bg-slate-100 relative"><img src={eventImg} alt="Cover" className="w-full h-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" /><h1 className="absolute bottom-6 left-6 text-3xl font-bold text-white shadow-sm">{eventName}</h1></div>}
             {eventDesc && <div className="p-6"><p className="text-slate-600 leading-relaxed whitespace-pre-line">{eventDesc}</p></div>}
          </div>
        )}

        <div className="lg:col-span-8 space-y-4">
          {/* Header Calendario / Controlli Modalità */}
          {myId && myUserInEvent && (
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className={`w-10 h-10 rounded-full flex items-center justify-center ${myMode === 'busy' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                   {myMode === 'busy' ? <UserX size={20}/> : <UserCheck size={20}/>}
                 </div>
                 <div>
                   <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">La tua modalità</p>
                   <p className="font-bold text-slate-800 text-sm">{myMode === 'busy' ? 'Segna Assenze' : 'Segna Presenze'}</p>
                 </div>
              </div>
              
              <div className="w-full sm:w-auto">
                {myMode === 'busy' ? (
                  <div className="flex gap-2">
                    <button onClick={() => setMonthStatus('clear')} className="flex-1 sm:flex-auto text-xs font-medium text-slate-600 hover:text-emerald-600 bg-slate-50 hover:bg-emerald-50 px-4 py-2.5 rounded-xl transition-colors border border-slate-200">Sono libero tutto il mese</button>
                    <button onClick={() => setMonthStatus('fill')} className="flex-1 sm:flex-auto text-xs font-medium text-slate-600 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 px-4 py-2.5 rounded-xl transition-colors border border-slate-200">Occupato tutto il mese</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setMonthStatus('fill')} className="flex-1 sm:flex-auto text-xs font-medium text-slate-600 hover:text-emerald-600 bg-slate-50 hover:bg-emerald-50 px-4 py-2.5 rounded-xl transition-colors border border-slate-200">Presente tutto il mese</button>
                    <button onClick={() => setMonthStatus('clear')} className="flex-1 sm:flex-auto text-xs font-medium text-slate-600 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 px-4 py-2.5 rounded-xl transition-colors border border-slate-200">Assente tutto il mese</button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-50 flex justify-between items-center border-b border-slate-100">
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="p-2 hover:bg-white rounded-lg transition-colors text-slate-600"><ChevronLeft/></button>
              <span className="font-bold text-lg text-slate-700 capitalize">{MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="p-2 hover:bg-white rounded-lg transition-colors text-slate-600"><ChevronRight/></button>
            </div>
            
            <div className="grid grid-cols-7 text-center py-3 bg-white text-xs font-bold text-slate-400 uppercase tracking-wider">{DAYS.map(d => <div key={d}>{d}</div>)}</div>
            
            <div className="grid grid-cols-7 bg-slate-100 gap-px border-t border-slate-100">
              {Array(firstDay).fill(null).map((_, i) => <div key={`empty-${i}`} className="h-24 bg-slate-50/50" />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                const iso = getLocalISOString(date);
                const availableCount = getDayAvailability(iso, users, unavailableDates, availableDates);
                const ratio = users.length > 0 ? availableCount / users.length : 1;

                // Visual Logic per Utente Corrente
                let isMarked = false;
                if (myId) {
                   if (myMode === 'busy') isMarked = (unavailableDates[iso] || []).includes(myId);
                   else isMarked = (availableDates[iso] || []).includes(myId);
                }
                
                let barColor = 'bg-emerald-400';
                if (ratio < 0.4) barColor = 'bg-rose-400';
                else if (ratio < 0.8) barColor = 'bg-amber-400';
                
                const hoverClass = myMode === 'busy' ? 'hover:bg-rose-50/50 cursor-pointer' : 'hover:bg-emerald-50/50 cursor-pointer';
                const markedClass = isMarked ? (myMode === 'busy' ? 'bg-rose-50' : 'bg-emerald-50') : '';
                const textClass = isMarked ? (myMode === 'busy' ? 'text-rose-500' : 'text-emerald-600') : 'text-slate-700';

                return (
                  <div key={day} onClick={() => toggleDate(iso)} className={`h-24 bg-white relative flex flex-col items-center justify-between p-2 transition-all ${hoverClass} ${markedClass}`}>
                    <span className={`text-sm font-bold ${textClass}`}>{day}</span>
                    {users.length > 0 && (
                       <div className="w-full space-y-1">
                         <div className="text-[10px] text-center text-slate-400 font-medium">{availableCount}/{users.length}</div>
                         <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full transition-all duration-500 ${barColor}`} style={{ width: `${ratio * 100}%` }} />
                         </div>
                       </div>
                    )}
                    {isMarked && (
                       <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${myMode === 'busy' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-sm text-slate-500 text-center bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
            {myMode === 'busy' ? <>Tocca i giorni in cui <span className="text-rose-600 font-bold">NON</span> puoi esserci.</> : <>Tocca i giorni in cui <span className="text-emerald-600 font-bold">PUOI</span> esserci.</>}
          </p>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h3 className="font-bold flex items-center gap-2 mb-4 text-slate-800"><Users size={20}/> Partecipanti ({users.length})</h3>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full ${u.color} shrink-0 flex items-center justify-center text-white text-xs font-bold shadow-sm overflow-hidden border border-white relative`}>
                      {u.avatar ? <img src={u.avatar} alt={u.name} className="w-full h-full object-cover"/> : u.name.charAt(0).toUpperCase()}
                      {u.id === adminId && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><Crown size={12} className="text-yellow-400 fill-yellow-400"/></div>}
                    </div>
                    <div>
                      <span className={`text-sm ${u.id === myId ? 'font-bold text-indigo-600' : 'text-slate-600'} flex items-center gap-1`}>
                        {u.name} 
                        {u.id === myId && '(Tu)'}
                      </span>
                      {u.id === adminId && <span className="text-[10px] text-amber-500 font-bold flex items-center gap-0.5"><Crown size={10} className="fill-amber-500"/> Admin</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-slate-300" title={u.mode === 'busy' ? 'Segna Assenze' : 'Segna Presenze'}>
                       {u.mode === 'busy' || !u.mode ? <UserX size={14} /> : <UserCheck size={14} />}
                    </div>
                    {u.id === myId && u.id !== adminId && (
                      <button type="button" onClick={(e) => leaveEvent(e)} className="text-rose-400 hover:text-rose-600 p-2 hover:bg-rose-50 rounded-full transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer" title="Esci dall'evento">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {!myUserInEvent && (
              <div className="pt-4 mt-4 border-t border-slate-100 space-y-3 animate-in fade-in slide-in-from-top-2">
                <p className="text-xs text-slate-500">
                  {myId ? "Non sei nella lista dei partecipanti." : "Stai visualizzando come ospite."}
                </p>
                <div className="flex gap-2">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 shrink-0 flex items-center justify-center cursor-pointer border border-dashed border-slate-300 hover:border-indigo-500 overflow-hidden" onClick={() => avatarInputRef.current?.click()}>
                    {inputAvatar ? <img src={inputAvatar} className="w-full h-full object-cover"/> : <Camera size={16} className="text-slate-400"/>}
                    <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
                  </div>
                  <input value={inputName} onChange={e => setInputName(e.target.value)} placeholder="Il tuo nome" className="w-full text-sm p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500" />
                </div>
                
                <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                   <p className="text-[10px] text-slate-400 mb-2 font-bold uppercase text-center">Come vuoi partecipare?</p>
                   <div className="flex gap-2">
                     <button onClick={() => setInputModePreference('busy')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 ${inputModePreference === 'busy' ? 'bg-white shadow text-rose-600 border border-slate-100' : 'text-slate-400 hover:bg-white/50'}`}><UserX size={12}/> Segna Assenze</button>
                     <button onClick={() => setInputModePreference('free')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 ${inputModePreference === 'free' ? 'bg-white shadow text-emerald-600 border border-slate-100' : 'text-slate-400 hover:bg-white/50'}`}><UserCheck size={12}/> Segna Presenze</button>
                   </div>
                </div>

                <button onClick={joinEvent} disabled={!inputName} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl text-sm font-bold transition-all shadow-md disabled:opacity-50">Unisciti all'Evento</button>
              </div>
            )}

            {isAdmin && (
              <div className="pt-4 mt-6 border-t border-slate-100">
                 <button onClick={deleteEvent} className="w-full bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
                   <Ban size={16}/> Elimina Evento
                 </button>
              </div>
            )}
          </div>

          <div className="bg-indigo-600 p-6 rounded-3xl shadow-lg text-white flex flex-col h-[600px] lg:h-[850px]">
            <div className="shrink-0 space-y-5">
              <h3 className="font-bold flex items-center gap-2"><Sparkles size={20}/> Suggerimenti</h3>
              <div className="space-y-3">
                {bestDates.slice(0, 5).map((g) => (
                  <div key={g.startIso} className="bg-white/10 p-3 rounded-xl border border-white/10 flex justify-between items-center backdrop-blur-sm">
                    <span className="font-medium text-sm">{formatGroupDate(g)}</span>
                    <span className="text-xs bg-emerald-400 text-emerald-950 px-2 py-1 rounded-full font-bold shadow-sm">{g.available} Presenti</span>
                  </div>
                ))}
                {bestDates.length > 5 && (
                  <div className="pt-2">
                    <button onClick={() => setExpandSuggestions(!expandSuggestions)} className="w-full flex items-center justify-center gap-2 text-xs font-bold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 py-2 rounded-lg transition-all">
                      {expandSuggestions ? <>Nascondi <ChevronUp size={14}/></> : <>Mostra altre opzioni <ChevronDown size={14}/></>}
                    </button>
                    {expandSuggestions && (<div className="space-y-3 mt-3 animate-in fade-in slide-in-from-top-2 duration-200">{bestDates.slice(5).map((g) => (<div key={g.startIso} className="bg-white/5 p-2 rounded-lg border border-white/5 flex justify-between items-center text-xs"><span className="font-medium text-white/90">{formatGroupDate(g)}</span><span className="bg-white/20 text-white px-1.5 py-0.5 rounded text-[10px]">{g.available}</span></div>))}</div>)}
                  </div>
                )}
                {bestDates.length === 0 && <div className="text-sm text-white/70 italic text-center py-2">Nessuna data disponibile al momento.</div>}
              </div>
            </div>

            <div className="my-4 border-t border-white/20"></div>

            <div className="flex flex-col grow min-h-0">
              <div className="flex gap-2 mb-4">
                <input 
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendPrompt()}
                  placeholder="Chiedi all'IA..."
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:bg-white/20 transition-all"
                  disabled={loading}
                />
                <button 
                  onClick={handleSendPrompt}
                  disabled={loading || !promptInput.trim()}
                  className="bg-white text-indigo-600 p-2 rounded-xl hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader2 className="animate-spin" size={18}/> : <ArrowRight size={18}/>}
                </button>
              </div>

              <div className="grow overflow-y-auto custom-scrollbar space-y-3 pr-2">
                {chatHistory.length === 0 && (
                   <div className="text-center text-white/50 text-xs italic mt-4">
                     Chiedi un consiglio sulle date, sul menu o sull'organizzazione!
                   </div>
                )}
                {chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-white text-indigo-900 rounded-tr-none' 
                        : 'bg-white/10 text-white border border-white/10 rounded-tl-none'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                 <div ref={chatEndRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
      {toast && (<div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-bounce z-50 ${toast.type === 'error' ? 'bg-rose-600' : 'bg-slate-800'} text-white`}>{toast.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle2 className="text-emerald-400" size={20}/>}<span className="font-medium text-sm">{toast.msg}</span></div>)}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
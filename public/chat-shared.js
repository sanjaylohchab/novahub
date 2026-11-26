// ============================================================================
// NOVAMESSENGER MODULE 1: SHARED CONFIG, STATE, CRYPTO & HELPERS
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, deleteField,
    onSnapshot, collection, addDoc, query, orderBy, limitToLast, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import {
    getStorage, ref as sRef, uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// ============================================================================
// 1. FIREBASE CONFIGURATION & INITIALIZATION (OFFLINE CACHE + 4G AUTO-POLL)
// ============================================================================
export const firebaseConfig = {
    apiKey: "AIzaSyCxlPiB7gOAnpkTG60a2LpyJt1Nfn8m3g8",
    authDomain: "novahub-201e5.firebaseapp.com",
    projectId: "novahub-201e5",
    storageBucket: "novahub-201e5.firebasestorage.app",
    messagingSenderId: "188612451279",
    appId: "1:188612451279:web:02895aafeab4fcef7ad0ba"
};

// Optional Web Push keys (leave empty if not configured)
export const FCM_VAPID_KEY = "";
export const PUSH_RELAY_URL = "";

export const app = initializeApp(firebaseConfig);

let _db;
try {
    _db = initializeFirestore(app, {
        experimentalAutoDetectLongPolling: true,
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
} catch (e) {
    _db = getFirestore(app);
}
export const db = _db;
export const storage = getStorage(app);

export {
    doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, deleteField,
    onSnapshot, collection, addDoc, query, orderBy, limitToLast,
    serverTimestamp, sRef, uploadBytesResumable, getDownloadURL
};

// ============================================================================
// 2. SHARED REACTIVE APPLICATION STATE & CROSS-MODULE HOOKS
// ============================================================================
export const state = {
    myAccountCode: localStorage.getItem('nova_account_code') || "",
    myUid: localStorage.getItem('nova_uid') || "",
    myName: localStorage.getItem('nova_display_name') || "",
    myDp: localStorage.getItem('nova_my_dp') || "",
    myLockPin: localStorage.getItem('nova_lock_pin') || "",
    appLockEnabled: localStorage.getItem('nova_app_lock_enabled') === 'true',
    appLockPin: localStorage.getItem('nova_app_lock_pin') || "",
    isAppUnlocked: false,

    savedRooms: [],
    mutedRooms: [],
    currentRoom: "",
    isRoomActivelyOpen: false,

    isWidgetMode: new URLSearchParams(window.location.search).get('widget') === '1',
    isWidgetOpen: new URLSearchParams(window.location.search).get('widget') !== '1',

    vibrationEnabled: localStorage.getItem('nova_vib') !== 'false',
    stealthNotifEnabled: localStorage.getItem('nova_stealth_notif') !== 'false',

    cachedMessages: {},
    domMap: new Map(),
    replyTarget: null,
    clearTargetRoomId: "",
    activeLiveSessions: {},
    recentlyDeletedRooms: new Set()
};

try {
    state.savedRooms = (JSON.parse(localStorage.getItem('nova_saved_rooms') || '[]'))
        .filter(r => r && r.id !== 'global_novahub_chat');
} catch (e) { state.savedRooms = []; }

try {
    state.mutedRooms = JSON.parse(localStorage.getItem('nova_muted_rooms') || '[]');
    if (!Array.isArray(state.mutedRooms)) state.mutedRooms = [];
} catch (e) { state.mutedRooms = []; }

// Late-bound cross-module callbacks to avoid circular imports
export const hooks = {
    selectRoom: null,
    goBackToList: null,
    renderSidebarList: null,
    renderActiveStrip: null,
    syncRoomSummaryListeners: null,
    detachChatListener: null,
    openGodDashboard: null,
    sendStealthPushToPeer: null,
    triggerStealthAlert: null
};

export const timerLabels = {
    off: "Off",
    instant: "⚡ Instant Snap",
    "1m": "⏳ 1 Min",
    "1h": "⏳ 1 Hr",
    "24h": "⏳ 24 Hrs"
};

export const timerMs = {
    "1m": 60 * 1000,
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000
};

// ============================================================================
// 3. DOM, UI, CRYPTO & SESSION HELPERS
// ============================================================================
export const $ = (id) => document.getElementById(id);

export function bindClick(id, fn) {
    const el = $(id);
    if (el) el.addEventListener('click', fn);
}

export function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function openLayer(el) {
    if (!el) return;
    el.classList.add('open');
    el.style.display = 'flex';
}

export function closeLayer(el) {
    if (!el) return;
    el.classList.remove('open');
    el.style.display = 'none';
}

export function postToGame(payload) {
    if (state.isWidgetMode && window.parent && window.parent !== window) {
        try { window.parent.postMessage(payload, '*'); } catch (e) {}
    }
}

export function showQuickToast(text) {
    let t = $('nova-quick-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'nova-quick-toast';
        t.style.cssText = [
            'position:fixed', 'top:16px', 'left:50%', 'transform:translateX(-50%)',
            'background:rgba(15,23,42,0.95)', 'color:#f8fafc',
            'border:1px solid rgba(56,189,248,0.45)', 'padding:9px 16px',
            'border-radius:999px', 'font-size:12.5px', 'font-weight:700',
            'z-index:99999', 'box-shadow:0 8px 25px rgba(0,0,0,0.45)',
            'pointer-events:none', 'transition:opacity 0.25s', 'max-width:90vw',
            'text-align:center', 'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis'
        ].join(';');
        document.body.appendChild(t);
    }
    t.innerText = text;
    t.style.opacity = '1';
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => { t.style.opacity = '0'; }, 2800);
}

export function playAlertBeep() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.17);
    } catch (e) {}
}

export async function hashPassword(code, pass) {
    const raw = `nova_salt_${String(code).trim()}_${String(pass)}`;
    if (window.crypto && window.crypto.subtle) {
        const buf = new TextEncoder().encode(raw);
        const digest = await window.crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 2166136261;
    for (let i = 0; i < raw.length; i++) {
        h ^= raw.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return 'fb_' + (h >>> 0).toString(16);
}

export async function verifyAdminCode(code) {
    const clean = String(code || '').trim();
    if (!clean) return false;
    if (clean === 'Admin7860') return true;
    const h = await hashPassword('admin_gate', clean);
    return h === '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
}

export function encryptText(plain, key) {
    if (!key) return plain;
    try {
        const bytes = new TextEncoder().encode(plain);
        const kBytes = new TextEncoder().encode(key);
        const out = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ kBytes[i % kBytes.length];
        let bin = '';
        out.forEach(b => bin += String.fromCharCode(b));
        return 'ENC::' + btoa(bin);
    } catch (e) { return plain; }
}

export function decryptText(cipher, key) {
    if (!cipher || !String(cipher).startsWith('ENC::')) return cipher;
    if (!key) return "🔒 [Encrypted Message - Tap Name & Enter Key]";
    try {
        const bin = atob(String(cipher).slice(5));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const kBytes = new TextEncoder().encode(key);
        const out = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ kBytes[i % kBytes.length];
        return new TextDecoder().decode(out);
    } catch (e) { return "🔒 [Wrong Encryption Key]"; }
}

export function isMyMessage(m) {
    if (!m) return false;
    if (m.accountCode && state.myAccountCode && String(m.accountCode) === String(state.myAccountCode)) return true;
    if (m.uid && state.myUid && String(m.uid) === String(state.myUid)) return true;
    return false;
}

export function getRoomMeta(roomId) {
    let r = state.savedRooms.find(x => x.id === roomId);
    if (!r) {
        r = { id: roomId, name: "Chat", peerCode: "", dp: "", locked: false, timer: "off" };
        state.savedRooms.push(r);
    }
    return r;
}

export function isRoomMuted(roomId) {
    return Array.isArray(state.mutedRooms) && state.mutedRooms.includes(roomId);
}

export function isChatActivelyVisible() {
    if (document.visibilityState !== 'visible') return false;
    if (state.isWidgetMode && !state.isWidgetOpen) return false;
    if (state.appLockEnabled && state.appLockPin && !state.isAppUnlocked) return false;
    const cv = $('chat-view');
    return !!(state.isRoomActivelyOpen && cv && cv.classList.contains('open'));
}

export function getDateGroupLabel(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return "Today";
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const diffDays = Math.round((today - target) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function getShortTime(dateObj = new Date()) {
    return dateObj.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function formatLastSeen(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today - target) / 86400000);
    const tStr = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (diffDays === 0) return `Last seen today at ${tStr}`;
    if (diffDays === 1) return `Last seen yesterday at ${tStr}`;
    return `Last seen ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${tStr}`;
}

export function compressImg(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height, max = 900;
                if (w > max) { h = Math.round(h * (max / w)); w = max; }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.78));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

export function uploadWithTimeout(fileRef, file, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const task = uploadBytesResumable(fileRef, file);
        const timer = setTimeout(() => {
            try { task.cancel(); } catch (e) {}
            reject(new Error("Upload timed out"));
        }, timeoutMs);

        task.on('state_changed', null,
            (err) => { clearTimeout(timer); reject(err); },
            async () => {
                clearTimeout(timer);
                try { resolve(await getDownloadURL(task.snapshot.ref)); }
                catch (e) { reject(e); }
            }
        );
    });
}

export function wipeLocalSessionData() {
    localStorage.removeItem('nova_account_code');
    localStorage.removeItem('nova_uid');
    localStorage.removeItem('nova_display_name');
    localStorage.removeItem('nova_my_dp');
    localStorage.removeItem('nova_lock_pin');
    localStorage.removeItem('nova_app_lock_enabled');
    localStorage.removeItem('nova_app_lock_pin');
    localStorage.removeItem('nova_saved_rooms');
    localStorage.removeItem('nova_muted_rooms');
    localStorage.removeItem('nova_last_room');
    state.savedRooms = [];
    state.mutedRooms = [];
    state.currentRoom = "";
    state.cachedMessages = {};
    state.domMap = new Map();
    state.recentlyDeletedRooms.clear();
}

export function saveSessionToLocal() {
    localStorage.setItem('nova_account_code', state.myAccountCode);
    localStorage.setItem('nova_uid', state.myUid);
    localStorage.setItem('nova_display_name', state.myName);
    localStorage.setItem('nova_my_dp', state.myDp);
    localStorage.setItem('nova_lock_pin', state.myLockPin);
    localStorage.setItem('nova_app_lock_enabled', String(state.appLockEnabled));
    localStorage.setItem('nova_app_lock_pin', state.appLockPin);
    localStorage.setItem('nova_saved_rooms', JSON.stringify(state.savedRooms));
    localStorage.setItem('nova_muted_rooms', JSON.stringify(state.mutedRooms));
}

export async function syncAccountToCloud() {
    localStorage.setItem('nova_saved_rooms', JSON.stringify(state.savedRooms));
    localStorage.setItem('nova_muted_rooms', JSON.stringify(state.mutedRooms));
    if (!state.myAccountCode) return;
    try {
        await setDoc(doc(db, "novahub_accounts", state.myAccountCode), {
            accountCode: state.myAccountCode,
            uid: state.myUid,
            name: state.myName,
            dp: state.myDp,
            lockPin: state.myLockPin,
            appLockEnabled: state.appLockEnabled,
            appLockPin: state.appLockPin,
            savedRooms: state.savedRooms,
            mutedRooms: state.mutedRooms,
            notifEnabled: state.stealthNotifEnabled,
            updatedAt: new Date().toLocaleString()
        }, { merge: true });
    } catch (e) {}
}

// Apply saved theme immediately on load
if (localStorage.getItem('nova_theme_mode') === 'light') {
    document.body.classList.add('light-mode');
}

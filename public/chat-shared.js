// ============================================================================
// NOVAMESSENGER MODULE 1: SHARED CONFIG, STATE, CRYPTO & HELPERS (chat-shared.js)
// ============================================================================
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    initializeFirestore, getFirestore, doc, setDoc, getDoc, getDocs,
    updateDoc, deleteDoc, deleteField, onSnapshot, collection, addDoc,
    query, orderBy, limit, limitToLast, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// Re-export Firestore & Storage SDK so other modules stay super clean
export {
    doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, deleteField,
    onSnapshot, collection, addDoc, query, orderBy, limit, limitToLast,
    serverTimestamp, sRef, uploadBytes, getDownloadURL
};

export const firebaseConfig = {
    apiKey: "AIzaSyCxlPiB7gOAnpkTG60a2LpyJt1Nfn8m3g8",
    authDomain: "novahub-201e5.firebaseapp.com",
    projectId: "novahub-201e5",
    storageBucket: "novahub-201e5.firebasestorage.app",
    messagingSenderId: "188612451279",
    appId: "1:188612451279:web:02895aafeab4fcef7ad0ba"
};

export const FCM_VAPID_KEY = "BLe9kr4-qcnut5ouM3AH9Ct-jjxDQBODFZJFM7eHB8dKz9N-7g9jFeyR9JrTH2eMboc6zgwqsJLNsy7glmv0t8w";
export const PUSH_RELAY_URL = "https://novahub-push.sanjaylohchab2749.workers.dev";

export const RTC_CONFIG = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun.relay.metered.ca:80" },
        {
            urls: [
                "turn:openrelay.metered.ca:80",
                "turn:openrelay.metered.ca:443",
                "turn:openrelay.metered.ca:443?transport=tcp"
            ],
            username: "openrelayproject",
            credential: "openrelayproject"
        }
    ],
    iceCandidatePoolSize: 10
};

export const timerLabels = {
    off: "", instant: "⏱️ Instant", "1h": "⏱️ 1h",
    "24h": "⏱️ 24h", "7d": "⏱️ 1w", "30d": "⏱️ 1m", "365d": "⏱️ 1y"
};
export const timerMs = {
    "1h": 3600000, "24h": 86400000, "7d": 604800000,
    "30d": 2592000000, "365d": 31536000000
};

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
let _db;
try { _db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, "default"); }
catch (e) { _db = getFirestore(app, "default"); }
export const db = _db;
export const storage = getStorage(app);

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ============================================================================
// SHARED RUNTIME STATE & CROSS-MODULE HOOKS
// ============================================================================
const _isWidget = new URLSearchParams(window.location.search).get('widget') === '1' || (window.self !== window.top);
const _savedCode = (localStorage.getItem('nova_account_code') || "").trim();
const _appLockOn = localStorage.getItem('nova_app_lock_enabled') === 'true';

export const state = {
    isWidgetMode: _isWidget,
    isWidgetOpen: !_isWidget,
    isRoomActivelyOpen: false,

    myAccountCode: _savedCode,
    myUid: _savedCode ? ('uid_' + _savedCode) : "",
    myName: localStorage.getItem('nova_username') || "",
    myDp: localStorage.getItem('nova_dp') || "",
    myLockPin: localStorage.getItem('nova_lock_pin') || "",
    appLockEnabled: _appLockOn,
    appLockPin: localStorage.getItem('nova_app_lock_pin') || "",
    isAppUnlocked: !_appLockOn,
    savedRooms: JSON.parse(localStorage.getItem('nova_saved_rooms') || '[]').filter(r => r.id !== 'global_novahub_chat'),

    currentRoom: "",
    clearTargetRoomId: "",
    actionTargetRoomId: "",
    showingArchivedView: false,
    recentlyDeletedRooms: new Set(),
    roomSummaryUnsubs: new Map(),
    roomSummaries: {},
    cachedMessages: {},
    domMap: new Map(),
    activeLiveSessions: {},

    vibrationEnabled: localStorage.getItem('nova_vib') !== 'false',
    stealthNotifEnabled: localStorage.getItem('nova_stealth_notif') !== 'false',
    audioCtx: null
};

// Cross-module callback registry (prevents circular import issues)
export const hooks = {};

// ============================================================================
// DOM, LAYER & WIDGET HELPERS
// ============================================================================
export const $ = (id) => document.getElementById(id);
export const bindClick = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };

export function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

export function openLayer(el) {
    if (!el) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur();
    el.classList.add('is-open');
}

export function closeLayer(el) {
    if (!el) return;
    el.classList.remove('is-open');
}

export function isLayerOpen(el) {
    return !!(el && el.classList.contains('is-open'));
}

export function postToGame(payload) {
    if (state.isWidgetMode) {
        try { window.parent.postMessage(payload, '*'); } catch (e) {}
    }
}

export function showQuickToast(txt) {
    const toast = $('stealth-toast');
    if (!toast) return;
    $('toast-txt').innerText = txt;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
}

// One-time visual & audio setup
if (state.isWidgetMode) document.body.classList.add('widget-mode');
if (localStorage.getItem('nova_theme_mode') === 'light') document.body.classList.add('light-mode');
if ($('di-vib-val')) $('di-vib-val').innerText = state.vibrationEnabled ? "ON" : "OFF";
if ($('di-notif-val')) $('di-notif-val').innerText = state.stealthNotifEnabled ? "ON" : "OFF";
document.addEventListener('focusout', () => { setTimeout(() => { window.scrollTo(0, 0); }, 40); });

export function ensureAudioContext() {
    try {
        if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (state.audioCtx.state === 'suspended') state.audioCtx.resume().catch(() => {});
    } catch (e) {}
    return state.audioCtx;
}
document.addEventListener('touchstart', ensureAudioContext, { once: true, passive: true });
document.addEventListener('click', ensureAudioContext, { once: true });

export function playAlertBeep() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
}

// ============================================================================
// CRYPTO (SHA-256 PASSWORDS/ADMIN & CHAT CIPHER)
// ============================================================================
export async function sha256Hex(str) {
    const data = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(code, pass) {
    return 'sha256:' + await sha256Hex(`novahub_pw_v2:${String(code).trim()}:${pass}`);
}

export async function hashAdminCode(raw) {
    return 'sha256:' + await sha256Hex(`novahub_adm_v2:${String(raw).trim().toLowerCase()}`);
}

export async function verifyAdminCode(rawCode) {
    if (!rawCode) return false;
    try {
        const snap = await getDoc(doc(db, "novahub_config", "admin"));
        if (!snap.exists() || !snap.data().adminHash) return false;
        return (await hashAdminCode(rawCode)) === snap.data().adminHash;
    } catch (e) {
        return false;
    }
}

export function encryptText(plainText, key) {
    if (!key) return plainText;
    try {
        let out = "";
        for (let i = 0; i < plainText.length; i++) {
            out += String.fromCharCode(plainText.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return "🔒ENC:" + btoa(unescape(encodeURIComponent(out)));
    } catch (e) { return plainText; }
}

export function decryptText(cipherText, key) {
    if (!cipherText || !cipherText.startsWith("🔒ENC:")) return cipherText;
    if (!key) return "🔐 [Encrypted - Tap Info to enter key]";
    try {
        const raw = decodeURIComponent(escape(atob(cipherText.replace("🔒ENC:", ""))));
        let out = "";
        for (let i = 0; i < raw.length; i++) {
            out += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return out;
    } catch (e) { return "🔐 [Wrong Encryption Key]"; }
}

// ============================================================================
// ROOM, TIME, MEDIA & SESSION HELPERS
// ============================================================================
export function make1on1RoomId(codeA, codeB) {
    const pair = [String(codeA).trim(), String(codeB).trim()].sort();
    return `dm_${pair[0]}_${pair[1]}`;
}

export function isMyMessage(m) {
    if (!m) return false;
    if (state.myAccountCode && m.accountCode && String(m.accountCode).trim() === String(state.myAccountCode).trim()) return true;
    return !!(state.myUid && m.uid === state.myUid);
}

export function isRoomMuted(roomId) {
    if (!roomId) return false;
    const r = state.savedRooms.find(x => x.id === roomId);
    return !!(r && r.muted);
}

export function getRoomMeta(roomId) {
    return state.savedRooms.find(r => r.id === roomId) || {
        id: roomId, name: "Private Chat", locked: false, muted: false, archived: false, timer: "off"
    };
}

export function isChatActivelyVisible() {
    if (!state.currentRoom || !state.isRoomActivelyOpen || !state.isAppUnlocked) return false;
    if (document.visibilityState !== 'visible') return false;
    if (state.isWidgetMode && !state.isWidgetOpen) return false;
    if (isLayerOpen($('auth-screen')) || isLayerOpen($('app-lock-screen')) || isLayerOpen($('cyber-gate-screen'))) return false;
    if ((state.isWidgetMode || window.innerWidth <= 768) && !$('chat-view')?.classList.contains('open')) return false;
    return true;
}

export function getDateGroupLabel(d = new Date()) {
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function getShortTime(d = new Date()) {
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function formatChatListTime(ms, fallbackShortTime = '') {
    if (!ms) return fallbackShortTime || '';
    const d = new Date(ms);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
    }
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatLastSeen(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    const now = new Date();
    const timePart = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return `Last seen today at ${timePart}`;
    if (d.toDateString() === yest.toDateString()) return `Last seen yesterday at ${timePart}`;
    const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `Last seen ${datePart}, ${timePart}`;
}

export function compressImg(file) {
    return new Promise((res) => {
        const r = new FileReader();
        r.onload = e => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                let w = img.width, h = img.height, max = 800;
                if (w > max) { h = Math.round((h * max) / w); w = max; }
                c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, w, h);
                res(c.toDataURL('image/jpeg', 0.62));
            };
            img.src = e.target.result;
        };
        r.readAsDataURL(file);
    });
}

export function uploadWithTimeout(fRef, file, ms = 15000) {
    return Promise.race([
        uploadBytes(fRef, file, { contentType: file.type || 'video/mp4' }).then(() => getDownloadURL(fRef)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Storage timeout / not enabled')), ms))
    ]);
}

export function wipeLocalSessionData() {
    [
        'nova_account_code', 'nova_my_code', 'nova_uid', 'nova_username', 'nova_dp',
        'nova_lock_pin', 'nova_app_lock_enabled', 'nova_app_lock_pin',
        'nova_saved_rooms', 'nova_last_room'
    ].forEach(k => localStorage.removeItem(k));
}

export function saveSessionToLocal() {
    localStorage.setItem('nova_account_code', state.myAccountCode);
    localStorage.setItem('nova_uid', state.myUid);
    localStorage.setItem('nova_username', state.myName);
    localStorage.setItem('nova_dp', state.myDp);
    localStorage.setItem('nova_lock_pin', state.myLockPin);
    localStorage.setItem('nova_app_lock_enabled', String(state.appLockEnabled));
    localStorage.setItem('nova_app_lock_pin', state.appLockPin);
    localStorage.setItem('nova_saved_rooms', JSON.stringify(state.savedRooms));
}

export async function syncAccountToCloud() {
    localStorage.setItem('nova_saved_rooms', JSON.stringify(state.savedRooms));
    if (!state.myAccountCode) return;
    const mutedRooms = state.savedRooms.filter(r => r.muted).map(r => r.id);
    try {
        await setDoc(doc(db, "novahub_accounts", state.myAccountCode), {
            savedRooms: state.savedRooms,
            mutedRooms,
            updatedAt: new Date().toLocaleString()
        }, { merge: true });
    } catch (e) {}
}

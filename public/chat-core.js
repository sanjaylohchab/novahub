// ============================================================================
// NOVAMESSENGER PRO ENGINE (chat-core.js)
// WebRTC STUN/TURN + Real Ringtone | FCM Stealth Push | SHA-256 Auth & Admin
// ============================================================================
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { initializeFirestore, getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, deleteField, onSnapshot, collection, addDoc, query, orderBy, limitToLast, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyCxlPiB7gOAnpkTG60a2LpyJt1Nfn8m3g8",
    authDomain: "novahub-201e5.firebaseapp.com",
    projectId: "novahub-201e5",
    storageBucket: "novahub-201e5.firebasestorage.app",
    messagingSenderId: "188612451279",
    appId: "1:188612451279:web:02895aafeab4fcef7ad0ba"
};

// FCM Lock-Screen Push Config
const FCM_VAPID_KEY = "BLe9kr4-qcnut5ouM3AH9Ct-jjxDQBODFZJFM7eHB8dKz9N-7g9jFeyR9JrTH2eMboc6zgwqsJLNsy7glmv0t8w";
const PUSH_RELAY_URL = "https://novahub-push.sanjaylohchab2749.workers.dev";

// WebRTC ICE Servers (Multiple STUN + Free Relay TURN for Jio/Airtel 4G/5G)
const RTC_CONFIG = {
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

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
let db;
try { db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, "default"); }
catch (e) { db = getFirestore(app, "default"); }
const storage = getStorage(app);

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ============================================================================
// 0. STATE, CRYPTO HELPERS & DOM REFERENCES
// ============================================================================
const isWidgetMode = new URLSearchParams(window.location.search).get('widget') === '1' || (window.self !== window.top);
let isWidgetOpen = !isWidgetMode;
let isRoomActivelyOpen = false;
let domMap = new Map();

let authMode = 'login';
let myAccountCode = (localStorage.getItem('nova_account_code') || "").trim();
let myUid = myAccountCode ? ('uid_' + myAccountCode) : "";
let myName = localStorage.getItem('nova_username') || "";
let myDp = localStorage.getItem('nova_dp') || "";
let myLockPin = localStorage.getItem('nova_lock_pin') || "";
let appLockEnabled = localStorage.getItem('nova_app_lock_enabled') === 'true';
let appLockPin = localStorage.getItem('nova_app_lock_pin') || "";
let isAppUnlocked = !appLockEnabled;
let savedRooms = JSON.parse(localStorage.getItem('nova_saved_rooms') || '[]').filter(r => r.id !== 'global_novahub_chat');

let currentRoom = "";
let unsubscribeChat = null;
let unsubscribePresence = null;
let presenceRefreshTimer = null;
let unsubscribeCall = null;
let unsubscribeRemoteIce = null;
let unsubscribeAccountSync = null;
let cachedMessages = {};
const markingSeen = new Set();
let selectedMsg = null;
let replyTarget = null;
let editingMsgId = null;
let isViewOnce = false;
let isInitialLoad = true;
let vibrationEnabled = localStorage.getItem('nova_vib') !== 'false';
let stealthNotifEnabled = localStorage.getItem('nova_stealth_notif') !== 'false';
let selectedLiveHours = 1;
const activeLiveSessions = {};
let lastPresStatus = "";
let lastPresMs = 0;
let typTimer = null;
let audioCtx = null;
let ringInterval = null;
let vibInterval = null;
let callTimeoutTimer = null;
let activeCallId = "";
let pendingIceCandidates = [];
let mediaRec = null, vnChunks = [], isRec = false;
let pc = null, localStream = null, isLoud = false, isMuted = false, isFs = false;
let emojiPickerLoaded = false;
let godRoom = "";

const timerLabels = { off: "", instant: "⏱️ Instant", "1h": "⏱️ 1h", "24h": "⏱️ 24h", "7d": "⏱️ 1w", "30d": "⏱️ 1m", "365d": "⏱️ 1y" };
const timerMs = { "1h": 3600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000, "365d": 31536000000 };

const $ = (id) => document.getElementById(id);
const bindClick = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };

const authScreen = $('auth-screen');
const appLockScreen = $('app-lock-screen');
const lockSettingsModal = $('lock-settings-modal');
const cyberGate = $('cyber-gate-screen');
const genericModal = $('generic-modal');
const godModal = $('god-modal');
const drawer = $('contact-info-drawer');
const clearModal = $('clear-chat-modal');
const locModal = $('location-modal');
const overlay = $('msg-overlay');
const liveBanner = $('active-live-banner');
const liveBannerText = $('active-live-text');
const callHud = $('call-hud');
const remoteVid = $('remote-vid');
const remoteAud = $('remote-aud');
const localVid = $('local-vid');
const errEl = $('auth-error-msg');
const codeInp = $('auth-code');
const nameInp = $('auth-name');
const passInp = $('auth-pass');
const voBtn = $('btn-vo-toggle');
const vnBtn = $('btn-vn-rec');

if (isWidgetMode) document.body.classList.add('widget-mode');
if (localStorage.getItem('nova_theme_mode') === 'light') document.body.classList.add('light-mode');
if ($('di-vib-val')) $('di-vib-val').innerText = vibrationEnabled ? "ON" : "OFF";
if ($('di-notif-val')) $('di-notif-val').innerText = stealthNotifEnabled ? "ON" : "OFF";

// Unlock AudioContext on first user gesture so incoming ringtone works on iOS/Android
function ensureAudioContext() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    } catch (e) {}
    return audioCtx;
}
document.addEventListener('touchstart', ensureAudioContext, { once: true, passive: true });
document.addEventListener('click', ensureAudioContext, { once: true });

// SHA-256 Hashing for Passwords & Secret Admin Code (Zero Hardcoded Secrets!)
async function sha256Hex(str) {
    const data = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hashPassword(code, pass) {
    return 'sha256:' + await sha256Hex(`novahub_pw_v2:${String(code).trim()}:${pass}`);
}
async function hashAdminCode(raw) {
    return 'sha256:' + await sha256Hex(`novahub_adm_v2:${String(raw).trim().toLowerCase()}`);
}
async function verifyAdminCode(rawCode) {
    if (!rawCode) return false;
    try {
        const snap = await getDoc(doc(db, "novahub_config", "admin"));
        if (!snap.exists() || !snap.data().adminHash) return false;
        return (await hashAdminCode(rawCode)) === snap.data().adminHash;
    } catch (e) {
        return false;
    }
}

// Safe Layer Helpers
function openLayer(el) {
    if (!el) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur();
    el.classList.add('is-open');
}
function closeLayer(el) {
    if (!el) return;
    el.classList.remove('is-open');
}
function isLayerOpen(el) {
    return !!(el && el.classList.contains('is-open'));
}
document.addEventListener('focusout', () => { setTimeout(() => { window.scrollTo(0, 0); }, 40); });
function postToGame(payload) {
    if (isWidgetMode) { try { window.parent.postMessage(payload, '*'); } catch (e) {} }
}

// ============================================================================
// 1. REAL PHONE RINGTONE ENGINE (INCOMING & OUTGOING + VIBRATION)
// ============================================================================
function playTonePair(f1, f2, durationSec, volume = 0.16) {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try {
        const now = ctx.currentTime;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, now);
        g.gain.exponentialRampToValueAtTime(volume, now + 0.04);
        g.gain.setValueAtTime(volume, now + durationSec - 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
        g.connect(ctx.destination);

        [f1, f2].forEach(freq => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            osc.connect(g);
            osc.start(now);
            osc.stop(now + durationSec);
        });
    } catch (e) {}
}

function startRingtone(mode = 'incoming') {
    stopRingtone();
    const playCycle = () => {
        if (mode === 'incoming') {
            playTonePair(523.25, 659.25, 0.35, 0.22);
            setTimeout(() => playTonePair(659.25, 783.99, 0.45, 0.22), 400);
            if (vibrationEnabled && "vibrate" in navigator) {
                try { navigator.vibrate([380, 180, 380]); } catch (e) {}
            }
        } else {
            playTonePair(440, 480, 0.9, 0.09);
        }
    };
    playCycle();
    ringInterval = setInterval(playCycle, mode === 'incoming' ? 2200 : 3200);
}

function stopRingtone() {
    if (ringInterval) { clearInterval(ringInterval); ringInterval = null; }
    if (vibInterval) { clearInterval(vibInterval); vibInterval = null; }
    if ("vibrate" in navigator) { try { navigator.vibrate(0); } catch (e) {} }
}

// ============================================================================
// 2. FCM STEALTH PUSH REGISTRATION & SENDER HOOK
// ============================================================================
async function initStealthFCM() {
    if (!myAccountCode || !("Notification" in window) || !("serviceWorker" in navigator)) return;
    try {
        if (Notification.permission === "default") {
            await Notification.requestPermission().catch(() => {});
        }
        if (Notification.permission !== "granted") return;

        const reg = await navigator.serviceWorker.register("firebase-messaging-sw.js");
        if (!FCM_VAPID_KEY) return;

        const fcmMod = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js");
        const supported = await fcmMod.isSupported();
        if (!supported) return;

        const messaging = fcmMod.getMessaging(app);
        const token = await fcmMod.getToken(messaging, { vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: reg });
        if (token) {
            await setDoc(doc(db, "novahub_accounts", myAccountCode), { fcmToken: token, fcmUpdatedAt: Date.now() }, { merge: true }).catch(() => {});
        }
        fcmMod.onMessage(messaging, () => {
            if (!isChatActivelyVisible()) triggerStealthAlert("text");
        });
    } catch (e) {}
}

async function sendStealthPushToPeer(roomId, kind = "text") {
    if (!PUSH_RELAY_URL || !roomId) return;
    const meta = getRoomMeta(roomId);
    if (!meta || !meta.peerCode) return;
    try {
        const peerSnap = await getDoc(doc(db, "novahub_accounts", meta.peerCode));
        const token = peerSnap.exists() ? peerSnap.data().fcmToken : "";
        if (!token) return;
        let body = "New high score challenge! Game khelo **";
        if (kind === "media") body = "Daily spin reward ready! Game khelo ₹₹";
        else if (kind === "call") body = "Multiplayer lobby active! Join now ⭐️⭐️";
        fetch(PUSH_RELAY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toToken: token, title: "🎮 NovaHub Arcade", body })
        }).catch(() => {});
    } catch (e) {}
}

// ============================================================================
// 3. AUTHENTICATION & APP ENTRY PIN LOCK
// ============================================================================
function updateAppLockIconUI() {
    const icon = $('app-lock-icon');
    const sw = $('toggle-app-lock-sw');
    if (appLockEnabled && appLockPin) {
        if (icon) { icon.innerText = 'lock'; icon.style.color = '#10b981'; }
        if (sw) sw.checked = true;
    } else {
        if (icon) { icon.innerText = 'lock_open'; icon.style.color = 'var(--text-sub)'; }
        if (sw) sw.checked = false;
    }
}

function lockAppIfEnabled() {
    if (!myAccountCode || !appLockEnabled || !appLockPin) return;
    isAppUnlocked = false;
    isRoomActivelyOpen = false;
    if ($('chat-view')) $('chat-view').classList.remove('open');
    closeLayer(drawer); closeLayer(overlay); closeLayer(locModal); closeLayer(clearModal); closeLayer(genericModal);
    if ($('emoji-picker')) $('emoji-picker').classList.remove('show');
    if ($('lock-pin-input')) $('lock-pin-input').value = '';
    if ($('lock-error-msg')) $('lock-error-msg').innerText = '';
    openLayer(appLockScreen);
}

function unlockAppWithPin() {
    const val = ($('lock-pin-input')?.value || '').trim();
    if (val === appLockPin) {
        isAppUnlocked = true;
        $('lock-pin-input').value = '';
        $('lock-error-msg').innerText = '';
        closeLayer(appLockScreen);
        window.scrollTo(0, 0);
    } else {
        $('lock-error-msg').innerText = '❌ Galat PIN! Dobara koshish karein.';
        $('lock-pin-input').value = '';
    }
}

function wipeLocalSessionData() {
    ['nova_account_code', 'nova_my_code', 'nova_uid', 'nova_username', 'nova_dp', 'nova_lock_pin', 'nova_app_lock_enabled', 'nova_app_lock_pin', 'nova_saved_rooms', 'nova_last_room'].forEach(k => localStorage.removeItem(k));
}

function saveSessionToLocal() {
    localStorage.setItem('nova_account_code', myAccountCode);
    localStorage.setItem('nova_uid', myUid);
    localStorage.setItem('nova_username', myName);
    localStorage.setItem('nova_dp', myDp);
    localStorage.setItem('nova_lock_pin', myLockPin);
    localStorage.setItem('nova_app_lock_enabled', String(appLockEnabled));
    localStorage.setItem('nova_app_lock_pin', appLockPin);
    localStorage.setItem('nova_saved_rooms', JSON.stringify(savedRooms));
}

// ============================================================================
// 4. HELPERS: ENCRYPTION, ALERTS, ACCURATE PRESENCE & CROSS-DEVICE LIVE LOC
// ============================================================================
function make1on1RoomId(codeA, codeB) {
    const pair = [String(codeA).trim(), String(codeB).trim()].sort();
    return `dm_${pair[0]}_${pair[1]}`;
}

function isMyMessage(m) {
    if (!m) return false;
    if (myAccountCode && m.accountCode && String(m.accountCode).trim() === String(myAccountCode).trim()) return true;
    return !!(myUid && m.uid === myUid);
}

function isChatActivelyVisible() {
    if (!currentRoom || !isRoomActivelyOpen || !isAppUnlocked) return false;
    if (document.visibilityState !== 'visible') return false;
    if (isWidgetMode && !isWidgetOpen) return false;
    if (isLayerOpen(authScreen) || isLayerOpen(appLockScreen) || isLayerOpen(cyberGate)) return false;
    if ((isWidgetMode || window.innerWidth <= 768) && !$('chat-view')?.classList.contains('open')) return false;
    return true;
}

function getDateGroupLabel(d = new Date()) { return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
function getShortTime(d = new Date()) { return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }); }

function formatLastSeen(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    const now = new Date();
    const timePart = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return `Last seen today at ${timePart}`;
    if (d.toDateString() === yest.toDateString()) return `Last seen yesterday at ${timePart}`;
    const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `Last seen ${datePart}, ${timePart}`;
}

function encryptText(plainText, key) {
    if (!key) return plainText;
    try {
        let out = "";
        for (let i = 0; i < plainText.length; i++) out += String.fromCharCode(plainText.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        return "🔒ENC:" + btoa(unescape(encodeURIComponent(out)));
    } catch (e) { return plainText; }
}
function decryptText(cipherText, key) {
    if (!cipherText || !cipherText.startsWith("🔒ENC:")) return cipherText;
    if (!key) return "🔐 [Encrypted - Tap Info to enter key]";
    try {
        const raw = decodeURIComponent(escape(atob(cipherText.replace("🔒ENC:", ""))));
        let out = "";
        for (let i = 0; i < raw.length; i++) out += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        return out;
    } catch (e) { return "🔐 [Wrong Encryption Key]"; }
}

function playAlertBeep() {
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

function showQuickToast(txt) {
    const toast = $('stealth-toast');
    if (!toast) return;
    $('toast-txt').innerText = txt;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
}

async function triggerStealthAlert(type) {
    if (vibrationEnabled && type !== 'call') {
        if ("vibrate" in navigator) { try { navigator.vibrate([150, 70, 150]); } catch (e) {} }
        playAlertBeep();
    }
    let txt = "New high score challenge! Game khelo **";
    if (type === "media") txt = "Daily spin reward ready! Game khelo ₹₹";
    else if (type === "call") txt = "Multiplayer lobby active! Join now ⭐️⭐️";

    if (isWidgetMode && !isWidgetOpen) {
        if (type === 'call') postToGame({ type: 'NOVA_CALL_INCOMING', toastText: stealthNotifEnabled ? txt : '' });
        else postToGame({ type: 'NOVA_UNREAD', toastText: stealthNotifEnabled ? txt : '' });
    }
    if (!stealthNotifEnabled) return;
    showQuickToast(txt);

    if ("Notification" in window && Notification.permission === "granted" && !isChatActivelyVisible()) {
        try {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.ready;
                if (reg && reg.showNotification) {
                    await reg.showNotification("🎮 NovaHub Arcade", {
                        body: txt,
                        icon: "https://cdn-icons-png.flaticon.com/512/808/808439.png",
                        vibrate: [180, 80, 180],
                        tag: "novahub-" + Date.now()
                    });
                    return;
                }
            }
            new Notification("🎮 NovaHub Arcade", { body: txt });
        } catch (e) {}
    }
}

async function updatePresence(statusStr = "online", force = false) {
    if (!currentRoom || !myUid) return;
    const nowMs = Date.now();
    if (!force && statusStr === lastPresStatus && (nowMs - lastPresMs) < 15000) return;
    lastPresStatus = statusStr;
    lastPresMs = nowMs;
    const timeStr = new Date(nowMs).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    try {
        await setDoc(doc(db, "novahub_all_rooms", currentRoom), {
            roomId: currentRoom, pinCode: currentRoom, lastActive: new Date().toLocaleString(),
            [`presence_${myUid}`]: { accountCode: myAccountCode, name: myName, status: statusStr, time: timeStr, updated: nowMs }
        }, { merge: true });
    } catch (e) {}
}

setInterval(() => { if (isChatActivelyVisible()) updatePresence("online", true); }, 25000);
window.addEventListener('pagehide', () => updatePresence("offline", true));

function refreshLiveBanner() {
    if (!liveBanner) return;
    const sess = activeLiveSessions[currentRoom];
    if (sess) {
        liveBannerText.innerText = `Sharing Live Location (${sess.label})`;
        liveBanner.style.display = 'flex';
    } else {
        liveBanner.style.display = 'none';
    }
}

async function saveLiveShareCloud(roomId, shareObj) {
    if (!myAccountCode || !roomId) return;
    try {
        await setDoc(doc(db, "novahub_accounts", myAccountCode), {
            activeLiveShares: { [roomId]: shareObj }
        }, { merge: true });
    } catch (e) {}
}

function clearLocalLiveWatcher(roomId) {
    const sess = activeLiveSessions[roomId];
    if (!sess) return;
    if (sess.watchId !== null) navigator.geolocation.clearWatch(sess.watchId);
    if (sess.expireTimer) clearTimeout(sess.expireTimer);
    delete activeLiveSessions[roomId];
    refreshLiveBanner();
}

function attachLiveLocationWatcher(targetRoom, msgId, expiresAt, durLabel) {
    if (!navigator.geolocation || !targetRoom || !msgId) return;
    if (activeLiveSessions[targetRoom] && activeLiveSessions[targetRoom].msgId === msgId) return;
    if (activeLiveSessions[targetRoom]) clearLocalLiveWatcher(targetRoom);

    const pushCoords = async (p) => {
        if (!activeLiveSessions[targetRoom] || activeLiveSessions[targetRoom].msgId !== msgId) return;
        if (expiresAt > 0 && Date.now() >= expiresAt) { stopLiveLocation(targetRoom, msgId); return; }
        const nLat = p.coords.latitude.toFixed(6);
        const nLng = p.coords.longitude.toFixed(6);
        const nUrl = `https://www.google.com/maps?q=${nLat},${nLng}`;
        const updStr = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
        try {
            await updateDoc(doc(db, targetRoom, msgId), {
                lat: nLat, lng: nLng, mapUrl: nUrl, isLiveActive: true, lastUpdatedStr: updStr,
                originalAuditText: `🛰️ Live Location (${durLabel}): ${nUrl}`
            });
        } catch (e) {}
    };

    const session = { msgId, watchId: null, expireTimer: null, label: durLabel, lastUpdateMs: 0 };
    activeLiveSessions[targetRoom] = session;

    navigator.geolocation.getCurrentPosition(p => { session.lastUpdateMs = Date.now(); pushCoords(p); }, () => {}, { enableHighAccuracy: true, timeout: 15000 });
    session.watchId = navigator.geolocation.watchPosition(p => {
        if (Date.now() - session.lastUpdateMs < 8000) return;
        session.lastUpdateMs = Date.now();
        pushCoords(p);
    }, () => {}, { enableHighAccuracy: true, maximumAge: 6000, timeout: 15000 });

    if (expiresAt > 0) {
        const rem = expiresAt - Date.now();
        if (rem <= 0) { stopLiveLocation(targetRoom, msgId); return; }
        session.expireTimer = setTimeout(() => stopLiveLocation(targetRoom, msgId), rem);
    }
    refreshLiveBanner();
}

async function stopLiveLocation(roomId, msgId) {
    clearLocalLiveWatcher(roomId);
    await saveLiveShareCloud(roomId, null);
    if (roomId && msgId) {
        const endStr = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
        try { await updateDoc(doc(db, roomId, msgId), { isLiveActive: false, lastUpdatedStr: endStr }); } catch (e) {}
    }
    refreshLiveBanner();
}
window.stopLiveLocation = stopLiveLocation;

function stopAllLiveSessions() {
    Object.keys(activeLiveSessions).forEach(rId => clearLocalLiveWatcher(rId));
}

// ============================================================================
// 5. ROOM MANAGEMENT & REAL-TIME LISTENERS
// ============================================================================
async function syncAccountToCloud() {
    localStorage.setItem('nova_saved_rooms', JSON.stringify(savedRooms));
    if (!myAccountCode) return;
    try {
        await setDoc(doc(db, "novahub_accounts", myAccountCode), { savedRooms, updatedAt: new Date().toLocaleString() }, { merge: true });
    } catch (e) {}
}

function getRoomMeta(roomId) {
    return savedRooms.find(r => r.id === roomId) || { id: roomId, name: "Private Chat", locked: false, timer: "off" };
}

function updateActiveHeaderBadges(meta) {
    $('active-room-title').innerText = meta.name;
    $('drawer-room-name').innerText = `${meta.name} (ID: ${meta.peerCode || ''})`;
    const dp = $('active-room-dp');
    if (meta.dp) { dp.innerText = ''; dp.style.backgroundImage = `url(${meta.dp})`; }
    else { dp.style.backgroundImage = ''; dp.innerText = (meta.name || 'P').charAt(0).toUpperCase(); }
    const bEl = $('active-mode-badge');
    if (meta.timer && meta.timer !== 'off') { bEl.innerText = timerLabels[meta.timer]; bEl.style.display = 'inline-block'; }
    else bEl.style.display = 'none';
    const encKey = localStorage.getItem(`nova_enc_${currentRoom}`) || "";
    $('di-enc-sub').innerText = encKey ? "🔒 Custom Cipher Key Active" : "Optional cipher password";
}

function renderActiveStrip() {
    const strip = $('messenger-active-strip');
    if (!strip) return;
    strip.innerHTML = `
        <div class="story-bubble" id="my-story-shortcut">
            <div class="story-ring" style="background:rgba(255,255,255,0.15);">
                <div class="avatar"><span class="material-icons" style="font-size:20px;">add</span></div>
            </div>
            <span class="story-name">My Story</span>
        </div>
    `;
    bindClick('my-story-shortcut', () => $('tab-status')?.click());

    savedRooms.forEach(r => {
        if (r.locked) return;
        const init = (r.name || 'U').charAt(0).toUpperCase();
        const b = document.createElement('div');
        b.className = 'story-bubble';
        b.innerHTML = `
            <div class="story-ring">
                <div class="avatar" style="${r.dp ? `background-image:url(${r.dp})` : ''}">${r.dp ? '' : init}<div class="online-dot"></div></div>
            </div>
            <span class="story-name">${r.name}</span>
        `;
        b.addEventListener('click', () => selectRoom(r.id, true));
        strip.appendChild(b);
    });
}

function renderSidebarList() {
    const area = $('chats-list-area');
    if (!area) return;
    area.innerHTML = '';
    const searchVal = ($('pin-search-input')?.value || '').trim();
    myLockPin = localStorage.getItem('nova_lock_pin') || "";
    const unlockedBySearch = (myLockPin !== "" && searchVal === myLockPin);

    const visibleRooms = savedRooms.filter(r => {
        if (r.locked && !unlockedBySearch) return false;
        if (!unlockedBySearch && searchVal && !r.name.toLowerCase().includes(searchVal.toLowerCase()) && !(r.peerCode || '').includes(searchVal)) return false;
        return true;
    });

    if (visibleRooms.length === 0) {
        area.innerHTML = `<div class="empty-inbox">🔒 <b>Your Private Inbox is Empty</b><br>Tap <b>+ Add ID</b> above and enter your friend's ID number to start a private 1-on-1 chat.</div>`;
        return;
    }

    visibleRooms.forEach(r => {
        const tBadge = (r.timer && r.timer !== 'off') ? `<span class="mode-badge">${timerLabels[r.timer]}</span>` : '';
        const lockBadge = r.locked ? `<span class="mode-badge" style="color:#eab308; border-color:#eab308;">🔒 Hidden</span>` : '';
        const init = (r.name || 'U').charAt(0).toUpperCase();
        const div = document.createElement('div');
        div.className = `chat-item ${r.id === currentRoom && isRoomActivelyOpen ? 'active' : ''}`;
        div.innerHTML = `
            <div class="avatar" style="${r.dp ? `background-image:url(${r.dp})` : ''}">${r.dp ? '' : init}<div class="online-dot"></div></div>
            <div class="chat-item-info">
                <div class="chat-item-top"><span class="chat-item-name">${r.name} ${tBadge} ${lockBadge}</span></div>
                <div class="chat-item-sub">ID: ${r.peerCode || 'Private'} • Tap to message</div>
            </div>
        `;
        div.addEventListener('click', () => {
            if (r.locked) $('pin-search-input').value = '';
            selectRoom(r.id, true);
        });
        area.appendChild(div);
    });
}

function goBackToList(e) {
    if (e) e.stopPropagation();
    if (document.activeElement) document.activeElement.blur();
    isRoomActivelyOpen = false;
    $('chat-view').classList.remove('open');
    closeLayer(drawer); closeLayer(overlay); closeLayer(locModal); closeLayer(clearModal); closeLayer(genericModal);
    if ($('emoji-picker')) $('emoji-picker').classList.remove('show');
    window.scrollTo(0, 0);
    renderSidebarList();
}

function selectRoom(roomId, openUI = true) {
    const isSameRoom = (currentRoom === roomId);
    currentRoom = roomId;
    localStorage.setItem('nova_last_room', roomId);
    const meta = getRoomMeta(roomId);
    updateActiveHeaderBadges(meta);
    $('toggle-lock-chat').checked = !!meta.locked;
    $('select-vanish-timer').value = meta.timer || "off";

    if (openUI) {
        isRoomActivelyOpen = true;
        $('chat-view').classList.add('open');
        updatePresence("online", true);
        window.scrollTo(0, 0);
    } else {
        isRoomActivelyOpen = false;
        $('chat-view').classList.remove('open');
    }

    refreshLiveBanner();
    renderSidebarList();

    if (!isSameRoom || !unsubscribeChat) {
        listenToPresence(roomId);
        listenToMessages(roomId);
        listenToCalls(roomId);
    } else if (openUI) {
        markVisibleMessagesSeen();
        const box = $('msgs-container');
        setTimeout(() => { box.scrollTop = box.scrollHeight; }, 30);
    }
}

async function markVisibleMessagesSeen() {
    if (!isChatActivelyVisible()) return;
    const nowTime = new Date().toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    for (const id in cachedMessages) {
        const m = cachedMessages[id];
        if (!m || isMyMessage(m) || m.seenStatus || m.manualUnseen || m.isDeletedEveryone || markingSeen.has(id)) continue;
        markingSeen.add(id);
        const vTimer = m.vanishTimer || "off";
        try {
            await updateDoc(doc(db, currentRoom, id), {
                seenStatus: true, seenBy: myAccountCode, seenAtStr: nowTime, seenMs: Date.now(),
                ...(vTimer === "instant" ? { isDeletedEveryone: true, deletedByAudit: "Instant Snap Mode" } : {})
            });
        } catch (e) {} finally {
            markingSeen.delete(id);
        }
    }
}

function listenToPresence(roomId) {
    if (unsubscribePresence) unsubscribePresence();
    if (presenceRefreshTimer) clearInterval(presenceRefreshTimer);
    let latestPeer = null;

    const paintPresence = () => {
        if (!latestPeer) { $('active-room-status').innerText = `Tap name for Info & Clear Chat`; return; }
        const recent = (Date.now() - (latestPeer.updated || 0)) < 50000;
        if (recent && (latestPeer.status === "typing..." || latestPeer.status === "recording audio...")) {
            $('active-room-status').innerText = `✍️ ${latestPeer.name} is ${latestPeer.status}`;
        } else if (recent && latestPeer.status === "online") {
            $('active-room-status').innerText = `🟢 Active now`;
        } else {
            $('active-room-status').innerText = formatLastSeen(latestPeer.updated) || `Last active at ${latestPeer.time}`;
        }
    };

    unsubscribePresence = onSnapshot(doc(db, "novahub_all_rooms", roomId), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        latestPeer = null;
        for (let k in data) {
            if (!k.startsWith('presence_')) continue;
            if (k === `presence_${myUid}` || k === `presence_user_${myAccountCode}`) continue;
            const p = data[k];
            if (!p || (p.accountCode && String(p.accountCode) === String(myAccountCode))) continue;
            if (!latestPeer || (p.updated || 0) > (latestPeer.updated || 0)) latestPeer = p;
        }
        paintPresence();
    });

    presenceRefreshTimer = setInterval(paintPresence, 15000);
}

function buildMessageBodyHTML(roomId, id, m, isMe, encKey) {
    if (m.type === 'live_location') {
        const url = m.mapUrl || `https://www.google.com/maps?q=${m.lat},${m.lng}`;
        const isExpired = m.liveExpiresAt && m.liveExpiresAt > 0 && Date.now() > m.liveExpiresAt;
        const isActive = !!m.isLiveActive && !isExpired;
        if (m.isLiveActive && isExpired && isMe) stopLiveLocation(roomId, id);
        const statusLine = isActive
            ? `${m.liveDurationLabel || 'Live'} • Updated ${m.lastUpdatedStr || m.shortTime}`
            : `Live location ended • Last at ${m.lastUpdatedStr || m.shortTime}`;
        let html = `<a href="${url}" target="_blank" rel="noopener" class="loc-card ${isActive ? 'live-active' : 'live-ended'}" onclick="event.stopPropagation()">
            <span class="material-icons" style="font-size:26px; color:${isActive ? '#10b981' : '#94a3b8'};">share_location</span>
            <div style="overflow:hidden;">
                <div style="font-weight:700; font-size:13px; color:${isActive ? '#fff' : '#cbd5e1'}; display:flex; align-items:center;">
                    Live Location ${isActive ? '<span class="live-tag">● LIVE</span>' : ''}
                </div>
                <div style="font-size:11px; color:#cbd5e1;">${statusLine}</div>
                <div style="font-size:10.5px; color:#00f2fe; margin-top:2px;">Tap to open on Map</div>
            </div>
        </a>`;
        if (isActive && isMe) {
            html += `<button class="stop-live-btn" type="button" onclick="event.stopPropagation(); window.stopLiveLocation('${roomId}', '${id}')">
                <span class="material-icons" style="font-size:15px;">stop_circle</span> Stop Sharing Live Location
            </button>`;
        }
        return html;
    }
    if (m.type === 'location') {
        const url = m.mapUrl || `https://www.google.com/maps?q=${m.lat},${m.lng}`;
        return `<a href="${url}" target="_blank" rel="noopener" class="loc-card" onclick="event.stopPropagation()">
            <span class="material-icons" style="font-size:26px; color:#10b981;">location_on</span>
            <div>
                <div style="font-weight:700; font-size:13px; color:#00f2fe;">Current Location</div>
                <div style="font-size:11px; color:#cbd5e1;">${m.lat}, ${m.lng} • Tap to open Map</div>
            </div>
        </a>`;
    }
    if (m.type === 'image' || m.type === 'video' || m.type === 'audio') {
        if (m.isViewOnce) {
            const opened = m.viewedBy && m.viewedBy.includes(myUid);
            return opened
                ? `<div class="view-once-pill opened"><span class="material-icons" style="font-size:15px;">timelapse</span> Opened</div>`
                : `<div class="view-once-pill"><span class="material-icons" style="font-size:15px;">looks_one</span> 1-Time ${m.type.toUpperCase()}</div>`;
        }
        if (m.type === 'video') {
            const rawUrl = m.mediaUrl || '';
            const playUrl = rawUrl.startsWith('http') ? (rawUrl.includes('#') ? rawUrl : rawUrl + '#t=0.001') : rawUrl;
            const openBtn = rawUrl.startsWith('http')
                ? `<a href="${rawUrl}" target="_blank" rel="noopener" class="vid-open-link" onclick="event.stopPropagation()"><span class="material-icons" style="font-size:14px;">play_circle</span> Open / Play Video</a>`
                : '';
            return `<video src="${playUrl}" controls playsinline webkit-playsinline preload="metadata" class="msg-video" onclick="event.stopPropagation()"></video>${openBtn}`;
        }
        if (m.type === 'audio') {
            return `<audio src="${m.mediaUrl}" controls preload="metadata" style="width:195px; height:34px;" onclick="event.stopPropagation()"></audio>`;
        }
        return `<img src="${m.mediaUrl}" loading="lazy" class="msg-media">`;
    }
    return `<span>${decryptText(m.text, encKey)}</span>`;
}

function getBodySignature(m, encKey) {
    if (m.type === 'live_location') return `live:${m.lat}:${m.lng}:${m.isLiveActive}:${m.lastUpdatedStr}`;
    if (m.type === 'location') return `loc:${m.lat}:${m.lng}`;
    if (m.type === 'image' || m.type === 'video' || m.type === 'audio') {
        const opened = !!(m.viewedBy && m.viewedBy.includes(myUid));
        return `media:${m.type}:${m.isViewOnce}:${opened}`;
    }
    return `txt:${decryptText(m.text, encKey)}`;
}

function listenToMessages(roomId) {
    if (unsubscribeChat) unsubscribeChat();
    const box = $('msgs-container');
    box.innerHTML = '';
    cachedMessages = {};
    domMap = new Map();
    isInitialLoad = true;
    const encKey = localStorage.getItem(`nova_enc_${roomId}`) || "";
    let lastDatePillText = "";

    const q = query(collection(db, roomId), orderBy("sentMs", "asc"), limitToLast(35));

    unsubscribeChat = onSnapshot(q, (snap) => {
        let mediaCount = 0, starCount = 0;
        const visibleIds = new Set();
        let addedNewNode = false;
        const wasNearBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 140;

        snap.forEach(d => {
            const m = d.data();
            const id = d.id;
            cachedMessages[id] = m;
            if (m.isDeletedEveryone || (m.deletedFor && m.deletedFor.includes(myUid))) return;

            const vTimer = m.vanishTimer || "off";
            if (vTimer !== "off" && vTimer !== "instant" && timerMs[vTimer]) {
                const baseMs = m.seenMs || m.sentMs || Date.now();
                if (Date.now() - baseMs > timerMs[vTimer]) {
                    updateDoc(doc(db, roomId, id), { isDeletedEveryone: true, deletedByAudit: `Timer (${vTimer})` }).catch(() => {});
                    return;
                }
            }

            visibleIds.add(id);
            if (m.type === 'image' || m.type === 'video') mediaCount++;
            if (m.starredBy && m.starredBy.includes(myUid)) starCount++;

            const isMe = isMyMessage(m);
            const starIcon = (m.starredBy && m.starredBy.includes(myUid)) ? `<span class="material-icons" style="font-size:12px; color:#eab308;">star</span>` : '';
            const tick = m.seenStatus ? `<span class="material-icons seen-tick read">done_all</span>` : `<span class="material-icons seen-tick">check</span>`;
            const metaHtml = `${starIcon} ${m.isEdited ? 'Edited' : ''} <span>${m.shortTime || ''}</span> ${tick}`;
            const reactTxt = (m.reactions && Object.keys(m.reactions).length > 0) ? Object.values(m.reactions).join(' ') : '';
            const bodySig = getBodySignature(m, encKey);

            if (domMap.has(id)) {
                const entry = domMap.get(id);
                if (entry.bodySig !== bodySig) { entry.bodyEl.innerHTML = buildMessageBodyHTML(roomId, id, m, isMe, encKey); entry.bodySig = bodySig; }
                if (entry.metaHtml !== metaHtml) { entry.metaEl.innerHTML = metaHtml; entry.metaHtml = metaHtml; }
                if (entry.reactTxt !== reactTxt) { entry.reactEl.innerText = reactTxt; entry.reactEl.style.display = reactTxt ? 'flex' : 'none'; entry.reactTxt = reactTxt; }
            } else {
                const dLbl = m.dateLabel || "Today";
                if (dLbl !== lastDatePillText) {
                    const dp = document.createElement('div');
                    dp.className = 'date-pill';
                    dp.innerText = dLbl;
                    box.appendChild(dp);
                    lastDatePillText = dLbl;
                }
                const wrap = document.createElement('div');
                wrap.className = `msg-wrap ${isMe ? 'me' : 'other'}`;
                wrap.dataset.msgId = id;

                const bub = document.createElement('div');
                bub.className = 'msg-bubble';
                if (!isMe) {
                    const sEl = document.createElement('div');
                    sEl.className = 'msg-sender'; sEl.innerText = m.name || '';
                    bub.appendChild(sEl);
                }
                if (m.replyTo) {
                    const qEl = document.createElement('div');
                    qEl.className = 'msg-quote'; qEl.innerHTML = `<b>${m.replyTo.name}</b><br>${m.replyTo.text}`;
                    bub.appendChild(qEl);
                }

                const bodyEl = document.createElement('div');
                bodyEl.className = 'msg-body'; bodyEl.style.display = 'inline';
                bodyEl.innerHTML = buildMessageBodyHTML(roomId, id, m, isMe, encKey);
                bub.appendChild(bodyEl);

                const metaEl = document.createElement('span');
                metaEl.className = 'msg-meta'; metaEl.innerHTML = metaHtml;
                bub.appendChild(metaEl);

                bub.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const fresh = cachedMessages[id] || m;
                    if (fresh.isViewOnce && (!fresh.viewedBy || !fresh.viewedBy.includes(myUid))) openViewOnceModal(id, fresh);
                    else openContextMenu(e, id, fresh);
                });

                const reactEl = document.createElement('div');
                reactEl.className = 'msg-reactions'; reactEl.innerText = reactTxt;
                reactEl.style.display = reactTxt ? 'flex' : 'none';

                wrap.appendChild(bub); wrap.appendChild(reactEl);
                box.appendChild(wrap);
                domMap.set(id, { wrap, bodyEl, metaEl, reactEl, bodySig, metaHtml, reactTxt });
                addedNewNode = true;
            }
        });

        for (const [id, entry] of domMap.entries()) {
            if (!visibleIds.has(id)) { entry.wrap.remove(); domMap.delete(id); }
        }
        if (domMap.size === 0) { box.innerHTML = ''; lastDatePillText = ""; }

        $('di-media-count').innerText = mediaCount;
        $('di-star-count').innerText = starCount > 0 ? starCount : "None";

        snap.docChanges().forEach(ch => {
            if (ch.type === 'added') {
                const msg = ch.doc.data();
                if (!isInitialLoad && !isMyMessage(msg) && !msg.isDeletedEveryone) {
                    triggerStealthAlert(msg.type === 'text' ? 'text' : 'media');
                }
            }
        });

        if (isChatActivelyVisible()) {
            markVisibleMessagesSeen();
            if (isInitialLoad || (addedNewNode && wasNearBottom)) box.scrollTop = box.scrollHeight;
        }
        isInitialLoad = false;
    });
}

async function openViewOnceModal(id, m) {
    $('modal-title').innerText = "➀ One-Time Media";
    const playUrl = (m.mediaUrl || '').startsWith('http') ? m.mediaUrl + '#t=0.001' : m.mediaUrl;
    $('modal-body').innerHTML = m.type === 'video'
        ? `<video src="${playUrl}" controls autoplay playsinline webkit-playsinline style="width:100%; border-radius:8px; background:#000;"></video>`
        : (m.type === 'audio' ? `<audio src="${m.mediaUrl}" controls autoplay style="width:100%;"></audio>` : `<img src="${m.mediaUrl}" style="width:100%; border-radius:8px;">`);
    openLayer(genericModal);
    let v = [...(m.viewedBy || [])];
    if (!v.includes(myUid)) v.push(myUid);
    await updateDoc(doc(db, currentRoom, id), { viewedBy: v });
}

function openContextMenu(e, id, m) {
    const encKey = localStorage.getItem(`nova_enc_${currentRoom}`) || "";
    const dec = (m.type === 'location' || m.type === 'live_location') ? (m.mapUrl || m.text) : decryptText(m.text, encKey);
    selectedMsg = { id, ...m, decrypted: dec };
    openLayer(overlay);
    const w = document.body.clientWidth || window.innerWidth;
    const h = document.body.clientHeight || window.innerHeight;
    const x = Math.max(10, Math.min((e.clientX || w / 2) - 95, w - 230));
    const y = Math.max(65, Math.min(e.clientY || h / 2, h - 340));
    $('react-pill').style.left = x + 'px';
    $('react-pill').style.top = (y - 46) + 'px';
    $('ctx-menu').style.left = Math.min(x + 8, w - 210) + 'px';
    $('ctx-menu').style.top = y + 'px';
}

async function sendMessage() {
    if (!currentRoom) return showQuickToast("Please select a friend first!");
    const inp = $('msg-input');
    const rawText = inp.value.trim();
    if (!rawText) return;
    inp.value = '';
    if ($('emoji-picker')) $('emoji-picker').classList.remove('show');

    const encKey = localStorage.getItem(`nova_enc_${currentRoom}`) || "";
    const finalTxt = encryptText(rawText, encKey);

    if (editingMsgId) {
        await updateDoc(doc(db, currentRoom, editingMsgId), {
            text: finalTxt,
            originalAuditText: encKey ? "🔐 [Encrypted Message]" : rawText,
            isEdited: true
        });
        editingMsgId = null;
        $('reply-bar').style.display = 'none';
        return;
    }

    const now = new Date();
    const meta = getRoomMeta(currentRoom);
    await addDoc(collection(db, currentRoom), {
        type: "text",
        text: finalTxt,
        originalAuditText: encKey ? "🔐 [Encrypted Message]" : rawText,
        uid: myUid, accountCode: myAccountCode, name: myName,
        shortTime: getShortTime(now), dateLabel: getDateGroupLabel(now), sentAtStr: now.toLocaleString(),
        sentMs: Date.now(), vanishTimer: meta.timer || "off",
        timestamp: serverTimestamp(), replyTo: replyTarget, seenStatus: false, manualUnseen: false,
        reactions: {}, starredBy: [], deletedFor: [], isDeletedEveryone: false
    });
    replyTarget = null;
    $('reply-bar').style.display = 'none';
    updatePresence("online", true);
    sendStealthPushToPeer(currentRoom, "text");
}

function compressImg(file) {
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

function uploadWithTimeout(fRef, file, ms = 15000) {
    return Promise.race([
        uploadBytes(fRef, file, { contentType: file.type || 'video/mp4' }).then(() => getDownloadURL(fRef)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Storage timeout / not enabled')), ms))
    ]);
}

async function runClearAllChat(forEveryone) {
    if (!currentRoom) return;
    const rId = currentRoom;
    closeLayer(clearModal);
    showQuickToast("🧹 Clearing chat...");
    if (forEveryone && activeLiveSessions[rId]) await stopLiveLocation(rId, activeLiveSessions[rId].msgId);
    try {
        const snap = await getDocs(collection(db, rId));
        const ops = [];
        snap.docs.forEach(d => {
            const data = d.data();
            if (forEveryone) {
                if (!data.isDeletedEveryone) {
                    ops.push(updateDoc(doc(db, rId, d.id), { isDeletedEveryone: true, isLiveActive: false, deletedByAudit: myName }).catch(() => {}));
                }
            } else {
                const df = [...(data.deletedFor || [])];
                if (!df.includes(myUid)) {
                    df.push(myUid);
                    ops.push(updateDoc(doc(db, rId, d.id), { deletedFor: df }).catch(() => {}));
                }
            }
        });
        await Promise.all(ops);
        $('msgs-container').innerHTML = '';
        domMap.clear();
        showQuickToast("✅ Saare messages clear ho gaye!");
    } catch (e) {
        showQuickToast("⚠️ Clear chat failed, try again.");
    }
}

async function loadStories() {
    const feed = $('stories-feed');
    feed.innerHTML = 'Loading stories...';
    const snap = await getDocs(query(collection(db, "novahub_stories"), orderBy("timestamp", "desc")));
    feed.innerHTML = '';
    const myFriendCodes = savedRooms.filter(r => !r.locked).map(r => r.peerCode);

    snap.forEach(d => {
        const s = d.data();
        if (s.accountCode !== myAccountCode && !myFriendCodes.includes(s.accountCode)) return;
        const item = document.createElement('div');
        item.className = 'chat-item';
        item.innerHTML = `
            <div class="avatar" style="border:2px solid #00f2fe;">${s.type === 'image' ? '📷' : '✍️'}</div>
            <div class="chat-item-info">
                <div class="chat-item-name">${s.name}</div>
                <div class="chat-item-sub">${s.timeStr} • 👀 ${s.views ? s.views.length : 0} views</div>
            </div>
        `;
        item.addEventListener('click', async () => {
            let vList = s.views || [];
            if (!vList.includes(myName)) { vList.push(myName); await updateDoc(doc(db, "novahub_stories", d.id), { views: vList }); }
            $('modal-title').innerText = `${s.name}'s Story`;
            $('modal-body').innerHTML = `
                ${s.type === 'image' ? `<img src="${s.mediaUrl}" style="width:100%; border-radius:10px;">` : `<div style="padding:26px; background:var(--bg-nav); border-radius:12px; text-align:center; font-size:17px; font-weight:bold;">${s.text}</div>`}
                <div style="margin-top:12px; font-size:12px; color:var(--text-sub);">👀 Viewed by: ${vList.join(', ') || 'None'}</div>
            `;
            openLayer(genericModal);
            loadStories();
        });
        feed.appendChild(item);
    });
}

// ============================================================================
// 6. WEBRTC VOICE & VIDEO CALLS (ICE SUBCOLLECTIONS + TURN + REAL RINGTONE)
// ============================================================================
function syncSpk() {
    const vol = isLoud ? 1.0 : 0.25;
    if (remoteAud) remoteAud.volume = vol;
    if (remoteVid) remoteVid.volume = vol;
    $('btn-spk-call')?.classList.toggle('loud', isLoud);
    if ($('spk-icon')) $('spk-icon').innerText = isLoud ? 'volume_up' : 'volume_down';
}

async function drainPendingIce() {
    if (!pc || !pc.remoteDescription) return;
    while (pendingIceCandidates.length > 0) {
        const cand = pendingIceCandidates.shift();
        try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
    }
}

function subscribeRemoteIce(roomId, callId, subcolName) {
    if (unsubscribeRemoteIce) unsubscribeRemoteIce();
    const colRef = collection(db, "novahub_calls", roomId, subcolName);
    unsubscribeRemoteIce = onSnapshot(colRef, (snap) => {
        snap.docChanges().forEach(async (ch) => {
            if (ch.type !== 'added') return;
            const data = ch.doc.data();
            if (!data || data.callId !== callId || !data.candidate) return;
            if (pc && pc.remoteDescription) {
                try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) {}
            } else {
                pendingIceCandidates.push(data.candidate);
            }
        });
    });
}

function createPeerConnection(roomId, callId, isVideo, localSubcolName) {
    const peer = new RTCPeerConnection(RTC_CONFIG);
    localStream.getTracks().forEach(t => peer.addTrack(t, localStream));

    const remoteStream = new MediaStream();
    if (isVideo) { remoteVid.srcObject = remoteStream; remoteAud.srcObject = null; }
    else { remoteAud.srcObject = remoteStream; remoteVid.srcObject = null; }

    peer.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach(track => remoteStream.addTrack(track));
        if (isVideo) remoteVid.play().catch(() => {});
        else remoteAud.play().catch(() => {});
        syncSpk();
    };

    peer.onicecandidate = (e) => {
        if (e.candidate) {
            addDoc(collection(db, "novahub_calls", roomId, localSubcolName), {
                callId,
                candidate: e.candidate.toJSON(),
                ts: Date.now()
            }).catch(() => {});
        }
    };

    peer.oniceconnectionstatechange = () => {
        if (!pc) return;
        const st = peer.iceConnectionState;
        if (st === 'connected' || st === 'completed') {
            stopRingtone();
            clearTimeout(callTimeoutTimer);
            $('call-status-txt').innerText = isVideo ? "Video Connected 🟢" : "Audio Connected 🟢";
        } else if (st === 'checking') {
            $('call-status-txt').innerText = "Connecting...";
        } else if (st === 'disconnected') {
            $('call-status-txt').innerText = "Reconnecting...";
        } else if (st === 'failed') {
            $('call-status-txt').innerText = "Network Failed";
            setTimeout(() => cleanupCall(true), 1800);
        }
    };

    return peer;
}

async function cleanupCall(notifyCloud = true) {
    stopRingtone();
    clearTimeout(callTimeoutTimer);
    if (unsubscribeRemoteIce) { unsubscribeRemoteIce(); unsubscribeRemoteIce = null; }
    pendingIceCandidates = [];
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (pc) { try { pc.close(); } catch (e) {} }
    pc = null; localStream = null; isFs = false; isMuted = false; activeCallId = "";
    if (remoteVid) remoteVid.srcObject = null;
    if (remoteAud) remoteAud.srcObject = null;
    if (localVid) localVid.srcObject = null;
    if ($('btn-accept-call')) $('btn-accept-call').style.display = 'none';
    if ($('btn-mic-call')) $('btn-mic-call').classList.remove('muted');
    if ($('mic-icon')) $('mic-icon').innerText = 'mic';
    callHud.classList.remove('fullscreen');
    closeLayer(callHud);
    postToGame({ type: 'NOVA_CALL_FS', fullscreen: false });
    if (notifyCloud && currentRoom) {
        await setDoc(doc(db, "novahub_calls", currentRoom), { status: "ended", updated: Date.now() }, { merge: true }).catch(() => {});
    }
}

async function startCall(isVideo) {
    if (!currentRoom) return showQuickToast("Select a friend first!");
    ensureAudioContext();
    await cleanupCall(false);

    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    activeCallId = callId;
    openLayer(callHud);
    $('call-vid-box').style.display = isVideo ? 'flex' : 'none';
    $('call-status-txt').innerText = isVideo ? "Video Ringing..." : "Audio Ringing...";
    $('btn-accept-call').style.display = 'none';
    isLoud = isVideo; syncSpk();

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: isVideo ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (isVideo) localVid.srcObject = localStream;
    } catch (err) {
        showQuickToast("⚠️ Mic/Camera permission needed!");
        await cleanupCall(false);
        return;
    }

    pc = createPeerConnection(currentRoom, callId, isVideo, "callerCandidates");
    subscribeRemoteIce(currentRoom, callId, "calleeCandidates");

    const cDoc = doc(db, "novahub_calls", currentRoom);
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: isVideo });
    await pc.setLocalDescription(offer);
    await setDoc(cDoc, {
        callId,
        offer: { type: offer.type, sdp: offer.sdp },
        answer: null,
        callerUid: myUid,
        callerName: myName,
        isVideo,
        status: "ringing",
        updated: Date.now()
    });

    startRingtone('outgoing');
    sendStealthPushToPeer(currentRoom, "call");

    clearTimeout(callTimeoutTimer);
    callTimeoutTimer = setTimeout(() => {
        if (activeCallId === callId && (!pc || pc.iceConnectionState !== 'connected')) {
            showQuickToast("📞 No answer");
            cleanupCall(true);
        }
    }, 45000);
}

function listenToCalls(roomId) {
    if (unsubscribeCall) unsubscribeCall();
    const cDoc = doc(db, "novahub_calls", roomId);

    unsubscribeCall = onSnapshot(cDoc, async snap => {
        if (!snap.exists()) return;
        const d = snap.data();
        if (Date.now() - (d.updated || 0) > 65000) return;

        if (d.status === "ringing" && d.callerUid !== myUid) {
            if (activeCallId === d.callId && isLayerOpen(callHud)) return;
            activeCallId = d.callId || `inc_${d.updated}`;
            triggerStealthAlert("call");
            startRingtone('incoming');
            openLayer(callHud);
            $('call-vid-box').style.display = 'none';
            $('call-status-txt').innerText = `${d.callerName || 'Incoming'} (${d.isVideo ? 'Video' : 'Audio'})...`;

            const acc = $('btn-accept-call');
            acc.style.display = 'flex';
            acc.onclick = async () => {
                stopRingtone();
                acc.style.display = 'none';
                $('call-vid-box').style.display = d.isVideo ? 'flex' : 'none';
                $('call-status-txt').innerText = "Connecting...";
                isLoud = d.isVideo; syncSpk();
                try {
                    localStream = await navigator.mediaDevices.getUserMedia({
                        video: d.isVideo ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
                        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
                    });
                    if (d.isVideo) localVid.srcObject = localStream;
                } catch (err) {
                    showQuickToast("⚠️ Mic/Camera permission needed!");
                    cleanupCall(true);
                    return;
                }

                pc = createPeerConnection(roomId, d.callId, d.isVideo, "calleeCandidates");
                subscribeRemoteIce(roomId, d.callId, "callerCandidates");

                await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
                await drainPendingIce();
                const ans = await pc.createAnswer();
                await pc.setLocalDescription(ans);
                await updateDoc(cDoc, { answer: { type: ans.type, sdp: ans.sdp }, status: "connected", updated: Date.now() });
            };
        } else if (d.status === "connected" && d.callerUid === myUid && d.callId === activeCallId && pc && !pc.currentRemoteDescription && d.answer) {
            stopRingtone();
            clearTimeout(callTimeoutTimer);
            $('call-status-txt').innerText = "Connecting...";
            await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
            await drainPendingIce();
        } else if (d.status === "ended") {
            if (isLayerOpen(callHud) || pc || ringInterval) cleanupCall(false);
        }
    });
}

// ============================================================================
// 7. SECURE ADMIN DASHBOARD (ZERO HARDCODED SECRET, NO PLAIN PASSWORDS)
// ============================================================================
async function openGodDashboard() {
    openLayer(godModal);
    const accSnap = await getDocs(collection(db, "novahub_accounts"));
    let accHtml = '';
    accSnap.forEach(d => {
        const a = d.data();
        const pwState = a.passwordHash ? '🔒 SHA-256 Protected' : '⚠️ Pending Migration';
        accHtml += `<span style="display:inline-block; background:#1f2937; border:1px solid #eab308; padding:5px 10px; border-radius:6px; margin:4px;">👤 <b>${a.name}</b> | ID: <b style="color:#00f2fe;">${a.accountCode}</b> | <span style="color:#10b981;">${pwState}</span></span>`;
    });
    $('god-users-list').innerHTML = accHtml || 'No users registered.';

    const snap = await getDocs(collection(db, "novahub_all_rooms"));
    let html = '';
    snap.forEach(d => {
        const r = d.data();
        if (r.roomId !== 'global_novahub_chat') {
            html += `<button onclick="window.inspectGod('${r.roomId}')" style="margin:4px; padding:6px 10px; background:#2b0909; color:#fff; border:1px solid #ef4444; border-radius:6px; cursor:pointer;">🔑 ${r.roomId}</button>`;
        }
    });
    $('god-rooms').innerHTML = html || 'No active chats yet.';
    if (currentRoom) window.inspectGod(currentRoom);
}

window.godDelMsg = async (rId, mId) => { await deleteDoc(doc(db, rId, mId)); window.inspectGod(rId); };

window.inspectGod = async (rId) => {
    godRoom = rId;
    $('god-room-title').innerText = `🕵️ Chat: ${rId}`;
    const box = $('god-logs');
    const snap = await getDocs(query(collection(db, rId), orderBy("sentMs", "asc")));
    let html = '';
    snap.forEach(d => {
        const m = d.data();
        let st = m.isDeletedEveryone ? `<span style="color:#ef4444;">[DELETED FOR ALL by ${m.deletedByAudit || m.name}]</span>` : `<span style="color:#10b981;">[ACTIVE]</span>`;
        html += `<div style="border-bottom:1px dashed #450a0a; padding:8px 0;">
            <div><b>${m.name} (ID: ${m.accountCode || ''})</b> (${m.shortTime || ''}) ${st} <button onclick="window.godDelMsg('${rId}','${d.id}')" style="background:#ef4444; color:#fff; border:none; padding:2px 6px; cursor:pointer; float:right;">🔥 Hard Delete</button></div>
            <div style="color:#fff; margin-top:4px;">${m.type === 'image' ? `<img src="${m.mediaUrl}" style="max-width:150px;">` : (m.originalAuditText || m.text)}</div>
        </div>`;
    });
    box.innerHTML = html || 'Empty chat.';
};

// ============================================================================
// 8. ATTACH ALL UI EVENT LISTENERS
// ============================================================================
['btn-widget-close-side', 'btn-widget-close-chat', 'btn-cyber-close-widget', 'btn-lock-close-widget'].forEach(id => {
    bindClick(id, (e) => {
        e.stopPropagation();
        if (document.activeElement) document.activeElement.blur();
        postToGame({ type: 'NOVA_CLOSE_WIDGET' });
    });
});

bindClick('my-profile-chip-btn', () => { window.location.href = 'chat-settings.html'; });
bindClick('btn-mobile-back', goBackToList);
bindClick('open-contact-info', () => { if (currentRoom) openLayer(drawer); });
bindClick('btn-close-drawer', () => closeLayer(drawer));

// Auth Listeners (SHA-256 Hashing + Seamless Migration)
bindClick('tab-btn-login', () => {
    authMode = 'login';
    $('tab-btn-login').classList.add('active');
    $('tab-btn-signup').classList.remove('active');
    $('signup-name-field').style.display = 'none';
    $('btn-auth-submit').innerText = 'LOGIN TO MY ACCOUNT';
    errEl.innerText = '';
});
bindClick('tab-btn-signup', () => {
    authMode = 'signup';
    $('tab-btn-signup').classList.add('active');
    $('tab-btn-login').classList.remove('active');
    $('signup-name-field').style.display = 'block';
    $('btn-auth-submit').innerText = 'CREATE NEW PERMANENT ID';
    errEl.innerText = '';
});
bindClick('btn-auth-submit', async () => {
    const code = codeInp.value.trim();
    const pass = passInp.value.trim();
    const name = nameInp.value.trim();
    errEl.innerText = '';
    if (!code) { errEl.innerText = '⚠️ Please enter your ID Number / Code!'; return; }

    if (await verifyAdminCode(code)) {
        closeLayer(authScreen);
        openGodDashboard();
        return;
    }

    if (!pass) { errEl.innerText = '⚠️ Please enter your secret password!'; return; }

    const accRef = doc(db, "novahub_accounts", code);
    const snap = await getDoc(accRef);
    const hashedPass = await hashPassword(code, pass);

    if (authMode === 'signup') {
        if (snap.exists()) { errEl.innerText = `❌ ID "${code}" already exists! Use LOGIN.`; return; }
        if (!name) { errEl.innerText = '⚠️ Please enter your Display Name!'; return; }
        wipeLocalSessionData();
        myAccountCode = code; myUid = 'uid_' + code; myName = name; myDp = ""; myLockPin = ""; appLockEnabled = false; appLockPin = ""; savedRooms = [];
        await setDoc(accRef, {
            accountCode: code,
            passwordHash: hashedPass,
            uid: myUid,
            name: myName,
            dp: "",
            lockPin: "",
            appLockEnabled: false,
            appLockPin: "",
            savedRooms: [],
            createdAt: new Date().toLocaleString()
        });
    } else {
        if (!snap.exists()) { errEl.innerText = `❌ No account found for ID "${code}"!`; return; }
        const data = snap.data();

        let passwordOk = false;
        if (data.passwordHash) {
            passwordOk = (data.passwordHash === hashedPass);
        } else if (data.password) {
            if (data.password === pass) {
                passwordOk = true;
                await updateDoc(accRef, { passwordHash: hashedPass, password: deleteField() }).catch(() => {});
            }
        } else {
            passwordOk = true;
            await updateDoc(accRef, { passwordHash: hashedPass }).catch(() => {});
        }

        if (!passwordOk) { errEl.innerText = `❌ Wrong Password for ID "${code}"!`; return; }

        wipeLocalSessionData();
        myAccountCode = code; myUid = 'uid_' + code; myName = data.name || ("User_" + code);
        myDp = data.dp || ""; myLockPin = data.lockPin || "";
        appLockEnabled = !!data.appLockEnabled;
        appLockPin = data.appLockPin || "";
        savedRooms = (data.savedRooms || []).filter(r => r.id !== 'global_novahub_chat');
    }

    isAppUnlocked = true;
    saveSessionToLocal();
    closeLayer(authScreen);
    startAuthenticatedSession(false);
});

bindClick('btn-logout-now', () => {
    if (!confirm(`Logout from ID "${myAccountCode}" (${myName})?`)) return;
    updatePresence("offline", true);
    stopAllLiveSessions();
    cleanupCall(false);
    if (unsubscribeChat) unsubscribeChat();
    if (unsubscribeAccountSync) unsubscribeAccountSync();
    if (presenceRefreshTimer) clearInterval(presenceRefreshTimer);
    wipeLocalSessionData();
    window.location.reload();
});

// App Lock Listeners
bindClick('btn-unlock-app', unlockAppWithPin);
if ($('lock-pin-input')) $('lock-pin-input').addEventListener('keypress', e => { if (e.key === 'Enter') unlockAppWithPin(); });
bindClick('btn-lock-to-decoy', () => openLayer(cyberGate));
bindClick('btn-app-lock-toggle', () => {
    updateAppLockIconUI();
    $('set-app-lock-pin').value = appLockPin;
    $('lock-settings-msg').innerText = '';
    openLayer(lockSettingsModal);
});
bindClick('btn-close-lock-settings', () => closeLayer(lockSettingsModal));
if (lockSettingsModal) lockSettingsModal.addEventListener('click', e => { if (e.target === lockSettingsModal) closeLayer(lockSettingsModal); });
bindClick('btn-save-lock-settings', async () => {
    const wantsLock = $('toggle-app-lock-sw').checked;
    const newPin = $('set-app-lock-pin').value.trim();
    const msgEl = $('lock-settings-msg');
    if (wantsLock && newPin.length < 4) { msgEl.style.color = '#f87171'; msgEl.innerText = '⚠️ Kam se kam 4 digit ka PIN daalein!'; return; }
    appLockEnabled = wantsLock;
    if (newPin.length >= 4) appLockPin = newPin;
    localStorage.setItem('nova_app_lock_enabled', String(appLockEnabled));
    localStorage.setItem('nova_app_lock_pin', appLockPin);
    if (myAccountCode) await setDoc(doc(db, "novahub_accounts", myAccountCode), { appLockEnabled, appLockPin }, { merge: true }).catch(() => {});
    updateAppLockIconUI();
    msgEl.style.color = '#10b981';
    msgEl.innerText = appLockEnabled ? '✅ Chat Entry Lock ON ho gaya!' : '🔓 Chat Entry Lock OFF ho gaya!';
    setTimeout(() => closeLayer(lockSettingsModal), 650);
});
bindClick('btn-lock-now-manual', () => {
    if (!appLockPin || appLockPin.length < 4) { $('lock-settings-msg').style.color = '#f87171'; $('lock-settings-msg').innerText = '⚠️ Pehle 4+ digit PIN daal kar Save karein!'; return; }
    appLockEnabled = true;
    localStorage.setItem('nova_app_lock_enabled', 'true');
    updateAppLockIconUI();
    closeLayer(lockSettingsModal);
    lockAppIfEnabled();
});

// Shield Fake Notice Board
const openFakeNoticeBoard = (e) => { if (e) e.stopPropagation(); stopRingtone(); openLayer(cyberGate); };
bindClick('btn-panic-now', openFakeNoticeBoard);
bindClick('btn-chat-panic', openFakeNoticeBoard);
let gTaps = 0, gTimer = null;
bindClick('cyber-triple-tap', () => {
    gTaps++; clearTimeout(gTimer);
    if (gTaps >= 3) { gTaps = 0; closeLayer(cyberGate); markVisibleMessagesSeen(); }
    else gTimer = setTimeout(() => gTaps = 0, 650);
});

// Theme & Tabs
bindClick('btn-theme-mode', () => {
    document.body.classList.toggle('light-mode');
    localStorage.setItem('nova_theme_mode', document.body.classList.contains('light-mode') ? 'light' : 'dark');
});
bindClick('tab-chats', () => {
    $('tab-chats').classList.add('active');
    $('tab-status').classList.remove('active');
    $('chats-search-bar').style.display = 'flex';
    $('chats-list-area').style.display = 'block';
    $('status-list-area').style.display = 'none';
});
bindClick('tab-status', () => {
    $('tab-status').classList.add('active');
    $('tab-chats').classList.remove('active');
    $('chats-search-bar').style.display = 'none';
    $('chats-list-area').style.display = 'none';
    $('status-list-area').style.display = 'block';
    loadStories();
});

// Search & Add Friend
bindClick('btn-add-room', async () => {
    let friendCode = $('pin-search-input').value.trim();
    if (!friendCode) friendCode = prompt("👤 Enter Friend's Unique ID Number / Code:");
    if (!friendCode) return;
    friendCode = friendCode.trim();
    $('pin-search-input').value = '';
    if (await verifyAdminCode(friendCode)) { openGodDashboard(); return; }
    if (friendCode === myAccountCode) return alert("⚠️ That is your own ID! Enter your friend's ID.");
    const fSnap = await getDoc(doc(db, "novahub_accounts", friendCode));
    if (!fSnap.exists()) return alert(`❌ User ID "${friendCode}" not found! Ask your friend to Sign Up first.`);
    const fData = fSnap.data();
    const dmRoomId = make1on1RoomId(myAccountCode, friendCode);
    if (!savedRooms.find(r => r.id === dmRoomId)) {
        savedRooms.push({ id: dmRoomId, name: fData.name || (`User ${friendCode}`), peerCode: friendCode, dp: fData.dp || "", locked: false, timer: "off" });
        await syncAccountToCloud();
    }
    let friendRooms = (fData.savedRooms || []).filter(r => r.id !== 'global_novahub_chat');
    if (!friendRooms.find(r => r.id === dmRoomId)) {
        friendRooms.push({ id: dmRoomId, name: myName, peerCode: myAccountCode, dp: myDp, locked: false, timer: "off" });
        await setDoc(doc(db, "novahub_accounts", friendCode), { savedRooms: friendRooms }, { merge: true }).catch(() => {});
    }
    selectRoom(dmRoomId, true);
});

if ($('pin-search-input')) {
    $('pin-search-input').addEventListener('input', () => renderSidebarList());
    $('pin-search-input').addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const val = e.target.value.trim();
            if (val && await verifyAdminCode(val)) { e.target.value = ''; openGodDashboard(); }
        }
    });
}

// Chat Input, Media, Voice Notes, Emoji
bindClick('btn-send-msg', sendMessage);
if ($('msg-input')) {
    $('msg-input').addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });
    $('msg-input').addEventListener('input', () => {
        updatePresence("typing...", false);
        clearTimeout(typTimer);
        typTimer = setTimeout(() => updatePresence("online", true), 3000);
    });
}
bindClick('btn-vo-toggle', () => { isViewOnce = !isViewOnce; voBtn.classList.toggle('active', isViewOnce); });
bindClick('btn-attach', () => $('msg-file-input')?.click());
if ($('msg-file-input')) $('msg-file-input').addEventListener('change', async function() {
    if (!currentRoom) return showQuickToast("Select a friend first!");
    const file = this.files[0]; if (!file) return;
    this.value = '';
    const isVid = file.type.startsWith('video/');
    const now = new Date(), meta = getRoomMeta(currentRoom);
    const inp = $('msg-input'), prevPh = inp.placeholder;
    inp.placeholder = isVid ? "🎥 Uploading video..." : "📷 Sending photo...";
    try {
        let url = "";
        if (!isVid) {
            url = await compressImg(file);
        } else {
            const safeName = (file.name || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
            const fRef = sRef(storage, `chat_media/${currentRoom}/${Date.now()}_${safeName}`);
            try {
                url = await uploadWithTimeout(fRef, file, 15000);
            } catch (storageErr) {
                inp.placeholder = prevPh;
                $('modal-title').innerText = "🎥 Video Upload Issue";
                $('modal-body').innerHTML = `<p style="margin-bottom:8px;">Firebase Storage par video upload nahi ho paayi (${storageErr.code || storageErr.message}).</p>`;
                openLayer(genericModal);
                return;
            }
        }
        await addDoc(collection(db, currentRoom), {
            type: isVid ? "video" : "image", mediaUrl: url, text: isVid ? "🎥 Video" : "📷 Photo",
            originalAuditText: isVid ? "🎥 Video" : "📷 Photo", isViewOnce, viewedBy: [],
            uid: myUid, accountCode: myAccountCode, name: myName, shortTime: getShortTime(now), dateLabel: getDateGroupLabel(now),
            sentAtStr: now.toLocaleString(), sentMs: Date.now(), vanishTimer: meta.timer || "off",
            timestamp: serverTimestamp(), seenStatus: false, manualUnseen: false,
            reactions: {}, starredBy: [], deletedFor: [], isDeletedEveryone: false
        });
        sendStealthPushToPeer(currentRoom, "media");
    } catch (err) {
        showQuickToast("⚠️ Media send failed.");
    }
    inp.placeholder = prevPh;
    isViewOnce = false; voBtn.classList.remove('active');
});

bindClick('btn-vn-rec', async () => {
    if (!currentRoom) return showQuickToast("Select a friend first!");
    if (!isRec) {
        try {
            const st = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRec = new MediaRecorder(st);
            vnChunks = [];
            mediaRec.ondataavailable = e => vnChunks.push(e.data);
            mediaRec.onstop = () => {
                st.getTracks().forEach(t => t.stop());
                const r = new FileReader();
                r.onload = async ev => {
                    const now = new Date(), meta = getRoomMeta(currentRoom);
                    await addDoc(collection(db, currentRoom), {
                        type: "audio", mediaUrl: ev.target.result, text: "🎙️ Voice Note",
                        originalAuditText: "🎙️ Voice Note", isViewOnce, viewedBy: [],
                        uid: myUid, accountCode: myAccountCode, name: myName, shortTime: getShortTime(now), dateLabel: getDateGroupLabel(now),
                        sentAtStr: now.toLocaleString(), sentMs: Date.now(), vanishTimer: meta.timer || "off",
                        timestamp: serverTimestamp(), seenStatus: false, manualUnseen: false,
                        deletedFor: [], isDeletedEveryone: false
                    });
                    isViewOnce = false; voBtn.classList.remove('active');
                    sendStealthPushToPeer(currentRoom, "media");
                };
                r.readAsDataURL(new Blob(vnChunks, { type: 'audio/webm' }));
            };
            mediaRec.start();
            isRec = true; vnBtn.classList.add('rec');
            $('vn-icon').innerText = 'stop';
            updatePresence("recording audio...", true);
        } catch (e) { showQuickToast("⚠️ Mic permission needed."); }
    } else {
        mediaRec.stop();
        isRec = false; vnBtn.classList.remove('rec');
        $('vn-icon').innerText = 'mic';
        updatePresence("online", true);
    }
});

bindClick('btn-emoji', async (e) => {
    e.stopPropagation();
    if (!emojiPickerLoaded) {
        emojiPickerLoaded = true;
        try { await import("https://cdn.jsdelivr.net/npm/emoji-picker-element@1/index.js"); } catch (err) {}
    }
    $('emoji-picker').classList.toggle('show');
});
if ($('emoji-picker')) $('emoji-picker').addEventListener('emoji-click', e => { $('msg-input').value += e.detail.unicode; });

// Location Picker
bindClick('btn-share-location', () => {
    if (!currentRoom) return showQuickToast("Please select a friend first!");
    if (!navigator.geolocation) return showQuickToast("Location not supported on this browser.");
    openLayer(locModal);
});
bindClick('btn-close-loc-modal', () => closeLayer(locModal));
if (locModal) locModal.addEventListener('click', e => { if (e.target === locModal) closeLayer(locModal); });
bindClick('btn-banner-stop-live', () => { const sess = activeLiveSessions[currentRoom]; if (sess) stopLiveLocation(currentRoom, sess.msgId); });
document.querySelectorAll('.dur-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.dur-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedLiveHours = Number(chip.getAttribute('data-hours'));
    });
});
bindClick('btn-send-current-loc', () => {
    closeLayer(locModal);
    const targetRoom = currentRoom, inp = $('msg-input'), prevPh = inp.placeholder;
    inp.placeholder = "📍 Fetching GPS...";
    navigator.geolocation.getCurrentPosition(async (pos) => {
        inp.placeholder = prevPh;
        const lat = pos.coords.latitude.toFixed(6), lng = pos.coords.longitude.toFixed(6);
        const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        const now = new Date(), meta = getRoomMeta(targetRoom);
        await addDoc(collection(db, targetRoom), {
            type: "location", lat, lng, mapUrl, text: `📍 Current Location (${lat}, ${lng})`,
            originalAuditText: `📍 Current Location: ${mapUrl}`,
            uid: myUid, accountCode: myAccountCode, name: myName,
            shortTime: getShortTime(now), dateLabel: getDateGroupLabel(now), sentAtStr: now.toLocaleString(),
            sentMs: Date.now(), vanishTimer: meta.timer || "off",
            timestamp: serverTimestamp(), replyTo: replyTarget, seenStatus: false, manualUnseen: false,
            reactions: {}, starredBy: [], deletedFor: [], isDeletedEveryone: false
        });
        replyTarget = null; $('reply-bar').style.display = 'none';
        sendStealthPushToPeer(targetRoom, "media");
    }, () => { inp.placeholder = prevPh; showQuickToast("⚠️ GPS off ya Location permission denied!"); }, { enableHighAccuracy: true, timeout: 12000 });
});
bindClick('btn-start-live-loc', () => {
    closeLayer(locModal);
    const targetRoom = currentRoom, hours = selectedLiveHours, inp = $('msg-input'), prevPh = inp.placeholder;
    inp.placeholder = "🛰️ Starting Live GPS...";
    navigator.geolocation.getCurrentPosition(async (pos) => {
        inp.placeholder = prevPh;
        if (activeLiveSessions[targetRoom]) await stopLiveLocation(targetRoom, activeLiveSessions[targetRoom].msgId);
        const lat = pos.coords.latitude.toFixed(6), lng = pos.coords.longitude.toFixed(6);
        const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        const now = new Date(), meta = getRoomMeta(targetRoom);
        const expiresAt = hours > 0 ? (Date.now() + hours * 3600000) : 0;
        const endStr = hours > 0 ? getShortTime(new Date(expiresAt)) : "";
        const durLabel = hours === 0 ? "Until turned off" : (hours === 1 ? `1 hr (until ${endStr})` : `${hours} hrs (until ${endStr})`);

        const docRef = await addDoc(collection(db, targetRoom), {
            type: "live_location", isLiveActive: true, liveDurationHours: hours, liveDurationLabel: durLabel,
            liveExpiresAt: expiresAt, lastUpdatedStr: getShortTime(now), lat, lng, mapUrl,
            text: `🛰️ Live Location (${durLabel})`, originalAuditText: `🛰️ Live Location (${durLabel}): ${mapUrl}`,
            uid: myUid, accountCode: myAccountCode, name: myName,
            shortTime: getShortTime(now), dateLabel: getDateGroupLabel(now), sentAtStr: now.toLocaleString(),
            sentMs: Date.now(), vanishTimer: meta.timer || "off",
            timestamp: serverTimestamp(), replyTo: replyTarget, seenStatus: false, manualUnseen: false,
            reactions: {}, starredBy: [], deletedFor: [], isDeletedEveryone: false
        });
        replyTarget = null; $('reply-bar').style.display = 'none';

        await saveLiveShareCloud(targetRoom, { msgId: docRef.id, expiresAt, label: durLabel });
        attachLiveLocationWatcher(targetRoom, docRef.id, expiresAt, durLabel);
        sendStealthPushToPeer(targetRoom, "media");
    }, () => { inp.placeholder = prevPh; showQuickToast("⚠️ GPS off ya Location permission denied!"); }, { enableHighAccuracy: true, timeout: 12000 });
});

// Context Menu, Modals & Drawer
bindClick('btn-close-generic-modal', () => closeLayer(genericModal));
if (genericModal) genericModal.addEventListener('click', e => { if (e.target === genericModal) closeLayer(genericModal); });
if (overlay) overlay.addEventListener('click', () => closeLayer(overlay));

document.querySelectorAll('.react-emo').forEach(el => {
    el.addEventListener('click', async (e) => {
        e.stopPropagation(); closeLayer(overlay);
        const emo = el.getAttribute('data-emo');
        let r = { ...(selectedMsg.reactions || {}) };
        if (r[myUid] === emo) delete r[myUid]; else r[myUid] = emo;
        await updateDoc(doc(db, currentRoom, selectedMsg.id), { reactions: r });
    });
});
bindClick('cm-reply', (e) => {
    e.stopPropagation(); closeLayer(overlay);
    replyTarget = { name: selectedMsg.name, text: selectedMsg.decrypted };
    $('reply-title').innerText = `Replying to ${selectedMsg.name}`;
    $('reply-text').innerText = selectedMsg.decrypted;
    $('reply-bar').style.display = 'flex';
});
bindClick('btn-cancel-reply', () => { replyTarget = null; editingMsgId = null; $('reply-bar').style.display = 'none'; });
bindClick('cm-copy', (e) => { e.stopPropagation(); closeLayer(overlay); navigator.clipboard.writeText(selectedMsg.decrypted || '').catch(() => {}); showQuickToast("📋 Copied!"); });
bindClick('cm-info', (e) => {
    e.stopPropagation(); closeLayer(overlay);
    $('modal-title').innerText = "Message Info";
    $('modal-body').innerHTML = `<div>👤 <b>Sender:</b> ${selectedMsg.name} (ID: ${selectedMsg.accountCode || ''})</div><div>📅 <b>Sent:</b> ${selectedMsg.sentAtStr || selectedMsg.shortTime}</div><hr style="margin:8px 0; border-color:var(--border-col);"><div>👀 <b>Seen Status:</b> ${selectedMsg.seenStatus ? `✓✓ Seen (${selectedMsg.seenAtStr || 'Read'})` : '✓ Not Seen Yet'}</div>`;
    openLayer(genericModal);
});
bindClick('cm-star', async (e) => {
    e.stopPropagation(); closeLayer(overlay);
    let s = [...(selectedMsg.starredBy || [])];
    const i = s.indexOf(myUid);
    if (i > -1) s.splice(i, 1); else s.push(myUid);
    await updateDoc(doc(db, currentRoom, selectedMsg.id), { starredBy: s });
});
bindClick('cm-edit', (e) => {
    e.stopPropagation(); closeLayer(overlay);
    if (selectedMsg.type !== 'text') return;
    editingMsgId = selectedMsg.id;
    $('reply-title').innerText = "Editing Message";
    $('reply-text').innerText = selectedMsg.decrypted;
    $('reply-bar').style.display = 'flex';
    $('msg-input').value = selectedMsg.decrypted;
});
bindClick('cm-seen', async (e) => {
    e.stopPropagation(); closeLayer(overlay);
    const next = !selectedMsg.seenStatus;
    await updateDoc(doc(db, currentRoom, selectedMsg.id), { seenStatus: next, manualUnseen: !next, seenAtStr: next ? new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : "" });
});
bindClick('cm-del', (e) => {
    e.stopPropagation(); closeLayer(overlay);
    const target = selectedMsg;
    $('modal-title').innerText = "Delete Message";
    $('modal-body').innerHTML = `<button id="del-one-me" type="button" class="loc-action-btn" style="background:rgba(255,255,255,0.1); color:#fff; margin-bottom:10px;">🗑️ Delete for Me</button><button id="del-one-all" type="button" class="loc-action-btn" style="background:#dc2626; color:#fff;">🔥 Delete for Everyone</button>`;
    openLayer(genericModal);
    bindClick('del-one-me', async () => {
        closeLayer(genericModal);
        let d = [...(target.deletedFor || [])];
        if (!d.includes(myUid)) d.push(myUid);
        await updateDoc(doc(db, currentRoom, target.id), { deletedFor: d });
    });
    bindClick('del-one-all', async () => {
        closeLayer(genericModal);
        if (target.type === 'live_location' && target.isLiveActive && isMyMessage(target)) await stopLiveLocation(currentRoom, target.id);
        await updateDoc(doc(db, currentRoom, target.id), { isDeletedEveryone: true, deletedByAudit: myName });
    });
});

const openClearChatModal = (e) => { if (e) e.stopPropagation(); if (!currentRoom) return; closeLayer(overlay); closeLayer(drawer); openLayer(clearModal); };
bindClick('cm-clear-chat', openClearChatModal);
bindClick('di-storage', openClearChatModal);
bindClick('btn-close-clear-modal', () => closeLayer(clearModal));
if (clearModal) clearModal.addEventListener('click', e => { if (e.target === clearModal) closeLayer(clearModal); });
bindClick('btn-clear-me', () => runClearAllChat(false));
bindClick('btn-clear-all', () => runClearAllChat(true));

bindClick('btn-edit-contact-name', () => {
    const meta = getRoomMeta(currentRoom);
    let n = prompt("Edit Friend's Nickname:", meta.name);
    if (n && n.trim()) { meta.name = n.trim(); syncAccountToCloud(); updateActiveHeaderBadges(meta); renderSidebarList(); }
});
if ($('toggle-lock-chat')) $('toggle-lock-chat').addEventListener('change', (e) => {
    myLockPin = localStorage.getItem('nova_lock_pin') || "";
    if (e.target.checked && !myLockPin) { e.target.checked = false; alert("⚠️ Please set your Secret Lock PIN in Settings first!"); window.location.href = 'chat-settings.html'; return; }
    const meta = getRoomMeta(currentRoom);
    meta.locked = e.target.checked;
    syncAccountToCloud(); renderSidebarList(); renderActiveStrip();
    if (meta.locked) goBackToList();
});
if ($('select-vanish-timer')) $('select-vanish-timer').addEventListener('change', (e) => {
    const meta = getRoomMeta(currentRoom);
    meta.timer = e.target.value;
    syncAccountToCloud(); updateActiveHeaderBadges(meta); renderSidebarList();
});
bindClick('di-enc', () => {
    const curKey = localStorage.getItem(`nova_enc_${currentRoom}`) || "";
    let k = prompt("🔐 Enter Secret Encryption Password for this chat:", curKey);
    if (k === null) return;
    localStorage.setItem(`nova_enc_${currentRoom}`, k.trim());
    updateActiveHeaderBadges(getRoomMeta(currentRoom));
    listenToMessages(currentRoom);
});
bindClick('di-vib', () => {
    vibrationEnabled = !vibrationEnabled;
    localStorage.setItem('nova_vib', vibrationEnabled);
    $('di-vib-val').innerText = vibrationEnabled ? "ON" : "OFF";
    if (vibrationEnabled) playAlertBeep();
});
bindClick('di-notif', async () => {
    if ("Notification" in window && Notification.permission !== "granted") await Notification.requestPermission().catch(() => {});
    stealthNotifEnabled = !stealthNotifEnabled;
    localStorage.setItem('nova_stealth_notif', stealthNotifEnabled);
    $('di-notif-val').innerText = stealthNotifEnabled ? "ON" : "OFF";
    if (stealthNotifEnabled) initStealthFCM();
    triggerStealthAlert("text");
});
bindClick('di-remove-chat', () => {
    savedRooms = savedRooms.filter(r => r.id !== currentRoom);
    syncAccountToCloud(); goBackToList(); renderActiveStrip();
});
bindClick('di-media', () => {
    $('modal-title').innerText = "🖼️ Shared Media";
    let html = '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">', count = 0;
    for (let id in cachedMessages) {
        const m = cachedMessages[id];
        if ((m.type === 'image' || m.type === 'video') && !m.isViewOnce && !m.isDeletedEveryone) {
            count++;
            const pUrl = (m.mediaUrl || '').startsWith('http') ? m.mediaUrl + '#t=0.001' : m.mediaUrl;
            html += m.type === 'video' ? `<video src="${pUrl}" controls playsinline webkit-playsinline preload="metadata" style="width:100%; border-radius:8px; background:#000;"></video>` : `<img src="${m.mediaUrl}" style="width:100%; height:110px; object-fit:cover; border-radius:8px;">`;
        }
    }
    html += '</div>';
    $('modal-body').innerHTML = count > 0 ? html : "No media shared in this chat.";
    openLayer(genericModal);
});
bindClick('di-starred', () => {
    $('modal-title').innerText = "⭐ Starred Messages";
    let html = '';
    const encKey = localStorage.getItem(`nova_enc_${currentRoom}`) || "";
    for (let id in cachedMessages) {
        const m = cachedMessages[id];
        if (m.starredBy && m.starredBy.includes(myUid) && !m.isDeletedEveryone) {
            html += `<div style="background:var(--bg-nav); padding:8px; border-radius:8px; margin-bottom:8px; border-left:3px solid #eab308;"><div style="font-size:11px; color:var(--text-sub);"><b>${m.name}</b> • ${m.dateLabel || ''} ${m.shortTime || ''}</div><div style="margin-top:3px;">${m.type === 'image' ? `<img src="${m.mediaUrl}" style="max-width:120px; border-radius:4px;">` : decryptText(m.text, encKey)}</div></div>`;
        }
    }
    $('modal-body').innerHTML = html || "No starred messages.";
    openLayer(genericModal);
});

// Stories
bindClick('btn-add-status', async () => {
    let typeChoice = prompt("Post Story:\n1. Text Story\n2. Photo Story");
    if (typeChoice === "1") {
        let txt = prompt("Enter Story Text:");
        if (!txt) return;
        await addDoc(collection(db, "novahub_stories"), { uid: myUid, accountCode: myAccountCode, name: myName, type: "text", text: txt, timeStr: new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }), views: [], timestamp: serverTimestamp() });
        loadStories();
    } else if (typeChoice === "2") $('status-file-input')?.click();
});
if ($('status-file-input')) $('status-file-input').addEventListener('change', async function() {
    const file = this.files[0]; if (!file) return;
    const url = await compressImg(file);
    await addDoc(collection(db, "novahub_stories"), { uid: myUid, accountCode: myAccountCode, name: myName, type: "image", mediaUrl: url, text: "📷 Story", timeStr: new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }), views: [], timestamp: serverTimestamp() });
    loadStories();
});

// Calls
bindClick('btn-voice-call', (e) => { e.stopPropagation(); startCall(false); });
bindClick('btn-video-call', (e) => { e.stopPropagation(); startCall(true); });
bindClick('btn-end-call', () => cleanupCall(true));
bindClick('btn-spk-call', () => { isLoud = !isLoud; syncSpk(); });
bindClick('btn-mic-call', () => {
    if (localStream && localStream.getAudioTracks()[0]) {
        const t = localStream.getAudioTracks()[0];
        t.enabled = !t.enabled; isMuted = !t.enabled;
        $('btn-mic-call').classList.toggle('muted', isMuted);
        $('mic-icon').innerText = isMuted ? 'mic_off' : 'mic';
    }
});
bindClick('btn-fs-vid', () => {
    isFs = !isFs; callHud.classList.toggle('fullscreen', isFs);
    $('fs-icon').innerText = isFs ? 'close_fullscreen' : 'fullscreen';
    postToGame({ type: 'NOVA_CALL_FS', fullscreen: isFs });
});
bindClick('btn-hide-vid', () => {
    const op = remoteVid.style.opacity === '0' ? '1' : '0';
    remoteVid.style.opacity = op; localVid.style.opacity = op;
});

// Admin Dashboard
bindClick('btn-close-god-modal', () => closeLayer(godModal));
bindClick('god-purge-btn', async () => {
    if (!godRoom) return;
    const snap = await getDocs(collection(db, godRoom));
    for (const d of snap.docs) if (d.data().isDeletedEveryone || (d.data().deletedFor && d.data().deletedFor.length > 0)) await deleteDoc(doc(db, godRoom, d.id));
    window.inspectGod(godRoom);
});
bindClick('god-wipe-btn', async () => {
    if (!godRoom || !confirm("Wipe entire chat from Firebase permanently?")) return;
    const snap = await getDocs(collection(db, godRoom));
    for (const d of snap.docs) await deleteDoc(doc(db, godRoom, d.id));
    window.inspectGod(godRoom);
});

// Widget & Visibility Sync
window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'NOVA_WIDGET_STATE') return;
    isWidgetOpen = !!d.open;
    if (d.panic && (pc || localStream || ringInterval)) cleanupCall(false);
    if (!isWidgetOpen) {
        updatePresence("offline", true);
        lockAppIfEnabled();
    } else if (isWidgetOpen && isAppUnlocked && isRoomActivelyOpen) {
        updatePresence("online", true);
        markVisibleMessagesSeen();
        const box = $('msgs-container');
        if (box) setTimeout(() => { box.scrollTop = box.scrollHeight; }, 40);
    }
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        updatePresence("offline", true);
        lockAppIfEnabled();
    } else if (document.visibilityState === 'visible' && isAppUnlocked) {
        updatePresence("online", true);
        markVisibleMessagesSeen();
    }
});

// ============================================================================
// 9. START SESSION & HANDOFF FROM index.html
// ============================================================================
function startAuthenticatedSession(shouldApplyLock = true) {
    $('my-top-name').innerText = myName;
    $('my-top-id-tag').innerText = `My ID: ${myAccountCode}`;
    const dpEl = $('my-top-dp');
    if (myDp) { dpEl.innerHTML = '<div class="online-dot"></div>'; dpEl.style.backgroundImage = `url(${myDp})`; }
    else { dpEl.style.backgroundImage = ''; dpEl.innerHTML = `<span class="material-icons" style="font-size:20px;">person</span><div class="online-dot"></div>`; }
    updateAppLockIconUI();
    if (shouldApplyLock) lockAppIfEnabled();

    initStealthFCM();

    if (unsubscribeAccountSync) unsubscribeAccountSync();
    unsubscribeAccountSync = onSnapshot(doc(db, "novahub_accounts", myAccountCode), (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        if (typeof d.appLockEnabled === 'boolean' && d.appLockPin) {
            appLockEnabled = d.appLockEnabled;
            appLockPin = d.appLockPin;
            localStorage.setItem('nova_app_lock_enabled', String(appLockEnabled));
            localStorage.setItem('nova_app_lock_pin', appLockPin);
            updateAppLockIconUI();
        }
        if (d.savedRooms) {
            let updated = false;
            d.savedRooms.forEach(cloudRoom => {
                if (cloudRoom.id === 'global_novahub_chat') return;
                if (!savedRooms.find(r => r.id === cloudRoom.id)) { savedRooms.push(cloudRoom); updated = true; }
            });
            if (updated) {
                localStorage.setItem('nova_saved_rooms', JSON.stringify(savedRooms));
                renderSidebarList();
                renderActiveStrip();
            }
        }
        if (d.activeLiveShares) {
            Object.entries(d.activeLiveShares).forEach(([rId, share]) => {
                if (!share || !share.msgId) { clearLocalLiveWatcher(rId); return; }
                if (share.expiresAt > 0 && Date.now() >= share.expiresAt) { stopLiveLocation(rId, share.msgId); return; }
                attachLiveLocationWatcher(rId, share.msgId, share.expiresAt, share.label || 'Live');
            });
        }
    });

    renderSidebarList();
    renderActiveStrip();

    const lastId = localStorage.getItem('nova_last_room');
    const bgRoom = savedRooms.find(r => r.id === lastId) || savedRooms[0];
    if (bgRoom) selectRoom(bgRoom.id, false);
}

try {
    // 1. Direct Admin Handoff from index.html 3-Tap
    if (sessionStorage.getItem('nova_open_admin') === '1') {
        sessionStorage.removeItem('nova_open_admin');
        closeLayer(authScreen);
        openGodDashboard();
    } else if (myAccountCode && myName) {
        // 2. Existing Authenticated Session
        closeLayer(authScreen);
        startAuthenticatedSession(true);
    } else {
        // 3. Clean Prefill Handoff from index.html 3-Tap
        const prefill = sessionStorage.getItem('nova_prefill_code');
        if (prefill && codeInp) {
            sessionStorage.removeItem('nova_prefill_code');
            codeInp.value = prefill;
            passInp?.focus();
        }
    }
} catch (err) {
    console.error("NovaInit error:", err);
}

// ============================================================================
// NOVAHUB 2050 UNIVERSAL ENGINE - SYNCED WITH CLOUD ID, 7 TIMERS & ENCRYPTION
// ============================================================================
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { initializeFirestore, getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, onSnapshot, collection, addDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyCxlPiB7gOAnpkTG60a2LpyJt1Nfn8m3g8",
    authDomain: "novahub-201e5.firebaseapp.com",
    projectId: "novahub-201e5",
    storageBucket: "novahub-201e5.firebasestorage.app",
    messagingSenderId: "188612451279",
    appId: "1:188612451279:web:02895aafeab4fcef7ad0ba"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
let db;
try {
    db = initializeFirestore(app, { experimentalForceLongPolling: true }, "default");
} catch (e) {
    db = getFirestore(app, "default");
}
const storage = getStorage(app);

// Auto-Inject PWA Manifest, iOS Home Screen Tags & Service Worker
if (!document.querySelector('link[rel="manifest"]')) {
    const mLink = document.createElement('link');
    mLink.rel = 'manifest';
    mLink.href = 'manifest.json';
    document.head.appendChild(mLink);
}
if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const aLink = document.createElement('link');
    aLink.rel = 'apple-touch-icon';
    aLink.href = 'https://cdn-icons-png.flaticon.com/512/808/808439.png';
    document.head.appendChild(aLink);
}
let swReg = null;
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => { swReg = reg; }).catch(()=>{});
}

if (!document.querySelector('link[href*="Material+Icons"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
    document.head.appendChild(link);
}
if (!document.querySelector('script[src*="emoji-picker-element"]')) {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://cdn.jsdelivr.net/npm/emoji-picker-element@1/index.js';
    document.head.appendChild(script);
}

// Cloud Account & Auto User Identity
let myAccountCode = localStorage.getItem('nova_account_code') || "";
if (!localStorage.getItem('nova_uid')) {
    localStorage.setItem('nova_uid', myAccountCode ? ('uid_' + myAccountCode) : ('uid_' + Math.random().toString(36).substr(2, 9)));
}
if (!localStorage.getItem('nova_username')) {
    localStorage.setItem('nova_username', "Player_" + Math.floor(Math.random() * 9000 + 1000));
}
let myUid = localStorage.getItem('nova_uid');
let myName = localStorage.getItem('nova_username');

// State Variables
let isChatOpen = false;
let isPanicHidden = false;
let unreadCount = 0;
let isInitialLoad = true;
let currentRoom = localStorage.getItem('nova_last_room') || "global_novahub_chat";
let currentVanishTimer = localStorage.getItem(`nova_timer_${currentRoom}`) || "off";
let roomSecretKey = localStorage.getItem(`nova_enc_${currentRoom}`) || "";
let unsubscribeChat = null;
let unsubscribePresence = null;
let unsubscribeCall = null;
let isViewOnceMode = false;
let selectedMsg = null;
let replyTarget = null;
let editingMsgId = null;
let emojiPickerMode = 'input';
let cachedMessages = {};

let vibrationEnabled = localStorage.getItem('nova_vib') !== 'false';
let stealthNotifEnabled = localStorage.getItem('nova_stealth_notif') !== 'false';

let mediaRecorder = null;
let audioChunks = [];
let isRecordingVN = false;

let pc = null;
let localStream = null;
let isMicMuted = false;
let isSpeakerLoud = false;
let isVideoHidden = false;
let isCallFullScreen = false;
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const timerLabels = { off: "", instant: "⏱️ Instant", "1h": "⏱️ 1h", "24h": "⏱️ 24h", "7d": "⏱️ 1w", "30d": "⏱️ 1m", "365d": "⏱️ 1y" };
const timerMs = { "1h": 3600 * 1000, "24h": 24 * 3600 * 1000, "7d": 7 * 24 * 3600 * 1000, "30d": 30 * 24 * 3600 * 1000, "365d": 365 * 24 * 3600 * 1000 };

// ============================================================================
// POINT 5: REAL CIPHER ENCRYPTION ENGINE (LOCKS MESSAGES WITH SECRET KEY)
// ============================================================================
function encryptText(plainText, key) {
    if (!key) return plainText;
    try {
        let out = "";
        for (let i = 0; i < plainText.length; i++) {
            out += String.fromCharCode(plainText.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return "🔒ENC:" + btoa(unescape(encodeURIComponent(out)));
    } catch (e) { return plainText; }
}

function decryptText(cipherText, key) {
    if (!cipherText || !cipherText.startsWith("🔒ENC:")) return cipherText;
    if (!key) return "🔐 [Encrypted Message - Set Encryption Key in Info]";
    try {
        const raw = decodeURIComponent(escape(atob(cipherText.replace("🔒ENC:", ""))));
        let out = "";
        for (let i = 0; i < raw.length; i++) {
            out += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return out;
    } catch (e) { return "🔐 [Encrypted - Wrong Key]"; }
}

// ============================================================================
// 2050 CYBER-GLASS CSS STYLING
// ============================================================================
const style = document.createElement('style');
style.innerHTML = `
    .uchat-fab { position: fixed; bottom: 22px; right: 20px; width: 58px; height: 58px; background: linear-gradient(135deg, #00f2fe 0%, #4facfe 50%, #00a884 100%); border-radius: 50%; display: flex; justify-content: center; align-items: center; box-shadow: 0 0 20px rgba(0, 242, 254, 0.5), inset 0 0 10px rgba(255,255,255,0.4); cursor: pointer; z-index: 9990; transition: all 0.25s; user-select: none; border: 1.5px solid rgba(255,255,255,0.35); }
    .uchat-fab:active { transform: scale(0.9); }
    .uchat-fab .material-icons { font-size: 28px; color: #06131a; }
    .uchat-badge { position: absolute; top: -4px; right: -4px; background: #ff0055; color: white; font-size: 11px; font-weight: bold; width: 22px; height: 22px; border-radius: 50%; display: none; justify-content: center; align-items: center; border: 2px solid #090d16; }

    #uchat-secret-unhide-zone { position: fixed; top: 0; left: 0; width: 95px; height: 55px; z-index: 10010; background: transparent; pointer-events: none; }
    #uchat-secret-unhide-zone.active-panic { pointer-events: auto; }

    #uchat-stealth-toast { position: fixed; top: -80px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.96); border: 1px solid #00f2fe; color: #fff; padding: 10px 18px; border-radius: 30px; z-index: 10012; font-family: 'Segoe UI', sans-serif; font-size: 13px; display: flex; align-items: center; gap: 8px; box-shadow: 0 8px 25px rgba(0,0,0,0.8); transition: top 0.35s ease; pointer-events: none; white-space: nowrap; }
    #uchat-stealth-toast.show { top: 16px; }

    .uchat-box { position: fixed; bottom: 90px; right: 20px; width: 365px; max-width: 94vw; height: 535px; max-height: 78vh; background: rgba(9, 14, 23, 0.94); backdrop-filter: blur(18px); border: 1px solid rgba(0, 242, 254, 0.25); border-radius: 20px; display: none; flex-direction: column; z-index: 9991; box-shadow: 0 15px 50px rgba(0,0,0,0.9); overflow: hidden; font-family: 'Segoe UI', system-ui, sans-serif; color: #e9edef; }
    
    .uchat-header { padding: 10px 12px; background: linear-gradient(90deg, rgba(20, 30, 48, 0.96), rgba(15, 23, 42, 0.96)); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0, 242, 254, 0.18); position: relative; flex-shrink: 0; }
    .uchat-profile-trigger { flex: 1; display: flex; align-items: center; gap: 9px; cursor: pointer; overflow: hidden; padding: 2px; border-radius: 8px; }
    .uchat-avatar { width: 35px; height: 35px; border-radius: 50%; background: linear-gradient(135deg, #00a884, #00f2fe); display: flex; justify-content: center; align-items: center; color: #051923; font-weight: bold; flex-shrink: 0; }
    .uchat-title { font-weight: 700; font-size: 14px; color: #fff; display: flex; align-items: center; gap: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .uchat-sub { font-size: 11px; color: #38bdf8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .uchat-mode-pill { background: rgba(0, 242, 254, 0.15); border: 1px solid rgba(0, 242, 254, 0.4); color: #00f2fe; font-size: 9.5px; padding: 1px 6px; border-radius: 8px; }

    .uchat-h-icons { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
    .uchat-pill-btn { padding: 5px 9px; border-radius: 16px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); display: flex; align-items: center; gap: 2px; cursor: pointer; color: #e2e8f0; }
    .uchat-icon-btn { width: 31px; height: 31px; border-radius: 50%; background: rgba(255,255,255,0.06); display: flex; justify-content: center; align-items: center; cursor: pointer; color: #aebac1; }

    .uchat-call-dropdown { position: absolute; top: 52px; right: 44px; background: #182229; border: 1px solid rgba(0,242,254,0.3); border-radius: 12px; width: 150px; display: none; flex-direction: column; overflow: hidden; z-index: 9999; box-shadow: 0 10px 25px rgba(0,0,0,0.8); }
    .uchat-call-opt { padding: 10px 14px; font-size: 13px; display: flex; align-items: center; gap: 10px; cursor: pointer; color: #e9edef; border-bottom: 1px solid rgba(255,255,255,0.05); }

    #uchat-fake-lock-screen { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #0f172a; z-index: 9997; display: none; flex-direction: column; padding: 16px; color: #e2e8f0; user-select: none; }
    .fake-lb-row { display: flex; justify-content: space-between; padding: 12px; background: #1e293b; border-radius: 8px; margin-bottom: 8px; font-size: 13.5px; font-weight: bold; }

    .uchat-msgs { flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; background: radial-gradient(circle at center, rgba(16, 28, 44, 0.6) 0%, rgba(8, 12, 20, 0.95) 100%); }
    .uchat-date-pill { align-self: center; background: rgba(24, 34, 41, 0.9); border: 1px solid rgba(255,255,255,0.08); color: #94a3b8; font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 10px; margin: 8px 0; }

    .uchat-msg-wrap { display: flex; flex-direction: column; max-width: 82%; position: relative; margin-bottom: 4px; }
    .uchat-msg-wrap.me { align-self: flex-end; }
    .uchat-msg-wrap.other { align-self: flex-start; }

    .uchat-msg { padding: 7px 11px 5px 11px; border-radius: 14px; font-size: 13.5px; position: relative; word-wrap: break-word; cursor: pointer; line-height: 1.38; box-shadow: 0 2px 5px rgba(0,0,0,0.35); }
    .uchat-msg-wrap.me .uchat-msg { background: linear-gradient(135deg, #005c4b, #044e40); color: #e9edef; border-top-right-radius: 2px; border: 1px solid rgba(0, 242, 254, 0.15); }
    .uchat-msg-wrap.other .uchat-msg { background: #1e293b; color: #e9edef; border-top-left-radius: 2px; border: 1px solid rgba(255,255,255,0.06); }
    
    .uchat-sender { font-size: 11px; font-weight: bold; color: #38bdf8; margin-bottom: 2px; }
    .uchat-fwd { font-size: 10.5px; font-style: italic; color: rgba(255,255,255,0.6); display: flex; align-items: center; gap: 3px; margin-bottom: 2px; }
    .uchat-quote { background: rgba(0,0,0,0.3); border-left: 3px solid #00f2fe; padding: 4px 8px; border-radius: 6px; font-size: 11.5px; margin-bottom: 5px; color: #cbd5e1; }
    
    .uchat-status-row { display: inline-flex; justify-content: flex-end; align-items: center; gap: 3px; margin-top: 3px; font-size: 10px; color: rgba(255,255,255,0.65); float: right; margin-left: 8px; }
    .uchat-seen-tick { font-size: 14px !important; color: rgba(255,255,255,0.45); }
    .uchat-seen-tick.seen { color: #00f2fe; }

    .uchat-reactions { display: flex; gap: 2px; background: #1e293b; border: 1px solid rgba(0,242,254,0.3); border-radius: 12px; padding: 1px 6px; font-size: 12px; width: fit-content; margin-top: -6px; z-index: 2; align-self: flex-end; }

    .uchat-media { max-width: 215px; max-height: 220px; border-radius: 10px; display: block; margin-bottom: 3px; }
    .uchat-audio { width: 200px; height: 34px; margin: 3px 0; }
    .uchat-view-once { display: flex; align-items: center; gap: 6px; background: rgba(0, 242, 254, 0.08); padding: 7px 12px; border-radius: 18px; border: 1px dashed #00f2fe; color: #00f2fe; font-weight: 600; font-size: 12.5px; margin: 2px 0; }
    .uchat-view-once.opened { border-color: #64748b; color: #64748b; background: transparent; font-style: italic; font-weight: normal; }

    .uchat-reply-bar { background: #131c26; padding: 6px 12px; border-top: 1px solid #2a3942; display: none; justify-content: space-between; align-items: center; font-size: 12px; flex-shrink: 0; }
    
    .uchat-input-row { padding: 7px 8px; background: #141e30; display: flex; align-items: center; gap: 5px; border-top: 1px solid rgba(0, 242, 254, 0.15); flex-shrink: 0; }
    .uchat-input { flex: 1; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 8px 12px; border-radius: 20px; outline: none; font-size: 13.5px; min-width: 0; }
    
    .uchat-vo-btn { width: 26px; height: 26px; border-radius: 50%; border: 1.5px dashed #94a3b8; color: #94a3b8; font-size: 11px; font-weight: bold; display: flex; justify-content: center; align-items: center; cursor: pointer; flex-shrink: 0; }
    .uchat-vo-btn.active { background: #00f2fe; border: 1.5px solid #00f2fe; color: #051923; box-shadow: 0 0 10px #00f2fe; }

    .uchat-vn-btn { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,0.08); color: #00f2fe; border: none; display: flex; justify-content: center; align-items: center; cursor: pointer; flex-shrink: 0; }
    .uchat-vn-btn.recording { background: #ef4444; color: white; animation: pulseDot 0.8s infinite; }
    .uchat-send-btn { width: 35px; height: 35px; border-radius: 50%; background: linear-gradient(135deg, #00f2fe, #00a884); color: #051923; border: none; display: flex; justify-content: center; align-items: center; cursor: pointer; flex-shrink: 0; }

    /* MOBILE-FIXED INFO PAGE (NO CLIPPING) */
    .uchat-info-page { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #0b141a; z-index: 9996; display: none; flex-direction: column; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: 30px; }
    .info-top-bar { padding: 12px 14px; background: #141e30; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); position: sticky; top: 0; z-index: 5; flex-shrink: 0; }
    .info-card-group { background: #141e30; border-radius: 14px; margin: 8px 12px; border: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
    .info-row { padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.04); cursor: pointer; font-size: 13px; color: #e2e8f0; gap: 8px; }
    .info-row:last-child { border-bottom: none; }
    .info-row-left { display: flex; align-items: center; gap: 10px; flex: 1; }
    .info-row-val { font-size: 12px; color: #94a3b8; display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

    #uchat-call-hud { position: fixed; top: 62px; right: 16px; width: 245px; background: rgba(15, 23, 42, 0.96); backdrop-filter: blur(12px); border: 1.5px solid #00f2fe; border-radius: 16px; z-index: 10002; display: none; flex-direction: column; overflow: hidden; box-shadow: 0 10px 35px rgba(0,0,0,0.9); font-family: 'Segoe UI', sans-serif; }
    #uchat-call-hud.fullscreen { top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; width: 100vw !important; height: 100vh !important; border-radius: 0 !important; z-index: 10008 !important; }
    
    .call-video-stage { position: relative; width: 100%; height: 145px; background: #000; display: none; justify-content: center; align-items: center; }
    #uchat-call-hud.fullscreen .call-video-stage { flex: 1; height: calc(100vh - 70px); }
    #uchat-remote-vid { width: 100%; height: 100%; object-fit: cover; }
    #uchat-local-vid { width: 62px; height: 84px; position: absolute; bottom: 8px; right: 8px; border-radius: 8px; object-fit: cover; border: 1.5px solid #00f2fe; background: #111; z-index: 3; }
    #uchat-call-hud.fullscreen #uchat-local-vid { width: 110px; height: 150px; bottom: 16px; right: 16px; }

    .call-stage-tools { position: absolute; top: 6px; right: 6px; display: flex; gap: 6px; z-index: 4; }
    .stage-icon-btn { width: 28px; height: 28px; border-radius: 6px; background: rgba(0,0,0,0.65); border: 1px solid rgba(255,255,255,0.25); color: white; display: flex; justify-content: center; align-items: center; cursor: pointer; }

    .call-stealth-bar { padding: 8px 10px; background: #0f172a; display: flex; justify-content: space-between; align-items: center; gap: 4px; border-top: 1px solid rgba(255,255,255,0.08); }
    .stealth-status-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; animation: pulseDot 1.2s infinite; }
    @keyframes pulseDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    
    .call-btn-act { width: 34px; height: 34px; border-radius: 50%; border: none; color: white; display: flex; justify-content: center; align-items: center; cursor: pointer; }
    .call-btn-spk { background: #334155; color: #cbd5e1; }
    .call-btn-spk.loud { background: #0284c7; color: #fff; box-shadow: 0 0 10px #0284c7; }
    .call-btn-mic { background: #334155; color: #e2e8f0; }
    .call-btn-mic.muted { background: #ef4444 !important; color: #fff !important; box-shadow: 0 0 12px #ef4444; }
    .call-btn-cut { background: #dc2626; color: white; }

    emoji-picker.uchat-emoji { position: fixed; bottom: 150px; right: 25px; width: 320px; height: 280px; z-index: 10004; display: none; --background: #141e30; --border-color: #2a3942; border-radius: 12px; }
    emoji-picker.uchat-emoji.show { display: block; }

    #uchat-action-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9998; display: none; }
    .wa-react-bar { position: fixed; background: #1e293b; border-radius: 30px; padding: 6px 12px; display: flex; align-items: center; gap: 10px; box-shadow: 0 6px 25px rgba(0,0,0,0.7); z-index: 9999; border: 1px solid rgba(0,242,254,0.3); }
    .wa-react-emoji { font-size: 22px; cursor: pointer; }
    .wa-react-plus { width: 26px; height: 26px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; justify-content: center; align-items: center; cursor: pointer; color: #aebac1; font-size: 18px; }

    .uchat-menu { position: fixed; background: #1e293b; border: 1px solid rgba(0,242,254,0.25); border-radius: 12px; width: 200px; z-index: 9999; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.85); font-family: 'Segoe UI', sans-serif; }
    .uchat-menu-item { padding: 10px 14px; font-size: 13.5px; color: #e9edef; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.04); }

    .uchat-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 10005; display: none; justify-content: center; align-items: center; padding: 15px; font-family: 'Segoe UI', sans-serif; color: white; }
    .uchat-modal-box { background: #141e30; border: 1px solid #00f2fe; border-radius: 16px; width: 100%; max-width: 365px; padding: 16px; max-height: 82vh; overflow-y: auto; }

    #uchat-god-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #070000; z-index: 10009; display: none; flex-direction: column; font-family: monospace; color: #f87171; overflow-y: auto; }
    .god-header { padding: 14px 20px; background: #1f0000; border-bottom: 2px solid #ef4444; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 10; }
    .god-card { border: 1px solid #ef4444; background: rgba(239,68,68,0.05); border-radius: 8px; padding: 14px; margin-bottom: 16px; }
    .god-room-pill { display: inline-block; background: #2b0909; border: 1px solid #ef4444; color: #fff; padding: 6px 12px; border-radius: 6px; margin: 4px; cursor: pointer; font-size: 12px; }
    .god-btn-danger { background: #dc2626; color: #fff; border: none; padding: 5px 10px; border-radius: 5px; font-size: 11px; cursor: pointer; font-weight: bold; margin-right: 6px; }
`;
document.head.appendChild(style);

// Inject HTML UI
const wrapper = document.createElement('div');
wrapper.innerHTML = `
    <div id="uchat-secret-unhide-zone"></div>
    <div id="uchat-stealth-toast"><span class="material-icons" style="color:#00f2fe; font-size:18px;">sports_esports</span> <span id="uchat-toast-text">Game khelo **</span></div>
    <audio id="uchat-remote-aud" autoplay></audio>

    <div class="uchat-fab" id="uchat-fab">
        <span class="material-icons">bolt</span>
        <div class="uchat-badge" id="uchat-badge">0</div>
    </div>

    <div class="uchat-box" id="uchat-box">
        <div id="uchat-fake-lock-screen">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #334155; padding-bottom:10px;">
                <strong id="uchat-fake-unlock-trigger" style="font-size:16px; color:#eab308; cursor:pointer;">⚡ NOVA-OS Telemetry</strong>
                <span class="material-icons" style="cursor:pointer; color:#94a3b8;" onclick="document.getElementById('uchat-box').style.display='none'">close</span>
            </div>
            <div class="fake-lb-row" style="color:#eab308;"><span>🥇 1. Shadow_Ninja</span><span>9,840 XP</span></div>
            <div class="fake-lb-row" style="color:#cbd5e1;"><span>🥈 2. Pro_Gamer99</span><span>8,420 XP</span></div>
            <div class="fake-lb-row" style="color:#d97706;"><span>🥉 3. Nova_Master</span><span>7,910 XP</span></div>
            <div class="fake-lb-row"><span>4. Pixel_King</span><span>6,500 XP</span></div>
            <div style="margin-top:auto; text-align:center; font-size:11px; color:#64748b;">System Kernel Active • 120Hz</div>
        </div>

        <div class="uchat-header">
            <div class="uchat-profile-trigger" id="uchat-open-info" title="Tap for Info & Settings">
                <div class="uchat-avatar"><span class="material-icons" style="font-size:19px;">hub</span></div>
                <div style="overflow:hidden;">
                    <div class="uchat-title">
                        <span id="uchat-room-title">Global Hub</span>
                        <span id="uchat-header-timer" class="uchat-mode-pill" style="display:none;"></span>
                    </div>
                    <div class="uchat-sub" id="uchat-presence-text">online • Tap for Info</div>
                </div>
            </div>

            <div class="uchat-h-icons">
                <div class="uchat-icon-btn" id="uchat-btn-fakelock" title="Instant Fake Screen Lock"><span class="material-icons" style="font-size:17px; color:#eab308;">shield</span></div>
                <div class="uchat-pill-btn" id="uchat-call-menu-btn" title="Voice / Video Call">
                    <span class="material-icons" style="font-size:17px; color:#00f2fe;">call</span>
                    <span class="material-icons" style="font-size:14px;">expand_more</span>
                </div>
                <div class="uchat-icon-btn" id="uchat-btn-close" title="Tap to Close (Hold 1s for Panic Hide)"><span class="material-icons" style="font-size:18px;">close</span></div>
            </div>

            <div class="uchat-call-dropdown" id="uchat-call-dropdown">
                <div class="uchat-call-opt" id="uchat-start-acall"><span class="material-icons" style="font-size:18px; color:#10b981;">headset_mic</span> Voice Call</div>
                <div class="uchat-call-opt" id="uchat-start-vcall"><span class="material-icons" style="font-size:18px; color:#00f2fe;">videocam</span> Video Call</div>
            </div>
        </div>

        <!-- NOVAHUB INFO PAGE -->
        <div class="uchat-info-page" id="uchat-info-page">
            <div class="info-top-bar">
                <div style="display:flex; align-items:center; gap:8px; cursor:pointer;" id="uchat-info-back">
                    <span class="material-icons">arrow_back_ios</span>
                    <strong style="font-size:15px;" id="info-page-room-name">Room Settings</strong>
                </div>
                <button id="info-btn-edit-name" style="background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.2); padding:4px 10px; border-radius:12px; cursor:pointer; font-size:12px;">Edit Name</button>
            </div>

            <div class="info-card-group">
                <div class="info-row" id="info-row-cloud">
                    <div class="info-row-left"><span class="material-icons" style="color:#00f2fe;">fingerprint</span> Sync Cloud Access ID</div>
                    <div class="info-row-val" id="info-val-cloud" style="color:#00f2fe; font-weight:bold;">Set Code</div>
                </div>
                <div class="info-row" id="info-row-vib">
                    <div class="info-row-left"><span class="material-icons" style="color:#10b981;">vibration</span> Vibration Alert (Bzz)</div>
                    <div class="info-row-val" id="info-val-vib" style="color:#10b981; font-weight:bold;">ON</div>
                </div>
                <div class="info-row" id="info-row-notif">
                    <div class="info-row-left"><span class="material-icons" style="color:#a855f7;">notifications_active</span> Alerts (**, ₹₹, ⭐️⭐️)</div>
                    <div class="info-row-val" id="info-val-notif" style="color:#00f2fe; font-weight:bold;">ON</div>
                </div>
            </div>

            <div class="info-card-group">
                <div class="info-row" id="info-row-pin">
                    <div class="info-row-left"><span class="material-icons" style="color:#00f2fe;">vpn_key</span> Switch Room</div>
                    <div class="info-row-val"><span id="info-val-pin">Global</span> <span class="material-icons" style="font-size:16px;">chevron_right</span></div>
                </div>
                <div class="info-row">
                    <div class="info-row-left"><span class="material-icons" style="color:#f59e0b;">timelapse</span> Disappearing Timer</div>
                    <select id="uchat-select-timer" style="background:#0b141a; color:#00f2fe; border:1px solid #334155; padding:4px 8px; border-radius:8px; font-size:12px; font-weight:bold; outline:none;">
                        <option value="off">Off</option>
                        <option value="instant">⚡ Instant (Seen)</option>
                        <option value="1h">⏱️ 1 Hour</option>
                        <option value="24h">🕒 24 Hours</option>
                        <option value="7d">📅 1 Week</option>
                        <option value="30d">🗓️ 1 Month</option>
                        <option value="365d">📆 1 Year</option>
                    </select>
                </div>
                <div class="info-row" id="info-row-enc">
                    <div class="info-row-left"><span class="material-icons" style="color:#10b981;">enhanced_encryption</span> Secret Encryption Key</div>
                    <div class="info-row-val" id="info-val-enc">Standard</div>
                </div>
                <div class="info-row" id="info-row-media">
                    <div class="info-row-left"><span class="material-icons" style="color:#38bdf8;">perm_media</span> Media, Photos & Videos</div>
                    <div class="info-row-val">View <span class="material-icons" style="font-size:16px;">chevron_right</span></div>
                </div>
                <div class="info-row" id="info-row-starred">
                    <div class="info-row-left"><span class="material-icons" style="color:#eab308;">star_outline</span> Starred Messages</div>
                    <div class="info-row-val"><span class="material-icons" style="font-size:16px;">chevron_right</span></div>
                </div>
            </div>

            <div class="info-card-group">
                <div class="info-row" id="info-row-clear" style="color:#f87171;">
                    <div class="info-row-left"><span class="material-icons" style="color:#ef4444;">cleaning_services</span> Clear Room Chat</div>
                    <div class="info-row-val"><span class="material-icons" style="font-size:16px;">chevron_right</span></div>
                </div>
            </div>
        </div>

        <div class="uchat-msgs" id="uchat-msgs"></div>

        <div class="uchat-reply-bar" id="uchat-reply-bar">
            <div style="border-left: 3px solid #00f2fe; padding-left: 8px; overflow:hidden;">
                <div id="uchat-reply-title" style="color:#00f2fe; font-weight:bold; font-size:11px;">Replying</div>
                <div id="uchat-reply-text" style="color:#8696a0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:230px;"></div>
            </div>
            <span class="material-icons" id="uchat-reply-close" style="font-size:16px; cursor:pointer; color:#8696a0;">close</span>
        </div>

        <div class="uchat-input-row">
            <span class="material-icons" id="uchat-btn-emoji" style="color:#94a3b8; cursor:pointer; font-size:21px;">sentiment_satisfied_alt</span>
            <span class="material-icons" id="uchat-btn-attach" style="color:#94a3b8; cursor:pointer; font-size:21px;">attach_file</span>
            <input type="file" id="uchat-file-input" accept="image/*,video/*" style="display:none;">
            <div class="uchat-vo-btn" id="uchat-vo-btn" title="1-Time View Media / Voice Note">1</div>
            <input type="text" class="uchat-input" id="uchat-input" placeholder="Message...">
            <button class="uchat-vn-btn" id="uchat-btn-vn"><span class="material-icons" style="font-size:19px;" id="uchat-vn-icon">mic</span></button>
            <button class="uchat-send-btn" id="uchat-btn-send"><span class="material-icons" style="font-size:18px;">send</span></button>
        </div>
    </div>

    <emoji-picker class="uchat-emoji dark" id="uchat-emoji-picker"></emoji-picker>

    <div id="uchat-action-overlay">
        <div class="wa-react-bar" id="wa-react-bar">
            <span class="wa-react-emoji" data-emo="👍">👍</span>
            <span class="wa-react-emoji" data-emo="❤️">❤️</span>
            <span class="wa-react-emoji" data-emo="😂">😂</span>
            <span class="wa-react-emoji" data-emo="😮">😮</span>
            <span class="wa-react-emoji" data-emo="😢">😢</span>
            <span class="wa-react-emoji" data-emo="🙏">🙏</span>
            <span class="wa-react-emoji" data-emo="🔥">🔥</span>
            <div class="wa-react-plus" id="wa-react-plus">+</div>
        </div>

        <div class="uchat-menu" id="uchat-menu">
            <div class="uchat-menu-item" id="um-reply"><span class="material-icons" style="font-size:18px;">reply</span> Reply</div>
            <div class="uchat-menu-item" id="um-forward"><span class="material-icons" style="font-size:18px;">forward</span> Forward</div>
            <div class="uchat-menu-item" id="um-copy"><span class="material-icons" style="font-size:18px;">content_copy</span> Copy</div>
            <div class="uchat-menu-item" id="um-info"><span class="material-icons" style="font-size:18px;">info_outline</span> Info</div>
            <div class="uchat-menu-item" id="um-star"><span class="material-icons" style="font-size:18px; color:#eab308;">star_outline</span> Star / Unstar</div>
            <div class="uchat-menu-item" id="um-edit"><span class="material-icons" style="font-size:18px;">edit</span> Edit</div>
            <div class="uchat-menu-item" id="um-toggle-seen"><span class="material-icons" style="font-size:18px; color:#00f2fe;">done_all</span> Seen / Unseen</div>
            <div class="uchat-menu-item" id="um-del" style="color:#ef4444;"><span class="material-icons" style="font-size:18px;">delete_outline</span> Delete</div>
        </div>
    </div>

    <div id="uchat-call-hud">
        <div class="call-video-stage" id="uchat-video-stage">
            <video id="uchat-remote-vid" autoplay playsinline></video>
            <video id="uchat-local-vid" autoplay playsinline muted></video>
            <div class="call-stage-tools">
                <div class="stage-icon-btn" id="uchat-btn-hide-vid"><span class="material-icons" style="font-size:16px;">visibility_off</span></div>
                <div class="stage-icon-btn" id="uchat-btn-fullscreen"><span class="material-icons" style="font-size:16px;" id="uchat-fs-icon">fullscreen</span></div>
            </div>
        </div>
        <div class="call-stealth-bar">
            <div style="display:flex; align-items:center; gap:5px;">
                <div class="stealth-status-dot"></div>
                <span id="uchat-call-label" style="font-size:11px; font-weight:bold; color:#cbd5e1;">Audio</span>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
                <button class="call-btn-act" id="uchat-call-accept" style="background:#10b981; display:none;"><span class="material-icons" style="font-size:17px;">headset_mic</span></button>
                <button class="call-btn-act call-btn-spk" id="uchat-call-spk"><span class="material-icons" style="font-size:17px;" id="uchat-spk-icon">volume_down</span></button>
                <button class="call-btn-act call-btn-mic" id="uchat-call-mic"><span class="material-icons" style="font-size:17px;" id="uchat-mic-icon">mic</span></button>
                <button class="call-btn-act call-btn-cut" id="uchat-call-end"><span class="material-icons" style="font-size:17px;">close</span></button>
            </div>
        </div>
    </div>

    <div class="uchat-modal" id="uchat-info-modal">
        <div class="uchat-modal-box">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #2a3942; padding-bottom:8px; margin-bottom:10px;">
                <strong id="uchat-modal-title" style="color:#00f2fe;">Details</strong>
                <span class="material-icons" style="cursor:pointer;" onclick="document.getElementById('uchat-info-modal').style.display='none'">close</span>
            </div>
            <div id="uchat-info-body" style="font-size:13px; line-height:1.6;"></div>
        </div>
    </div>

    <div class="uchat-modal" id="uchat-vo-modal">
        <div class="uchat-modal-box" style="text-align:center;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="color:#00f2fe; font-weight:bold; font-size:13px;">➀ One-Time Media</span>
                <span class="material-icons" style="cursor:pointer; color:#ef4444;" id="uchat-vo-close">close</span>
            </div>
            <div id="uchat-vo-content"></div>
        </div>
    </div>

    <div id="uchat-god-modal">
        <div class="god-header">
            <div style="display:flex; align-items:center; gap:8px; font-size:15px; font-weight:bold;">
                <span class="material-icons">security</span> MASTER SYSTEM OVERRIDE (god4499)
            </div>
            <button onclick="document.getElementById('uchat-god-modal').style.display='none'" style="background:#ef4444; color:white; border:none; padding:5px 12px; border-radius:6px; font-weight:bold; cursor:pointer;">CLOSE</button>
        </div>
        <div style="padding:15px;">
            <div class="god-card">
                <h3 style="margin-bottom:8px; color:#fff;">🔑 All Created Rooms & PINs</h3>
                <div id="god-rooms-list">Loading...</div>
            </div>
            <div class="god-card">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                    <h3 style="color:#fff;" id="god-inspect-title">🕵️ Room History</h3>
                    <div>
                        <button class="god-btn-danger" id="god-btn-purge-deleted">🧹 Purge Deleted Only</button>
                        <button class="god-btn-danger" id="god-btn-wipe-room" style="background:#7f1d1d;">💣 Wipe Entire Room</button>
                    </div>
                </div>
                <div id="god-msgs-audit" style="max-height:58vh; overflow-y:auto; background:#000; padding:10px; border:1px solid #450a0a; border-radius:6px;">Select a room above.</div>
            </div>
        </div>
    </div>
`;
document.body.appendChild(wrapper);

// ============================================================================
// CORE LOGIC
// ============================================================================
const fab = document.getElementById('uchat-fab');
const badge = document.getElementById('uchat-badge');
const box = document.getElementById('uchat-box');
const msgsArea = document.getElementById('uchat-msgs');
const input = document.getElementById('uchat-input');
const voBtn = document.getElementById('uchat-vo-btn');
const emojiPicker = document.getElementById('uchat-emoji-picker');
const actionOverlay = document.getElementById('uchat-action-overlay');
const reactBar = document.getElementById('wa-react-bar');
const menu = document.getElementById('uchat-menu');
const infoPage = document.getElementById('uchat-info-page');
const unhideZone = document.getElementById('uchat-secret-unhide-zone');
const fakeLockScreen = document.getElementById('uchat-fake-lock-screen');

document.getElementById('uchat-btn-fakelock').addEventListener('click', () => {
    fakeLockScreen.style.display = 'flex';
});

let fakeUnlockTaps = 0, fakeUnlockTimer = null;
document.getElementById('uchat-fake-unlock-trigger').addEventListener('click', () => {
    fakeUnlockTaps++;
    clearTimeout(fakeUnlockTimer);
    if (fakeUnlockTaps >= 3) {
        fakeUnlockTaps = 0;
        fakeLockScreen.style.display = 'none';
    } else {
        fakeUnlockTimer = setTimeout(() => { fakeUnlockTaps = 0; }, 600);
    }
});

function triggerPanicHide() {
    isPanicHidden = true;
    isChatOpen = false;
    box.style.display = 'none';
    fab.style.display = 'none';
    emojiPicker.classList.remove('show');
    actionOverlay.style.display = 'none';
    unhideZone.classList.add('active-panic');
    if (pc || localStream) cleanupCall();
    updatePresence("offline");
}

function triggerPanicUnhide() {
    if (!isPanicHidden) return;
    isPanicHidden = false;
    fab.style.display = 'flex';
    unhideZone.classList.remove('active-panic');
}

let fabTapTimer = null;
fab.addEventListener('click', (e) => {
    e.stopPropagation();
    if (fabTapTimer) {
        clearTimeout(fabTapTimer);
        fabTapTimer = null;
        triggerPanicHide();
    } else {
        fabTapTimer = setTimeout(() => { fabTapTimer = null; toggleChat(); }, 230);
    }
});

let closeHoldTimer = null;
const closeBtn = document.getElementById('uchat-btn-close');
closeBtn.addEventListener('mousedown', () => { closeHoldTimer = setTimeout(triggerPanicHide, 700); });
closeBtn.addEventListener('touchstart', () => { closeHoldTimer = setTimeout(triggerPanicHide, 700); });
closeBtn.addEventListener('mouseup', () => clearTimeout(closeHoldTimer));
closeBtn.addEventListener('touchend', () => clearTimeout(closeHoldTimer));
closeBtn.addEventListener('click', () => { clearTimeout(closeHoldTimer); toggleChat(); });

let unhideTaps = 0, unhideTimer = null;
unhideZone.addEventListener('click', () => {
    unhideTaps++;
    clearTimeout(unhideTimer);
    if (unhideTaps >= 3) { unhideTaps = 0; triggerPanicUnhide(); }
    else { unhideTimer = setTimeout(() => { unhideTaps = 0; }, 600); }
});

function triggerStealthAlert(secretType) {
    if (vibrationEnabled && "vibrate" in navigator) {
        try { navigator.vibrate([120, 60, 120]); } catch (e) {}
    }
    if (!stealthNotifEnabled) return;

    let bodyText = "New high score challenge! Game khelo **";
    if (secretType === "media") bodyText = "Daily spin reward ready! Game khelo ₹₹";
    else if (secretType === "call") bodyText = "Multiplayer lobby active! Join now ⭐️⭐️";

    if (!isChatOpen && !isPanicHidden) {
        const toast = document.getElementById('uchat-stealth-toast');
        document.getElementById('uchat-toast-text').innerText = bodyText;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3500);
    }

    if ("Notification" in window && Notification.permission === "granted") {
        if (isChatOpen && document.visibilityState === 'visible') return;
        if (swReg && swReg.showNotification) {
            swReg.showNotification("🎮 NovaHub Arcade", {
                body: bodyText,
                icon: "https://cdn-icons-png.flaticon.com/512/808/808439.png"
            }).catch(() => {});
        } else {
            try { new Notification("🎮 NovaHub Arcade", { body: bodyText }); } catch (e) {}
        }
    }
}

function updateHeaderRoomUI() {
    const isGlobal = currentRoom === "global_novahub_chat";
    const pinLabel = isGlobal ? "Global Hub" : `Room: ${currentRoom.replace("pinned_chat_", "")}`;
    document.getElementById('uchat-room-title').innerText = pinLabel;
    document.getElementById('info-page-room-name').innerText = pinLabel;
    document.getElementById('info-val-pin').innerText = isGlobal ? "Global" : currentRoom.replace("pinned_chat_", "");
    
    currentVanishTimer = localStorage.getItem(`nova_timer_${currentRoom}`) || "off";
    document.getElementById('uchat-select-timer').value = currentVanishTimer;
    const tBadge = document.getElementById('uchat-header-timer');
    if (currentVanishTimer !== 'off') {
        tBadge.innerText = timerLabels[currentVanishTimer];
        tBadge.style.display = 'inline-block';
    } else {
        tBadge.style.display = 'none';
    }

    roomSecretKey = localStorage.getItem(`nova_enc_${currentRoom}`) || "";
    document.getElementById('info-val-enc').innerText = roomSecretKey ? "🔒 Key Active" : "Standard";
    document.getElementById('info-val-cloud').innerText = myAccountCode ? `ID: ${myAccountCode}` : "Sync ID";

    const vibEl = document.getElementById('info-val-vib');
    vibEl.innerText = vibrationEnabled ? "ON" : "OFF";
    vibEl.style.color = vibrationEnabled ? "#10b981" : "#ef4444";

    const notifEl = document.getElementById('info-val-notif');
    notifEl.innerText = stealthNotifEnabled ? "ON (**, ₹₹)" : "OFF";
    notifEl.style.color = stealthNotifEnabled ? "#00f2fe" : "#ef4444";
}
updateHeaderRoomUI();

// Single-Code Cloud Account Sync inside Universal Widget
document.getElementById('info-row-cloud').addEventListener('click', async () => {
    let code = prompt("🔑 Enter your 4+ digit Personal Access Code to sync your Cloud ID across devices:", myAccountCode);
    if (!code || code.trim().length < 4) return;
    code = code.trim();
    const accRef = doc(db, "novahub_accounts", code);
    const snap = await getDoc(accRef);
    if (snap.exists()) {
        const d = snap.data();
        myAccountCode = code;
        myUid = d.uid || ('uid_' + code);
        myName = d.name || myName;
        localStorage.setItem('nova_account_code', myAccountCode);
        localStorage.setItem('nova_uid', myUid);
        localStorage.setItem('nova_username', myName);
        alert(`✅ Cloud ID (${code}) Synced! Welcome back, ${myName}`);
    } else {
        let conf = prompt("Confirm your new code again to create permanent Cloud ID:");
        if (conf !== code) return alert("Codes did not match!");
        myAccountCode = code;
        myUid = 'uid_' + code;
        await setDoc(accRef, { accountCode: code, uid: myUid, name: myName, createdAt: new Date().toLocaleString() });
        localStorage.setItem('nova_account_code', myAccountCode);
        localStorage.setItem('nova_uid', myUid);
        alert(`✅ New Cloud ID (${code}) Created!`);
    }
    updateHeaderRoomUI();
    listenToRoom(currentRoom);
});

document.getElementById('uchat-select-timer').addEventListener('change', (e) => {
    currentVanishTimer = e.target.value;
    localStorage.setItem(`nova_timer_${currentRoom}`, currentVanishTimer);
    updateHeaderRoomUI();
});

document.getElementById('info-row-enc').addEventListener('click', () => {
    let k = prompt("🔐 Enter Secret Encryption Key for this room (Leave empty to disable):", roomSecretKey);
    if (k === null) return;
    roomSecretKey = k.trim();
    localStorage.setItem(`nova_enc_${currentRoom}`, roomSecretKey);
    updateHeaderRoomUI();
    listenToRoom(currentRoom);
});

document.getElementById('info-row-vib').addEventListener('click', () => {
    vibrationEnabled = !vibrationEnabled;
    localStorage.setItem('nova_vib', vibrationEnabled);
    updateHeaderRoomUI();
});

document.getElementById('info-row-notif').addEventListener('click', async () => {
    if ("Notification" in window && Notification.permission !== "granted") {
        await Notification.requestPermission().catch(()=>{});
    }
    stealthNotifEnabled = !stealthNotifEnabled;
    localStorage.setItem('nova_stealth_notif', stealthNotifEnabled);
    updateHeaderRoomUI();
    triggerStealthAlert("text");
});

function toggleChat() {
    isChatOpen = !isChatOpen;
    box.style.display = isChatOpen ? 'flex' : 'none';
    emojiPicker.classList.remove('show');
    actionOverlay.style.display = 'none';
    document.getElementById('uchat-call-dropdown').style.display = 'none';
    if (isChatOpen) {
        unreadCount = 0;
        badge.style.display = 'none';
        updatePresence("online");
        markRoomMessagesSeen();
        setTimeout(() => { msgsArea.scrollTop = msgsArea.scrollHeight; }, 60);
    } else {
        updatePresence("offline");
    }
}

document.getElementById('uchat-open-info').addEventListener('click', () => {
    updateHeaderRoomUI();
    infoPage.style.display = 'flex';
});
document.getElementById('uchat-info-back').addEventListener('click', () => {
    infoPage.style.display = 'none';
});

document.getElementById('info-btn-edit-name').addEventListener('click', async () => {
    let newName = prompt("Enter your display name:", myName);
    if (newName && newName.trim() !== "") {
        myName = newName.trim();
        localStorage.setItem('nova_username', myName);
        if (myAccountCode) {
            await setDoc(doc(db, "novahub_accounts", myAccountCode), { name: myName }, { merge: true }).catch(()=>{});
        }
        updatePresence("online");
    }
});

document.getElementById('info-row-pin').addEventListener('click', () => {
    let pin = prompt("Enter Room Code (Leave empty for Global Hub):");
    if (pin === null) return;
    pin = pin.trim();

    if (pin.toLowerCase() === "god4499") {
        infoPage.style.display = 'none';
        openGodDashboard();
        return;
    }

    if (unsubscribeChat) unsubscribeChat();
    currentRoom = pin === "" ? "global_novahub_chat" : "pinned_chat_" + pin;
    localStorage.setItem('nova_last_room', currentRoom);
    updateHeaderRoomUI();
    infoPage.style.display = 'none';
    updatePresence("online");
    listenToPresence(currentRoom);
    listenToRoom(currentRoom);
    listenToCalls(currentRoom);
});

document.getElementById('info-row-media').addEventListener('click', () => {
    document.getElementById('uchat-modal-title').innerText = "🖼️ Shared Media";
    let html = '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">';
    let count = 0;
    for (let id in cachedMessages) {
        const m = cachedMessages[id];
        if ((m.type === 'image' || m.type === 'video') && !m.isViewOnce && !m.isDeletedEveryone) {
            count++;
            html += m.type === 'video'
                ? `<video src="${m.mediaUrl}" controls style="width:100%; border-radius:8px;"></video>`
                : `<img src="${m.mediaUrl}" style="width:100%; height:110px; object-fit:cover; border-radius:8px;">`;
        }
    }
    html += '</div>';
    document.getElementById('uchat-info-body').innerHTML = count > 0 ? html : "No media in this room.";
    document.getElementById('uchat-info-modal').style.display = 'flex';
});

document.getElementById('info-row-starred').addEventListener('click', () => {
    document.getElementById('uchat-modal-title').innerText = "⭐ Starred Messages";
    let html = '';
    for (let id in cachedMessages) {
        const m = cachedMessages[id];
        if (m.starredBy && m.starredBy.includes(myUid) && !m.isDeletedEveryone) {
            html += `<div style="background:#0b141a; padding:8px; border-radius:8px; margin-bottom:8px; border-left:3px solid #eab308;">
                <div style="font-size:11px; color:#8696a0;"><b>${m.name}</b> • ${m.dateLabel || ''} ${m.shortTime || ''}</div>
                <div style="margin-top:3px;">${m.type === 'image' ? `<img src="${m.mediaUrl}" style="max-width:120px; border-radius:4px;">` : decryptText(m.text, roomSecretKey)}</div>
            </div>`;
        }
    }
    document.getElementById('uchat-info-body').innerHTML = html || "No starred messages.";
    document.getElementById('uchat-info-modal').style.display = 'flex';
});

document.getElementById('info-row-clear').addEventListener('click', async () => {
    let choice = prompt("Clear Chat:\n1. Clear for me\n2. Clear for everyone");
    if (!choice) return;
    const snap = await getDocs(query(collection(db, currentRoom)));
    snap.forEach(async (d) => {
        const data = d.data();
        if (choice.trim() === "1") {
            let delFor = data.deletedFor || [];
            if (!delFor.includes(myUid)) delFor.push(myUid);
            await updateDoc(doc(db, currentRoom, d.id), { deletedFor: delFor });
        } else if (choice.trim() === "2") {
            await updateDoc(doc(db, currentRoom, d.id), { isDeletedEveryone: true, deletedByAudit: myName });
        }
    });
    infoPage.style.display = 'none';
});

async function updatePresence(statusStr = "online") {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    try {
        await setDoc(doc(db, "novahub_all_rooms", currentRoom), {
            roomId: currentRoom,
            pinCode: currentRoom === "global_novahub_chat" ? "Global" : currentRoom.replace("pinned_chat_", ""),
            lastActive: new Date().toLocaleString(),
            [`presence_${myUid}`]: { name: myName, status: statusStr, time: timeStr, updated: Date.now() }
        }, { merge: true });
    } catch (e) {}
}

let typingResetTimer = null;
input.addEventListener('input', () => {
    updatePresence("typing...");
    clearTimeout(typingResetTimer);
    typingResetTimer = setTimeout(() => updatePresence("online"), 2200);
});

function listenToPresence(roomId) {
    if (unsubscribePresence) unsubscribePresence();
    unsubscribePresence = onSnapshot(doc(db, "novahub_all_rooms", roomId), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        let otherStatus = `You: ${myName} • Tap for Info`;
        for (let key in data) {
            if (key.startsWith('presence_') && key !== `presence_${myUid}`) {
                const p = data[key];
                const isRecent = (Date.now() - (p.updated || 0)) < 55000;
                if (isRecent && (p.status === "typing..." || p.status === "recording audio...")) {
                    otherStatus = `✍️ ${p.name} is ${p.status}`;
                } else if (isRecent && p.status === "online") {
                    otherStatus = `🟢 ${p.name}: online`;
                } else {
                    otherStatus = `${p.name}: last seen ${p.time}`;
                }
            }
        }
        document.getElementById('uchat-presence-text').innerText = otherStatus;
    });
}
window.addEventListener('beforeunload', () => updatePresence("offline"));

// Voice Note Recorder
const vnBtn = document.getElementById('uchat-btn-vn');
const vnIcon = document.getElementById('uchat-vn-icon');

vnBtn.addEventListener('click', async () => {
    if (!isRecordingVN) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(audioChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const now = new Date();
                    await addDoc(collection(db, currentRoom), {
                        type: "audio",
                        mediaUrl: ev.target.result,
                        text: "🎙️ Voice Note",
                        originalAuditText: "🎙️ Voice Note",
                        isViewOnce: isViewOnceMode,
                        viewedBy: [],
                        uid: myUid,
                        name: myName,
                        shortTime: getShortTime(now),
                        dateLabel: getDateGroupLabel(now),
                        sentAtStr: now.toLocaleString(),
                        sentMs: Date.now(),
                        vanishTimer: currentVanishTimer,
                        timestamp: serverTimestamp(),
                        replyTo: replyTarget ? { ...replyTarget } : null,
                        seenStatus: false,
                        reactions: {},
                        starredBy: [],
                        deletedFor: [],
                        isDeletedEveryone: false
                    });
                    isViewOnceMode = false;
                    voBtn.classList.remove('active');
                    updatePresence("online");
                };
                reader.readAsDataURL(blob);
            };
            mediaRecorder.start();
            isRecordingVN = true;
            vnBtn.classList.add('recording');
            vnIcon.innerText = 'stop';
            input.placeholder = "🔴 Recording... Tap Stop to Send";
            updatePresence("recording audio...");
        } catch (err) {
            alert("Microphone permission required.");
        }
    } else {
        mediaRecorder.stop();
        isRecordingVN = false;
        vnBtn.classList.remove('recording');
        vnIcon.innerText = 'mic';
        input.placeholder = "Message...";
    }
});

voBtn.addEventListener('click', () => {
    isViewOnceMode = !isViewOnceMode;
    voBtn.classList.toggle('active', isViewOnceMode);
});

document.getElementById('uchat-btn-emoji').addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPickerMode = 'input';
    emojiPicker.classList.toggle('show');
});

document.getElementById('wa-react-plus').addEventListener('click', (e) => {
    e.stopPropagation();
    actionOverlay.style.display = 'none';
    emojiPickerMode = 'reaction';
    emojiPicker.classList.add('show');
});

emojiPicker.addEventListener('emoji-click', async (e) => {
    const unicode = e.detail.unicode;
    if (emojiPickerMode === 'reaction' && selectedMsg) {
        await applyReaction(selectedMsg.id, unicode);
        emojiPicker.classList.remove('show');
    } else {
        input.value += unicode;
        input.focus();
    }
});

document.querySelectorAll('.wa-react-emoji').forEach(el => {
    el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const emo = el.getAttribute('data-emo');
        if (selectedMsg) await applyReaction(selectedMsg.id, emo);
        actionOverlay.style.display = 'none';
    });
});

async function applyReaction(msgId, emo) {
    const m = cachedMessages[msgId];
    if (!m) return;
    let reactions = m.reactions || {};
    if (reactions[myUid] === emo) delete reactions[myUid];
    else reactions[myUid] = emo;
    await updateDoc(doc(db, currentRoom, msgId), { reactions });
}

function getDateGroupLabel(dateObj) {
    const d = dateObj || new Date();
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function getShortTime(dateObj) {
    const d = dateObj || new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function handleSend() {
    const rawText = input.value.trim();
    if (!rawText) return;
    input.value = "";
    emojiPicker.classList.remove('show');

    const finalStoredText = encryptText(rawText, roomSecretKey);

    if (editingMsgId) {
        const msgRef = doc(db, currentRoom, editingMsgId);
        await updateDoc(msgRef, { text: finalStoredText, isEdited: true });
        cancelReplyOrEdit();
        return;
    }

    const now = new Date();
    await addDoc(collection(db, currentRoom), {
        type: "text",
        text: finalStoredText,
        originalAuditText: rawText,
        uid: myUid,
        name: myName,
        shortTime: getShortTime(now),
        dateLabel: getDateGroupLabel(now),
        sentAtStr: now.toLocaleString(),
        sentMs: Date.now(),
        vanishTimer: currentVanishTimer,
        timestamp: serverTimestamp(),
        replyTo: replyTarget ? { ...replyTarget } : null,
        seenStatus: false,
        reactions: {},
        starredBy: [],
        deletedFor: [],
        isDeletedEveryone: false,
        isEdited: false
    });
    updatePresence("online");
    cancelReplyOrEdit();
}

document.getElementById('uchat-btn-send').addEventListener('click', handleSend);
input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });

function compressImageFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxW = 1100;
                let w = img.width, h = img.height;
                if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.72));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

document.getElementById('uchat-btn-attach').addEventListener('click', () => {
    document.getElementById('uchat-file-input').click();
});

document.getElementById('uchat-file-input').addEventListener('change', async function() {
    const file = this.files[0];
    if (!file) return;
    this.value = "";

    const isVideo = file.type.startsWith('video/');
    const now = new Date();
    input.placeholder = "Uploading media...";

    try {
        let finalMediaUrl = "";
        if (!isVideo) {
            finalMediaUrl = await compressImageFile(file);
        } else {
            try {
                const fileRef = sRef(storage, `chat_media/${currentRoom}/${Date.now()}_${file.name}`);
                await uploadBytes(fileRef, file);
                finalMediaUrl = await getDownloadURL(fileRef);
            } catch (storageErr) {
                finalMediaUrl = await new Promise((res) => {
                    const r = new FileReader();
                    r.onload = (ev) => res(ev.target.result);
                    r.readAsDataURL(file);
                });
            }
        }

        await addDoc(collection(db, currentRoom), {
            type: isVideo ? "video" : "image",
            mediaUrl: finalMediaUrl,
            text: isVideo ? "🎥 Video" : "📷 Photo",
            originalAuditText: isVideo ? "🎥 Video" : "📷 Photo",
            isViewOnce: isViewOnceMode,
            viewedBy: [],
            uid: myUid,
            name: myName,
            shortTime: getShortTime(now),
            dateLabel: getDateGroupLabel(now),
            sentAtStr: now.toLocaleString(),
            sentMs: Date.now(),
            vanishTimer: currentVanishTimer,
            timestamp: serverTimestamp(),
            replyTo: replyTarget ? { ...replyTarget } : null,
            seenStatus: false,
            reactions: {},
            starredBy: [],
            deletedFor: [],
            isDeletedEveryone: false
        });
    } catch (err) {
        alert("Media upload failed.");
    }

    input.placeholder = "Message...";
    isViewOnceMode = false;
    voBtn.classList.remove('active');
    cancelReplyOrEdit();
});

async function markRoomMessagesSeen() {
    if (!isChatOpen) return;
    const nowTime = new Date().toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    for (let id in cachedMessages) {
        let m = cachedMessages[id];
        if (m.uid !== myUid && !m.seenStatus) {
            const vTimer = m.vanishTimer || "off";
            try {
                await updateDoc(doc(db, currentRoom, id), {
                    seenStatus: true,
                    seenAtStr: nowTime,
                    seenMs: Date.now(),
                    ...(vTimer === "instant" ? { isDeletedEveryone: true, deletedByAudit: "Instant Snap Mode" } : {})
                });
            } catch (e) {}
        }
    }
}

function listenToRoom(roomName) {
    msgsArea.innerHTML = '';
    cachedMessages = {};
    isInitialLoad = true;

    const q = query(collection(db, roomName), orderBy("timestamp", "asc"));
    unsubscribeChat = onSnapshot(q, (snapshot) => {
        msgsArea.innerHTML = '';
        let lastDateRendered = "";

        snapshot.forEach((docSnap) => {
            const m = docSnap.data();
            const id = docSnap.id;
            cachedMessages[id] = m;

            if (m.isDeletedEveryone || (m.deletedFor && m.deletedFor.includes(myUid))) return;

            // Check Custom Disappearing Timer Expiration
            const vTimer = m.vanishTimer || "off";
            if (vTimer !== "off" && vTimer !== "instant" && timerMs[vTimer]) {
                const baseMs = m.seenMs || m.sentMs || Date.now();
                if (Date.now() - baseMs > timerMs[vTimer]) {
                    updateDoc(doc(db, roomName, id), { isDeletedEveryone: true, deletedByAudit: `Timer (${vTimer})` }).catch(()=>{});
                    return;
                }
            }

            const msgDate = m.dateLabel || "Today";
            if (msgDate !== lastDateRendered) {
                const datePill = document.createElement('div');
                datePill.className = 'uchat-date-pill';
                datePill.innerText = msgDate;
                msgsArea.appendChild(datePill);
                lastDateRendered = msgDate;
            }

            const isMe = m.uid === myUid;
            const wrap = document.createElement('div');
            wrap.className = `uchat-msg-wrap ${isMe ? 'me' : 'other'}`;

            const div = document.createElement('div');
            div.className = 'uchat-msg';

            let fwdHtml = m.isForwarded ? `<div class="uchat-fwd"><span class="material-icons" style="font-size:12px;">shortcut</span> Forwarded</div>` : '';
            let quoteHtml = m.replyTo ? `<div class="uchat-quote"><strong style="color:#00f2fe;">${m.replyTo.name}</strong><br>${m.replyTo.text}</div>` : '';

            let bodyHtml = '';
            if (m.type === 'image' || m.type === 'video' || m.type === 'audio') {
                if (m.isViewOnce) {
                    const opened = m.viewedBy && m.viewedBy.includes(myUid);
                    const mediaLabel = m.type === 'audio' ? 'Voice Note' : (m.type === 'video' ? 'Video' : 'Photo');
                    bodyHtml = opened 
                        ? `<div class="uchat-view-once opened"><span class="material-icons" style="font-size:15px;">timelapse</span> Opened</div>`
                        : `<div class="uchat-view-once"><span class="material-icons" style="font-size:15px;">looks_one</span> 1-Time ${mediaLabel}</div>`;
                } else {
                    if (m.type === 'video') bodyHtml = `<video src="${m.mediaUrl}" controls class="uchat-media"></video>`;
                    else if (m.type === 'audio') bodyHtml = `<audio src="${m.mediaUrl}" controls class="uchat-audio"></audio>`;
                    else bodyHtml = `<img src="${m.mediaUrl}" class="uchat-media">`;
                }
            } else {
                bodyHtml = `<span>${decryptText(m.text, roomSecretKey)}</span>`;
            }

            const isStarred = m.starredBy && m.starredBy.includes(myUid);
            const starHtml = isStarred ? `<span class="material-icons" style="font-size:12px; color:#eab308;">star</span>` : '';
            const editedTag = m.isEdited ? `<span style="font-size:9px; opacity:0.7;">Edited</span>` : '';
            const tickIcon = m.seenStatus 
                ? `<span class="material-icons uchat-seen-tick seen">done_all</span>` 
                : `<span class="material-icons uchat-seen-tick">check</span>`;

            div.innerHTML = `
                ${!isMe ? `<div class="uchat-sender">${m.name}</div>` : ''}
                ${fwdHtml}
                ${quoteHtml}
                ${bodyHtml}
                <span class="uchat-status-row">${starHtml} ${editedTag} <span>${m.shortTime || ''}</span> ${tickIcon}</span>
            `;

            div.addEventListener('click', (e) => {
                e.stopPropagation();
                if (m.isViewOnce && (!m.viewedBy || !m.viewedBy.includes(myUid))) {
                    openViewOnceMedia(id, m);
                } else {
                    openWhatsAppMenu(e, id, m);
                }
            });

            wrap.appendChild(div);

            if (m.reactions && Object.keys(m.reactions).length > 0) {
                const reactDiv = document.createElement('div');
                reactDiv.className = 'uchat-reactions';
                reactDiv.innerText = Object.values(m.reactions).join(' ');
                wrap.appendChild(reactDiv);
            }

            msgsArea.appendChild(wrap);
        });

        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const msg = change.doc.data();
                if (!isInitialLoad && msg.uid !== myUid && !msg.isDeletedEveryone) {
                    if (!isChatOpen) {
                        unreadCount++;
                        badge.innerText = unreadCount > 9 ? "9+" : unreadCount;
                        badge.style.display = 'flex';
                    }
                    triggerStealthAlert(msg.type === 'text' ? 'text' : 'media');
                }
            }
        });

        if (isChatOpen) {
            markRoomMessagesSeen();
            msgsArea.scrollTop = msgsArea.scrollHeight;
        }
        isInitialLoad = false;
    });
}

updatePresence("online");
listenToPresence(currentRoom);
listenToRoom(currentRoom);

async function openViewOnceMedia(id, m) {
    const modal = document.getElementById('uchat-vo-modal');
    const container = document.getElementById('uchat-vo-content');
    if (m.type === 'video') {
        container.innerHTML = `<video src="${m.mediaUrl}" controls autoplay style="max-width:100%; max-height:65vh; border-radius:8px;"></video>`;
    } else if (m.type === 'audio') {
        container.innerHTML = `<audio src="${m.mediaUrl}" controls autoplay style="width:100%; margin:15px 0;"></audio>`;
    } else {
        container.innerHTML = `<img src="${m.mediaUrl}" style="max-width:100%; max-height:65vh; border-radius:8px;">`;
    }
    modal.style.display = 'flex';

    let viewed = m.viewedBy || [];
    if (!viewed.includes(myUid)) viewed.push(myUid);
    await updateDoc(doc(db, currentRoom, id), { viewedBy: viewed });
}

document.getElementById('uchat-vo-close').addEventListener('click', () => {
    document.getElementById('uchat-vo-modal').style.display = 'none';
    document.getElementById('uchat-vo-content').innerHTML = '';
});

function openWhatsAppMenu(e, id, m) {
    selectedMsg = { id, ...m, decrypted: decryptText(m.text, roomSecretKey) };
    actionOverlay.style.display = 'block';

    const x = Math.max(15, Math.min(e.clientX - 100, window.innerWidth - 290));
    const y = Math.max(60, Math.min(e.clientY, window.innerHeight - 340));

    reactBar.style.left = x + 'px';
    reactBar.style.top = (y - 48) + 'px';
    menu.style.left = (x + 20) + 'px';
    menu.style.top = y + 'px';

    document.getElementById('um-edit').style.display = (m.type === 'text') ? 'flex' : 'none';
}

actionOverlay.addEventListener('click', () => { actionOverlay.style.display = 'none'; });

document.getElementById('um-reply').addEventListener('click', () => {
    editingMsgId = null;
    replyTarget = { name: selectedMsg.name, text: selectedMsg.decrypted };
    document.getElementById('uchat-reply-title').innerText = `Replying to ${selectedMsg.name}`;
    document.getElementById('uchat-reply-text').innerText = selectedMsg.decrypted;
    document.getElementById('uchat-reply-bar').style.display = 'flex';
    input.focus();
});

document.getElementById('um-forward').addEventListener('click', async () => {
    let destPin = prompt("Forward to Room PIN (Leave empty for Global):");
    if (destPin === null) return;
    let targetRoom = destPin.trim() === "" ? "global_novahub_chat" : "pinned_chat_" + destPin.trim();
    const now = new Date();
    await addDoc(collection(db, targetRoom), {
        type: selectedMsg.type, text: selectedMsg.decrypted, mediaUrl: selectedMsg.mediaUrl || null,
        originalAuditText: selectedMsg.decrypted, isForwarded: true, uid: myUid, name: myName,
        shortTime: getShortTime(now), dateLabel: getDateGroupLabel(now), sentAtStr: now.toLocaleString(),
        timestamp: serverTimestamp(), seenStatus: false, deletedFor: [], isDeletedEveryone: false
    });
});

document.getElementById('um-copy').addEventListener('click', () => {
    if (selectedMsg && selectedMsg.decrypted) navigator.clipboard.writeText(selectedMsg.decrypted);
});

document.getElementById('um-info').addEventListener('click', () => {
    document.getElementById('uchat-modal-title').innerText = "Message Info";
    const seenTxt = selectedMsg.seenStatus 
        ? `<span style="color:#00f2fe; font-weight:bold;">✓✓ Read</span><br>🕒 <b>Seen Time:</b> ${selectedMsg.seenAtStr || 'Recorded'}`
        : `<span style="color:#8696a0;">✓ Delivered (Not seen yet)</span>`;
    document.getElementById('uchat-info-body').innerHTML = `
        <div>👤 <b>From:</b> ${selectedMsg.name}</div>
        <div>📅 <b>Sent:</b> ${selectedMsg.sentAtStr || selectedMsg.shortTime}</div>
        <hr style="border:0; border-top:1px solid #2a3942; margin:8px 0;">
        <div>${seenTxt}</div>
    `;
    document.getElementById('uchat-info-modal').style.display = 'flex';
});

document.getElementById('um-star').addEventListener('click', async () => {
    let starred = selectedMsg.starredBy || [];
    const idx = starred.indexOf(myUid);
    if (idx > -1) starred.splice(idx, 1);
    else starred.push(myUid);
    await updateDoc(doc(db, currentRoom, selectedMsg.id), { starredBy: starred });
});

document.getElementById('um-edit').addEventListener('click', () => {
    if (selectedMsg.type !== 'text') return;
    editingMsgId = selectedMsg.id;
    document.getElementById('uchat-reply-title').innerText = "Editing Message";
    document.getElementById('uchat-reply-text').innerText = selectedMsg.decrypted;
    document.getElementById('uchat-reply-bar').style.display = 'flex';
    input.value = selectedMsg.decrypted;
    input.focus();
});

document.getElementById('um-toggle-seen').addEventListener('click', async () => {
    const nextState = !selectedMsg.seenStatus;
    const nowTime = nextState ? new Date().toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : "";
    await updateDoc(doc(db, currentRoom, selectedMsg.id), { seenStatus: nextState, seenAtStr: nowTime });
});

document.getElementById('um-del').addEventListener('click', async () => {
    let ans = prompt("Delete message?\n1. Delete for me\n2. Delete for everyone");
    if (!ans) return;
    if (ans.trim() === "1") {
        let delFor = selectedMsg.deletedFor || [];
        if (!delFor.includes(myUid)) delFor.push(myUid);
        await updateDoc(doc(db, currentRoom, selectedMsg.id), { deletedFor: delFor });
    } else if (ans.trim() === "2") {
        await updateDoc(doc(db, currentRoom, selectedMsg.id), { isDeletedEveryone: true, deletedByAudit: myName });
    }
});

function cancelReplyOrEdit() {
    replyTarget = null;
    editingMsgId = null;
    document.getElementById('uchat-reply-bar').style.display = 'none';
}
document.getElementById('uchat-reply-close').addEventListener('click', cancelReplyOrEdit);

// ============================================================================
// CALL ENGINE WITH SPEAKER / NORMAL EARPIECE TOGGLE
// ============================================================================
const callDropdown = document.getElementById('uchat-call-dropdown');
const callHud = document.getElementById('uchat-call-hud');
const videoStage = document.getElementById('uchat-video-stage');
const remoteVid = document.getElementById('uchat-remote-vid');
const remoteAud = document.getElementById('uchat-remote-aud');
const localVid = document.getElementById('uchat-local-vid');
const acceptBtn = document.getElementById('uchat-call-accept');
const micBtn = document.getElementById('uchat-call-mic');
const micIcon = document.getElementById('uchat-mic-icon');
const spkBtn = document.getElementById('uchat-call-spk');
const spkIcon = document.getElementById('uchat-spk-icon');

function applySpeakerSetting() {
    const vol = isSpeakerLoud ? 1.0 : 0.22;
    remoteAud.volume = vol;
    remoteVid.volume = vol;
    spkBtn.classList.toggle('loud', isSpeakerLoud);
    spkIcon.innerText = isSpeakerLoud ? 'volume_up' : 'volume_down';
}

spkBtn.addEventListener('click', () => {
    isSpeakerLoud = !isSpeakerLoud;
    applySpeakerSetting();
});

document.getElementById('uchat-call-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    callDropdown.style.display = callDropdown.style.display === 'flex' ? 'none' : 'flex';
});

document.getElementById('uchat-start-acall').addEventListener('click', () => {
    callDropdown.style.display = 'none';
    startWebRTCCall(false);
});
document.getElementById('uchat-start-vcall').addEventListener('click', () => {
    callDropdown.style.display = 'none';
    startWebRTCCall(true);
});

document.getElementById('uchat-btn-fullscreen').addEventListener('click', () => {
    isCallFullScreen = !isCallFullScreen;
    callHud.classList.toggle('fullscreen', isCallFullScreen);
    document.getElementById('uchat-fs-icon').innerText = isCallFullScreen ? 'close_fullscreen' : 'fullscreen';
});

document.getElementById('uchat-btn-hide-vid').addEventListener('click', () => {
    isVideoHidden = !isVideoHidden;
    remoteVid.style.opacity = isVideoHidden ? '0' : '1';
    localVid.style.opacity = isVideoHidden ? '0' : '1';
});

micBtn.addEventListener('click', () => {
    if (localStream && localStream.getAudioTracks()[0]) {
        const track = localStream.getAudioTracks()[0];
        track.enabled = !track.enabled;
        isMicMuted = !track.enabled;
        micBtn.classList.toggle('muted', isMicMuted);
        micIcon.innerText = isMicMuted ? 'mic_off' : 'mic';
    }
});

async function startWebRTCCall(isVideo) {
    callHud.style.display = 'flex';
    acceptBtn.style.display = 'none';
    videoStage.style.display = isVideo ? 'flex' : 'none';
    document.getElementById('uchat-call-label').innerText = isVideo ? "Video" : "Audio";
    isSpeakerLoud = isVideo;
    applySpeakerSetting();

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
        if (isVideo) localVid.srcObject = localStream;
        isMicMuted = false;
        micBtn.classList.remove('muted');
        micIcon.innerText = 'mic';
    } catch (e) {
        alert("Mic/Camera permission needed.");
        callHud.style.display = 'none';
        return;
    }

    pc = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.ontrack = (e) => {
        if (isVideo) remoteVid.srcObject = e.streams[0];
        else remoteAud.srcObject = e.streams[0];
        applySpeakerSetting();
    };

    const callDoc = doc(db, "novahub_calls", currentRoom);
    pc.onicecandidate = async (e) => {
        if (e.candidate) await updateDoc(callDoc, { callerCandidate: e.candidate.toJSON() }).catch(()=>{});
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await setDoc(callDoc, {
        offer: { type: offer.type, sdp: offer.sdp },
        callerUid: myUid,
        callerName: myName,
        isVideo: isVideo,
        status: "ringing",
        updated: Date.now()
    });
}

function listenToCalls(roomId) {
    if (unsubscribeCall) unsubscribeCall();
    const callDoc = doc(db, "novahub_calls", roomId);
    unsubscribeCall = onSnapshot(callDoc, async (snap) => {
        if (!snap.exists() || isPanicHidden) return;
        const data = snap.data();
        if (Date.now() - (data.updated || 0) > 60000) return;

        if (data.status === "ringing" && data.callerUid !== myUid) {
            triggerStealthAlert("call");
            callHud.style.display = 'flex';
            acceptBtn.style.display = 'flex';
            videoStage.style.display = 'none';
            document.getElementById('uchat-call-label').innerText = "Sync...";

            acceptBtn.onclick = async () => {
                acceptBtn.style.display = 'none';
                videoStage.style.display = data.isVideo ? 'flex' : 'none';
                document.getElementById('uchat-call-label').innerText = data.isVideo ? "Video" : "Audio";
                isSpeakerLoud = data.isVideo;
                applySpeakerSetting();

                localStream = await navigator.mediaDevices.getUserMedia({ video: data.isVideo, audio: true });
                if (data.isVideo) localVid.srcObject = localStream;

                pc = new RTCPeerConnection(rtcConfig);
                localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                pc.ontrack = (e) => {
                    if (data.isVideo) remoteVid.srcObject = e.streams[0];
                    else remoteAud.srcObject = e.streams[0];
                    applySpeakerSetting();
                };
                pc.onicecandidate = async (e) => {
                    if (e.candidate) await updateDoc(callDoc, { calleeCandidate: e.candidate.toJSON() });
                };

                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await updateDoc(callDoc, {
                    answer: { type: answer.type, sdp: answer.sdp },
                    status: "connected"
                });
            };
        } else if (data.status === "connected" && data.callerUid === myUid && pc && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (data.status === "ended") {
            cleanupCall();
        }

        if (data.calleeCandidate && data.callerUid === myUid && pc) {
            pc.addIceCandidate(new RTCIceCandidate(data.calleeCandidate)).catch(()=>{});
        }
        if (data.callerCandidate && data.callerUid !== myUid && pc) {
            pc.addIceCandidate(new RTCIceCandidate(data.callerCandidate)).catch(()=>{});
        }
    });
}
listenToCalls(currentRoom);

function cleanupCall() {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (pc) pc.close();
    pc = null; localStream = null;
    isCallFullScreen = false;
    callHud.classList.remove('fullscreen');
    callHud.style.display = 'none';
}

document.getElementById('uchat-call-end').addEventListener('click', async () => {
    cleanupCall();
    await setDoc(doc(db, "novahub_calls", currentRoom), { status: "ended", updated: Date.now() }, { merge: true });
});

// ============================================================================
// GOD DASHBOARD (god4499)
// ============================================================================
let currentGodRoom = currentRoom;

async function openGodDashboard() {
    document.getElementById('uchat-god-modal').style.display = 'flex';
    const roomsListEl = document.getElementById('god-rooms-list');
    const snap = await getDocs(collection(db, "novahub_all_rooms"));
    let roomsHtml = `<span class="god-room-pill" onclick="window.godInspectRoom('global_novahub_chat')">🌐 Global Hub</span>`;
    snap.forEach((d) => {
        const r = d.data();
        if (r.roomId !== 'global_novahub_chat') {
            roomsHtml += `<span class="god-room-pill" onclick="window.godInspectRoom('${r.roomId}')">🔑 PIN: ${r.pinCode}</span>`;
        }
    });
    roomsListEl.innerHTML = roomsHtml;
    window.godInspectRoom(currentRoom);
}

window.godHardDeleteMsg = async function(roomId, msgId) {
    await deleteDoc(doc(db, roomId, msgId));
    window.godInspectRoom(roomId);
};

document.getElementById('god-btn-purge-deleted').addEventListener('click', async () => {
    if (!confirm("Permanently remove all user-deleted messages from Firebase to free space?")) return;
    const snap = await getDocs(query(collection(db, currentGodRoom)));
    for (const d of snap.docs) {
        const m = d.data();
        if (m.isDeletedEveryone || (m.deletedFor && m.deletedFor.length > 0)) {
            await deleteDoc(doc(db, currentGodRoom, d.id));
        }
    }
    window.godInspectRoom(currentGodRoom);
});

document.getElementById('god-btn-wipe-room').addEventListener('click', async () => {
    if (!confirm(`⚠️ WIPE ENTIRE ROOM (${currentGodRoom}) PERMANENTLY FROM FIREBASE?`)) return;
    const snap = await getDocs(query(collection(db, currentGodRoom)));
    for (const d of snap.docs) {
        await deleteDoc(doc(db, currentGodRoom, d.id));
    }
    if (currentGodRoom !== 'global_novahub_chat') {
        await deleteDoc(doc(db, "novahub_all_rooms", currentGodRoom));
    }
    openGodDashboard();
});

window.godInspectRoom = async function(roomId) {
    currentGodRoom = roomId;
    document.getElementById('god-inspect-title').innerText = `🕵️ Room: ${roomId}`;
    const auditBox = document.getElementById('god-msgs-audit');
    auditBox.innerHTML = 'Loading raw records...';

    const snap = await getDocs(query(collection(db, roomId), orderBy("timestamp", "asc")));
    if (snap.empty) {
        auditBox.innerHTML = 'Room is completely empty.';
        return;
    }

    let html = '';
    snap.forEach((d) => {
        const m = d.data();
        let status = `<span style="background:#065f46; color:#fff; padding:2px 5px; border-radius:4px; font-size:10px;">ACTIVE</span>`;
        if (m.isDeletedEveryone) status = `<span style="background:#dc2626; color:#fff; padding:2px 5px; border-radius:4px; font-size:10px;">🚫 DELETED FOR EVERYONE (by ${m.deletedByAudit || m.name})</span>`;
        else if (m.deletedFor && m.deletedFor.length > 0) status = `<span style="background:#d97706; color:#fff; padding:2px 5px; border-radius:4px; font-size:10px;">🗑️ DELETED FOR ME</span>`;

        let content = `<div style="color:#fff; margin-top:4px;">${m.originalAuditText || m.text}</div>`;
        if (m.type === 'image') content = `<img src="${m.mediaUrl}" style="max-width:180px; border-radius:6px; margin-top:5px; border:1px solid #ef4444;">`;
        else if (m.type === 'video') content = `<video src="${m.mediaUrl}" controls style="max-width:200px; border-radius:6px; margin-top:5px;"></video>`;
        else if (m.type === 'audio') content = `<audio src="${m.mediaUrl}" controls style="height:32px; margin-top:5px;"></audio>`;

        html += `
            <div style="border-bottom:1px dashed #450a0a; padding:8px 0;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div><strong style="color:#38bdf8;">${m.name}</strong> <span style="color:#888; font-size:11px;">[${m.dateLabel || ''} ${m.shortTime || ''}] [Seen: ${m.seenStatus ? (m.seenAtStr || 'Yes') : 'No'}]</span></div>
                    <div>
                        ${status}
                        <button onclick="window.godHardDeleteMsg('${roomId}', '${d.id}')" style="background:#ef4444; color:#fff; border:none; padding:2px 6px; border-radius:4px; font-size:10px; cursor:pointer; margin-left:5px;">🔥 Hard Delete</button>
                    </div>
                </div>
                ${content}
            </div>
        `;
    });
    auditBox.innerHTML = html;
};
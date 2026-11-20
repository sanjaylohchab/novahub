// ============================================================================
// NOVAMESSENGER PRO ENGINE (chat-core.js)
// Fast Incremental DOM | Stable Video Playback | 0ms Panic Hide | Live Location
// ============================================================================
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { initializeFirestore, getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, onSnapshot, collection, addDoc, query, orderBy, limitToLast, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
try { db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, "default"); }
catch (e) { db = getFirestore(app, "default"); }
const storage = getStorage(app);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if ('wakeLock' in navigator) navigator.wakeLock.request('screen').catch(() => {});

const isWidgetMode = new URLSearchParams(window.location.search).get('widget') === '1' || (window.self !== window.top);
let isWidgetOpen = !isWidgetMode;
let isRoomActivelyOpen = false;

if (isWidgetMode) document.body.classList.add('widget-mode');
if (localStorage.getItem('nova_theme_mode') === 'light') document.body.classList.add('light-mode');

function postToGame(payload) {
    if (isWidgetMode) {
        try { window.parent.postMessage(payload, '*'); } catch (e) {}
    }
}

window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'NOVA_WIDGET_STATE') return;
    isWidgetOpen = !!d.open;
    if (d.panic && (pc || localStream)) cleanupCall(false);
    if (isWidgetOpen && isRoomActivelyOpen) {
        updatePresence("online");
        markVisibleMessagesSeen();
        const box = document.getElementById('msgs-container');
        if (box) setTimeout(() => { box.scrollTop = box.scrollHeight; }, 40);
    } else if (!isWidgetOpen) {
        updatePresence("offline");
    }
});

// 0ms Instant Close Buttons for Game Widget
['btn-widget-close-side', 'btn-widget-close-chat', 'btn-cyber-close-widget'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.onclick = (e) => { e.stopPropagation(); postToGame({ type: 'NOVA_CLOSE_WIDGET' }); };
});

// ============================================================================
// 1. STRICT AUTHENTICATION (1 CODE = 1 UNIQUE ID)
// ============================================================================
let authMode = 'login';
let myAccountCode = (localStorage.getItem('nova_account_code') || "").trim();
let myUid = myAccountCode ? ('uid_' + myAccountCode) : "";
let myName = localStorage.getItem('nova_username') || "";
let myDp = localStorage.getItem('nova_dp') || "";
let myLockPin = localStorage.getItem('nova_lock_pin') || "";
let savedRooms = JSON.parse(localStorage.getItem('nova_saved_rooms') || '[]').filter(r => r.id !== 'global_novahub_chat');

const authScreen = document.getElementById('auth-screen');
const errEl = document.getElementById('auth-error-msg');
const codeInp = document.getElementById('auth-code');
const nameInp = document.getElementById('auth-name');
const passInp = document.getElementById('auth-pass');

document.getElementById('tab-btn-login').onclick = () => {
    authMode = 'login';
    document.getElementById('tab-btn-login').classList.add('active');
    document.getElementById('tab-btn-signup').classList.remove('active');
    document.getElementById('signup-name-field').style.display = 'none';
    document.getElementById('btn-auth-submit').innerText = 'LOGIN TO MY ACCOUNT';
    errEl.innerText = '';
};

document.getElementById('tab-btn-signup').onclick = () => {
    authMode = 'signup';
    document.getElementById('tab-btn-signup').classList.add('active');
    document.getElementById('tab-btn-login').classList.remove('active');
    document.getElementById('signup-name-field').style.display = 'block';
    document.getElementById('btn-auth-submit').innerText = 'CREATE NEW PERMANENT ID';
    errEl.innerText = '';
};

document.getElementById('btn-auth-submit').onclick = async () => {
    const code = codeInp.value.trim();
    const pass = passInp.value.trim();
    const name = nameInp.value.trim();
    errEl.innerText = '';

    if (!code) { errEl.innerText = '⚠️ Please enter your ID Number / Code!'; return; }
    if (code.toLowerCase() === 'god4499') { authScreen.style.display = 'none'; openGodDashboard(); return; }
    if (!pass) { errEl.innerText = '⚠️ Please enter your secret password!'; return; }

    const accRef = doc(db, "novahub_accounts", code);
    const snap = await getDoc(accRef);

    if (authMode === 'signup') {
        if (snap.exists()) { errEl.innerText = `❌ ID "${code}" already exists! Use LOGIN.`; return; }
        if (!name) { errEl.innerText = '⚠️ Please enter your Display Name!'; return; }
        wipeLocalSessionData();
        myAccountCode = code; myUid = 'uid_' + code; myName = name; myDp = ""; myLockPin = ""; savedRooms = [];
        await setDoc(accRef, { accountCode: code, password: pass, uid: myUid, name: myName, dp: "", lockPin: "", savedRooms: [], createdAt: new Date().toLocaleString() });
    } else {
        if (!snap.exists()) { errEl.innerText = `❌ No account found for ID "${code}"!`; return; }
        const data = snap.data();
        if (data.password && data.password !== pass) { errEl.innerText = `❌ Wrong Password for ID "${code}"!`; return; }
        wipeLocalSessionData();
        myAccountCode = code; myUid = 'uid_' + code; myName = data.name || ("User_" + code);
        myDp = data.dp || ""; myLockPin = data.lockPin || "";
        savedRooms = (data.savedRooms || []).filter(r => r.id !== 'global_novahub_chat');
    }

    saveSessionToLocal();
    authScreen.style.display = 'none';
    startAuthenticatedSession();
};

function wipeLocalSessionData() {
    ['nova_account_code', 'nova_uid', 'nova_username', 'nova_dp', 'nova_lock_pin', 'nova_saved_rooms', 'nova_last_room'].forEach(k => localStorage.removeItem(k));
}

function saveSessionToLocal() {
    localStorage.setItem('nova_account_code', myAccountCode);
    localStorage.setItem('nova_uid', myUid);
    localStorage.setItem('nova_username', myName);
    localStorage.setItem('nova_dp', myDp);
    localStorage.setItem('nova_lock_pin', myLockPin);
    localStorage.setItem('nova_saved_rooms', JSON.stringify(savedRooms));
}

document.getElementById('btn-logout-now').onclick = () => {
    if (!confirm(`Logout from ID "${myAccountCode}" (${myName})?`)) return;
    stopAllLiveSessions();
    if (unsubscribeChat) unsubscribeChat();
    if (unsubscribeAccountSync) unsubscribeAccountSync();
    wipeLocalSessionData();
    window.location.reload();
};

// ============================================================================
// 2. 1-ON-1 MESSENGER, INBOX SYNC & STRICT SEEN DETECTION
// ============================================================================
let currentRoom = "";
let unsubscribeChat = null;
let unsubscribePresence = null;
let unsubscribeCall = null;
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

document.getElementById('di-vib-val').innerText = vibrationEnabled ? "ON" : "OFF";
document.getElementById('di-notif-val').innerText = stealthNotifEnabled ? "ON" : "OFF";

const timerLabels = { off: "", instant: "⏱️ Instant", "1h": "⏱️ 1h", "24h": "⏱️ 24h", "7d": "⏱️ 1w", "30d": "⏱️ 1m", "365d": "⏱️ 1y" };
const timerMs = { "1h": 3600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000, "365d": 31536000000 };

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
    if (!currentRoom || !isRoomActivelyOpen) return false;
    if (document.visibilityState !== 'visible') return false;
    if (isWidgetMode && !isWidgetOpen) return false;
    if (authScreen.style.display !== 'none') return false;
    if (document.getElementById('cyber-gate-screen').style.display === 'flex') return false;
    if ((isWidgetMode || window.innerWidth <= 768) && !document.getElementById('chat-view').classList.contains('open')) return false;
    return true;
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
                seenStatus: true,
                seenBy: myAccountCode,
                seenAtStr: nowTime,
                seenMs: Date.now(),
                ...(vTimer === "instant" ? { isDeletedEveryone: true, deletedByAudit: "Instant Snap Mode" } : {})
            });
        } catch (e) {} finally {
            markingSeen.delete(id);
        }
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') markVisibleMessagesSeen();
});

function startAuthenticatedSession() {
    document.getElementById('my-top-name').innerText = myName;
    document.getElementById('my-top-id-tag').innerText = `My ID: ${myAccountCode}`;
    const dpEl = document.getElementById('my-top-dp');
    if (myDp) {
        dpEl.innerHTML = '<div class="online-dot"></div>';
        dpEl.style.backgroundImage = `url(${myDp})`;
    } else {
        dpEl.style.backgroundImage = '';
        dpEl.innerHTML = `<span class="material-icons" style="font-size:20px;">person</span><div class="online-dot"></div>`;
    }

    if (unsubscribeAccountSync) unsubscribeAccountSync();
    unsubscribeAccountSync = onSnapshot(doc(db, "novahub_accounts", myAccountCode), (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        if (d.savedRooms) {
            let updated = false;
            d.savedRooms.forEach(cloudRoom => {
                if (cloudRoom.id === 'global_novahub_chat') return;
                if (!savedRooms.find(r => r.id === cloudRoom.id)) {
                    savedRooms.push(cloudRoom);
                    updated = true;
                }
            });
            if (updated) localStorage.setItem('nova_saved_rooms', JSON.stringify(savedRooms));
        }
        renderSidebarList();
        renderActiveStrip();
    });

    renderSidebarList();
    renderActiveStrip();

    const lastId = localStorage.getItem('nova_last_room');
    const bgRoom = savedRooms.find(r => r.id === lastId) || savedRooms[0];
    if (bgRoom) {
        selectRoom(bgRoom.id, false);
    }
}

if (myAccountCode && myName) {
    authScreen.style.display = 'none';
    startAuthenticatedSession();
}

async function syncAccountToCloud() {
    localStorage.setItem('nova_saved_rooms', JSON.stringify(savedRooms));
    if (!myAccountCode) return;
    try {
        await setDoc(doc(db, "novahub_accounts", myAccountCode), { savedRooms, updatedAt: new Date().toLocaleString() }, { merge: true });
    } catch (e) {}
}

function renderActiveStrip() {
    const strip = document.getElementById('messenger-active-strip');
    strip.innerHTML = `
        <div class="story-bubble" onclick="document.getElementById('tab-status').click()">
            <div class="story-ring" style="background:rgba(255,255,255,0.15);">
                <div class="avatar"><span class="material-icons" style="font-size:20px;">add</span></div>
            </div>
            <span class="story-name">My Story</span>
        </div>
    `;
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
        b.onclick = () => selectRoom(r.id, true);
        strip.appendChild(b);
    });
}

function renderSidebarList() {
    const area = document.getElementById('chats-list-area');
    area.innerHTML = '';
    const searchVal = document.getElementById('pin-search-input').value.trim();
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
        div.onclick = () => {
            if (r.locked) document.getElementById('pin-search-input').value = '';
            selectRoom(r.id, true);
        };
        area.appendChild(div);
    });
}

document.getElementById('btn-add-room').onclick = async () => {
    let friendCode = document.getElementById('pin-search-input').value.trim();
    if (!friendCode) friendCode = prompt("👤 Enter Friend's Unique ID Number / Code:");
    if (!friendCode) return;
    friendCode = friendCode.trim();
    document.getElementById('pin-search-input').value = '';

    if (friendCode.toLowerCase() === 'god4499') { openGodDashboard(); return; }
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
};

document.getElementById('pin-search-input').oninput = (e) => {
    if (e.target.value.trim().toLowerCase() === 'god4499') { e.target.value = ''; openGodDashboard(); return; }
    renderSidebarList();
};

// GUARANTEED INSTANT BACK BUTTON
document.getElementById('btn-mobile-back').onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    isRoomActivelyOpen = false;
    document.getElementById('chat-view').classList.remove('open');
    document.getElementById('contact-info-drawer').style.display = 'none';
    document.getElementById('emoji-picker').classList.remove('show');
    document.getElementById('msg-overlay').style.display = 'none';
    renderSidebarList();
};

function getRoomMeta(roomId) {
    return savedRooms.find(r => r.id === roomId) || { id: roomId, name: "Private Chat", locked: false, timer: "off" };
}

function updateActiveHeaderBadges(meta) {
    document.getElementById('active-room-title').innerText = meta.name;
    document.getElementById('drawer-room-name').innerText = `${meta.name} (ID: ${meta.peerCode || ''})`;
    const dp = document.getElementById('active-room-dp');
    if (meta.dp) {
        dp.innerText = '';
        dp.style.backgroundImage = `url(${meta.dp})`;
    } else {
        dp.style.backgroundImage = '';
        dp.innerText = (meta.name || 'P').charAt(0).toUpperCase();
    }
    const bEl = document.getElementById('active-mode-badge');
    if (meta.timer && meta.timer !== 'off') { bEl.innerText = timerLabels[meta.timer]; bEl.style.display = 'inline-block'; }
    else bEl.style.display = 'none';
    const encKey = localStorage.getItem(`nova_enc_${currentRoom}`) || "";
    document.getElementById('di-enc-sub').innerText = encKey ? "🔒 Custom Cipher Key Active" : "Optional cipher password";
}

function selectRoom(roomId, openUI = true) {
    const isSameRoom = (currentRoom === roomId);
    currentRoom = roomId;
    localStorage.setItem('nova_last_room', roomId);
    const meta = getRoomMeta(roomId);
    updateActiveHeaderBadges(meta);
    document.getElementById('toggle-lock-chat').checked = !!meta.locked;
    document.getElementById('select-vanish-timer').value = meta.timer || "off";

    if (openUI) {
        isRoomActivelyOpen = true;
        document.getElementById('chat-view').classList.add('open');
        updatePresence("online");
    } else {
        isRoomActivelyOpen = false;
        document.getElementById('chat-view').classList.remove('open');
    }

    refreshLiveBanner();
    renderSidebarList();

    if (!isSameRoom || !unsubscribeChat) {
        listenToPresence(roomId);
        listenToMessages(roomId);
        listenToCalls(roomId);
    } else if (openUI) {
        markVisibleMessagesSeen();
        const box = document.getElementById('msgs-container');
        setTimeout(() => { box.scrollTop = box.scrollHeight; }, 30);
    }
}

// ============================================================================
// 3. ENCRYPTION, NOTIFICATIONS, CURRENT + LIVE LOCATION & MESSAGES
// ============================================================================
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

let audioCtx = null;
document.addEventListener('touchstart', () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}, { once: true });

function playAlertBeep() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {}
}

async function triggerStealthAlert(type) {
    if (vibrationEnabled) {
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

    const toast = document.getElementById('stealth-toast');
    document.getElementById('toast-txt').innerText = txt;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3200);

    if ("Notification" in window && Notification.permission === "granted" && !isChatActivelyVisible()) {
        try {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.ready;
                if (reg && reg.showNotification) {
                    await reg.showNotification("🎮 NovaHub Arcade", { body: txt, icon: "https://cdn-icons-png.flaticon.com/512/808/808439.png", tag: "novahub-" + Date.now() });
                    return;
                }
            }
            new Notification("🎮 NovaHub Arcade", { body: txt });
        } catch (e) {}
    }
}

async function updatePresence(statusStr = "online") {
    if (!currentRoom || !myUid) return;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    try {
        await setDoc(doc(db, "novahub_all_rooms", currentRoom), {
            roomId: currentRoom, pinCode: currentRoom, lastActive: new Date().toLocaleString(),
            [`presence_${myUid}`]: { name: myName, status: statusStr, time: timeStr, updated: Date.now() }
        }, { merge: true });
    } catch (e) {}
}

let typTimer = null;
document.getElementById('msg-input').oninput = () => {
    updatePresence("typing...");
    clearTimeout(typTimer);
    typTimer = setTimeout(() => updatePresence("online"), 2200);
};

function listenToPresence(roomId) {
    if (unsubscribePresence) unsubscribePresence();
    unsubscribePresence = onSnapshot(doc(db, "novahub_all_rooms", roomId), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        let txt = `Active • Tap for info`;
        for (let k in data) {
            if (k.startsWith('presence_') && k !== `presence_${myUid}`) {
                const p = data[k];
                const recent = (Date.now() - (p.updated || 0)) < 55000;
                if (recent && (p.status === "typing..." || p.status === "recording audio...")) txt = `✍️ ${p.name} is ${p.status}`;
                else if (recent && p.status === "online") txt = `🟢 Active now`;
                else txt = `Last active today at ${p.time}`;
            }
        }
        document.getElementById('active-room-status').innerText = txt;
    });
}

function getDateGroupLabel(d = new Date()) { return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
function getShortTime(d = new Date()) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

// ============================================================================
// WHATSAPP-STYLE CURRENT & LIVE LOCATION ENGINE
// ============================================================================
const locModal = document.getElementById('location-modal');
const liveBanner = document.getElementById('active-live-banner');
const liveBannerText = document.getElementById('active-live-text');
let selectedLiveHours = 1;
const activeLiveSessions = {};

function refreshLiveBanner() {
    const sess = activeLiveSessions[currentRoom];
    if (sess) {
        liveBannerText.innerText = `Sharing Live Location (${sess.label})`;
        liveBanner.style.display = 'flex';
    } else {
        liveBanner.style.display = 'none';
    }
}

async function stopLiveLocation(roomId, msgId) {
    const sess = activeLiveSessions[roomId];
    if (sess && (!msgId || sess.msgId === msgId)) {
        if (sess.watchId !== null) navigator.geolocation.clearWatch(sess.watchId);
        if (sess.expireTimer) clearTimeout(sess.expireTimer);
        delete activeLiveSessions[roomId];
    }
    if (roomId && msgId) {
        try {
            await updateDoc(doc(db, roomId, msgId), { isLiveActive: false, lastUpdatedStr: getShortTime(new Date()) });
        } catch (e) {}
    }
    refreshLiveBanner();
}
window.stopLiveLocation = stopLiveLocation;

function stopAllLiveSessions() {
    Object.keys(activeLiveSessions).forEach(rId => stopLiveLocation(rId, activeLiveSessions[rId].msgId));
}

document.getElementById('btn-banner-stop-live').onclick = () => {
    const sess = activeLiveSessions[currentRoom];
    if (sess) stopLiveLocation(currentRoom, sess.msgId);
};

const locBtn = document.getElementById('btn-share-location');
if (locBtn) {
    locBtn.onclick = () => {
        if (!currentRoom) return alert("Please select a friend first!");
        if (!navigator.geolocation) return alert("❌ Location is not supported on this device/browser.");
        locModal.style.display = 'flex';
    };
}
document.getElementById('btn-close-loc-modal').onclick = () => { locModal.style.display = 'none'; };
locModal.onclick = (e) => { if (e.target === locModal) locModal.style.display = 'none'; };

document.querySelectorAll('.dur-chip').forEach(chip => {
    chip.onclick = () => {
        document.querySelectorAll('.dur-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedLiveHours = Number(chip.getAttribute('data-hours'));
    };
});

document.getElementById('btn-send-current-loc').onclick = () => {
    locModal.style.display = 'none';
    const targetRoom = currentRoom;
    const inp = document.getElementById('msg-input');
    const prevPh = inp.placeholder;
    inp.placeholder = "📍 Fetching GPS location...";

    navigator.geolocation.getCurrentPosition(async (pos) => {
        inp.placeholder = prevPh;
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        const now = new Date();
        const meta = getRoomMeta(targetRoom);

        await addDoc(collection(db, targetRoom), {
            type: "location", lat, lng, mapUrl,
            text: `📍 Current Location (${lat}, ${lng})`,
            originalAuditText: `📍 Current Location: ${mapUrl}`,
            uid: myUid, accountCode: myAccountCode, name: myName,
            shortTime: getShortTime(now), dateLabel: getDateGroupLabel(now), sentAtStr: now.toLocaleString(),
            sentMs: Date.now(), vanishTimer: meta.timer || "off",
            timestamp: serverTimestamp(), replyTo: replyTarget, seenStatus: false, manualUnseen: false,
            reactions: {}, starredBy: [], deletedFor: [], isDeletedEveryone: false
        });
        replyTarget = null;
        document.getElementById('reply-bar').style.display = 'none';
    }, () => {
        inp.placeholder = prevPh;
        alert("⚠️ Location permission denied or GPS is off.");
    }, { enableHighAccuracy: true, timeout: 12000 });
};

document.getElementById('btn-start-live-loc').onclick = () => {
    locModal.style.display = 'none';
    const targetRoom = currentRoom;
    const hours = selectedLiveHours;
    const inp = document.getElementById('msg-input');
    const prevPh = inp.placeholder;
    inp.placeholder = "🛰️ Starting Live Location...";

    navigator.geolocation.getCurrentPosition(async (pos) => {
        inp.placeholder = prevPh;
        if (activeLiveSessions[targetRoom]) await stopLiveLocation(targetRoom, activeLiveSessions[targetRoom].msgId);

        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        const now = new Date();
        const meta = getRoomMeta(targetRoom);

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
        replyTarget = null;
        document.getElementById('reply-bar').style.display = 'none';

        const session = { msgId: docRef.id, watchId: null, expireTimer: null, label: durLabel, lastUpdateMs: Date.now() };
        session.watchId = navigator.geolocation.watchPosition(async (p) => {
            if (!activeLiveSessions[targetRoom] || activeLiveSessions[targetRoom].msgId !== docRef.id) return;
            if (expiresAt > 0 && Date.now() >= expiresAt) { stopLiveLocation(targetRoom, docRef.id); return; }
            if (Date.now() - session.lastUpdateMs < 6000) return;
            session.lastUpdateMs = Date.now();

            const nLat = p.coords.latitude.toFixed(6);
            const nLng = p.coords.longitude.toFixed(6);
            const nUrl = `https://www.google.com/maps?q=${nLat},${nLng}`;
            try {
                await updateDoc(doc(db, targetRoom, docRef.id), {
                    lat: nLat, lng: nLng, mapUrl: nUrl, lastUpdatedStr: getShortTime(new Date()),
                    originalAuditText: `🛰️ Live Location (${durLabel}): ${nUrl}`
                });
            } catch (e) {}
        }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });

        if (expiresAt > 0) session.expireTimer = setTimeout(() => stopLiveLocation(targetRoom, docRef.id), hours * 3600000);
        activeLiveSessions[targetRoom] = session;
        refreshLiveBanner();
    }, () => {
        inp.placeholder = prevPh;
        alert("⚠️ Location permission denied or GPS is off.");
    }, { enableHighAccuracy: true, timeout: 12000 });
};

async function sendMessage() {
    if (!currentRoom) return alert("Please add or select a friend first!");
    const inp = document.getElementById('msg-input');
    const rawText = inp.value.trim();
    if (!rawText) return;
    inp.value = '';
    document.getElementById('emoji-picker').classList.remove('show');

    const encKey = localStorage.getItem(`nova_enc_${currentRoom}`) || "";
    const finalTxt = encryptText(rawText, encKey);

    if (editingMsgId) {
        await updateDoc(doc(db, currentRoom, editingMsgId), { text: finalTxt, isEdited: true });
        editingMsgId = null;
        document.getElementById('reply-bar').style.display = 'none';
        return;
    }

    const now = new Date();
    const meta = getRoomMeta(currentRoom);
    await addDoc(collection(db, currentRoom), {
        type: "text", text: finalTxt, originalAuditText: rawText,
        uid: myUid, accountCode: myAccountCode, name: myName,
        shortTime: getShortTime(now), dateLabel: getDateGroupLabel(now), sentAtStr: now.toLocaleString(),
        sentMs: Date.now(), vanishTimer: meta.timer || "off",
        timestamp: serverTimestamp(), replyTo: replyTarget, seenStatus: false, manualUnseen: false,
        reactions: {}, starredBy: [], deletedFor: [], isDeletedEveryone: false
    });
    replyTarget = null;
    document.getElementById('reply-bar').style.display = 'none';
}

document.getElementById('btn-send-msg').onclick = sendMessage;
document.getElementById('msg-input').onkeypress = e => { if (e.key === 'Enter') sendMessage(); };

const voBtn = document.getElementById('btn-vo-toggle');
voBtn.onclick = () => { isViewOnce = !isViewOnce; voBtn.classList.toggle('active', isViewOnce); };

function compressImg(file) {
    return new Promise((res) => {
        const r = new FileReader();
        r.onload = e => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                let w = img.width, h = img.height, max = 1000;
                if (w > max) { h = Math.round((h * max) / w); w = max; }
                c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, w, h);
                res(c.toDataURL('image/jpeg', 0.7));
            };
            img.src = e.target.result;
        };
        r.readAsDataURL(file);
    });
}

document.getElementById('btn-attach').onclick = () => document.getElementById('msg-file-input').click();
document.getElementById('msg-file-input').onchange = async function() {
    if (!currentRoom) return alert("Select a friend first!");
    const file = this.files[0];
    if (!file) return;
    this.value = '';
    const isVid = file.type.startsWith('video/');
    const now = new Date();
    const meta = getRoomMeta(currentRoom);
    const inp = document.getElementById('msg-input');
    const prevPh = inp.placeholder;
    inp.placeholder = isVid ? "🎥 Uploading video..." : "📷 Sending photo...";

    try {
        let url = "";
        if (!isVid) {
            url = await compressImg(file);
        } else {
            try {
                const fRef = sRef(storage, `chat_media/${currentRoom}/${Date.now()}_${file.name}`);
                await uploadBytes(fRef, file);
                url = await getDownloadURL(fRef);
            } catch (e) {
                if (file.size > 680 * 1024) {
                    inp.placeholder = prevPh;
                    return alert("⚠️ Video upload failed! Firebase Storage enable/rules check karein, ya chhoti (<650KB) video bhejein.");
                }
                url = await new Promise(res => { const r = new FileReader(); r.onload = ev => res(ev.target.result); r.readAsDataURL(file); });
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
    } catch (err) {
        alert("⚠️ Media send failed. Please try a smaller file.");
    }
    inp.placeholder = prevPh;
    isViewOnce = false; voBtn.classList.remove('active');
};

let mediaRec = null, vnChunks = [], isRec = false;
const vnBtn = document.getElementById('btn-vn-rec');
vnBtn.onclick = async () => {
    if (!currentRoom) return alert("Select a friend first!");
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
                    const now = new Date();
                    const meta = getRoomMeta(currentRoom);
                    await addDoc(collection(db, currentRoom), {
                        type: "audio", mediaUrl: ev.target.result, text: "🎙️ Voice Note",
                        originalAuditText: "🎙️ Voice Note", isViewOnce, viewedBy: [],
                        uid: myUid, accountCode: myAccountCode, name: myName, shortTime: getShortTime(now), dateLabel: getDateGroupLabel(now),
                        sentAtStr: now.toLocaleString(), sentMs: Date.now(), vanishTimer: meta.timer || "off",
                        timestamp: serverTimestamp(), seenStatus: false, manualUnseen: false,
                        deletedFor: [], isDeletedEveryone: false
                    });
                    isViewOnce = false; voBtn.classList.remove('active');
                };
                r.readAsDataURL(new Blob(vnChunks, { type: 'audio/webm' }));
            };
            mediaRec.start();
            isRec = true; vnBtn.classList.add('rec');
            document.getElementById('vn-icon').innerText = 'stop';
            updatePresence("recording audio...");
        } catch (e) { alert("Mic permission needed."); }
    } else {
        mediaRec.stop();
        isRec = false; vnBtn.classList.remove('rec');
        document.getElementById('vn-icon').innerText = 'mic';
        updatePresence("online");
    }
};

// ============================================================================
// INCREMENTAL MESSAGE RENDERER (NO VIDEO RELOAD / NO FLICKER / FAST SCROLL)
// ============================================================================
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
            return `<video src="${m.mediaUrl}" controls playsinline webkit-playsinline preload="metadata" class="msg-media" onclick="event.stopPropagation()"></video>`;
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
    const box = document.getElementById('msgs-container');
    box.innerHTML = '';
    cachedMessages = {};
    isInitialLoad = true;
    const encKey = localStorage.getItem(`nova_enc_${roomId}`) || "";
    const domMap = new Map();
    let lastDatePillText = "";

    // Load last 60 messages for fast startup and smooth scrolling
    const q = query(collection(db, roomId), orderBy("timestamp", "asc"), limitToLast(60));

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
                // UPDATE IN PLACE — NEVER DESTROYS <video> OR <img>!
                const entry = domMap.get(id);
                if (entry.bodySig !== bodySig) {
                    entry.bodyEl.innerHTML = buildMessageBodyHTML(roomId, id, m, isMe, encKey);
                    entry.bodySig = bodySig;
                }
                if (entry.metaHtml !== metaHtml) {
                    entry.metaEl.innerHTML = metaHtml;
                    entry.metaHtml = metaHtml;
                }
                if (entry.reactTxt !== reactTxt) {
                    entry.reactEl.innerText = reactTxt;
                    entry.reactEl.style.display = reactTxt ? 'flex' : 'none';
                    entry.reactTxt = reactTxt;
                }
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
                    sEl.className = 'msg-sender';
                    sEl.innerText = m.name || '';
                    bub.appendChild(sEl);
                }
                if (m.replyTo) {
                    const qEl = document.createElement('div');
                    qEl.className = 'msg-quote';
                    qEl.innerHTML = `<b>${m.replyTo.name}</b><br>${m.replyTo.text}`;
                    bub.appendChild(qEl);
                }

                const bodyEl = document.createElement('div');
                bodyEl.className = 'msg-body';
                bodyEl.style.display = 'inline';
                bodyEl.innerHTML = buildMessageBodyHTML(roomId, id, m, isMe, encKey);
                bub.appendChild(bodyEl);

                const metaEl = document.createElement('span');
                metaEl.className = 'msg-meta';
                metaEl.innerHTML = metaHtml;
                bub.appendChild(metaEl);

                bub.onclick = (e) => {
                    e.stopPropagation();
                    const fresh = cachedMessages[id] || m;
                    if (fresh.isViewOnce && (!fresh.viewedBy || !fresh.viewedBy.includes(myUid))) openViewOnceModal(id, fresh);
                    else openContextMenu(e, id, fresh);
                };

                const reactEl = document.createElement('div');
                reactEl.className = 'msg-reactions';
                reactEl.innerText = reactTxt;
                reactEl.style.display = reactTxt ? 'flex' : 'none';

                wrap.appendChild(bub);
                wrap.appendChild(reactEl);
                box.appendChild(wrap);

                domMap.set(id, { wrap, bodyEl, metaEl, reactEl, bodySig, metaHtml, reactTxt });
                addedNewNode = true;
            }
        });

        // Remove deleted messages from DOM
        for (const [id, entry] of domMap.entries()) {
            if (!visibleIds.has(id)) {
                entry.wrap.remove();
                domMap.delete(id);
            }
        }

        document.getElementById('di-media-count').innerText = mediaCount;
        document.getElementById('di-star-count').innerText = starCount > 0 ? starCount : "None";

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
            if (isInitialLoad || (addedNewNode && wasNearBottom)) {
                box.scrollTop = box.scrollHeight;
            }
        }
        isInitialLoad = false;
    });
}

async function openViewOnceModal(id, m) {
    document.getElementById('modal-title').innerText = "➀ One-Time Media";
    document.getElementById('modal-body').innerHTML = m.type === 'video'
        ? `<video src="${m.mediaUrl}" controls autoplay playsinline webkit-playsinline style="width:100%; border-radius:8px;"></video>`
        : (m.type === 'audio' ? `<audio src="${m.mediaUrl}" controls autoplay style="width:100%;"></audio>` : `<img src="${m.mediaUrl}" style="width:100%; border-radius:8px;">`);
    document.getElementById('generic-modal').style.display = 'flex';
    let v = m.viewedBy || [];
    if (!v.includes(myUid)) v.push(myUid);
    await updateDoc(doc(db, currentRoom, id), { viewedBy: v });
}

// Context Menu & Drawer
const overlay = document.getElementById('msg-overlay');
function openContextMenu(e, id, m) {
    const encKey = localStorage.getItem(`nova_enc_${currentRoom}`) || "";
    const dec = (m.type === 'location' || m.type === 'live_location') ? (m.mapUrl || m.text) : decryptText(m.text, encKey);
    selectedMsg = { id, ...m, decrypted: dec };
    overlay.style.display = 'block';
    const x = Math.max(10, Math.min(e.clientX - 90, window.innerWidth - 235));
    const y = Math.max(60, Math.min(e.clientY, window.innerHeight - 310));
    document.getElementById('react-pill').style.left = x + 'px';
    document.getElementById('react-pill').style.top = (y - 46) + 'px';
    document.getElementById('ctx-menu').style.left = Math.min(x + 10, window.innerWidth - 205) + 'px';
    document.getElementById('ctx-menu').style.top = y + 'px';
}
overlay.onclick = () => overlay.style.display = 'none';

document.querySelectorAll('.react-emo').forEach(el => {
    el.onclick = async () => {
        const emo = el.getAttribute('data-emo');
        let r = { ...(selectedMsg.reactions || {}) };
        if (r[myUid] === emo) delete r[myUid]; else r[myUid] = emo;
        await updateDoc(doc(db, currentRoom, selectedMsg.id), { reactions: r });
    };
});

document.getElementById('cm-reply').onclick = () => {
    replyTarget = { name: selectedMsg.name, text: selectedMsg.decrypted };
    document.getElementById('reply-title').innerText = `Replying to ${selectedMsg.name}`;
    document.getElementById('reply-text').innerText = selectedMsg.decrypted;
    document.getElementById('reply-bar').style.display = 'flex';
};
document.getElementById('btn-cancel-reply').onclick = () => { replyTarget = null; editingMsgId = null; document.getElementById('reply-bar').style.display = 'none'; };
document.getElementById('cm-copy').onclick = () => navigator.clipboard.writeText(selectedMsg.decrypted || '');
document.getElementById('cm-info').onclick = () => {
    document.getElementById('modal-title').innerText = "Message Info";
    document.getElementById('modal-body').innerHTML = `
        <div>👤 <b>Sender:</b> ${selectedMsg.name} (ID: ${selectedMsg.accountCode || ''})</div>
        <div>📅 <b>Sent:</b> ${selectedMsg.sentAtStr || selectedMsg.shortTime}</div>
        <hr style="margin:8px 0; border-color:var(--border-col);">
        <div>👀 <b>Seen Status:</b> ${selectedMsg.seenStatus ? `✓✓ Seen (${selectedMsg.seenAtStr || 'Read'})` : '✓ Not Seen Yet'}</div>
    `;
    document.getElementById('generic-modal').style.display = 'flex';
};
document.getElementById('cm-star').onclick = async () => {
    let s = [...(selectedMsg.starredBy || [])];
    const i = s.indexOf(myUid);
    if (i > -1) s.splice(i, 1); else s.push(myUid);
    await updateDoc(doc(db, currentRoom, selectedMsg.id), { starredBy: s });
};
document.getElementById('cm-edit').onclick = () => {
    if (selectedMsg.type !== 'text') return;
    editingMsgId = selectedMsg.id;
    document.getElementById('reply-title').innerText = "Editing Message";
    document.getElementById('reply-text').innerText = selectedMsg.decrypted;
    document.getElementById('reply-bar').style.display = 'flex';
    document.getElementById('msg-input').value = selectedMsg.decrypted;
};
document.getElementById('cm-seen').onclick = async () => {
    const next = !selectedMsg.seenStatus;
    await updateDoc(doc(db, currentRoom, selectedMsg.id), {
        seenStatus: next, manualUnseen: !next,
        seenAtStr: next ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""
    });
};
document.getElementById('cm-del').onclick = async () => {
    let ans = prompt("Delete message?\n1. Delete for me\n2. Delete for everyone");
    if (!ans) return;
    if (selectedMsg.type === 'live_location' && selectedMsg.isLiveActive && isMyMessage(selectedMsg)) {
        await stopLiveLocation(currentRoom, selectedMsg.id);
    }
    if (ans.trim() === "1") {
        let d = [...(selectedMsg.deletedFor || [])];
        d.push(myUid);
        await updateDoc(doc(db, currentRoom, selectedMsg.id), { deletedFor: d });
    } else if (ans.trim() === "2") {
        await updateDoc(doc(db, currentRoom, selectedMsg.id), { isDeletedEveryone: true, deletedByAudit: myName });
    }
};

// Drawer & Tabs
const drawer = document.getElementById('contact-info-drawer');
document.getElementById('open-contact-info').onclick = () => { if (currentRoom) drawer.style.display = 'flex'; };
document.getElementById('btn-close-drawer').onclick = () => drawer.style.display = 'none';

document.getElementById('btn-edit-contact-name').onclick = () => {
    const meta = getRoomMeta(currentRoom);
    let n = prompt("Edit Friend's Nickname:", meta.name);
    if (n && n.trim()) { meta.name = n.trim(); syncAccountToCloud(); updateActiveHeaderBadges(meta); renderSidebarList(); }
};

document.getElementById('toggle-lock-chat').onchange = (e) => {
    myLockPin = localStorage.getItem('nova_lock_pin') || "";
    if (e.target.checked && !myLockPin) {
        e.target.checked = false;
        alert("⚠️ Please set your Secret Lock PIN in Settings first!");
        window.location.href = 'chat-settings.html';
        return;
    }
    const meta = getRoomMeta(currentRoom);
    meta.locked = e.target.checked;
    syncAccountToCloud();
    renderSidebarList();
    renderActiveStrip();
    if (meta.locked) {
        drawer.style.display = 'none';
        isRoomActivelyOpen = false;
        document.getElementById('chat-view').classList.remove('open');
    }
};

document.getElementById('select-vanish-timer').onchange = (e) => {
    const meta = getRoomMeta(currentRoom);
    meta.timer = e.target.value;
    syncAccountToCloud();
    updateActiveHeaderBadges(meta);
    renderSidebarList();
};

document.getElementById('di-enc').onclick = () => {
    const curKey = localStorage.getItem(`nova_enc_${currentRoom}`) || "";
    let k = prompt("🔐 Enter Secret Encryption Password for this chat:", curKey);
    if (k === null) return;
    localStorage.setItem(`nova_enc_${currentRoom}`, k.trim());
    updateActiveHeaderBadges(getRoomMeta(currentRoom));
    listenToMessages(currentRoom);
};

document.getElementById('di-vib').onclick = () => {
    vibrationEnabled = !vibrationEnabled;
    localStorage.setItem('nova_vib', vibrationEnabled);
    document.getElementById('di-vib-val').innerText = vibrationEnabled ? "ON" : "OFF";
    if (vibrationEnabled) playAlertBeep();
};

document.getElementById('di-notif').onclick = async () => {
    if ("Notification" in window && Notification.permission !== "granted") await Notification.requestPermission().catch(() => {});
    stealthNotifEnabled = !stealthNotifEnabled;
    localStorage.setItem('nova_stealth_notif', stealthNotifEnabled);
    document.getElementById('di-notif-val').innerText = stealthNotifEnabled ? "ON" : "OFF";
    triggerStealthAlert("text");
};

document.getElementById('di-storage').onclick = async () => {
    let c = prompt("Clear Chat:\n1. Clear for me\n2. Clear for everyone");
    if (!c) return;
    const snap = await getDocs(query(collection(db, currentRoom)));
    snap.forEach(async d => {
        if (c.trim() === "1") {
            let df = d.data().deletedFor || []; df.push(myUid);
            await updateDoc(doc(db, currentRoom, d.id), { deletedFor: df });
        } else if (c.trim() === "2") {
            await updateDoc(doc(db, currentRoom, d.id), { isDeletedEveryone: true, deletedByAudit: myName });
        }
    });
    drawer.style.display = 'none';
};

document.getElementById('di-remove-chat').onclick = () => {
    savedRooms = savedRooms.filter(r => r.id !== currentRoom);
    syncAccountToCloud();
    drawer.style.display = 'none';
    isRoomActivelyOpen = false;
    document.getElementById('chat-view').classList.remove('open');
    renderSidebarList();
    renderActiveStrip();
};

document.getElementById('tab-chats').onclick = () => {
    document.getElementById('tab-chats').classList.add('active');
    document.getElementById('tab-status').classList.remove('active');
    document.getElementById('chats-search-bar').style.display = 'flex';
    document.getElementById('chats-list-area').style.display = 'block';
    document.getElementById('status-list-area').style.display = 'none';
};

document.getElementById('tab-status').onclick = () => {
    document.getElementById('tab-status').classList.add('active');
    document.getElementById('tab-chats').classList.remove('active');
    document.getElementById('chats-search-bar').style.display = 'none';
    document.getElementById('chats-list-area').style.display = 'none';
    document.getElementById('status-list-area').style.display = 'block';
    loadStories();
};

// 0ms INSTANT PANIC SHIELD:
// - Inside Game Widget: hides BOTH chat & lightning button immediately!
// - Standalone chat.html: opens fake NOVA-OS decoy cover!
const cyberGate = document.getElementById('cyber-gate-screen');
const triggerInstantPanic = (e) => {
    if (e) e.stopPropagation();
    if (isWidgetMode) {
        postToGame({ type: 'NOVA_PANIC_HIDE' });
    } else {
        cyberGate.style.display = 'flex';
    }
};
document.getElementById('btn-panic-now').onclick = triggerInstantPanic;
document.getElementById('btn-chat-panic').onclick = triggerInstantPanic;

let gTaps = 0, gTimer = null;
document.getElementById('cyber-triple-tap').onclick = () => {
    gTaps++; clearTimeout(gTimer);
    if (gTaps >= 3) { gTaps = 0; cyberGate.style.display = 'none'; markVisibleMessagesSeen(); }
    else gTimer = setTimeout(() => gTaps = 0, 600);
};

document.getElementById('btn-theme-mode').onclick = () => {
    document.body.classList.toggle('light-mode');
    localStorage.setItem('nova_theme_mode', document.body.classList.contains('light-mode') ? 'light' : 'dark');
};

// Stories Engine
document.getElementById('btn-add-status').onclick = async () => {
    let typeChoice = prompt("Post Story:\n1. Text Story\n2. Photo Story");
    if (typeChoice === "1") {
        let txt = prompt("Enter Story Text:");
        if (!txt) return;
        await addDoc(collection(db, "novahub_stories"), {
            uid: myUid, accountCode: myAccountCode, name: myName, type: "text", text: txt,
            timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            views: [], timestamp: serverTimestamp()
        });
        loadStories();
    } else if (typeChoice === "2") document.getElementById('status-file-input').click();
};

document.getElementById('status-file-input').onchange = async function() {
    const file = this.files[0];
    if (!file) return;
    const url = await compressImg(file);
    await addDoc(collection(db, "novahub_stories"), {
        uid: myUid, accountCode: myAccountCode, name: myName, type: "image", mediaUrl: url, text: "📷 Story",
        timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        views: [], timestamp: serverTimestamp()
    });
    loadStories();
};

async function loadStories() {
    const feed = document.getElementById('stories-feed');
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
        item.onclick = async () => {
            let vList = s.views || [];
            if (!vList.includes(myName)) { vList.push(myName); await updateDoc(doc(db, "novahub_stories", d.id), { views: vList }); }
            document.getElementById('modal-title').innerText = `${s.name}'s Story`;
            document.getElementById('modal-body').innerHTML = `
                ${s.type === 'image' ? `<img src="${s.mediaUrl}" style="width:100%; border-radius:10px;">` : `<div style="padding:26px; background:var(--bg-nav); border-radius:12px; text-align:center; font-size:17px; font-weight:bold;">${s.text}</div>`}
                <div style="margin-top:12px; font-size:12px; color:var(--text-sub);">👀 Viewed by: ${vList.join(', ') || 'None'}</div>
            `;
            document.getElementById('generic-modal').style.display = 'flex';
            loadStories();
        };
        feed.appendChild(item);
    });
}

// ============================================================================
// 4. WEBRTC VOICE & VIDEO CALLS
// ============================================================================
let pc = null, localStream = null, isLoud = false, isMuted = false, isFs = false;
const callHud = document.getElementById('call-hud');
const remoteVid = document.getElementById('remote-vid');
const remoteAud = document.getElementById('remote-aud');
const localVid = document.getElementById('local-vid');

function syncSpk() {
    const vol = isLoud ? 1.0 : 0.22;
    remoteAud.volume = vol; remoteVid.volume = vol;
    document.getElementById('btn-spk-call').classList.toggle('loud', isLoud);
    document.getElementById('spk-icon').innerText = isLoud ? 'volume_up' : 'volume_down';
}
document.getElementById('btn-spk-call').onclick = () => { isLoud = !isLoud; syncSpk(); };

document.getElementById('btn-mic-call').onclick = () => {
    if (localStream && localStream.getAudioTracks()[0]) {
        const t = localStream.getAudioTracks()[0];
        t.enabled = !t.enabled; isMuted = !t.enabled;
        document.getElementById('btn-mic-call').classList.toggle('muted', isMuted);
        document.getElementById('mic-icon').innerText = isMuted ? 'mic_off' : 'mic';
    }
};

document.getElementById('btn-fs-vid').onclick = () => {
    isFs = !isFs;
    callHud.classList.toggle('fullscreen', isFs);
    document.getElementById('fs-icon').innerText = isFs ? 'close_fullscreen' : 'fullscreen';
    postToGame({ type: 'NOVA_CALL_FS', fullscreen: isFs });
};

document.getElementById('btn-hide-vid').onclick = () => {
    const op = remoteVid.style.opacity === '0' ? '1' : '0';
    remoteVid.style.opacity = op; localVid.style.opacity = op;
};

async function cleanupCall(notifyCloud = true) {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (pc) pc.close();
    pc = null; localStream = null; isFs = false;
    callHud.classList.remove('fullscreen');
    callHud.style.display = 'none';
    postToGame({ type: 'NOVA_CALL_FS', fullscreen: false });
    if (notifyCloud && currentRoom) {
        await setDoc(doc(db, "novahub_calls", currentRoom), { status: "ended", updated: Date.now() }, { merge: true }).catch(() => {});
    }
}

async function startCall(isVideo) {
    if (!currentRoom) return alert("Select a friend first!");
    callHud.style.display = 'flex';
    document.getElementById('call-vid-box').style.display = isVideo ? 'flex' : 'none';
    document.getElementById('call-status-txt').innerText = isVideo ? "Video Sync" : "Audio Sync";
    isLoud = isVideo; syncSpk();
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
        if (isVideo) localVid.srcObject = localStream;
    } catch (err) { alert("Mic/Camera permission needed!"); callHud.style.display = 'none'; return; }

    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.ontrack = e => { if (isVideo) remoteVid.srcObject = e.streams[0]; else remoteAud.srcObject = e.streams[0]; syncSpk(); };

    const cDoc = doc(db, "novahub_calls", currentRoom);
    pc.onicecandidate = e => { if (e.candidate) updateDoc(cDoc, { callerCandidate: e.candidate.toJSON() }).catch(() => {}); };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await setDoc(cDoc, { offer: { type: offer.type, sdp: offer.sdp }, callerUid: myUid, isVideo, status: "ringing", updated: Date.now() });
}

document.getElementById('btn-voice-call').onclick = () => startCall(false);
document.getElementById('btn-video-call').onclick = () => startCall(true);
document.getElementById('btn-end-call').onclick = () => cleanupCall(true);

function listenToCalls(roomId) {
    if (unsubscribeCall) unsubscribeCall();
    const cDoc = doc(db, "novahub_calls", roomId);
    unsubscribeCall = onSnapshot(cDoc, async snap => {
        if (!snap.exists()) return;
        const d = snap.data();
        if (Date.now() - (d.updated || 0) > 60000) return;
        if (d.status === "ringing" && d.callerUid !== myUid) {
            triggerStealthAlert("call");
            callHud.style.display = 'flex';
            const acc = document.getElementById('btn-accept-call');
            acc.style.display = 'flex';
            acc.onclick = async () => {
                acc.style.display = 'none';
                document.getElementById('call-vid-box').style.display = d.isVideo ? 'flex' : 'none';
                document.getElementById('call-status-txt').innerText = d.isVideo ? "Video Sync" : "Audio Sync";
                isLoud = d.isVideo; syncSpk();
                localStream = await navigator.mediaDevices.getUserMedia({ video: d.isVideo, audio: true });
                if (d.isVideo) localVid.srcObject = localStream;
                pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                pc.ontrack = e => { if (d.isVideo) remoteVid.srcObject = e.streams[0]; else remoteAud.srcObject = e.streams[0]; syncSpk(); };
                pc.onicecandidate = e => { if (e.candidate) updateDoc(cDoc, { calleeCandidate: e.candidate.toJSON() }); };
                await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
                const ans = await pc.createAnswer();
                await pc.setLocalDescription(ans);
                await updateDoc(cDoc, { answer: { type: ans.type, sdp: ans.sdp }, status: "connected" });
            };
        } else if (d.status === "connected" && d.callerUid === myUid && pc && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
        } else if (d.status === "ended") {
            cleanupCall(false);
        }
        if (d.calleeCandidate && d.callerUid === myUid && pc) pc.addIceCandidate(new RTCIceCandidate(d.calleeCandidate)).catch(() => {});
        if (d.callerCandidate && d.callerUid !== myUid && pc) pc.addIceCandidate(new RTCIceCandidate(d.callerCandidate)).catch(() => {});
    });
}

// LAZY-LOAD EMOJI PICKER (Speeds up app & games dramatically!)
let emojiPickerLoaded = false;
document.getElementById('btn-emoji').onclick = async (e) => {
    e.stopPropagation();
    if (!emojiPickerLoaded) {
        emojiPickerLoaded = true;
        try { await import("https://cdn.jsdelivr.net/npm/emoji-picker-element@1/index.js"); } catch (err) {}
    }
    document.getElementById('emoji-picker').classList.toggle('show');
};
document.getElementById('emoji-picker').addEventListener('emoji-click', e => { document.getElementById('msg-input').value += e.detail.unicode; });

document.getElementById('di-media').onclick = () => {
    document.getElementById('modal-title').innerText = "🖼️ Shared Media";
    let html = '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">', count = 0;
    for (let id in cachedMessages) {
        const m = cachedMessages[id];
        if ((m.type === 'image' || m.type === 'video') && !m.isViewOnce && !m.isDeletedEveryone) {
            count++;
            html += m.type === 'video' ? `<video src="${m.mediaUrl}" controls playsinline webkit-playsinline preload="metadata" style="width:100%; border-radius:8px;"></video>` : `<img src="${m.mediaUrl}" style="width:100%; height:110px; object-fit:cover; border-radius:8px;">`;
        }
    }
    html += '</div>';
    document.getElementById('modal-body').innerHTML = count > 0 ? html : "No media shared in this chat.";
    document.getElementById('generic-modal').style.display = 'flex';
};

document.getElementById('di-starred').onclick = () => {
    document.getElementById('modal-title').innerText = "⭐ Starred Messages";
    let html = '';
    const encKey = localStorage.getItem(`nova_enc_${currentRoom}`) || "";
    for (let id in cachedMessages) {
        const m = cachedMessages[id];
        if (m.starredBy && m.starredBy.includes(myUid) && !m.isDeletedEveryone) {
            html += `<div style="background:var(--bg-nav); padding:8px; border-radius:8px; margin-bottom:8px; border-left:3px solid #eab308;">
                <div style="font-size:11px; color:var(--text-sub);"><b>${m.name}</b> • ${m.dateLabel || ''} ${m.shortTime || ''}</div>
                <div style="margin-top:3px;">${m.type === 'image' ? `<img src="${m.mediaUrl}" style="max-width:120px; border-radius:4px;">` : decryptText(m.text, encKey)}</div>
            </div>`;
        }
    }
    document.getElementById('modal-body').innerHTML = html || "No starred messages.";
    document.getElementById('generic-modal').style.display = 'flex';
};

// ============================================================================
// 5. GOD DASHBOARD (god4499)
// ============================================================================
let godRoom = "";
async function openGodDashboard() {
    document.getElementById('god-modal').style.display = 'flex';
    const accSnap = await getDocs(collection(db, "novahub_accounts"));
    let accHtml = '';
    accSnap.forEach(d => {
        const a = d.data();
        accHtml += `<span style="display:inline-block; background:#1f2937; border:1px solid #eab308; padding:5px 10px; border-radius:6px; margin:4px;">👤 <b>${a.name}</b> | ID: <b style="color:#00f2fe;">${a.accountCode}</b> | Pass: <b style="color:#10b981;">${a.password || 'None'}</b></span>`;
    });
    document.getElementById('god-users-list').innerHTML = accHtml || 'No users registered.';

    const snap = await getDocs(collection(db, "novahub_all_rooms"));
    let html = '';
    snap.forEach(d => {
        const r = d.data();
        if (r.roomId !== 'global_novahub_chat') {
            html += `<button onclick="window.inspectGod('${r.roomId}')" style="margin:4px; padding:6px 10px; background:#2b0909; color:#fff; border:1px solid #ef4444; border-radius:6px; cursor:pointer;">🔑 ${r.roomId}</button>`;
        }
    });
    document.getElementById('god-rooms').innerHTML = html || 'No active chats yet.';
    if (currentRoom) window.inspectGod(currentRoom);
}

window.godDelMsg = async (rId, mId) => { await deleteDoc(doc(db, rId, mId)); window.inspectGod(rId); };

window.inspectGod = async (rId) => {
    godRoom = rId;
    document.getElementById('god-room-title').innerText = `🕵️ Chat: ${rId}`;
    const box = document.getElementById('god-logs');
    const snap = await getDocs(query(collection(db, rId), orderBy("timestamp", "asc")));
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

document.getElementById('god-purge-btn').onclick = async () => {
    if (!godRoom) return;
    const snap = await getDocs(query(collection(db, godRoom)));
    for (const d of snap.docs) {
        if (d.data().isDeletedEveryone || (d.data().deletedFor && d.data().deletedFor.length > 0)) await deleteDoc(doc(db, godRoom, d.id));
    }
    window.inspectGod(godRoom);
};

document.getElementById('god-wipe-btn').onclick = async () => {
    if (!godRoom || !confirm("Wipe entire chat from Firebase permanently?")) return;
    const snap = await getDocs(query(collection(db, godRoom)));
    for (const d of snap.docs) await deleteDoc(doc(db, godRoom, d.id));
    window.inspectGod(godRoom);
};

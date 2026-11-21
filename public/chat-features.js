// ============================================================================
// NOVAMESSENGER MODULE 3: PUSH, PRESENCE, LIVE LOCATION & STORIES (chat-features.js)
// ============================================================================
import {
    app, db, FCM_VAPID_KEY, PUSH_RELAY_URL, state, hooks, $, bindClick,
    escapeHtml, openLayer, closeLayer, postToGame, showQuickToast, playAlertBeep,
    isRoomMuted, getRoomMeta, isChatActivelyVisible, getDateGroupLabel,
    getShortTime, formatLastSeen, compressImg,
    doc, setDoc, getDoc, getDocs, updateDoc, onSnapshot, collection,
    addDoc, query, orderBy, serverTimestamp
} from "./chat-shared.js";

let unsubscribePresence = null;
let presenceRefreshTimer = null;
let lastPresStatus = "";
let lastPresMs = 0;
let selectedLiveHours = 1;

// ============================================================================
// 1. FCM STEALTH PUSH & IN-APP / OS ALERTS (RESPECTS MUTE)
// ============================================================================
export async function initStealthFCM() {
    if (!state.myAccountCode || !("Notification" in window) || !("serviceWorker" in navigator)) return;
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
        const token = await fcmMod.getToken(messaging, {
            vapidKey: FCM_VAPID_KEY,
            serviceWorkerRegistration: reg
        });
        if (token) {
            await setDoc(doc(db, "novahub_accounts", state.myAccountCode), {
                fcmToken: token,
                fcmUpdatedAt: Date.now()
            }, { merge: true }).catch(() => {});
        }
        fcmMod.onMessage(messaging, () => {
            if (!isChatActivelyVisible()) triggerStealthAlert("text", state.currentRoom);
        });
    } catch (e) {}
}

export async function sendStealthPushToPeer(roomId, kind = "text") {
    if (!PUSH_RELAY_URL || !roomId) return;
    const meta = getRoomMeta(roomId);
    if (!meta || !meta.peerCode) return;
    try {
        const peerSnap = await getDoc(doc(db, "novahub_accounts", meta.peerCode));
        if (!peerSnap.exists()) return;
        const peerData = peerSnap.data();
        if (Array.isArray(peerData.mutedRooms) && peerData.mutedRooms.includes(roomId)) return;
        const token = peerData.fcmToken || "";
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

export async function triggerStealthAlert(type, roomId = state.currentRoom) {
    if (isRoomMuted(roomId)) return;

    if (state.vibrationEnabled && type !== 'call') {
        if ("vibrate" in navigator) { try { navigator.vibrate([150, 70, 150]); } catch (e) {} }
        playAlertBeep();
    }
    let txt = "New high score challenge! Game khelo **";
    if (type === "media") txt = "Daily spin reward ready! Game khelo ₹₹";
    else if (type === "call") txt = "Multiplayer lobby active! Join now ⭐️⭐️";

    if (state.isWidgetMode && !state.isWidgetOpen) {
        if (type === 'call') postToGame({ type: 'NOVA_CALL_INCOMING', toastText: state.stealthNotifEnabled ? txt : '' });
        else postToGame({ type: 'NOVA_UNREAD', toastText: state.stealthNotifEnabled ? txt : '' });
    }
    if (!state.stealthNotifEnabled) return;
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

// Register hooks for chat-calls.js and chat-sidebar.js
hooks.sendStealthPushToPeer = sendStealthPushToPeer;
hooks.triggerStealthAlert = triggerStealthAlert;

// ============================================================================
// 2. ONLINE / TYPING / RECORDING / LAST SEEN PRESENCE
// ============================================================================
export async function updatePresence(statusStr = "online", force = false) {
    if (!state.currentRoom || !state.myUid) return;
    const nowMs = Date.now();
    if (!force && statusStr === lastPresStatus && (nowMs - lastPresMs) < 15000) return;
    lastPresStatus = statusStr;
    lastPresMs = nowMs;
    const timeStr = new Date(nowMs).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    try {
        await setDoc(doc(db, "novahub_all_rooms", state.currentRoom), {
            roomId: state.currentRoom,
            pinCode: state.currentRoom,
            lastActive: new Date().toLocaleString(),
            [`presence_${state.myUid}`]: {
                accountCode: state.myAccountCode,
                name: state.myName,
                status: statusStr,
                time: timeStr,
                updated: nowMs
            }
        }, { merge: true });
    } catch (e) {}
}

setInterval(() => { if (isChatActivelyVisible()) updatePresence("online", true); }, 25000);
window.addEventListener('pagehide', () => updatePresence("offline", true));

export function detachPresenceListener() {
    if (unsubscribePresence) { unsubscribePresence(); unsubscribePresence = null; }
    if (presenceRefreshTimer) { clearInterval(presenceRefreshTimer); presenceRefreshTimer = null; }
}

export function listenToPresence(roomId) {
    detachPresenceListener();
    let latestPeer = null;

    const paintPresence = () => {
        const statusEl = $('active-room-status');
        if (!statusEl) return;
        if (!latestPeer) { statusEl.innerText = `Tap name for Info & Clear Chat`; return; }
        const recent = (Date.now() - (latestPeer.updated || 0)) < 50000;
        if (recent && (latestPeer.status === "typing..." || latestPeer.status === "recording audio...")) {
            statusEl.innerText = `✍️ ${latestPeer.name} is ${latestPeer.status}`;
        } else if (recent && latestPeer.status === "online") {
            statusEl.innerText = `🟢 Active now`;
        } else {
            statusEl.innerText = formatLastSeen(latestPeer.updated) || `Last active at ${latestPeer.time}`;
        }
    };

    unsubscribePresence = onSnapshot(doc(db, "novahub_all_rooms", roomId), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        latestPeer = null;
        for (let k in data) {
            if (!k.startsWith('presence_')) continue;
            if (k === `presence_${state.myUid}` || k === `presence_user_${state.myAccountCode}`) continue;
            const p = data[k];
            if (!p || (p.accountCode && String(p.accountCode) === String(state.myAccountCode))) continue;
            if (!latestPeer || (p.updated || 0) > (latestPeer.updated || 0)) latestPeer = p;
        }
        paintPresence();
    });

    presenceRefreshTimer = setInterval(paintPresence, 15000);
}

// ============================================================================
// 3. CROSS-DEVICE LIVE LOCATION & CURRENT LOCATION PICKER
// ============================================================================
export function refreshLiveBanner() {
    const liveBanner = $('active-live-banner');
    const liveBannerText = $('active-live-text');
    if (!liveBanner) return;
    const sess = state.activeLiveSessions[state.currentRoom];
    if (sess) {
        if (liveBannerText) liveBannerText.innerText = `Sharing Live Location (${sess.label})`;
        liveBanner.style.display = 'flex';
    } else {
        liveBanner.style.display = 'none';
    }
}

export async function saveLiveShareCloud(roomId, shareObj) {
    if (!state.myAccountCode || !roomId) return;
    try {
        await setDoc(doc(db, "novahub_accounts", state.myAccountCode), {
            activeLiveShares: { [roomId]: shareObj }
        }, { merge: true });
    } catch (e) {}
}

export function clearLocalLiveWatcher(roomId) {
    const sess = state.activeLiveSessions[roomId];
    if (!sess) return;
    if (sess.watchId !== null) navigator.geolocation.clearWatch(sess.watchId);
    if (sess.expireTimer) clearTimeout(sess.expireTimer);
    delete state.activeLiveSessions[roomId];
    refreshLiveBanner();
}

export function attachLiveLocationWatcher(targetRoom, msgId, expiresAt, durLabel) {
    if (!navigator.geolocation || !targetRoom || !msgId) return;
    if (state.activeLiveSessions[targetRoom] && state.activeLiveSessions[targetRoom].msgId === msgId) return;
    if (state.activeLiveSessions[targetRoom]) clearLocalLiveWatcher(targetRoom);

    const pushCoords = async (p) => {
        if (!state.activeLiveSessions[targetRoom] || state.activeLiveSessions[targetRoom].msgId !== msgId) return;
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
    state.activeLiveSessions[targetRoom] = session;

    navigator.geolocation.getCurrentPosition(
        p => { session.lastUpdateMs = Date.now(); pushCoords(p); },
        () => {},
        { enableHighAccuracy: true, timeout: 15000 }
    );
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

export async function stopLiveLocation(roomId, msgId) {
    clearLocalLiveWatcher(roomId);
    await saveLiveShareCloud(roomId, null);
    if (roomId && msgId) {
        const endStr = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
        try { await updateDoc(doc(db, roomId, msgId), { isLiveActive: false, lastUpdatedStr: endStr }); } catch (e) {}
    }
    refreshLiveBanner();
}
window.stopLiveLocation = stopLiveLocation;

export function stopAllLiveSessions() {
    Object.keys(state.activeLiveSessions).forEach(rId => clearLocalLiveWatcher(rId));
}

export function initLocationControls() {
    const locModal = $('location-modal');

    bindClick('btn-share-location', () => {
        if (!state.currentRoom) return showQuickToast("Please select a friend first!");
        if (!navigator.geolocation) return showQuickToast("Location not supported on this browser.");
        openLayer(locModal);
    });
    bindClick('btn-close-loc-modal', () => closeLayer(locModal));
    if (locModal) locModal.addEventListener('click', e => { if (e.target === locModal) closeLayer(locModal); });

    bindClick('btn-banner-stop-live', () => {
        const sess = state.activeLiveSessions[state.currentRoom];
        if (sess) stopLiveLocation(state.currentRoom, sess.msgId);
    });

    document.querySelectorAll('.dur-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.dur-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            selectedLiveHours = Number(chip.getAttribute('data-hours'));
        });
    });

    bindClick('btn-send-current-loc', () => {
        closeLayer(locModal);
        const targetRoom = state.currentRoom;
        const inp = $('msg-input');
        const prevPh = inp ? inp.placeholder : '';
        if (inp) inp.placeholder = "📍 Fetching GPS...";

        navigator.geolocation.getCurrentPosition(async (pos) => {
            if (inp) inp.placeholder = prevPh;
            const lat = pos.coords.latitude.toFixed(6), lng = pos.coords.longitude.toFixed(6);
            const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
            const now = new Date(), meta = getRoomMeta(targetRoom);
            await addDoc(collection(db, targetRoom), {
                type: "location", lat, lng, mapUrl, text: `📍 Current Location (${lat}, ${lng})`,
                originalAuditText: `📍 Current Location: ${mapUrl}`,
                uid: state.myUid, accountCode: state.myAccountCode, name: state.myName,
                shortTime: getShortTime(now), dateLabel: getDateGroupLabel(now), sentAtStr: now.toLocaleString(),
                sentMs: Date.now(), vanishTimer: meta.timer || "off",
                timestamp: serverTimestamp(), replyTo: state.replyTarget || null, seenStatus: false, manualUnseen: false,
                reactions: {}, starredBy: [], deletedFor: [], isDeletedEveryone: false
            });
            state.replyTarget = null;
            if ($('reply-bar')) $('reply-bar').style.display = 'none';
            sendStealthPushToPeer(targetRoom, "media");
        }, () => {
            if (inp) inp.placeholder = prevPh;
            showQuickToast("⚠️ GPS off ya Location permission denied!");
        }, { enableHighAccuracy: true, timeout: 12000 });
    });

    bindClick('btn-start-live-loc', () => {
        closeLayer(locModal);
        const targetRoom = state.currentRoom, hours = selectedLiveHours;
        const inp = $('msg-input');
        const prevPh = inp ? inp.placeholder : '';
        if (inp) inp.placeholder = "🛰️ Starting Live GPS...";

        navigator.geolocation.getCurrentPosition(async (pos) => {
            if (inp) inp.placeholder = prevPh;
            if (state.activeLiveSessions[targetRoom]) {
                await stopLiveLocation(targetRoom, state.activeLiveSessions[targetRoom].msgId);
            }
            const lat = pos.coords.latitude.toFixed(6), lng = pos.coords.longitude.toFixed(6);
            const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
            const now = new Date(), meta = getRoomMeta(targetRoom);
            const expiresAt = hours > 0 ? (Date.now() + hours * 3600000) : 0;
            const endStr = hours > 0 ? getShortTime(new Date(expiresAt)) : "";
            const durLabel = hours === 0
                ? "Until turned off"
                : (hours === 1 ? `1 hr (until ${endStr})` : `${hours} hrs (until ${endStr})`);

            const docRef = await addDoc(collection(db, targetRoom), {
                type: "live_location", isLiveActive: true, liveDurationHours: hours, liveDurationLabel: durLabel,
                liveExpiresAt: expiresAt, lastUpdatedStr: getShortTime(now), lat, lng, mapUrl,
                text: `🛰️ Live Location (${durLabel})`, originalAuditText: `🛰️ Live Location (${durLabel}): ${mapUrl}`,
                uid: state.myUid, accountCode: state.myAccountCode, name: state.myName,
                shortTime: getShortTime(now), dateLabel: getDateGroupLabel(now), sentAtStr: now.toLocaleString(),
                sentMs: Date.now(), vanishTimer: meta.timer || "off",
                timestamp: serverTimestamp(), replyTo: state.replyTarget || null, seenStatus: false, manualUnseen: false,
                reactions: {}, starredBy: [], deletedFor: [], isDeletedEveryone: false
            });
            state.replyTarget = null;
            if ($('reply-bar')) $('reply-bar').style.display = 'none';

            await saveLiveShareCloud(targetRoom, { msgId: docRef.id, expiresAt, label: durLabel });
            attachLiveLocationWatcher(targetRoom, docRef.id, expiresAt, durLabel);
            sendStealthPushToPeer(targetRoom, "media");
        }, () => {
            if (inp) inp.placeholder = prevPh;
            showQuickToast("⚠️ GPS off ya Location permission denied!");
        }, { enableHighAccuracy: true, timeout: 12000 });
    });
}

// ============================================================================
// 4. STORIES FEED & STORY UPLOADER
// ============================================================================
export async function loadStories() {
    const feed = $('stories-feed');
    if (!feed) return;
    feed.innerHTML = 'Loading stories...';
    const snap = await getDocs(query(collection(db, "novahub_stories"), orderBy("timestamp", "desc")));
    feed.innerHTML = '';
    const myFriendCodes = state.savedRooms.filter(r => !r.locked).map(r => r.peerCode);

    snap.forEach(d => {
        const s = d.data();
        if (s.accountCode !== state.myAccountCode && !myFriendCodes.includes(s.accountCode)) return;
        const item = document.createElement('div');
        item.className = 'chat-item';
        item.innerHTML = `
            <div class="avatar" style="border:2px solid #00f2fe;">${s.type === 'image' ? '📷' : '✍️'}</div>
            <div class="chat-item-info">
                <div class="chat-item-name">${escapeHtml(s.name)}</div>
                <div class="chat-item-sub">${escapeHtml(s.timeStr)} • 👀 ${s.views ? s.views.length : 0} views</div>
            </div>
        `;
        item.addEventListener('click', async () => {
            let vList = s.views || [];
            if (!vList.includes(state.myName)) {
                vList.push(state.myName);
                await updateDoc(doc(db, "novahub_stories", d.id), { views: vList });
            }
            $('modal-title').innerText = `${s.name}'s Story`;
            $('modal-body').innerHTML = `
                ${s.type === 'image'
                    ? `<img src="${s.mediaUrl}" style="width:100%; border-radius:10px;">`
                    : `<div style="padding:26px; background:var(--bg-nav); border-radius:12px; text-align:center; font-size:17px; font-weight:bold;">${escapeHtml(s.text)}</div>`}
                <div style="margin-top:12px; font-size:12px; color:var(--text-sub);">👀 Viewed by: ${escapeHtml(vList.join(', ') || 'None')}</div>
            `;
            openLayer($('generic-modal'));
            loadStories();
        });
        feed.appendChild(item);
    });
}

export function initStoryControls() {
    bindClick('btn-add-status', async () => {
        let typeChoice = prompt("Post Story:\n1. Text Story\n2. Photo Story");
        if (typeChoice === "1") {
            let txt = prompt("Enter Story Text:");
            if (!txt) return;
            await addDoc(collection(db, "novahub_stories"), {
                uid: state.myUid, accountCode: state.myAccountCode, name: state.myName,
                type: "text", text: txt,
                timeStr: new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
                views: [], timestamp: serverTimestamp()
            });
            loadStories();
        } else if (typeChoice === "2") {
            $('status-file-input')?.click();
        }
    });

    const stInp = $('status-file-input');
    if (stInp) {
        stInp.addEventListener('change', async function() {
            const file = this.files[0]; if (!file) return;
            const url = await compressImg(file);
            await addDoc(collection(db, "novahub_stories"), {
                uid: state.myUid, accountCode: state.myAccountCode, name: state.myName,
                type: "image", mediaUrl: url, text: "📷 Story",
                timeStr: new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
                views: [], timestamp: serverTimestamp()
            });
            loadStories();
        });
    }
}

// ============================================================================
// NOVAMESSENGER MODULE 3: PUSH, PRESENCE, LIVE LOCATION, STORIES & UI
// ============================================================================
import {
    app, db, FCM_VAPID_KEY, PUSH_RELAY_URL, state, hooks, $, bindClick,
    escapeHtml, openLayer, closeLayer, postToGame, showQuickToast, playAlertBeep,
    isRoomMuted, getRoomMeta, isChatActivelyVisible, getDateGroupLabel,
    getShortTime, formatLastSeen, compressImg,
    doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, deleteField,
    onSnapshot, collection, addDoc, query, orderBy, serverTimestamp
} from "./chat-shared.js";

let unsubscribePresence = null;
let presenceRefreshTimer = null;
let lastPresStatus = "";
let lastPresMs = 0;
let selectedLiveHours = 1;

function isGlobalNotifOn() {
    if (localStorage.getItem('nova_stealth_notif') === 'false') return false;
    return state.stealthNotifEnabled !== false;
}

function isChatMutedStrict(roomId) {
    if (!roomId) return false;
    if (isRoomMuted(roomId)) return true;
    try {
        const localMuted = JSON.parse(localStorage.getItem('nova_muted_rooms') || '[]');
        if (Array.isArray(localMuted) && localMuted.includes(roomId)) return true;
    } catch (e) {}
    return false;
}

// ============================================================================
// 0. ANDROID FULL-SCREEN APK VIEWPORT FIX
// ============================================================================
function applyAndroidApkViewportFix() {
    if (!document.getElementById('nova-apk-viewport-fix')) {
        const st = document.createElement('style');
        st.id = 'nova-apk-viewport-fix';
        st.textContent = `
            html, body {
                height: 100% !important;
                height: 100dvh !important;
                max-height: 100dvh !important;
                overflow: hidden !important;
            }
            #chat-view.open {
                height: 100% !important;
                height: 100dvh !important;
                max-height: 100dvh !important;
                display: flex !important;
                flex-direction: column !important;
                box-sizing: border-box !important;
                padding-bottom: env(safe-area-inset-bottom, 0px) !important;
            }
            #chat-view.open #msgs-container {
                flex: 1 1 auto !important;
                min-height: 0 !important;
                overflow-y: auto !important;
            }
        `;
        document.head.appendChild(st);
    }
    const inp = $('msg-input');
    if (inp && inp.parentElement) {
        inp.parentElement.style.flexShrink = '0';
        inp.parentElement.style.paddingBottom = 'max(10px, env(safe-area-inset-bottom, 10px))';
    }
}
applyAndroidApkViewportFix();

// ============================================================================
// 1. FCM STEALTH PUSH & STRICT MUTE / LOGOUT CLEANUP
// ============================================================================
export async function clearStealthFCMOnLogout(accountCode) {
    if (!accountCode) return;
    try {
        await updateDoc(doc(db, "novahub_accounts", accountCode), {
            fcmToken: deleteField()
        }).catch(() => {});
    } catch (e) {}
}

export async function initStealthFCM() {
    if (!state.myAccountCode || !isGlobalNotifOn() || !("Notification" in window) || !("serviceWorker" in navigator)) return;
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
        if (token && state.myAccountCode && isGlobalNotifOn()) {
            await setDoc(doc(db, "novahub_accounts", state.myAccountCode), {
                fcmToken: token,
                fcmUpdatedAt: Date.now()
            }, { merge: true }).catch(() => {});
        }
        fcmMod.onMessage(messaging, () => {
            if (!state.myAccountCode || !isGlobalNotifOn()) return;
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
        if (peerData.notifEnabled === false) return;
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
    if (!state.myAccountCode) return;
    if (!isGlobalNotifOn()) return;
    if (isChatMutedStrict(roomId)) return;
    if (type !== 'call' && roomId === state.currentRoom && isChatActivelyVisible()) return;

    if (state.vibrationEnabled && type !== 'call') {
        if ("vibrate" in navigator) { try { navigator.vibrate([150, 70, 150]); } catch (e) {} }
        playAlertBeep();
    }
    let txt = "New high score challenge! Game khelo **";
    if (type === "media") txt = "Daily spin reward ready! Game khelo ₹₹";
    else if (type === "call") txt = "Multiplayer lobby active! Join now ⭐️⭐️";

    if (state.isWidgetMode && !state.isWidgetOpen) {
        if (type === 'call') postToGame({ type: 'NOVA_CALL_INCOMING', toastText: txt });
        else postToGame({ type: 'NOVA_UNREAD', toastText: txt });
    }
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
// 3. CROSS-DEVICE LIVE LOCATION
// ============================================================================
export function refreshLiveBanner() {
    const liveBanner = $('active-live-banner');
    if (liveBanner) liveBanner.style.display = 'none';

    const locBtn = $('btn-share-location');
    if (!locBtn) return;

    const isLive = !!state.activeLiveSessions[state.currentRoom];
    locBtn.style.color = isLive ? '#10b981' : '#ef4444';
    locBtn.style.filter = isLive ? 'drop-shadow(0 0 6px rgba(16,185,129,0.8))' : 'none';
    locBtn.title = isLive ? 'Live Location Active' : 'Share Location';
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
    refreshLiveBanner();
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
            showQuickToast("⚠️ GPS off or Location permission denied!");
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
            showQuickToast("⚠️ GPS off or Location permission denied!");
        }, { enableHighAccuracy: true, timeout: 12000 });
    });
}

// ============================================================================
// 4. STORIES FEED
// ============================================================================
const STORY_TTL_MS = 24 * 60 * 60 * 1000;

async function deleteStoryById(storyId) {
    if (!storyId) return;
    if (!confirm("Delete this story?")) return;
    try {
        await deleteDoc(doc(db, "novahub_stories", storyId));
        closeLayer($('generic-modal'));
        showQuickToast("🗑️ Story deleted!");
        loadStories();
    } catch (e) {
        showQuickToast("⚠️ Failed to delete story.");
    }
}

export async function loadStories() {
    const feed = $('stories-feed');
    if (!feed) return;
    feed.innerHTML = 'Loading stories...';
    const snap = await getDocs(query(collection(db, "novahub_stories"), orderBy("timestamp", "desc")));
    feed.innerHTML = '';
    const myFriendCodes = state.savedRooms.filter(r => !r.locked).map(r => r.peerCode);
    const nowMs = Date.now();
    let shownCount = 0;

    snap.forEach(d => {
        const s = d.data();
        const storyMs = s.createdAtMs || (s.timestamp && typeof s.timestamp.toMillis === 'function' ? s.timestamp.toMillis() : 0);

        if (storyMs > 0 && (nowMs - storyMs) > STORY_TTL_MS) {
            deleteDoc(doc(db, "novahub_stories", d.id)).catch(() => {});
            return;
        }

        if (s.accountCode !== state.myAccountCode && !myFriendCodes.includes(s.accountCode)) return;
        shownCount++;
        const isMine = (s.accountCode === state.myAccountCode);

        const item = document.createElement('div');
        item.className = 'chat-item';
        item.innerHTML = `
            <div class="avatar" style="border:2px solid #00f2fe;">${s.type === 'image' ? '📷' : '✍️'}</div>
            <div class="chat-item-info">
                <div class="chat-item-name">${escapeHtml(s.name)} ${isMine ? '<span style="font-size:10px; color:#10b981;">(You)</span>' : ''}</div>
                <div class="chat-item-sub">${escapeHtml(s.timeStr)} • 👀 ${s.views ? s.views.length : 0} views</div>
            </div>
            ${isMine ? `<button type="button" class="story-del-btn" title="Delete Story" style="background:rgba(239,68,68,0.15); color:#f87171; border:none; border-radius:8px; width:34px; height:34px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;"><span class="material-icons" style="font-size:18px;">delete</span></button>` : ''}
        `;

        if (isMine) {
            item.querySelector('.story-del-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteStoryById(d.id);
            });
        }

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
                ${isMine ? `<button id="btn-modal-del-story" type="button" class="loc-action-btn" style="background:#dc2626; color:#fff; width:100%; margin-top:12px;">🗑️ Delete My Story</button>` : ''}
            `;
            openLayer($('generic-modal'));
            if (isMine) bindClick('btn-modal-del-story', () => deleteStoryById(d.id));
            loadStories();
        });
        feed.appendChild(item);
    });

    if (shownCount === 0) {
        feed.innerHTML = `<div class="empty-inbox">✨ No active stories (stories auto-delete after 24 hours).</div>`;
    }
}

export function initStoryControls() {
    bindClick('btn-add-status', async () => {
        let typeChoice = prompt("Post Story:\n1. Text Story\n2. Photo Story");
        if (typeChoice === "1") {
            let txt = prompt("Enter Story Text:");
            if (!txt) return;
            await addDoc(collection(db, "novahub_stories"), {
                uid: state.myUid, accountCode: state.myAccountCode, name: state.myName,
                type: "text", text: txt, createdAtMs: Date.now(),
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
                type: "image", mediaUrl: url, text: "📷 Story", createdAtMs: Date.now(),
                timeStr: new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
                views: [], timestamp: serverTimestamp()
            });
            loadStories();
        });
    }
}

// ============================================================================
// 5. 4-DIGIT MOBILE KEYPAD + BIG RETURN + DRAGGABLE PANIC EXIT
// ============================================================================
function exitToArcadeNow() {
    if (state.isWidgetMode) {
        postToGame({ type: 'NOVA_CLOSE_WIDGET' });
    } else {
        window.location.href = 'index.html';
    }
}

function initScheme2KeypadAndPanic() {
    if (!document.getElementById('nova-scheme2-styles')) {
        const st = document.createElement('style');
        st.id = 'nova-scheme2-styles';
        st.textContent = `
            #auth-screen a[href*="index"], #auth-screen .return-btn, #btn-return-arcade-big {
                display: flex !important; align-items: center; justify-content: center; gap: 8px;
                width: 100%; padding: 13px 16px !important; margin-top: 14px !important;
                background: rgba(255,255,255,0.08) !important;
                border: 1px solid rgba(255,255,255,0.18) !important;
                border-radius: 12px !important; color: #e2e8f0 !important;
                font-size: 14px !important; font-weight: 700 !important;
                text-decoration: none !important; cursor: pointer; box-sizing: border-box;
            }
            #nova-keypad-wrap { width: 100%; max-width: 280px; margin: 12px auto 0; text-align: center; }
            .kp-dots { display: flex; justify-content: center; gap: 14px; margin: 14px 0 18px; }
            .kp-dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #38bdf8; background: transparent; transition: all 0.15s; }
            .kp-dot.filled { background: #10b981; border-color: #10b981; transform: scale(1.15); }
            .kp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
            .kp-key {
                height: 54px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.12);
                background: rgba(255,255,255,0.07); color: #f8fafc; font-size: 21px; font-weight: 700;
                cursor: pointer; display: flex; align-items: center; justify-content: center;
                user-select: none; -webkit-tap-highlight-color: transparent;
            }
            .kp-key:active { background: rgba(16,185,129,0.3); transform: scale(0.95); }
            .kp-key.kp-fn { font-size: 15px; color: #94a3b8; }

            #nova-top-arcade-exit {
                position: fixed; bottom: 86px; right: 14px; z-index: 9995;
                background: rgba(15,23,42,0.88); border: 1.5px solid rgba(239,68,68,0.65);
                color: #fca5a5; border-radius: 999px; padding: 7px 12px;
                font-size: 12px; font-weight: 700; cursor: grab;
                display: flex; align-items: center; gap: 5px;
                box-shadow: 0 4px 14px rgba(0,0,0,0.45);
                touch-action: none; user-select: none; -webkit-user-select: none;
            }
        `;
        document.head.appendChild(st);
    }

    const lockInp = $('lock-pin-input');
    const unlockBtn = $('btn-unlock-app');
    if (lockInp && unlockBtn && !document.getElementById('nova-keypad-wrap')) {
        lockInp.style.display = 'none';
        unlockBtn.style.display = 'none';

        const wrap = document.createElement('div');
        wrap.id = 'nova-keypad-wrap';
        wrap.innerHTML = `
            <div class="kp-dots" id="kp-dots">
                <span class="kp-dot"></span><span class="kp-dot"></span>
                <span class="kp-dot"></span><span class="kp-dot"></span>
            </div>
            <div class="kp-grid">
                ${['1','2','3','4','5','6','7','8','9','🎮','0','⌫'].map(k =>
                    `<button type="button" class="kp-key ${k === '🎮' || k === '⌫' ? 'kp-fn' : ''}" data-k="${k}">${k}</button>`
                ).join('')}
            </div>
            <button type="button" id="btn-return-arcade-big">🎮 Return to Arcade Games</button>
        `;
        lockInp.parentElement.insertBefore(wrap, unlockBtn);

        let pinBuf = '';
        const dots = wrap.querySelectorAll('.kp-dot');
        const paintDots = () => dots.forEach((d, i) => d.classList.toggle('filled', i < pinBuf.length));

        wrap.querySelectorAll('.kp-key').forEach(btn => {
            btn.addEventListener('click', () => {
                const k = btn.getAttribute('data-k');
                if (k === '🎮') { pinBuf = ''; paintDots(); exitToArcadeNow(); return; }
                if (k === '⌫') { pinBuf = pinBuf.slice(0, -1); paintDots(); return; }
                if (pinBuf.length >= 4) return;
                pinBuf += k;
                paintDots();
                if (pinBuf.length === 4) {
                    lockInp.value = pinBuf;
                    setTimeout(() => {
                        unlockBtn.click();
                        pinBuf = '';
                        paintDots();
                    }, 120);
                }
            });
        });
        bindClick('btn-return-arcade-big', exitToArcadeNow);
    }

    if (!document.getElementById('nova-top-arcade-exit')) {
        const exitBtn = document.createElement('button');
        exitBtn.id = 'nova-top-arcade-exit';
        exitBtn.type = 'button';
        exitBtn.innerHTML = '🎮 Exit';
        document.body.appendChild(exitBtn);

        try {
            const saved = JSON.parse(localStorage.getItem('nova_exit_btn_pos') || 'null');
            if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
                exitBtn.style.left = Math.min(Math.max(8, saved.x), window.innerWidth - 78) + 'px';
                exitBtn.style.top = Math.min(Math.max(8, saved.y), window.innerHeight - 44) + 'px';
                exitBtn.style.right = 'auto';
                exitBtn.style.bottom = 'auto';
            }
        } catch (e) {}

        let startX = 0, startY = 0, origX = 0, origY = 0, isDragging = false, moved = false;

        const onStart = (cx, cy) => {
            const rect = exitBtn.getBoundingClientRect();
            startX = cx; startY = cy;
            origX = rect.left; origY = rect.top;
            isDragging = true; moved = false;
        };
        const onMove = (cx, cy) => {
            if (!isDragging) return;
            const dx = cx - startX, dy = cy - startY;
            if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
            if (!moved) return;
            const maxX = window.innerWidth - exitBtn.offsetWidth - 6;
            const maxY = window.innerHeight - exitBtn.offsetHeight - 6;
            exitBtn.style.left = Math.min(Math.max(6, origX + dx), maxX) + 'px';
            exitBtn.style.top = Math.min(Math.max(6, origY + dy), maxY) + 'px';
            exitBtn.style.right = 'auto';
            exitBtn.style.bottom = 'auto';
        };
        const onEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            if (moved) {
                const r = exitBtn.getBoundingClientRect();
                localStorage.setItem('nova_exit_btn_pos', JSON.stringify({ x: r.left, y: r.top }));
            } else {
                exitToArcadeNow();
            }
        };

        exitBtn.addEventListener('touchstart', (e) => { const t = e.touches[0]; onStart(t.clientX, t.clientY); }, { passive: true });
        exitBtn.addEventListener('touchmove', (e) => { if (!isDragging) return; const t = e.touches[0]; onMove(t.clientX, t.clientY); if (moved) e.preventDefault(); }, { passive: false });
        exitBtn.addEventListener('touchend', onEnd);
        exitBtn.addEventListener('mousedown', (e) => { e.preventDefault(); onStart(e.clientX, e.clientY); });
        window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
        window.addEventListener('mouseup', onEnd);
    }
}
initScheme2KeypadAndPanic();

// ============================================================================
// 6. SLEEP GUARD
// ============================================================================
function initSleepGuard() {
    let sgEnabled = localStorage.getItem('nova_sg_enabled') !== 'false';
    let sgMinutes = Math.max(1, parseInt(localStorage.getItem('nova_sg_minutes') || '2', 10) || 2);
    let sgTimer = null;

    if (!document.getElementById('nova-sg-styles')) {
        const st = document.createElement('style');
        st.id = 'nova-sg-styles';
        st.textContent = `
            #btn-sleep-guard-top {
                display: inline-flex; align-items: center; gap: 4px;
                padding: 5px 9px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16);
                background: rgba(16,185,129,0.16); color: #34d399;
                font-size: 11px; font-weight: 700; cursor: pointer; margin-right: 4px;
            }
            #btn-sleep-guard-top.sg-off { background: rgba(255,255,255,0.06); color: #94a3b8; }
            #sleep-guard-modal {
                position: fixed; inset: 0; background: rgba(0,0,0,0.75);
                backdrop-filter: blur(3px); z-index: 9996; display: none;
                align-items: center; justify-content: center; padding: 16px;
            }
            #sleep-guard-modal.is-open { display: flex; }
            .sg-card {
                width: 100%; max-width: 340px; background: #0f172a;
                border: 1px solid rgba(255,255,255,0.14); border-radius: 18px;
                padding: 18px; color: #f8fafc; box-shadow: 0 20px 50px rgba(0,0,0,0.65);
            }
            body.light-mode .sg-card { background: #ffffff; color: #0f172a; border-color: rgba(15,23,42,0.14); }
            .sg-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
            .sg-title { font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
            .sg-close { width: 28px; height: 28px; border-radius: 999px; border: none; background: rgba(255,255,255,0.1); color: inherit; font-size: 18px; cursor: pointer; }
            .sg-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.05); margin-bottom: 12px; }
            .sg-chips { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
            .sg-chip {
                padding: 8px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15);
                background: rgba(255,255,255,0.05); color: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer;
            }
            .sg-chip.active { background: #10b981; color: #052e16; border-color: #10b981; }
            .sg-input {
                width: 100%; padding: 10px 12px; border-radius: 10px; box-sizing: border-box;
                border: 1px solid rgba(255,255,255,0.18); background: rgba(0,0,0,0.25);
                color: inherit; font-size: 14px; font-weight: 600; outline: none; margin-bottom: 12px;
            }
            .sg-save-btn {
                width: 100%; padding: 11px; border-radius: 12px; border: none;
                background: #10b981; color: #052e16; font-size: 13.5px; font-weight: 800; cursor: pointer;
            }
        `;
        document.head.appendChild(st);
    }

    const lockBtn = $('btn-app-lock-toggle');
    let sgBtn = document.getElementById('btn-sleep-guard-top');
    if (!sgBtn && lockBtn && lockBtn.parentElement) {
        sgBtn = document.createElement('button');
        sgBtn.id = 'btn-sleep-guard-top';
        sgBtn.type = 'button';
        lockBtn.parentElement.insertBefore(sgBtn, lockBtn);
    }

    if (!document.getElementById('sleep-guard-modal')) {
        const modal = document.createElement('div');
        modal.id = 'sleep-guard-modal';
        modal.innerHTML = `
            <div class="sg-card">
                <div class="sg-head">
                    <div class="sg-title">🌙 Sleep Guard</div>
                    <button type="button" class="sg-close" id="sg-close-btn">×</button>
                </div>
                <p style="font-size:12px; color:#94a3b8; margin:0 0 12px;">Auto-exit to Arcade Games when inactive.</p>
                <div class="sg-row">
                    <span style="font-size:13.5px; font-weight:600;">Enable Sleep Guard</span>
                    <input type="checkbox" id="sg-toggle-sw" style="width:18px; height:18px; accent-color:#10b981; cursor:pointer;">
                </div>
                <div class="sg-chips">
                    <button type="button" class="sg-chip" data-min="2">2 min</button>
                    <button type="button" class="sg-chip" data-min="5">5 min</button>
                    <button type="button" class="sg-chip" data-min="10">10 min</button>
                </div>
                <input type="number" id="sg-custom-min" min="1" max="120" class="sg-input" placeholder="Enter minutes" />
                <button type="button" class="sg-save-btn" id="sg-save-btn">Save Settings</button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const modal = $('sleep-guard-modal');
    const sw = $('sg-toggle-sw');
    const customInp = $('sg-custom-min');
    const chips = modal ? modal.querySelectorAll('.sg-chip') : [];

    function updateBadgeUI() {
        if (!sgBtn) return;
        sgBtn.innerText = sgEnabled ? `🌙 ${sgMinutes}m` : '🌙 Off';
        sgBtn.classList.toggle('sg-off', !sgEnabled);
    }
    function resetSleepTimer() {
        clearTimeout(sgTimer);
        if (!sgEnabled || !state.myAccountCode) return;
        sgTimer = setTimeout(() => { updatePresence("offline", true); exitToArcadeNow(); }, sgMinutes * 60 * 1000);
    }

    if (sgBtn) sgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (sw) sw.checked = sgEnabled;
        if (customInp) customInp.value = sgMinutes;
        chips.forEach(c => c.classList.toggle('active', Number(c.getAttribute('data-min')) === sgMinutes));
        openLayer(modal);
    });
    bindClick('sg-close-btn', () => closeLayer(modal));
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeLayer(modal); });
    chips.forEach(c => c.addEventListener('click', () => {
        const m = Number(c.getAttribute('data-min'));
        if (customInp) customInp.value = m;
        chips.forEach(x => x.classList.toggle('active', x === c));
    }));
    bindClick('sg-save-btn', () => {
        const val = parseInt(customInp?.value || '2', 10);
        sgEnabled = !!(sw && sw.checked);
        sgMinutes = (isNaN(val) || val < 1) ? 2 : Math.min(val, 120);
        localStorage.setItem('nova_sg_enabled', String(sgEnabled));
        localStorage.setItem('nova_sg_minutes', String(sgMinutes));
        updateBadgeUI(); resetSleepTimer(); closeLayer(modal);
    });

    ['touchstart', 'click', 'keydown', 'scroll', 'input'].forEach(evt => window.addEventListener(evt, resetSleepTimer, { passive: true }));
    updateBadgeUI(); resetSleepTimer();
}
initSleepGuard();

// ============================================================================
// 7. WHATSAPP-STYLE REDESIGN (4 TABS + WORKING + BUTTON)
// ============================================================================
function initWhatsAppRedesign() {
    if (document.getElementById('nova-wa-redesign-styles')) return;

    const st = document.createElement('style');
    st.id = 'nova-wa-redesign-styles';
    st.textContent = `
        #active-strip, .active-strip, .nav-tabs, #tab-messages, #tab-stories { display: none !important; }
        .sidebar-header, .side-header { padding: 12px 14px 6px !important; border-bottom: none !important; background: transparent !important; }
        #wa-top-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 6px; flex-shrink: 0; }
        #wa-page-title { font-size: 24px; font-weight: 800; letter-spacing: -0.3px; color: var(--text-main, #f8fafc); }
        #wa-add-fab {
            width: 34px; height: 34px; border-radius: 50%; border: none;
            background: #10b981; color: #052e16; font-size: 22px; font-weight: 800;
            display: flex; align-items: center; justify-content: center; cursor: pointer;
            box-shadow: 0 3px 10px rgba(16,185,129,0.35);
        }
        .search-bar, .search-wrap { padding: 6px 14px 10px !important; }
        .search-bar button, #btn-add-friend { display: none !important; }
        #search-friends, .search-bar input { width: 100% !important; border-radius: 999px !important; padding: 10px 16px !important; font-size: 14px !important; }
        #wa-bottom-nav {
            display: grid; grid-template-columns: repeat(4, 1fr);
            background: rgba(15,23,42,0.96); backdrop-filter: blur(12px);
            border-top: 1px solid rgba(255,255,255,0.08);
            padding: 6px 4px max(8px, env(safe-area-inset-bottom, 8px));
            flex-shrink: 0; z-index: 30;
        }
        body.light-mode #wa-bottom-nav { background: rgba(255,255,255,0.96); border-top-color: rgba(15,23,42,0.1); }
        .wa-nav-btn {
            background: none; border: none; color: #94a3b8;
            display: flex; flex-direction: column; align-items: center; gap: 3px;
            font-size: 11px; font-weight: 600; cursor: pointer; padding: 4px 0;
        }
        .wa-nav-btn .material-icons { font-size: 22px; }
        .wa-nav-btn.active { color: #10b981; }
        .wa-nav-btn.active .material-icons { background: rgba(16,185,129,0.16); padding: 2px 14px; border-radius: 999px; }
        .wa-extra-tab { flex: 1; overflow-y: auto; padding: 12px 14px 20px; display: none; }
        .wa-extra-tab.active { display: block; }
        .wa-you-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 14px; margin-bottom: 12px; }
        body.light-mode .wa-you-card { background: #f8fafc; border-color: rgba(15,23,42,0.1); }
        .wa-you-row { display: flex; align-items: center; justify-content: space-between; padding: 11px 6px; border-bottom: 1px solid rgba(255,255,255,0.07); cursor: pointer; font-size: 14px; font-weight: 600; }
        .wa-you-row:last-child { border-bottom: none; }
    `;
    document.head.appendChild(st);

    const sidebar = $('sidebar') || document.querySelector('.sidebar');
    if (!sidebar) return;

    const oldHeader = sidebar.querySelector('.sidebar-header, .side-header, header');
    if (oldHeader) oldHeader.style.display = 'none';

    const topBar = document.createElement('div');
    topBar.id = 'wa-top-bar';
    topBar.innerHTML = `<div id="wa-page-title">Chats</div><button type="button" id="wa-add-fab" title="Add Friend ID">+</button>`;
    sidebar.insertBefore(topBar, sidebar.firstChild);

    function triggerAddFriend() {
        const oldAdd = $('btn-add-room') || $('btn-add-friend') || $('btn-new-chat') || $('btn-add-id')
            || document.querySelector('.search-bar button, .search-wrap button');
        if (oldAdd) oldAdd.click();
    }

    const callsTab = document.createElement('div');
    callsTab.id = 'wa-calls-tab';
    callsTab.className = 'wa-extra-tab';
    callsTab.innerHTML = `<div class="wa-you-card" style="text-align:center; padding:28px 16px;"><span class="material-icons" style="font-size:40px; color:#10b981; margin-bottom:8px;">call</span><div style="font-size:15px; font-weight:700; margin-bottom:4px;">Call History</div><div style="font-size:12.5px; color:#94a3b8;">Recent voice & video call logs will appear here.</div></div>`;

    const youTab = document.createElement('div');
    youTab.id = 'wa-you-tab';
    youTab.className = 'wa-extra-tab';
    youTab.innerHTML = `
        <div class="wa-you-card" id="wa-you-profile-box" style="display:flex; align-items:center; gap:12px; cursor:pointer;">
            <div class="avatar" style="width:52px; height:52px; font-size:22px; background:#10b981; color:#052e16;"><span class="material-icons">person</span></div>
            <div style="flex:1; min-width:0;"><div id="wa-you-name" style="font-size:16px; font-weight:800;">My Profile</div><div id="wa-you-id" style="font-size:12.5px; color:#38bdf8; margin-top:2px;">My ID: --</div></div>
            <span class="material-icons" style="color:#94a3b8;">chevron_right</span>
        </div>
        <div class="wa-you-card">
            <div class="wa-you-row" id="wa-row-sg"><span>🌙 Sleep Guard</span><span id="wa-row-sg-val" style="color:#10b981; font-size:12px;">2m</span></div>
            <div class="wa-you-row" id="wa-row-lock"><span>🔒 App Entry Lock</span><span class="material-icons" style="font-size:18px; color:#94a3b8;">chevron_right</span></div>
            <div class="wa-you-row" id="wa-row-shield"><span>🛡️ Fake Notice Shield</span><span class="material-icons" style="font-size:18px; color:#eab308;">shield</span></div>
            <div class="wa-you-row" id="wa-row-theme"><span>🎨 Switch Light / Dark Mode</span><span class="material-icons" style="font-size:18px; color:#94a3b8;">contrast</span></div>
            <div class="wa-you-row" id="wa-row-settings"><span>⚙️ Account & Privacy Settings</span><span class="material-icons" style="font-size:18px; color:#94a3b8;">settings</span></div>
            <div class="wa-you-row" id="wa-row-logout" style="color:#f87171;"><span>🚪 Logout</span><span class="material-icons" style="font-size:18px;">logout</span></div>
        </div>
    `;

    const bottomNav = document.createElement('div');
    bottomNav.id = 'wa-bottom-nav';
    bottomNav.innerHTML = `
        <button type="button" class="wa-nav-btn" data-tab="updates"><span class="material-icons">donut_large</span><span>Updates</span></button>
        <button type="button" class="wa-nav-btn" data-tab="calls"><span class="material-icons">call</span><span>Calls</span></button>
        <button type="button" class="wa-nav-btn active" data-tab="chats"><span class="material-icons">chat</span><span>Chats</span></button>
        <button type="button" class="wa-nav-btn" data-tab="you"><span class="material-icons">person</span><span>You</span></button>
    `;

    sidebar.appendChild(callsTab);
    sidebar.appendChild(youTab);
    sidebar.appendChild(bottomNav);

    bindClick('wa-you-profile-box', () => { window.location.href = 'chat-settings.html'; });
    bindClick('wa-row-sg', () => $('btn-sleep-guard-top')?.click());
    bindClick('wa-row-lock', () => $('btn-app-lock-toggle')?.click());
    bindClick('wa-row-shield', () => $('btn-panic-now')?.click());
    bindClick('wa-row-theme', () => $('btn-theme-mode')?.click());
    bindClick('wa-row-settings', () => { window.location.href = 'chat-settings.html'; });
    bindClick('wa-row-logout', () => $('btn-logout-now')?.click());

    const chatListEl = $('chats-list-area') || $('chat-list');
    const searchBarEl = $('chats-search-bar') || sidebar.querySelector('.search-bar, .search-wrap');
    const storiesPanel = $('status-list-area') || $('stories-panel');

    function switchWaTab(tab) {
        bottomNav.querySelectorAll('.wa-nav-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
        const titleMap = { updates: 'Updates', calls: 'Calls', chats: 'Chats', you: 'You' };
        if ($('wa-page-title')) $('wa-page-title').innerText = titleMap[tab] || 'Chats';
        if ($('wa-add-fab')) {
            $('wa-add-fab').style.display = (tab === 'chats' || tab === 'updates') ? 'flex' : 'none';
            $('wa-add-fab').onclick = (tab === 'updates') ? () => $('btn-add-status')?.click() : triggerAddFriend;
        }
        if (chatListEl) chatListEl.style.display = (tab === 'chats') ? '' : 'none';
        if (searchBarEl) searchBarEl.style.display = (tab === 'chats') ? '' : 'none';
        if (storiesPanel) storiesPanel.style.display = (tab === 'updates') ? 'block' : 'none';
        callsTab.classList.toggle('active', tab === 'calls');
        youTab.classList.toggle('active', tab === 'you');

        if (tab === 'updates') loadStories();
        if (tab === 'you') {
            if ($('wa-you-name')) $('wa-you-name').innerText = state.myName || 'My Profile';
            if ($('wa-you-id')) $('wa-you-id').innerText = `My ID: ${state.myAccountCode || '--'}`;
            const sgTop = $('btn-sleep-guard-top');
            if ($('wa-row-sg-val') && sgTop) $('wa-row-sg-val').innerText = sgTop.innerText;
        }
    }

    bottomNav.querySelectorAll('.wa-nav-btn').forEach(btn => btn.addEventListener('click', () => switchWaTab(btn.getAttribute('data-tab'))));
    switchWaTab('chats');
}
initWhatsAppRedesign();

// Safe dynamic loading of optional add-ons (never blocks main app or PIN screen)
import("./chat-filters.js").catch(() => {});
import("./chat-extras.js").catch(() => {});
import("./chat-premium-ui.js").catch(() => {});
import("./themes/chat-themes.js").catch(() => {});

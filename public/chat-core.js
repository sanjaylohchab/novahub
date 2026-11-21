// ============================================================================
// NOVAMESSENGER MAIN CONTROLLER (chat-core.js)
// Clean Modular Engine: Auth, App Lock, Messaging, Drawer & Admin Dashboard
// ============================================================================
import {
    db, storage, state, hooks, timerLabels, timerMs, $, bindClick, escapeHtml,
    openLayer, closeLayer, postToGame, showQuickToast, playAlertBeep,
    hashPassword, verifyAdminCode, encryptText, decryptText,
    isMyMessage, getRoomMeta, isChatActivelyVisible, getDateGroupLabel,
    getShortTime, compressImg, uploadWithTimeout, wipeLocalSessionData,
    saveSessionToLocal, syncAccountToCloud,
    doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, deleteField,
    onSnapshot, collection, addDoc, query, orderBy, limitToLast,
    serverTimestamp, sRef
} from "./chat-shared.js";

import {
    stopRingtone, hasActiveCall, cleanupCall, listenToCalls, initCallControls
} from "./chat-calls.js";

import {
    initStealthFCM, sendStealthPushToPeer, triggerStealthAlert,
    updatePresence, detachPresenceListener, listenToPresence,
    refreshLiveBanner, clearLocalLiveWatcher, attachLiveLocationWatcher,
    stopLiveLocation, stopAllLiveSessions, initLocationControls, initStoryControls
} from "./chat-features.js";

import {
    detachAllSummaryListeners, syncRoomSummaryListeners,
    renderActiveStrip, renderSidebarList, runDeleteEntireChat, initSidebarControls
} from "./chat-sidebar.js";

// ============================================================================
// 0. MODULE-LOCAL STATE & DOM REFERENCES
// ============================================================================
let authMode = 'login';
let unsubscribeChat = null;
let unsubscribeAccountSync = null;
const markingSeen = new Set();
let selectedMsg = null;
let editingMsgId = null;
let isViewOnce = false;
let isInitialLoad = true;
let typTimer = null;
let mediaRec = null, vnChunks = [], isRec = false;
let emojiPickerLoaded = false;
let godRoom = "";
state.replyTarget = null;

const authScreen = $('auth-screen');
const appLockScreen = $('app-lock-screen');
const lockSettingsModal = $('lock-settings-modal');
const cyberGate = $('cyber-gate-screen');
const genericModal = $('generic-modal');
const godModal = $('god-modal');
const drawer = $('contact-info-drawer');
const clearModal = $('clear-chat-modal');
const overlay = $('msg-overlay');
const errEl = $('auth-error-msg');
const codeInp = $('auth-code');
const nameInp = $('auth-name');
const passInp = $('auth-pass');
const voBtn = $('btn-vo-toggle');
const vnBtn = $('btn-vn-rec');

// ============================================================================
// 1. APP ENTRY PIN LOCK
// ============================================================================
function updateAppLockIconUI() {
    const icon = $('app-lock-icon');
    const sw = $('toggle-app-lock-sw');
    if (state.appLockEnabled && state.appLockPin) {
        if (icon) { icon.innerText = 'lock'; icon.style.color = '#10b981'; }
        if (sw) sw.checked = true;
    } else {
        if (icon) { icon.innerText = 'lock_open'; icon.style.color = 'var(--text-sub)'; }
        if (sw) sw.checked = false;
    }
}

function lockAppIfEnabled() {
    if (!state.myAccountCode || !state.appLockEnabled || !state.appLockPin) return;
    state.isAppUnlocked = false;
    state.isRoomActivelyOpen = false;
    $('chat-view')?.classList.remove('open');
    closeLayer(drawer); closeLayer(overlay); closeLayer($('location-modal'));
    closeLayer(clearModal); closeLayer(genericModal); closeLayer($('room-action-sheet'));
    $('emoji-picker')?.classList.remove('show');
    if ($('lock-pin-input')) $('lock-pin-input').value = '';
    if ($('lock-error-msg')) $('lock-error-msg').innerText = '';
    openLayer(appLockScreen);
}

function unlockAppWithPin() {
    const val = ($('lock-pin-input')?.value || '').trim();
    if (val === state.appLockPin) {
        state.isAppUnlocked = true;
        if ($('lock-pin-input')) $('lock-pin-input').value = '';
        if ($('lock-error-msg')) $('lock-error-msg').innerText = '';
        closeLayer(appLockScreen);
        window.scrollTo(0, 0);
    } else {
        if ($('lock-error-msg')) $('lock-error-msg').innerText = '❌ Galat PIN! Dobara koshish karein.';
        if ($('lock-pin-input')) $('lock-pin-input').value = '';
    }
}

// ============================================================================
// 2. ROOM NAVIGATION & HEADER BADGES
// ============================================================================
function updateActiveHeaderBadges(meta) {
    if ($('active-room-title')) $('active-room-title').innerText = meta.name;
    if ($('drawer-room-name')) $('drawer-room-name').innerText = `${meta.name} (ID: ${meta.peerCode || ''})`;
    const dp = $('active-room-dp');
    if (dp) {
        if (meta.dp) { dp.innerText = ''; dp.style.backgroundImage = `url(${meta.dp})`; }
        else { dp.style.backgroundImage = ''; dp.innerText = (meta.name || 'P').charAt(0).toUpperCase(); }
    }
    const bEl = $('active-mode-badge');
    if (bEl) {
        if (meta.timer && meta.timer !== 'off') { bEl.innerText = timerLabels[meta.timer]; bEl.style.display = 'inline-block'; }
        else bEl.style.display = 'none';
    }
    const encKey = localStorage.getItem(`nova_enc_${state.currentRoom}`) || "";
    if ($('di-enc-sub')) $('di-enc-sub').innerText = encKey ? "🔒 Custom Cipher Key Active" : "Optional cipher password";
}

function detachChatListener() {
    if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }
}

function goBackToList(e) {
    if (e) e.stopPropagation();
    if (document.activeElement) document.activeElement.blur();
    updatePresence("offline", true);
    state.isRoomActivelyOpen = false;
    $('chat-view')?.classList.remove('open');
    closeLayer(drawer); closeLayer(overlay); closeLayer($('location-modal'));
    closeLayer(clearModal); closeLayer(genericModal); closeLayer($('room-action-sheet'));
    $('emoji-picker')?.classList.remove('show');
    window.scrollTo(0, 0);
    renderSidebarList();
}

function selectRoom(roomId, openUI = true) {
    const isSameRoom = (state.currentRoom === roomId);
    state.currentRoom = roomId;
    localStorage.setItem('nova_last_room', roomId);
    const meta = getRoomMeta(roomId);
    updateActiveHeaderBadges(meta);
    if ($('toggle-lock-chat')) $('toggle-lock-chat').checked = !!meta.locked;
    if ($('select-vanish-timer')) $('select-vanish-timer').value = meta.timer || "off";

    if (openUI) {
        state.isRoomActivelyOpen = true;
        $('chat-view')?.classList.add('open');
        updatePresence("online", true);
        window.scrollTo(0, 0);
    } else {
        state.isRoomActivelyOpen = false;
        $('chat-view')?.classList.remove('open');
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
        if (box) setTimeout(() => { box.scrollTop = box.scrollHeight; }, 30);
    }
}

// ============================================================================
// 3. MESSAGING ENGINE (LISTEN, RENDER, SEEN TICKS, SEND & MEDIA)
// ============================================================================
async function markVisibleMessagesSeen() {
    if (!isChatActivelyVisible()) return;
    const nowTime = new Date().toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    for (const id in state.cachedMessages) {
        const m = state.cachedMessages[id];
        if (!m || isMyMessage(m) || m.seenStatus || m.manualUnseen || m.isDeletedEveryone || markingSeen.has(id)) continue;
        markingSeen.add(id);
        const vTimer = m.vanishTimer || "off";
        try {
            await updateDoc(doc(db, state.currentRoom, id), {
                seenStatus: true, seenBy: state.myAccountCode, seenAtStr: nowTime, seenMs: Date.now(),
                ...(vTimer === "instant" ? { isDeletedEveryone: true, deletedByAudit: "Instant Snap Mode" } : {})
            });
        } catch (e) {} finally {
            markingSeen.delete(id);
        }
    }
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
                <div style="font-size:11px; color:#cbd5e1;">${escapeHtml(statusLine)}</div>
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
                <div style="font-size:11px; color:#cbd5e1;">${escapeHtml(m.lat)}, ${escapeHtml(m.lng)} • Tap to open Map</div>
            </div>
        </a>`;
    }
    if (m.type === 'image' || m.type === 'video' || m.type === 'audio') {
        if (m.isViewOnce) {
            const opened = m.viewedBy && m.viewedBy.includes(state.myUid);
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
    return `<span>${escapeHtml(decryptText(m.text, encKey))}</span>`;
}

function getBodySignature(m, encKey) {
    if (m.type === 'live_location') return `live:${m.lat}:${m.lng}:${m.isLiveActive}:${m.lastUpdatedStr}`;
    if (m.type === 'location') return `loc:${m.lat}:${m.lng}`;
    if (m.type === 'image' || m.type === 'video' || m.type === 'audio') {
        const opened = !!(m.viewedBy && m.viewedBy.includes(state.myUid));
        return `media:${m.type}:${m.isViewOnce}:${opened}`;
    }
    return `txt:${decryptText(m.text, encKey)}`;
}

function listenToMessages(roomId) {
    detachChatListener();
    const box = $('msgs-container');
    if (!box) return;
    box.innerHTML = '';
    state.cachedMessages = {};
    state.domMap = new Map();
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
            state.cachedMessages[id] = m;
            if (m.isDeletedEveryone || (m.deletedFor && m.deletedFor.includes(state.myUid))) return;

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
            if (m.starredBy && m.starredBy.includes(state.myUid)) starCount++;

            const isMe = isMyMessage(m);
            const starIcon = (m.starredBy && m.starredBy.includes(state.myUid)) ? `<span class="material-icons" style="font-size:12px; color:#eab308;">star</span>` : '';
            const tick = m.seenStatus ? `<span class="material-icons seen-tick read">done_all</span>` : `<span class="material-icons seen-tick">check</span>`;
            const metaHtml = `${starIcon} ${m.isEdited ? 'Edited' : ''} <span>${m.shortTime || ''}</span> ${tick}`;
            const reactTxt = (m.reactions && Object.keys(m.reactions).length > 0) ? Object.values(m.reactions).join(' ') : '';
            const bodySig = getBodySignature(m, encKey);

            if (state.domMap.has(id)) {
                const entry = state.domMap.get(id);
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
                    qEl.className = 'msg-quote'; qEl.innerHTML = `<b>${escapeHtml(m.replyTo.name)}</b><br>${escapeHtml(m.replyTo.text)}`;
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
                    const fresh = state.cachedMessages[id] || m;
                    if (fresh.isViewOnce && (!fresh.viewedBy || !fresh.viewedBy.includes(state.myUid))) openViewOnceModal(id, fresh);
                    else openContextMenu(e, id, fresh);
                });

                const reactEl = document.createElement('div');
                reactEl.className = 'msg-reactions'; reactEl.innerText = reactTxt;
                reactEl.style.display = reactTxt ? 'flex' : 'none';

                wrap.appendChild(bub); wrap.appendChild(reactEl);
                box.appendChild(wrap);
                state.domMap.set(id, { wrap, bodyEl, metaEl, reactEl, bodySig, metaHtml, reactTxt });
                addedNewNode = true;
            }
        });

        for (const [id, entry] of state.domMap.entries()) {
            if (!visibleIds.has(id)) { entry.wrap.remove(); state.domMap.delete(id); }
        }
        if (state.domMap.size === 0) { box.innerHTML = ''; lastDatePillText = ""; }

        if ($('di-media-count')) $('di-media-count').innerText = mediaCount;
        if ($('di-star-count')) $('di-star-count').innerText = starCount > 0 ? starCount : "None";

        snap.docChanges().forEach(ch => {
            if (ch.type === 'added') {
                const msg = ch.doc.data();
                if (!isInitialLoad && !isMyMessage(msg) && !msg.isDeletedEveryone) {
                    triggerStealthAlert(msg.type === 'text' ? 'text' : 'media', roomId);
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
    if (!v.includes(state.myUid)) v.push(state.myUid);
    await updateDoc(doc(db, state.currentRoom, id), { viewedBy: v });
}

function openContextMenu(e, id, m) {
    const encKey = localStorage.getItem(`nova_enc_${state.currentRoom}`) || "";
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
    if (!state.currentRoom) return showQuickToast("Please select a friend first!");
    const inp = $('msg-input');
    const rawText = (inp?.value || '').trim();
    if (!rawText) return;
    inp.value = '';
    $('emoji-picker')?.classList.remove('show');

    const encKey = localStorage.getItem(`nova_enc_${state.currentRoom}`) || "";
    const finalTxt = encryptText(rawText, encKey);

    if (editingMsgId) {
        await updateDoc(doc(db, state.currentRoom, editingMsgId), {
            text: finalTxt,
            originalAuditText: encKey ? "🔐 [Encrypted Message]" : rawText,
            isEdited: true
        });
        editingMsgId = null;
        if ($('reply-bar')) $('reply-bar').style.display = 'none';
        return;
    }

    const now = new Date();
    const meta = getRoomMeta(state.currentRoom);
    await addDoc(collection(db, state.currentRoom), {
        type: "text",
        text: finalTxt,
        originalAuditText: encKey ? "🔐 [Encrypted Message]" : rawText,
        uid: state.myUid, accountCode: state.myAccountCode, name: state.myName,
        shortTime: getShortTime(now), dateLabel: getDateGroupLabel(now), sentAtStr: now.toLocaleString(),
        sentMs: Date.now(), vanishTimer: meta.timer || "off",
        timestamp: serverTimestamp(), replyTo: state.replyTarget, seenStatus: false, manualUnseen: false,
        reactions: {}, starredBy: [], deletedFor: [], isDeletedEveryone: false
    });
    state.replyTarget = null;
    if ($('reply-bar')) $('reply-bar').style.display = 'none';
    updatePresence("online", true);
    sendStealthPushToPeer(state.currentRoom, "text");
}

// ============================================================================
// 4. SECURE ADMIN DASHBOARD
// ============================================================================
async function openGodDashboard() {
    openLayer(godModal);
    const accSnap = await getDocs(collection(db, "novahub_accounts"));
    let accHtml = '';
    accSnap.forEach(d => {
        const a = d.data();
        const pwState = a.passwordHash ? '🔒 SHA-256 Protected' : '⚠️ Pending Migration';
        accHtml += `<span style="display:inline-block; background:#1f2937; border:1px solid #eab308; padding:5px 10px; border-radius:6px; margin:4px;">👤 <b>${escapeHtml(a.name)}</b> | ID: <b style="color:#00f2fe;">${escapeHtml(a.accountCode)}</b> | <span style="color:#10b981;">${pwState}</span></span>`;
    });
    if ($('god-users-list')) $('god-users-list').innerHTML = accHtml || 'No users registered.';

    const snap = await getDocs(collection(db, "novahub_all_rooms"));
    let html = '';
    snap.forEach(d => {
        const r = d.data();
        if (r.roomId !== 'global_novahub_chat') {
            html += `<button onclick="window.inspectGod('${r.roomId}')" style="margin:4px; padding:6px 10px; background:#2b0909; color:#fff; border:1px solid #ef4444; border-radius:6px; cursor:pointer;">🔑 ${escapeHtml(r.roomId)}</button>`;
        }
    });
    if ($('god-rooms')) $('god-rooms').innerHTML = html || 'No active chats yet.';
    if (state.currentRoom) window.inspectGod(state.currentRoom);
}

window.godDelMsg = async (rId, mId) => { await deleteDoc(doc(db, rId, mId)); window.inspectGod(rId); };

window.inspectGod = async (rId) => {
    godRoom = rId;
    if ($('god-room-title')) $('god-room-title').innerText = `🕵️ Chat: ${rId}`;
    const box = $('god-logs');
    if (!box) return;
    const snap = await getDocs(query(collection(db, rId), orderBy("sentMs", "asc")));
    let html = '';
    snap.forEach(d => {
        const m = d.data();
        let st = m.isDeletedEveryone
            ? `<span style="color:#ef4444;">[DELETED FOR ALL by ${escapeHtml(m.deletedByAudit || m.name)}]</span>`
            : `<span style="color:#10b981;">[ACTIVE]</span>`;
        html += `<div style="border-bottom:1px dashed #450a0a; padding:8px 0;">
            <div><b>${escapeHtml(m.name)} (ID: ${escapeHtml(m.accountCode || '')})</b> (${escapeHtml(m.shortTime || '')}) ${st} <button onclick="window.godDelMsg('${rId}','${d.id}')" style="background:#ef4444; color:#fff; border:none; padding:2px 6px; cursor:pointer; float:right;">🔥 Hard Delete</button></div>
            <div style="color:#fff; margin-top:4px;">${m.type === 'image' ? `<img src="${m.mediaUrl}" style="max-width:150px;">` : escapeHtml(m.originalAuditText || m.text)}</div>
        </div>`;
    });
    box.innerHTML = html || 'Empty chat.';
};

// Register cross-module hooks for chat-sidebar.js
hooks.selectRoom = selectRoom;
hooks.goBackToList = goBackToList;
hooks.detachChatListener = detachChatListener;
hooks.openGodDashboard = openGodDashboard;

// ============================================================================
// 5. BIND ALL MODULES & CORE UI EVENT LISTENERS
// ============================================================================
initSidebarControls();
initCallControls();
initLocationControls();
initStoryControls();

['btn-widget-close-side', 'btn-widget-close-chat', 'btn-cyber-close-widget', 'btn-lock-close-widget'].forEach(id => {
    bindClick(id, (e) => {
        e.stopPropagation();
        if (document.activeElement) document.activeElement.blur();
        postToGame({ type: 'NOVA_CLOSE_WIDGET' });
    });
});

bindClick('my-profile-chip-btn', () => { window.location.href = 'chat-settings.html'; });
bindClick('btn-mobile-back', goBackToList);
bindClick('open-contact-info', () => { if (state.currentRoom) openLayer(drawer); });
bindClick('btn-close-drawer', () => closeLayer(drawer));

// Auth Listeners (SHA-256 Hashing + Seamless Migration)
bindClick('tab-btn-login', () => {
    authMode = 'login';
    $('tab-btn-login')?.classList.add('active');
    $('tab-btn-signup')?.classList.remove('active');
    if ($('signup-name-field')) $('signup-name-field').style.display = 'none';
    if ($('btn-auth-submit')) $('btn-auth-submit').innerText = 'LOGIN TO MY ACCOUNT';
    if (errEl) errEl.innerText = '';
});
bindClick('tab-btn-signup', () => {
    authMode = 'signup';
    $('tab-btn-signup')?.classList.add('active');
    $('tab-btn-login')?.classList.remove('active');
    if ($('signup-name-field')) $('signup-name-field').style.display = 'block';
    if ($('btn-auth-submit')) $('btn-auth-submit').innerText = 'CREATE NEW PERMANENT ID';
    if (errEl) errEl.innerText = '';
});
bindClick('btn-auth-submit', async () => {
    const code = (codeInp?.value || '').trim();
    const pass = (passInp?.value || '').trim();
    const name = (nameInp?.value || '').trim();
    if (errEl) errEl.innerText = '';
    if (!code) { if (errEl) errEl.innerText = '⚠️ Please enter your ID Number / Code!'; return; }

    if (await verifyAdminCode(code)) {
        closeLayer(authScreen);
        openGodDashboard();
        return;
    }
    if (!pass) { if (errEl) errEl.innerText = '⚠️ Please enter your secret password!'; return; }

    const accRef = doc(db, "novahub_accounts", code);
    const snap = await getDoc(accRef);
    const hashedPass = await hashPassword(code, pass);

    if (authMode === 'signup') {
        if (snap.exists()) { if (errEl) errEl.innerText = `❌ ID "${code}" already exists! Use LOGIN.`; return; }
        if (!name) { if (errEl) errEl.innerText = '⚠️ Please enter your Display Name!'; return; }
        wipeLocalSessionData();
        state.myAccountCode = code; state.myUid = 'uid_' + code; state.myName = name;
        state.myDp = ""; state.myLockPin = ""; state.appLockEnabled = false; state.appLockPin = ""; state.savedRooms = [];
        await setDoc(accRef, {
            accountCode: code, passwordHash: hashedPass, uid: state.myUid, name: state.myName,
            dp: "", lockPin: "", appLockEnabled: false, appLockPin: "",
            savedRooms: [], mutedRooms: [], createdAt: new Date().toLocaleString()
        });
    } else {
        if (!snap.exists()) { if (errEl) errEl.innerText = `❌ No account found for ID "${code}"!`; return; }
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
        if (!passwordOk) { if (errEl) errEl.innerText = `❌ Wrong Password for ID "${code}"!`; return; }

        wipeLocalSessionData();
        state.myAccountCode = code; state.myUid = 'uid_' + code;
        state.myName = data.name || ("User_" + code);
        state.myDp = data.dp || ""; state.myLockPin = data.lockPin || "";
        state.appLockEnabled = !!data.appLockEnabled;
        state.appLockPin = data.appLockPin || "";
        state.savedRooms = (data.savedRooms || []).filter(r => r.id !== 'global_novahub_chat');
    }

    state.isAppUnlocked = true;
    saveSessionToLocal();
    closeLayer(authScreen);
    startAuthenticatedSession(false);
});

bindClick('btn-logout-now', () => {
    if (!confirm(`Logout from ID "${state.myAccountCode}" (${state.myName})?`)) return;
    updatePresence("offline", true);
    stopAllLiveSessions();
    cleanupCall(false);
    detachAllSummaryListeners();
    detachChatListener();
    detachPresenceListener();
    if (unsubscribeAccountSync) unsubscribeAccountSync();
    wipeLocalSessionData();
    window.location.reload();
});

// App Lock Listeners
bindClick('btn-unlock-app', unlockAppWithPin);
if ($('lock-pin-input')) $('lock-pin-input').addEventListener('keypress', e => { if (e.key === 'Enter') unlockAppWithPin(); });
bindClick('btn-lock-to-decoy', () => openLayer(cyberGate));
bindClick('btn-app-lock-toggle', () => {
    updateAppLockIconUI();
    if ($('set-app-lock-pin')) $('set-app-lock-pin').value = state.appLockPin;
    if ($('lock-settings-msg')) $('lock-settings-msg').innerText = '';
    openLayer(lockSettingsModal);
});
bindClick('btn-close-lock-settings', () => closeLayer(lockSettingsModal));
if (lockSettingsModal) lockSettingsModal.addEventListener('click', e => { if (e.target === lockSettingsModal) closeLayer(lockSettingsModal); });
bindClick('btn-save-lock-settings', async () => {
    const wantsLock = $('toggle-app-lock-sw').checked;
    const newPin = $('set-app-lock-pin').value.trim();
    const msgEl = $('lock-settings-msg');
    if (wantsLock && newPin.length < 4) { msgEl.style.color = '#f87171'; msgEl.innerText = '⚠️ Kam se kam 4 digit ka PIN daalein!'; return; }
    state.appLockEnabled = wantsLock;
    if (newPin.length >= 4) state.appLockPin = newPin;
    localStorage.setItem('nova_app_lock_enabled', String(state.appLockEnabled));
    localStorage.setItem('nova_app_lock_pin', state.appLockPin);
    if (state.myAccountCode) {
        await setDoc(doc(db, "novahub_accounts", state.myAccountCode), {
            appLockEnabled: state.appLockEnabled, appLockPin: state.appLockPin
        }, { merge: true }).catch(() => {});
    }
    updateAppLockIconUI();
    msgEl.style.color = '#10b981';
    msgEl.innerText = state.appLockEnabled ? '✅ Chat Entry Lock ON ho gaya!' : '🔓 Chat Entry Lock OFF ho gaya!';
    setTimeout(() => closeLayer(lockSettingsModal), 650);
});
bindClick('btn-lock-now-manual', () => {
    if (!state.appLockPin || state.appLockPin.length < 4) {
        $('lock-settings-msg').style.color = '#f87171';
        $('lock-settings-msg').innerText = '⚠️ Pehle 4+ digit PIN daal kar Save karein!';
        return;
    }
    state.appLockEnabled = true;
    localStorage.setItem('nova_app_lock_enabled', 'true');
    updateAppLockIconUI();
    closeLayer(lockSettingsModal);
    lockAppIfEnabled();
});

// Shield Fake Notice Board & Theme
const openFakeNoticeBoard = (e) => { if (e) e.stopPropagation(); stopRingtone(); openLayer(cyberGate); };
bindClick('btn-panic-now', openFakeNoticeBoard);
bindClick('btn-chat-panic', openFakeNoticeBoard);
let gTaps = 0, gTimer = null;
bindClick('cyber-triple-tap', () => {
    gTaps++; clearTimeout(gTimer);
    if (gTaps >= 3) { gTaps = 0; closeLayer(cyberGate); markVisibleMessagesSeen(); }
    else gTimer = setTimeout(() => gTaps = 0, 650);
});
bindClick('btn-theme-mode', () => {
    document.body.classList.toggle('light-mode');
    localStorage.setItem('nova_theme_mode', document.body.classList.contains('light-mode') ? 'light' : 'dark');
});

// Message Input, Media, Voice Notes & Emoji
bindClick('btn-send-msg', sendMessage);
if ($('msg-input')) {
    $('msg-input').addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });
    $('msg-input').addEventListener('input', () => {
        updatePresence("typing...", false);
        clearTimeout(typTimer);
        typTimer = setTimeout(() => updatePresence("online", true), 3000);
    });
}
bindClick('btn-vo-toggle', () => { isViewOnce = !isViewOnce; voBtn?.classList.toggle('active', isViewOnce); });
bindClick('btn-attach', () => $('msg-file-input')?.click());
if ($('msg-file-input')) $('msg-file-input').addEventListener('change', async function() {
    if (!state.currentRoom) return showQuickToast("Select a friend first!");
    const file = this.files[0]; if (!file) return;
    this.value = '';
    const isVid = file.type.startsWith('video/');
    const now = new Date(), meta = getRoomMeta(state.currentRoom);
    const inp = $('msg-input'), prevPh = inp.placeholder;
    inp.placeholder = isVid ? "🎥 Uploading video..." : "📷 Sending photo...";
    try {
        let url = "";
        if (!isVid) {
            url = await compressImg(file);
        } else {
            const safeName = (file.name || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
            const fRef = sRef(storage, `chat_media/${state.currentRoom}/${Date.now()}_${safeName}`);
            try {
                url = await uploadWithTimeout(fRef, file, 15000);
            } catch (storageErr) {
                inp.placeholder = prevPh;
                $('modal-title').innerText = "🎥 Video Upload Issue";
                $('modal-body').innerHTML = `<p style="margin-bottom:8px;">Firebase Storage par video upload nahi ho paayi (${escapeHtml(storageErr.code || storageErr.message)}).</p>`;
                openLayer(genericModal);
                return;
            }
        }
        await addDoc(collection(db, state.currentRoom), {
            type: isVid ? "video" : "image", mediaUrl: url, text: isVid ? "🎥 Video" : "📷 Photo",
            originalAuditText: isVid ? "🎥 Video" : "📷 Photo", isViewOnce, viewedBy: [],
            uid: state.myUid, accountCode: state.myAccountCode, name: state.myName,
            shortTime: getShortTime(now), dateLabel: getDateGroupLabel(now), sentAtStr: now.toLocaleString(),
            sentMs: Date.now(), vanishTimer: meta.timer || "off",
            timestamp: serverTimestamp(), seenStatus: false, manualUnseen: false,
            reactions: {}, starredBy: [], deletedFor: [], isDeletedEveryone: false
        });
        sendStealthPushToPeer(state.currentRoom, "media");
    } catch (err) {
        showQuickToast("⚠️ Media send failed.");
    }
    inp.placeholder = prevPh;
    isViewOnce = false; voBtn?.classList.remove('active');
});

bindClick('btn-vn-rec', async () => {
    if (!state.currentRoom) return showQuickToast("Select a friend first!");
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
                    const now = new Date(), meta = getRoomMeta(state.currentRoom);
                    await addDoc(collection(db, state.currentRoom), {
                        type: "audio", mediaUrl: ev.target.result, text: "🎙️ Voice Note",
                        originalAuditText: "🎙️ Voice Note", isViewOnce, viewedBy: [],
                        uid: state.myUid, accountCode: state.myAccountCode, name: state.myName,
                        shortTime: getShortTime(now), dateLabel: getDateGroupLabel(now), sentAtStr: now.toLocaleString(),
                        sentMs: Date.now(), vanishTimer: meta.timer || "off",
                        timestamp: serverTimestamp(), seenStatus: false, manualUnseen: false,
                        deletedFor: [], isDeletedEveryone: false
                    });
                    isViewOnce = false; voBtn?.classList.remove('active');
                    sendStealthPushToPeer(state.currentRoom, "media");
                };
                r.readAsDataURL(new Blob(vnChunks, { type: 'audio/webm' }));
            };
            mediaRec.start();
            isRec = true; vnBtn?.classList.add('rec');
            if ($('vn-icon')) $('vn-icon').innerText = 'stop';
            updatePresence("recording audio...", true);
        } catch (e) { showQuickToast("⚠️ Mic permission needed."); }
    } else {
        mediaRec.stop();
        isRec = false; vnBtn?.classList.remove('rec');
        if ($('vn-icon')) $('vn-icon').innerText = 'mic';
        updatePresence("online", true);
    }
});

bindClick('btn-emoji', async (e) => {
    e.stopPropagation();
    if (!emojiPickerLoaded) {
        emojiPickerLoaded = true;
        try { await import("https://cdn.jsdelivr.net/npm/emoji-picker-element@1/index.js"); } catch (err) {}
    }
    $('emoji-picker')?.classList.toggle('show');
});
if ($('emoji-picker')) $('emoji-picker').addEventListener('emoji-click', e => { $('msg-input').value += e.detail.unicode; });

// Context Menu & Generic Modal Listeners
bindClick('btn-close-generic-modal', () => closeLayer(genericModal));
if (genericModal) genericModal.addEventListener('click', e => { if (e.target === genericModal) closeLayer(genericModal); });
if (overlay) overlay.addEventListener('click', () => closeLayer(overlay));

document.querySelectorAll('.react-emo').forEach(el => {
    el.addEventListener('click', async (e) => {
        e.stopPropagation(); closeLayer(overlay);
        const emo = el.getAttribute('data-emo');
        let r = { ...(selectedMsg.reactions || {}) };
        if (r[state.myUid] === emo) delete r[state.myUid]; else r[state.myUid] = emo;
        await updateDoc(doc(db, state.currentRoom, selectedMsg.id), { reactions: r });
    });
});
bindClick('cm-reply', (e) => {
    e.stopPropagation(); closeLayer(overlay);
    state.replyTarget = { name: selectedMsg.name, text: selectedMsg.decrypted };
    $('reply-title').innerText = `Replying to ${selectedMsg.name}`;
    $('reply-text').innerText = selectedMsg.decrypted;
    $('reply-bar').style.display = 'flex';
});
bindClick('btn-cancel-reply', () => { state.replyTarget = null; editingMsgId = null; $('reply-bar').style.display = 'none'; });
bindClick('cm-copy', (e) => { e.stopPropagation(); closeLayer(overlay); navigator.clipboard.writeText(selectedMsg.decrypted || '').catch(() => {}); showQuickToast("📋 Copied!"); });
bindClick('cm-info', (e) => {
    e.stopPropagation(); closeLayer(overlay);
    $('modal-title').innerText = "Message Info";
    $('modal-body').innerHTML = `<div>👤 <b>Sender:</b> ${escapeHtml(selectedMsg.name)} (ID: ${escapeHtml(selectedMsg.accountCode || '')})</div><div>📅 <b>Sent:</b> ${escapeHtml(selectedMsg.sentAtStr || selectedMsg.shortTime)}</div><hr style="margin:8px 0; border-color:var(--border-col);"><div>👀 <b>Seen Status:</b> ${selectedMsg.seenStatus ? `✓✓ Seen (${escapeHtml(selectedMsg.seenAtStr || 'Read')})` : '✓ Not Seen Yet'}</div>`;
    openLayer(genericModal);
});
bindClick('cm-star', async (e) => {
    e.stopPropagation(); closeLayer(overlay);
    let s = [...(selectedMsg.starredBy || [])];
    const i = s.indexOf(state.myUid);
    if (i > -1) s.splice(i, 1); else s.push(state.myUid);
    await updateDoc(doc(db, state.currentRoom, selectedMsg.id), { starredBy: s });
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
    await updateDoc(doc(db, state.currentRoom, selectedMsg.id), {
        seenStatus: next, manualUnseen: !next,
        seenAtStr: next ? new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : ""
    });
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
        if (!d.includes(state.myUid)) d.push(state.myUid);
        await updateDoc(doc(db, state.currentRoom, target.id), { deletedFor: d });
    });
    bindClick('del-one-all', async () => {
        closeLayer(genericModal);
        if (target.type === 'live_location' && target.isLiveActive && isMyMessage(target)) {
            await stopLiveLocation(state.currentRoom, target.id);
        }
        await updateDoc(doc(db, state.currentRoom, target.id), { isDeletedEveryone: true, deletedByAudit: state.myName });
    });
});

// Contact Info Drawer Listeners
const openClearChatModal = (e) => {
    if (e) e.stopPropagation();
    if (!state.currentRoom) return;
    state.clearTargetRoomId = state.currentRoom;
    closeLayer(overlay); closeLayer(drawer); openLayer(clearModal);
};
bindClick('cm-clear-chat', openClearChatModal);
bindClick('di-storage', openClearChatModal);

bindClick('btn-edit-contact-name', () => {
    const meta = getRoomMeta(state.currentRoom);
    let n = prompt("Edit Friend's Nickname:", meta.name);
    if (n && n.trim()) { meta.name = n.trim(); syncAccountToCloud(); updateActiveHeaderBadges(meta); renderSidebarList(); }
});
if ($('toggle-lock-chat')) $('toggle-lock-chat').addEventListener('change', (e) => {
    state.myLockPin = localStorage.getItem('nova_lock_pin') || "";
    if (e.target.checked && !state.myLockPin) {
        e.target.checked = false;
        alert("⚠️ Please set your Secret Lock PIN in Settings first!");
        window.location.href = 'chat-settings.html';
        return;
    }
    const meta = getRoomMeta(state.currentRoom);
    meta.locked = e.target.checked;
    syncAccountToCloud(); renderSidebarList(); renderActiveStrip();
    if (meta.locked) goBackToList();
});
if ($('select-vanish-timer')) $('select-vanish-timer').addEventListener('change', (e) => {
    const meta = getRoomMeta(state.currentRoom);
    meta.timer = e.target.value;
    syncAccountToCloud(); updateActiveHeaderBadges(meta); renderSidebarList();
});
bindClick('di-enc', () => {
    const curKey = localStorage.getItem(`nova_enc_${state.currentRoom}`) || "";
    let k = prompt("🔐 Enter Secret Encryption Password for this chat:", curKey);
    if (k === null) return;
    localStorage.setItem(`nova_enc_${state.currentRoom}`, k.trim());
    updateActiveHeaderBadges(getRoomMeta(state.currentRoom));
    listenToMessages(state.currentRoom);
});
bindClick('di-vib', () => {
    state.vibrationEnabled = !state.vibrationEnabled;
    localStorage.setItem('nova_vib', state.vibrationEnabled);
    if ($('di-vib-val')) $('di-vib-val').innerText = state.vibrationEnabled ? "ON" : "OFF";
    if (state.vibrationEnabled) playAlertBeep();
});
bindClick('di-notif', async () => {
    if ("Notification" in window && Notification.permission !== "granted") await Notification.requestPermission().catch(() => {});
    state.stealthNotifEnabled = !state.stealthNotifEnabled;
    localStorage.setItem('nova_stealth_notif', state.stealthNotifEnabled);
    if ($('di-notif-val')) $('di-notif-val').innerText = state.stealthNotifEnabled ? "ON" : "OFF";
    if (state.stealthNotifEnabled) initStealthFCM();
    triggerStealthAlert("text", state.currentRoom);
});
bindClick('di-remove-chat', () => runDeleteEntireChat(state.currentRoom, false));
bindClick('di-media', () => {
    $('modal-title').innerText = "🖼️ Shared Media";
    let html = '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">', count = 0;
    for (let id in state.cachedMessages) {
        const m = state.cachedMessages[id];
        if ((m.type === 'image' || m.type === 'video') && !m.isViewOnce && !m.isDeletedEveryone) {
            count++;
            const pUrl = (m.mediaUrl || '').startsWith('http') ? m.mediaUrl + '#t=0.001' : m.mediaUrl;
            html += m.type === 'video'
                ? `<video src="${pUrl}" controls playsinline webkit-playsinline preload="metadata" style="width:100%; border-radius:8px; background:#000;"></video>`
                : `<img src="${m.mediaUrl}" style="width:100%; height:110px; object-fit:cover; border-radius:8px;">`;
        }
    }
    html += '</div>';
    $('modal-body').innerHTML = count > 0 ? html : "No media shared in this chat.";
    openLayer(genericModal);
});
bindClick('di-starred', () => {
    $('modal-title').innerText = "⭐ Starred Messages";
    let html = '';
    const encKey = localStorage.getItem(`nova_enc_${state.currentRoom}`) || "";
    for (let id in state.cachedMessages) {
        const m = state.cachedMessages[id];
        if (m.starredBy && m.starredBy.includes(state.myUid) && !m.isDeletedEveryone) {
            html += `<div style="background:var(--bg-nav); padding:8px; border-radius:8px; margin-bottom:8px; border-left:3px solid #eab308;"><div style="font-size:11px; color:var(--text-sub);"><b>${escapeHtml(m.name)}</b> • ${escapeHtml(m.dateLabel || '')} ${escapeHtml(m.shortTime || '')}</div><div style="margin-top:3px;">${m.type === 'image' ? `<img src="${m.mediaUrl}" style="max-width:120px; border-radius:4px;">` : escapeHtml(decryptText(m.text, encKey))}</div></div>`;
        }
    }
    $('modal-body').innerHTML = html || "No starred messages.";
    openLayer(genericModal);
});

// Admin Dashboard Buttons
bindClick('btn-close-god-modal', () => closeLayer(godModal));
bindClick('god-purge-btn', async () => {
    if (!godRoom) return;
    const snap = await getDocs(collection(db, godRoom));
    for (const d of snap.docs) {
        if (d.data().isDeletedEveryone || (d.data().deletedFor && d.data().deletedFor.length > 0)) {
            await deleteDoc(doc(db, godRoom, d.id));
        }
    }
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
    state.isWidgetOpen = !!d.open;
    if (d.panic && hasActiveCall()) cleanupCall(false);
    if (!state.isWidgetOpen) {
        updatePresence("offline", true);
        lockAppIfEnabled();
    } else if (state.isWidgetOpen && state.isAppUnlocked && state.isRoomActivelyOpen) {
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
    } else if (document.visibilityState === 'visible' && state.isAppUnlocked) {
        updatePresence("online", true);
        markVisibleMessagesSeen();
    }
});

// ============================================================================
// 6. START SESSION & HANDOFF FROM index.html
// ============================================================================
function startAuthenticatedSession(shouldApplyLock = true) {
    if ($('my-top-name')) $('my-top-name').innerText = state.myName;
    if ($('my-top-id-tag')) $('my-top-id-tag').innerText = `My ID: ${state.myAccountCode}`;
    const dpEl = $('my-top-dp');
    if (dpEl) {
        if (state.myDp) { dpEl.innerHTML = '<div class="online-dot"></div>'; dpEl.style.backgroundImage = `url(${state.myDp})`; }
        else { dpEl.style.backgroundImage = ''; dpEl.innerHTML = `<span class="material-icons" style="font-size:20px;">person</span><div class="online-dot"></div>`; }
    }
    updateAppLockIconUI();
    if (shouldApplyLock) lockAppIfEnabled();

    initStealthFCM();

    if (unsubscribeAccountSync) unsubscribeAccountSync();
    unsubscribeAccountSync = onSnapshot(doc(db, "novahub_accounts", state.myAccountCode), (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        if (d.lockPin && d.lockPin !== state.myLockPin) {
            state.myLockPin = d.lockPin;
            localStorage.setItem('nova_lock_pin', state.myLockPin);
        }
        if (typeof d.appLockEnabled === 'boolean' && d.appLockPin) {
            state.appLockEnabled = d.appLockEnabled;
            state.appLockPin = d.appLockPin;
            localStorage.setItem('nova_app_lock_enabled', String(state.appLockEnabled));
            localStorage.setItem('nova_app_lock_pin', state.appLockPin);
            updateAppLockIconUI();
        }
        if (d.savedRooms) {
            let updated = false;
            d.savedRooms.forEach(cloudRoom => {
                if (cloudRoom.id === 'global_novahub_chat' || state.recentlyDeletedRooms.has(cloudRoom.id)) return;
                if (!state.savedRooms.find(r => r.id === cloudRoom.id)) {
                    state.savedRooms.push(cloudRoom);
                    updated = true;
                }
            });
            if (updated) {
                localStorage.setItem('nova_saved_rooms', JSON.stringify(state.savedRooms));
                syncRoomSummaryListeners();
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

    syncRoomSummaryListeners();
    renderSidebarList();
    renderActiveStrip();

    const lastId = localStorage.getItem('nova_last_room');
    const bgRoom = state.savedRooms.find(r => r.id === lastId) || state.savedRooms[0];
    if (bgRoom) selectRoom(bgRoom.id, false);
}

try {
    if (sessionStorage.getItem('nova_open_admin') === '1') {
        sessionStorage.removeItem('nova_open_admin');
        closeLayer(authScreen);
        openGodDashboard();
    } else if (state.myAccountCode && state.myName) {
        closeLayer(authScreen);
        startAuthenticatedSession(true);
    } else {
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

// ============================================================================
// NOVAMESSENGER MODULE 4: WHATSAPP SIDEBAR, 3-DOTS MENU & CLEAR/DELETE (chat-sidebar.js)
// ============================================================================
import {
    db, state, hooks, timerLabels, timerMs, $, bindClick, escapeHtml,
    openLayer, closeLayer, showQuickToast, verifyAdminCode, decryptText,
    make1on1RoomId, isMyMessage, formatChatListTime, syncAccountToCloud,
    doc, setDoc, getDoc, getDocs, updateDoc, onSnapshot, collection,
    query, orderBy, limit
} from "./chat-shared.js";
import { detachCallListener } from "./chat-calls.js";
import { stopLiveLocation, detachPresenceListener, loadStories } from "./chat-features.js";

// ============================================================================
// 1. INJECT WHATSAPP CHAT-LIST STYLES & 3-DOTS ACTION SHEET (NO HTML EDIT NEEDED)
// ============================================================================
export function injectWhatsAppListUI() {
    if (!document.getElementById('nova-wa-list-styles')) {
        const st = document.createElement('style');
        st.id = 'nova-wa-list-styles';
        st.textContent = `
            .chat-item { display:flex; align-items:center; gap:10px; position:relative; }
            .chat-item-info { flex:1; min-width:0; overflow:hidden; display:flex; flex-direction:column; gap:3px; }
            .chat-item-top { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; }
            .chat-item-name { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:5px; }
            .wa-chat-time { font-size:11px; color:var(--text-sub, #94a3b8); white-space:nowrap; flex-shrink:0; font-weight:500; }
            .wa-chat-time.unread { color:#25d366; font-weight:700; }
            .wa-bottom-row { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; }
            .wa-preview { flex:1; min-width:0; font-size:12.5px; color:var(--text-sub, #94a3b8); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:3px; }
            .wa-preview.unread { color:var(--text-main, #f1f5f9); font-weight:600; }
            .wa-preview-tick { font-size:14px !important; flex-shrink:0; color:#94a3b8; }
            .wa-preview-tick.read { color:#38bdf8; }
            .wa-indicators { display:flex; align-items:center; gap:5px; flex-shrink:0; }
            .wa-mute-ico { font-size:16px !important; color:var(--text-sub, #94a3b8); opacity:0.85; }
            .wa-unread-badge { background:#25d366; color:#052e16; font-size:11px; font-weight:800; min-width:20px; height:20px; padding:0 6px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; line-height:1; }
            .wa-more-btn { width:30px; height:36px; border-radius:10px; border:none; background:transparent; color:var(--text-sub, #94a3b8); display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; margin-right:-4px; padding:0; }
            .wa-more-btn:active { background:rgba(255,255,255,0.1); }
            .wa-archived-row { display:flex; align-items:center; justify-content:space-between; padding:11px 14px; border-bottom:1px solid var(--border-col, rgba(255,255,255,0.08)); cursor:pointer; background:rgba(16,185,129,0.06); }
            .wa-archived-row:active { background:rgba(16,185,129,0.14); }
            .wa-archived-left { display:flex; align-items:center; gap:12px; font-size:13.5px; font-weight:700; color:var(--text-main, #f1f5f9); }
            .wa-archived-count { font-size:12px; font-weight:700; color:#25d366; }

            #room-action-sheet { position:fixed; inset:0; background:rgba(0,0,0,0.72); backdrop-filter:blur(3px); z-index:9990; display:none; align-items:flex-end; justify-content:center; padding:12px; }
            #room-action-sheet.is-open { display:flex; }
            .ras-card { width:100%; max-width:410px; background:#0f172a; border:1px solid rgba(255,255,255,0.12); border-radius:18px; overflow:hidden; box-shadow:0 20px 50px rgba(0,0,0,0.65); animation:rasUp 0.18s ease-out; }
            body.light-mode .ras-card { background:#ffffff; border-color:rgba(15,23,42,0.12); color:#0f172a; }
            @keyframes rasUp { from { transform:translateY(24px); opacity:0.5; } to { transform:translateY(0); opacity:1; } }
            .ras-head { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,0.08); }
            body.light-mode .ras-head { border-bottom-color:rgba(15,23,42,0.08); }
            .ras-title { font-size:14.5px; font-weight:700; color:#f8fafc; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            body.light-mode .ras-title { color:#0f172a; }
            .ras-sub { font-size:11px; color:#94a3b8; }
            .ras-close { width:30px; height:30px; border-radius:999px; border:none; background:rgba(255,255,255,0.08); color:#cbd5e1; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
            body.light-mode .ras-close { background:rgba(15,23,42,0.08); color:#334155; }
            .ras-list { display:flex; flex-direction:column; padding:6px; gap:2px; }
            .ras-btn { width:100%; display:flex; align-items:center; gap:12px; padding:12px 14px; border:none; border-radius:12px; background:transparent; color:#e2e8f0; font-size:13.5px; font-weight:600; text-align:left; cursor:pointer; }
            body.light-mode .ras-btn { color:#1e293b; }
            .ras-btn:active { background:rgba(255,255,255,0.08); }
            .ras-btn .material-icons { font-size:20px; color:#38bdf8; flex-shrink:0; }
            .ras-btn.warn .material-icons { color:#f59e0b; }
            .ras-btn.danger { color:#f87171; }
            .ras-btn.danger .material-icons { color:#ef4444; }
            .ras-btn-desc { display:block; font-size:11px; font-weight:400; color:#94a3b8; margin-top:1px; }
        `;
        document.head.appendChild(st);
    }

    if (!document.getElementById('room-action-sheet')) {
        const sheet = document.createElement('div');
        sheet.id = 'room-action-sheet';
        sheet.innerHTML = `
            <div class="ras-card" id="ras-card-box">
                <div class="ras-head">
                    <div style="min-width:0; flex:1; padding-right:8px;">
                        <div class="ras-title" id="ras-room-name">Chat Options</div>
                        <div class="ras-sub" id="ras-room-sub">ID</div>
                    </div>
                    <button type="button" class="ras-close" id="ras-close-btn">×</button>
                </div>
                <div class="ras-list">
                    <button type="button" class="ras-btn" id="ras-mute-btn">
                        <span class="material-icons" id="ras-mute-ico">notifications_off</span>
                        <div><span id="ras-mute-txt">Mute Notifications</span><span class="ras-btn-desc" id="ras-mute-desc">Is chat ki notification & sound band karein</span></div>
                    </button>
                    <button type="button" class="ras-btn" id="ras-archive-btn">
                        <span class="material-icons" id="ras-archive-ico">archive</span>
                        <div><span id="ras-archive-txt">Archive Chat</span><span class="ras-btn-desc" id="ras-archive-desc">Main chat list se Archived folder mein bhejein</span></div>
                    </button>
                    <button type="button" class="ras-btn warn" id="ras-lock-btn">
                        <span class="material-icons" id="ras-lock-ico">lock</span>
                        <div><span id="ras-lock-txt">Lock & Hide Chat</span><span class="ras-btn-desc" id="ras-lock-desc">Secret PIN se chhupayein</span></div>
                    </button>
                    <button type="button" class="ras-btn warn" id="ras-clear-btn">
                        <span class="material-icons">cleaning_services</span>
                        <div><span>Clear Chat</span><span class="ras-btn-desc">Sirf messages delete honge, chat yahan rahegi</span></div>
                    </button>
                    <button type="button" class="ras-btn danger" id="ras-delete-btn">
                        <span class="material-icons">delete_forever</span>
                        <div><span>Delete Chat</span><span class="ras-btn-desc">Messages + chat dono yahan se gayab ho jayenge</span></div>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(sheet);
    }
}

// ============================================================================
// 2. LIVE CHAT SUMMARIES (UNREAD COUNT + LAST MESSAGE + EXACT TIME)
// ============================================================================
function getMessagePreviewText(roomId, m) {
    if (!m) return '';
    if (m.type === 'image') return m.isViewOnce ? '➀ Photo' : '📷 Photo';
    if (m.type === 'video') return m.isViewOnce ? '➀ Video' : '🎥 Video';
    if (m.type === 'audio') return m.isViewOnce ? '➀ Voice note' : '🎙️ Voice note';
    if (m.type === 'location') return '📍 Location';
    if (m.type === 'live_location') return '🛰️ Live location';
    const raw = m.text || '';
    if (raw.startsWith('🔒ENC:')) {
        const encKey = localStorage.getItem(`nova_enc_${roomId}`) || '';
        return encKey ? decryptText(raw, encKey) : '🔐 Encrypted message';
    }
    return raw;
}

export function detachAllSummaryListeners() {
    for (const unsub of state.roomSummaryUnsubs.values()) unsub();
    state.roomSummaryUnsubs.clear();
}

export function syncRoomSummaryListeners() {
    const activeIds = new Set(state.savedRooms.map(r => r.id));

    for (const [rId, unsub] of state.roomSummaryUnsubs.entries()) {
        if (!activeIds.has(rId)) {
            unsub();
            state.roomSummaryUnsubs.delete(rId);
            delete state.roomSummaries[rId];
        }
    }

    state.savedRooms.forEach(r => {
        if (state.roomSummaryUnsubs.has(r.id)) return;
        let firstSnap = true;
        const q = query(collection(db, r.id), orderBy("sentMs", "desc"), limit(25));
        const unsub = onSnapshot(q, (snap) => {
            let latestMsg = null;
            let unreadCount = 0;

            snap.forEach(d => {
                const m = d.data();
                if (!m || m.isDeletedEveryone || (m.deletedFor && m.deletedFor.includes(state.myUid))) return;
                const vTimer = m.vanishTimer || "off";
                if (vTimer !== "off" && vTimer !== "instant" && timerMs[vTimer]) {
                    const baseMs = m.seenMs || m.sentMs || Date.now();
                    if (Date.now() - baseMs > timerMs[vTimer]) return;
                }
                if (!latestMsg) latestMsg = m;
                if (!isMyMessage(m) && !m.seenStatus && !m.manualUnseen) unreadCount++;
            });

            const prevMs = state.roomSummaries[r.id]?.lastMs || 0;
            const newMs = latestMsg ? (latestMsg.sentMs || 0) : 0;

            if (latestMsg) {
                state.roomSummaries[r.id] = {
                    lastText: getMessagePreviewText(r.id, latestMsg),
                    lastTime: formatChatListTime(newMs, latestMsg.shortTime || ''),
                    lastMs: newMs,
                    lastIsMe: isMyMessage(latestMsg),
                    lastSeen: !!latestMsg.seenStatus,
                    unreadCount
                };
            } else {
                state.roomSummaries[r.id] = {
                    lastText: '', lastTime: '', lastMs: 0,
                    lastIsMe: false, lastSeen: false, unreadCount: 0
                };
            }

            if (!firstSnap && latestMsg && newMs > prevMs && !isMyMessage(latestMsg) && r.id !== state.currentRoom) {
                hooks.triggerStealthAlert?.(latestMsg.type === 'text' ? 'text' : 'media', r.id);
            }
            firstSnap = false;
            renderSidebarList();
        }, () => {});
        state.roomSummaryUnsubs.set(r.id, unsub);
    });
}

// ============================================================================
// 3. ACTIVE STORIES STRIP & WHATSAPP-STYLE SIDEBAR LIST
// ============================================================================
export function renderActiveStrip() {
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

    state.savedRooms.forEach(r => {
        if (r.locked || r.archived) return;
        const init = (r.name || 'U').charAt(0).toUpperCase();
        const b = document.createElement('div');
        b.className = 'story-bubble';
        b.innerHTML = `
            <div class="story-ring">
                <div class="avatar" style="${r.dp ? `background-image:url(${r.dp})` : ''}">${r.dp ? '' : escapeHtml(init)}<div class="online-dot"></div></div>
            </div>
            <span class="story-name">${escapeHtml(r.name)}</span>
        `;
        b.addEventListener('click', () => hooks.selectRoom?.(r.id, true));
        strip.appendChild(b);
    });
}

function openRoomActionSheet(roomId) {
    const r = state.savedRooms.find(x => x.id === roomId);
    if (!r) return;
    state.actionTargetRoomId = roomId;

    $('ras-room-name').innerText = r.name || 'Private Chat';
    $('ras-room-sub').innerText = `ID: ${r.peerCode || 'Private'}${r.muted ? ' • Muted' : ''}${r.archived ? ' • Archived' : ''}${r.locked ? ' • Locked' : ''}`;

    $('ras-mute-ico').innerText = r.muted ? 'notifications_active' : 'notifications_off';
    $('ras-mute-txt').innerText = r.muted ? 'Unmute Notifications' : 'Mute Notifications';
    $('ras-mute-desc').innerText = r.muted ? 'Notification & sound wapas chalu karein' : 'Is chat ki notification & sound band karein';

    $('ras-archive-ico').innerText = r.archived ? 'unarchive' : 'archive';
    $('ras-archive-txt').innerText = r.archived ? 'Unarchive Chat' : 'Archive Chat';
    $('ras-archive-desc').innerText = r.archived ? 'Main chat list mein wapas layein' : 'Main list se Archived folder mein chhupayein';

    $('ras-lock-ico').innerText = r.locked ? 'lock_open' : 'lock';
    $('ras-lock-txt').innerText = r.locked ? 'Unlock & Unhide Chat' : 'Lock & Hide Chat';
    $('ras-lock-desc').innerText = r.locked ? 'Chat ko wapas normal list mein dikhayein' : 'Secret PIN se chhupayein';

    openLayer($('room-action-sheet'));
}

export function renderSidebarList() {
    const area = $('chats-list-area');
    if (!area) return;
    area.innerHTML = '';
    const searchVal = ($('pin-search-input')?.value || '').trim();
    state.myLockPin = localStorage.getItem('nova_lock_pin') || "";
    const unlockedBySearch = (state.myLockPin !== "" && searchVal === state.myLockPin);

    const archivedRooms = state.savedRooms.filter(r => r.archived && !r.locked);
    if (state.showingArchivedView && (archivedRooms.length === 0 || unlockedBySearch)) {
        state.showingArchivedView = false;
    }

    if (!unlockedBySearch && !searchVal) {
        if (state.showingArchivedView) {
            const backBar = document.createElement('div');
            backBar.className = 'wa-archived-row';
            backBar.innerHTML = `
                <div class="wa-archived-left">
                    <span class="material-icons" style="color:#25d366; font-size:20px;">arrow_back</span>
                    <span>Archived Chats (${archivedRooms.length})</span>
                </div>
                <span style="font-size:11px; color:var(--text-sub);">Back</span>
            `;
            backBar.addEventListener('click', () => { state.showingArchivedView = false; renderSidebarList(); });
            area.appendChild(backBar);
        } else if (archivedRooms.length > 0) {
            const archUnread = archivedRooms.reduce((sum, r) => sum + (state.roomSummaries[r.id]?.unreadCount || 0), 0);
            const archBar = document.createElement('div');
            archBar.className = 'wa-archived-row';
            archBar.innerHTML = `
                <div class="wa-archived-left">
                    <span class="material-icons" style="color:#25d366; font-size:20px;">archive</span>
                    <span>Archived</span>
                </div>
                <span class="wa-archived-count">${archUnread > 0 ? archUnread : archivedRooms.length}</span>
            `;
            archBar.addEventListener('click', () => { state.showingArchivedView = true; renderSidebarList(); });
            area.appendChild(archBar);
        }
    }

    const visibleRooms = state.savedRooms.filter(r => {
        if (unlockedBySearch) return !!r.locked;
        if (r.locked) return false;
        if (searchVal) {
            return r.name.toLowerCase().includes(searchVal.toLowerCase()) || (r.peerCode || '').includes(searchVal);
        }
        return state.showingArchivedView ? !!r.archived : !r.archived;
    });

    visibleRooms.sort((a, b) => (state.roomSummaries[b.id]?.lastMs || 0) - (state.roomSummaries[a.id]?.lastMs || 0));

    if (visibleRooms.length === 0) {
        const emptyText = state.showingArchivedView
            ? `📦 <b>No Archived Chats</b>`
            : `🔒 <b>Your Private Inbox is Empty</b><br>Tap <b>+ Add ID</b> above and enter your friend's ID number to start a private 1-on-1 chat.`;
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-inbox';
        emptyDiv.innerHTML = emptyText;
        area.appendChild(emptyDiv);
        return;
    }

    visibleRooms.forEach(r => {
        const sum = state.roomSummaries[r.id] || {};
        const unread = sum.unreadCount || 0;
        const hasUnread = unread > 0;
        const tBadge = (r.timer && r.timer !== 'off') ? `<span class="mode-badge">${timerLabels[r.timer]}</span>` : '';
        const lockBadge = r.locked ? `<span class="mode-badge" style="color:#eab308; border-color:#eab308;">🔒</span>` : '';
        const init = (r.name || 'U').charAt(0).toUpperCase();

        const previewTick = (sum.lastText && sum.lastIsMe)
            ? `<span class="material-icons wa-preview-tick ${sum.lastSeen ? 'read' : ''}">${sum.lastSeen ? 'done_all' : 'check'}</span>`
            : '';
        const previewHtml = sum.lastText
            ? `${previewTick}<span style="overflow:hidden; text-overflow:ellipsis;">${escapeHtml(sum.lastText)}</span>`
            : `ID: ${escapeHtml(r.peerCode || 'Private')} • Tap to message`;

        const muteHtml = r.muted ? `<span class="material-icons wa-mute-ico" title="Muted">notifications_off</span>` : '';
        const badgeHtml = hasUnread ? `<span class="wa-unread-badge">${unread >= 25 ? '25+' : unread}</span>` : '';

        const div = document.createElement('div');
        div.className = `chat-item ${r.id === state.currentRoom && state.isRoomActivelyOpen ? 'active' : ''}`;
        div.innerHTML = `
            <div class="avatar" style="${r.dp ? `background-image:url(${r.dp})` : ''}">${r.dp ? '' : escapeHtml(init)}<div class="online-dot"></div></div>
            <div class="chat-item-info">
                <div class="chat-item-top">
                    <span class="chat-item-name">${escapeHtml(r.name)} ${tBadge} ${lockBadge}</span>
                    <span class="wa-chat-time ${hasUnread ? 'unread' : ''}">${escapeHtml(sum.lastTime || '')}</span>
                </div>
                <div class="wa-bottom-row">
                    <div class="wa-preview ${hasUnread ? 'unread' : ''}">${previewHtml}</div>
                    <div class="wa-indicators">${muteHtml}${badgeHtml}</div>
                </div>
            </div>
            <button type="button" class="wa-more-btn" aria-label="Chat options">
                <span class="material-icons" style="font-size:20px;">more_vert</span>
            </button>
        `;

        div.querySelector('.wa-more-btn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openRoomActionSheet(r.id);
        });

        div.addEventListener('click', () => {
            if (r.locked && $('pin-search-input')) $('pin-search-input').value = '';
            hooks.selectRoom?.(r.id, true);
        });
        area.appendChild(div);
    });
}

// ============================================================================
// 4. CLEAR CHAT & DELETE ENTIRE CHAT OPERATIONS
// ============================================================================
export async function runClearAllChat(forEveryone, targetRoomId = state.currentRoom, silent = false) {
    const rId = targetRoomId || state.currentRoom;
    if (!rId) return;
    closeLayer($('clear-chat-modal'));
    if (!silent) showQuickToast("🧹 Clearing messages...");
    if (forEveryone && state.activeLiveSessions[rId]) {
        await stopLiveLocation(rId, state.activeLiveSessions[rId].msgId);
    }
    try {
        const snap = await getDocs(collection(db, rId));
        const ops = [];
        snap.docs.forEach(d => {
            const data = d.data();
            if (forEveryone) {
                if (!data.isDeletedEveryone) {
                    ops.push(updateDoc(doc(db, rId, d.id), {
                        isDeletedEveryone: true,
                        isLiveActive: false,
                        deletedByAudit: state.myName
                    }).catch(() => {}));
                }
            } else {
                const df = [...(data.deletedFor || [])];
                if (!df.includes(state.myUid)) {
                    df.push(state.myUid);
                    ops.push(updateDoc(doc(db, rId, d.id), { deletedFor: df }).catch(() => {}));
                }
            }
        });
        await Promise.all(ops);
        if (rId === state.currentRoom) {
            if ($('msgs-container')) $('msgs-container').innerHTML = '';
            state.domMap.clear();
            state.cachedMessages = {};
        }
        state.roomSummaries[rId] = { lastText: '', lastTime: '', lastMs: 0, lastIsMe: false, lastSeen: false, unreadCount: 0 };
        renderSidebarList();
        if (!silent) showQuickToast("✅ Saare messages clear ho gaye!");
    } catch (e) {
        if (!silent) showQuickToast("⚠️ Clear chat failed, try again.");
    }
}

export async function runDeleteEntireChat(roomId, forEveryone) {
    if (!roomId) return;
    closeLayer($('generic-modal'));
    showQuickToast("🗑️ Deleting chat...");

    await runClearAllChat(forEveryone, roomId, true);

    state.recentlyDeletedRooms.add(roomId);
    setTimeout(() => state.recentlyDeletedRooms.delete(roomId), 15000);

    state.savedRooms = state.savedRooms.filter(r => r.id !== roomId);
    if (state.roomSummaryUnsubs.has(roomId)) {
        state.roomSummaryUnsubs.get(roomId)();
        state.roomSummaryUnsubs.delete(roomId);
    }
    delete state.roomSummaries[roomId];

    if (state.currentRoom === roomId) {
        hooks.detachChatListener?.();
        detachPresenceListener();
        detachCallListener();
        state.currentRoom = "";
        state.isRoomActivelyOpen = false;
        localStorage.removeItem('nova_last_room');
        $('chat-view')?.classList.remove('open');
        if ($('msgs-container')) $('msgs-container').innerHTML = '';
        state.domMap.clear();
        state.cachedMessages = {};
    }

    await syncAccountToCloud();
    renderActiveStrip();
    renderSidebarList();
    showQuickToast("🗑️ Chat & messages delete ho gaye!");
}

// ============================================================================
// 5. BIND SIDEBAR, TABS, SEARCH, ADD-ID & 3-DOTS ACTION SHEET CONTROLS
// ============================================================================
export function initSidebarControls() {
    injectWhatsAppListUI();
    const roomActionSheet = $('room-action-sheet');
    const clearModal = $('clear-chat-modal');
    const genericModal = $('generic-modal');

    bindClick('ras-close-btn', () => closeLayer(roomActionSheet));
    if (roomActionSheet) roomActionSheet.addEventListener('click', (e) => {
        if (e.target === roomActionSheet) closeLayer(roomActionSheet);
    });

    bindClick('ras-mute-btn', async () => {
        const r = state.savedRooms.find(x => x.id === state.actionTargetRoomId);
        closeLayer(roomActionSheet);
        if (!r) return;
        r.muted = !r.muted;
        await syncAccountToCloud();
        renderSidebarList();
        showQuickToast(r.muted ? `🔕 ${r.name} muted` : `🔔 ${r.name} unmuted`);
    });

    bindClick('ras-archive-btn', async () => {
        const r = state.savedRooms.find(x => x.id === state.actionTargetRoomId);
        closeLayer(roomActionSheet);
        if (!r) return;
        r.archived = !r.archived;
        await syncAccountToCloud();
        renderActiveStrip();
        renderSidebarList();
        showQuickToast(r.archived ? `📦 ${r.name} archived` : `📤 ${r.name} unarchived`);
    });

    bindClick('ras-lock-btn', async () => {
        const r = state.savedRooms.find(x => x.id === state.actionTargetRoomId);
        closeLayer(roomActionSheet);
        if (!r) return;

        if (!r.locked) {
            state.myLockPin = localStorage.getItem('nova_lock_pin') || "";
            if (!state.myLockPin) {
                const newPin = prompt("🔐 Lock & Hide ke liye apna Secret Search PIN set karein (kam se kam 4 digits):");
                if (!newPin || newPin.trim().length < 4) {
                    if (newPin !== null) showQuickToast("⚠️ Kam se kam 4 digit ka PIN daalein");
                    return;
                }
                state.myLockPin = newPin.trim();
                localStorage.setItem('nova_lock_pin', state.myLockPin);
                if (state.myAccountCode) {
                    await setDoc(doc(db, "novahub_accounts", state.myAccountCode), { lockPin: state.myLockPin }, { merge: true }).catch(() => {});
                }
            }
            r.locked = true;
            if (state.currentRoom === r.id && state.isRoomActivelyOpen) hooks.goBackToList?.();
            showQuickToast(`🔒 ${r.name} locked & hidden! Search bar mein PIN daalein.`);
        } else {
            r.locked = false;
            showQuickToast(`🔓 ${r.name} unlocked!`);
        }
        await syncAccountToCloud();
        renderActiveStrip();
        renderSidebarList();
    });

    bindClick('ras-clear-btn', () => {
        const targetId = state.actionTargetRoomId;
        closeLayer(roomActionSheet);
        if (!targetId) return;
        state.clearTargetRoomId = targetId;
        openLayer(clearModal);
    });

    bindClick('ras-delete-btn', () => {
        const targetId = state.actionTargetRoomId;
        const r = state.savedRooms.find(x => x.id === targetId);
        closeLayer(roomActionSheet);
        if (!r) return;

        $('modal-title').innerText = `🗑️ Delete "${r.name}"?`;
        $('modal-body').innerHTML = `
            <p style="font-size:12.5px; color:var(--text-sub); margin-bottom:12px;">
                Isse saare messages delete ho jayenge aur yeh chat aapki list se poori tarah gayab ho jayegi.
            </p>
            <button id="del-chat-me" type="button" class="loc-action-btn" style="background:rgba(255,255,255,0.1); color:#fff; margin-bottom:10px; width:100%;">
                🗑️ Delete for Me & Remove Chat
            </button>
            <button id="del-chat-all" type="button" class="loc-action-btn" style="background:#dc2626; color:#fff; width:100%;">
                🔥 Delete for Everyone & Remove Chat
            </button>
        `;
        openLayer(genericModal);
        bindClick('del-chat-me', () => runDeleteEntireChat(targetId, false));
        bindClick('del-chat-all', () => runDeleteEntireChat(targetId, true));
    });

    // Clear Chat Modal Buttons
    bindClick('btn-close-clear-modal', () => closeLayer(clearModal));
    if (clearModal) clearModal.addEventListener('click', e => { if (e.target === clearModal) closeLayer(clearModal); });
    bindClick('btn-clear-me', () => runClearAllChat(false, state.clearTargetRoomId || state.currentRoom));
    bindClick('btn-clear-all', () => runClearAllChat(true, state.clearTargetRoomId || state.currentRoom));

    // Tabs (Messages / Stories)
    bindClick('tab-chats', () => {
        $('tab-chats')?.classList.add('active');
        $('tab-status')?.classList.remove('active');
        if ($('chats-search-bar')) $('chats-search-bar').style.display = 'flex';
        if ($('chats-list-area')) $('chats-list-area').style.display = 'block';
        if ($('status-list-area')) $('status-list-area').style.display = 'none';
    });
    bindClick('tab-status', () => {
        $('tab-status')?.classList.add('active');
        $('tab-chats')?.classList.remove('active');
        if ($('chats-search-bar')) $('chats-search-bar').style.display = 'none';
        if ($('chats-list-area')) $('chats-list-area').style.display = 'none';
        if ($('status-list-area')) $('status-list-area').style.display = 'block';
        loadStories();
    });

    // Search & + Add Friend ID
    bindClick('btn-add-room', async () => {
        let friendCode = ($('pin-search-input')?.value || '').trim();
        if (!friendCode) friendCode = prompt("👤 Enter Friend's Unique ID Number / Code:");
        if (!friendCode) return;
        friendCode = friendCode.trim();
        if ($('pin-search-input')) $('pin-search-input').value = '';
        if (await verifyAdminCode(friendCode)) { hooks.openGodDashboard?.(); return; }
        if (friendCode === state.myAccountCode) return alert("⚠️ That is your own ID! Enter your friend's ID.");

        const fSnap = await getDoc(doc(db, "novahub_accounts", friendCode));
        if (!fSnap.exists()) return alert(`❌ User ID "${friendCode}" not found! Ask your friend to Sign Up first.`);
        const fData = fSnap.data();
        const dmRoomId = make1on1RoomId(state.myAccountCode, friendCode);

        if (!state.savedRooms.find(r => r.id === dmRoomId)) {
            state.savedRooms.push({
                id: dmRoomId,
                name: fData.name || (`User ${friendCode}`),
                peerCode: friendCode,
                dp: fData.dp || "",
                locked: false, muted: false, archived: false, timer: "off"
            });
            await syncAccountToCloud();
            syncRoomSummaryListeners();
            renderActiveStrip();
        }
        let friendRooms = (fData.savedRooms || []).filter(r => r.id !== 'global_novahub_chat');
        if (!friendRooms.find(r => r.id === dmRoomId)) {
            friendRooms.push({
                id: dmRoomId,
                name: state.myName,
                peerCode: state.myAccountCode,
                dp: state.myDp,
                locked: false, muted: false, archived: false, timer: "off"
            });
            await setDoc(doc(db, "novahub_accounts", friendCode), { savedRooms: friendRooms }, { merge: true }).catch(() => {});
        }
        hooks.selectRoom?.(dmRoomId, true);
    });

    const searchInp = $('pin-search-input');
    if (searchInp) {
        searchInp.addEventListener('input', () => renderSidebarList());
        searchInp.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const val = e.target.value.trim();
                if (val && await verifyAdminCode(val)) {
                    e.target.value = '';
                    hooks.openGodDashboard?.();
                }
            }
        });
    }
}

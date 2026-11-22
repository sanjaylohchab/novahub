// ============================================================================
// NOVAMESSENGER MODULE 5: IN-CHAT SEARCH, CALL HISTORY & WATCH TOGETHER
// ============================================================================
import {
    db, state, hooks, $, bindClick, escapeHtml, openLayer, closeLayer,
    showQuickToast, decryptText, getRoomMeta, getShortTime,
    doc, setDoc, deleteDoc, onSnapshot, collection, addDoc, query, orderBy,
    limitToLast, serverTimestamp
} from "./chat-shared.js";

function initNovaExtras() {
    if (document.getElementById('nova-extras-styles')) return;

    const st = document.createElement('style');
    st.id = 'nova-extras-styles';
    st.textContent = `
        /* 1. In-Chat Search Bar (Hidden by default, opens from Contact Info Drawer) */
        #nova-chat-search-bar {
            display: none; align-items: center; gap: 8px; padding: 8px 12px;
            background: #1e293b; border-bottom: 1px solid rgba(255,255,255,0.1);
            flex-shrink: 0; z-index: 25;
        }
        #nova-chat-search-bar.open { display: flex; }
        body.light-mode #nova-chat-search-bar { background: #f1f5f9; border-bottom-color: rgba(15,23,42,0.1); }
        #nova-chat-search-inp {
            flex: 1; padding: 8px 12px; border-radius: 999px; border: none; outline: none;
            background: rgba(0,0,0,0.28); color: inherit; font-size: 13.5px;
        }
        body.light-mode #nova-chat-search-inp { background: #fff; color: #0f172a; }
        .ncs-btn {
            background: rgba(255,255,255,0.1); border: none; color: inherit;
            width: 30px; height: 30px; border-radius: 50%; cursor: pointer;
            display: flex; align-items: center; justify-content: center; font-size: 16px;
        }
        .msg-wrap.search-hit .msg-bubble {
            outline: 2px solid #eab308 !important;
            box-shadow: 0 0 14px rgba(234,179,8,0.55) !important;
        }

        /* 2. Drawer Extra Rows */
        .nova-drawer-extra-row {
            display: flex; align-items: center; gap: 12px; padding: 13px 16px;
            cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.06);
            font-size: 14px; font-weight: 600;
        }
        .nova-drawer-extra-row:active { background: rgba(255,255,255,0.06); }

        /* 3. Call History List inside Calls Tab */
        .call-log-item {
            display: flex; align-items: center; gap: 12px; padding: 11px 12px;
            background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
            border-radius: 14px; margin-bottom: 8px;
        }
        body.light-mode .call-log-item { background: #f8fafc; border-color: rgba(15,23,42,0.08); }
        .call-log-ava {
            width: 42px; height: 42px; border-radius: 50%; background: rgba(16,185,129,0.16);
            color: #10b981; display: flex; align-items: center; justify-content: center;
            font-weight: 800; font-size: 16px; flex-shrink: 0;
        }
        .call-log-info { flex: 1; min-width: 0; }
        .call-log-name { font-size: 14.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .call-log-sub { font-size: 11.5px; color: #94a3b8; margin-top: 2px; display: flex; align-items: center; gap: 4px; }
        .call-back-btn {
            width: 36px; height: 36px; border-radius: 50%; border: none;
            background: rgba(16,185,129,0.18); color: #10b981; cursor: pointer;
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }

        /* 4. Watch Together Modal */
        #watch-together-modal {
            position: fixed; inset: 0; background: rgba(0,0,0,0.86); z-index: 9997;
            display: none; flex-direction: column; padding: 14px;
        }
        #watch-together-modal.open { display: flex; }
        .wt-card {
            margin: auto; width: 100%; max-width: 520px; background: #0f172a;
            border: 1px solid rgba(255,255,255,0.14); border-radius: 18px;
            padding: 14px; color: #f8fafc; display: flex; flex-direction: column; gap: 10px;
        }
        .wt-head { display: flex; align-items: center; justify-content: space-between; }
        .wt-row { display: flex; gap: 8px; }
        .wt-inp {
            flex: 1; padding: 9px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.18);
            background: rgba(0,0,0,0.3); color: #fff; font-size: 13px; outline: none;
        }
        .wt-btn {
            padding: 9px 14px; border-radius: 10px; border: none; background: #10b981;
            color: #052e16; font-weight: 800; font-size: 13px; cursor: pointer;
        }
        #wt-player-box {
            width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 12px;
            overflow: hidden; display: flex; align-items: center; justify-content: center;
        }
        #wt-player-box video, #wt-player-box iframe { width: 100%; height: 100%; border: none; }

        /* 5. Floating Screen Share Button (During Video Call) */
        #call-screen-share-fab {
            position: fixed; bottom: 95px; right: 16px; z-index: 9997;
            padding: 8px 13px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.25);
            background: rgba(15,23,42,0.85); color: #fff; font-size: 12.5px; font-weight: 700;
            display: none; align-items: center; gap: 5px; cursor: pointer;
        }
        #call-screen-share-fab.sharing { background: #ef4444; border-color: #ef4444; }
    `;
    document.head.appendChild(st);

    // ========================================================================
    // A. IN-CHAT MESSAGE SEARCH (TRIGGERED FROM INSIDE CONTACT INFO DRAWER)
    // ========================================================================
    const chatView = $('chat-view');
    const msgsBox = $('msgs-container');
    if (chatView && msgsBox && !document.getElementById('nova-chat-search-bar')) {
        const sBar = document.createElement('div');
        sBar.id = 'nova-chat-search-bar';
        sBar.innerHTML = `
            <input type="text" id="nova-chat-search-inp" placeholder="Search in this chat..." />
            <span id="ncs-count" style="font-size:11.5px; color:#94a3b8; white-space:nowrap;">0/0</span>
            <button type="button" class="ncs-btn" id="ncs-prev" title="Previous">↑</button>
            <button type="button" class="ncs-btn" id="ncs-next" title="Next">↓</button>
            <button type="button" class="ncs-btn" id="ncs-close" title="Close">✕</button>
        `;
        chatView.insertBefore(sBar, msgsBox);
    }

    let searchHits = [];
    let searchIdx = -1;

    function clearSearchHighlights() {
        document.querySelectorAll('.msg-wrap.search-hit').forEach(el => el.classList.remove('search-hit'));
    }

    function jumpToHit(idx) {
        clearSearchHighlights();
        if (!searchHits.length) {
            if ($('ncs-count')) $('ncs-count').innerText = '0/0';
            return;
        }
        searchIdx = (idx + searchHits.length) % searchHits.length;
        if ($('ncs-count')) $('ncs-count').innerText = `${searchIdx + 1}/${searchHits.length}`;
        const msgId = searchHits[searchIdx];
        const el = document.querySelector(`.msg-wrap[data-msg-id="${msgId}"]`);
        if (el) {
            el.classList.add('search-hit');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function runChatSearch() {
        const q = ($('nova-chat-search-inp')?.value || '').trim().toLowerCase();
        searchHits = [];
        if (!q || !state.currentRoom) {
            clearSearchHighlights();
            if ($('ncs-count')) $('ncs-count').innerText = '0/0';
            return;
        }
        const encKey = localStorage.getItem(`nova_enc_${state.currentRoom}`) || "";
        document.querySelectorAll('.msg-wrap[data-msg-id]').forEach(el => {
            const id = el.getAttribute('data-msg-id');
            const m = state.cachedMessages[id];
            if (!m || m.isDeletedEveryone) return;
            const txt = (m.type === 'text' ? decryptText(m.text, encKey) : (m.text || '')).toLowerCase();
            if (txt.includes(q)) searchHits.push(id);
        });
        if (searchHits.length > 0) jumpToHit(searchHits.length - 1);
        else {
            clearSearchHighlights();
            if ($('ncs-count')) $('ncs-count').innerText = '0/0';
        }
    }

    if ($('nova-chat-search-inp')) $('nova-chat-search-inp').addEventListener('input', runChatSearch);
    bindClick('ncs-prev', () => jumpToHit(searchIdx - 1));
    bindClick('ncs-next', () => jumpToHit(searchIdx + 1));
    bindClick('ncs-close', () => {
        $('nova-chat-search-bar')?.classList.remove('open');
        if ($('nova-chat-search-inp')) $('nova-chat-search-inp').value = '';
        clearSearchHighlights();
    });

    // Inject "Search in Chat" & "Watch Together" inside Contact Info Drawer
    const drawer = $('contact-info-drawer');
    if (drawer && !document.getElementById('di-search-chat')) {
        const anchor = $('di-media') || drawer.querySelector('.drawer-item');
        const parent = anchor ? anchor.parentElement : drawer;

        const searchRow = document.createElement('div');
        searchRow.id = 'di-search-chat';
        searchRow.className = 'nova-drawer-extra-row';
        searchRow.innerHTML = `<span class="material-icons" style="color:#38bdf8;">search</span><span>Search in Chat</span>`;
        searchRow.onclick = () => {
            closeLayer(drawer);
            $('nova-chat-search-bar')?.classList.add('open');
            setTimeout(() => $('nova-chat-search-inp')?.focus(), 100);
        };

        const wtRow = document.createElement('div');
        wtRow.id = 'di-watch-together';
        wtRow.className = 'nova-drawer-extra-row';
        wtRow.innerHTML = `<span class="material-icons" style="color:#10b981;">smart_display</span><span>Watch Together (Synced Video)</span>`;
        wtRow.onclick = () => {
            closeLayer(drawer);
            openWatchTogether();
        };

        if (anchor && parent) {
            parent.insertBefore(searchRow, anchor);
            parent.insertBefore(wtRow, anchor);
        } else {
            drawer.appendChild(searchRow);
            drawer.appendChild(wtRow);
        }
    }

    // ========================================================================
    // B. LIVE CALL HISTORY (POPULATES THE "CALLS" TAB)
    // ========================================================================
    async function logCallEvent(callType, direction = 'outgoing') {
        if (!state.myAccountCode || !state.currentRoom) return;
        const meta = getRoomMeta(state.currentRoom);
        try {
            await addDoc(collection(db, "novahub_call_logs"), {
                ownerCode: state.myAccountCode,
                roomId: state.currentRoom,
                peerName: meta.name || 'Friend',
                peerCode: meta.peerCode || '',
                callType, // 'voice' | 'video'
                direction, // 'outgoing' | 'incoming'
                timeStr: getShortTime(new Date()),
                dateStr: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                createdAtMs: Date.now(),
                timestamp: serverTimestamp()
            });
        } catch (e) {}
    }

    // Hook existing Voice/Video call buttons to auto-log outgoing calls
    $('btn-voice-call')?.addEventListener('click', () => logCallEvent('voice', 'outgoing'));
    $('btn-video-call')?.addEventListener('click', () => logCallEvent('video', 'outgoing'));
    $('btn-accept-call')?.addEventListener('click', () => logCallEvent('video', 'incoming'));

    let unsubCallLogs = null;
    function startCallHistoryListener() {
        if (!state.myAccountCode || unsubCallLogs) return;
        const q = query(collection(db, "novahub_call_logs"), orderBy("createdAtMs", "desc"), limitToLast(30));
        unsubCallLogs = onSnapshot(q, (snap) => {
            const tab = $('wa-calls-tab');
            if (!tab) return;
            const logs = [];
            snap.forEach(d => {
                const c = d.data();
                if (String(c.ownerCode) === String(state.myAccountCode)) {
                    logs.push({ id: d.id, ...c });
                }
            });
            logs.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

            if (logs.length === 0) {
                tab.innerHTML = `
                    <div class="wa-you-card" style="text-align:center; padding:28px 16px;">
                        <span class="material-icons" style="font-size:40px; color:#10b981; margin-bottom:8px;">call</span>
                        <div style="font-size:15px; font-weight:700; margin-bottom:4px;">No Calls Yet</div>
                        <div style="font-size:12.5px; color:#94a3b8;">Your voice & video call history will appear here.</div>
                    </div>`;
                return;
            }

            let html = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding:0 4px;">
                <span style="font-size:12px; color:#94a3b8; font-weight:700;">RECENT CALLS (${logs.length})</span>
                <button type="button" id="btn-clear-call-logs" style="background:none; border:none; color:#f87171; font-size:12px; font-weight:700; cursor:pointer;">Clear All</button>
            </div>`;

            logs.forEach(c => {
                const arrow = c.direction === 'incoming' ? '↙ Incoming' : '↗ Outgoing';
                const ico = c.callType === 'video' ? 'videocam' : 'call';
                html += `
                    <div class="call-log-item">
                        <div class="call-log-ava">${escapeHtml((c.peerName || 'F').charAt(0).toUpperCase())}</div>
                        <div class="call-log-info">
                            <div class="call-log-name">${escapeHtml(c.peerName)}</div>
                            <div class="call-log-sub">
                                <span style="color:${c.direction === 'incoming' ? '#38bdf8' : '#10b981'};">${arrow}</span>
                                <span>• ${escapeHtml(c.dateStr || '')}, ${escapeHtml(c.timeStr || '')}</span>
                            </div>
                        </div>
                        <button type="button" class="call-back-btn" data-room="${escapeHtml(c.roomId)}" data-type="${c.callType}" title="Call Back">
                            <span class="material-icons" style="font-size:19px;">${ico}</span>
                        </button>
                    </div>`;
            });
            tab.innerHTML = html;

            tab.querySelectorAll('.call-back-btn').forEach(btn => {
                btn.onclick = () => {
                    const rId = btn.getAttribute('data-room');
                    const cType = btn.getAttribute('data-type');
                    if (hooks.selectRoom && rId) {
                        hooks.selectRoom(rId, true);
                        setTimeout(() => {
                            if (cType === 'video') $('btn-video-call')?.click();
                            else $('btn-voice-call')?.click();
                        }, 300);
                    }
                };
            });

            bindClick('btn-clear-call-logs', async () => {
                if (!confirm("Clear all call history?")) return;
                for (const c of logs) {
                    await deleteDoc(doc(db, "novahub_call_logs", c.id)).catch(() => {});
                }
                showQuickToast("🗑️ Call history cleared");
            });
        });
    }
    setInterval(startCallHistoryListener, 2500);

    // ========================================================================
    // C. WATCH TOGETHER (SYNCED YOUTUBE / MP4 PLAYER)
    // ========================================================================
    const wtModal = document.createElement('div');
    wtModal.id = 'watch-together-modal';
    wtModal.innerHTML = `
        <div class="wt-card">
            <div class="wt-head">
                <div style="font-size:15.5px; font-weight:800;">🎬 Watch Together</div>
                <button type="button" class="ncs-btn" id="wt-close-btn">✕</button>
            </div>
            <div class="wt-row">
                <input type="text" id="wt-url-inp" class="wt-inp" placeholder="Paste YouTube or .mp4 video link..." />
                <button type="button" class="wt-btn" id="wt-load-btn">Load</button>
            </div>
            <div id="wt-player-box">
                <div style="color:#94a3b8; font-size:12.5px; text-align:center; padding:16px;">Paste a YouTube or MP4 link to watch in sync with your friend.</div>
            </div>
            <div id="wt-status" style="font-size:11.5px; color:#94a3b8; text-align:center;">Synced via Cloud</div>
        </div>
    `;
    document.body.appendChild(wtModal);

    let unsubWT = null;
    let currentWtUrl = "";

    function extractYouTubeId(url) {
        const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
        return m ? m[1] : null;
    }

    function renderWatchPlayer(url, playing, seekTime) {
        const box = $('wt-player-box');
        if (!box || !url) return;
        const ytId = extractYouTubeId(url);
        if (ytId) {
            if (currentWtUrl !== url) {
                currentWtUrl = url;
                box.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytId}?autoplay=1&playsinline=1" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`;
            }
            return;
        }
        let vid = box.querySelector('video');
        if (!vid || currentWtUrl !== url) {
            currentWtUrl = url;
            box.innerHTML = `<video controls playsinline webkit-playsinline src="${escapeHtml(url)}"></video>`;
            vid = box.querySelector('video');
            const syncState = () => {
                if (!state.currentRoom) return;
                setDoc(doc(db, "novahub_watch_together", state.currentRoom), {
                    url: currentWtUrl, playing: !vid.paused, time: vid.currentTime || 0,
                    updatedBy: state.myAccountCode, updatedAt: Date.now()
                }, { merge: true }).catch(() => {});
            };
            vid.onplay = syncState;
            vid.onpause = syncState;
            vid.onseeked = syncState;
        }
        if (vid && typeof seekTime === 'number' && Math.abs((vid.currentTime || 0) - seekTime) > 2) {
            vid.currentTime = seekTime;
        }
        if (vid) {
            if (playing && vid.paused) vid.play().catch(() => {});
            else if (!playing && !vid.paused) vid.pause();
        }
    }

    function openWatchTogether() {
        if (!state.currentRoom) return showQuickToast("Select a friend first!");
        wtModal.classList.add('open');
        if (unsubWT) unsubWT();
        unsubWT = onSnapshot(doc(db, "novahub_watch_together", state.currentRoom), (snap) => {
            if (!snap.exists()) return;
            const d = snap.data();
            if (d.url) {
                if ($('wt-url-inp') && !$('wt-url-inp').value) $('wt-url-inp').value = d.url;
                renderWatchPlayer(d.url, !!d.playing, d.time || 0);
                if ($('wt-status')) $('wt-status').innerText = `Synced • Updated by ${d.updatedBy === state.myAccountCode ? 'You' : 'Friend'}`;
            }
        });
    }

    bindClick('wt-close-btn', () => {
        wtModal.classList.remove('open');
        if (unsubWT) { unsubWT(); unsubWT = null; }
        currentWtUrl = "";
        if ($('wt-player-box')) $('wt-player-box').innerHTML = '';
    });

    bindClick('wt-load-btn', async () => {
        const url = ($('wt-url-inp')?.value || '').trim();
        if (!url || !state.currentRoom) return;
        await setDoc(doc(db, "novahub_watch_together", state.currentRoom), {
            url, playing: true, time: 0, updatedBy: state.myAccountCode, updatedAt: Date.now()
        }, { merge: true }).catch(() => {});
    });

    // ========================================================================
    // D. SCREEN SHARE BUTTON (DURING ACTIVE VIDEO CALL)
    // ========================================================================
    const ssFab = document.createElement('button');
    ssFab.id = 'call-screen-share-fab';
    ssFab.type = 'button';
    ssFab.innerHTML = '🖥️ Share';
    document.body.appendChild(ssFab);

    let screenStream = null;
    let camOrigTrack = null;

    ssFab.addEventListener('click', async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            return showQuickToast("⚠️ Screen share is not supported on this mobile browser. Use Watch Together!");
        }
        const pc = window._novaActivePC || null;
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
            ssFab.classList.remove('sharing');
            ssFab.innerHTML = '🖥️ Share';
            if (pc && camOrigTrack) {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(camOrigTrack).catch(() => {});
            }
            showQuickToast("📹 Back to Camera");
            return;
        }
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const sTrack = screenStream.getVideoTracks()[0];
            if (pc && sTrack) {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    camOrigTrack = sender.track;
                    await sender.replaceTrack(sTrack);
                }
            }
            ssFab.classList.add('sharing');
            ssFab.innerHTML = '⏹ Stop Share';
            sTrack.onended = () => ssFab.click();
        } catch (e) {
            showQuickToast("⚠️ Screen share cancelled.");
        }
    });

    setInterval(() => {
        const callFilterVisible = $('call-filter-fab') && $('call-filter-fab').style.display === 'flex';
        ssFab.style.display = callFilterVisible ? 'flex' : 'none';
    }, 1000);
}

initNovaExtras();

// ============================================================================
// NOVAMESSENGER MODULE 6: PREMIUM WHATSAPP UI, iOS KEYBOARD LOCK & SWIPE REPLY
// ============================================================================
import { state, $, bindClick, decryptText, showQuickToast } from "./chat-shared.js";

function initPremiumChatUI() {
    if (document.getElementById('nova-premium-ui-styles')) return;

    const st = document.createElement('style');
    st.id = 'nova-premium-ui-styles';
    st.textContent = `
        /* 1. Lock Chat Header & Viewport cleanly when iOS/Android Keyboard Opens */
        #chat-view.open {
            position: fixed !important;
            left: 0 !important;
            right: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            background: #0b141a !important;
        }
        body.light-mode #chat-view.open { background: #efeae2 !important; }
        #chat-view.open > header,
        #chat-view.open .chat-header {
            flex-shrink: 0 !important;
            z-index: 40 !important;
            background: rgba(17, 27, 33, 0.94) !important;
            backdrop-filter: blur(16px) !important;
            -webkit-backdrop-filter: blur(16px) !important;
            border-bottom: 1px solid rgba(255,255,255,0.06) !important;
        }
        body.light-mode #chat-view.open > header,
        body.light-mode #chat-view.open .chat-header {
            background: rgba(255, 255, 255, 0.94) !important;
            border-bottom-color: rgba(15,23,42,0.08) !important;
        }
        #chat-view.open #msgs-container {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            overscroll-behavior: contain !important;
        }

        /* 2. Hide cluttered old buttons (kept in DOM so all listeners work 100%) */
        #btn-attach, #btn-share-location, #btn-vo-toggle, #btn-snap-cam,
        #btn-emoji, #btn-vn-rec, #btn-send-msg {
            display: none !important;
        }

        /* 3. Premium WhatsApp-Style Bottom Input Bar */
        .nova-prem-bar {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            padding: 8px 10px max(10px, env(safe-area-inset-bottom, 10px)) !important;
            background: rgba(17, 27, 33, 0.96) !important;
            backdrop-filter: blur(14px) !important;
            -webkit-backdrop-filter: blur(14px) !important;
            border-top: 1px solid rgba(255,255,255,0.06) !important;
            flex-shrink: 0 !important;
            position: relative !important;
            z-index: 45 !important;
        }
        body.light-mode .nova-prem-bar {
            background: rgba(246, 246, 246, 0.96) !important;
            border-top-color: rgba(15,23,42,0.08) !important;
        }

        #prem-plus-btn {
            width: 36px; height: 36px; border-radius: 50%; border: none;
            background: transparent; color: #e9edef; font-size: 28px; font-weight: 300;
            display: flex; align-items: center; justify-content: center; cursor: pointer;
            flex-shrink: 0; transition: transform 0.22s ease, background 0.2s;
            position: relative;
        }
        body.light-mode #prem-plus-btn { color: #0f172a; }
        #prem-plus-btn.open { transform: rotate(45deg); background: rgba(255,255,255,0.08); }
        #prem-plus-dot {
            position: absolute; top: 5px; right: 5px; width: 7px; height: 7px;
            border-radius: 50%; background: #10b981; display: none;
            box-shadow: 0 0 6px #10b981;
        }

        .prem-pill-wrap {
            flex: 1; display: flex; align-items: center; gap: 6px;
            background: #202c33; border: 1px solid rgba(255,255,255,0.07);
            border-radius: 22px; padding: 2px 8px 2px 14px; min-height: 40px;
        }
        body.light-mode .prem-pill-wrap {
            background: #ffffff; border-color: rgba(15,23,42,0.12);
        }
        .prem-pill-wrap #msg-input {
            flex: 1 !important; border: none !important; outline: none !important;
            background: transparent !important; padding: 8px 0 !important;
            margin: 0 !important; font-size: 15px !important; color: #e9edef !important;
            min-width: 0 !important; box-shadow: none !important;
        }
        body.light-mode .prem-pill-wrap #msg-input { color: #0f172a !important; }

        #prem-emoji-btn {
            width: 30px; height: 30px; border-radius: 50%; border: none;
            background: transparent; color: #8696a0; cursor: pointer;
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        #prem-cam-btn {
            width: 36px; height: 36px; border-radius: 50%; border: none;
            background: transparent; color: #e9edef; cursor: pointer;
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        body.light-mode #prem-cam-btn { color: #0f172a; }

        #prem-action-btn {
            width: 40px; height: 40px; border-radius: 50%; border: none;
            background: #00a884; color: #0b141a; cursor: pointer;
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
            box-shadow: 0 3px 10px rgba(0,168,132,0.35);
            transition: transform 0.14s ease, background 0.2s ease;
        }
        #prem-action-btn:active { transform: scale(0.92); }
        #prem-action-btn.recording {
            background: #ef4444; color: #fff;
            box-shadow: 0 0 0 6px rgba(239,68,68,0.25);
        }

        /* 4. Frosted Glass "+" Attachment Sheet */
        #prem-plus-backdrop {
            position: fixed; inset: 0; background: rgba(0,0,0,0.45);
            z-index: 9990; display: none;
        }
        #prem-plus-backdrop.open { display: block; }
        #prem-plus-sheet {
            position: fixed; left: 12px; right: 12px; bottom: 72px; z-index: 9991;
            background: rgba(20, 30, 38, 0.92);
            backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 22px; padding: 16px 12px;
            box-shadow: 0 18px 45px rgba(0,0,0,0.55);
            display: none; grid-template-columns: repeat(4, 1fr); gap: 10px;
            animation: premPopUp 0.18s ease-out;
        }
        body.light-mode #prem-plus-sheet {
            background: rgba(255, 255, 255, 0.95); border-color: rgba(15,23,42,0.1);
            color: #0f172a;
        }
        #prem-plus-sheet.open { display: grid; }
        @keyframes premPopUp {
            from { opacity: 0; transform: translateY(14px) scale(0.96); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .prem-sheet-item {
            display: flex; flex-direction: column; align-items: center; gap: 7px;
            background: none; border: none; color: #e2e8f0; cursor: pointer; padding: 6px 2px;
        }
        body.light-mode .prem-sheet-item { color: #1e293b; }
        .prem-sheet-ico {
            width: 52px; height: 52px; border-radius: 16px;
            display: flex; align-items: center; justify-content: center;
            color: #fff; font-size: 24px; position: relative;
            box-shadow: 0 6px 14px rgba(0,0,0,0.28);
        }
        .prem-sheet-item:active .prem-sheet-ico { transform: scale(0.92); }
        .prem-sheet-lbl { font-size: 11.5px; font-weight: 600; text-align: center; }
        .prem-sheet-badge {
            position: absolute; top: -4px; right: -4px; font-size: 9px; font-weight: 800;
            padding: 2px 5px; border-radius: 999px; background: #10b981; color: #052e16;
            display: none;
        }

        /* 5. Swipe-to-Reply Visual Cue */
        .msg-wrap { position: relative; touch-action: pan-y; }
        .msg-wrap .msg-bubble { transition: transform 0.18s ease-out; will-change: transform; }
        .msg-wrap.swiping .msg-bubble { transition: none; }
        .swipe-reply-ico {
            position: absolute; left: -34px; top: 50%; transform: translateY(-50%) scale(0.6);
            width: 28px; height: 28px; border-radius: 50%;
            background: rgba(0,168,132,0.22); color: #00a884;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; pointer-events: none; transition: opacity 0.12s, transform 0.12s;
        }
    `;
    document.head.appendChild(st);

    // ========================================================================
    // A. FIX iOS / ANDROID KEYBOARD VIEWPORT (KEEPS TOP HEADER 100% VISIBLE)
    // ========================================================================
    function syncKeyboardViewport() {
        const cv = $('chat-view');
        if (!cv || !cv.classList.contains('open')) return;
        const vv = window.visualViewport;
        if (vv) {
            cv.style.top = `${Math.max(0, Math.round(vv.offsetTop))}px`;
            cv.style.height = `${Math.round(vv.height)}px`;
            cv.style.maxHeight = `${Math.round(vv.height)}px`;
        } else {
            cv.style.top = '0px';
            cv.style.height = '100dvh';
        }
    }

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            syncKeyboardViewport();
            const box = $('msgs-container');
            if (box) setTimeout(() => { box.scrollTop = box.scrollHeight; }, 40);
        });
        window.visualViewport.addEventListener('scroll', syncKeyboardViewport);
    }
    window.addEventListener('resize', syncKeyboardViewport);

    const chatViewEl = $('chat-view');
    if (chatViewEl) {
        new MutationObserver(() => {
            if (chatViewEl.classList.contains('open')) {
                syncKeyboardViewport();
            } else {
                chatViewEl.style.top = '';
                chatViewEl.style.height = '';
                chatViewEl.style.maxHeight = '';
            }
        }).observe(chatViewEl, { attributes: true, attributeFilter: ['class'] });
    }

    // ========================================================================
    // B. BUILD PREMIUM WHATSAPP BOTTOM BAR & "+" ATTACHMENT SHEET
    // ========================================================================
    const inp = $('msg-input');
    if (inp && inp.parentElement && !document.getElementById('prem-plus-btn')) {
        const bar = inp.parentElement;
        bar.classList.add('nova-prem-bar');

        // 1. Plus Button
        const plusBtn = document.createElement('button');
        plusBtn.id = 'prem-plus-btn';
        plusBtn.type = 'button';
        plusBtn.title = 'Attach';
        plusBtn.innerHTML = '+<span id="prem-plus-dot"></span>';

        // 2. Pill Wrapper containing #msg-input + Emoji button
        const pill = document.createElement('div');
        pill.className = 'prem-pill-wrap';

        const emoBtn = document.createElement('button');
        emoBtn.id = 'prem-emoji-btn';
        emoBtn.type = 'button';
        emoBtn.title = 'Emoji';
        emoBtn.innerHTML = `<span class="material-icons" style="font-size:22px;">sentiment_satisfied_alt</span>`;

        // 3. Camera Button
        const camBtn = document.createElement('button');
        camBtn.id = 'prem-cam-btn';
        camBtn.type = 'button';
        camBtn.title = 'Snap Camera';
        camBtn.innerHTML = `<span class="material-icons" style="font-size:23px;">photo_camera</span>`;

        // 4. Smart Mic / Send Button
        const actBtn = document.createElement('button');
        actBtn.id = 'prem-action-btn';
        actBtn.type = 'button';
        actBtn.innerHTML = `<span class="material-icons" id="prem-action-ico" style="font-size:21px;">mic</span>`;

        bar.appendChild(plusBtn);
        bar.appendChild(pill);
        pill.appendChild(inp);
        pill.appendChild(emoBtn);
        bar.appendChild(camBtn);
        bar.appendChild(actBtn);

        // Backdrop & Frosted Glass "+" Sheet
        const backdrop = document.createElement('div');
        backdrop.id = 'prem-plus-backdrop';
        const sheet = document.createElement('div');
        sheet.id = 'prem-plus-sheet';
        sheet.innerHTML = `
            <button type="button" class="prem-sheet-item" id="ps-gallery">
                <div class="prem-sheet-ico" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);">
                    <span class="material-icons">photo_library</span>
                </div>
                <span class="prem-sheet-lbl">Gallery</span>
            </button>
            <button type="button" class="prem-sheet-item" id="ps-location">
                <div class="prem-sheet-ico" id="ps-loc-ico" style="background:linear-gradient(135deg,#ef4444,#dc2626);">
                    <span class="material-icons">location_on</span>
                    <span class="prem-sheet-badge" id="ps-loc-badge">LIVE</span>
                </div>
                <span class="prem-sheet-lbl">Location</span>
            </button>
            <button type="button" class="prem-sheet-item" id="ps-viewonce">
                <div class="prem-sheet-ico" id="ps-vo-ico" style="background:linear-gradient(135deg,#f59e0b,#d97706);">
                    <span class="material-icons">looks_one</span>
                    <span class="prem-sheet-badge" id="ps-vo-badge">ON</span>
                </div>
                <span class="prem-sheet-lbl">1-Time Snap</span>
            </button>
            <button type="button" class="prem-sheet-item" id="ps-watch">
                <div class="prem-sheet-ico" style="background:linear-gradient(135deg,#ec4899,#e11d48);">
                    <span class="material-icons">smart_display</span>
                </div>
                <span class="prem-sheet-lbl">Watch</span>
            </button>
        `;
        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);

        function refreshPlusIndicators() {
            const isLive = !!(state.activeLiveSessions && state.activeLiveSessions[state.currentRoom]);
            const isVO = !!($('btn-vo-toggle')?.classList.contains('active'));
            const dot = $('prem-plus-dot');
            if (dot) dot.style.display = (isLive || isVO) ? 'block' : 'none';

            const locIco = $('ps-loc-ico');
            const locBadge = $('ps-loc-badge');
            if (locIco) locIco.style.background = isLive
                ? 'linear-gradient(135deg,#10b981,#059669)'
                : 'linear-gradient(135deg,#ef4444,#dc2626)';
            if (locBadge) locBadge.style.display = isLive ? 'inline-block' : 'none';

            const voBadge = $('ps-vo-badge');
            if (voBadge) voBadge.style.display = isVO ? 'inline-block' : 'none';
        }

        function closePlusSheet() {
            sheet.classList.remove('open');
            backdrop.classList.remove('open');
            plusBtn.classList.remove('open');
        }

        plusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = !sheet.classList.contains('open');
            if (willOpen) {
                refreshPlusIndicators();
                sheet.classList.add('open');
                backdrop.classList.add('open');
                plusBtn.classList.add('open');
            } else {
                closePlusSheet();
            }
        });
        backdrop.addEventListener('click', closePlusSheet);

        bindClick('ps-gallery', () => { closePlusSheet(); $('btn-attach')?.click(); });
        bindClick('ps-location', () => { closePlusSheet(); $('btn-share-location')?.click(); });
        bindClick('ps-viewonce', () => {
            $('btn-vo-toggle')?.click();
            refreshPlusIndicators();
            const isVO = !!($('btn-vo-toggle')?.classList.contains('active'));
            showQuickToast(isVO ? '➀ 1-Time Snap ON' : '1-Time Snap OFF');
            closePlusSheet();
        });
        bindClick('ps-watch', () => { closePlusSheet(); $('di-watch-together')?.click(); });

        emoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closePlusSheet();
            $('btn-emoji')?.click();
        });
        camBtn.addEventListener('click', () => {
            closePlusSheet();
            $('btn-snap-cam')?.click();
        });

        // Smart Mic <-> Send Toggle
        function updateActionButton() {
            const hasText = (inp.value || '').trim().length > 0;
            const isRec = !!($('btn-vn-rec')?.classList.contains('rec'));
            const ico = $('prem-action-ico');
            if (!ico) return;
            if (isRec) {
                actBtn.classList.add('recording');
                ico.innerText = 'stop';
                camBtn.style.display = 'none';
            } else if (hasText) {
                actBtn.classList.remove('recording');
                ico.innerText = 'send';
                camBtn.style.display = 'none';
            } else {
                actBtn.classList.remove('recording');
                ico.innerText = 'mic';
                camBtn.style.display = 'flex';
            }
        }

        inp.addEventListener('input', updateActionButton);
        inp.addEventListener('focus', () => {
            closePlusSheet();
            setTimeout(syncKeyboardViewport, 120);
        });

        actBtn.addEventListener('click', () => {
            const hasText = (inp.value || '').trim().length > 0;
            const isRec = !!($('btn-vn-rec')?.classList.contains('rec'));
            if (hasText && !isRec) {
                $('btn-send-msg')?.click();
                setTimeout(updateActionButton, 30);
            } else {
                $('btn-vn-rec')?.click();
                setTimeout(updateActionButton, 80);
            }
        });

        const origVn = $('btn-vn-rec');
        if (origVn) {
            new MutationObserver(updateActionButton).observe(origVn, { attributes: true, attributeFilter: ['class'] });
        }
        setInterval(() => {
            updateActionButton();
            refreshPlusIndicators();
        }, 1200);
    }

    // ========================================================================
    // C. SWIPE-TO-REPLY (WHATSAPP STYLE RIGHT SWIPE ON ANY MESSAGE)
    // ========================================================================
    const msgsBox = $('msgs-container');
    if (msgsBox && !msgsBox.dataset.swipeReady) {
        msgsBox.dataset.swipeReady = '1';
        let startX = 0, startY = 0, activeWrap = null, activeBubble = null, activeIco = null, dx = 0, locked = false;

        msgsBox.addEventListener('touchstart', (e) => {
            const wrap = e.target.closest('.msg-wrap');
            if (!wrap) return;
            const t = e.touches[0];
            startX = t.clientX;
            startY = t.clientY;
            activeWrap = wrap;
            activeBubble = wrap.querySelector('.msg-bubble');
            dx = 0;
            locked = false;
        }, { passive: true });

        msgsBox.addEventListener('touchmove', (e) => {
            if (!activeWrap || !activeBubble) return;
            const t = e.touches[0];
            const moveX = t.clientX - startX;
            const moveY = t.clientY - startY;

            if (!locked) {
                if (Math.abs(moveY) > 12) { activeWrap = null; return; }
                if (moveX > 12 && moveX > Math.abs(moveY)) {
                    locked = true;
                    activeWrap.classList.add('swiping');
                    activeIco = activeWrap.querySelector('.swipe-reply-ico');
                    if (!activeIco) {
                        activeIco = document.createElement('div');
                        activeIco.className = 'swipe-reply-ico';
                        activeIco.innerHTML = `<span class="material-icons" style="font-size:17px;">reply</span>`;
                        activeWrap.appendChild(activeIco);
                    }
                } else {
                    return;
                }
            }

            dx = Math.max(0, Math.min(68, moveX));
            activeBubble.style.transform = `translateX(${dx}px)`;
            if (activeIco) {
                const ratio = Math.min(1, dx / 50);
                activeIco.style.opacity = String(ratio);
                activeIco.style.left = `${Math.min(8, dx - 30)}px`;
                activeIco.style.transform = `translateY(-50%) scale(${0.6 + ratio * 0.45})`;
            }
        }, { passive: true });

        msgsBox.addEventListener('touchend', () => {
            if (!activeWrap || !activeBubble) return;
            const triggered = dx >= 48;
            const msgId = activeWrap.dataset.msgId;

            activeWrap.classList.remove('swiping');
            activeBubble.style.transform = 'translateX(0)';
            if (activeIco) activeIco.style.opacity = '0';

            if (triggered && msgId && state.cachedMessages && state.cachedMessages[msgId]) {
                if (navigator.vibrate) { try { navigator.vibrate(16); } catch (e) {} }
                const m = state.cachedMessages[msgId];
                const encKey = localStorage.getItem(`nova_enc_${state.currentRoom}`) || "";
                const dec = (m.type === 'text') ? decryptText(m.text, encKey) : (m.text || m.type || 'Media');
                state.replyTarget = { name: m.name || 'Friend', text: dec };
                if ($('reply-title')) $('reply-title').innerText = `Replying to ${m.name || 'Friend'}`;
                if ($('reply-text')) $('reply-text').innerText = dec;
                if ($('reply-bar')) $('reply-bar').style.display = 'flex';
                $('msg-input')?.focus();
            }

            activeWrap = null;
            activeBubble = null;
            activeIco = null;
            dx = 0;
            locked = false;
        });
    }
}

initPremiumChatUI();

// ============================================================================
// NOVAMESSENGER MODULE 6: FUTURISTIC PREMIUM UI, iOS KEYBOARD FIX & GESTURES
// ============================================================================
import {
    db, state, $, bindClick, decryptText, showQuickToast, doc, updateDoc
} from "./chat-shared.js";

function initPremiumChatUI() {
    if (document.getElementById('nova-premium-ui-styles')) return;

    const st = document.createElement('style');
    st.id = 'nova-premium-ui-styles';
    st.textContent = `
        /* 1. Lock Chat View Cleanly for iOS & Android Keyboard */
        #chat-view.open {
            position: fixed !important;
            left: 0 !important;
            right: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            background: #0b141a !important;
            transition: background 0.35s ease;
        }
        body.light-mode #chat-view.open { background: #efeae2 !important; }

        /* Futuristic Ambient Themes */
        #chat-view.open.theme-aurora {
            background: radial-gradient(circle at 15% 20%, rgba(56,189,248,0.16), transparent 45%),
                        radial-gradient(circle at 85% 80%, rgba(168,85,247,0.18), transparent 48%),
                        #070b14 !important;
        }
        #chat-view.open.theme-aurora .msg-wrap.me .msg-bubble {
            background: linear-gradient(135deg, #0ea5e9, #6366f1) !important;
            box-shadow: 0 4px 16px rgba(99,102,241,0.32);
        }
        #chat-view.open.theme-cyber {
            background: radial-gradient(circle at 50% 0%, rgba(0,242,254,0.12), transparent 55%),
                        #030712 !important;
        }
        #chat-view.open.theme-cyber .msg-wrap.me .msg-bubble {
            background: linear-gradient(135deg, #06b6d4, #0284c7) !important;
            border: 1px solid rgba(56,189,248,0.45);
            box-shadow: 0 0 14px rgba(6,182,212,0.28);
        }
        #chat-view.open.theme-cyber .msg-wrap.other .msg-bubble {
            background: rgba(15,23,42,0.88) !important;
            border: 1px solid rgba(255,255,255,0.09);
        }
        #chat-view.open.theme-emerald {
            background: radial-gradient(circle at 80% 15%, rgba(16,185,129,0.16), transparent 45%),
                        #061311 !important;
        }
        #chat-view.open.theme-emerald .msg-wrap.me .msg-bubble {
            background: linear-gradient(135deg, #059669, #047857) !important;
            box-shadow: 0 4px 14px rgba(16,185,129,0.28);
        }

        /* Header Glassmorphism */
        #chat-view.open > header,
        #chat-view.open .chat-header {
            flex-shrink: 0 !important;
            z-index: 40 !important;
            background: rgba(17, 27, 33, 0.88) !important;
            backdrop-filter: blur(18px) !important;
            -webkit-backdrop-filter: blur(18px) !important;
            border-bottom: 1px solid rgba(255,255,255,0.07) !important;
        }
        body.light-mode #chat-view.open > header,
        body.light-mode #chat-view.open .chat-header {
            background: rgba(255, 255, 255, 0.92) !important;
            border-bottom-color: rgba(15,23,42,0.08) !important;
        }

        #chat-view.open #msgs-container {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            overscroll-behavior: contain !important;
            position: relative !important;
        }

        /* Smooth Spring Entrance for Messages */
        @keyframes msgPopIn {
            from { opacity: 0; transform: translateY(8px) scale(0.98); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .msg-wrap {
            position: relative;
            touch-action: pan-y;
            animation: msgPopIn 0.18s ease-out;
        }

        /* Stealth Privacy Blur Curtain */
        #chat-view.privacy-blur-on .msg-bubble {
            filter: blur(7px);
            transition: filter 0.2s ease;
        }
        #chat-view.privacy-blur-on .msg-wrap:active .msg-bubble,
        #chat-view.privacy-blur-on .msg-wrap.unblurred .msg-bubble {
            filter: blur(0px) !important;
        }

        /* Hide Cluttered Old Buttons (Kept Alive in DOM) */
        #btn-attach, #btn-share-location, #btn-vo-toggle, #btn-snap-cam,
        #btn-emoji, #btn-vn-rec, #btn-send-msg {
            display: none !important;
        }

        /* 2. Ultra-Premium WhatsApp Bottom Input Bar */
        .nova-prem-bar {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            padding: 8px 10px max(10px, env(safe-area-inset-bottom, 10px)) !important;
            background: rgba(17, 27, 33, 0.94) !important;
            backdrop-filter: blur(18px) !important;
            -webkit-backdrop-filter: blur(18px) !important;
            border-top: 1px solid rgba(255,255,255,0.07) !important;
            flex-shrink: 0 !important;
            position: relative !important;
            z-index: 45 !important;
        }
        .nova-prem-bar.kb-open {
            padding-bottom: 8px !important;
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
            background: #202c33; border: 1px solid rgba(255,255,255,0.08);
            border-radius: 22px; padding: 2px 8px 2px 14px; min-height: 40px;
        }
        body.light-mode .prem-pill-wrap {
            background: #ffffff; border-color: rgba(15,23,42,0.12);
        }
        .prem-pill-wrap #msg-input {
            flex: 1 !important; border: none !important; outline: none !important;
            background: transparent !important; padding: 8px 0 !important;
            margin: 0 !important; font-size: 16px !important; color: #e9edef !important;
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
            box-shadow: 0 3px 12px rgba(0,168,132,0.38);
            transition: transform 0.14s ease, background 0.2s ease;
        }
        #prem-action-btn:active { transform: scale(0.92); }
        #prem-action-btn.recording {
            background: #ef4444; color: #fff;
            box-shadow: 0 0 0 6px rgba(239,68,68,0.28);
        }

        /* 3. Frosted Glass "+" Attachment & Futuristic Controls Sheet */
        #prem-plus-backdrop {
            position: fixed; inset: 0; background: rgba(0,0,0,0.45);
            z-index: 9990; display: none;
        }
        #prem-plus-backdrop.open { display: block; }
        #prem-plus-sheet {
            position: fixed; left: 12px; right: 12px; bottom: 72px; z-index: 9991;
            background: rgba(15, 23, 34, 0.92);
            backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 22px; padding: 16px 12px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.6);
            display: none; flex-direction: column; gap: 14px;
            animation: premPopUp 0.18s ease-out;
        }
        body.light-mode #prem-plus-sheet {
            background: rgba(255, 255, 255, 0.96); border-color: rgba(15,23,42,0.1);
            color: #0f172a;
        }
        #prem-plus-sheet.open { display: flex; }
        @keyframes premPopUp {
            from { opacity: 0; transform: translateY(14px) scale(0.96); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .prem-sheet-grid {
            display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 8px;
        }
        .prem-sheet-item {
            display: flex; flex-direction: column; align-items: center; gap: 6px;
            background: none; border: none; color: #e2e8f0; cursor: pointer; padding: 4px 2px;
        }
        body.light-mode .prem-sheet-item { color: #1e293b; }
        .prem-sheet-ico {
            width: 50px; height: 50px; border-radius: 16px;
            display: flex; align-items: center; justify-content: center;
            color: #fff; font-size: 23px; position: relative;
            box-shadow: 0 6px 14px rgba(0,0,0,0.28);
        }
        .prem-sheet-item:active .prem-sheet-ico { transform: scale(0.92); }
        .prem-sheet-lbl { font-size: 11.5px; font-weight: 600; text-align: center; }
        .prem-sheet-badge {
            position: absolute; top: -4px; right: -4px; font-size: 9px; font-weight: 800;
            padding: 2px 5px; border-radius: 999px; background: #10b981; color: #052e16;
            display: none;
        }

        /* Theme Strip inside "+" Sheet */
        #prem-theme-strip {
            display: none; align-items: center; justify-content: space-between; gap: 6px;
            padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);
        }
        #prem-theme-strip.open { display: flex; }
        .prem-theme-pill {
            flex: 1; padding: 8px 4px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14);
            background: rgba(255,255,255,0.06); color: inherit; font-size: 11px; font-weight: 700;
            cursor: pointer; text-align: center;
        }
        .prem-theme-pill.active {
            border-color: #00f2fe; background: rgba(0,242,254,0.16); color: #38bdf8;
        }

        /* 4. Floating Scroll-to-Bottom Pill */
        #prem-scroll-down {
            position: absolute; right: 14px; bottom: 72px; z-index: 38;
            width: 38px; height: 38px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.15);
            background: rgba(15, 23, 34, 0.85); backdrop-filter: blur(12px);
            color: #e2e8f0; display: none; align-items: center; justify-content: center;
            cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,0.4);
        }
        #prem-scroll-down.show { display: flex; }

        /* 5. Swipe-to-Reply & Double-Tap Heart Burst */
        .msg-wrap .msg-bubble { transition: transform 0.18s ease-out; will-change: transform; }
        .msg-wrap.swiping .msg-bubble { transition: none; }
        .swipe-reply-ico {
            position: absolute; left: -34px; top: 50%; transform: translateY(-50%) scale(0.6);
            width: 28px; height: 28px; border-radius: 50%;
            background: rgba(0,168,132,0.22); color: #00a884;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; pointer-events: none; transition: opacity 0.12s, transform 0.12s;
        }
        @keyframes heartBurst {
            0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
            35%  { opacity: 1; transform: translate(-50%, -65%) scale(1.25); }
            100% { opacity: 0; transform: translate(-50%, -120%) scale(0.95); }
        }
        .prem-heart-burst {
            position: fixed; z-index: 9999; pointer-events: none; font-size: 36px;
            animation: heartBurst 0.65s ease-out forwards;
            filter: drop-shadow(0 0 10px rgba(239,68,68,0.6));
        }
    `;
    document.head.appendChild(st);

    // ========================================================================
    // A. ROCK-SOLID iOS & ANDROID KEYBOARD FIX (OVERRIDES !important HEIGHT)
    // ========================================================================
    const chatViewEl = $('chat-view');
    const inp = $('msg-input');
    const barEl = inp ? inp.parentElement : null;

    function syncKeyboardViewport() {
        if (!chatViewEl || !chatViewEl.classList.contains('open')) return;
        const vv = window.visualViewport;
        if (vv) {
            const h = Math.round(vv.height);
            const top = Math.max(0, Math.round(vv.offsetTop));
            const kbOpen = (window.innerHeight - vv.height) > 120;

            chatViewEl.style.setProperty('top', `${top}px`, 'important');
            chatViewEl.style.setProperty('height', `${h}px`, 'important');
            chatViewEl.style.setProperty('max-height', `${h}px`, 'important');
            chatViewEl.style.setProperty('bottom', 'auto', 'important');
            chatViewEl.style.setProperty('padding-bottom', kbOpen ? '0px' : 'env(safe-area-inset-bottom, 0px)', 'important');

            if (barEl) barEl.classList.toggle('kb-open', kbOpen);
            if (kbOpen) window.scrollTo(0, 0);
        } else {
            chatViewEl.style.setProperty('top', '0px', 'important');
            chatViewEl.style.setProperty('height', '100dvh', 'important');
            chatViewEl.style.setProperty('max-height', '100dvh', 'important');
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

    if (chatViewEl) {
        new MutationObserver(() => {
            if (chatViewEl.classList.contains('open')) {
                syncKeyboardViewport();
                setTimeout(syncKeyboardViewport, 120);
            } else {
                chatViewEl.style.removeProperty('top');
                chatViewEl.style.removeProperty('height');
                chatViewEl.style.removeProperty('max-height');
                chatViewEl.style.removeProperty('bottom');
                chatViewEl.style.removeProperty('padding-bottom');
                if (barEl) barEl.classList.remove('kb-open');
            }
        }).observe(chatViewEl, { attributes: true, attributeFilter: ['class'] });
    }

    // ========================================================================
    // B. APPLY SAVED FUTURISTIC THEME
    // ========================================================================
    let activeTheme = localStorage.getItem('nova_futuristic_theme') || 'carbon';
    function applyFuturisticTheme(t) {
        activeTheme = t;
        localStorage.setItem('nova_futuristic_theme', t);
        if (!chatViewEl) return;
        chatViewEl.classList.remove('theme-aurora', 'theme-cyber', 'theme-emerald');
        if (t !== 'carbon') chatViewEl.classList.add(`theme-${t}`);
        document.querySelectorAll('.prem-theme-pill').forEach(p => {
            p.classList.toggle('active', p.getAttribute('data-theme') === t);
        });
    }
    applyFuturisticTheme(activeTheme);

    // ========================================================================
    // C. BUILD PREMIUM WHATSAPP BOTTOM BAR & "+" FUTURISTIC SHEET
    // ========================================================================
    if (inp && barEl && !document.getElementById('prem-plus-btn')) {
        barEl.classList.add('nova-prem-bar');

        const plusBtn = document.createElement('button');
        plusBtn.id = 'prem-plus-btn';
        plusBtn.type = 'button';
        plusBtn.title = 'Attach & Tools';
        plusBtn.innerHTML = '+<span id="prem-plus-dot"></span>';

        const pill = document.createElement('div');
        pill.className = 'prem-pill-wrap';

        const emoBtn = document.createElement('button');
        emoBtn.id = 'prem-emoji-btn';
        emoBtn.type = 'button';
        emoBtn.title = 'Emoji';
        emoBtn.innerHTML = `<span class="material-icons" style="font-size:22px;">sentiment_satisfied_alt</span>`;

        const camBtn = document.createElement('button');
        camBtn.id = 'prem-cam-btn';
        camBtn.type = 'button';
        camBtn.title = 'Snap Camera';
        camBtn.innerHTML = `<span class="material-icons" style="font-size:23px;">photo_camera</span>`;

        const actBtn = document.createElement('button');
        actBtn.id = 'prem-action-btn';
        actBtn.type = 'button';
        actBtn.innerHTML = `<span class="material-icons" id="prem-action-ico" style="font-size:21px;">mic</span>`;

        barEl.appendChild(plusBtn);
        barEl.appendChild(pill);
        pill.appendChild(inp);
        pill.appendChild(emoBtn);
        barEl.appendChild(camBtn);
        barEl.appendChild(actBtn);

        // Floating Scroll-to-Bottom Pill
        if (chatViewEl && !document.getElementById('prem-scroll-down')) {
            const sdBtn = document.createElement('button');
            sdBtn.id = 'prem-scroll-down';
            sdBtn.type = 'button';
            sdBtn.innerHTML = `<span class="material-icons" style="font-size:20px;">keyboard_arrow_down</span>`;
            chatViewEl.appendChild(sdBtn);
            sdBtn.onclick = () => {
                const box = $('msgs-container');
                if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
            };
            const box = $('msgs-container');
            if (box) {
                box.addEventListener('scroll', () => {
                    const dist = box.scrollHeight - box.scrollTop - box.clientHeight;
                    sdBtn.classList.toggle('show', dist > 220);
                }, { passive: true });
            }
        }

        // Frosted Glass "+" Sheet
        const backdrop = document.createElement('div');
        backdrop.id = 'prem-plus-backdrop';
        const sheet = document.createElement('div');
        sheet.id = 'prem-plus-sheet';
        sheet.innerHTML = `
            <div class="prem-sheet-grid">
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
                    <span class="prem-sheet-lbl">Watch Together</span>
                </button>
                <button type="button" class="prem-sheet-item" id="ps-blur">
                    <div class="prem-sheet-ico" id="ps-blur-ico" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);">
                        <span class="material-icons">visibility_off</span>
                        <span class="prem-sheet-badge" id="ps-blur-badge">ON</span>
                    </div>
                    <span class="prem-sheet-lbl">Privacy Blur</span>
                </button>
                <button type="button" class="prem-sheet-item" id="ps-theme">
                    <div class="prem-sheet-ico" style="background:linear-gradient(135deg,#10b981,#14b8a6);">
                        <span class="material-icons">auto_awesome</span>
                    </div>
                    <span class="prem-sheet-lbl">Glass Themes</span>
                </button>
            </div>
            <div id="prem-theme-strip">
                <button type="button" class="prem-theme-pill" data-theme="carbon">Carbon</button>
                <button type="button" class="prem-theme-pill" data-theme="aurora">Aurora</button>
                <button type="button" class="prem-theme-pill" data-theme="cyber">Cyber</button>
                <button type="button" class="prem-theme-pill" data-theme="emerald">Emerald</button>
            </div>
        `;
        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);

        applyFuturisticTheme(activeTheme);

        let privacyBlurOn = false;

        function refreshPlusIndicators() {
            const isLive = !!(state.activeLiveSessions && state.activeLiveSessions[state.currentRoom]);
            const isVO = !!($('btn-vo-toggle')?.classList.contains('active'));
            const dot = $('prem-plus-dot');
            if (dot) dot.style.display = (isLive || isVO || privacyBlurOn) ? 'block' : 'none';

            const locIco = $('ps-loc-ico');
            const locBadge = $('ps-loc-badge');
            if (locIco) locIco.style.background = isLive
                ? 'linear-gradient(135deg,#10b981,#059669)'
                : 'linear-gradient(135deg,#ef4444,#dc2626)';
            if (locBadge) locBadge.style.display = isLive ? 'inline-block' : 'none';

            const voBadge = $('ps-vo-badge');
            if (voBadge) voBadge.style.display = isVO ? 'inline-block' : 'none';

            const blurBadge = $('ps-blur-badge');
            if (blurBadge) blurBadge.style.display = privacyBlurOn ? 'inline-block' : 'none';
        }

        function closePlusSheet() {
            sheet.classList.remove('open');
            backdrop.classList.remove('open');
            plusBtn.classList.remove('open');
            $('prem-theme-strip')?.classList.remove('open');
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
        bindClick('ps-blur', () => {
            privacyBlurOn = !privacyBlurOn;
            chatViewEl?.classList.toggle('privacy-blur-on', privacyBlurOn);
            refreshPlusIndicators();
            showQuickToast(privacyBlurOn ? '👁️ Privacy Blur ON (Hold message to view)' : '👁️ Privacy Blur OFF');
            closePlusSheet();
        });
        bindClick('ps-theme', () => {
            $('prem-theme-strip')?.classList.toggle('open');
        });
        sheet.querySelectorAll('.prem-theme-pill').forEach(p => {
            p.addEventListener('click', () => {
                applyFuturisticTheme(p.getAttribute('data-theme'));
                showQuickToast(`✨ Theme: ${p.innerText}`);
            });
        });

        emoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closePlusSheet();
            $('btn-emoji')?.click();
        });
        camBtn.addEventListener('click', () => {
            closePlusSheet();
            $('btn-snap-cam')?.click();
        });

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
            setTimeout(syncKeyboardViewport, 60);
            setTimeout(syncKeyboardViewport, 220);
            setTimeout(syncKeyboardViewport, 420);
        });
        inp.addEventListener('blur', () => {
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
    // D. SWIPE-TO-REPLY + DOUBLE-TAP ❤️ REACTION
    // ========================================================================
    const msgsBox = $('msgs-container');
    if (msgsBox && !msgsBox.dataset.gesturesReady) {
        msgsBox.dataset.gesturesReady = '1';
        let startX = 0, startY = 0, activeWrap = null, activeBubble = null, activeIco = null, dx = 0, locked = false;
        let lastTapMs = 0, lastTapId = "";

        // Double-Tap to Heart React
        msgsBox.addEventListener('touchend', async (e) => {
            if (locked || dx > 10) return;
            const wrap = e.target.closest('.msg-wrap');
            if (!wrap) return;
            const msgId = wrap.dataset.msgId;
            const now = Date.now();

            if (msgId && msgId === lastTapId && (now - lastTapMs) < 300) {
                lastTapMs = 0;
                lastTapId = "";
                const touch = e.changedTouches && e.changedTouches[0];
                const bx = touch ? touch.clientX : window.innerWidth / 2;
                const by = touch ? touch.clientY : window.innerHeight / 2;

                // Close context menu if single tap opened it
                const ov = $('msg-overlay');
                if (ov) { ov.classList.remove('open'); ov.style.display = 'none'; }

                // Floating Heart Burst
                const h = document.createElement('div');
                h.className = 'prem-heart-burst';
                h.innerText = '❤️';
                h.style.left = `${bx}px`;
                h.style.top = `${by}px`;
                document.body.appendChild(h);
                setTimeout(() => h.remove(), 700);
                if (navigator.vibrate) { try { navigator.vibrate(15); } catch (err) {} }

                // Save Heart Reaction to Firestore
                const m = state.cachedMessages && state.cachedMessages[msgId];
                if (m && state.currentRoom && state.myUid) {
                    const r = { ...(m.reactions || {}) };
                    if (r[state.myUid] === '❤️') delete r[state.myUid];
                    else r[state.myUid] = '❤️';
                    await updateDoc(doc(db, state.currentRoom, msgId), { reactions: r }).catch(() => {});
                }
            } else {
                lastTapMs = now;
                lastTapId = msgId || "";
            }
        }, { passive: true });

        // Swipe-to-Reply
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

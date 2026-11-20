// ============================================================================
// NOVAHUB UNIVERSAL CHAT BRIDGE (iOS Hit-Test Safe + Double-Tap Panic Hide)
// ============================================================================
(() => {
    if (document.getElementById('uchat-fab')) return;

    if (!document.querySelector('link[href*="Material+Icons"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
        document.head.appendChild(link);
    }

    const style = document.createElement('style');
    style.innerHTML = `
        .uchat-fab { position: fixed; bottom: 20px; right: 18px; width: 54px; height: 54px; background: linear-gradient(135deg, #00f2fe 0%, #00a884 100%); border-radius: 50%; display: flex; justify-content: center; align-items: center; box-shadow: 0 6px 20px rgba(0, 242, 254, 0.45); cursor: pointer; z-index: 9992; user-select: none; border: 1.5px solid rgba(255,255,255,0.35); touch-action: manipulation; }
        .uchat-fab:active { transform: scale(0.92); }
        .uchat-fab .material-icons { font-size: 26px; color: #04121a; }
        .uchat-fab.ringing { animation: uchatRing 0.8s infinite; background: linear-gradient(135deg, #10b981, #00f2fe); }
        @keyframes uchatRing { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }

        .uchat-badge { position: absolute; top: -4px; right: -4px; background: #ff0055; color: #fff; font-size: 11px; font-weight: 800; min-width: 21px; height: 21px; padding: 0 5px; border-radius: 50%; display: none; justify-content: center; align-items: center; border: 2px solid #090d16; font-family: sans-serif; }

        #uchat-secret-unhide-zone { position: fixed; top: 0; left: 0; width: 110px; height: 70px; z-index: 10010; background: transparent; pointer-events: none; touch-action: manipulation; }
        #uchat-secret-unhide-zone.active-panic { pointer-events: auto; }

        #uchat-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.42); z-index: 9990; display: none; touch-action: manipulation; }

        #uchat-stealth-toast { position: fixed; top: -80px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.96); border: 1.5px solid #00f2fe; color: #fff; padding: 10px 18px; border-radius: 30px; z-index: 10012; font-family: 'Segoe UI', sans-serif; font-size: 13px; display: flex; align-items: center; gap: 8px; box-shadow: 0 8px 25px rgba(0,0,0,0.85); transition: top 0.3s ease; pointer-events: none; white-space: nowrap; }
        #uchat-stealth-toast.show { top: 16px; }

        .uchat-box { position: fixed; bottom: 84px; right: 12px; width: 365px; max-width: calc(100vw - 24px); height: 540px; max-height: calc(100dvh - 105px); background: #060b13; border: 1.5px solid rgba(0, 242, 254, 0.35); border-radius: 18px; display: none; z-index: 9993; box-shadow: 0 18px 55px rgba(0,0,0,0.92); overflow: hidden; }
        .uchat-box.fullscreen-widget { top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; width: 100vw !important; max-width: 100vw !important; height: 100dvh !important; max-height: 100dvh !important; border-radius: 0 !important; border: none !important; z-index: 10008 !important; }
        #uchat-iframe { width: 100%; height: 100%; border: none; display: block; background: #060b13; overflow: hidden; }
    `;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <div id="uchat-secret-unhide-zone"></div>
        <div id="uchat-backdrop"></div>
        <div id="uchat-stealth-toast"><span class="material-icons" style="color:#00f2fe; font-size:18px;">sports_esports</span> <span id="uchat-toast-text">Game khelo **</span></div>
        <div class="uchat-fab" id="uchat-fab" title="1 Tap: Open/Close | 2 Tap: Hide Completely">
            <span class="material-icons">bolt</span>
            <div class="uchat-badge" id="uchat-badge">0</div>
        </div>
        <div class="uchat-box" id="uchat-box">
            <iframe id="uchat-iframe" src="chat.html?widget=1" scrolling="no" allow="camera; microphone; geolocation; autoplay; clipboard-read; clipboard-write; fullscreen"></iframe>
        </div>
    `;
    document.body.appendChild(wrap);

    const fab = document.getElementById('uchat-fab');
    const badge = document.getElementById('uchat-badge');
    const box = document.getElementById('uchat-box');
    const backdrop = document.getElementById('uchat-backdrop');
    const iframe = document.getElementById('uchat-iframe');
    const unhideZone = document.getElementById('uchat-secret-unhide-zone');

    let isOpen = false;
    let isPanicHidden = false;
    let unreadCount = 0;

    function notifyIframeState() {
        try {
            iframe.contentWindow.postMessage({ type: 'NOVA_WIDGET_STATE', open: isOpen, panic: isPanicHidden }, '*');
        } catch (e) {}
    }

    function setOpen(state) {
        isOpen = state;
        box.style.display = isOpen ? 'block' : 'none';
        backdrop.style.display = isOpen ? 'block' : 'none';
        if (isOpen) {
            unreadCount = 0;
            badge.style.display = 'none';
            fab.classList.remove('ringing');
        } else {
            box.classList.remove('fullscreen-widget');
        }
        notifyIframeState();
    }

    function triggerPanicHide() {
        isPanicHidden = true;
        setOpen(false);
        fab.style.display = 'none';
        unhideZone.classList.add('active-panic');
    }

    function triggerPanicUnhide() {
        if (!isPanicHidden) return;
        isPanicHidden = false;
        fab.style.display = 'flex';
        unhideZone.classList.remove('active-panic');
        notifyIframeState();
    }

    // 1 Tap = Open/Close Chat | Double Tap = Hide Lightning Button Completely
    let fabTapTimer = null;
    fab.addEventListener('click', (e) => {
        e.stopPropagation();
        if (fabTapTimer) {
            clearTimeout(fabTapTimer);
            fabTapTimer = null;
            triggerPanicHide();
        } else {
            fabTapTimer = setTimeout(() => {
                fabTapTimer = null;
                setOpen(!isOpen);
            }, 220);
        }
    });

    backdrop.addEventListener('click', () => setOpen(false));

    // Top-left 3-tap to bring back Lightning Button after Double-Tap Hide
    let unhideTaps = 0, unhideTimer = null;
    unhideZone.addEventListener('click', () => {
        unhideTaps++;
        clearTimeout(unhideTimer);
        if (unhideTaps >= 3) { unhideTaps = 0; triggerPanicUnhide(); }
        else unhideTimer = setTimeout(() => { unhideTaps = 0; }, 650);
    });

    function showToast(text) {
        if (isOpen || isPanicHidden) return;
        const toast = document.getElementById('uchat-stealth-toast');
        document.getElementById('uchat-toast-text').innerText = text;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3200);
    }

    iframe.addEventListener('load', () => notifyIframeState());

    window.addEventListener('message', (e) => {
        const d = e.data;
        if (!d || typeof d !== 'object') return;
        if (d.type === 'NOVA_CLOSE_WIDGET') setOpen(false);
        else if (d.type === 'NOVA_PANIC_HIDE') triggerPanicHide();
        else if (d.type === 'NOVA_CALL_FS') box.classList.toggle('fullscreen-widget', !!d.fullscreen);
        else if (d.type === 'NOVA_UNREAD' && !isOpen && !isPanicHidden) {
            unreadCount++;
            badge.innerText = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = 'flex';
            if (d.toastText) showToast(d.toastText);
        } else if (d.type === 'NOVA_CALL_INCOMING' && !isPanicHidden) {
            if (!isOpen) {
                fab.classList.add('ringing');
                showToast(d.toastText || 'Multiplayer lobby active! Join now ⭐️⭐️');
            }
        }
    });
})();

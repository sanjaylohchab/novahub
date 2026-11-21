// ============================================================================
// NOVAMESSENGER MODULE 4: SNAP CAMERA + 10 BEAUTY FILTERS + 480p CALL FILTERS
// ============================================================================
import {
    db, state, $, bindClick, showQuickToast, getRoomMeta,
    getShortTime, getDateGroupLabel, hooks,
    collection, addDoc, serverTimestamp
} from "./chat-shared.js";

// 10 Beauty / Color Filters + Normal + 3 Fun Lenses
const FILTERS = [
    { id: "normal",    name: "Normal",    ico: "🚫", css: "none" },
    { id: "softglow",  name: "Soft Glow", ico: "✨", css: "brightness(1.10) contrast(0.95) saturate(1.08)" },
    { id: "fair",      name: "Fair Skin", ico: "🌸", css: "brightness(1.15) contrast(1.02) saturate(0.95)" },
    { id: "peach",     name: "Peach",     ico: "🍑", css: "brightness(1.08) sepia(0.18) saturate(1.22) hue-rotate(-8deg)" },
    { id: "rosy",      name: "Rosy",      ico: "🌷", css: "brightness(1.07) saturate(1.25) hue-rotate(-14deg)" },
    { id: "golden",    name: "Golden",    ico: "☀️", css: "brightness(1.08) sepia(0.26) saturate(1.28)" },
    { id: "porcelain", name: "Porcelain", ico: "🤍", css: "brightness(1.16) contrast(0.92) saturate(0.88)" },
    { id: "vivid",     name: "Vivid",     ico: "🌈", css: "contrast(1.12) saturate(1.38) brightness(1.03)" },
    { id: "vintage",   name: "Vintage",   ico: "🎞️", css: "sepia(0.42) contrast(1.06) brightness(0.98)" },
    { id: "cool",      name: "Cool",      ico: "❄️", css: "brightness(1.05) saturate(1.08) hue-rotate(14deg)" },
    { id: "bw",        name: "B&W",       ico: "🖤", css: "grayscale(1) contrast(1.12)" },
    { id: "shades",    name: "Shades",    ico: "🕶️", css: "brightness(1.06) contrast(1.05)", overlay: "🕶️", oy: 0.42, os: 0.28 },
    { id: "cat",       name: "Cat",       ico: "🐱", css: "brightness(1.08) saturate(1.10)", overlay: "🐱", oy: 0.22, os: 0.26 },
    { id: "crown",     name: "Crown",     ico: "👑", css: "brightness(1.09) saturate(1.12)", overlay: "👑", oy: 0.16, os: 0.24 }
];

// ============================================================================
// 1. TRACK ACTIVE WEBRTC PEER CONNECTION (FOR CONDITIONAL 480p CALL FILTERS)
// ============================================================================
let activePC = null;
const NativeRTCPC = window.RTCPeerConnection;
if (NativeRTCPC && !window._novaPcPatched) {
    window._novaPcPatched = true;
    window.RTCPeerConnection = function(...args) {
        const pc = new NativeRTCPC(...args);
        activePC = pc;
        pc.addEventListener('connectionstatechange', () => {
            if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
                stopCallFilterEngine(false);
                if (activePC === pc) activePC = null;
            }
        });
        return pc;
    };
    window.RTCPeerConnection.prototype = NativeRTCPC.prototype;
}

let callOrigTrack = null;
let callFilterLoopId = null;
let callFilterStream = null;
let callActiveFilterId = "normal";

async function applyCallFilter(filterId) {
    callActiveFilterId = filterId;
    const fObj = FILTERS.find(f => f.id === filterId) || FILTERS[0];
    const localVid = document.getElementById('local-video') || document.querySelector('video[muted]');
    if (localVid) localVid.style.filter = fObj.css;

    if (!activePC) return;
    const videoSender = activePC.getSenders().find(s => s.track && s.track.kind === 'video');
    if (!videoSender) return;

    // NORMAL MODE: Restore original native quality track
    if (filterId === "normal") {
        stopCallFilterEngine(true);
        showQuickToast("📹 Normal Video Quality");
        return;
    }

    // FILTER MODE: Switch outgoing stream to smooth 480p filtered canvas
    if (!callOrigTrack) callOrigTrack = videoSender.track;

    if (callFilterLoopId) cancelAnimationFrame(callFilterLoopId);
    if (callFilterStream) {
        callFilterStream.getTracks().forEach(t => t.stop());
        callFilterStream = null;
    }

    const srcVid = document.createElement('video');
    srcVid.muted = true;
    srcVid.playsInline = true;
    srcVid.srcObject = new MediaStream([callOrigTrack]);
    await srcVid.play().catch(() => {});

    const canvas = document.createElement('canvas');
    const vw = srcVid.videoWidth || 480;
    const vh = srcVid.videoHeight || 640;
    const isPortrait = vh >= vw;
    // Cap strictly at 480p for smooth performance
    canvas.width = isPortrait ? 480 : 640;
    canvas.height = isPortrait ? 640 : 480;
    const ctx = canvas.getContext('2d');

    const drawFrame = () => {
        if (callActiveFilterId === "normal") return;
        ctx.save();
        ctx.filter = fObj.css;
        ctx.drawImage(srcVid, 0, 0, canvas.width, canvas.height);
        ctx.restore();
        if (fObj.overlay) {
            ctx.font = `${Math.round(canvas.width * fObj.os)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(fObj.overlay, canvas.width / 2, canvas.height * fObj.oy);
        }
        callFilterLoopId = requestAnimationFrame(drawFrame);
    };
    drawFrame();

    callFilterStream = canvas.captureStream(24);
    const filteredTrack = callFilterStream.getVideoTracks()[0];
    if (filteredTrack) {
        await videoSender.replaceTrack(filteredTrack).catch(() => {});
        showQuickToast(`✨ ${fObj.name} (480p)`);
    }
}

function stopCallFilterEngine(restoreTrack = true) {
    callActiveFilterId = "normal";
    if (callFilterLoopId) { cancelAnimationFrame(callFilterLoopId); callFilterLoopId = null; }
    if (restoreTrack && activePC && callOrigTrack) {
        const videoSender = activePC.getSenders().find(s => s.track && s.track.kind === 'video');
        if (videoSender) videoSender.replaceTrack(callOrigTrack).catch(() => {});
    }
    if (callFilterStream) {
        callFilterStream.getTracks().forEach(t => t.stop());
        callFilterStream = null;
    }
    if (!restoreTrack) callOrigTrack = null;
    const localVid = document.getElementById('local-video') || document.querySelector('video[muted]');
    if (localVid) localVid.style.filter = 'none';
}

// ============================================================================
// 2. SNAP CAMERA + CALL FILTER UI
// ============================================================================
function initSnapCameraAndCallFilters() {
    if (document.getElementById('nova-snap-styles')) return;

    const st = document.createElement('style');
    st.id = 'nova-snap-styles';
    st.textContent = `
        #btn-snap-cam {
            background: none; border: none; color: #38bdf8; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            padding: 6px; border-radius: 50%; flex-shrink: 0;
        }
        #nova-snap-modal {
            position: fixed; inset: 0; background: #000; z-index: 9998;
            display: none; flex-direction: column; height: 100dvh;
        }
        #nova-snap-modal.open { display: flex; }
        .snap-stage {
            position: relative; flex: 1; overflow: hidden; background: #000;
            display: flex; align-items: center; justify-content: center;
        }
        #snap-video, #snap-preview-img {
            width: 100%; height: 100%; object-fit: cover;
        }
        #snap-overlay-emoji {
            position: absolute; left: 50%; transform: translate(-50%, -50%);
            pointer-events: none; display: none; user-select: none;
        }
        .snap-top-bar {
            position: absolute; top: 12px; left: 12px; right: 12px; z-index: 5;
            display: flex; align-items: center; justify-content: space-between;
        }
        .snap-ico-btn {
            width: 40px; height: 40px; border-radius: 50%; border: none;
            background: rgba(0,0,0,0.55); color: #fff; font-size: 18px;
            display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .snap-ico-btn.active { background: #10b981; color: #052e16; }
        .snap-bottom {
            background: rgba(10,15,25,0.92); padding: 10px 0 max(14px, env(safe-area-inset-bottom, 14px));
            display: flex; flex-direction: column; gap: 12px; flex-shrink: 0;
        }
        .snap-filter-strip {
            display: flex; gap: 10px; overflow-x: auto; padding: 2px 14px;
            scrollbar-width: none; -webkit-overflow-scrolling: touch;
        }
        .snap-filter-strip::-webkit-scrollbar { display: none; }
        .snap-f-chip {
            display: flex; flex-direction: column; align-items: center; gap: 4px;
            background: none; border: none; color: #cbd5e1; cursor: pointer; flex-shrink: 0;
        }
        .snap-f-circle {
            width: 48px; height: 48px; border-radius: 50%; font-size: 20px;
            background: rgba(255,255,255,0.1); border: 2px solid transparent;
            display: flex; align-items: center; justify-content: center;
        }
        .snap-f-chip.active .snap-f-circle { border-color: #10b981; background: rgba(16,185,129,0.22); }
        .snap-f-chip span { font-size: 10.5px; font-weight: 600; }
        .snap-shutter-row {
            display: flex; align-items: center; justify-content: center; gap: 24px;
        }
        #snap-shutter-btn {
            width: 68px; height: 68px; border-radius: 50%; border: 4px solid #fff;
            background: rgba(255,255,255,0.22); cursor: pointer;
        }
        #snap-shutter-btn:active { transform: scale(0.92); background: #fff; }
        .snap-send-row {
            display: none; align-items: center; justify-content: space-around; padding: 0 16px;
        }
        .snap-act-btn {
            padding: 11px 18px; border-radius: 999px; border: none; font-size: 13.5px;
            font-weight: 700; cursor: pointer;
        }
        /* Floating Call Filter Bar */
        #call-filter-fab {
            position: fixed; bottom: 95px; left: 16px; z-index: 9997;
            padding: 8px 13px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.25);
            background: rgba(15,23,42,0.85); color: #fff; font-size: 12.5px; font-weight: 700;
            display: none; align-items: center; gap: 5px; cursor: pointer;
        }
        #call-filter-tray {
            position: fixed; bottom: 142px; left: 12px; right: 12px; z-index: 9997;
            background: rgba(15,23,42,0.92); border: 1px solid rgba(255,255,255,0.14);
            border-radius: 16px; padding: 10px 6px; display: none;
        }
    `;
    document.head.appendChild(st);

    // 1. Add Snap Camera Button to Chat Input Bar
    const locBtn = $('btn-share-location');
    if (locBtn && locBtn.parentElement && !document.getElementById('btn-snap-cam')) {
        const camBtn = document.createElement('button');
        camBtn.id = 'btn-snap-cam';
        camBtn.type = 'button';
        camBtn.title = 'Snap Camera & Beauty Filters';
        camBtn.innerHTML = `<span class="material-icons" style="font-size:22px;">photo_camera</span>`;
        locBtn.parentElement.insertBefore(camBtn, locBtn);
        camBtn.addEventListener('click', openSnapCamera);
    }

    // 2. Build Snap Camera Modal
    const modal = document.createElement('div');
    modal.id = 'nova-snap-modal';
    modal.innerHTML = `
        <div class="snap-stage">
            <div class="snap-top-bar">
                <button type="button" class="snap-ico-btn" id="snap-close-btn">✕</button>
                <div style="display:flex; gap:10px;">
                    <button type="button" class="snap-ico-btn" id="snap-vo-btn" title="1-Time Snap">➀</button>
                    <button type="button" class="snap-ico-btn" id="snap-flip-btn" title="Flip Camera">🔄</button>
                </div>
            </div>
            <video id="snap-video" autoplay playsinline muted></video>
            <img id="snap-preview-img" style="display:none;" />
            <div id="snap-overlay-emoji"></div>
        </div>
        <div class="snap-bottom">
            <div class="snap-filter-strip" id="snap-filter-strip"></div>
            <div class="snap-shutter-row" id="snap-shutter-row">
                <button type="button" id="snap-shutter-btn" title="Take Photo"></button>
            </div>
            <div class="snap-send-row" id="snap-send-row">
                <button type="button" class="snap-act-btn" id="snap-retake-btn" style="background:#334155; color:#fff;">Retake</button>
                <button type="button" class="snap-act-btn" id="snap-story-btn" style="background:#0ea5e9; color:#fff;">+ Story</button>
                <button type="button" class="snap-act-btn" id="snap-send-btn" style="background:#10b981; color:#052e16;">Send ➤</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 3. Build Live Video Call Filter Button & Tray
    const callFab = document.createElement('button');
    callFab.id = 'call-filter-fab';
    callFab.type = 'button';
    callFab.innerHTML = '✨ Filters';
    document.body.appendChild(callFab);

    const callTray = document.createElement('div');
    callTray.id = 'call-filter-tray';
    callTray.innerHTML = `<div class="snap-filter-strip" id="call-filter-strip"></div>`;
    document.body.appendChild(callTray);

    callFab.addEventListener('click', () => {
        callTray.style.display = (callTray.style.display === 'block') ? 'none' : 'block';
    });

    // Populate Filter Strips (Snap Camera + Call Tray)
    let snapStream = null;
    let facingMode = 'user';
    let activeSnapFilter = FILTERS[0];
    let snapViewOnce = false;
    let capturedDataUrl = '';

    const snapStrip = $('snap-filter-strip');
    const callStrip = $('call-filter-strip');

    FILTERS.forEach((f, idx) => {
        // Snap Camera Chip
        const c1 = document.createElement('button');
        c1.type = 'button';
        c1.className = `snap-f-chip ${idx === 0 ? 'active' : ''}`;
        c1.innerHTML = `<div class="snap-f-circle">${f.ico}</div><span>${f.name}</span>`;
        c1.onclick = () => {
            activeSnapFilter = f;
            snapStrip.querySelectorAll('.snap-f-chip').forEach(x => x.classList.remove('active'));
            c1.classList.add('active');
            applySnapPreviewStyle();
        };
        snapStrip.appendChild(c1);

        // Video Call Chip
        const c2 = document.createElement('button');
        c2.type = 'button';
        c2.className = `snap-f-chip ${idx === 0 ? 'active' : ''}`;
        c2.innerHTML = `<div class="snap-f-circle">${f.ico}</div><span>${f.name}</span>`;
        c2.onclick = () => {
            callStrip.querySelectorAll('.snap-f-chip').forEach(x => x.classList.remove('active'));
            c2.classList.add('active');
            applyCallFilter(f.id);
        };
        callStrip.appendChild(c2);
    });

    function applySnapPreviewStyle() {
        const vid = $('snap-video');
        const ov = $('snap-overlay-emoji');
        if (vid) {
            vid.style.filter = activeSnapFilter.css;
            vid.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'none';
        }
        if (ov) {
            if (activeSnapFilter.overlay) {
                ov.innerText = activeSnapFilter.overlay;
                ov.style.top = (activeSnapFilter.oy * 100) + '%';
                ov.style.fontSize = Math.round(window.innerWidth * activeSnapFilter.os) + 'px';
                ov.style.display = 'block';
            } else {
                ov.style.display = 'none';
            }
        }
    }

    async function startSnapStream() {
        if (snapStream) snapStream.getTracks().forEach(t => t.stop());
        try {
            snapStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1440 } },
                audio: false
            });
            const vid = $('snap-video');
            vid.srcObject = snapStream;
            await vid.play().catch(() => {});
            applySnapPreviewStyle();
        } catch (e) {
            showQuickToast("⚠️ Camera permission denied!");
            closeSnapCamera();
        }
    }

    function openSnapCamera() {
        if (!state.currentRoom) return showQuickToast("Please select a friend first!");
        capturedDataUrl = '';
        snapViewOnce = false;
        $('snap-vo-btn')?.classList.remove('active');
        $('snap-video').style.display = 'block';
        $('snap-preview-img').style.display = 'none';
        $('snap-shutter-row').style.display = 'flex';
        $('snap-filter-strip').style.display = 'flex';
        $('snap-send-row').style.display = 'none';
        modal.classList.add('open');
        startSnapStream();
    }

    function closeSnapCamera() {
        modal.classList.remove('open');
        if (snapStream) { snapStream.getTracks().forEach(t => t.stop()); snapStream = null; }
    }

    bindClick('snap-close-btn', closeSnapCamera);
    bindClick('snap-flip-btn', () => {
        facingMode = (facingMode === 'user') ? 'environment' : 'user';
        startSnapStream();
    });
    bindClick('snap-vo-btn', () => {
        snapViewOnce = !snapViewOnce;
        $('snap-vo-btn')?.classList.toggle('active', snapViewOnce);
        showQuickToast(snapViewOnce ? "➀ 1-Time Snap ON" : "Normal Photo Mode");
    });

    bindClick('snap-shutter-btn', () => {
        const vid = $('snap-video');
        if (!vid || !vid.videoWidth) return;
        const c = document.createElement('canvas');
        const maxW = 960;
        const scale = Math.min(1, maxW / vid.videoWidth);
        c.width = Math.round(vid.videoWidth * scale);
        c.height = Math.round(vid.videoHeight * scale);
        const ctx = c.getContext('2d');

        ctx.save();
        ctx.filter = activeSnapFilter.css;
        if (facingMode === 'user') {
            ctx.translate(c.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(vid, 0, 0, c.width, c.height);
        ctx.restore();

        if (activeSnapFilter.overlay) {
            ctx.font = `${Math.round(c.width * activeSnapFilter.os)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(activeSnapFilter.overlay, c.width / 2, c.height * activeSnapFilter.oy);
        }

        capturedDataUrl = c.toDataURL('image/jpeg', 0.82);
        $('snap-preview-img').src = capturedDataUrl;
        $('snap-video').style.display = 'none';
        $('snap-overlay-emoji').style.display = 'none';
        $('snap-preview-img').style.display = 'block';
        $('snap-shutter-row').style.display = 'none';
        $('snap-filter-strip').style.display = 'none';
        $('snap-send-row').style.display = 'flex';
    });

    bindClick('snap-retake-btn', () => {
        capturedDataUrl = '';
        $('snap-preview-img').style.display = 'none';
        $('snap-video').style.display = 'block';
        $('snap-shutter-row').style.display = 'flex';
        $('snap-filter-strip').style.display = 'flex';
        $('snap-send-row').style.display = 'none';
        applySnapPreviewStyle();
    });

    bindClick('snap-send-btn', async () => {
        if (!capturedDataUrl || !state.currentRoom) return;
        const targetRoom = state.currentRoom;
        const now = new Date(), meta = getRoomMeta(targetRoom);
        closeSnapCamera();
        try {
            await addDoc(collection(db, targetRoom), {
                type: "image", mediaUrl: capturedDataUrl, text: "📷 Snap Photo",
                originalAuditText: "📷 Snap Photo", isViewOnce: snapViewOnce, viewedBy: [],
                uid: state.myUid, accountCode: state.myAccountCode, name: state.myName,
                shortTime: getShortTime(now), dateLabel: getDateGroupLabel(now), sentAtStr: now.toLocaleString(),
                sentMs: Date.now(), vanishTimer: meta.timer || "off",
                timestamp: serverTimestamp(), seenStatus: false, manualUnseen: false,
                reactions: {}, starredBy: [], deletedFor: [], isDeletedEveryone: false
            });
            if (hooks.sendStealthPushToPeer) hooks.sendStealthPushToPeer(targetRoom, "media");
        } catch (e) {
            showQuickToast("⚠️ Failed to send snap.");
        }
    });

    bindClick('snap-story-btn', async () => {
        if (!capturedDataUrl) return;
        closeSnapCamera();
        try {
            await addDoc(collection(db, "novahub_stories"), {
                uid: state.myUid, accountCode: state.myAccountCode, name: state.myName,
                type: "image", mediaUrl: capturedDataUrl, text: "📷 Story", createdAtMs: Date.now(),
                timeStr: new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
                views: [], timestamp: serverTimestamp()
            });
            showQuickToast("✨ Added to your Story!");
        } catch (e) {
            showQuickToast("⚠️ Failed to post story.");
        }
    });

    // Show/Hide Call Filter FAB automatically when a Video Call is active
    setInterval(() => {
        const hasVideoCall = !!(activePC && activePC.getSenders().some(s => s.track && s.track.kind === 'video'));
        callFab.style.display = hasVideoCall ? 'flex' : 'none';
        if (!hasVideoCall) callTray.style.display = 'none';
    }, 1000);
}

initSnapCameraAndCallFilters();

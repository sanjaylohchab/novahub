// ============================================================================
// NOVAMESSENGER MODULE 2: WEBRTC AUDIO/VIDEO CALLS & RINGTONE (chat-calls.js)
// ============================================================================
import {
    db, RTC_CONFIG, state, hooks, $, bindClick, openLayer, closeLayer,
    isLayerOpen, postToGame, showQuickToast, ensureAudioContext, isRoomMuted,
    doc, setDoc, updateDoc, onSnapshot, collection, addDoc
} from "./chat-shared.js";

let pc = null;
let localStream = null;
let isLoud = false;
let isMuted = false;
let isFs = false;
let activeCallId = "";
let pendingIceCandidates = [];
let ringInterval = null;
let vibInterval = null;
let callTimeoutTimer = null;
let unsubscribeCall = null;
let unsubscribeRemoteIce = null;

// ============================================================================
// 1. REAL PHONE RINGTONE & VIBRATION ENGINE
// ============================================================================
function playTonePair(f1, f2, durationSec, volume = 0.16) {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try {
        const now = ctx.currentTime;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, now);
        g.gain.exponentialRampToValueAtTime(volume, now + 0.04);
        g.gain.setValueAtTime(volume, now + durationSec - 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
        g.connect(ctx.destination);

        [f1, f2].forEach(freq => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            osc.connect(g);
            osc.start(now);
            osc.stop(now + durationSec);
        });
    } catch (e) {}
}

export function startRingtone(mode = 'incoming') {
    stopRingtone();
    const playCycle = () => {
        if (mode === 'incoming') {
            playTonePair(523.25, 659.25, 0.35, 0.22);
            setTimeout(() => playTonePair(659.25, 783.99, 0.45, 0.22), 400);
            if (state.vibrationEnabled && "vibrate" in navigator) {
                try { navigator.vibrate([380, 180, 380]); } catch (e) {}
            }
        } else {
            playTonePair(440, 480, 0.9, 0.09);
        }
    };
    playCycle();
    ringInterval = setInterval(playCycle, mode === 'incoming' ? 2200 : 3200);
}

export function stopRingtone() {
    if (ringInterval) { clearInterval(ringInterval); ringInterval = null; }
    if (vibInterval) { clearInterval(vibInterval); vibInterval = null; }
    if ("vibrate" in navigator) { try { navigator.vibrate(0); } catch (e) {} }
}

export function hasActiveCall() {
    return !!(pc || localStream || ringInterval);
}

export function detachCallListener() {
    if (unsubscribeCall) { unsubscribeCall(); unsubscribeCall = null; }
    if (unsubscribeRemoteIce) { unsubscribeRemoteIce(); unsubscribeRemoteIce = null; }
}

// ============================================================================
// 2. WEBRTC CONNECTION & ICE SUBCOLLECTION HANDLING
// ============================================================================
function syncSpk() {
    const vol = isLoud ? 1.0 : 0.25;
    const remoteAud = $('remote-aud');
    const remoteVid = $('remote-vid');
    if (remoteAud) remoteAud.volume = vol;
    if (remoteVid) remoteVid.volume = vol;
    $('btn-spk-call')?.classList.toggle('loud', isLoud);
    if ($('spk-icon')) $('spk-icon').innerText = isLoud ? 'volume_up' : 'volume_down';
}

async function drainPendingIce() {
    if (!pc || !pc.remoteDescription) return;
    while (pendingIceCandidates.length > 0) {
        const cand = pendingIceCandidates.shift();
        try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
    }
}

function subscribeRemoteIce(roomId, callId, subcolName) {
    if (unsubscribeRemoteIce) unsubscribeRemoteIce();
    const colRef = collection(db, "novahub_calls", roomId, subcolName);
    unsubscribeRemoteIce = onSnapshot(colRef, (snap) => {
        snap.docChanges().forEach(async (ch) => {
            if (ch.type !== 'added') return;
            const data = ch.doc.data();
            if (!data || data.callId !== callId || !data.candidate) return;
            if (pc && pc.remoteDescription) {
                try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) {}
            } else {
                pendingIceCandidates.push(data.candidate);
            }
        });
    });
}

function createPeerConnection(roomId, callId, isVideo, localSubcolName) {
    const peer = new RTCPeerConnection(RTC_CONFIG);
    localStream.getTracks().forEach(t => peer.addTrack(t, localStream));

    const remoteVid = $('remote-vid');
    const remoteAud = $('remote-aud');
    const remoteStream = new MediaStream();
    if (isVideo) {
        if (remoteVid) remoteVid.srcObject = remoteStream;
        if (remoteAud) remoteAud.srcObject = null;
    } else {
        if (remoteAud) remoteAud.srcObject = remoteStream;
        if (remoteVid) remoteVid.srcObject = null;
    }

    peer.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach(track => remoteStream.addTrack(track));
        if (isVideo) remoteVid?.play().catch(() => {});
        else remoteAud?.play().catch(() => {});
        syncSpk();
    };

    peer.onicecandidate = (e) => {
        if (e.candidate) {
            addDoc(collection(db, "novahub_calls", roomId, localSubcolName), {
                callId,
                candidate: e.candidate.toJSON(),
                ts: Date.now()
            }).catch(() => {});
        }
    };

    peer.oniceconnectionstatechange = () => {
        if (!pc) return;
        const st = peer.iceConnectionState;
        if (st === 'connected' || st === 'completed') {
            stopRingtone();
            clearTimeout(callTimeoutTimer);
            if ($('call-status-txt')) $('call-status-txt').innerText = isVideo ? "Video Connected 🟢" : "Audio Connected 🟢";
        } else if (st === 'checking') {
            if ($('call-status-txt')) $('call-status-txt').innerText = "Connecting...";
        } else if (st === 'disconnected') {
            if ($('call-status-txt')) $('call-status-txt').innerText = "Reconnecting...";
        } else if (st === 'failed') {
            if ($('call-status-txt')) $('call-status-txt').innerText = "Network Failed";
            setTimeout(() => cleanupCall(true), 1800);
        }
    };

    return peer;
}

export async function cleanupCall(notifyCloud = true) {
    stopRingtone();
    clearTimeout(callTimeoutTimer);
    if (unsubscribeRemoteIce) { unsubscribeRemoteIce(); unsubscribeRemoteIce = null; }
    pendingIceCandidates = [];
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (pc) { try { pc.close(); } catch (e) {} }
    pc = null; localStream = null; isFs = false; isMuted = false; activeCallId = "";

    const remoteVid = $('remote-vid');
    const remoteAud = $('remote-aud');
    const localVid = $('local-vid');
    const callHud = $('call-hud');

    if (remoteVid) remoteVid.srcObject = null;
    if (remoteAud) remoteAud.srcObject = null;
    if (localVid) localVid.srcObject = null;
    if ($('btn-accept-call')) $('btn-accept-call').style.display = 'none';
    if ($('btn-mic-call')) $('btn-mic-call').classList.remove('muted');
    if ($('mic-icon')) $('mic-icon').innerText = 'mic';
    callHud?.classList.remove('fullscreen');
    closeLayer(callHud);
    postToGame({ type: 'NOVA_CALL_FS', fullscreen: false });

    if (notifyCloud && state.currentRoom) {
        await setDoc(doc(db, "novahub_calls", state.currentRoom), {
            status: "ended", updated: Date.now()
        }, { merge: true }).catch(() => {});
    }
}

export async function startCall(isVideo) {
    if (!state.currentRoom) return showQuickToast("Select a friend first!");
    ensureAudioContext();
    await cleanupCall(false);

    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    activeCallId = callId;
    openLayer($('call-hud'));
    if ($('call-vid-box')) $('call-vid-box').style.display = isVideo ? 'flex' : 'none';
    if ($('call-status-txt')) $('call-status-txt').innerText = isVideo ? "Video Ringing..." : "Audio Ringing...";
    if ($('btn-accept-call')) $('btn-accept-call').style.display = 'none';
    isLoud = isVideo;
    syncSpk();

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: isVideo ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (isVideo && $('local-vid')) $('local-vid').srcObject = localStream;
    } catch (err) {
        showQuickToast("⚠️ Mic/Camera permission needed!");
        await cleanupCall(false);
        return;
    }

    pc = createPeerConnection(state.currentRoom, callId, isVideo, "callerCandidates");
    subscribeRemoteIce(state.currentRoom, callId, "calleeCandidates");

    const cDoc = doc(db, "novahub_calls", state.currentRoom);
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: isVideo });
    await pc.setLocalDescription(offer);
    await setDoc(cDoc, {
        callId,
        offer: { type: offer.type, sdp: offer.sdp },
        answer: null,
        callerUid: state.myUid,
        callerName: state.myName,
        isVideo,
        status: "ringing",
        updated: Date.now()
    });

    startRingtone('outgoing');
    hooks.sendStealthPushToPeer?.(state.currentRoom, "call");

    clearTimeout(callTimeoutTimer);
    callTimeoutTimer = setTimeout(() => {
        if (activeCallId === callId && (!pc || pc.iceConnectionState !== 'connected')) {
            showQuickToast("📞 No answer");
            cleanupCall(true);
        }
    }, 45000);
}

export function listenToCalls(roomId) {
    if (unsubscribeCall) unsubscribeCall();
    const cDoc = doc(db, "novahub_calls", roomId);

    unsubscribeCall = onSnapshot(cDoc, async snap => {
        if (!snap.exists()) return;
        const d = snap.data();
        if (Date.now() - (d.updated || 0) > 65000) return;
        const callHud = $('call-hud');

        if (d.status === "ringing" && d.callerUid !== state.myUid) {
            if (activeCallId === d.callId && isLayerOpen(callHud)) return;
            activeCallId = d.callId || `inc_${d.updated}`;
            hooks.triggerStealthAlert?.("call", roomId);
            if (!isRoomMuted(roomId)) startRingtone('incoming');
            openLayer(callHud);
            if ($('call-vid-box')) $('call-vid-box').style.display = 'none';
            if ($('call-status-txt')) $('call-status-txt').innerText = `${d.callerName || 'Incoming'} (${d.isVideo ? 'Video' : 'Audio'})...`;

            const acc = $('btn-accept-call');
            if (acc) {
                acc.style.display = 'flex';
                acc.onclick = async () => {
                    stopRingtone();
                    acc.style.display = 'none';
                    if ($('call-vid-box')) $('call-vid-box').style.display = d.isVideo ? 'flex' : 'none';
                    if ($('call-status-txt')) $('call-status-txt').innerText = "Connecting...";
                    isLoud = d.isVideo;
                    syncSpk();
                    try {
                        localStream = await navigator.mediaDevices.getUserMedia({
                            video: d.isVideo ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
                            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
                        });
                        if (d.isVideo && $('local-vid')) $('local-vid').srcObject = localStream;
                    } catch (err) {
                        showQuickToast("⚠️ Mic/Camera permission needed!");
                        cleanupCall(true);
                        return;
                    }

                    pc = createPeerConnection(roomId, d.callId, d.isVideo, "calleeCandidates");
                    subscribeRemoteIce(roomId, d.callId, "callerCandidates");

                    await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
                    await drainPendingIce();
                    const ans = await pc.createAnswer();
                    await pc.setLocalDescription(ans);
                    await updateDoc(cDoc, {
                        answer: { type: ans.type, sdp: ans.sdp },
                        status: "connected",
                        updated: Date.now()
                    });
                };
            }
        } else if (d.status === "connected" && d.callerUid === state.myUid && d.callId === activeCallId && pc && !pc.currentRemoteDescription && d.answer) {
            stopRingtone();
            clearTimeout(callTimeoutTimer);
            if ($('call-status-txt')) $('call-status-txt').innerText = "Connecting...";
            await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
            await drainPendingIce();
        } else if (d.status === "ended") {
            if (isLayerOpen(callHud) || pc || ringInterval) cleanupCall(false);
        }
    });
}

// ============================================================================
// 3. BIND CALL HUD UI BUTTONS
// ============================================================================
export function initCallControls() {
    bindClick('btn-voice-call', (e) => { e.stopPropagation(); startCall(false); });
    bindClick('btn-video-call', (e) => { e.stopPropagation(); startCall(true); });
    bindClick('btn-end-call', () => cleanupCall(true));
    bindClick('btn-spk-call', () => { isLoud = !isLoud; syncSpk(); });
    bindClick('btn-mic-call', () => {
        if (localStream && localStream.getAudioTracks()[0]) {
            const t = localStream.getAudioTracks()[0];
            t.enabled = !t.enabled;
            isMuted = !t.enabled;
            $('btn-mic-call')?.classList.toggle('muted', isMuted);
            if ($('mic-icon')) $('mic-icon').innerText = isMuted ? 'mic_off' : 'mic';
        }
    });
    bindClick('btn-fs-vid', () => {
        isFs = !isFs;
        $('call-hud')?.classList.toggle('fullscreen', isFs);
        if ($('fs-icon')) $('fs-icon').innerText = isFs ? 'close_fullscreen' : 'fullscreen';
        postToGame({ type: 'NOVA_CALL_FS', fullscreen: isFs });
    });
    bindClick('btn-hide-vid', () => {
        const rv = $('remote-vid');
        const lv = $('local-vid');
        if (!rv || !lv) return;
        const op = rv.style.opacity === '0' ? '1' : '0';
        rv.style.opacity = op;
        lv.style.opacity = op;
    });
}

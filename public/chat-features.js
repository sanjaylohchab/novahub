// ============================================================================
// 5. SCHEME 2: 4-DIGIT MOBILE KEYPAD + BIG RETURN BUTTON + PANIC EXIT
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
            /* Bigger Return to Arcade Button on Login & Lock Screens */
            #auth-screen a[href*="index"], #auth-screen .return-btn, #btn-return-arcade-big {
                display: flex !important;
                align-items: center;
                justify-content: center;
                gap: 8px;
                width: 100%;
                padding: 13px 16px !important;
                margin-top: 14px !important;
                background: rgba(255,255,255,0.08) !important;
                border: 1px solid rgba(255,255,255,0.18) !important;
                border-radius: 12px !important;
                color: #e2e8f0 !important;
                font-size: 14px !important;
                font-weight: 700 !important;
                text-decoration: none !important;
                cursor: pointer;
                box-sizing: border-box;
            }
            #auth-screen a[href*="index"]:active, #btn-return-arcade-big:active {
                background: rgba(255,255,255,0.16) !important;
            }

            /* 4-Digit Mobile Keypad UI */
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

            /* Top Quick Panic Exit Pill inside Messenger */
            #nova-top-arcade-exit {
                position: fixed; top: 8px; right: 52px; z-index: 950;
                background: rgba(239,68,68,0.18); border: 1px solid rgba(239,68,68,0.45);
                color: #fca5a5; border-radius: 999px; padding: 5px 10px;
                font-size: 11.5px; font-weight: 700; cursor: pointer;
                display: flex; align-items: center; gap: 4px;
            }
            #nova-top-arcade-exit:active { background: rgba(239,68,68,0.38); }
        `;
        document.head.appendChild(st);
    }

    // 1. Convert App Lock Screen into 4-Digit Mobile Keypad
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

    // 2. Top Quick-Exit Button (Visible inside Messenger)
    if (!document.getElementById('nova-top-arcade-exit')) {
        const exitBtn = document.createElement('button');
        exitBtn.id = 'nova-top-arcade-exit';
        exitBtn.type = 'button';
        exitBtn.innerHTML = '🎮 Exit';
        exitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exitToArcadeNow();
        });
        document.body.appendChild(exitBtn);
    }

    // 3. Shake-to-Panic Exit (Mobile Accelerometer)
    let lastShakeMs = 0;
    window.addEventListener('devicemotion', (e) => {
        const acc = e.accelerationIncludingGravity;
        if (!acc) return;
        const force = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0);
        if (force > 34 && (Date.now() - lastShakeMs) > 1500) {
            lastShakeMs = Date.now();
            exitToArcadeNow();
        }
    });
}
initScheme2KeypadAndPanic();

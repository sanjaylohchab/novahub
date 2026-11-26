// ============================================================================
// NOVAMESSENGER THEMES MODULE: 10 PER-CHAT REAL-TIME SYNCED THEMES
// Path: public/themes/chat-themes.js
// ============================================================================
import {
    db, state, $, bindClick, showQuickToast,
    doc, setDoc, onSnapshot
} from "../chat-shared.js";

export const CHAT_THEMES = [
    {
        id: "carbon",
        name: "Midnight Carbon",
        tag: "Default",
        bgPreview: "#0b141a",
        bubblePreview: "#005c4b",
        bgCss: "#0b141a",
        meBubble: "#005c4b",
        meBorder: "transparent",
        otherBubble: "#202c33"
    },
    {
        id: "aurora",
        name: "Cyber Aurora",
        tag: "Glow",
        bgPreview: "linear-gradient(135deg, #070b14, #1e1b4b)",
        bubblePreview: "linear-gradient(135deg, #0ea5e9, #6366f1)",
        bgCss: "radial-gradient(circle at 15% 20%, rgba(56,189,248,0.18), transparent 46%), radial-gradient(circle at 85% 80%, rgba(168,85,247,0.20), transparent 48%), #070b14",
        meBubble: "linear-gradient(135deg, #0ea5e9, #6366f1)",
        meBorder: "rgba(129,140,248,0.4)",
        otherBubble: "rgba(30, 41, 59, 0.88)"
    },
    {
        id: "cyber",
        name: "Neon Obsidian",
        tag: "Futuristic",
        bgPreview: "linear-gradient(135deg, #030712, #083344)",
        bubblePreview: "linear-gradient(135deg, #06b6d4, #0284c7)",
        bgCss: "radial-gradient(circle at 50% 0%, rgba(0,242,254,0.16), transparent 55%), #030712",
        meBubble: "linear-gradient(135deg, #06b6d4, #0284c7)",
        meBorder: "rgba(56,189,248,0.5)",
        otherBubble: "rgba(15, 23, 42, 0.90)"
    },
    {
        id: "emerald",
        name: "Emerald Glass",
        tag: "Rich",
        bgPreview: "linear-gradient(135deg, #04130f, #064e3b)",
        bubblePreview: "linear-gradient(135deg, #10b981, #047857)",
        bgCss: "radial-gradient(circle at 80% 15%, rgba(16,185,129,0.18), transparent 48%), #04130f",
        meBubble: "linear-gradient(135deg, #059669, #047857)",
        meBorder: "rgba(52,211,153,0.35)",
        otherBubble: "rgba(14, 38, 32, 0.90)"
    },
    {
        id: "rose",
        name: "Rose Velvet",
        tag: "Soft",
        bgPreview: "linear-gradient(135deg, #1a0912, #4c0519)",
        bubblePreview: "linear-gradient(135deg, #ec4899, #be185d)",
        bgCss: "radial-gradient(circle at 20% 25%, rgba(236,72,153,0.18), transparent 48%), radial-gradient(circle at 80% 80%, rgba(190,24,93,0.16), transparent 50%), #14070e",
        meBubble: "linear-gradient(135deg, #db2777, #9d174d)",
        meBorder: "rgba(244,114,182,0.38)",
        otherBubble: "rgba(44, 18, 32, 0.90)"
    },
    {
        id: "gold",
        name: "Royal Gold",
        tag: "Luxury",
        bgPreview: "linear-gradient(135deg, #0f0c06, #422006)",
        bubblePreview: "linear-gradient(135deg, #d97706, #b45309)",
        bgCss: "radial-gradient(circle at 75% 20%, rgba(245,158,11,0.16), transparent 50%), #0d0a05",
        meBubble: "linear-gradient(135deg, #d97706, #92400e)",
        meBorder: "rgba(251,191,36,0.42)",
        otherBubble: "rgba(36, 28, 16, 0.92)"
    },
    {
        id: "sunset",
        name: "Sunset Vibes",
        tag: "Warm",
        bgPreview: "linear-gradient(135deg, #1b0d1f, #7c2d12)",
        bubblePreview: "linear-gradient(135deg, #f97316, #db2777)",
        bgCss: "radial-gradient(circle at 20% 15%, rgba(249,115,22,0.18), transparent 48%), radial-gradient(circle at 85% 85%, rgba(219,39,119,0.18), transparent 50%), #140a16",
        meBubble: "linear-gradient(135deg, #ea580c, #be185d)",
        meBorder: "rgba(251,146,60,0.38)",
        otherBubble: "rgba(42, 22, 38, 0.90)"
    },
    {
        id: "ocean",
        name: "Ocean Depth",
        tag: "Calm",
        bgPreview: "linear-gradient(135deg, #04131c, #0c4a6e)",
        bubblePreview: "linear-gradient(135deg, #0284c7, #0d9488)",
        bgCss: "radial-gradient(circle at 50% 85%, rgba(14,165,233,0.18), transparent 55%), #04111a",
        meBubble: "linear-gradient(135deg, #0284c7, #0f766e)",
        meBorder: "rgba(56,189,248,0.35)",
        otherBubble: "rgba(12, 34, 48, 0.90)"
    },
    {
        id: "sakura",
        name: "Sakura Night",
        tag: "Aesthetic",
        bgPreview: "linear-gradient(135deg, #161026, #581c87)",
        bubblePreview: "linear-gradient(135deg, #c084fc, #f472b6)",
        bgCss: "radial-gradient(circle at 25% 20%, rgba(244,114,182,0.17), transparent 46%), radial-gradient(circle at 80% 75%, rgba(168,85,247,0.18), transparent 48%), #120d1f",
        meBubble: "linear-gradient(135deg, #9333ea, #db2777)",
        meBorder: "rgba(232,121,249,0.38)",
        otherBubble: "rgba(35, 25, 56, 0.90)"
    },
    {
        id: "crimson",
        name: "Crimson Noir",
        tag: "Stealth",
        bgPreview: "linear-gradient(135deg, #110709, #450a0a)",
        bubblePreview: "linear-gradient(135deg, #dc2626, #991b1b)",
        bgCss: "radial-gradient(circle at 80% 15%, rgba(239,68,68,0.17), transparent 48%), #0f0708",
        meBubble: "linear-gradient(135deg, #dc2626, #991b1b)",
        meBorder: "rgba(248,113,113,0.38)",
        otherBubble: "rgba(38, 18, 22, 0.92)"
    }
];

function initSyncedChatThemes() {
    if (document.getElementById('nova-synced-themes-style')) return;

    // 1. Dynamically build CSS for all 10 themes + Theme Picker Modal
    let themeRules = '';
    CHAT_THEMES.forEach(t => {
        if (t.id === 'carbon') return;
        themeRules += `
            #chat-view.open.nt-${t.id} {
                background: ${t.bgCss} !important;
            }
            #chat-view.open.nt-${t.id} .msg-wrap.me .msg-bubble {
                background: ${t.meBubble} !important;
                border: 1px solid ${t.meBorder} !important;
                color: #ffffff !important;
            }
            #chat-view.open.nt-${t.id} .msg-wrap.other .msg-bubble {
                background: ${t.otherBubble} !important;
                border: 1px solid rgba(255,255,255,0.07) !important;
                color: #f1f5f9 !important;
            }
        `;
    });

    const st = document.createElement('style');
    st.id = 'nova-synced-themes-style';
    st.textContent = `
        /* Hide old 4-pill theme strip so new 10-theme modal takes over cleanly */
        #prem-theme-strip { display: none !important; }

        ${themeRules}

        /* Synced Theme Picker Modal */
        #nova-theme-modal {
            position: fixed; inset: 0; background: rgba(0,0,0,0.72);
            backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
            z-index: 9998; display: none; align-items: flex-end; justify-content: center;
        }
        #nova-theme-modal.open { display: flex; }
        .nt-sheet {
            width: 100%; max-width: 480px; max-height: 78dvh;
            background: rgba(15, 23, 34, 0.96);
            border-top: 1px solid rgba(255,255,255,0.14);
            border-radius: 24px 24px 0 0; padding: 16px 14px max(18px, env(safe-area-inset-bottom, 18px));
            color: #f8fafc; display: flex; flex-direction: column; gap: 12px;
            box-shadow: 0 -16px 40px rgba(0,0,0,0.65);
            animation: ntSlideUp 0.2s ease-out;
        }
        body.light-mode .nt-sheet {
            background: #ffffff; color: #0f172a; border-top-color: rgba(15,23,42,0.12);
        }
        @keyframes ntSlideUp {
            from { transform: translateY(30px); opacity: 0; }
            to   { transform: translateY(0); opacity: 1; }
        }
        .nt-head {
            display: flex; align-items: center; justify-content: space-between;
        }
        .nt-title { font-size: 16px; font-weight: 800; }
        .nt-sub { font-size: 11.5px; color: #94a3b8; margin-top: 2px; }
        .nt-close {
            width: 32px; height: 32px; border-radius: 50%; border: none;
            background: rgba(255,255,255,0.1); color: inherit; font-size: 18px; cursor: pointer;
        }
        .nt-grid {
            display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;
            overflow-y: auto; padding-right: 2px;
        }
        .nt-card {
            border-radius: 16px; border: 2px solid rgba(255,255,255,0.1);
            padding: 10px; cursor: pointer; text-align: left; color: #fff;
            display: flex; flex-direction: column; gap: 8px; position: relative;
            transition: transform 0.14s ease, border-color 0.2s;
        }
        .nt-card:active { transform: scale(0.96); }
        .nt-card.active {
            border-color: #10b981;
            box-shadow: 0 0 0 2px rgba(16,185,129,0.28);
        }
        .nt-preview-row {
            display: flex; flex-direction: column; gap: 5px; padding: 6px 0;
        }
        .nt-b-other {
            align-self: flex-start; width: 55%; height: 10px; border-radius: 8px;
            background: rgba(255,255,255,0.22);
        }
        .nt-b-me {
            align-self: flex-end; width: 64%; height: 12px; border-radius: 8px;
        }
        .nt-meta {
            display: flex; align-items: center; justify-content: space-between;
        }
        .nt-name { font-size: 12.5px; font-weight: 700; }
        .nt-tag {
            font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 999px;
            background: rgba(0,0,0,0.45); color: #e2e8f0;
        }
        .nt-check {
            position: absolute; top: 8px; right: 8px; width: 20px; height: 20px;
            border-radius: 50%; background: #10b981; color: #052e16;
            font-size: 13px; font-weight: 900; display: none;
            align-items: center; justify-content: center;
        }
        .nt-card.active .nt-check { display: flex; }
    `;
    document.head.appendChild(st);

    // 2. Create Theme Picker Modal
    const modal = document.createElement('div');
    modal.id = 'nova-theme-modal';
    modal.innerHTML = `
        <div class="nt-sheet">
            <div class="nt-head">
                <div>
                    <div class="nt-title">🎨 Chat Theme</div>
                    <div class="nt-sub">Applies to this chat on both phones in real time</div>
                </div>
                <button type="button" class="nt-close" id="nt-close-btn">✕</button>
            </div>
            <div class="nt-grid" id="nt-grid"></div>
        </div>
    `;
    document.body.appendChild(modal);

    let currentAppliedTheme = 'carbon';
    let listeningRoomId = null;
    let unsubTheme = null;

    function applyThemeClassToChat(themeId) {
        const cv = $('chat-view');
        const valid = CHAT_THEMES.find(t => t.id === themeId) ? themeId : 'carbon';
        currentAppliedTheme = valid;

        if (cv) {
            // Clear old theme classes from both modules
            cv.classList.remove('theme-aurora', 'theme-cyber', 'theme-emerald');
            CHAT_THEMES.forEach(t => cv.classList.remove(`nt-${t.id}`));
            if (valid !== 'carbon') cv.classList.add(`nt-${valid}`);
        }

        document.querySelectorAll('.nt-card').forEach(c => {
            c.classList.toggle('active', c.getAttribute('data-theme-id') === valid);
        });
    }

    async function selectThemeForCurrentRoom(themeId) {
        if (!state.currentRoom) return showQuickToast("Please open a chat first!");
        const tObj = CHAT_THEMES.find(t => t.id === themeId) || CHAT_THEMES[0];

        applyThemeClassToChat(tObj.id);
        localStorage.setItem(`nova_room_theme_${state.currentRoom}`, tObj.id);
        modal.classList.remove('open');

        try {
            await setDoc(doc(db, "novahub_all_rooms", state.currentRoom), {
                chatTheme: tObj.id,
                themeUpdatedBy: state.myName || 'Friend',
                themeUpdatedByUid: state.myUid || '',
                themeUpdatedAt: Date.now()
            }, { merge: true });
            showQuickToast(`🎨 ${tObj.name} applied for both!`);
        } catch (e) {
            showQuickToast("⚠️ Theme saved locally, sync failed.");
        }
    }

    // Populate 10 Theme Cards
    const grid = $('nt-grid');
    CHAT_THEMES.forEach(t => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'nt-card';
        card.setAttribute('data-theme-id', t.id);
        card.style.background = t.bgPreview;
        card.innerHTML = `
            <span class="nt-check">✓</span>
            <div class="nt-preview-row">
                <div class="nt-b-other"></div>
                <div class="nt-b-me" style="background:${t.bubblePreview};"></div>
            </div>
            <div class="nt-meta">
                <span class="nt-name">${t.name}</span>
                <span class="nt-tag">${t.tag}</span>
            </div>
        `;
        card.addEventListener('click', () => selectThemeForCurrentRoom(t.id));
        grid.appendChild(card);
    });

    function openThemeModal() {
        if (!state.currentRoom) return showQuickToast("Please select a chat first!");
        // Close "+" sheet if open
        $('prem-plus-sheet')?.classList.remove('open');
        $('prem-plus-backdrop')?.classList.remove('open');
        $('prem-plus-btn')?.classList.remove('open');
        applyThemeClassToChat(currentAppliedTheme);
        modal.classList.add('open');
    }

    bindClick('nt-close-btn', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

    // 3. Connect to "+" Menu's Theme Button (#ps-theme) & Contact Info Drawer
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#ps-theme');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        openThemeModal();
    }, true);

    const drawer = $('contact-info-drawer');
    if (drawer && !document.getElementById('di-chat-theme')) {
        const anchor = $('di-media') || drawer.querySelector('.drawer-item');
        const parent = anchor ? anchor.parentElement : drawer;
        const row = document.createElement('div');
        row.id = 'di-chat-theme';
        row.className = 'nova-drawer-extra-row';
        row.innerHTML = `<span class="material-icons" style="color:#a855f7;">palette</span><span>Chat Theme (10 Synced Themes)</span>`;
        row.onclick = () => {
            drawer.classList.remove('open');
            drawer.style.display = 'none';
            openThemeModal();
        };
        if (anchor && parent) parent.insertBefore(row, anchor);
        else drawer.appendChild(row);
    }

    // 4. Real-Time Per-Chat Theme Sync Listener
    function syncRoomThemeListener() {
        const rId = state.currentRoom;
        if (!rId || rId === listeningRoomId) return;
        listeningRoomId = rId;

        if (unsubTheme) { unsubTheme(); unsubTheme = null; }

        // Instant local cache apply while Firestore responds
        const cached = localStorage.getItem(`nova_room_theme_${rId}`) || 'carbon';
        applyThemeClassToChat(cached);

        unsubTheme = onSnapshot(doc(db, "novahub_all_rooms", rId), (snap) => {
            if (!snap.exists()) {
                applyThemeClassToChat('carbon');
                return;
            }
            const d = snap.data();
            const cloudTheme = d.chatTheme || 'carbon';
            const prevTheme = currentAppliedTheme;

            applyThemeClassToChat(cloudTheme);
            localStorage.setItem(`nova_room_theme_${rId}`, cloudTheme);

            // Notify if peer just changed the theme live
            if (
                cloudTheme !== prevTheme &&
                d.themeUpdatedByUid &&
                d.themeUpdatedByUid !== state.myUid &&
                d.themeUpdatedAt &&
                (Date.now() - d.themeUpdatedAt) < 10000
            ) {
                const tObj = CHAT_THEMES.find(t => t.id === cloudTheme);
                showQuickToast(`🎨 ${d.themeUpdatedBy || 'Friend'} set theme: ${tObj ? tObj.name : cloudTheme}`);
            }
        });
    }

    setInterval(syncRoomThemeListener, 600);
    syncRoomThemeListener();
}

initSyncedChatThemes();

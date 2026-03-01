/**
 * TUTO.JS — Carousels tutoriel (howto + aperçu)
 * Converti en module ES6 depuis IIFE.
 */

// ── Constantes ────────────────────────────────────────────────────────
const SLIDE_MS         = 650;
const TEXT_FADE_MS     = 180;
const AUTO_INTERVAL_MS = 4500;

// ── buildSlide ────────────────────────────────────────────────────────
function buildSlide(data) {
    const slide = document.createElement('div');
    slide.className = 'tuto-slide';
    const wrap = document.createElement('div');
    wrap.className = 'tuto-img-placeholder';
    if (data.img) {
        const img = document.createElement('img');
        img.src = data._src;
        img.alt = '';
        wrap.appendChild(img);
    } else {
        const icon = document.createElement('span');
        icon.className = 'tuto-img-icon';
        icon.textContent = data.icon || '';
        wrap.appendChild(icon);
    }
    slide.appendChild(wrap);
    return slide;
}

// ── buildDots ─────────────────────────────────────────────────────────
function buildDots(dotsEl, count) {
    dotsEl.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const d = document.createElement('span');
        d.className = 'tuto-dot' + (i === 0 ? ' tuto-dot--active' : '');
        dotsEl.appendChild(d);
    }
}

// ── makeCarousel ──────────────────────────────────────────────────────
function makeCarousel(overlayId, innerId, dotsId, openBtnId, textId, slides) {
    const overlay = document.getElementById(overlayId);
    const track   = document.getElementById(innerId);
    const dotsEl  = document.getElementById(dotsId);
    const textEl  = document.getElementById(textId);
    const openBtn = document.getElementById(openBtnId);
    if (!overlay || !track) return;

    const N = slides.length;
    let current     = 0;
    let isAnimating = false;
    let isClosed    = true;
    let autoTimer   = null;
    let textTimer   = null;
    let pendingNext = null; // index en attente si input reçu pendant animation

    function mod(n) { return ((n % N) + N) % N; }

    function setDots(idx) {
        if (!dotsEl) return;
        Array.from(dotsEl.querySelectorAll('.tuto-dot'))
            .forEach((d, i) => d.classList.toggle('tuto-dot--active', i === idx));
    }

    function setTextSmooth(idx) {
        if (!textEl) return;
        clearTimeout(textTimer);
        textEl.style.transition = `opacity ${TEXT_FADE_MS}ms ease`;
        textEl.style.opacity    = '0';
        textTimer = setTimeout(() => {
            textEl.innerHTML     = slides[idx]?.text || '';
            textEl.style.opacity = '1';
        }, TEXT_FADE_MS);
    }

    function setTextSilent(idx) {
        if (!textEl) return;
        clearTimeout(textTimer);
        textEl.style.transition = 'none';
        textEl.style.opacity    = '1';
        textEl.innerHTML        = slides[idx]?.text || '';
    }

    // ── Transition principale ─────────────────────────────────────────
    function animate(nextIdx, direction) {
        isAnimating = true;
        pendingNext = null;

        const slideA = track.querySelector('.tuto-slide');
        const slideB = buildSlide(slides[nextIdx]);

        slideB.style.position   = 'absolute';
        slideB.style.inset      = '0';
        slideB.style.transform  = `translateX(${direction * 100}%)`;
        slideB.style.transition = 'none';
        track.appendChild(slideB);

        slideB.getBoundingClientRect(); // force reflow

        const ease = `transform ${SLIDE_MS}ms cubic-bezier(0.45, 0, 0.15, 1)`;
        slideA.style.transition = ease;
        slideB.style.transition = ease;
        slideA.style.transform  = `translateX(${-direction * 100}%)`;
        slideB.style.transform  = 'translateX(0%)';

        current = nextIdx;
        setDots(current);
        setTextSmooth(current);

        setTimeout(() => {
            slideA.remove();
            slideB.style.transition = 'none';
            slideB.style.transform  = '';
            slideB.style.position   = '';
            slideB.style.inset      = '';
            isAnimating = false;

            // Exécute l'input en attente s'il y en a un
            if (pendingNext !== null && !isClosed) {
                const { idx, dir } = pendingNext;
                pendingNext = null;
                animate(idx, dir);
            }
        }, SLIDE_MS);
    }

    // ── goTo public — met en file si animating ────────────────────────
    function goTo(nextIdx, direction) {
        if (isClosed) return;
        nextIdx = mod(nextIdx);
        if (nextIdx === current && !isAnimating) return;

        if (isAnimating) {
            // Écrase le pending précédent — on garde seulement le dernier input
            pendingNext = { idx: nextIdx, dir: direction };
            return;
        }
        animate(nextIdx, direction);
    }

    // ── Autoplay ──────────────────────────────────────────────────────
    function startAuto() { stopAuto(); autoTimer = setInterval(() => goTo(current + 1, 1), AUTO_INTERVAL_MS); }
    function stopAuto()  { clearInterval(autoTimer); autoTimer = null; }

    // ── Ouverture ─────────────────────────────────────────────────────
    function openModal() {
        stopAuto();
        isAnimating = false;
        pendingNext = null;

        track.innerHTML = '';
        track.appendChild(buildSlide(slides[0]));
        current = 0;
        setDots(0);
        setTextSilent(0);

        const backdrop = document.getElementById('tuto-backdrop-global');
        backdrop?.classList.add('tuto-backdrop--visible');
        overlay.style.display = 'flex';
        overlay.style.opacity = '0';

        requestAnimationFrame(() => requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            overlay.classList.add('tuto-overlay--visible');
            isClosed = false;
            startAuto();
        }));
    }

    // ── Fermeture ─────────────────────────────────────────────────────
    function closeModal() {
        isClosed    = true;
        isAnimating = false;
        pendingNext = null;
        clearTimeout(textTimer);
        stopAuto();
        const backdrop = document.getElementById('tuto-backdrop-global');
        backdrop?.classList.remove('tuto-backdrop--visible');
        overlay.style.opacity = '0';
        overlay.classList.remove('tuto-overlay--visible');
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.style.opacity = '';
            if (textEl) textEl.style.opacity = '1';
        }, 320);
        document.activeElement?.blur();
    }

    // ── Listeners ─────────────────────────────────────────────────────
    openBtn?.addEventListener('click', openModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    dotsEl?.addEventListener('click', (e) => {
        const dot = e.target.closest('.tuto-dot');
        if (!dot) return;
        const idx = Array.from(dotsEl.querySelectorAll('.tuto-dot')).indexOf(dot);
        const dir = idx >= current ? 1 : -1;
        stopAuto(); goTo(idx, dir); startAuto();
    });

    // Touch
    let touchStartX = 0, isTouching = false;
    track.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX; isTouching = true; stopAuto();
    }, { passive: true });
    track.addEventListener('touchend', (e) => {
        if (!isTouching) return;
        const diff = touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) goTo(current + (diff > 0 ? 1 : -1), diff > 0 ? 1 : -1);
        isTouching = false; startAuto();
    });

    // Souris
    let mouseStartX = 0, isMouseDragging = false;
    track.addEventListener('mousedown', (e) => {
        mouseStartX = e.clientX; isMouseDragging = true; stopAuto(); e.preventDefault();
    });
    document.addEventListener('mouseup', (e) => {
        if (!isMouseDragging) return;
        const diff = mouseStartX - e.clientX;
        if (Math.abs(diff) > 40) goTo(current + (diff > 0 ? 1 : -1), diff > 0 ? 1 : -1);
        isMouseDragging = false; startAuto();
    });

    // Clavier
    document.addEventListener('keydown', (e) => {
        if (!overlay.classList.contains('tuto-overlay--visible')) return;
        if (e.key === 'ArrowRight') { stopAuto(); goTo(current + 1,  1); startAuto(); }
        if (e.key === 'ArrowLeft')  { stopAuto(); goTo(current - 1, -1); startAuto(); }
        if (e.key === 'Escape')     closeModal();
    });

    setDots(0);
    setTextSilent(0);
}

// ── loadAndInit ───────────────────────────────────────────────────────
async function loadAndInit(config) {
    const { jsonPath, basePath, overlayId, innerId, dotsId, textId, openBtnId } = config;
    try {
        const res    = await fetch(jsonPath);
        const slides = await res.json();
        const track  = document.getElementById(innerId);
        const dotsEl = document.getElementById(dotsId);
        if (!track) return;

        await Promise.all(slides.map(s => new Promise(resolve => {
            if (!s.img) { resolve(); return; }
            s._src = basePath + s.img;
            const img = new Image();
            img.onload = img.onerror = resolve;
            img.src = s._src;
        })));

        track.innerHTML = '';
        track.appendChild(buildSlide(slides[0]));
        track.style.position = 'relative';
        track.style.overflow = 'hidden';
        track.style.width    = '100%';
        track.style.height   = '100%';

        buildDots(dotsEl, slides.length);
        makeCarousel(overlayId, innerId, dotsId, openBtnId, textId, slides);
    } catch (err) {
        console.warn(`[Tuto] Impossible de charger ${jsonPath}`, err);
    }
}

loadAndInit({
    jsonPath:  'tuto/howto/content.json',
    basePath:  'tuto/howto/',
    overlayId: 'tuto-overlay',
    innerId:   'howto-inner',
    dotsId:    'howto-dots',
    textId:    'howto-text',
    openBtnId: 'tuto-howto-btn',
});
loadAndInit({
    jsonPath:  'tuto/apercu/content.json',
    basePath:  'tuto/apercu/',
    overlayId: 'tuto-whatis-overlay',
    innerId:   'whatis-inner',
    dotsId:    'whatis-dots',
    textId:    'whatis-text',
    openBtnId: 'tuto-whatis-btn',
});

// ── Désactive les boutons pendant le chargement ───────────────────────
const statusMsg = document.getElementById('status-msg');
const tutoBtns  = [
    document.getElementById('tuto-howto-btn'),
    document.getElementById('tuto-whatis-btn'),
    document.querySelector('a.tuto-open-btn[href="merge.html"]'),
];
function syncTutoBtns() {
    const loading = statusMsg && statusMsg.innerText.trim() !== '';
    tutoBtns.forEach(btn => {
        if (!btn) return;
        btn.disabled            = loading;
        btn.style.opacity       = loading ? '0.25' : '';
        btn.style.pointerEvents = loading ? 'none' : '';
    });
}
if (statusMsg) {
    new MutationObserver(syncTutoBtns).observe(statusMsg, { childList: true, characterData: true, subtree: true });
}
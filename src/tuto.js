(function() {

    // ── Durées centralisées ───────────────────────────────────────────────
    const SLIDE_DURATION_MS = 750;   // durée de la transition image (ms)
    const TEXT_FADE_MS      = 200;   // durée du fade texte — doit être < SLIDE_DURATION_MS / 2
    const AUTO_INTERVAL_MS  = 4500;  // délai entre deux slides en autoplay (ms)

    // ── Construction d'une slide ──────────────────────────────────────────
    function buildSlide(data, basePath, isClone) {
        const slide = document.createElement('div');
        slide.className = 'tuto-slide' + (isClone ? ' tuto-slide--clone' : '');

        const placeholder = document.createElement('div');
        placeholder.className = 'tuto-img-placeholder';

        if (data.img) {
            const img = document.createElement('img');
            img.src = basePath + data.img;
            img.alt = '';
            img.loading = 'eager';
            placeholder.appendChild(img);
        } else {
            const icon = document.createElement('span');
            icon.className = 'tuto-img-icon';
            icon.textContent = data.icon || '';
            placeholder.appendChild(icon);
        }

        slide.appendChild(placeholder);
        return slide;
    }

    // ── Construit les dots ────────────────────────────────────────────────
    function buildDots(dotsEl, count) {
        dotsEl.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const dot = document.createElement('span');
            dot.className = 'tuto-dot' + (i === 0 ? ' tuto-dot--active' : '');
            dotsEl.appendChild(dot);
        }
    }

    // ── Carousel infini ───────────────────────────────────────────────────
    function makeCarousel(overlayId, innerId, dotsId, openBtnId, textId, slides) {
        const overlay = document.getElementById(overlayId);
        const inner   = document.getElementById(innerId);
        const dotsEl  = document.getElementById(dotsId);
        const textEl  = document.getElementById(textId);
        const openBtn = document.getElementById(openBtnId);
        if (!overlay || !inner) return;

        const realCount  = slides.length;
        const DOM_OFFSET = 1;

        let current       = 0;
        let autoTimer     = null;
        let isJumping     = false;
        let isClosed      = true;
        let textFadeTimer = null;

        const allSlides = () => Array.from(inner.querySelectorAll('.tuto-slide'));

        function resetPosition() {
            inner.style.transition = 'none';
            inner.style.transform  = `translateX(-${DOM_OFFSET * 100}%)`;
            inner.getBoundingClientRect();
        }

        function setDots(logicalIdx) {
            const dots = dotsEl ? Array.from(dotsEl.querySelectorAll('.tuto-dot')) : [];
            dots.forEach((d, i) => d.classList.toggle('tuto-dot--active', i === logicalIdx));
        }

        // Texte : fade out → swap contenu → fade in
        function setTextSmooth(logicalIdx) {
            if (!textEl) return;
            clearTimeout(textFadeTimer);
            if (!textEl.dataset.fadeReady) {
                textEl.style.transition = `opacity ${TEXT_FADE_MS}ms ease`;
                textEl.dataset.fadeReady = '1';
            }
            textEl.style.opacity = '0';
            textFadeTimer = setTimeout(() => {
                textEl.innerHTML     = slides[logicalIdx]?.text || '';
                textEl.style.opacity = '1';
            }, TEXT_FADE_MS);
        }

        // setActive silencieux — pas de fade, utilisé pour les sauts et l'init
        function setActiveSilent(logicalIdx) {
            allSlides().forEach(s => s.classList.remove('tuto-slide--active'));
            allSlides()[logicalIdx + DOM_OFFSET]?.classList.add('tuto-slide--active');
            setDots(logicalIdx);
            if (textEl) {
                clearTimeout(textFadeTimer);
                textEl.style.opacity = '1';
                textEl.innerHTML = slides[logicalIdx]?.text || '';
            }
        }

        // Repositionnement instantané sans animation visible (loop infini)
        function jumpSilently(domIdx) {
            isJumping = true;
            inner.style.transition = 'none';
            inner.style.transform  = `translateX(-${domIdx * 100}%)`;
            inner.getBoundingClientRect();
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const logicalIdx = ((domIdx - DOM_OFFSET) % realCount + realCount) % realCount;
                setActiveSilent(logicalIdx);
                isJumping = false;
            }));
        }

        // Transition principale avec easing smooth
        function goTo(logicalIdx) {
            if (isJumping || isClosed) return;
            const domIdx = logicalIdx + DOM_OFFSET;
            inner.style.transition = `transform ${SLIDE_DURATION_MS}ms cubic-bezier(0.45, 0, 0.15, 1)`;
            inner.style.transform  = `translateX(-${domIdx * 100}%)`;
            current = ((logicalIdx % realCount) + realCount) % realCount;
            setDots(current);
            setTextSmooth(current);
        }

        // Détection arrivée sur un clone → jump vers le vrai slide
        inner.addEventListener('transitionend', (e) => {
            if (e.propertyName !== 'transform' || isClosed) return;
            const match = inner.style.transform.match(/-?([\d.]+)%/);
            if (!match) return;
            const domIdx = Math.round(-parseFloat(match[0]) / 100);
            if (domIdx === realCount + 1) jumpSilently(DOM_OFFSET);
            if (domIdx === 0)             jumpSilently(realCount);
        });

        function startAuto() { stopAuto(); autoTimer = setInterval(() => goTo(current + 1), AUTO_INTERVAL_MS); }
        function stopAuto()  { clearInterval(autoTimer); autoTimer = null; }

        function openModal() {
            stopAuto();
            isJumping = true;
            resetPosition();
            current = 0;
            setActiveSilent(0);

            const backdrop = document.getElementById('tuto-backdrop-global');
            backdrop?.classList.add('tuto-backdrop--visible');
            overlay.style.display = 'flex';
            overlay.style.opacity = '0';

            requestAnimationFrame(() => requestAnimationFrame(() => {
                overlay.style.opacity = '1';
                overlay.classList.add('tuto-overlay--visible');
                isClosed  = false;
                isJumping = false;
                startAuto();
            }));
        }

        function closeModal() {
            isClosed  = true;
            isJumping = false;
            clearTimeout(textFadeTimer);
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

        openBtn?.addEventListener('click', openModal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

        dotsEl?.addEventListener('click', (e) => {
            const dot = e.target.closest('.tuto-dot');
            if (!dot) return;
            const idx = Array.from(dotsEl.querySelectorAll('.tuto-dot')).indexOf(dot);
            stopAuto(); goTo(idx); startAuto();
        });

        // Touch
        let touchStartX = 0, isTouching = false;
        inner.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX; isTouching = true; stopAuto();
        }, { passive: true });
        inner.addEventListener('touchend', (e) => {
            if (!isTouching) return;
            const diff = touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 40) goTo(current + (diff > 0 ? 1 : -1));
            isTouching = false; startAuto();
        });

        // Souris
        let mouseStartX = 0, isMouseDragging = false;
        inner.addEventListener('mousedown', (e) => {
            mouseStartX = e.clientX; isMouseDragging = true; stopAuto(); e.preventDefault();
        });
        document.addEventListener('mouseup', (e) => {
            if (!isMouseDragging) return;
            const diff = mouseStartX - e.clientX;
            if (Math.abs(diff) > 40) goTo(current + (diff > 0 ? 1 : -1));
            isMouseDragging = false; startAuto();
        });

        // Clavier
        document.addEventListener('keydown', (e) => {
            if (!overlay.classList.contains('tuto-overlay--visible')) return;
            if (e.key === 'ArrowRight') { stopAuto(); goTo(current + 1); startAuto(); }
            if (e.key === 'ArrowLeft')  { stopAuto(); goTo(current - 1); startAuto(); }
            if (e.key === 'Escape')     closeModal();
        });

        resetPosition();
        setActiveSilent(0);
    }

    // ── Chargement des JSON et initialisation ─────────────────────────────
    async function loadAndInit(config) {
        const { jsonPath, basePath, overlayId, innerId, dotsId, textId, openBtnId } = config;
        try {
            const res    = await fetch(jsonPath);
            const slides = await res.json();
            const inner  = document.getElementById(innerId);
            const dotsEl = document.getElementById(dotsId);
            if (!inner) return;

            await Promise.all(
                slides.filter(s => s.img).map(s => new Promise(resolve => {
                    const img = new Image();
                    img.onload = img.onerror = resolve;
                    img.src = basePath + s.img;
                }))
            );

            inner.innerHTML = '';
            inner.appendChild(buildSlide(slides[slides.length - 1], basePath, true));
            slides.forEach(s => inner.appendChild(buildSlide(s, basePath, false)));
            inner.appendChild(buildSlide(slides[0], basePath, true));

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

    // ── Désactive les boutons tuto pendant le chargement de la session ────
    const statusMsg = document.getElementById('status-msg');
    const tutoBtns  = [
        document.getElementById('tuto-howto-btn'),
        document.getElementById('tuto-whatis-btn'),
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

})();
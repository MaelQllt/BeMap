/**
 * MODAL.JS — Modale photo BeReal : navigation, flip, drag miniature, zoom & pan
 */

import {
    currentPhotos, setCurrentPhotos,
    currentIndex, setCurrentIndex,
    isFlipped, setIsFlipped,
    currentMiniSide, setCurrentMiniSide,
    isDragging, setIsDragging,
    hasDragged, setHasDragged,
    justFinishedDrag, setJustFinishedDrag,
    isZooming, setIsZooming,
    zoomScale, setZoomScale,
    translateX, setTranslateX,
    translateY, setTranslateY,
    lastMouseX, setLastMouseX,
    lastMouseY, setLastMouseY,
    setIsRelocating,
    setMemoryToUpdate
} from './state.js';
import { setMapFocus } from './map.js';
import { syncPWAHeight } from './utils.js';

const miniBox        = document.getElementById('mini-img-box');
const mainPhoto      = document.getElementById('main-photo');
const photoContainer = document.getElementById('photo-container');
const modal          = document.getElementById('bereal-modal');
const counter        = document.getElementById('photo-counter');

// --- OUVERTURE / FERMETURE ---

export function openModal(photos) {
    setCurrentPhotos(photos);
    setCurrentIndex(0);
    setCurrentMiniSide('left');
    updateModalContent();
    modal.style.display = 'flex';
    setMapFocus(true);
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    if (isMobile && photos.length > 1) _showHint();
}

export function closeModal() {
    if (isDragging || justFinishedDrag || isZooming) return;
    modal.style.display = 'none';
    setCurrentMiniSide('left');
    if (counter) {
        counter.style.left = 'auto';
        counter.style.right = '20px';
        counter.classList.remove('switching', 'from-left');
    }
    document.getElementById('swipe-hint')?.remove();
    setMapFocus(false);
    syncPWAHeight();
}

// --- CONTENU ---

export function updateModalContent() {
    const p = currentPhotos[currentIndex];
    const replaceBtn = document.getElementById('replace-button');

    replaceBtn?.style.setProperty('display', 'none', 'important');
    if (!p) return;

    // Normalisation de la localisation (peut être une string JSON sérialisée par MapLibre)
    let loc = p.location;
    if (typeof loc === 'string') {
        try { loc = JSON.parse(loc); } catch { loc = null; }
    }

    setIsFlipped(false);
    resetZoomState();

    mainPhoto.src = p.back;
    document.getElementById('mini-photo').src = p.front;
    document.getElementById('modal-caption').innerText = p.caption || "";
    document.getElementById('modal-metadata').innerText = `${p.date} • ${p.time}`;

    photoContainer.classList.toggle('on-time', p.isLate === false && p.isBonus === false);

    if (replaceBtn) replaceBtn.style.display = p.canBeRelocated ? 'block' : 'none';

    miniBox.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    const xPos = currentMiniSide === 'right' ? photoContainer.offsetWidth - miniBox.offsetWidth - 28 : 0;
    miniBox.style.transform = `translate(${xPos}px, 0px)`;

    const hasMultiple = currentPhotos.length > 1;
    const isMobile = window.matchMedia('(pointer: coarse)').matches;

    if (isMobile) {
        document.getElementById('prevBtn').style.display = 'none';
        document.getElementById('nextBtn').style.display = 'none';
    } else {
        document.getElementById('prevBtn').style.display = (hasMultiple && currentIndex > 0) ? 'flex' : 'none';
        document.getElementById('nextBtn').style.display = (hasMultiple && currentIndex < currentPhotos.length - 1) ? 'flex' : 'none';
    }

    if (counter) counter.innerText = hasMultiple ? `${currentIndex + 1}/${currentPhotos.length}` : '';

    _updateSwipeHint(hasMultiple && isMobile);
}

export function nextPhoto() {
    if (currentIndex < currentPhotos.length - 1) {
        setCurrentIndex(currentIndex + 1);
        updateModalContent();
    }
}

export function prevPhoto() {
    if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
        updateModalContent();
    }
}

// --- DRAG MINIATURE & FLIP ---

function startMiniDrag(clientX, clientY) {
    setIsDragging(true);
    setHasDragged(false);
    const rect  = miniBox.getBoundingClientRect();
    const cRect = photoContainer.getBoundingClientRect();
    miniBox._dragStartX = clientX - (rect.left - cRect.left);
    miniBox._dragStartY = clientY - (rect.top  - cRect.top);
    miniBox.style.transition = 'none';
}

function moveMiniDrag(clientX, clientY) {
    if (!hasDragged) {
        const dx = clientX - (miniBox._dragStartX + photoContainer.getBoundingClientRect().left - 14);
        const dy = clientY - (miniBox._dragStartY + photoContainer.getBoundingClientRect().top  - 14);
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        setHasDragged(true);
    }
    const x = Math.max(10, Math.min(clientX - miniBox._dragStartX, photoContainer.offsetWidth  - miniBox.offsetWidth  - 10));
    const y = Math.max(10, Math.min(clientY - miniBox._dragStartY, photoContainer.offsetHeight - miniBox.offsetHeight - 10));
    miniBox.style.transform = `translate(${x - 14}px, ${y - 14}px)`;
}

function endMiniDrag() {
    if (!isDragging) return;
    setIsDragging(false);

    if (!hasDragged) {
        const newFlipped = !isFlipped;
        setIsFlipped(newFlipped);
        const p = currentPhotos[currentIndex];
        mainPhoto.src = newFlipped ? p.front : p.back;
        document.getElementById('mini-photo').src = newFlipped ? p.back : p.front;
    } else {
        setJustFinishedDrag(true);
        miniBox.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        const snapRight = (miniBox.getBoundingClientRect().left + miniBox.offsetWidth / 2) >
                          (photoContainer.getBoundingClientRect().left + photoContainer.offsetWidth / 2);
        setCurrentMiniSide(snapRight ? 'right' : 'left');
        miniBox.style.transform = snapRight
            ? `translate(${photoContainer.offsetWidth - miniBox.offsetWidth - 28}px, 0px)`
            : 'translate(0px, 0px)';

        if (counter) {
            counter.classList.toggle('from-left', snapRight);
            counter.classList.add('switching');
            setTimeout(() => {
                counter.style.left  = snapRight ? '20px' : 'auto';
                counter.style.right = snapRight ? 'auto' : '20px';
                counter.classList.remove('switching');
            }, 150);
        }
        setTimeout(() => setJustFinishedDrag(false), 500);
    }
}

// ── Souris ──────────────────────────────────────────────────────────────────
miniBox.addEventListener('mousedown', (e) => {
    startMiniDrag(e.clientX, e.clientY);
    e.preventDefault();
    e.stopPropagation();
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) moveMiniDrag(e.clientX, e.clientY);
    if (isZooming && !_isPinching) handlePan(e.clientX, e.clientY);
});

document.addEventListener('mouseup', () => {
    endMiniDrag();
    if (isZooming && !_isPinching) {
        setJustFinishedDrag(true);
        smoothResetZoom();
        setTimeout(() => setJustFinishedDrag(false), 350);
    }
});

// ── Touch miniature ──────────────────────────────────────────────────────────
miniBox.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    startMiniDrag(t.clientX, t.clientY);
    e.stopPropagation();
    e.preventDefault();
}, { passive: false });

miniBox.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const t = e.touches[0];
    moveMiniDrag(t.clientX, t.clientY);
    e.stopPropagation();
    e.preventDefault();
}, { passive: false });

miniBox.addEventListener('touchend', (e) => {
    e.stopPropagation();
    e.preventDefault();
    endMiniDrag();
}, { passive: false });

// --- ZOOM & PAN ---

function updateTransform() {
    const maxTx = (photoContainer.offsetWidth  * (zoomScale - 1)) / 2;
    const maxTy = (photoContainer.offsetHeight * (zoomScale - 1)) / 2;
    setTranslateX(Math.max(-maxTx / zoomScale, Math.min(translateX, maxTx / zoomScale)));
    setTranslateY(Math.max(-maxTy / zoomScale, Math.min(translateY, maxTy / zoomScale)));
    mainPhoto.style.transform = `scale(${zoomScale}) translate(${translateX}px, ${translateY}px)`;
}

export function resetZoomState() {
    setIsZooming(false);
    setZoomScale(1);
    setTranslateX(0);
    setTranslateY(0);
    mainPhoto.style.transition = 'none';
    mainPhoto.style.transform  = 'scale(1) translate(0,0)';
    photoContainer.classList.remove('zoomed');
}

function smoothResetZoom() {
    setIsZooming(false);
    mainPhoto.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    mainPhoto.style.transform  = 'scale(1) translate(0,0)';
    photoContainer.classList.remove('zoomed');
    setTimeout(() => {
        setZoomScale(1);
        setTranslateX(0);
        setTranslateY(0);
        mainPhoto.style.transition = 'none';
    }, 300);
}

function startZoom(x, y, scale = 1.6) {
    setIsZooming(true);
    setLastMouseX(x);
    setLastMouseY(y);
    setTranslateX(0);
    setTranslateY(0);
    setZoomScale(scale);
    mainPhoto.style.transformOrigin = '50% 50%';
    mainPhoto.style.transition      = 'transform 0.25s ease-out';
    updateTransform();
    photoContainer.classList.add('zoomed');
}

function handlePan(x, y) {
    setTranslateX(translateX + (x - lastMouseX) / zoomScale);
    setTranslateY(translateY + (y - lastMouseY) / zoomScale);
    setLastMouseX(x);
    setLastMouseY(y);
    mainPhoto.style.transition = 'none';
    updateTransform();
}

// ── Souris desktop ───────────────────────────────────────────────────────────
photoContainer.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.mini-img-container')) startZoom(e.clientX, e.clientY);
});

// ── Touch — pinch & long-press zoom ─────────────────────────────────────────
let _isPinching      = false;
let _pinchStartDist  = 0;
let _pinchStartScale = 1;
let _pinchMidX       = 0;
let _pinchMidY       = 0;
let _longPressTimer  = null;
let _touchStartX     = 0;
let _touchStartY     = 0;

function pinchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}
function pinchMid(touches) {
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
    };
}

photoContainer.addEventListener('touchstart', (e) => {
    if (e.target.closest('.mini-img-container')) return;

    if (e.touches.length === 2) {
        clearTimeout(_longPressTimer);
        _longPressTimer  = null;
        _isPinching      = true;
        _pinchStartDist  = pinchDist(e.touches);
        _pinchStartScale = zoomScale > 1 ? zoomScale : 1;
        const mid = pinchMid(e.touches);
        _pinchMidX = mid.x;
        _pinchMidY = mid.y;
        if (!isZooming) {
            setIsZooming(true);
            photoContainer.classList.add('zoomed');
            mainPhoto.style.transformOrigin = '50% 50%';
        }
        e.preventDefault();
    } else if (e.touches.length === 1 && !_isPinching) {
        if (isDragging) return;
        _touchStartX = e.touches[0].clientX;
        _touchStartY = e.touches[0].clientY;
        _longPressTimer = setTimeout(() => {
            _longPressTimer = null;
            if (isDragging) return;
            startZoom(e.touches[0].clientX, e.touches[0].clientY);
        }, 150);
    }
}, { passive: false });

photoContainer.addEventListener('touchmove', (e) => {
    if (e.target.closest('.mini-img-container')) return;

    if (_isPinching && e.touches.length === 2) {
        const dist     = pinchDist(e.touches);
        const rawScale = _pinchStartScale * (dist / _pinchStartDist);
        const clamped  = Math.max(1, Math.min(rawScale, 4));
        setZoomScale(clamped);
        const mid = pinchMid(e.touches);
        handlePan(mid.x, mid.y);
        _pinchMidX = mid.x;
        _pinchMidY = mid.y;
        mainPhoto.style.transition = 'none';
        updateTransform();
        e.preventDefault();
    } else if (isZooming && !_isPinching && e.touches.length === 1) {
        if (_longPressTimer) {
            const dx = e.touches[0].clientX - _touchStartX;
            const dy = e.touches[0].clientY - _touchStartY;
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                clearTimeout(_longPressTimer);
                _longPressTimer = null;
                return;
            }
        }
        handlePan(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
    }
}, { passive: false });

photoContainer.addEventListener('touchend', (e) => {
    if (e.target.closest('.mini-img-container')) return;

    if (_longPressTimer) {
        clearTimeout(_longPressTimer);
        _longPressTimer = null;
    }

    if (_isPinching) {
        _isPinching = false;
        if (zoomScale <= 1.05) {
            setJustFinishedDrag(true);
            smoothResetZoom();
            setTimeout(() => setJustFinishedDrag(false), 350);
        }
        return;
    }

    if (isZooming && e.touches.length === 0) {
        setJustFinishedDrag(true);
        smoothResetZoom();
        setTimeout(() => setJustFinishedDrag(false), 350);
    }
}, { passive: true });

// --- SWIPE MOBILE ---
const SWIPE_THRESHOLD  = 40;
const SWIPE_MAX_VDRIFT = 70;

let _swipeTouchStartX = 0;
let _swipeTouchStartY = 0;
let _swipeActive      = false;

function _showHint() {
    document.getElementById('swipe-hint')?.remove();
    const hint = document.createElement('div');
    hint.id = 'swipe-hint';
    modal.appendChild(hint);
    _setHintText(hint);
    setTimeout(() => hint.classList.add('swipe-hint--in'), 0);
}

function _updateSwipeHint(show) {
    const hint = document.getElementById('swipe-hint');
    if (!show || !hint) return;
    _setHintText(hint);
}

function _setHintText(hint) {
    const total = currentPhotos.length;
    const idx   = currentIndex;
    if (idx === 0)
        hint.innerHTML = 'swipe pour prochain <span class="hint-brand">BeReal.</span> <span class="hint-arrows">&rsaquo;&rsaquo;&rsaquo;</span>';
    else if (idx === total - 1)
        hint.innerHTML = '<span class="hint-arrows">&lsaquo;&lsaquo;&lsaquo;</span> <span class="hint-brand">BeReal.</span> précédent';
    else
        hint.innerHTML = '<span class="hint-arrows">&lsaquo;&lsaquo;&lsaquo;</span> swipe <span class="hint-arrows">&rsaquo;&rsaquo;&rsaquo;</span>';
}

modal.addEventListener('touchstart', (e) => {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    if (currentPhotos.length <= 1) return;
    if (e.touches.length !== 1) return;
    _swipeActive      = true;
    _swipeTouchStartX = e.touches[0].clientX;
    _swipeTouchStartY = e.touches[0].clientY;
}, { passive: true });

modal.addEventListener('touchend', (e) => {
    if (!_swipeActive) return;
    _swipeActive = false;
    if (isDragging || isZooming || _isPinching) return;

    const dx = e.changedTouches[0].clientX - _swipeTouchStartX;
    const dy = e.changedTouches[0].clientY - _swipeTouchStartY;

    if (Math.abs(dy) > SWIPE_MAX_VDRIFT) return;
    if (Math.abs(dx) < SWIPE_THRESHOLD)  return;

    const canNext = currentIndex < currentPhotos.length - 1;
    const canPrev = currentIndex > 0;

    if (dx < 0 && canNext)      nextPhoto();
    else if (dx > 0 && canPrev) prevPhoto();
}, { passive: true });

// --- BOUTON REPLACER ---
document.getElementById('replace-button')?.addEventListener('click', () => {
    const photo = currentPhotos[currentIndex];
    setMemoryToUpdate(photo);
    setIsRelocating(true);
    closeModal();
    document.getElementById('map').style.cursor = 'crosshair';
    let loc = photo.location;
    if (typeof loc === 'string') { try { loc = JSON.parse(loc); } catch { loc = null; } }
    document.dispatchEvent(new CustomEvent('app:relocation-start', {
        detail: { uid: photo.uid, rawDate: photo.rawDate, location: loc }
    }));
});

// --- NAVIGATION ---
document.getElementById('prevBtn')?.addEventListener('click', prevPhoto);
document.getElementById('nextBtn')?.addEventListener('click', nextPhoto);

// --- FERMETURE AU TAP HORS PHOTO ---
modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

const PROTECTED_SELECTORS = [
    '#photo-container',
    '.mini-img-container',
    '#prevBtn',
    '#nextBtn',
    '#replace-button',
];

document.querySelector('.modal-content')?.addEventListener('click', (e) => {
    if (isDragging || justFinishedDrag || isZooming) return;
    const isProtected = PROTECTED_SELECTORS.some(sel => e.target.closest(sel));
    if (!isProtected) closeModal();
});
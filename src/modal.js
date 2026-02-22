/**
 * MODAL.JS — Modale photo BeReal, flip, zoom & pan
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
    isRelocating, setIsRelocating,
    memoryToUpdate, setMemoryToUpdate
} from './state.js';
import { setMapFocus } from './map.js';
import { syncPWAHeight } from './utils.js';

const miniBox = document.getElementById('mini-img-box');
const mainPhoto = document.getElementById('main-photo');
const photoContainer = document.getElementById('photo-container');
const modal = document.getElementById('bereal-modal');

export function openModal(photos) {
    setCurrentPhotos(photos);
    setCurrentIndex(0);
    setCurrentMiniSide('left');
    updateModalContent();
    modal.style.display = 'flex';
    setMapFocus(true);
}

export function closeModal() {
    if (isDragging || justFinishedDrag || isZooming) return;
    modal.style.display = 'none';
    setCurrentMiniSide('left');
    const counter = document.getElementById('photo-counter');
    if (counter) {
        counter.style.left = 'auto';
        counter.style.right = '20px';
        counter.classList.remove('switching', 'from-left');
    }
    setMapFocus(false);
    syncPWAHeight();
}

export function updateModalContent() {
    const p = currentPhotos[currentIndex];
    const replaceBtn = document.getElementById('replace-button');
    if (replaceBtn) replaceBtn.style.setProperty('display', 'none', 'important');
    if (!p) return;

    let loc = p.location;
    if (typeof loc === 'string') {
        try { loc = JSON.parse(loc); } catch (e) { loc = null; }
    }

    setIsFlipped(false);
    resetZoomState();

    mainPhoto.src = p.back;
    document.getElementById('mini-photo').src = p.front;
    document.getElementById('modal-caption').innerText = p.caption || "";
    document.getElementById('modal-metadata').innerText = `${p.date} • ${p.time}`;
    photoContainer.classList.toggle('on-time', p.isLate === false && p.isBonus === false);

    const hasValidLocation = loc && loc.latitude && loc.longitude && loc.latitude !== 0;
    if (replaceBtn) replaceBtn.style.display = hasValidLocation ? 'none' : 'block';

    miniBox.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    const xPos = currentMiniSide === 'right' ? (photoContainer.offsetWidth - miniBox.offsetWidth - 28) : 0;
    miniBox.style.transform = `translate(${xPos}px, 0px)`;

    const hasMultiple = currentPhotos.length > 1;
    document.getElementById('prevBtn').style.display = (hasMultiple && currentIndex > 0) ? 'flex' : 'none';
    document.getElementById('nextBtn').style.display = (hasMultiple && currentIndex < currentPhotos.length - 1) ? 'flex' : 'none';

    const counter = document.getElementById('photo-counter');
    if (counter) counter.innerText = hasMultiple ? `${currentIndex + 1}/${currentPhotos.length}` : '';
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
miniBox.addEventListener('mousedown', (e) => {
    setIsDragging(true);
    setHasDragged(false);
    const rect = miniBox.getBoundingClientRect(), cRect = photoContainer.getBoundingClientRect();
    miniBox._dragStartX = e.clientX - (rect.left - cRect.left);
    miniBox._dragStartY = e.clientY - (rect.top - cRect.top);
    miniBox.style.transition = 'none';
    e.preventDefault();
    e.stopPropagation();
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        setHasDragged(true);
        const clampedX = Math.max(10, Math.min(e.clientX - miniBox._dragStartX, photoContainer.offsetWidth - miniBox.offsetWidth - 10));
        const clampedY = Math.max(10, Math.min(e.clientY - miniBox._dragStartY, photoContainer.offsetHeight - miniBox.offsetHeight - 10));
        miniBox.style.transform = `translate(${clampedX - 14}px, ${clampedY - 14}px)`;
    }
    if (isZooming) handlePan(e.clientX, e.clientY);
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
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
            const snapRight = (miniBox.getBoundingClientRect().left + miniBox.offsetWidth / 2) > (photoContainer.getBoundingClientRect().left + photoContainer.offsetWidth / 2);
            setCurrentMiniSide(snapRight ? 'right' : 'left');
            miniBox.style.transform = snapRight ? `translate(${photoContainer.offsetWidth - miniBox.offsetWidth - 28}px, 0px)` : 'translate(0px, 0px)';

            const counter = document.getElementById('photo-counter');
            if (counter) {
                if (snapRight) counter.classList.add('from-left'); else counter.classList.remove('from-left');
                counter.classList.add('switching');
                setTimeout(() => {
                    if (snapRight) { counter.style.left = '20px'; counter.style.right = 'auto'; }
                    else { counter.style.left = 'auto'; counter.style.right = '20px'; }
                    counter.classList.remove('switching');
                }, 150);
            }
            setTimeout(() => setJustFinishedDrag(false), 500);
        }
    }
    if (isZooming) {
        setJustFinishedDrag(true);
        resetZoomState();
        setTimeout(() => setJustFinishedDrag(false), 300);
    }
});

// --- ZOOM ---
function updateTransform() {
    const maxTx = (photoContainer.offsetWidth * (zoomScale - 1)) / 2;
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
    mainPhoto.style.transform = 'scale(1) translate(0,0)';
    photoContainer.classList.remove('zoomed');
}

function startZoom(x, y) {
    setIsZooming(true);
    mainPhoto.style.transformOrigin = `50% 50%`;
    setLastMouseX(x);
    setLastMouseY(y);
    setTranslateX(0);
    setTranslateY(0);
    setZoomScale(1.6);
    mainPhoto.style.transition = 'transform 0.25s ease-out';
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

photoContainer.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.mini-img-container')) startZoom(e.clientX, e.clientY);
});

// --- BOUTON REPLACER ---
document.getElementById('replace-button')?.addEventListener('click', () => {
    setMemoryToUpdate(currentPhotos[currentIndex]);
    setIsRelocating(true);
    closeModal();
    document.getElementById('map').style.cursor = 'crosshair';
});

// --- NAVIGATION FLÈCHES ---
document.getElementById('prevBtn')?.addEventListener('click', prevPhoto);
document.getElementById('nextBtn')?.addEventListener('click', nextPhoto);

// Fermer en cliquant sur fond
modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

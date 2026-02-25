/**
 * BADGE.JS — Badge profil draggable avec inertie magnétique
 * Supporte souris (desktop) et touch (mobile/iPhone)
 */

import { openDashboard } from './dashboard.js';

const badge = document.querySelector('.user-profile-header');

let badgeX = 0, badgeY = 0;
let targetX = 0, targetY = 0;
let isDraggingBadge = false;
let hasMovedBadge = false;
let startX, startY;
const friction = 0.3;

// Seuil en px à partir duquel on considère que c'est un drag (pas un tap)
const DRAG_THRESHOLD = 5;

function animateBadge() {
    badgeX += (targetX - badgeX) * friction;
    badgeY += (targetY - badgeY) * friction;
    badge.style.transform = `translate(${badgeX}px, ${badgeY}px)`;
    requestAnimationFrame(animateBadge);
}

// --- Logique partagée souris + touch ---

function onDragStart(clientX, clientY) {
    isDraggingBadge = true;
    hasMovedBadge = false;
    startX = clientX;
    startY = clientY;
}

function onDragMove(clientX, clientY) {
    if (!isDraggingBadge) return;
    if (Math.abs(clientX - startX) > DRAG_THRESHOLD || Math.abs(clientY - startY) > DRAG_THRESHOLD) {
        hasMovedBadge = true;
    }
    targetX = clientX - startX;
    targetY = clientY - startY;
}

function onDragEnd() {
    isDraggingBadge = false;
    targetX = 0;
    targetY = 0;
    // Le retour au point d'origine est animé par animateBadge() via la friction
}

export function initBadge() {
    animateBadge();

    // ─── SOURIS ───────────────────────────────────────────────────
    badge.addEventListener('mousedown', (e) => {
        onDragStart(e.clientX, e.clientY);
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        onDragMove(e.clientX, e.clientY);
    });

    document.addEventListener('mouseup', onDragEnd);

    // ─── TOUCH (iPhone / Android) ─────────────────────────────────
    badge.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        onDragStart(touch.clientX, touch.clientY);
        // passive: false déclaré sur l'option du listener (voir ci-dessous)
        // preventDefault() ici bloquerait le scroll de la carte — on ne l'appelle PAS
        // Le flag hasMovedBadge suffit à distinguer tap vs drag
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!isDraggingBadge) return;
        onDragMove(e.touches[0].clientX, e.touches[0].clientY);
        // Pas de preventDefault() ici non plus : on laisse MapLibre gérer le scroll
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!isDraggingBadge) return;

        // Tap = aucun mouvement → ouvre le dashboard
        if (!hasMovedBadge) {
            openDashboard();
        }

        onDragEnd();
    });

    // ─── CLIC SOURIS (fallback desktop) ───────────────────────────
    // Sur mobile ce listener ne se déclenche pas si touchend a déjà ouvert le dashboard
    badge.addEventListener('click', () => {
        if (!hasMovedBadge) openDashboard();
    });
}
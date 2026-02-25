/**
 * BADGE.JS — Badge profil draggable avec inertie magnétique
 */

import { openDashboard } from './dashboard.js';

const badge = document.querySelector('.user-profile-header');

let mouseX = 0, mouseY = 0;
let badgeX = 0, badgeY = 0;
let targetX = 0, targetY = 0;
let isDraggingBadge = false;
let hasMovedBadge = false;
let startX, startY;
const friction = 0.3;

function animateBadge() {
    badgeX += (targetX - badgeX) * friction;
    badgeY += (targetY - badgeY) * friction;
    badge.style.transform = `translate(${badgeX}px, ${badgeY}px)`;
    requestAnimationFrame(animateBadge);
}

export function initBadge() {
    animateBadge();

    badge.addEventListener('mousedown', (e) => {
        isDraggingBadge = true;
        hasMovedBadge = false;
        startX = e.clientX;
        startY = e.clientY;
        mouseX = e.clientX;
        mouseY = e.clientY;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingBadge) return;
        if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) hasMovedBadge = true;
        // On recalcule le delta depuis startX/startY pour éviter un saut au premier frame
        // si mouseX n'est pas encore synchro avec la position courante de la souris.
        targetX = e.clientX - startX;
        targetY = e.clientY - startY;
    });

    const stopBadgeDrag = () => { isDraggingBadge = false; targetX = 0; targetY = 0; };
    document.addEventListener('mouseup', stopBadgeDrag);

    badge.addEventListener('click', () => {
        if (!hasMovedBadge) openDashboard();
    });
}
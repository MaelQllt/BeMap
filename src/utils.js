/**
 * UTILS.JS — Fonctions utilitaires partagées
 */

import { objectUrlCache, fileMap } from './state.js';

// On n'importe PAS map ici pour éviter la dépendance circulaire.
// syncPWAHeight accède à map de façon lazy via un getter.
let _mapRef = null;
export function setMapRef(m) { _mapRef = m; }

/**
 * Retourne une Object URL locale pour un chemin de fichier de l'archive.
 * Les URLs sont mises en cache dans objectUrlCache pour toute la session.
 * La révocation globale est faite à la déconnexion dans handleLogout (dashboard.js).
 */
export function getLocalUrl(jsonPath) {
    if (!jsonPath) return "";
    const cleanPath = jsonPath.startsWith('/') ? jsonPath.substring(1) : jsonPath;

    if (objectUrlCache.has(cleanPath)) return objectUrlCache.get(cleanPath);

    let file = fileMap[cleanPath] || null;

    if (!file) {
        const fileName = cleanPath.split('/').pop();
        for (const folder of ["Photos/post/", "Photos/profile/", "Photos/bereal/"]) {
            if (fileMap[folder + fileName]) { file = fileMap[folder + fileName]; break; }
        }
    }

    if (file) {
        const url = URL.createObjectURL(file);
        objectUrlCache.set(cleanPath, url);
        return url;
    }

    console.warn("Fichier non trouvé :", cleanPath);
    return "";
}


/**
 * Synchronise la hauteur de la carte (fix iOS/PWA)
 */
export function syncPWAHeight() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    const vh = window.innerHeight;
    if (mapEl.style.height !== vh + 'px') {
        mapEl.style.height = vh + 'px';
        if (_mapRef?.resize) _mapRef.resize();
    }
}

// Écoute les événements de redimensionnement
window.addEventListener('resize', syncPWAHeight);
window.addEventListener('orientationchange', syncPWAHeight);
[0, 100, 500, 1000, 3000].forEach(delay => setTimeout(syncPWAHeight, delay));
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
 * Les URLs sont mises en cache dans objectUrlCache pour éviter les doublons.
 * Les URLs créées pour le modal courant sont trackées dans _modalUrlKeys
 * afin d'être révoquées à la fermeture du modal (libération mémoire).
 */
const _modalUrlKeys = new Set(); // clés des URLs créées pour le modal ouvert

export function getLocalUrl(jsonPath) {
    if (!jsonPath) return "";
    let cleanPath = jsonPath.startsWith('/') ? jsonPath.substring(1) : jsonPath;

    if (objectUrlCache.has(cleanPath)) {
        _modalUrlKeys.add(cleanPath); // déjà en cache, on note quand même pour tracking
        return objectUrlCache.get(cleanPath);
    }

    let file = fileMap[cleanPath] || null;

    if (!file) {
        const fileName = cleanPath.split('/').pop();
        const foldersToTry = ["Photos/post/", "Photos/profile/", "Photos/bereal/"];
        for (let folder of foldersToTry) {
            if (fileMap[folder + fileName]) { file = fileMap[folder + fileName]; break; }
        }
    }

    if (file) {
        const newUrl = URL.createObjectURL(file);
        objectUrlCache.set(cleanPath, newUrl);
        _modalUrlKeys.add(cleanPath);
        return newUrl;
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
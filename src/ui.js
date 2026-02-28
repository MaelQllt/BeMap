/**
 * UI.JS — Fonctions d'interface extraites de app.js
 * Toast, loader stats, bandeau relocation
 */

// --- TOAST INLINE CARTE ---
export function showMapToast(message, type = 'success') {
    const existing = document.getElementById('map-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'map-toast';
    toast.className = type === 'error' ? 'map-toast map-toast--error' : 'map-toast';
    toast.innerText = message;

    document.getElementById('map').appendChild(toast);
    toast.getBoundingClientRect();
    toast.classList.add('map-toast--visible');

    setTimeout(() => { toast.classList.remove('map-toast--visible'); }, 2200);
    setTimeout(() => { toast.remove(); }, 2700);
}

// --- LOADER STATS ---
let _statsLoaderTimer = null;

export function showStatsLoader(visible, bannerWasVisible = false) {
    clearTimeout(_statsLoaderTimer);
    const isMobile = window.matchMedia('(pointer: coarse)').matches;

    if (visible) {
        const delay = (isMobile && bannerWasVisible) ? 370 : 0;
        _statsLoaderTimer = setTimeout(() => {
            if (document.getElementById('stats-loader')) return;
            const loader = document.createElement('div');
            loader.id = 'stats-loader';
            loader.className = 'map-stats-loader';
            loader.innerText = 'Repositionnement en cours…';
            document.getElementById('map').appendChild(loader);
        }, delay);
    } else {
        document.getElementById('stats-loader')?.remove();
    }
}

// --- BANDEAU RELOCATION ---
export function showRelocationBanner(onCancel) {
    if (document.getElementById('relocation-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'relocation-banner';
    banner.className = 'relocation-banner';
    banner.innerHTML = `
        <span class="relocation-banner__text">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.7"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
            Tape sur la carte pour repositionner
        </span>
        <button class="relocation-banner__cancel" id="relocation-cancel-btn">Annuler</button>
    `;
    document.getElementById('map').appendChild(banner);

    requestAnimationFrame(() => requestAnimationFrame(() => banner.classList.add('relocation-banner--visible')));

    document.getElementById('relocation-cancel-btn').addEventListener('click', onCancel);
}

export function hideRelocationBanner() {
    const banner = document.getElementById('relocation-banner');
    if (!banner) return;
    banner.classList.remove('relocation-banner--visible');
    setTimeout(() => banner.remove(), 350);
}

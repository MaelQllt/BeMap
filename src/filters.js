/**
 * FILTERS.JS — Modal filtres draggable + repliable
 * Corrections : badge uniquement si filtre actif, positioning amélioré,
 * toggle onTime, labels BeLate/BeReal, snap dans l'écran au dépliage,
 * fermeture auto sur app:modal-open.
 */

import { allMemoriesData }                                        from './state.js';
import { getActiveFilters, hasActiveFilters, applyFiltersToData } from './filter-core.js';
import { applyFiltersToMap, openTimeline, getIsTimelineOpen }     from './timeline.js';

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

let isFiltersOpen  = false;
let isCollapsed    = false;
let isDragging     = false;
let dragOffsetX    = 0;
let dragOffsetY    = 0;
let hasBeenDragged = false;

// --- INIT ---
export function initFilters() {
    document.getElementById('filters-toggle-btn')?.addEventListener('click',   toggleFilters);
    document.getElementById('filters-close-btn')?.addEventListener('click',    closeFilters);
    document.getElementById('filters-reset-btn')?.addEventListener('click',    resetFilters);
    document.getElementById('filters-collapse-btn')?.addEventListener('click', toggleCollapse);

    // Ferme automatiquement si un modal BeReal ou Dashboard s'ouvre
    document.addEventListener('app:modal-open', closeFilters);

    // Raccourci clavier F
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'F' || e.key === 'f') toggleFilters();
    });

    // Clic en dehors = replie (si ouvert et pas déjà replié)
    document.addEventListener('click', (e) => {
        if (!isFiltersOpen || isCollapsed) return;
        const modal   = document.getElementById('filters-modal');
        const toggler = document.getElementById('filters-toggle-btn');
        if (!modal || !toggler) return;
        if (!modal.contains(e.target) && !toggler.contains(e.target)) {
            toggleCollapse();
        }
    });

    initDrag();
}

// --- DRAG ---
function initDrag() {
    const modal  = document.getElementById('filters-modal');
    const handle = document.querySelector('.filters-drag-handle');
    if (!modal || !handle) return;

    const startDrag = (clientX, clientY) => {
        isDragging = true;
        const rect  = modal.getBoundingClientRect();
        dragOffsetX = clientX - rect.left;
        dragOffsetY = clientY - rect.top;
        modal.style.transition = 'opacity 0.25s ease, transform 0.3s cubic-bezier(0.16,1,0.3,1)';
        modal.style.bottom = 'auto';
        modal.style.right  = 'auto';
        modal.style.left   = rect.left + 'px';
        modal.style.top    = rect.top  + 'px';
    };

    const moveDrag = (clientX, clientY) => {
        if (!isDragging) return;
        hasBeenDragged = true;
        const x = Math.max(8, Math.min(clientX - dragOffsetX, window.innerWidth  - modal.offsetWidth  - 8));
        const y = Math.max(8, Math.min(clientY - dragOffsetY, window.innerHeight - modal.offsetHeight - 8));
        modal.style.left = x + 'px';
        modal.style.top  = y + 'px';
    };

    const endDrag = () => { isDragging = false; };

    handle.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        startDrag(e.clientX, e.clientY);
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    document.addEventListener('mouseup',   endDrag);

    handle.addEventListener('touchstart', (e) => {
        if (e.target.closest('button')) return;
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    // touchmove sur le handle avec passive:false pour bloquer le scroll carte pendant le drag
    handle.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    document.addEventListener('touchend', endDrag);
}

// --- BUILD UI ---
export function buildFiltersUI() {
    if (!allMemoriesData.length) return;
    const years = [...new Set(
        allMemoriesData.filter(m => m.takenTime)
            .map(m => new Date(m.takenTime).getFullYear().toString())
    )].sort();
    renderYearButtons(years);
    renderMonthButtons();
    renderOnTimeButtons();
    updateFilterBadge();
}

// --- TOGGLE PANEL ---
function toggleFilters() {
    if (isFiltersOpen) closeFilters();
    else openFiltersModal();
}

function openFiltersModal() {
    isFiltersOpen = true;
    isCollapsed   = false;
    buildFiltersUI();
    updateResultCount();

    const modal   = document.getElementById('filters-modal');
    const toggler = document.getElementById('filters-toggle-btn');
    if (!modal || !toggler) return;

    modal.classList.remove('filters-modal--collapsed');
    updateCollapsedTitle(); // S'assure que le titre est "Filtres" à la réouverture

    // Position : au-dessus du bouton, sauf si l'user l'a déjà déplacé
    if (!hasBeenDragged) {
        // Calcule après un frame pour avoir les bonnes dimensions
        modal.style.visibility = 'hidden';
        modal.classList.add('filters-modal--visible');

        requestAnimationFrame(() => {
            const btnRect     = toggler.getBoundingClientRect();
            const modalW      = modal.offsetWidth  || 300;
            const modalH      = modal.offsetHeight || 360;
            const gap         = 10;

            let left = btnRect.right - modalW;
            let top  = btnRect.top - modalH - gap;

            left = Math.max(8, Math.min(left, window.innerWidth  - modalW - 8));
            top  = Math.max(8, top);

            modal.style.bottom = 'auto';
            modal.style.right  = 'auto';
            modal.style.left   = left + 'px';
            modal.style.top    = top  + 'px';
            modal.style.transformOrigin = 'bottom right';
            modal.style.visibility = '';
        });
    } else {
        modal.classList.add('filters-modal--visible');
    }

    toggler.classList.add('filter-btn--active');
}

export function closeFilters() {
    if (!isFiltersOpen) return;
    isFiltersOpen = false;
    document.getElementById('filters-modal')?.classList.remove('filters-modal--visible');
    updateFilterBadge(); // badge reste si filtres actifs, disparaît sinon
}

// --- COLLAPSE / EXPAND ---
function toggleCollapse() {
    isCollapsed = !isCollapsed;
    const modal = document.getElementById('filters-modal');

    // Met à jour le titre AVANT la transition pour éviter le flash "..." → emoji
    updateCollapsedTitle();

    if (isCollapsed) {
        // Fermeture : rapide
        modal?.classList.remove('filters-modal--expanding');
        modal?.classList.add('filters-modal--collapsed');
    } else {
        // Dépliage : lent et doux
        modal?.classList.add('filters-modal--expanding');
        modal?.classList.remove('filters-modal--collapsed');
        // Attend la fin pour snapIntoViewport et retire la classe expanding
        modal.addEventListener('transitionend', function onEnd(e) {
            if (e.propertyName !== 'max-height') return;
            modal.removeEventListener('transitionend', onEnd);
            modal.classList.remove('filters-modal--expanding');
            snapIntoViewport(modal);
        });
        updateResultCount();
    }
}

// Remet le modal entièrement dans l'écran après dépliage
function snapIntoViewport(modal) {
    if (!modal) return;
    const rect = modal.getBoundingClientRect();
    let left = parseFloat(modal.style.left) || rect.left;
    let top  = parseFloat(modal.style.top)  || rect.top;

    const overRight  = rect.right  - window.innerWidth  + 8;
    const overBottom = rect.bottom - window.innerHeight + 8;

    if (overRight  > 0) left -= overRight;
    if (overBottom > 0) top  -= overBottom;
    left = Math.max(8, left);
    top  = Math.max(8, top);

    modal.style.left = left + 'px';
    modal.style.top  = top  + 'px';
    modal.style.bottom = 'auto';
    modal.style.right  = 'auto';
    hasBeenDragged = true; // on garde la position calculée
}

function updateCollapsedTitle() {
    const titleEl = document.querySelector('#filters-modal .filters-title');
    if (!titleEl) return;
    const newText = (isCollapsed && hasActiveFilters())
        ? buildFilterSummary()
        : 'Filtres';
    if (titleEl.textContent === newText) return;

    if (isCollapsed) {
        // Repliage : fade out → change → fade in (texte plus court arrive petit)
        titleEl.style.opacity = '0';
        setTimeout(() => {
            titleEl.textContent = newText;
            titleEl.style.opacity = '';
        }, 150);
    } else {
        // Dépliage : change texte immédiatement (on est déjà invisible), puis fade in
        titleEl.style.opacity = '0';
        titleEl.textContent = newText;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => { titleEl.style.opacity = ''; });
        });
    }
}

// Canvas pour mesurer la largeur du texte sans toucher au DOM
const _ctx = document.createElement('canvas').getContext('2d');
function _measure(text, font) {
    _ctx.font = font;
    return _ctx.measureText(text).width;
}

function buildFilterSummary() {
    const f = getActiveFilters();

    // Largeur réelle disponible pour le titre
    const handleEl = document.querySelector('#filters-modal .filters-drag-handle');
    const rightEl  = document.querySelector('#filters-modal .filters-header-right');
    const availW   = handleEl && rightEl
        ? handleEl.offsetWidth - rightEl.offsetWidth - 36
        : 160;

    const font = '500 12px Inter';
    const fits = (t) => _measure(t, font) <= availW;
    const sep  = ' · ';

    const LABELS = { ontime: 'BeReal', late: 'BeLate', bonus: 'BeBonus' };
    const EMOJIS = { ontime: '⏱️',    late: '🐌',      bonus: '🎁'     };
    const MONTH_SHORT = ['J','F','M','Av','Ma','Jn','Jl','Ao','S','O','N','D'];

    const years     = f.years.slice();
    const monthIdxs = f.months.slice();
    const timing    = f.onTime !== 'all' ? f.onTime : null;

    // Toutes les variantes de chaque segment, du plus lisible au plus compact
    const Y  = years.length     ? years.join(', ')                              : null;
    const Ys = years.length     ? years.map(y => "'" + y.slice(2)).join(', ')   : null;
    const M  = monthIdxs.length ? monthIdxs.map(i => MONTH_LABELS[i]).join(', '): null;
    const Ms = monthIdxs.length ? monthIdxs.map(i => MONTH_SHORT[i]).join(',')  : null;
    const T  = timing           ? LABELS[timing]                                : null;
    const Te = timing           ? EMOJIS[timing]                                : null;

    const candidates = [];
    const add = (...parts) => candidates.push(parts.filter(Boolean).join(sep));

    if (years.length && monthIdxs.length && timing) {
        // Tout présent : essaie toutes les combinaisons abrégées, jamais de drop
        add(Y,  M,  T);
        add(Y,  M,  Te);
        add(Y,  Ms, Te);
        add(Ys, M,  Te);
        add(Ys, Ms, Te);
        // Rien ne passe → '…' (pas de drop de segment)
    } else if (years.length && timing) {
        add(Y,  T);
        add(Y,  Te);
        add(Ys, T);
        add(Ys, Te);
    } else if (monthIdxs.length && timing) {
        add(M,  T);
        add(M,  Te);
        add(Ms, Te);
    } else if (years.length && monthIdxs.length) {
        add(Y,  M);
        add(Y,  Ms);
        add(Ys, M);
        add(Ys, Ms);
    } else if (timing) {
        add(T); add(Te);
    } else if (years.length) {
        add(Y); add(Ys);
    } else if (monthIdxs.length) {
        add(M); add(Ms);
    }

    for (const c of candidates) {
        if (c && fits(c)) return c;
    }
    return '…';
}

// --- RENDER BOUTONS ---
function renderYearButtons(years) {
    const container = document.getElementById('filter-years-container');
    if (!container) return;
    container.innerHTML = '';
    const f = getActiveFilters();
    years.forEach(year => {
        const btn = makeChip(year, f.years.includes(year), 'year', () => {
            toggleArrayFilter('years', year);
            btn.classList.toggle('filter-chip--active');
            applyAndRefresh();
        });
        container.appendChild(btn);
    });
}

function renderMonthButtons() {
    const container = document.getElementById('filter-months-container');
    if (!container) return;
    container.innerHTML = '';
    const f = getActiveFilters();
    MONTH_LABELS.forEach((label, i) => {
        const btn = makeChip(label, f.months.includes(i), 'month', () => {
            toggleArrayFilter('months', i);
            btn.classList.toggle('filter-chip--active');
            applyAndRefresh();
        });
        container.appendChild(btn);
    });
}

function renderOnTimeButtons() {
    const options = [
        { value: 'all',    label: 'Tous' },
        { value: 'ontime', label: '⏱️ BeReal' },
        { value: 'late',   label: '🐌 BeLate'  },
        { value: 'bonus',  label: '🎁 BeBonus' }
    ];
    const container = document.getElementById('filter-ontime-container');
    if (!container) return;
    container.innerHTML = '';
    const f = getActiveFilters();
    options.forEach(opt => {
        const btn = makeChip(opt.label, f.onTime === opt.value, 'ontime', (e) => {
            e.stopPropagation();
            // Toggle : si déjà actif, revient à "all"
            f.onTime = (f.onTime === opt.value && opt.value !== 'all') ? 'all' : opt.value;
            // Re-render les boutons pour refléter l'état
            renderOnTimeButtons();
            applyAndRefresh();
        }, 'filter-chip--pill');
        container.appendChild(btn);
    });
}

/**
 * Crée un chip bouton.
 * @param {string} sizeGroup - 'year' | 'month' | 'ontime' — pour aligner les tailles
 */
function makeChip(label, active, sizeGroup, onClick, extraClass = '') {
    const btn = document.createElement('button');
    btn.className = [
        'filter-chip',
        `filter-chip--${sizeGroup}`,
        extraClass,
        active ? 'filter-chip--active' : ''
    ].filter(Boolean).join(' ');
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
}

// --- APPLY ---
function applyAndRefresh() {
    updateFilterBadge();
    updateResultCount();
    updateCollapsedTitle();
    if (getIsTimelineOpen()) openTimeline();
    else applyFiltersToMap();
}

function resetFilters() {
    const f = getActiveFilters();
    f.years = []; f.months = []; f.onTime = 'all';
    buildFiltersUI();
    applyAndRefresh();
}

// --- BADGE (uniquement si filtre réellement actif) ---
function updateFilterBadge() {
    const btn = document.getElementById('filters-toggle-btn');
    if (!btn) return;
    // Bouton "actif" (outline blanc) = ouvert OU filtres appliqués
    const open    = isFiltersOpen;
    const active  = hasActiveFilters();
    btn.classList.toggle('filter-btn--active', open || active);
    // Pastille visible SEULEMENT si au moins un vrai filtre est sélectionné
    btn.classList.toggle('filter-has-active', active);
}

function updateResultCount() {
    const el = document.getElementById('filter-result-count');
    if (!el) return;
    const n = applyFiltersToData(allMemoriesData, getActiveFilters()).length;
    el.textContent = `${n} BeReal${n > 1 ? 's' : ''}`;
}

function toggleArrayFilter(key, value) {
    const arr = getActiveFilters()[key];
    const idx = arr.indexOf(value);
    if (idx === -1) arr.push(value);
    else arr.splice(idx, 1);
}


// --- ATTRIBUTION TOGGLE ---
const attribBtn   = document.getElementById('attrib-btn');
const attribPanel = document.getElementById('attrib-panel');
let attribOpen = false;

attribBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    attribOpen = !attribOpen;
    attribPanel.classList.toggle('attrib-panel--visible', attribOpen);
    attribBtn.classList.toggle('filter-btn--active', attribOpen);
});

document.addEventListener('click', () => {
    if (!attribOpen) return;
    attribOpen = false;
    attribPanel.classList.remove('attrib-panel--visible');
    attribBtn.classList.remove('filter-btn--active');
});
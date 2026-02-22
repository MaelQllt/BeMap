/**
 * FILTERS.JS — Modal filtres draggable + repliable
 */

import { allMemoriesData }                                        from './state.js';
import { getActiveFilters, hasActiveFilters, applyFiltersToData } from './filter-core.js';
import { applyFiltersToMap, openTimeline, getIsTimelineOpen }     from './timeline.js';

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

let isFiltersOpen    = false;
let isCollapsed      = false;
let isDragging       = false;
let dragOffsetX      = 0;
let dragOffsetY      = 0;
let hasBeenDragged   = false; // Mémorise si l'utilisateur a déplacé le modal

// --- INIT ---
export function initFilters() {
    document.getElementById('filters-toggle-btn')?.addEventListener('click', toggleFilters);
    document.getElementById('filters-close-btn')?.addEventListener('click', closeFilters);
    document.getElementById('filters-reset-btn')?.addEventListener('click', resetFilters);
    document.getElementById('filters-collapse-btn')?.addEventListener('click', toggleCollapse);
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
        // Passe en coordonnées top/left absolues
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
    document.addEventListener('mouseup', endDrag);

    handle.addEventListener('touchstart', (e) => {
        if (e.target.closest('button')) return;
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (isDragging) moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
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
    isFiltersOpen  = true;
    isCollapsed    = false;
    buildFiltersUI();
    updateResultCount();

    const modal   = document.getElementById('filters-modal');
    const toggler = document.getElementById('filters-toggle-btn');
    if (!modal || !toggler) return;

    // Si non déplacé par l'utilisateur → positionne au-dessus du bouton
    if (!hasBeenDragged) {
        const btnRect     = toggler.getBoundingClientRect();
        const modalWidth  = 300;
        const modalHeight = 340; // Estimation (vrai offsetHeight pas dispo avant affichage)
        const gap         = 12;

        // Aligne à droite sur le bouton, s'assure de ne pas sortir de l'écran
        let left = btnRect.right - modalWidth;
        let top  = btnRect.top - modalHeight - gap;

        left = Math.max(8, Math.min(left, window.innerWidth  - modalWidth  - 8));
        top  = Math.max(8, top);

        modal.style.bottom = 'auto';
        modal.style.right  = 'auto';
        modal.style.left   = left + 'px';
        modal.style.top    = top  + 'px';
        modal.style.transformOrigin = 'bottom right';
    }

    modal.classList.remove('filters-modal--collapsed');
    modal.classList.add('filters-modal--visible');
    toggler.classList.add('filter-btn--active');
}

export function closeFilters() {
    isFiltersOpen = false;
    document.getElementById('filters-modal')?.classList.remove('filters-modal--visible');
    updateFilterBadge(); // Garde le badge si filtres actifs
}

// --- COLLAPSE / EXPAND ---
function toggleCollapse() {
    isCollapsed = !isCollapsed;
    const modal = document.getElementById('filters-modal');
    modal?.classList.toggle('filters-modal--collapsed', isCollapsed);
    if (!isCollapsed) updateResultCount();
    // Met à jour le titre replié
    updateCollapsedTitle();
}

function updateCollapsedTitle() {
    const titleEl = document.querySelector('#filters-modal .filters-title');
    if (!titleEl) return;
    if (isCollapsed && hasActiveFilters()) {
        titleEl.textContent = buildFilterSummary();
    } else {
        titleEl.textContent = 'Filtres';
    }
}

function buildFilterSummary() {
    const f     = getActiveFilters();
    const parts = [];
    if (f.years.length)  parts.push(f.years.join(', '));
    if (f.months.length) parts.push(f.months.map(i => MONTH_LABELS[i]).join(', '));
    if (f.onTime === 'ontime') parts.push('À l\'heure');
    if (f.onTime === 'late')   parts.push('En retard');
    return parts.length ? parts.join(' · ') : 'Filtres';
}

// --- RENDER BOUTONS ---
function renderYearButtons(years) {
    const container = document.getElementById('filter-years-container');
    if (!container) return;
    container.innerHTML = '';
    const f = getActiveFilters();
    years.forEach(year => {
        const btn = makeChip(year, f.years.includes(year), () => {
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
        const btn = makeChip(label, f.months.includes(i), () => {
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
        { value: 'ontime', label: '⏱ À l\'heure' },
        { value: 'late',   label: '🐌 En retard' }
    ];
    const container = document.getElementById('filter-ontime-container');
    if (!container) return;
    container.innerHTML = '';
    const f = getActiveFilters();
    options.forEach(opt => {
        const btn = makeChip(opt.label, f.onTime === opt.value, () => {
            f.onTime = opt.value;
            container.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('filter-chip--active'));
            btn.classList.add('filter-chip--active');
            applyAndRefresh();
        }, 'filter-chip--pill');
        container.appendChild(btn);
    });
}

function makeChip(label, active, onClick, extraClass = '') {
    const btn = document.createElement('button');
    btn.className = `filter-chip${extraClass ? ' ' + extraClass : ''}${active ? ' filter-chip--active' : ''}`;
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

// --- BADGE & COMPTEUR ---
function updateFilterBadge() {
    const btn = document.getElementById('filters-toggle-btn');
    if (!btn) return;
    btn.classList.toggle('filter-btn--active', hasActiveFilters() || isFiltersOpen);
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
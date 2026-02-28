/**
 * TIMELINE.JS — Mode Timeline / Replay chronologique
 */

import { allMemoriesData }                        from './state.js';
import { map, refreshMapMarkers, updateMapData }  from './map.js';
import { convertMemoriesToGeoJSON }               from './geo-convert.js';
import { getActiveFilters, applyFiltersToData }   from './filter-core.js';

let isTimelineOpen       = false;
let isPlaying            = false;
let playInterval         = null;
let currentTimelineIndex = 0;
let sortedDates          = [];
let playSpeed            = 1;    // 0.5 | 1 | 2
let viewMode             = 'day'; // 'day' | 'month'
let _wasPlayingBeforeSuspend = false; // état lecture avant suspension par modal

// --- INIT ---
export function initTimeline() {
    // Spacer mobile : pousse les boutons vers le haut quand la timeline est ouverte
    const bottomControls = document.querySelector('.bottom-controls');
    if (bottomControls && !document.getElementById('timeline-spacer')) {
        const spacer = document.createElement('div');
        spacer.id = 'timeline-spacer';
        bottomControls.appendChild(spacer);
    }

    document.getElementById('timeline-toggle-btn')?.addEventListener('click', toggleTimeline);
    document.getElementById('timeline-slider')?.addEventListener('input', onSliderInput);
    const playBtn = document.getElementById('timeline-play-btn');
    playBtn?.addEventListener('click', togglePlay);
    playBtn?.addEventListener('touchend', (e) => {
        e.preventDefault();
        togglePlay();
    }, { passive: false });
    document.getElementById('timeline-close-btn')?.addEventListener('click', closeTimeline);
    document.getElementById('timeline-speed-btn')?.addEventListener('click', cycleSpeed);
    document.getElementById('timeline-mode-btn')?.addEventListener('click', toggleMode);
    // Suspension/reprise : on ne ferme plus la timeline quand un modal BeReal s'ouvre.
    // On la masque visuellement et on mémorise si elle jouait, pour reprendre après fermeture.
    document.addEventListener('app:modal-open',  suspendTimeline);
    document.addEventListener('app:modal-close', resumeTimeline);

    // Raccourcis clavier
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'T' || e.key === 't') toggleTimeline();
        if (e.key === 'Escape' && isTimelineOpen) closeTimeline();
        // Espace = play/pause si la timeline est ouverte (preventDefault évite le scroll)
        if (e.key === ' ' && isTimelineOpen) { e.preventDefault(); togglePlay(); }
    });
}

// --- OPEN / CLOSE ---
export function openTimeline() {
    if (!allMemoriesData.length) return;
    isTimelineOpen = true;
    buildSortedDates();

    document.getElementById('timeline-panel')?.classList.add('timeline-panel--visible');
    document.getElementById('timeline-toggle-btn')?.classList.add('timeline-btn--active');
    document.getElementById('timeline-spacer')?.classList.add('timeline-spacer--open');

    const slider = document.getElementById('timeline-slider');
    if (slider) {
        slider.min   = 0;
        slider.max   = sortedDates.length - 1;
        slider.value = 0;
    }
    currentTimelineIndex = 0;
    renderAtIndex(currentTimelineIndex);
    updateTimelineLabel(currentTimelineIndex);
}

export function closeTimeline() {
    isTimelineOpen = false;
    stopPlay();
    _wasPlayingBeforeSuspend = false;
    document.getElementById('timeline-panel')?.classList.remove('timeline-panel--visible');
    document.getElementById('timeline-toggle-btn')?.classList.remove('timeline-btn--active');
    document.getElementById('timeline-spacer')?.classList.remove('timeline-spacer--open');
    applyFiltersToMap();
}

// Masque le panel et met en pause sans toucher à l'état ni à la carte.
// Appelé quand un modal BeReal/cluster s'ouvre par-dessus la timeline.
function suspendTimeline() {
    if (!isTimelineOpen) return;
    _wasPlayingBeforeSuspend = isPlaying;
    if (isPlaying) stopPlay();
    document.getElementById('timeline-panel')?.classList.remove('timeline-panel--visible');
}

// Rétablit le panel et reprend la lecture si elle était active avant la suspension.
// Appelé à la fermeture du modal BeReal/cluster.
function resumeTimeline() {
    if (!isTimelineOpen) return;
    document.getElementById('timeline-panel')?.classList.add('timeline-panel--visible');
    if (_wasPlayingBeforeSuspend) startPlay();
    _wasPlayingBeforeSuspend = false;
}

function toggleTimeline() {
    if (isTimelineOpen) closeTimeline();
    else openTimeline();
}

export function getIsTimelineOpen() { return isTimelineOpen; }

// --- DATES UNIQUES TRIÉES ---
function buildSortedDates() {
    const filters  = getActiveFilters();
    const filtered = applyFiltersToData(allMemoriesData, filters);
    if (viewMode === 'month') {
        const monthSet = new Set(
            filtered.filter(m => m.takenTime).map(m => m.takenTime.slice(0, 7)) // YYYY-MM
        );
        sortedDates = [...monthSet].sort();
    } else {
        const dateSet = new Set(
            filtered.filter(m => m.takenTime).map(m => m.takenTime.split('T')[0])
        );
        sortedDates = [...dateSet].sort();
    }
}

// --- RENDU À UN INDEX ---
function renderAtIndex(index) {
    if (!sortedDates.length) return;
    currentTimelineIndex = index;

    const cutoff  = sortedDates[index];
    const filters = getActiveFilters();
    const filtered = applyFiltersToData(allMemoriesData, filters)
        .filter(m => {
            if (!m.takenTime) return false;
            const key = viewMode === 'month' ? m.takenTime.slice(0, 7) : m.takenTime.split('T')[0];
            return key <= cutoff;
        });

    updateMapData(convertMemoriesToGeoJSON(filtered));
    // Passe le count directement pour éviter un double applyFiltersToData
    updateTimelineLabel(index, filtered.length);
    updateSliderProgress(index);
}

// --- LABEL DATE ---
function updateTimelineLabel(index, count) {
    const label = document.getElementById('timeline-date-label');
    if (!label || !sortedDates.length) return;

    const key = sortedDates[index];
    let formatted;
    if (viewMode === 'month') {
        const d = new Date(key + '-01T12:00:00');
        formatted = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    } else {
        const d = new Date(key + 'T12:00:00');
        formatted = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    // Si count non fourni (appel direct depuis openTimeline), le calcule
    if (count === undefined) {
        const filters = getActiveFilters();
        count = applyFiltersToData(allMemoriesData, filters)
            .filter(m => {
                if (!m.takenTime) return false;
                const k = viewMode === 'month' ? m.takenTime.slice(0, 7) : m.takenTime.split('T')[0];
                return k <= key;
            }).length;
    }

    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    let dateHtml;
    if (isMobile) {
        const key2 = sortedDates[index];
        let line1, line2;
        if (viewMode === 'month') {
            const d2 = new Date(key2 + '-01T12:00:00');
            const month = d2.toLocaleDateString('fr-FR', { month: 'long' });
            line1 = month.charAt(0).toUpperCase() + month.slice(1);
            line2 = d2.getFullYear().toString();
        } else {
            const d2 = new Date(key2 + 'T12:00:00');
            line1 = `${d2.getDate()} ${d2.toLocaleDateString('fr-FR', { month: 'long' })}`;
            line2 = d2.getFullYear().toString();
        }
        dateHtml = `<span class="timeline-date"><span class="tl-line">${line1}</span><span class="tl-line">${line2}</span></span>`;
    } else {
        dateHtml = `<span class="timeline-date">${formatted}</span>`;
    }
    label.innerHTML = `${dateHtml}<span class="timeline-count">${count} BeReal${count > 1 ? 's' : ''}</span>`;
}

// --- PROGRESS SLIDER ---
function updateSliderProgress(index) {
    const slider = document.getElementById('timeline-slider');
    if (!slider) return;
    const pct = sortedDates.length > 1 ? (index / (sortedDates.length - 1)) * 100 : 100;
    slider.style.setProperty('--progress', `${pct}%`);
}

// --- SLIDER INPUT ---
function onSliderInput(e) { renderAtIndex(parseInt(e.target.value, 10)); }

// --- PLAY / PAUSE ---
function togglePlay() { isPlaying ? stopPlay() : startPlay(); }

function startPlay() {
    if (!sortedDates.length) return;
    isPlaying = true;
    document.getElementById('timeline-play-btn')?.classList.add('playing');

    if (currentTimelineIndex >= sortedDates.length - 1) {
        currentTimelineIndex = 0;
        const slider = document.getElementById('timeline-slider');
        if (slider) slider.value = 0;
        renderAtIndex(0);
    }

    const ms = Math.round(180 / playSpeed);
    playInterval = setInterval(() => {
        if (currentTimelineIndex >= sortedDates.length - 1) { stopPlay(); return; }
        currentTimelineIndex++;
        const slider = document.getElementById('timeline-slider');
        if (slider) slider.value = currentTimelineIndex;
        renderAtIndex(currentTimelineIndex);
    }, ms);
}

function stopPlay() {
    isPlaying = false;
    clearInterval(playInterval);
    playInterval = null;
    document.getElementById('timeline-play-btn')?.classList.remove('playing');
}

// --- VITESSE ---
const SPEEDS     = [0.5, 1, 2];
const SPEED_LABELS = { 0.5: '×0.5', 1: '×1', 2: '×2' };

function cycleSpeed() {
    const idx  = SPEEDS.indexOf(playSpeed);
    playSpeed  = SPEEDS[(idx + 1) % SPEEDS.length];
    const btn  = document.getElementById('timeline-speed-btn');
    if (btn) btn.textContent = SPEED_LABELS[playSpeed];
    // Si en cours de lecture, relance avec la nouvelle vitesse
    if (isPlaying) { stopPlay(); startPlay(); }
}

// --- MODE JOUR / MOIS ---
function toggleMode() {
    viewMode   = viewMode === 'day' ? 'month' : 'day';
    const btn  = document.getElementById('timeline-mode-btn');
    if (btn) {
        btn.textContent = viewMode === 'day' ? 'Jour' : 'Mois';
        btn.classList.toggle('timeline-ctrl-pill--active', viewMode === 'month');
    }
    if (isTimelineOpen) {
        stopPlay();
        openTimeline();
    }
}

// --- APPLIQUER FILTRES SANS CONTRAINTE DE DATE ---
export function applyFiltersToMap() {
    const filters  = getActiveFilters();
    const filtered = applyFiltersToData(allMemoriesData, filters);
    const src = map.getSource('bereal-src');
    if (src) {
        updateMapData(convertMemoriesToGeoJSON(filtered));
    } else {
        refreshMapMarkers(filtered, convertMemoriesToGeoJSON);
    }
}
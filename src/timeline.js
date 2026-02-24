/**
 * TIMELINE.JS — Mode Timeline / Replay chronologique
 */

import { allMemoriesData }                        from './state.js';
import { map, refreshMapMarkers, updateMapData }  from './map.js';
import { convertMemoriesToGeoJSON }               from './app.js';
import { getActiveFilters, applyFiltersToData }   from './filter-core.js';

let isTimelineOpen       = false;
let isPlaying            = false;
let playInterval         = null;
let currentTimelineIndex = 0;
let sortedDates          = [];

// --- INIT ---
export function initTimeline() {
    document.getElementById('timeline-toggle-btn')?.addEventListener('click', toggleTimeline);
    document.getElementById('timeline-slider')?.addEventListener('input', onSliderInput);
    document.getElementById('timeline-play-btn')?.addEventListener('click', togglePlay);
    document.getElementById('timeline-close-btn')?.addEventListener('click', closeTimeline);
    // Se ferme automatiquement quand un BeReal ou le Dashboard s'ouvre
    document.addEventListener('app:modal-open', closeTimeline);
}

// --- OPEN / CLOSE ---
export function openTimeline() {
    if (!allMemoriesData.length) return;
    isTimelineOpen = true;
    buildSortedDates();

    document.getElementById('timeline-panel')?.classList.add('timeline-panel--visible');
    document.getElementById('timeline-toggle-btn')?.classList.add('timeline-btn--active');

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
    document.getElementById('timeline-panel')?.classList.remove('timeline-panel--visible');
    document.getElementById('timeline-toggle-btn')?.classList.remove('timeline-btn--active');
    applyFiltersToMap();
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
    const dateSet  = new Set(
        filtered.filter(m => m.takenTime).map(m => m.takenTime.split('T')[0])
    );
    sortedDates = [...dateSet].sort();
}

// --- RENDU À UN INDEX ---
function renderAtIndex(index) {
    if (!sortedDates.length) return;
    currentTimelineIndex = index;

    const cutoffDate = sortedDates[index];
    const filters    = getActiveFilters();
    const filtered   = applyFiltersToData(allMemoriesData, filters)
        .filter(m => m.takenTime && m.takenTime.split('T')[0] <= cutoffDate);

    // setData() fluide au lieu de reconstruire toute la source
    updateMapData(convertMemoriesToGeoJSON(filtered));
    updateTimelineLabel(index);
    updateSliderProgress(index);
}

// --- LABEL DATE ---
function updateTimelineLabel(index) {
    const label = document.getElementById('timeline-date-label');
    if (!label || !sortedDates.length) return;

    const dateStr   = sortedDates[index];
    const d         = new Date(dateStr + 'T12:00:00');
    const formatted = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const filters   = getActiveFilters();
    const count     = applyFiltersToData(allMemoriesData, filters)
        .filter(m => m.takenTime && m.takenTime.split('T')[0] <= dateStr).length;

    label.innerHTML = `<span class="timeline-date">${formatted}</span><span class="timeline-count">${count} BeReal${count > 1 ? 's' : ''}</span>`;
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

    playInterval = setInterval(() => {
        if (currentTimelineIndex >= sortedDates.length - 1) { stopPlay(); return; }
        currentTimelineIndex++;
        const slider = document.getElementById('timeline-slider');
        if (slider) slider.value = currentTimelineIndex;
        renderAtIndex(currentTimelineIndex);
    }, 180);
}

function stopPlay() {
    isPlaying = false;
    clearInterval(playInterval);
    playInterval = null;
    document.getElementById('timeline-play-btn')?.classList.remove('playing');
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
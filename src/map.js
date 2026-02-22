/**
 * MAP.JS — Gestion de la carte MapLibre, layers et contrôles
 */

import { clusterMarkers, setClusterMarkers, isUiLocked, setIsUiLocked, allMemoriesData, isRelocating, memoryToUpdate, setIsRelocating } from './state.js';
import { openModal } from './modal.js';

export let currentRadiusMode = 60;

// --- INITIALISATION DE LA CARTE ---
export const map = new maplibregl.Map({
    container: 'map',
    style: 'https://api.maptiler.com/maps/dataviz-dark/style.json?key=iYlIQdqzuS2kKjZemTWi',
    center: [2.21, 46.22],
    zoom: 5.5,
    maxZoom: 17,
    pitch: 0,
    antialias: true
});

// --- BÂTIMENTS 3D ---
export function setup3DBuildings() {
    const sourceId = map.getSource('openmaptiles') ? 'openmaptiles' : 'maptiler_planet';
    if (!map.getLayer('3d-buildings')) {
        map.addLayer({
            'id': '3d-buildings',
            'source': sourceId,
            'source-layer': 'building',
            'type': 'fill-extrusion',
            'minzoom': 15,
            'paint': {
                'fill-extrusion-color': '#2a2a2b',
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 20],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
                'fill-extrusion-opacity': 0,
                'fill-extrusion-opacity-transition': { duration: 500 }
            }
        });
    }
}

function update3DVisibility() {
    if (!map.getLayer('3d-buildings')) return;
    const pitch = map.getPitch();
    const zoom = map.getZoom();
    const shouldShow = pitch > 25 && zoom > 15;
    const targetOpacity = shouldShow ? 0.8 : 0;
    const currentOpacity = map.getPaintProperty('3d-buildings', 'fill-extrusion-opacity');
    if (currentOpacity !== targetOpacity) {
        map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', targetOpacity);
    }
}

map.on('style.load', () => setup3DBuildings());
map.on('move', update3DVisibility);

// --- FOCUS MAP (flou quand une modale est ouverte) ---
export function setMapFocus(isFocus) {
    setIsUiLocked(isFocus);
    const mapEl = document.getElementById('map');
    const badge = document.querySelector('.user-profile-header');

    if (isFocus) {
        mapEl.style.transform = 'scale(1.05)';
        mapEl.style.filter = 'blur(5px) brightness(0.4)';
        badge.style.filter = 'blur(3px)';
        badge.style.pointerEvents = 'none';
        [northBtn, pitchBtn].forEach(btn => btn?.classList.remove('visible'));
    } else {
        mapEl.style.transform = 'scale(1)';
        mapEl.style.filter = 'none';
        badge.style.filter = 'none';
        badge.style.pointerEvents = 'auto';
        updateMapControls();
    }
}

// --- LAYERS ---
export function reAddLayers() {
    map.addLayer({ id: 'clusters', type: 'circle', source: 'bereal-src', filter: ['has', 'point_count'], paint: { 'circle-color': '#151517', 'circle-radius': 18, 'circle-stroke-width': 1, 'circle-stroke-color': '#d9d9d960' } });
    map.addLayer({ id: 'unclustered-point', type: 'circle', source: 'bereal-src', filter: ['!', ['has', 'point_count']], paint: { 'circle-opacity': 0, 'circle-radius': 15 } });
}

export function setupMapLayers(features) {
    if (map.getSource('bereal-src')) return;

    map.addSource('bereal-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
        cluster: true,
        clusterMaxZoom: 22,
        clusterRadius: 50
    });

    reAddLayers();

    // Markers HTML personnalisés
    map.on('render', () => {
        const newMarkers = {};
        const featuresOnScreen = map.querySourceFeatures('bereal-src');

        for (const feature of featuresOnScreen) {
            const coords = feature.geometry.coordinates;
            const props = feature.properties;
            const id = props.cluster ? `c-${props.cluster_id}` : `p-${coords.join(',')}`;
            newMarkers[id] = true;

            if (!clusterMarkers[id]) {
                const el = document.createElement('div');
                el.className = 'marker-anchor';
                const inner = document.createElement('div');
                inner.className = props.cluster ? 'custom-cluster-label' : 'custom-point-marker';
                if (props.cluster) inner.innerText = props.point_count;
                el.appendChild(inner);
                clusterMarkers[id] = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(coords).addTo(map);
            }
        }
        for (const id in clusterMarkers) {
            if (!newMarkers[id]) { clusterMarkers[id].remove(); delete clusterMarkers[id]; }
        }
    });

    // Clics clusters
    map.on('click', 'clusters', (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
        const clusterId = f.properties.cluster_id;
        const coords = f.geometry.coordinates;
        const currentZoom = map.getZoom();

        if ((Math.abs(coords[0]) < 0.1 && Math.abs(coords[1]) < 0.1) || currentZoom >= 16) {
            map.getSource('bereal-src').getClusterLeaves(clusterId, Infinity, 0, (err, leaves) => {
                if (!err) openModal(leaves.map(l => l.properties).sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate)));
            });
        } else {
            map.getSource('bereal-src').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (!err) map.easeTo({ center: coords, zoom: Math.min(zoom, 16.5) });
            });
        }
    });

    map.on('click', 'unclustered-point', (e) => openModal([e.features[0].properties]));
    map.on('mouseenter', 'clusters', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'clusters', () => map.getCanvas().style.cursor = '');
}

export function refreshMapMarkers(data, convertMemoriesToGeoJSON) {
    Object.values(clusterMarkers).forEach(m => m.remove());
    setClusterMarkers({});

    const newFeatures = convertMemoriesToGeoJSON(data);

    if (map.getSource('bereal-src')) {
        if (map.getLayer('clusters')) map.removeLayer('clusters');
        if (map.getLayer('unclustered-point')) map.removeLayer('unclustered-point');
        map.removeSource('bereal-src');
    }

    map.addSource('bereal-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: JSON.parse(JSON.stringify(newFeatures)) },
        cluster: true,
        clusterMaxZoom: 22,
        clusterRadius: currentRadiusMode
    });

    reAddLayers();
    map.triggerRepaint();
}

export function watchZoomRadius(data, refreshFn) {
    map.on('zoomend', () => {
        const zoom = map.getZoom();
        const newRadius = zoom >= 16 ? 80 : 50;
        if (newRadius !== currentRadiusMode) {
            currentRadiusMode = newRadius;
            refreshFn(data);
        }
    });
}

// --- CONTRÔLES CARTE (Nord/Pitch) ---
const northBtn = document.getElementById('north-button');
const pitchBtn = document.getElementById('pitch-button');
const pitchLine = document.getElementById('pitch-line');
const pitchArc = document.getElementById('pitch-arc');
const northIcon = northBtn?.querySelector('svg');

function getPitchArcPath(pitch) {
    const radius = 8, centerX = 7, centerY = 17;
    const angleRad = (pitch * Math.PI) / 180;
    const endX = centerX + radius * Math.cos(-angleRad);
    const endY = centerY + radius * Math.sin(-angleRad);
    return `M ${centerX + radius} ${centerY} A ${radius} ${radius} 0 0 0 ${endX} ${endY}`;
}

export function updateMapControls() {
    if (isUiLocked) return;
    const bearing = map.getBearing();
    const pitch = map.getPitch();
    const isRotated = Math.abs(bearing) > 0.5;
    const isPitched = pitch > 0.5;

    if (isPitched) {
        pitchBtn?.classList.add('visible');
        if (pitchLine) { pitchLine.style.transformOrigin = "7px 17px"; pitchLine.style.transform = `rotate(${-pitch}deg)`; }
        if (pitchArc) pitchArc.setAttribute('d', getPitchArcPath(pitch));
    } else {
        pitchBtn?.classList.remove('visible');
    }

    if (isRotated) {
        northBtn?.classList.add('visible');
        if (northIcon) northIcon.style.transform = `rotate(${-bearing}deg)`;
    } else {
        northBtn?.classList.remove('visible');
    }
}

['rotate', 'pitch', 'move'].forEach(evt => map.on(evt, updateMapControls));

northBtn?.addEventListener('click', () => { map.easeTo({ bearing: 0, duration: 800 }); setTimeout(updateMapControls, 10); });
pitchBtn?.addEventListener('click', () => map.easeTo({ pitch: 0, duration: 800 }));

/**
 * MAP.JS — Gestion de la carte MapLibre, layers et contrôles
 */

import { clusterMarkers, setClusterMarkers, isUiLocked, setIsUiLocked } from './state.js';
import { openModal } from './modal.js';

// Rayon de clustering courant (change selon le zoom)
export let currentRadiusMode = 60;

// --- INITIALISATION DE LA CARTE ---
export const map = new maplibregl.Map({
    container: 'map',
    style: 'https://api.maptiler.com/maps/dataviz-dark/style.json?key=iYlIQdqzuS2kKjZemTWi',
    center: [2.21, 46.22],
    zoom: 5.5,
    maxZoom: 17,
    maxPitch: 85,
    pitch: 0,
    antialias: true
});

// --- BÂTIMENTS 3D ---
export function setup3DBuildings() {
    const sourceId = map.getSource('openmaptiles') ? 'openmaptiles' : 'maptiler_planet';
    if (map.getLayer('3d-buildings')) return;
    map.addLayer({
        id: '3d-buildings',
        source: sourceId,
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 15,
        paint: {
            'fill-extrusion-color': '#2a2a2b',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 20],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
            'fill-extrusion-opacity': 0,
            'fill-extrusion-opacity-transition': { duration: 500 }
        }
    });
}

function update3DVisibility() {
    if (!map.getLayer('3d-buildings')) return;
    const shouldShow = map.getPitch() > 25 && map.getZoom() > 16;
    const targetOpacity = shouldShow ? 0.8 : 0;
    if (map.getPaintProperty('3d-buildings', 'fill-extrusion-opacity') !== targetOpacity) {
        map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', targetOpacity);
    }
}

// --- TERRAIN / MNT ---
let terrainEnabled = false;

export function toggleTerrain() {
    terrainEnabled = !terrainEnabled;
    const btn = document.getElementById('terrain-button');

    if (terrainEnabled) {
        if (!map.getSource('hillshade-source')) {
            map.addSource('hillshade-source', {
                type: 'raster-dem',
                url: 'https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=iYlIQdqzuS2kKjZemTWi',
                tileSize: 256
            });
        }
        if (!map.getSource('terrain-source')) {
            map.addSource('terrain-source', {
                type: 'raster-dem',
                url: 'https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=iYlIQdqzuS2kKjZemTWi',
                tileSize: 512
            });
        }

        if (!map.getLayer('hillshade-layer')) {
            const firstSymbol = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
            map.addLayer({
                id: 'hillshade-layer',
                type: 'hillshade',
                source: 'hillshade-source',
                paint: {
                    'hillshade-shadow-color':           '#000000',
                    'hillshade-highlight-color':        '#ffffff',
                    'hillshade-accent-color':           '#000000',
                    'hillshade-illumination-direction': 335,
                    'hillshade-exaggeration':           0.45,
                    'hillshade-illumination-anchor':    'map'
                }
            }, firstSymbol);
        } else {
            map.setLayoutProperty('hillshade-layer', 'visibility', 'visible');
        }

        map.setTerrain({ source: 'terrain-source', exaggeration: 1.3 });
        btn?.classList.add('active');
    } else {
        if (map.getLayer('hillshade-layer')) {
            map.setLayoutProperty('hillshade-layer', 'visibility', 'none');
        }
        map.setTerrain(null);
        btn?.classList.remove('active');
    }
}

export function setupTerrain() {
    // Terrain activé à la demande via toggleTerrain()
}

map.on('style.load', () => { setup3DBuildings(); setupTerrain(); });
['moveend', 'pitchend', 'zoomend'].forEach(evt => map.on(evt, update3DVisibility));

// --- FOCUS MAP ---
export function setMapFocus(isFocus) {
    setIsUiLocked(isFocus);
    const mapEl = document.getElementById('map');
    const badge = document.querySelector('.user-profile-header');
    const controls = document.querySelector('.map-controls');

    if (isFocus) {
        mapEl.style.transform = 'scale(1.05)';
        mapEl.style.filter = 'blur(5px) brightness(0.4)';
        badge.style.filter = 'blur(3px)';
        badge.style.pointerEvents = 'none';
        controls?.classList.add('frozen');
    } else {
        mapEl.style.transform = 'scale(1)';
        mapEl.style.filter = 'none';
        badge.style.filter = 'none';
        badge.style.pointerEvents = 'auto';
        controls?.classList.remove('frozen');
        updateMapControls();
    }
}

// --- LAYERS ---
export function reAddLayers() {
    map.addLayer({
        id: 'clusters', type: 'circle', source: 'bereal-src',
        filter: ['has', 'point_count'],
        paint: { 'circle-opacity': 0, 'circle-radius': 0 }
    });
    map.addLayer({
        id: 'unclustered-point', type: 'circle', source: 'bereal-src',
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-opacity': 0, 'circle-radius': 0 }
    });
}

export function setupMapLayers(features) {
    if (map.getSource('bereal-src')) return;

    map.addSource('bereal-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
        cluster: true,
        clusterMaxZoom: 17,
        clusterRadius: currentRadiusMode
    });

    reAddLayers();

    map.on('render', () => {
        const newMarkers = {};
        for (const feature of map.querySourceFeatures('bereal-src')) {
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

                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (props.cluster) {
                        const currentZoom = map.getZoom();
                        map.getSource('bereal-src').getClusterExpansionZoom(props.cluster_id, (err, expansionZoom) => {
                            if (err) return;
                            const isNullIsland = Math.abs(coords[0]) < 0.1 && Math.abs(coords[1]) < 0.1;
                            const MAX_ZOOM = 16;
                            const willExpand = expansionZoom <= MAX_ZOOM && !isNullIsland;
                            if (willExpand) {
                                map.easeTo({ center: coords, zoom: Math.min(expansionZoom, MAX_ZOOM) });
                            } else {
                                map.getSource('bereal-src').getClusterLeaves(props.cluster_id, Infinity, 0, (err2, leaves) => {
                                    if (!err2) openModal(leaves.map(l => l.properties).sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate)));
                                });
                            }
                        });
                    } else {
                        openModal([props]);
                    }
                });

                clusterMarkers[id] = new maplibregl.Marker({ element: el, anchor: 'center' })
                    .setLngLat(coords).addTo(map);
            }
        }
        for (const id in clusterMarkers) {
            if (!newMarkers[id]) { clusterMarkers[id].remove(); delete clusterMarkers[id]; }
        }
    });

    map.on('mouseenter', 'clusters', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'clusters', () => map.getCanvas().style.cursor = '');
}

// Mise à jour légère : change uniquement les données GeoJSON sans reconstruire la source
// Utilisé par la timeline pour des transitions fluides
export function updateMapData(features) {
    const src = map.getSource('bereal-src');
    if (src) {
        src.setData({ type: 'FeatureCollection', features });
    }
}

// Reconstruit complètement la source et les layers
export function refreshMapMarkers(data, convertMemoriesToGeoJSON) {
    Object.values(clusterMarkers).forEach(m => m.remove());
    setClusterMarkers({});

    if (map.getSource('bereal-src')) {
        if (map.getLayer('clusters')) map.removeLayer('clusters');
        if (map.getLayer('unclustered-point')) map.removeLayer('unclustered-point');
        map.removeSource('bereal-src');
    }

    map.addSource('bereal-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: convertMemoriesToGeoJSON(data) },
        cluster: true,
        clusterMaxZoom: 17,
        clusterRadius: currentRadiusMode
    });

    reAddLayers();
    map.triggerRepaint();
}

// Ajuste le rayon de clustering selon le niveau de zoom.
// onRadiusChange() est appelé sans argument — le caller fournit les données filtrées courantes.
export function watchZoomRadius(onRadiusChange) {
    map.on('zoomend', () => {
        const zoom = map.getZoom();
        const newRadius = zoom >= 14 ? 100 : 50;
        if (newRadius !== currentRadiusMode) {
            currentRadiusMode = newRadius;
            onRadiusChange();
        }
    });
}

// --- CONTRÔLES CARTE ---
const northBtn   = document.getElementById('north-button');
const pitchBtn   = document.getElementById('pitch-button');
const terrainBtn = document.getElementById('terrain-button');
const pitchLine  = document.getElementById('pitch-line');
const pitchArc   = document.getElementById('pitch-arc');
const northIcon  = northBtn?.querySelector('svg');

terrainBtn?.classList.add('visible');

function getPitchArcPath(pitch) {
    const radius = 8, cx = 7, cy = 17;
    const rad = (pitch * Math.PI) / 180;
    const endX = cx + radius * Math.cos(-rad);
    const endY = cy + radius * Math.sin(-rad);
    return `M ${cx + radius} ${cy} A ${radius} ${radius} 0 0 0 ${endX} ${endY}`;
}

export function updateMapControls() {
    if (isUiLocked) return;
    const bearing = map.getBearing();
    const pitch   = map.getPitch();

    if (Math.abs(bearing) > 0.5) {
        northBtn?.classList.add('visible');
        if (northIcon) northIcon.style.transform = `rotate(${-bearing}deg)`;
    } else {
        northBtn?.classList.remove('visible');
    }

    if (pitch > 0.5) {
        pitchBtn?.classList.add('visible');
        if (pitchLine) { pitchLine.style.transformOrigin = '7px 17px'; pitchLine.style.transform = `rotate(${-pitch}deg)`; }
        if (pitchArc) pitchArc.setAttribute('d', getPitchArcPath(pitch));
    } else {
        pitchBtn?.classList.remove('visible');
    }
    terrainBtn?.classList.add('visible');
}

['rotate', 'pitch', 'move'].forEach(evt => map.on(evt, updateMapControls));

northBtn?.addEventListener('click', () => { map.easeTo({ bearing: 0, duration: 800 }); setTimeout(updateMapControls, 10); });
pitchBtn?.addEventListener('click', () => map.easeTo({ pitch: 0, duration: 800 }));
document.getElementById('terrain-button')?.addEventListener('click', toggleTerrain);

// --- PROXIMITÉ SOURIS BOUTON TERRAIN ---
const TERRAIN_PROXIMITY_PX = 80;

document.addEventListener('mousemove', (e) => {
    if (!terrainBtn) return;
    const rect = terrainBtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
    terrainBtn.classList.toggle('nearby', dist < TERRAIN_PROXIMITY_PX);
});
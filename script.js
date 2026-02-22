/**
 * BEREAL MAP CLONE - LOGIQUE GLOBALE
 * -----------------------------------------
 * Sommaire :
 * 1. Config & État
 * 2. Drag & Drop Badge (Profile)
 * 3. Statistiques & Dashboard
 * 4. Gestion de la Carte (MapLibre)
 * 5. Fenêtre Modale & Interactions Photo
 * 6. Initialisation
 */


// TEST IMMÉDIAT : Si une session est active, on montre l'écran noir avant même que le reste charge
if (localStorage.getItem('bereal_session_active') === 'true') {
    document.getElementById('loading-screen').style.display = 'flex';
    document.getElementById('upload-overlay').style.display = 'none';
} else {
    document.getElementById('upload-overlay').style.display = 'flex';
}

const DB_NAME = "BeRealMapDB";
const STORE_NAME = "files";


// Initialise la connexion à la base de données
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1); // Toujours version 1
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject("Erreur openDB: " + e.target.error);
    });
}

// Sauvegarde un fichier dans la session
async function saveFileToSession(path, file) {
    const db = await openDB();
    const buffer = await file.arrayBuffer(); // ← on stocke le buffer, pas le File
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put({ buffer, type: file.type, name: file.name }, path);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject();
    });
}

// Récupère tous les fichiers de la session
async function loadSessionFiles() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.openCursor();
        const results = {};

        request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                const data = cursor.value;
                const key = cursor.key;
                if (data && data.buffer) {
                    results[key] = new File([data.buffer], data.name || key, { type: data.type || '' });
                }
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        request.onerror = () => reject("Erreur Cursor");
    });
}



// #region 1. CONFIGURATION & ÉTAT GLOBAL

// Sélecteurs DOM
const usernameDisplay = document.querySelector('.bereal-username');
const miniBox = document.getElementById('mini-img-box');
const mainPhoto = document.getElementById('main-photo');
const photoContainer = document.getElementById('photo-container');
const modal = document.getElementById('bereal-modal');
const badge = document.querySelector('.user-profile-header');

// Variables d'état des photos
let currentPhotos = [], currentIndex = 0, isFlipped = false;
let currentMiniSide = 'left';
let isDragging = false, dragStartX, dragStartY, hasDragged = false, justFinishedDrag = false;

// Variables de Zoom & Pan
let isZooming = false, zoomScale = 1, translateX = 0, translateY = 0;
let lastMouseX, lastMouseY;

// Cache & Markers
let cachedStats = null;
let clusterMarkers = {};

// Variables de reposition
let isRelocating = false;
let memoryToUpdate = null;
let allMemoriesData = []; // Pour garder une trace de toutes les données chargées

// Variables GeoJSON
let worldGeoCache = null;
let depsGeoCache = null;
let isUiLocked = false;

// Variables URL
let objectUrlCache = new Map(); // Permet de stocker et réutiliser les URLs

// #endregion


// #region 2. DRAG PROFILE BADGE (Effet Magnétique)
let mouseX = 0, mouseY = 0; 
let badgeX = 0, badgeY = 0; 
let targetX = 0, targetY = 0; 
let isDraggingBadge = false;
let hasMovedBadge = false; 
let startX, startY; 
const friction = 0.3; 

/**
 * Boucle d'animation pour l'inertie du badge
 */
function animateBadge() {
    badgeX += (targetX - badgeX) * friction;
    badgeY += (targetY - badgeY) * friction;
    badge.style.transform = `translate(${badgeX}px, ${badgeY}px)`;
    requestAnimationFrame(animateBadge);
}
animateBadge();

// Événements Souris
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
    targetX = e.clientX - mouseX;
    targetY = e.clientY - mouseY;
});



const stopBadgeDrag = () => { isDraggingBadge = false; targetX = 0; targetY = 0; };
document.addEventListener('mouseup', stopBadgeDrag);

badge.addEventListener('click', () => {
    if (!hasMovedBadge) openDashboard();
});
// #endregion

// #region 3. STATISTIQUES & DASHBOARD

let currentDashPage = 1;

/**
 * Alterne entre les pages du dashboard (Stats Photos <-> Social)
 */
let isAnimatingDash = false;

function switchDash(direction = 'right') {
    if (isAnimatingDash) return;
    isAnimatingDash = true;

    const slider = document.getElementById('dash-slider');
    const animDuration = 400; 
    const unlockDelay = 300; 

    slider.style.transition = `transform ${animDuration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;

    if (direction === 'right') {
        // On glisse vers la gauche de la moitié de la largeur du slider (soit 1 page)
        slider.style.transform = 'translateX(-50%)';
        
        setTimeout(() => {
            slider.style.transition = 'none';
            slider.appendChild(slider.firstElementChild); // On déplace la page vue à la fin
            slider.style.transform = 'translateX(0%)';
        }, animDuration);
        
    } else {
        // Pour aller à gauche, on prépare la page précédente instantanément
        slider.style.transition = 'none';
        slider.prepend(slider.lastElementChild);
        slider.style.transform = 'translateX(-50%)';
        
        slider.offsetHeight; // Force le rendu
        
        slider.style.transition = `transform ${animDuration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        slider.style.transform = 'translateX(0%)';
    }

    setTimeout(() => {
        isAnimatingDash = false;
    }, unlockDelay);
}

/**
 * Calcule toutes les statistiques à partir des fichiers JSON
 * @param {Array} data - Contenu de memories.json
 * @param {Object} userData - Contenu de user.json
 * @param {Array} friendsData - Contenu de friends.json
 */
async function calculateStats(data, userData, friendsData) {
    if (cachedStats && cachedStats.total === data.length) {
        updateDashboardUI();
        return;
    }
    try {
        // --- 1. CALCUL DE LA STREAK ---
        const days = data.filter(m => m.date).map(m => m.date.split('T')[0]).sort();
        const uniqueDays = [...new Set(days)];
        let maxStreak = 0, currentStreak = 0;
        for (let i = 0; i < uniqueDays.length; i++) {
            if (i === 0) currentStreak = 1;
            else {
                const diffDays = Math.round((new Date(uniqueDays[i]) - new Date(uniqueDays[i - 1])) / 86400000);
                if (diffDays === 1) currentStreak++;
                else { maxStreak = Math.max(maxStreak, currentStreak); currentStreak = 1; }
            }
            maxStreak = Math.max(maxStreak, currentStreak);
        }

        // 2. PONCTUALITÉ (% à l'heure)
        // On identifie les moments uniques (un BeReal + ses Bonus = 1 seul moment)
        const momentIds = [...new Set(data.map(m => m.berealMoment || m.takenTime?.split('T')[0]))];
        let onTimeCount = 0;
        
        momentIds.forEach(id => {
            // Si au moins une photo de ce moment n'est pas "Late", on compte comme à l'heure
            if (data.some(m => (m.berealMoment === id || m.takenTime?.split('T')[0] === id) && m.isLate === false)) {
                onTimeCount++;
            }
        });
        const percent = momentIds.length > 0 ? Math.round((onTimeCount / momentIds.length) * 100) : 0;

        // 3. GÉOGRAPHIE : Utilisation du cache
        const validMemories = data.filter(m => m.location?.latitude && m.location?.longitude);
        const uniqueGeoPoints = validMemories.map(m => [m.location.longitude, m.location.latitude]);

        // On ne fetch que si le cache est vide
        if (!worldGeoCache || !depsGeoCache) {
            const [respWorld, respDeps] = await Promise.all([
                fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'),
                fetch('https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson')
            ]);
            worldGeoCache = await respWorld.json();
            depsGeoCache = await respDeps.json();
        }
        
        const worldGeo = worldGeoCache;
        const depsGeo = depsGeoCache;
        
        const foundCountries = new Set();
        const foundDeps = new Set();

        uniqueGeoPoints.forEach(coords => {
            const pt = turf.point(coords);
            
            // Check Pays (Monde)
            for (let c of worldGeo.features) {
                if (turf.booleanPointInPolygon(pt, c)) {
                    foundCountries.add(c.properties.ADMIN || c.properties.name);
                    break;
                }
            }
            
            // Check Départements (France - Box approximative pour performance)
            if (coords[0] > -5 && coords[0] < 10 && coords[1] > 41 && coords[1] < 52) {
                for (let d of depsGeo.features) {
                    if (turf.booleanPointInPolygon(pt, d)) {
                        foundDeps.add(d.properties.nom);
                        break;
                    }
                }
            }
        });

        // 4. SOCIAL & ANCIENNÉTÉ (Nouveaux calculs)
        const joinDate = userData.createdAt ? new Date(userData.createdAt) : new Date();
        const today = new Date();
        const diffDays = Math.floor((today - joinDate) / (1000 * 60 * 60 * 24));
        const formattedJoinDate = joinDate.toLocaleDateString('fr-FR', { 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric' 
        });

        // 5. CALCUL DU MOIS RECORD & HEURE MOYENNE
        const monthCounts = {};
        let totalMinutes = 0;
        let validTimeCount = 0;

        data.forEach(m => {
            if (m.takenTime) {
                const d = new Date(m.takenTime);
                
                // Mois Record (ex: "mars 2024")
                let monthKey = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                monthKey = monthKey.charAt(0).toUpperCase() + monthKey.slice(1);
                monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;

                // Heure Moyenne
                totalMinutes += (d.getHours() * 60) + d.getMinutes();
                validTimeCount++;
            }
        });

        // Trouver le mois avec le max de photos
        let bestMonthName = "-";
        let maxPhotos = 0;

        for (const [month, count] of Object.entries(monthCounts)) {
            if (count > maxPhotos) {
                maxPhotos = count;
                bestMonthName = month;
            }
}

        // Calcul heure moyenne
        let avgTimeStr = "--:--";
        if (validTimeCount > 0) {
            const avgMinutesTotal = totalMinutes / validTimeCount;
            const hh = Math.floor(avgMinutesTotal / 60);
            const mm = Math.round(avgMinutesTotal % 60);
            avgTimeStr = `${hh}H${mm.toString().padStart(2, '0')}`;
        }

        // 6. MISE EN CACHE DES RÉSULTATS
        cachedStats = { 
            total: data.length, 
            percent: percent, 
            countries: foundCountries.size || (validMemories.length > 0 ? 1 : 0), 
            deps: foundDeps.size, 
            maxStreak: maxStreak,
            friends: friendsData ? friendsData.length : 0,
            daysOld: diffDays,
            joinDate: formattedJoinDate,
            bestMonthName: bestMonthName,
            bestMonthLabel: `MOIS RECORD (${maxPhotos} BEREALS)`,
            avgTime: avgTimeStr    
        };
        
        updateDashboardUI();

    } catch (e) { 
        console.error("Erreur calcul stats détaillé:", e); 
    }
}

/**
 * Met à jour les éléments HTML du dashboard avec les valeurs calculées
 */
function updateDashboardUI() {
    if (!cachedStats) return;

    const mapping = { 
        'stat-streak': cachedStats.total, 
        'stat-ontime': `${cachedStats.percent}%`, 
        'stat-countries': cachedStats.countries, 
        'stat-deps': cachedStats.deps, 
        'stat-max-streak': cachedStats.maxStreak,
        'stat-friends': cachedStats.friends,
        'stat-age': cachedStats.daysOld,
        'stat-join-date': cachedStats.joinDate,
        'stat-best-month-name': cachedStats.bestMonthName,
        'stat-best-month-label': cachedStats.bestMonthLabel,
        'stat-avg-time': cachedStats.avgTime.toUpperCase()
    };

    for (let id in mapping) { 
        const el = document.getElementById(id); 
        if (el) el.innerText = mapping[id]; 
    }
}

/**
 * Ouvre le dashboard avec les effets visuels sur la carte
 */
function openDashboard() {
    const dashModal = document.getElementById('dashboard-modal');
    const content = document.querySelector('.dashboard-positioner');

    if (dashModal) dashModal.style.display = 'flex';
    if (content) content.style.display = 'flex';
    
    // Remplace les lignes manuelles par :
    setMapFocus(true);

    if (cachedStats) updateDashboardUI();
}

/**
 * Ferme le dashboard et restaure l'état de la carte
 */
function closeDashboard() {
    const dashModal = document.getElementById('dashboard-modal');
    const content = document.querySelector('.dashboard-positioner');

    if (dashModal) dashModal.style.display = 'none';
    if (content) content.style.display = 'none';
    
    // Remplace les lignes manuelles par :
    setMapFocus(false);
}

// #endregion

function refreshMapMarkers(data) {
    // 1. Nettoyage
    if (clusterMarkers) {
        Object.values(clusterMarkers).forEach(m => m.remove());
        clusterMarkers = {};
    }

    // 2. Utilisation de la fonction centralisée
    const newFeatures = convertMemoriesToGeoJSON(data);

    // 3. Remplacement dans la source MapLibre
    if (map.getSource('bereal-src')) {
        if (map.getLayer('clusters')) map.removeLayer('clusters');
        if (map.getLayer('unclustered-point')) map.removeLayer('unclustered-point');
        map.removeSource('bereal-src');
    }

    map.addSource('bereal-src', {
        type: 'geojson',
        data: { 
            type: 'FeatureCollection', 
            features: JSON.parse(JSON.stringify(newFeatures)) 
        },
        cluster: true,
        clusterMaxZoom: 22,
        clusterRadius: currentRadiusMode
    });

    reAddLayers();
    map.triggerRepaint();
}

document.getElementById('export-json-btn').addEventListener('click', (e) => {
    e.stopPropagation(); // Empêche de fermer le dashboard
    
    if (!allMemoriesData || allMemoriesData.length === 0) return;

    const dataStr = JSON.stringify(allMemoriesData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = "memories.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});

// #region 4. GESTION DE LA CARTE (MapLibre)

// --- CONFIGURATION DE LA CARTE ---
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://api.maptiler.com/maps/dataviz-dark/style.json?key=iYlIQdqzuS2kKjZemTWi',
    center: [2.21, 46.22], 
    zoom: 5.5, 
    maxZoom: 17,
    pitch: 0, 
    antialias: true
});

// --- GESTION DES BÂTIMENTS 3D ---
function setup3DBuildings() {
    // On détecte dynamiquement la source du style (MapTiler change souvent le nom)
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
                'fill-extrusion-height': [
                    'coalesce', 
                    ['get', 'render_height'], 
                    ['get', 'height'], 
                    20 
                ],
                'fill-extrusion-base': [
                    'coalesce', 
                    ['get', 'render_min_height'], 
                    ['get', 'min_height'], 
                    0
                ],
                'fill-extrusion-opacity': 0, // Caché par défaut
                'fill-extrusion-opacity-transition': { duration: 500 } // Transition fluide
            }
        });
    }
}

// --- LOGIQUE D'AFFICHAGE DYNAMIQUE (PITCH/ZOOM) ---
function update3DVisibility() {
    if (!map.getLayer('3d-buildings')) return;

    const pitch = map.getPitch();
    const zoom = map.getZoom();
    
    // On montre la 3D seulement si incliné (>10°) ET zoomé (>13)
    const shouldShow = pitch > 25 && zoom > 15;
    const targetOpacity = shouldShow ? 0.8 : 0;

    // On ne met à jour que si nécessaire pour les performances
    const currentOpacity = map.getPaintProperty('3d-buildings', 'fill-extrusion-opacity');
    if (currentOpacity !== targetOpacity) {
        map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', targetOpacity);
    }
}

// --- ÉVÉNEMENTS ---
map.on('style.load', () => {
    setup3DBuildings();
});

// Un seul listener "move" suffit pour gérer zoom ET rotation ET inclinaison
map.on('move', update3DVisibility);

function setMapFocus(isFocus) {
    isUiLocked = isFocus; // On verrouille si une modale s'ouvre
    
    const mapEl = document.getElementById('map');
    const badge = document.querySelector('.user-profile-header');
    const controls = [northBtn, pitchBtn];
    
    if (isFocus) {
        mapEl.style.transform = 'scale(1.05)';
        mapEl.style.filter = 'blur(5px) brightness(0.4)';
        badge.style.filter = 'blur(3px)';
        badge.style.pointerEvents = 'none';
        
        // Cache les boutons immédiatement
        controls.forEach(btn => btn?.classList.remove('visible'));
    } else {
        mapEl.style.transform = 'scale(1)';
        mapEl.style.filter = 'none';
        badge.style.filter = 'none';
        badge.style.pointerEvents = 'auto';
        
        // On demande la mise à jour des boutons
        updateMapControls();
    }
}

let currentRadiusMode = 60;

function watchZoomRadius(features) {
    map.on('zoomend', () => {
        const zoom = map.getZoom();
        
        let newRadius = zoom >= 16 ? 80 : 50; 

        if (newRadius !== currentRadiusMode) {
            currentRadiusMode = newRadius;
            refreshMapMarkers(allMemoriesData);
        }
    });
}


function setupMapLayers(features) {
    if (map.getSource('bereal-src')) return;

    map.addSource('bereal-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
        cluster: true,
        clusterMaxZoom: 22, 
        clusterRadius: 50 
    });

    reAddLayers();

    // Rendu des markers HTML personnalisés (Chiffres Inter)
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
        for (const id in clusterMarkers) if (!newMarkers[id]) { clusterMarkers[id].remove(); delete clusterMarkers[id]; }
    });

    // Clics
    // Clics sur les clusters
    map.on('click', 'clusters', (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
        const clusterId = f.properties.cluster_id;
        const coords = f.geometry.coordinates;
        const currentZoom = map.getZoom();

        // CONDITION : Si c'est "Null Island" OU si on est au zoom 16 ou plus
        if ((Math.abs(coords[0]) < 0.1 && Math.abs(coords[1]) < 0.1) || currentZoom >= 16) {
            map.getSource('bereal-src').getClusterLeaves(clusterId, Infinity, 0, (err, leaves) => {
                if (!err) {
                    // On récupère les photos et on les trie par date (plus récent en premier)
                    openModal(leaves.map(l => l.properties).sort((a,b) => new Date(b.rawDate) - new Date(a.rawDate)));
                }
            });
        } else {
            // Sinon, on essaie de zoomer pour éclater le cluster
            map.getSource('bereal-src').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (!err) {
                    map.easeTo({ 
                        center: coords, 
                        zoom: Math.min(zoom, 16.5) // On s'arrête juste après le seuil
                    });
                }
            });
        }
    });

    map.on('click', 'unclustered-point', (e) => openModal([e.features[0].properties]));
    map.on('mouseenter', 'clusters', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'clusters', () => map.getCanvas().style.cursor = '');
}

function reAddLayers() {
    map.addLayer({ id: 'clusters', type: 'circle', source: 'bereal-src', filter: ['has', 'point_count'], paint: { 'circle-color': '#151517', 'circle-radius': 18, 'circle-stroke-width': 1, 'circle-stroke-color': '#d9d9d960' } });
    map.addLayer({ id: 'unclustered-point', type: 'circle', source: 'bereal-src', filter: ['!', ['has', 'point_count']], paint: { 'circle-opacity': 0, 'circle-radius': 15 } });
}


// Gestion du Nord (Bearing) et de l'inclinaison (Pitch)
// 1. Mise en cache des éléments (Performance : évite de chercher dans le DOM à chaque frame)
const northBtn = document.getElementById('north-button');
const pitchBtn = document.getElementById('pitch-button');
const pitchLine = document.getElementById('pitch-line');
const pitchArc = document.getElementById('pitch-arc');
const northIcon = northBtn.querySelector('svg');

const dashboardModal = document.getElementById('dashboard-modal');
const photoModal = document.getElementById('bereal-modal');

/**
 * Calcule le chemin SVG pour l'arc d'inclinaison
 */
function getPitchArcPath(pitch) {
    const radius = 8;
    const centerX = 7;
    const centerY = 17;
    
    const angleRad = (pitch * Math.PI) / 180;
    const endX = centerX + radius * Math.cos(-angleRad);
    const endY = centerY + radius * Math.sin(-angleRad);
    const startX = centerX + radius;
    const startY = centerY;

    return `M ${startX} ${startY} A ${radius} ${radius} 0 0 0 ${endX} ${endY}`;
}

/**
 * Met à jour l'état visuel des boutons de contrôle
 */
function updateMapControls() {
    // Si l'UI est verrouillée, on ne touche à rien
    if (isUiLocked) return; 

    const bearing = map.getBearing();
    const pitch = map.getPitch(); 
    
    const isRotated = Math.abs(bearing) > 0.5;
    const isPitched = pitch > 0.5;

    // Logique PITCH (Inclinaison)
    if (isPitched) {
        pitchBtn.classList.add('visible');
        if (pitchLine) {
            pitchLine.style.transformOrigin = "7px 17px"; // Le pivot
            pitchLine.style.transform = `rotate(${-pitch}deg)`;
        }
        if (pitchArc) {
            pitchArc.setAttribute('d', getPitchArcPath(pitch));
        }
    } else {
        pitchBtn.classList.remove('visible');
    }

    // Logique NORD (Boussole)
    if (isRotated) {
        northBtn.classList.add('visible');
        northIcon.style.transform = `rotate(${-bearing}deg)`;
    } else {
        northBtn.classList.remove('visible');
    }
}

// --- ÉVÉNEMENTS CARTE ---
// Regroupement des événements MapLibre
['rotate', 'pitch', 'move'].forEach(evt => map.on(evt, updateMapControls));

// --- ACTIONS CLIC ---
northBtn.addEventListener('click', () => {
    map.easeTo({ bearing: 0, duration: 800 });
    // Petit délai pour assurer la fluidité de la transition CSS
    setTimeout(updateMapControls, 10); 
});

pitchBtn.addEventListener('click', () => {
    map.easeTo({ pitch: 0, duration: 800 });
});


map.on('click', async (e) => {
    if (!isRelocating || !memoryToUpdate) return;

    const { lng, lat } = e.lngLat;
    const index = allMemoriesData.findIndex(m => m.takenTime === memoryToUpdate.rawDate);
    
    if (index !== -1) {
        // 1. Mise à jour de la position
        allMemoriesData[index].location = { latitude: lat, longitude: lng };
        console.log("Nouvelle position enregistrée :", allMemoriesData[index].location);

        // 2. Sauvegarde dans IndexedDB
        const updatedJsonBlob = new Blob([JSON.stringify(allMemoriesData)], { type: 'application/json' });
        await saveFileToSession("memories.json", updatedJsonBlob);

        // 3. Rafraîchissement visuel de la carte
        refreshMapMarkers(allMemoriesData);
        checkDifferencesAndShowExport();

        // --- AJOUT : RECALCUL DES STATS ---
        // On récupère les fichiers JSON nécessaires à calculateStats depuis notre fileMap globale
        try {
            const userData = JSON.parse(await fileMap['user.json'].text());
            const friendsData = fileMap['friends.json'] ? JSON.parse(await fileMap['friends.json'].text()) : [];
            
            // On relance le calcul avec les nouvelles coordonnées de allMemoriesData
            await calculateStats(allMemoriesData, userData, friendsData);
            console.log("Statistiques géographiques mises à jour !");
        } catch (err) {
            console.error("Erreur lors du recalcul des stats post-déplacement:", err);
        }
        // ----------------------------------

        isRelocating = false;
        document.getElementById('map').style.cursor = '';
        alert("Position mise à jour et statistiques actualisées !");
    }
});


// #endregion


// #region 5. MODALE, FLIP, ZOOM & PAN


function openModal(photos) {
    currentPhotos = photos; 
    currentIndex = 0; 
    currentMiniSide = 'left'; 
    updateModalContent();
    
    modal.style.display = 'flex';

    setMapFocus(true);
}

function updateModalContent() {
    const p = currentPhotos[currentIndex];
    const replaceBtn = document.getElementById('replace-button');
    
    if (replaceBtn) replaceBtn.style.setProperty('display', 'none', 'important');
    if (!p) return;

    // 1. Normalisation de la localisation (Optimisé)
    let loc = p.location;
    if (typeof loc === 'string') {
        try { loc = JSON.parse(loc); } catch (e) { loc = null; }
    }

    // 2. Réinitialisation de l'état visuel
    isFlipped = false; 
    resetZoomState();

    // 3. Mise à jour des médias et textes
    mainPhoto.src = p.back;
    document.getElementById('mini-photo').src = p.front;
    document.getElementById('modal-caption').innerText = p.caption || "";
    document.getElementById('modal-metadata').innerText = `${p.date} • ${p.time}`;
    
    photoContainer.classList.toggle('on-time', p.isLate === false && p.isBonus === false);
    
    // 4. Affichage intelligent du bouton "Replacer"
    const hasValidLocation = loc && loc.latitude && loc.longitude && loc.latitude !== 0;
    if (replaceBtn) {
        replaceBtn.style.display = hasValidLocation ? 'none' : 'block';
    }

    // 5. Positionnement de la miniature (Avec transition fluide)
    // On active la transition pour que le passage gauche/droite soit esthétique
    miniBox.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'; 
    const xPos = currentMiniSide === 'right' ? (photoContainer.offsetWidth - miniBox.offsetWidth - 28) : 0;
    miniBox.style.transform = `translate(${xPos}px, 0px)`;

    // 6. Gestion de la navigation
    const hasMultiple = currentPhotos.length > 1;
    document.getElementById('prevBtn').style.display = (hasMultiple && currentIndex > 0) ? 'flex' : 'none';
    document.getElementById('nextBtn').style.display = (hasMultiple && currentIndex < currentPhotos.length - 1) ? 'flex' : 'none';
    
    const counter = document.getElementById('photo-counter');
    if (counter) {
        counter.innerText = hasMultiple ? `${currentIndex + 1}/${currentPhotos.length}` : '';
    }
}

function closeModal() {
    if (isDragging || justFinishedDrag || isZooming) return;
    modal.style.display = 'none';

    currentMiniSide = 'left';
    const counter = document.getElementById('photo-counter');
    if (counter) {
        counter.style.left = 'auto';
        counter.style.right = '20px';
        counter.classList.remove('switching', 'from-left');
    }
    
    // Remplace les lignes manuelles par :
    setMapFocus(false);
    
    syncPWAHeight();
}

// --- LOGIQUE PHOTO (DRAG & FLIP) ---
miniBox.addEventListener('mousedown', (e) => {
    isDragging = true; hasDragged = false;
    const rect = miniBox.getBoundingClientRect(), cRect = photoContainer.getBoundingClientRect();
    dragStartX = e.clientX - (rect.left - cRect.left);
    dragStartY = e.clientY - (rect.top - cRect.top);
    miniBox.style.transition = 'none';
    e.preventDefault(); e.stopPropagation();
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        hasDragged = true;
        const clampedX = Math.max(10, Math.min(e.clientX - dragStartX, photoContainer.offsetWidth - miniBox.offsetWidth - 10));
        const clampedY = Math.max(10, Math.min(e.clientY - dragStartY, photoContainer.offsetHeight - miniBox.offsetHeight - 10));
        miniBox.style.transform = `translate(${clampedX - 14}px, ${clampedY - 14}px)`;
    }
    if (isZooming) handlePan(e.clientX, e.clientY);
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        
        if (!hasDragged) {
            // Logique de flip (inchangée)
            isFlipped = !isFlipped;
            const p = currentPhotos[currentIndex];
            mainPhoto.src = isFlipped ? p.front : p.back;
            document.getElementById('mini-photo').src = isFlipped ? p.back : p.front;
        } else {
            justFinishedDrag = true;
            miniBox.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            
            const snapRight = (miniBox.getBoundingClientRect().left + miniBox.offsetWidth/2) > (photoContainer.getBoundingClientRect().left + photoContainer.offsetWidth/2);
            currentMiniSide = snapRight ? 'right' : 'left'; 
            miniBox.style.transform = snapRight ? `translate(${photoContainer.offsetWidth - miniBox.offsetWidth - 28}px, 0px)` : 'translate(0px, 0px)';

            // --- ANIMATION DU COMPTEUR (À L'OPPOSÉ DE LA MINIATURE) ---
            const counter = document.getElementById('photo-counter');
            if (counter) {
                // 1. On détermine la direction d'entrée pour l'effet de slide
                // Si snapRight est vrai, le compteur va à GAUCHE, donc il arrive de la gauche
                if (snapRight) {
                    counter.classList.add('from-left');
                } else {
                    counter.classList.remove('from-left');
                }

                // 2. On lance la disparition
                counter.classList.add('switching');

                setTimeout(() => {
                    // 3. INVERSION : Si la miniature est à droite (snapRight), le compteur va à gauche
                    if (snapRight) {
                        counter.style.left = '20px';
                        counter.style.right = 'auto';
                    } else {
                        counter.style.left = 'auto';
                        counter.style.right = '20px';
                    }
                    
                    // 4. Réapparition avec glissement
                    counter.classList.remove('switching');
                }, 150); 
            }

            setTimeout(() => justFinishedDrag = false, 500);
        }
    }
    if (isZooming) { justFinishedDrag = true; resetZoomState(); setTimeout(() => justFinishedDrag = false, 300); }
});

// --- LOGIQUE ZOOM ---
function updateTransform() {
    const maxTx = (photoContainer.offsetWidth * (zoomScale - 1)) / 2, maxTy = (photoContainer.offsetHeight * (zoomScale - 1)) / 2;
    translateX = Math.max(-maxTx/zoomScale, Math.min(translateX, maxTx/zoomScale));
    translateY = Math.max(-maxTy/zoomScale, Math.min(translateY, maxTy/zoomScale));
    mainPhoto.style.transform = `scale(${zoomScale}) translate(${translateX}px, ${translateY}px)`;
}

function resetZoomState() { isZooming = false; zoomScale = 1; translateX = 0; translateY = 0; mainPhoto.style.transform = 'scale(1) translate(0,0)'; photoContainer.classList.remove('zoomed'); }

function startZoom(x, y) {
    isZooming = true; mainPhoto.style.transformOrigin = `50% 50%`;
    lastMouseX = x; lastMouseY = y; translateX = 0; translateY = 0; zoomScale = 1.6; 
    mainPhoto.style.transition = 'transform 0.25s ease-out';
    updateTransform();
    photoContainer.classList.add('zoomed');
}

function handlePan(x, y) {
    // On divise par le zoomScale pour que le mouvement de l'image 
    // corresponde à la distance parcourue par la souris
    translateX += (x - lastMouseX) / zoomScale;426197
    translateY += (y - lastMouseY) / zoomScale;
    
    lastMouseX = x; 
    lastMouseY = y;
    
    mainPhoto.style.transition = 'none'; // Pas de transition pendant le glissement
    updateTransform();
}

photoContainer.addEventListener('mousedown', (e) => { if (!e.target.closest('.mini-img-container')) startZoom(e.clientX, e.clientY); });

document.getElementById('replace-button').addEventListener('click', () => {
    // currentPhotos[currentIndex] contient l'objet memory actuel
    memoryToUpdate = currentPhotos[currentIndex]; 
    isRelocating = true;
    
    closeModal(); // Ferme la modale pour voir la carte
    document.getElementById('map').style.cursor = 'crosshair';
    
    // Notification visuelle (optionnel)
    console.log("Mode repositionnement activé pour :", memoryToUpdate);
});

// #endregion


function getLocalUrl(jsonPath) {
    if (!jsonPath) return "";
    
    let cleanPath = jsonPath.startsWith('/') ? jsonPath.substring(1) : jsonPath;

    // --- NOUVEAU : On vérifie si on a déjà créé une URL pour ce fichier ---
    if (objectUrlCache.has(cleanPath)) {
        return objectUrlCache.get(cleanPath);
    }

    // Stratégie de recherche du fichier dans fileMap
    let file = null;
    if (fileMap[cleanPath]) {
        file = fileMap[cleanPath];
    } else {
        const fileName = cleanPath.split('/').pop();
        const foldersToTry = ["Photos/post/", "Photos/profile/", "Photos/bereal/"];
        for (let folder of foldersToTry) {
            if (fileMap[folder + fileName]) {
                file = fileMap[folder + fileName];
                break;
            }
        }
    }

    if (file) {
        // On crée l'URL, on la stocke dans le cache, puis on la retourne
        const newUrl = URL.createObjectURL(file);
        objectUrlCache.set(cleanPath, newUrl);
        return newUrl;
    }

    console.warn("Fichier non trouvé :", cleanPath);
    return "";
}

// #region 6. INITIALISATION & ASSETS
let fileMap = {}; // Index pour retrouver les fichiers par leur nom

document.getElementById('folder-input').addEventListener('change', async (e) => {
    const files = e.target.files;
    const statusMsg = document.getElementById('status-msg');
    statusMsg.innerText = "Création de la session... (0%)";
    

    let count = 0;
    for (let file of files) {
        const path = file.webkitRelativePath.split('/').slice(1).join('/');
        fileMap[path] = file;
        
        // On sauvegarde chaque fichier dans IndexedDB
        await saveFileToSession(path, file);
        
        count++;
        if (count % 25 === 0) {
            statusMsg.innerText = `Création de la session... (${Math.round((count/files.length)*100)}%)`;
        }
    }

    try {
        const memoriesFile = fileMap['memories.json'];
        await saveFileToSession("memories_original.json", memoriesFile); 
        const userData = JSON.parse(await fileMap['user.json'].text());
        const memoriesData = JSON.parse(await memoriesFile.text());
        const friendsData = JSON.parse(await fileMap['friends.json'].text());
        
        allMemoriesData = memoriesData;
        
        
        localStorage.setItem('bereal_session_active', 'true');
        initApp(userData, memoriesData, friendsData);

        map.getCanvas().style.height = '100%';
        syncPWAHeight()
        document.getElementById('upload-overlay').style.display = 'none';
    } catch (err) {
        console.error(err);
        alert("Dossier invalide.");
    }
});

/**
 * Transforme les données brutes des souvenirs en collection GeoJSON
 */
function convertMemoriesToGeoJSON(data) {
    const momentCounts = {};
    
    return data.map(m => {
        // Logique de détection de bonus (centralisée)
        const momentId = m.berealMoment || (m.takenTime ? m.takenTime.split('T')[0] : m.date);
        const isBonus = !!momentCounts[momentId];
        momentCounts[momentId] = true;

        // Normalisation des coordonnées
        const lng = parseFloat(m.location?.longitude);
        const lat = parseFloat(m.location?.latitude);

        return {
            type: 'Feature',
            geometry: { 
                type: 'Point', 
                coordinates: [isNaN(lng) ? 0 : lng, isNaN(lat) ? 0 : lat] 
            },
            properties: {
                front: getLocalUrl(m.frontImage?.path),
                back: getLocalUrl(m.backImage?.path),
                caption: m.caption || "",
                location: m.location,
                rawDate: m.takenTime,
                date: m.takenTime ? new Date(m.takenTime).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : "",
                time: m.takenTime ? new Date(m.takenTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : "",
                isLate: m.isLate,
                isBonus: isBonus
            }
        };
    });
}

// Nouvelle fonction de démarrage
async function initApp(userData, memoriesData, friendsData) {

    // On définit une valeur de secours (fallback)
    const name = userData.username || userData.fullname || "Utilisateur BeReal";
    
    // Mise à jour du Badge (Header)
    const headerUser = document.getElementById('header-username');
    if (headerUser) headerUser.innerText = name;

    // Mise à jour de la Modale Photo
    const modalUser = document.querySelector('.bereal-username');
    if (modalUser) modalUser.innerText = name;

    // Photo de profil
    if (userData.profilePicture) {
        const picUrl = getLocalUrl(userData.profilePicture.path);
        const profileImg = document.getElementById('profile-pic');
        if (profileImg && picUrl) {
            profileImg.src = picUrl;
        }
    }

    // 2. Préparation des photos simplifiée
    const features = convertMemoriesToGeoJSON(memoriesData);

    // 3. Chargement de la Carte
    if (features.length > 0) {
        const injectFeatures = () => {
            if (!map.getSource('bereal-src')) {
                setupMapLayers(features);
                watchZoomRadius(features); 
            }
        };

        if (map.loaded()) {
            injectFeatures();
        } else {
            map.once('load', injectFeatures);
        }
    }

    // 4. Lancement des Statistiques (Pays, Départements, Streaks)
    calculateStats(memoriesData, userData, friendsData);
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        syncPWAHeight()
    }, 300);

    setup3DBuildings();
}

// #endregion


function nextPhoto() {
    if (currentIndex < currentPhotos.length - 1) {
        currentIndex++;
        updateModalContent();
    }
}

function prevPhoto() {
    if (currentIndex > 0) {
        currentIndex--;
        updateModalContent();
    }
}

document.addEventListener('keydown', (e) => {
    // Bloquer le scroll de la carte dans tous les cas
    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
    }

    // Navigation dans la modale photo
    if (modal.style.display === 'flex') {
        if (e.key === 'ArrowRight') nextPhoto();
        if (e.key === 'ArrowLeft') prevPhoto();
        if (e.key === 'Escape') closeModal();
    }

    // Navigation dans le dashboard
    const dash = document.getElementById('dashboard-modal');
    if (dash && dash.style.display === 'flex') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') switchDash();
        if (e.key === 'Escape') closeDashboard();
    }
});


/**
 * GESTION DU DÉMARRAGE ET DE LA SESSION
 */


async function checkDifferencesAndShowExport() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    
    // On récupère les deux versions
    const reqCurrent = store.get("memories.json");
    const reqOriginal = store.get("memories_original.json");

    reqCurrent.onsuccess = () => {
        reqOriginal.onsuccess = () => {
            const exportBtn = document.getElementById('export-json-btn');
            if (!exportBtn) return;

            // Si l'original n'existe pas encore (premier import), on ne peut pas comparer
            if (!reqOriginal.result || !reqCurrent.result) {
                exportBtn.style.display = 'none';
                return;
            }

            // On compare les contenus bruts (ArrayBuffers)
            // C'est plus fiable que de comparer des objets JSON qui peuvent changer d'ordre
            const currentData = new Uint8Array(reqCurrent.result.buffer);
            const originalData = new Uint8Array(reqOriginal.result.buffer);

            if (currentData.length !== originalData.length || currentData.some((val, i) => val !== originalData[i])) {
                console.log("Différence détectée entre memories et memories_original");
                exportBtn.style.setProperty('display', 'inline-flex', 'important');
            } else {
                exportBtn.style.display = 'none';
            }
        };
    };
}

async function handleAutoLogin() {
    const loader = document.getElementById('loading-screen');
    const uploadOverlay = document.getElementById('upload-overlay');

    try {
        const savedFiles = await loadSessionFiles();
        const keys = Object.keys(savedFiles);

        // On vérifie si on a les fichiers essentiels
        if (keys.length > 0 && savedFiles['user.json'] && savedFiles['memories.json']) {
            fileMap = savedFiles;
            uploadOverlay.style.display = 'none';

            // 1. Extraction des données
            const userData = JSON.parse(await savedFiles['user.json'].text());
            const memoriesData = JSON.parse(await savedFiles['memories.json'].text());
            allMemoriesData = memoriesData;
            const friendsData = savedFiles['friends.json'] ? JSON.parse(await savedFiles['friends.json'].text()) : [];
            
            // 2. Mise à jour de l'état global
            allMemoriesData = memoriesData; 

            // 3. Lancement de la vérification du bouton export
            await checkDifferencesAndShowExport();

            // 4. Fonction de démarrage (maintenant elle voit bien les variables au-dessus)
            const startApp = () => {
                initApp(userData, memoriesData, friendsData);
                
                setTimeout(() => {
                    window.dispatchEvent(new Event('resize'));
                    syncPWAHeight()
                }, 300);
                
                loader.style.opacity = '0';
                setTimeout(() => loader.style.display = 'none', 500);
            };

            if (map.loaded()) startApp();
            else map.once('load', startApp);

        } else {
            // Pas de fichiers trouvés : on montre l'écran d'upload
            console.warn("Session incomplète ou vide.");
            loader.style.display = 'none';
            uploadOverlay.style.display = 'flex';
        }
    } catch (err) {
        console.error("Crash handleAutoLogin:", err);
        loader.style.display = 'none';
        uploadOverlay.style.display = 'flex';
    }
}

// Lancement
handleAutoLogin();


async function handleLogout(event) {
    if (event) event.stopPropagation(); 
    
    if (confirm("Voulez-vous vraiment vous déconnecter et supprimer les données locales ?")) {
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            
            store.clear(); // Vide IndexedDB
            
            tx.oncomplete = () => {
                localStorage.removeItem('bereal_session_active'); // Nettoie le flag
                objectUrlCache.forEach(url => URL.revokeObjectURL(url));
                objectUrlCache.clear();
                window.location.reload(); // Retour à l'accueil
            };
        } catch (err) {
            console.error("Erreur déconnexion:", err);
            localStorage.removeItem('bereal_session_active');
            objectUrlCache.forEach(url => URL.revokeObjectURL(url));
            objectUrlCache.clear();
            window.location.reload();
        }
    }
}

/* --- GESTION DE LA TAILLE ÉCRAN (FIX iOS/PWA) --- */

function syncPWAHeight() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    const vh = window.innerHeight;
    
    if (mapEl.style.height !== vh + 'px') {
        mapEl.style.height = vh + 'px';
        
        // APPEL UNIQUE À MAPLIBRE ICI
        if (typeof map !== 'undefined' && map.resize) {
            map.resize();
        }
    }
}

// On écoute les changements
window.addEventListener('resize', syncPWAHeight);
window.addEventListener('orientationchange', syncPWAHeight);

// Forçage au démarrage (stratégie progressive)
[0, 100, 500, 1000, 3000].forEach(delay => {
    setTimeout(syncPWAHeight, delay);
});

// Appel immédiat
syncPWAHeight();
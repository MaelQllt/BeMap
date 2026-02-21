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


document.getElementById('upload-overlay').style.display = 'flex';

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

// Fonction pour se déconnecter
async function clearSession() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => {
        localStorage.removeItem('bereal_session_active');
        location.reload();
    };
}
// #region 1. CONFIGURATION & ÉTAT GLOBAL
const FOLDER_NAME = "AF9TaX9kF2Ph70UyFt19wuMJvqr2-pGvnrPTVROrjNoqlXt1pl";

// Sélecteurs DOM
const usernameDisplay = document.querySelector('.bereal-username');
const miniBox = document.getElementById('mini-img-box');
const container = document.getElementById('photo-container');
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
    
    // 1. On réduit la durée à 0.4s pour plus de nervosité
    const animDuration = 400; 
    // 2. On libère le clic un peu avant la fin (après 300ms) pour permettre l'enchaînement
    const unlockDelay = 300; 

    slider.style.transition = `transform ${animDuration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;

    if (direction === 'right') {
        slider.style.transform = 'translateX(-50%)';
        
        setTimeout(() => {
            slider.style.transition = 'none';
            slider.appendChild(slider.firstElementChild);
            slider.style.transform = 'translateX(0%)';
            // On ne met PAS isAnimatingDash ici
        }, animDuration);
        
    } else {
        slider.style.transition = 'none';
        slider.prepend(slider.lastElementChild);
        slider.style.transform = 'translateX(-50%)';
        
        slider.offsetHeight; // Force reflow
        
        slider.style.transition = `transform ${animDuration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        slider.style.transform = 'translateX(0%)';
    }

    // LE SECRET : On débloque le bouton AVANT que l'animation soit totalement finie
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

        // 3. GÉOGRAPHIE (PAYS & DÉPARTEMENTS) via Turf.js
        const validMemories = data.filter(m => m.location?.latitude && m.location?.longitude);
        const uniqueGeoPoints = validMemories.map(m => [m.location.longitude, m.location.latitude]);

        const [respWorld, respDeps] = await Promise.all([
            fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'),
            fetch('https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson')
        ]);
        
        const worldGeo = await respWorld.json();
        const depsGeo = await respDeps.json();
        
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
    const modal = document.getElementById('dashboard-modal');
    const mapEl = document.getElementById('map');
    const badge = document.querySelector('.user-profile-header');

    currentDashPage = 1; 
    const p1 = document.getElementById('dash-page-1');
    const p2 = document.getElementById('dash-page-2');
    if (p1) p1.style.display = 'block';
    if (p2) p2.style.display = 'none';

    if (modal) modal.style.display = 'flex';
    
    // On utilise style.transform au lieu de modifier tout le style
    if (mapEl) {
        mapEl.style.transform = 'scale(1.05)';
        mapEl.style.filter = 'blur(3px) brightness(0.4)';
    }

    if (badge) {
        badge.style.opacity = '0';
        badge.style.pointerEvents = 'none';
    }

    if (cachedStats) updateDashboardUI();

    updateNorthBtnVisibility();
}

/**
 * Ferme le dashboard et restaure l'état de la carte
 */
function closeDashboard() {
    const modal = document.getElementById('dashboard-modal');
    const mapEl = document.getElementById('map');
    const badge = document.querySelector('.user-profile-header');

    if (modal) modal.style.display = 'none';
    
    if (mapEl) {
        mapEl.style.transform = 'scale(1)'; // On reset le scale
        mapEl.style.filter = 'none';        // On reset le flou
    }

    if (badge) {
        badge.style.opacity = '1';
        badge.style.pointerEvents = 'auto';
    }

    updateNorthBtnVisibility();
}

// #endregion

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



let currentRadiusMode = 60;

function watchZoomRadius(features) {
    map.on('zoomend', () => {
        const zoom = map.getZoom();
        
        let newRadius = zoom >= 16 ? 80 : 50; 

        if (newRadius !== currentRadiusMode) {
            currentRadiusMode = newRadius;
            updateMapSource(features, newRadius);
        }
    });
}
function updateMapSource(features, radius) {
    if (!map.getSource('bereal-src')) return;

    // Suppression propre des layers
    if (map.getLayer('clusters')) map.removeLayer('clusters');
    if (map.getLayer('unclustered-point')) map.removeLayer('unclustered-point');

    map.removeSource('bereal-src');

    map.addSource('bereal-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
        cluster: true,
        clusterMaxZoom: 22, 
        clusterRadius: radius 
    });

    reAddLayers();
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
    const bearing = map.getBearing();
    const pitch = map.getPitch(); 
    
    // Seuils de visibilité
    const isRotated = Math.abs(bearing) > 0.5;
    const isPitched = pitch > 0.5;

    // État de l'interface
    const isDashboardOpen = dashboardModal.style.display === 'flex';
    const isPhotoOpen = photoModal.style.display === 'flex';
    const canShow = !isDashboardOpen && !isPhotoOpen;

    // --- GESTION DU BOUTON PITCH ---
    if (canShow && isPitched) {
        pitchBtn.classList.add('visible');
        if (pitchLine && pitchArc) {
            pitchLine.style.transformOrigin = "7px 17px";
            pitchLine.style.transform = `rotate(${-pitch}deg)`;
            pitchArc.setAttribute('d', getPitchArcPath(pitch));
        }
    } else {
        pitchBtn.classList.remove('visible');
    }

    // --- GESTION DE LA BOUSSOLE ---
    if (canShow && isRotated) {
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

// #endregion


// #region 5. MODALE, FLIP, ZOOM & PAN


function openModal(photos) {
    currentPhotos = photos; 
    currentIndex = 0; 
    currentMiniSide = 'left'; 
    updateModalContent();
    
    modal.style.display = 'flex';

    // On modifie les propriétés une par une pour NE PAS toucher au height
    const mapEl = document.getElementById('map');
    mapEl.style.transform = 'scale(1.1)';
    mapEl.style.filter = 'blur(3px) brightness(0.4)';

    // Correction aussi pour le badge (évite le += qui peut bugger)
    badge.style.filter = 'blur(3px)';
    badge.style.pointerEvents = 'none';

    updateNorthBtnVisibility();
}

function updateModalContent() {
    const p = currentPhotos[currentIndex];
    isFlipped = false; 
    resetZoomState();
    mainPhoto.src = p.back;
    document.getElementById('mini-photo').src = p.front;
    document.getElementById('modal-caption').innerText = p.caption;
    document.getElementById('modal-metadata').innerText = `${p.date} • ${p.time}`;
    
    container.classList.toggle('on-time', p.isLate === false && p.isBonus === false);
    
    // --- MODIFICATION ICI ---
    miniBox.style.transition = 'none';
    if (currentMiniSide === 'right') {
        // On calcule la position à droite
        const rightPos = container.offsetWidth - miniBox.offsetWidth - 28;
        miniBox.style.transform = `translate(${rightPos}px, 0px)`;
    } else {
        miniBox.style.transform = `translate(0px, 0px)`;
    }
    // -------------------------

    document.getElementById('prevBtn').style.display = (currentPhotos.length > 1 && currentIndex > 0) ? 'flex' : 'none';
    document.getElementById('nextBtn').style.display = (currentPhotos.length > 1 && currentIndex < currentPhotos.length - 1) ? 'flex' : 'none';
    const counter = document.getElementById('photo-counter');
    if (counter) {
        counter.innerText = currentPhotos.length > 1 ? `${currentIndex + 1}/${currentPhotos.length}` : '';
    }
}

function closeModal() {
    if (isDragging || justFinishedDrag || isZooming) return;
    modal.style.display = 'none';
    
    // AU LIEU DE cssText, on modifie uniquement les propriétés de transformation
    const mapEl = document.getElementById('map');
    mapEl.style.transform = 'scale(1)';
    mapEl.style.filter = 'none';
    
    // On relance un petit resize de sécurité
    syncPWAHeight();

    badge.style.filter = 'none';
    badge.style.pointerEvents = 'auto';

    updateNorthBtnVisibility();
}

// --- LOGIQUE PHOTO (DRAG & FLIP) ---
miniBox.addEventListener('mousedown', (e) => {
    isDragging = true; hasDragged = false;
    const rect = miniBox.getBoundingClientRect(), cRect = container.getBoundingClientRect();
    dragStartX = e.clientX - (rect.left - cRect.left);
    dragStartY = e.clientY - (rect.top - cRect.top);
    miniBox.style.transition = 'none';
    e.preventDefault(); e.stopPropagation();
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        hasDragged = true;
        const clampedX = Math.max(10, Math.min(e.clientX - dragStartX, container.offsetWidth - miniBox.offsetWidth - 10));
        const clampedY = Math.max(10, Math.min(e.clientY - dragStartY, container.offsetHeight - miniBox.offsetHeight - 10));
        miniBox.style.transform = `translate(${clampedX - 14}px, ${clampedY - 14}px)`;
    }
    if (isZooming) handlePan(e.clientX, e.clientY);
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        if (!hasDragged) {
            isFlipped = !isFlipped;
            const p = currentPhotos[currentIndex];
            mainPhoto.src = isFlipped ? p.front : p.back;
            document.getElementById('mini-photo').src = isFlipped ? p.back : p.front;
        } else {
            justFinishedDrag = true;
            miniBox.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            const snapRight = (miniBox.getBoundingClientRect().left + miniBox.offsetWidth/2) > (container.getBoundingClientRect().left + container.offsetWidth/2);
        
            currentMiniSide = snapRight ? 'right' : 'left'; 

            miniBox.style.transform = snapRight ? `translate(${container.offsetWidth - miniBox.offsetWidth - 28}px, 0px)` : 'translate(0px, 0px)';
            setTimeout(() => justFinishedDrag = false, 500);
        }
    }
    if (isZooming) { justFinishedDrag = true; resetZoomState(); setTimeout(() => justFinishedDrag = false, 300); }
});

// --- LOGIQUE ZOOM ---
function updateTransform() {
    const maxTx = (container.offsetWidth * (zoomScale - 1)) / 2, maxTy = (container.offsetHeight * (zoomScale - 1)) / 2;
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
// #endregion


function getLocalUrl(jsonPath) {
    if (!jsonPath) return "";
    
    // 1. On nettoie le chemin (enlève le slash initial)
    let cleanPath = jsonPath.startsWith('/') ? jsonPath.substring(1) : jsonPath;
    
    // 2. Stratégie de recherche :
    // On essaie d'abord le chemin exact fourni par le JSON
    if (fileMap[cleanPath]) {
        return URL.createObjectURL(fileMap[cleanPath]);
    }

    // 3. Si non trouvé, on simplifie le chemin pour correspondre à l'archive standard
    // On extrait juste le nom du fichier (ex: image.webp)
    const parts = cleanPath.split('/');
    const fileName = parts[parts.length - 1];

    // On cherche si le fichier existe dans Photos/post, Photos/profile ou Photos/bereal
    const foldersToTry = ["Photos/post/", "Photos/profile/", "Photos/bereal/"];
    
    for (let folder of foldersToTry) {
        if (fileMap[folder + fileName]) {
            return URL.createObjectURL(fileMap[folder + fileName]);
        }
    }

    // 4. Cas particulier : chemin avec l'ID utilisateur au milieu (ton cas actuel)
    // Photos/ID_USER/bereal/nom.webp -> Photos/bereal/nom.webp
    if (cleanPath.includes('/bereal/')) {
        const simplifiedBereal = "Photos/bereal/" + fileName;
        if (fileMap[simplifiedBereal]) return URL.createObjectURL(fileMap[simplifiedBereal]);
    }

    console.warn("Fichier non trouvé dans l'archive :", cleanPath);
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
        const userData = JSON.parse(await fileMap['user.json'].text());
        const memoriesData = JSON.parse(await fileMap['memories.json'].text());
        const friendsData = JSON.parse(await fileMap['friends.json'].text());
        
        // On marque la session comme active dans le navigateur
        localStorage.setItem('bereal_session_active', 'true');
        
        initApp(userData, memoriesData, friendsData);

        // Fix bande noire PWA
        map.getCanvas().style.height = '100%';
        map.resize();

        document.getElementById('upload-overlay').style.display = 'none';
    } catch (err) {
        alert("Dossier invalide.");
    }
});

// Nouvelle fonction de démarrage
async function initApp(userData, memoriesData, friendsData) {

    // 1. Mise à jour du Profil (Textes et Image)
    const name = userData.username || "Utilisateur";
    
    // Header (Badge)
    const headerUser = document.getElementById('header-username');
    if (headerUser) headerUser.innerText = name;

    // Modal
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

    // 2. Préparation des photos pour la carte (Features GeoJSON)
    const momentCounts = {}; 

    const features = memoriesData.map(m => {
        // Logique pour déterminer si c'est un bonus
        const momentId = m.berealMoment || (m.takenTime ? m.takenTime.split('T')[0] : m.date);
        const isBonus = !!momentCounts[momentId];
        momentCounts[momentId] = true;

        // GESTION DES COORDONNÉES : Si pas de location, on force à [0, 0]
        const longitude = (m.location && m.location.longitude) ? m.location.longitude : 0;
        const latitude = (m.location && m.location.latitude) ? m.location.latitude : 0;

        return {
            type: 'Feature',
            geometry: { 
                type: 'Point', 
                coordinates: [longitude, latitude] 
            },
            properties: {
                front: getLocalUrl(m.frontImage.path),
                back: getLocalUrl(m.backImage.path),
                caption: m.caption || "",
                date: m.takenTime ? new Date(m.takenTime).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : "",
                time: m.takenTime ? new Date(m.takenTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : "",
                rawDate: m.takenTime,
                isLate: m.isLate,
                isBonus: isBonus
            }
        };
    });
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
        map.resize();
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

async function handleAutoLogin() {
    const loader = document.getElementById('loading-screen');
    const uploadOverlay = document.getElementById('upload-overlay');

    try {
        const savedFiles = await loadSessionFiles();
        const keys = Object.keys(savedFiles);

        if (keys.length > 0 && savedFiles['user.json'] && savedFiles['memories.json']) {
            fileMap = savedFiles;
            
            // On masque l'upload immédiatement si on a des fichiers
            uploadOverlay.style.display = 'none';

            const userData = JSON.parse(await savedFiles['user.json'].text());
            const memoriesData = JSON.parse(await savedFiles['memories.json'].text());
            const friendsData = JSON.parse(await savedFiles['friends.json'].text()); 

            const startApp = () => {
                initApp(userData, memoriesData, friendsData);
                
                // On force le resize ici aussi pour la PWA
                setTimeout(() => {
                    window.dispatchEvent(new Event('resize'));
                    map.resize();
                }, 300);
                
                loader.style.opacity = '0';
                setTimeout(() => loader.style.display = 'none', 500);
            };

            if (map.loaded()) startApp();
            else map.once('load', startApp);

        } else {
            console.warn("Session incomplète ou vide. Redirection upload.");
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

function fullResize() {
    const vh = window.innerHeight;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    
    // Ajout de la sécurité "&& map.resize"
    if (typeof map !== 'undefined' && map && map.resize) {
        map.resize();
    }
}

async function handleLogout(event) {
    if (event) event.stopPropagation(); // Empêche la fermeture de la modale
    
    if (confirm("Voulez-vous vraiment vous déconnecter et supprimer les données locales ?")) {
        try {
            // 1. On vide la base de données IndexedDB (fichiers photos/JSON)
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).clear();
            
            tx.oncomplete = () => {
                // 2. On vide le localStorage (marqueur de session)
                localStorage.clear();
                
                // 3. On recharge la page pour revenir à l'écran d'upload
                window.location.reload();
            };

            tx.onerror = (e) => {
                console.error("Erreur lors de la suppression des données:", e);
                // Fail-safe : on tente quand même le reload
                localStorage.clear();
                window.location.reload();
            };
        } catch (err) {
            console.error("Erreur déconnexion:", err);
            localStorage.clear();
            window.location.reload();
        }
    }
}

/* --- GESTION DE LA TAILLE ÉCRAN (FIX iOS/PWA) --- */

function syncPWAHeight() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    // On récupère la hauteur réelle disponible
    const vh = window.innerHeight;
    
    // On ne met à jour QUE si la hauteur a changé (évite les calculs inutiles)
    if (mapEl.style.height !== vh + 'px') {
        mapEl.style.height = vh + 'px';
        
        // On prévient MapLibre que la taille a changé
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
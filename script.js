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
// Supprime la ligne : document.getElementById('upload-overlay').style.display = 'flex'; (elle est gérée au dessus)


// À mettre juste après tes déclarations de variables globales
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

// Événements Tactiles
badge.addEventListener('touchstart', (e) => {
    isDraggingBadge = true;
    hasMovedBadge = false;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    mouseX = e.touches[0].clientX;
    mouseY = e.touches[0].clientY;
}, {passive: false});

document.addEventListener('mousemove', (e) => {
    if (!isDraggingBadge) return;
    if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) hasMovedBadge = true;
    targetX = e.clientX - mouseX;
    targetY = e.clientY - mouseY;
});

document.addEventListener('touchmove', (e) => {
    if (!isDraggingBadge) return;
    if (Math.abs(e.touches[0].clientX - startX) > 5 || Math.abs(e.touches[0].clientY - startY) > 5) hasMovedBadge = true;
    targetX = e.touches[0].clientX - mouseX;
    targetY = e.touches[0].clientY - mouseY;
    e.preventDefault();
}, {passive: false});

const stopBadgeDrag = () => { isDraggingBadge = false; targetX = 0; targetY = 0; };
document.addEventListener('mouseup', stopBadgeDrag);
document.addEventListener('touchend', stopBadgeDrag);

badge.addEventListener('click', () => {
    if (!hasMovedBadge) openDashboard();
});
// #endregion


// #region 3. STATISTIQUES & DASHBOARD
async function calculateStats(data) {
    try {
        // 1. STREAK & TOTAL
        const days = data.filter(m => m.date).map(m => m.date.split('T')[0]).sort();
        const uniqueDays = [...new Set(days)];
        let maxStreak = 0, currentStr = 0;
        for (let i = 0; i < uniqueDays.length; i++) {
            if (i === 0) currentStr = 1;
            else {
                const diff = Math.round((new Date(uniqueDays[i]) - new Date(uniqueDays[i - 1])) / 86400000);
                if (diff === 1) currentStr++;
                else { maxStreak = Math.max(maxStreak, currentStr); currentStr = 1; }
            }
            maxStreak = Math.max(maxStreak, currentStr);
        }

        // 2. PONCTUALITÉ
        const momentIds = [...new Set(data.map(m => m.berealMoment || m.date.split('T')[0]))];
        let onTimeCount = 0;
        momentIds.forEach(id => {
            if (data.some(m => (m.berealMoment === id || m.date.split('T')[0] === id) && m.isLate === false)) onTimeCount++;
        });
        const percent = momentIds.length > 0 ? Math.round((onTimeCount / momentIds.length) * 100) : 0;

        // 3. GÉOGRAPHIE (PAYS & DEPS)
        const validMemories = data.filter(m => m.location?.latitude && m.location?.longitude);
        const uniqueGeoPoints = validMemories.map(m => [m.location.longitude, m.location.latitude]);

        // On récupère les frontières pour le calcul
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
            // Check Pays
            for (let c of worldGeo.features) {
                if (turf.booleanPointInPolygon(pt, c)) {
                    foundCountries.add(c.properties.ADMIN || c.properties.name);
                    break;
                }
            }
            // Check Départements (si en France)
            if (coords[0] > -5 && coords[0] < 10 && coords[1] > 41 && coords[1] < 52) {
                for (let d of depsGeo.features) {
                    if (turf.booleanPointInPolygon(pt, d)) {
                        foundDeps.add(d.properties.nom);
                        break;
                    }
                }
            }
        });

        cachedStats = { 
            total: data.length, 
            percent: percent, 
            countries: foundCountries.size || (validMemories.length > 0 ? 1 : 0), 
            deps: foundDeps.size, 
            maxStreak 
        };
        
        updateDashboardUI();
    } catch (e) { 
        console.error("Erreur calcul stats:", e); 
    }
}

function updateDashboardUI() {
    if (!cachedStats) return;
    const ids = { 'stat-streak': cachedStats.total, 'stat-ontime': `${cachedStats.percent}%`, 'stat-countries': cachedStats.countries, 'stat-deps': cachedStats.deps, 'stat-max-streak': cachedStats.maxStreak };
    for (let id in ids) { const el = document.getElementById(id); if (el) el.innerText = ids[id]; }
}

function openDashboard() {
    document.getElementById('dashboard-modal').style.display = 'flex';
    document.getElementById('map').style.cssText = 'transform: scale(1.05); filter: blur(3px) brightness(0.4);';
    badge.style.opacity = '0';
    badge.style.pointerEvents = 'none';
    if (cachedStats) updateDashboardUI();
}

function closeDashboard() {
    document.getElementById('dashboard-modal').style.display = 'none';
    document.getElementById('map').style.cssText = 'transform: scale(1); filter: none;';
    badge.style.opacity = '1';
    badge.style.pointerEvents = 'auto';
}
// #endregion


// #region 4. GESTION DE LA CARTE (MapLibre)
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://api.maptiler.com/maps/dataviz-dark/style.json?key=iYlIQdqzuS2kKjZemTWi',
    center: [2.21, 46.22], 
    zoom: 5.5, 
    maxZoom: 17
});
// À placer dans la #region 4
// Affiche le zoom en temps réel dans la console (F12)
map.on('zoom', () => {
});

let currentRadiusMode = 60;

function watchZoomRadius(features) {
    map.on('zoomend', () => {
        const zoom = map.getZoom();
        
        // Par défaut, on met un rayon large (80) pour forcer le regroupement.
        // On affinera le seuil (ici 14) quand tu m'auras donné ta valeur.
        let newRadius = zoom >= 16 ? 130 : 50; 

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
        clusterMaxZoom: 22, // Bloque l'éclatement automatique par zoom
        clusterRadius: radius // Seul critère : la proximité en pixels
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
    map.on('click', 'clusters', (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
        const clusterId = f.properties.cluster_id;
        const coords = f.geometry.coordinates;
        const isNullIsland = Math.abs(coords[0]) < 0.1 && Math.abs(coords[1]) < 0.1;

        if (isNullIsland || map.getZoom() >= 13.5) {
            map.getSource('bereal-src').getClusterLeaves(clusterId, Infinity, 0, (err, leaves) => {
                if (!err) openModal(leaves.map(l => l.properties).sort((a,b) => new Date(b.rawDate) - new Date(a.rawDate)));
            });
        } else {
            map.getSource('bereal-src').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (!err) map.easeTo({ center: coords, zoom: Math.min(zoom, 14.5) });
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
// #endregion


// #region 5. MODALE, FLIP, ZOOM & PAN
function openModal(photos) {
    currentPhotos = photos; currentIndex = 0; 
    updateModalContent();
    modal.style.display = 'flex';
    document.getElementById('map').style.cssText = 'scale(1.1); filter: blur(3px) brightness(0.4);';
    badge.style.cssText += 'filter: blur(3px); pointer-events: none;';
}

function updateModalContent() {
    const p = currentPhotos[currentIndex];
    isFlipped = false; resetZoomState();
    mainPhoto.src = p.back;
    document.getElementById('mini-photo').src = p.front;
    document.getElementById('modal-caption').innerText = p.caption;
    document.getElementById('modal-metadata').innerText = `${p.date} • ${p.time}`;
    
    container.classList.toggle('on-time', p.isLate === false && p.isBonus === false);
    miniBox.style.cssText = 'transition: none; left: 14px; top: 14px;';
    document.getElementById('prevBtn').style.display = (currentPhotos.length > 1 && currentIndex > 0) ? 'flex' : 'none';
    document.getElementById('nextBtn').style.display = (currentPhotos.length > 1 && currentIndex < currentPhotos.length - 1) ? 'flex' : 'none';
}

function closeModal() {
    if (isDragging || justFinishedDrag || isZooming) return;
    modal.style.display = 'none';
    document.getElementById('map').style.cssText = 'transform: scale(1); filter: none;';
    badge.style.cssText = 'filter: none; pointer-events: auto;';
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
    lastMouseX = x; lastMouseY = y; translateX = 0; translateY = 0; zoomScale = 2.5; 
    mainPhoto.style.transition = 'transform 0.25s ease-out';
    updateTransform();
    photoContainer.classList.add('zoomed');
}

function handlePan(x, y) {
    translateX += (x - lastMouseX) / zoomScale;
    translateY += (y - lastMouseY) / zoomScale;
    lastMouseX = x; lastMouseY = y;
    mainPhoto.style.transition = 'none';
    updateTransform();
}

photoContainer.addEventListener('mousedown', (e) => { if (!e.target.closest('.mini-img-container')) startZoom(e.clientX, e.clientY); });
// #endregion


function getLocalUrl(jsonPath) {
    if (!jsonPath) return "";
    
    // 1. On enlève le premier slash s'il existe : "/Photos/..." -> "Photos/..."
    let cleanPath = jsonPath.startsWith('/') ? jsonPath.substring(1) : jsonPath;
    
    // 2. Parfois le JSON contient "Photos/AF9Ta.../post/img.webp" 
    // Si c'est le cas, on doit garder uniquement "Photos/post/img.webp" ou "Photos/profile/img.webp"
    if (cleanPath.includes('/post/')) {
        const parts = cleanPath.split('/');
        cleanPath = "Photos/post/" + parts[parts.length - 1];
    } else if (cleanPath.includes('/profile/')) {
        const parts = cleanPath.split('/');
        cleanPath = "Photos/profile/" + parts[parts.length - 1];
    }

    const file = fileMap[cleanPath];
    if (file) {
        return URL.createObjectURL(file);
    } else {
        console.warn("Fichier non trouvé dans l'archive :", cleanPath);
        return "";
    }
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
        
        // On marque la session comme active dans le navigateur
        localStorage.setItem('bereal_session_active', 'true');
        
        initApp(userData, memoriesData);
        document.getElementById('upload-overlay').style.display = 'none';
    } catch (err) {
        alert("Dossier invalide.");
    }
});

// Nouvelle fonction de démarrage
async function initApp(userData, memoriesData) {

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
    const momentCounts = {}; // Pour identifier le premier BeReal vs les Bonus

    const features = memoriesData
        .filter(m => m.location && m.location.longitude && m.location.latitude) // Évite le crash longitude
        .map(m => {
            // Logique pour déterminer si c'est un bonus
            const momentId = m.berealMoment || (m.takenTime ? m.takenTime.split('T')[0] : m.date);
            const isBonus = !!momentCounts[momentId];
            momentCounts[momentId] = true;

            return {
                type: 'Feature',
                geometry: { 
                    type: 'Point', 
                    coordinates: [m.location.longitude, m.location.latitude] 
                },
                properties: {
                    // On transforme les chemins du JSON en URLs locales (Blob)
                    front: getLocalUrl(m.frontImage.path),
                    back: getLocalUrl(m.backImage.path),
                    caption: m.caption || "",
                    // Formatage de la date et l'heure pour la France
                    date: m.takenTime ? new Date(m.takenTime).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : "",
                    time: m.takenTime ? new Date(m.takenTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : "",
                    rawDate: m.takenTime,
                    isLate: m.isLate,
                    isBonus: isBonus // Utilisé pour la bordure blanche (.on-time)
                }
            };
        });

    // 3. Chargement de la Carte
    if (features.length > 0) {
        const injectFeatures = () => {
            if (!map.getSource('bereal-src')) {
                setupMapLayers(features);
                // AJOUTER CETTE LIGNE ICI :
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
    // On passe memoriesData en argument car calculateStats en a besoin
    calculateStats(memoriesData);
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

            const startApp = () => {
                initApp(userData, memoriesData);
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
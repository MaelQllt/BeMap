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
async function calculateStats() {
    try {
        const memoriesRes = await fetch(`${FOLDER_NAME}/memories.json`);
        const data = await memoriesRes.json();

        // --- 1. Streak ---
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

        // --- 2. Ponctualité ---
        const momentsMap = {};
        data.forEach(m => {
            const momentId = m.berealMoment || m.date.split('T')[0];
            if (!momentsMap[momentId]) momentsMap[momentId] = [];
            momentsMap[momentId].push(m);
        });

        const momentIds = Object.keys(momentsMap);
        let onTimeMomentsCount = 0;
        momentIds.forEach(id => {
            if (momentsMap[id].some(m => m.isLate === false)) onTimeMomentsCount++;
        });
        const onTimePercent = momentIds.length > 0 ? Math.round((onTimeMomentsCount / momentIds.length) * 100) : 0;

        // --- 3. Géographie (Turf.js) ---
        const validMemories = data.filter(m => m.location?.latitude && m.location?.longitude);
        const uniqueGeoPoints = [];
        const seenGeo = new Set();
        validMemories.forEach(m => {
            const key = `${m.location.latitude.toFixed(3)},${m.location.longitude.toFixed(3)}`;
            if (!seenGeo.has(key)) { seenGeo.add(key); uniqueGeoPoints.push([m.location.longitude, m.location.latitude]); }
        });

        const [respWorld, respDeps] = await Promise.all([
            fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'),
            fetch('https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson')
        ]);
        const [worldGeo, depsGeo] = await Promise.all([respWorld.json(), respDeps.json()]);
        
        const foundCountries = new Set(), foundDeps = new Set();
        uniqueGeoPoints.forEach(coords => {
            const pt = turf.point(coords);
            for (let c of worldGeo.features) if (turf.booleanPointInPolygon(pt, c)) { foundCountries.add(c.properties.ADMIN || c.properties.name); break; }
            if (coords[0] > -5 && coords[0] < 10) {
                for (let d of depsGeo.features) if (turf.booleanPointInPolygon(pt, d)) { foundDeps.add(d.properties.nom); break; }
            }
        });

        cachedStats = { total: data.length, percent: onTimePercent, countries: foundCountries.size || (validMemories.length > 0 ? 1 : 0), deps: foundDeps.size, maxStreak };
        updateDashboardUI();
    } catch (e) { console.error("Erreur Stats:", e); }
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


// #region 6. INITIALISATION & ASSETS
async function init() {
    try {
        const userRes = await fetch(`${FOLDER_NAME}/user.json`);
        if (userRes.ok) {
            const userData = await userRes.json();
            const name = userData.username || "Utilisateur";

            // Mise à jour du Header
            const headerUser = document.getElementById('header-username');
            if (headerUser) headerUser.innerText = name;

            // Mise à jour de la Modale (BeReal utilise souvent une classe ici)
            const modalUser = document.querySelector('.bereal-username');
            if (modalUser) modalUser.innerText = name;

            // Photo de profil
            const profilePic = document.getElementById('profile-pic');
            if (profilePic) profilePic.src = `${FOLDER_NAME}/Photos/profile/X9u-3RqfGd2xcaU0NYSDe.webp`;
        }

        const memoriesRes = await fetch(`${FOLDER_NAME}/memories.json`);
        const data = await memoriesRes.json();
        const momentCounts = {};
        
        const features = data.map(m => {
            const momentId = m.berealMoment || m.date.split('T')[0];
            const isBonus = !!momentCounts[momentId];
            momentCounts[momentId] = true;
            const hasLoc = m.location?.latitude && m.location?.longitude;
            return {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: hasLoc ? [m.location.longitude, m.location.latitude] : [0, 0] },
                properties: {
                    caption: m.caption || (hasLoc ? "Sans légende" : "⚠️ Sans GPS"),
                    front: `${FOLDER_NAME}/Photos/post/${m.frontImage.path.split('/').pop()}`,
                    back: `${FOLDER_NAME}/Photos/post/${m.backImage.path.split('/').pop()}`,
                    date: m.takenTime ? new Date(m.takenTime).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : "",
                    time: m.takenTime ? new Date(m.takenTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : "",
                    rawDate: m.takenTime, 
                    isLate: m.isLate, 
                    isBonus: isBonus
                }
            };
        });

        if (map.loaded()) setupMapLayers(features); else map.on('load', () => setupMapLayers(features));
        calculateStats();
    } catch (e) { 
        console.error("Erreur init:", e); 
    }
}


init();
// #endregion
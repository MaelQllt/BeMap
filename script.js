/**
 * --- CONFIGURATION & ÉTAT GLOBAL ---
 */
const FOLDER_NAME = "AF9TaX9kF2Ph70UyFt19wuMJvqr2-pGvnrPTVROrjNoqlXt1pl";

const usernameDisplay = document.querySelector('.bereal-username');
const miniBox = document.getElementById('mini-img-box');
const container = document.getElementById('photo-container');
const mainPhoto = document.getElementById('main-photo');
const photoContainer = document.getElementById('photo-container');
const modal = document.getElementById('bereal-modal');

let currentPhotos = [], currentIndex = 0, isFlipped = false;
let isDragging = false, dragStartX, dragStartY, hasDragged = false, justFinishedDrag = false;
let isZooming = false, zoomScale = 1, zoomOriginX = 50, zoomOriginY = 50;
let translateX = 0, translateY = 0;
let lastMouseX, lastMouseY;
let cachedStats = null;

// Stockage pour les chiffres Inter (HTML Markers)
let clusterMarkers = {};

/**
 * --- DRAG PROFILE ---
 */

const badge = document.querySelector('.user-profile-header');
let mouseX = 0, mouseY = 0; // Position de la souris
let badgeX = 0, badgeY = 0; // Position actuelle du badge
let targetX = 0, targetY = 0; // Position cible (où le badge veut aller)
let isDraggingBadge = false;

// Puissance de l'aimant/inertie (0.1 = très fluide/lent, 0.3 = plus réactif)
const friction = 0.3; 

function animateBadge() {
    // Si on drag, le badge "chasse" la souris avec inertie
    // Si on relâche, targetX et targetY sont à 0, donc il revient à l'origine
    badgeX += (targetX - badgeX) * friction;
    badgeY += (targetY - badgeY) * friction;

    badge.style.transform = `translate(${badgeX}px, ${badgeY}px)`;
    
    requestAnimationFrame(animateBadge);
}

// Lancer l'animation
animateBadge();
// Au début du fichier, ajoute cette variable pour suivre si on a bougé pendant le clic
let badgeMoved = false;

badge.addEventListener('mousedown', (e) => {
    isDraggingBadge = true;
    badgeMoved = false; // Reset au début du clic
    mouseX = e.clientX;
    mouseY = e.clientY;
    e.preventDefault();
});

// Remplace ton badge.addEventListener('click') par celui-ci :
badge.addEventListener('click', (e) => {
    // Si la souris a bougé de moins de 5 pixels, c'est un clic, pas un drag
    if (Math.abs(targetX) < 5 && Math.abs(targetY) < 5) {
        openDashboard();
    }
});


function updateDashboardUI() {
    if (!cachedStats) return;

    // On ne récupère que les compteurs de stats
    const streakEl = document.getElementById('stat-streak');
    const ontimeEl = document.getElementById('stat-ontime');
    const countriesEl = document.getElementById('stat-countries');
    const depsEl = document.getElementById('stat-deps');

    const maxStreakEl = document.getElementById('stat-max-streak');
    if (maxStreakEl) maxStreakEl.innerText = cachedStats.maxStreak;

    // Mise à jour sécurisée des éléments restants
    if (streakEl) streakEl.innerText = cachedStats.total;
    if (ontimeEl) ontimeEl.innerText = `${cachedStats.percent}%`;
    if (countriesEl) countriesEl.innerText = cachedStats.countries;
    if (depsEl) depsEl.innerText = cachedStats.deps;
}

async function openDashboard() {
    const dash = document.getElementById('dashboard-modal');
    dash.style.display = 'flex';
    
    document.getElementById('map').style.cssText = 'transform: scale(1.05); filter: blur(3px) brightness(0.4);';
    document.querySelector('.user-profile-header').style.opacity = '0';
    document.querySelector('.user-profile-header').style.pointerEvents = 'none';
    
    // Si les stats sont prêtes, on les affiche. 
    // Si elles ne sont pas encore prêtes (connexion lente), elles s'afficheront 
    // automatiquement dès que calculateStats() aura fini grâce à updateDashboardUI()
    if (cachedStats) {
        updateDashboardUI();
    }
}

function closeDashboard() {
    document.getElementById('dashboard-modal').style.display = 'none';
    document.getElementById('map').style.cssText = 'transform: scale(1); filter: none;';
    document.querySelector('.user-profile-header').style.opacity = '1';
    document.querySelector('.user-profile-header').style.pointerEvents = 'auto';
}


async function calculateStats() {
    try {
        const memoriesRes = await fetch(`${FOLDER_NAME}/memories.json`);
        const data = await memoriesRes.json();

        // 1. CALCUL DE LA STREAK (Sur TOUS les BeReal, avec ou sans GPS)
        const days = data
            .filter(m => m.date)
            .map(m => m.date.split('T')[0])
            .sort();

        const uniqueDays = [...new Set(days)];
        
        let maxStreak = 0;
        let currentStreak = 0;
        let streakStartDate = uniqueDays[0];

        for (let i = 0; i < uniqueDays.length; i++) {
            if (i === 0) {
                currentStreak = 1;
                streakStartDate = uniqueDays[i];
            } else {
                const prev = new Date(uniqueDays[i - 1]);
                const curr = new Date(uniqueDays[i]);
                const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

                if (diffDays === 1) {
                    currentStreak++;
                } else {
                    if (currentStreak > maxStreak) maxStreak = currentStreak;
                    currentStreak = 1;
                    streakStartDate = uniqueDays[i];
                }
            }
            if (currentStreak > maxStreak) maxStreak = currentStreak;
        }

        // 2. FILTRAGE POUR LA CARTE ET LA GÉO
        const validMemories = data.filter(m => m.location && m.location.latitude && m.location.longitude);

        // --- CALCUL GÉO (TURF) ---
        const uniqueGeoPoints = [];
        const seenGeo = new Set();
        validMemories.forEach(m => {
            const key = `${m.location.latitude.toFixed(3)},${m.location.longitude.toFixed(3)}`;
            if (!seenGeo.has(key)) {
                seenGeo.add(key);
                uniqueGeoPoints.push([m.location.longitude, m.location.latitude]);
            }
        });

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
            for (let c of worldGeo.features) { if (turf.booleanPointInPolygon(pt, c)) { foundCountries.add(c.properties.ADMIN || c.properties.name); break; } }
            if (coords[0] > -5 && coords[0] < 10) {
                for (let d of depsGeo.features) { if (turf.booleanPointInPolygon(pt, d)) { foundDeps.add(d.properties.nom); break; } }
            }
        });

        // 3. MISE À JOUR CACHE & UI
        cachedStats = {
            total: data.length, // Affiche 1393 ici
            percent: data.length > 0 ? Math.round((data.filter(m => !m.isLate).length / data.length) * 100) : 0,
            countries: foundCountries.size || (validMemories.length > 0 ? 1 : 0),
            deps: foundDeps.size,
            maxStreak: maxStreak
        };

        updateDashboardUI();

    } catch (e) {
        console.error("Erreur Stats:", e);
    }
}

document.addEventListener('mousemove', (e) => {
    if (!isDraggingBadge) return;
    
    // On calcule la distance par rapport au point de départ du clic
    targetX = e.clientX - mouseX;
    targetY = e.clientY - mouseY;
});

document.addEventListener('mouseup', () => {
    isDraggingBadge = false;
    // L'aimant : on remet la cible à 0
    targetX = 0;
    targetY = 0;
});

// Support Tactile
badge.addEventListener('touchstart', (e) => {
    isDraggingBadge = true;
    mouseX = e.touches[0].clientX;
    mouseY = e.touches[0].clientY;
}, {passive: false});

document.addEventListener('touchmove', (e) => {
    if (!isDraggingBadge) return;
    targetX = e.touches[0].clientX - mouseX;
    targetY = e.touches[0].clientY - mouseY;
    e.preventDefault();
}, {passive: false});

document.addEventListener('touchend', () => {
    isDraggingBadge = false;
    targetX = 0;
    targetY = 0;
});

/**
 * --- INITIALISATION DE LA CARTE ---
 */
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://api.maptiler.com/maps/dataviz-dark/style.json?key=iYlIQdqzuS2kKjZemTWi',
    center: [2.21, 46.22], 
    zoom: 5.5, 
    maxZoom: 17
});

/**
 * --- LOGIQUE DE CHARGEMENT ---
 */
async function init() {
    try {
        const userRes = await fetch(`${FOLDER_NAME}/user.json`);
        if (userRes.ok) {
            const userData = await userRes.json();
            
            if (userData.username) {
                // Met à jour le badge en haut à gauche
                document.getElementById('header-username').innerText = userData.username;
                
                // Met à jour le nom dans la MODAL (important pour enlever "Chargement...")
                const modalUsername = document.querySelector('.bereal-username');
                if (modalUsername) {
                    modalUsername.innerText = userData.username;
                }
            }
            
            const profilePath = `${FOLDER_NAME}/Photos/profile/X9u-3RqfGd2xcaU0NYSDe.webp`;
            document.getElementById('profile-pic').src = profilePath;
        }

        const memoriesRes = await fetch(`${FOLDER_NAME}/memories.json`);
        if (!memoriesRes.ok) throw new Error("Fichier memories.json introuvable");
        const data = await memoriesRes.json();
        
        const features = data
            .filter(m => m.location && m.location.latitude)
            .map(m => ({
                type: 'Feature',
                geometry: { 
                    type: 'Point', 
                    coordinates: [parseFloat(m.location.longitude), parseFloat(m.location.latitude)] 
                },
                properties: {
                    caption: m.caption || "Sans légende",
                    front: `${FOLDER_NAME}/Photos/post/${m.frontImage.path.split('/').pop()}`,
                    back: `${FOLDER_NAME}/Photos/post/${m.backImage.path.split('/').pop()}`,
                    date: m.takenTime ? new Date(m.takenTime).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : "",
                    time: m.takenTime ? new Date(m.takenTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : "",
                    rawDate: m.takenTime
                }
            }));

        if (map.loaded()) setupMapLayers(features);
        else map.on('load', () => setupMapLayers(features));

        calculateStats();

    } catch (e) {
        console.error("Erreur d'initialisation:", e);
    }
}

function setupMapLayers(features) {
    // 1. Sécurité : On vérifie si la source existe déjà pour éviter les erreurs de doublons
    if (map.getSource('bereal-src')) return;

    // 2. Création de la source avec des paramètres statiques (indispensable pour la stabilité)
    map.addSource('bereal-src', {
        type: 'geojson',
        data: { 
            type: 'FeatureCollection', 
            features: features 
        },
        cluster: true,
        // À partir du zoom 14, MapLibre ne cherchera plus à séparer les points
        clusterMaxZoom: 22, 
        // Un rayon de 100px permet de garder les photos groupées même si elles sont un peu espacées
        clusterRadius: 50 
    });

    // 3. Couche visuelle des Clusters (Cercles noirs)
    map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'bereal-src',
        filter: ['has', 'point_count'],
        paint: { 
            'circle-color': '#151517', 
            'circle-radius': 18, 
            'circle-stroke-width': 1, 
            'circle-stroke-color': '#d9d9d960'
        }
    });

    // 4. Couche invisible pour les points isolés (pour laisser les Markers HTML s'afficher)
    map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'bereal-src',
        filter: ['!', ['has', 'point_count']],
        paint: { 
            'circle-opacity': 0,
            'circle-radius': 15 
        }
    });

    /**
     * --- LOGIQUE DES MARKERS HTML (Chiffres Inter et Points) ---
     */
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
                if (props.cluster) {
                    el.className = 'custom-cluster-label';
                    el.innerText = props.point_count;
                } else {
                    el.className = 'custom-point-marker';
                }
                
                clusterMarkers[id] = new maplibregl.Marker({
                    element: el,
                    anchor: 'center'
                })
                .setLngLat(coords)
                .addTo(map);
            }
        }

        // Nettoyage des markers qui sortent de l'écran
        for (const id in clusterMarkers) {
            if (!newMarkers[id]) {
                clusterMarkers[id].remove();
                delete clusterMarkers[id];
            }
        }
    });

    /**
     * --- GESTION DES CLICS ---
     */
    map.on('click', 'clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        const clusterId = features[0].properties.cluster_id;
        const source = map.getSource('bereal-src');

        // Si on est déjà au zoom 13.5 ou plus, on ouvre la modal direct
        // car le cluster ne se divisera plus (clusterMaxZoom: 14)
        if (map.getZoom() >= 13.5) {
            source.getClusterLeaves(clusterId, Infinity, 0, (err, leaves) => {
                if (err) return;
                openModal(leaves.map(l => l.properties).sort((a,b) => new Date(b.rawDate) - new Date(a.rawDate)));
            });
        } else {
            // Sinon on zoom pour s'approcher
            source.getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return;
                map.easeTo({ 
                    center: features[0].geometry.coordinates, 
                    zoom: Math.min(zoom, 14.5) 
                });
            });
        }
    });

    map.on('click', 'unclustered-point', (e) => {
        openModal([e.features[0].properties]);
    });

    // Curseur pointer au survol
    map.on('mouseenter', 'clusters', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'clusters', () => map.getCanvas().style.cursor = '');

    watchZoomRadius(features);
}

let currentRadiusMode = 50;

function watchZoomRadius(features) {
    map.on('zoom', () => {
        const zoom = map.getZoom();
        let newRadius = zoom >= 15 ? 80 : 50; 

        if (newRadius !== currentRadiusMode) {
            currentRadiusMode = newRadius;
            updateMapSource(features, newRadius);
        }
    });
}

function updateMapSource(features, radius) {
    if (!map.getSource('bereal-src')) return;

    // 1. On récupère les définitions des couches avant de supprimer la source
    // car supprimer une source supprime automatiquement ses couches liées.
    
    // 2. On supprime les couches
    if (map.getLayer('clusters')) map.removeLayer('clusters');
    if (map.getLayer('unclustered-point')) map.removeLayer('unclustered-point');

    // 3. On supprime la source
    map.removeSource('bereal-src');

    // 4. On recrée la source AVEC LE NOUVEAU RAYON
    map.addSource('bereal-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: features },
        cluster: true,
        clusterMaxZoom: 20,
        clusterRadius: radius
    });

    // 5. On remet les couches (on appelle une petite fonction pour éviter de dupliquer le code)
    reAddLayers();
}

function reAddLayers() {
    map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'bereal-src',
        filter: ['has', 'point_count'],
        paint: { 
            'circle-color': '#151517', 
            'circle-radius': 18, 
            'circle-stroke-width': 1, 
            'circle-stroke-color': '#d9d9d960'
        }
    });

    map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'bereal-src',
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-opacity': 0, 'circle-radius': 15 }
    });
}


/**
 * --- MODAL, ZOOM, DRAG ---
 * (Logique identique à la précédente, optimisée)
 */
function openModal(photos) {
    currentPhotos = photos; 
    currentIndex = 0; 
    updateModalContent();
    modal.style.display = 'flex';
    
    // On floute la carte ET le badge
    const blurEffect = 'scale(1.1); filter: blur(3px) brightness(0.4);';
    document.getElementById('map').style.cssText = blurEffect;
    document.querySelector('.user-profile-header').style.cssText += 'filter: blur(3px); pointer-events: none;';
}

function updateModalContent() {
    const p = currentPhotos[currentIndex];
    isFlipped = false; resetZoomState();
    mainPhoto.src = p.back;
    document.getElementById('mini-photo').src = p.front;
    document.getElementById('modal-caption').innerText = p.caption;
    document.getElementById('modal-metadata').innerText = `${p.date} • ${p.time}`;
    miniBox.style.cssText = 'transition: none; left: 14px; top: 14px;';
    document.getElementById('prevBtn').style.display = (currentPhotos.length > 1 && currentIndex > 0) ? 'flex' : 'none';
    document.getElementById('nextBtn').style.display = (currentPhotos.length > 1 && currentIndex < currentPhotos.length - 1) ? 'flex' : 'none';
}

function closeModal() {
    if (isDragging || justFinishedDrag || isZooming) return;
    modal.style.display = 'none';
    
    // On retire le flou
    document.getElementById('map').style.cssText = 'transform: scale(1); filter: none;';
    document.querySelector('.user-profile-header').style.cssText = 'filter: none; pointer-events: auto;';
}

function nextPhoto() { if (currentIndex < currentPhotos.length - 1) { currentIndex++; vibrate('light'); updateModalContent(); } }
function prevPhoto() { if (currentIndex > 0) { currentIndex--; vibrate('light'); updateModalContent(); } }

function vibrate(type) { if (navigator.vibrate) navigator.vibrate(type === 'light' ? 10 : 20); }

// Logic Drag, Flip et Zoom (simplifiée pour le message)
miniBox.addEventListener('mousedown', (e) => {
    isDragging = true; hasDragged = false;
    dragStartX = e.clientX - miniBox.offsetLeft;
    dragStartY = e.clientY - miniBox.offsetTop;
    miniBox.style.transition = 'none';
    e.preventDefault(); e.stopPropagation();
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        hasDragged = true;
        miniBox.style.left = Math.max(10, Math.min(e.clientX - dragStartX, container.offsetWidth - miniBox.offsetWidth - 10)) + 'px';
        miniBox.style.top = Math.max(10, Math.min(e.clientY - dragStartY, container.offsetHeight - miniBox.offsetHeight - 10)) + 'px';
    }
    if (isZooming) handlePan(e.clientX, e.clientY);
});

document.addEventListener('mouseup', (e) => {
    if (isDragging) {
        isDragging = false;
        if (!hasDragged) {
            isFlipped = !isFlipped; vibrate('light');
            const p = currentPhotos[currentIndex];
            mainPhoto.src = isFlipped ? p.front : p.back;
            document.getElementById('mini-photo').src = isFlipped ? p.back : p.front;
        } else {
            justFinishedDrag = true; vibrate('medium');
            miniBox.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            miniBox.style.left = (miniBox.offsetLeft + miniBox.offsetWidth/2) < container.offsetWidth/2 ? '14px' : (container.offsetWidth - miniBox.offsetWidth - 14) + 'px';
            miniBox.style.top = '14px';
            setTimeout(() => justFinishedDrag = false, 500);
        }
    }
    if (isZooming) { justFinishedDrag = true; resetZoomState(); setTimeout(() => justFinishedDrag = false, 300); }
});

function updateTransform() {
    // 1. Calcul de la zone visible supplémentaire créée par le zoom
    // (Largeur zoomée - Largeur conteneur) / 2
    const maxTx = (container.offsetWidth * (zoomScale - 1)) / 2;
    const maxTy = (container.offsetHeight * (zoomScale - 1)) / 2;

    // 2. On bloque (clamp) les valeurs pour ne jamais dépasser ces bords
    // On divise par zoomScale car le translate est multiplié par le scale en CSS
    const clampX = maxTx / zoomScale;
    const clampY = maxTy / zoomScale;

    translateX = Math.max(-clampX, Math.min(translateX, clampX));
    translateY = Math.max(-clampY, Math.min(translateY, clampY));

    // 3. On applique la transformation
    mainPhoto.style.transform = `scale(${zoomScale}) translate(${translateX}px, ${translateY}px)`;
}

function resetZoomState() { isZooming = false; zoomScale = 1; translateX = 0; translateY = 0; mainPhoto.style.transform = 'scale(1) translate(0,0)'; photoContainer.classList.remove('zoomed'); }
function startZoom(x, y) {
    if (isZooming) return;
    isZooming = true;
    
    // On fixe l'origine au centre pour éviter les décalages imprévisibles
    mainPhoto.style.transformOrigin = `50% 50%`;
    
    lastMouseX = x;
    lastMouseY = y;
    
    // Position initiale : pas de décalage
    translateX = 0;
    translateY = 0;
    
    zoomScale = 2.5; 
    mainPhoto.style.transition = 'transform 0.25s ease-out';
    
    updateTransform();
    photoContainer.classList.add('zoomed');
}
function handlePan(x, y) {
    // On calcule le mouvement relatif
    const deltaX = (x - lastMouseX) / zoomScale;
    const deltaY = (y - lastMouseY) / zoomScale;

    translateX += deltaX;
    translateY += deltaY;

    lastMouseX = x;
    lastMouseY = y;

    mainPhoto.style.transition = 'none'; // Pas de délai pendant le mouvement
    updateTransform();
}
photoContainer.addEventListener('mousedown', (e) => { if (!e.target.closest('.mini-img-container')) startZoom(e.clientX, e.clientY); });

init();
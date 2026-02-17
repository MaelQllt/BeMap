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

// Stockage pour les chiffres Inter (HTML Markers)
let clusterMarkers = {};

/**
 * --- INITIALISATION DE LA CARTE ---
 */
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://api.maptiler.com/maps/dataviz-dark/style.json?key=iYlIQdqzuS2kKjZemTWi',
    center: [2.21, 46.22], 
    zoom: 5.5, 
    maxZoom: 15
});

/**
 * --- LOGIQUE DE CHARGEMENT ---
 */
async function init() {
    try {
        const userRes = await fetch(`${FOLDER_NAME}/user.json`);
        if (userRes.ok) {
            const userData = await userRes.json();
            if (userData.username) usernameDisplay.innerText = userData.username.toUpperCase();
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

    } catch (e) {
        console.error("Erreur d'initialisation:", e);
    }
}

function setupMapLayers(features) {
    map.addSource('bereal-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
    });

    // 1. Couche Cercles Clusters (Canvas) - Garde tes couleurs exactes
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

    // 2. Couche Points isolés (Canvas) 
    // Mise à 0 d'opacité pour laisser place au Marker HTML avec ombrage
    map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'bereal-src',
        filter: ['!', ['has', 'point_count']],
        paint: { 
            'circle-opacity': 0, // On cache le rendu canvas
            'circle-radius': 10  // On garde une zone de clic généreuse
        }
    });

    // 3. Gestion des Markers HTML (Clusters + Points isolés)
    map.on('render', () => {
        const newMarkers = {};
        const featuresOnScreen = map.querySourceFeatures('bereal-src');

        for (const feature of featuresOnScreen) {
            const coords = feature.geometry.coordinates;
            const props = feature.properties;
            
            // On crée un ID unique pour différencier clusters et points simples
            const id = props.cluster ? `c-${props.cluster_id}` : `p-${coords.join(',')}`;
            newMarkers[id] = true;

            if (!clusterMarkers[id]) {
                const el = document.createElement('div');
                
                if (props.cluster) {
                    // C'est un groupe : on met le chiffre Inter
                    el.className = 'custom-cluster-label';
                    el.innerText = props.point_count;
                } else {
                    // C'est un point seul : on applique la classe pour l'ombrage CSS
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

        // Nettoyage
        for (const id in clusterMarkers) {
            if (!newMarkers[id]) {
                clusterMarkers[id].remove();
                delete clusterMarkers[id];
            }
        }
    });

    /**
     * --- CLICS & INTERACTION ---
     */
    map.on('click', 'clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        const clusterId = features[0].properties.cluster_id;
        const source = map.getSource('bereal-src');

        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            if (map.getZoom() >= 13) {
                source.getClusterLeaves(clusterId, Infinity, 0, (err, leaves) => {
                    openModal(leaves.map(l => l.properties).sort((a,b) => new Date(b.rawDate) - new Date(a.rawDate)));
                });
            } else {
                map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom + 1 });
            }
        });
    });

    map.on('click', 'unclustered-point', (e) => openModal([e.features[0].properties]));
    map.on('mouseenter', 'clusters', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'clusters', () => map.getCanvas().style.cursor = '');
}


/**
 * --- MODAL, ZOOM, DRAG ---
 * (Logique identique à la précédente, optimisée)
 */
function openModal(photos) {
    currentPhotos = photos; currentIndex = 0; updateModalContent();
    modal.style.display = 'flex';
    document.getElementById('map').style.cssText = 'transform: scale(1.1); filter: blur(10px) brightness(0.4);';
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
    document.getElementById('map').style.cssText = 'transform: scale(1); filter: none;';
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

function updateTransform() { mainPhoto.style.transform = `scale(${zoomScale}) translate(${translateX}px, ${translateY}px)`; }
function resetZoomState() { isZooming = false; zoomScale = 1; translateX = 0; translateY = 0; mainPhoto.style.transform = 'scale(1) translate(0,0)'; photoContainer.classList.remove('zoomed'); }
function startZoom(x, y) {
    isZooming = true; const rect = photoContainer.getBoundingClientRect();
    zoomOriginX = ((x - rect.left) / rect.width) * 100; zoomOriginY = ((y - rect.top) / rect.height) * 100;
    mainPhoto.style.transformOrigin = `${zoomOriginX}% ${zoomOriginY}%`;
    lastMouseX = x; lastMouseY = y; zoomScale = 2.5; mainPhoto.style.transition = 'transform 0.25s ease-out';
    updateTransform(); photoContainer.classList.add('zoomed');
}
function handlePan(x, y) { translateX += (x - lastMouseX) / zoomScale; translateY += (y - lastMouseY) / zoomScale; lastMouseX = x; lastMouseY = y; mainPhoto.style.transition = 'none'; updateTransform(); }

photoContainer.addEventListener('mousedown', (e) => { if (!e.target.closest('.mini-img-container')) startZoom(e.clientX, e.clientY); });

init();
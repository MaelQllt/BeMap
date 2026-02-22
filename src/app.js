/**
 * APP.JS — Point d'entrée principal
 * Gère l'upload, l'auto-login, l'initialisation et les interactions globales (clavier, relocation)
 */

import { saveFileToSession, loadSessionFiles, checkDifferencesAndShowExport } from './db.js';
import { fileMap, setFileMap, allMemoriesData, setAllMemoriesData, isRelocating, memoryToUpdate, setIsRelocating } from './state.js';
import { map, setup3DBuildings, setupMapLayers, refreshMapMarkers, watchZoomRadius } from './map.js';
import { calculateStats, setCachedStats, initDashboard, closeDashboard, switchDash } from './dashboard.js';
import { initBadge } from './badge.js';
import { getLocalUrl, syncPWAHeight, setMapRef } from './utils.js';
import { nextPhoto, prevPhoto, closeModal } from './modal.js';
import { initTimeline, applyFiltersToMap } from './timeline.js';
import { initFilters, buildFiltersUI, closeFilters } from './filters.js';

setMapRef(map);

// --- TOAST INLINE CARTE ---
function showMapToast(message, type = 'success') {
    const existing = document.getElementById('map-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'map-toast';
    toast.className = type === 'error' ? 'map-toast map-toast--error' : 'map-toast';
    toast.innerText = message;

    document.getElementById('map').appendChild(toast);

    // Force reflow pour que la transition CSS s'applique
    toast.getBoundingClientRect();
    toast.classList.add('map-toast--visible');

    setTimeout(() => { toast.classList.remove('map-toast--visible'); }, 2200);
    setTimeout(() => { toast.remove(); }, 2700);
}

// --- LOADER STATS ---
function showStatsLoader(visible) {
    let loader = document.getElementById('stats-loader');
    if (visible) {
        if (loader) return;
        loader = document.createElement('div');
        loader.id = 'stats-loader';
        loader.className = 'map-stats-loader';
        loader.innerText = 'Repositionnement en cours…';
        document.getElementById('map').appendChild(loader);
    } else {
        loader?.remove();
    }
}

// --- DÉMARRAGE ANTICIPÉ ---
if (localStorage.getItem('bereal_session_active') === 'true') {
    document.getElementById('loading-screen').style.display = 'flex';
    document.getElementById('upload-overlay').style.display = 'none';
} else {
    document.getElementById('upload-overlay').style.display = 'flex';
}

// --- CONVERSION MEMORIES → GEOJSON ---
export function convertMemoriesToGeoJSON(data) {
    const seenIds = new Set();
    return data.map(m => {
        // Utilise berealMoment en priorité, sinon takenTime complet (timestamp précis) pour éviter
        // les faux positifs entre deux BeReal distincts tombant le même jour
        const momentId = m.berealMoment || m.takenTime || m.date;
        const isBonus = seenIds.has(momentId);
        seenIds.add(momentId);

        const lng = parseFloat(m.location?.longitude);
        const lat = parseFloat(m.location?.latitude);

        return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [isNaN(lng) ? 0 : lng, isNaN(lat) ? 0 : lat] },
            properties: {
                front:    getLocalUrl(m.frontImage?.path),
                back:     getLocalUrl(m.backImage?.path),
                caption:  m.caption || "",
                location: m.location,
                rawDate:  m.takenTime,
                // ID unique stable pour la relocation (takenTime + index dans le tableau original)
                uid:      m.uid ?? m.takenTime,
                date:     m.takenTime ? new Date(m.takenTime).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : "",
                time:     m.takenTime ? new Date(m.takenTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : "",
                isLate:   m.isLate,
                isBonus:  isBonus,
            }
        };
    });
}

// --- INITIALISATION ---
async function initApp(userData, memoriesData, friendsData) {
    const name = userData.username || userData.fullname || "Utilisateur BeReal";
    document.getElementById('header-username').innerText = name;
    document.querySelector('.bereal-username').innerText = name;

    if (userData.profilePicture) {
        const picUrl = getLocalUrl(userData.profilePicture.path);
        const profileImg = document.getElementById('profile-pic');
        if (profileImg && picUrl) profileImg.src = picUrl;
    }

    const features = convertMemoriesToGeoJSON(memoriesData);
    if (features.length > 0) {
        const injectFeatures = () => {
            if (!map.getSource('bereal-src')) {
                setupMapLayers(features);
                watchZoomRadius(() => applyFiltersToMap());
            }
        };
        if (map.loaded()) injectFeatures();
        else map.once('load', injectFeatures);
    }

    calculateStats(memoriesData, userData, friendsData);
    buildFiltersUI();
    setup3DBuildings();
    syncPWAHeight();
}

// --- REPOSITIONNEMENT D'UN BEREAL ---
map.on('click', async (e) => {
    if (!isRelocating || !memoryToUpdate) return;

    const { lng, lat } = e.lngLat;

    // Recherche par uid en priorité, fallback rawDate — évite les collisions sur timestamp identique
    const index = allMemoriesData.findIndex(m =>
        (m.uid != null && m.uid === memoryToUpdate.uid) ||
        m.takenTime === memoryToUpdate.rawDate
    );
    if (index === -1) {
        showMapToast("Souvenir introuvable.", 'error');
        return;
    }

    allMemoriesData[index].location = { latitude: lat, longitude: lng };
    const blob = new Blob([JSON.stringify(allMemoriesData)], { type: 'application/json' });
    await saveFileToSession("memories.json", blob);

    refreshMapMarkers(allMemoriesData, convertMemoriesToGeoJSON);
    checkDifferencesAndShowExport();

    showStatsLoader(true);
    try {
        const userData    = JSON.parse(await fileMap['user.json'].text());
        const friendsData = fileMap['friends.json'] ? JSON.parse(await fileMap['friends.json'].text()) : [];
        setCachedStats(null);
        await calculateStats(allMemoriesData, userData, friendsData);
    } catch (err) {
        console.error("Erreur recalcul stats:", err);
        showMapToast("Erreur lors du recalcul des stats.", 'error');
    } finally {
        showStatsLoader(false);
    }

    setIsRelocating(false);
    document.getElementById('map').style.cursor = '';
    showMapToast("Position mise à jour.");
});

// --- UPLOAD INITIAL ---
document.getElementById('folder-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    const statusMsg = document.getElementById('status-msg');
    const newFileMap = {};

    // Indexation du fileMap en mémoire (pas de I/O ici)
    for (const file of files) {
        const path = file.webkitRelativePath.split('/').slice(1).join('/');
        newFileMap[path] = file;
    }

    // Sauvegarde en session par batches de 25 fichiers en parallèle
    const BATCH_SIZE = 25;
    const entries = Object.entries(newFileMap);
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(([path, file]) => saveFileToSession(path, file)));
        statusMsg.innerText = `Création de la session... (${Math.round(((i + batch.length) / entries.length) * 100)}%)`;
    }

    setFileMap(newFileMap);

    try {
        const memoriesFile = newFileMap['memories.json'];
        await saveFileToSession("memories_original.json", memoriesFile);

        const userData     = JSON.parse(await newFileMap['user.json'].text());
        const memoriesData = JSON.parse(await memoriesFile.text());
        // Fix : fallback [] si friends.json absent, comme dans l'auto-login
        const friendsData  = newFileMap['friends.json']
            ? JSON.parse(await newFileMap['friends.json'].text())
            : [];

        setAllMemoriesData(memoriesData);
        localStorage.setItem('bereal_session_active', 'true');
        document.getElementById('upload-overlay').style.display = 'none';
        initApp(userData, memoriesData, friendsData);
    } catch (err) {
        console.error(err);
        alert("Dossier invalide. Vérifiez que vous avez sélectionné le bon dossier.");
    }
});

// --- AUTO-LOGIN ---
async function handleAutoLogin() {
    const loader        = document.getElementById('loading-screen');
    const uploadOverlay = document.getElementById('upload-overlay');

    try {
        const savedFiles = await loadSessionFiles();

        if (Object.keys(savedFiles).length > 0 && savedFiles['user.json'] && savedFiles['memories.json']) {
            setFileMap(savedFiles);
            uploadOverlay.style.display = 'none';

            const userData     = JSON.parse(await savedFiles['user.json'].text());
            const memoriesData = JSON.parse(await savedFiles['memories.json'].text());
            const friendsData  = savedFiles['friends.json'] ? JSON.parse(await savedFiles['friends.json'].text()) : [];
            setAllMemoriesData(memoriesData);

            await checkDifferencesAndShowExport();

            const startApp = () => {
                initApp(userData, memoriesData, friendsData);
                loader.style.opacity = '0';
                setTimeout(() => loader.style.display = 'none', 500);
            };

            if (map.loaded()) startApp();
            else map.once('load', startApp);
        } else {
            loader.style.display = 'none';
            uploadOverlay.style.display = 'flex';
        }
    } catch (err) {
        console.error("Crash handleAutoLogin:", err);
        loader.style.display = 'none';
        uploadOverlay.style.display = 'flex';
    }
}

// --- RACCOURCIS CLAVIER ---
document.addEventListener('keydown', (e) => {
    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();

    const modal = document.getElementById('bereal-modal');
    if (modal.style.display === 'flex') {
        if (e.key === 'ArrowRight') nextPhoto();
        if (e.key === 'ArrowLeft')  prevPhoto();
        if (e.key === 'Escape')     closeModal();
        return;
    }

    // Annulation du mode relocation via Échap
    if (e.key === 'Escape' && isRelocating) {
        setIsRelocating(false);
        document.getElementById('map').style.cursor = '';
        showMapToast("Repositionnement annulé.");
        return;
    }

    // Fermeture des panels via Échap
    if (e.key === 'Escape') {
        closeFilters();
    }

    const dash = document.getElementById('dashboard-modal');
    if (dash?.style.display === 'flex') {
        if (e.key === 'ArrowRight') switchDash('right');
        if (e.key === 'ArrowLeft')  switchDash('left');
        if (e.key === 'Escape')     closeDashboard();
    }
});

// --- INIT ---
initBadge();
initDashboard();
initTimeline();
initFilters();
handleAutoLogin();
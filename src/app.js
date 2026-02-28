/**
 * APP.JS — Point d'entrée principal
 */

import { saveFileToSession, loadSessionFiles, checkDifferencesAndShowExport } from './db.js';
import { fileMap, setFileMap, allMemoriesData, setAllMemoriesData, isRelocating, memoryToUpdate, setIsRelocating } from './state.js';
import { map, setup3DBuildings, setupMapLayers, refreshMapMarkers, watchZoomRadius, showRelocationHighlight, clearRelocationHighlight } from './map.js';
import { calculateStats, setCachedStats, initDashboard, closeDashboard, switchDash, navigateDash } from './dashboard.js';
import { initBadge } from './badge.js';
import { syncPWAHeight, setMapRef, getLocalUrl } from './utils.js';
import { convertMemoriesToGeoJSON } from './geo-convert.js';
import { nextPhoto, prevPhoto, closeModal } from './modal.js';
import { initTimeline, applyFiltersToMap } from './timeline.js';
import { initFilters, buildFiltersUI, closeFilters } from './filters.js';
import { showMapToast, showStatsLoader, showRelocationBanner, hideRelocationBanner } from './ui.js';

setMapRef(map);
let _saveDebounceTimer = null;

// --- DÉMARRAGE ANTICIPÉ ---
if (localStorage.getItem('bereal_session_active') === 'true') {
    document.getElementById('loading-screen').style.display = 'flex';
    document.getElementById('upload-overlay').style.display = 'none';
} else {
    document.getElementById('upload-overlay').style.display = 'flex';
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

// --- REPOSITIONNEMENT ---
document.addEventListener('app:relocation-start', (e) => {
    const { uid, rawDate, location } = e.detail;
    setTimeout(() => showRelocationHighlight(uid, rawDate, location), 150);
    showRelocationBanner(() => {
        setIsRelocating(false);
        clearRelocationHighlight();
        document.getElementById('map').style.cursor = '';
        hideRelocationBanner();
        showMapToast('Repositionnement annulé.');
    });
});

map.on('click', async (e) => {
    if (!isRelocating || !memoryToUpdate) return;

    const { lng, lat } = e.lngLat;

    const index = allMemoriesData.findIndex(m =>
        (m.uid != null && m.uid === memoryToUpdate.uid) ||
        m.takenTime === memoryToUpdate.rawDate
    );
    if (index === -1) {
        showMapToast("Souvenir introuvable.", 'error');
        return;
    }

    allMemoriesData[index].location   = { latitude: lat, longitude: lng };
    allMemoriesData[index]._relocated = true;

    clearTimeout(_saveDebounceTimer);
    _saveDebounceTimer = setTimeout(async () => {
        const blob = new Blob([JSON.stringify(allMemoriesData)], { type: 'application/json' });
        await saveFileToSession("memories.json", blob);
    }, 1000);

    refreshMapMarkers(allMemoriesData, convertMemoriesToGeoJSON);
    checkDifferencesAndShowExport();

    const bannerWasVisible = !!document.getElementById('relocation-banner');
    hideRelocationBanner();
    setIsRelocating(false);
    clearRelocationHighlight();
    document.getElementById('map').style.cursor = '';

    showStatsLoader(true, bannerWasVisible);
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

    showMapToast("Position mise à jour.");
});

// --- UPLOAD INITIAL ---
document.getElementById('folder-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    const statusMsg = document.getElementById('status-msg');
    const newFileMap = {};

    for (const file of files) {
        const path = file.webkitRelativePath.split('/').slice(1).join('/');
        newFileMap[path] = file;
    }

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

    if (e.key === 'Escape' && isRelocating) {
        setIsRelocating(false);
        clearRelocationHighlight();
        hideRelocationBanner();
        document.getElementById('map').style.cursor = '';
        showMapToast("Repositionnement annulé.");
        return;
    }

    const dash = document.getElementById('dashboard-modal');
    if (dash?.style.display === 'flex') {
        if (e.key === 'ArrowRight') navigateDash('right');
        if (e.key === 'ArrowLeft')  navigateDash('left');
        if (e.key === 'Escape')     closeDashboard();
    }
});

// --- INIT ---
initBadge();
initDashboard();
initTimeline();
initFilters();
handleAutoLogin();
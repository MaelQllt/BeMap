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

// Passe la référence de la carte à utils pour que syncPWAHeight puisse appeler map.resize()
setMapRef(map);

// --- DÉMARRAGE ANTICIPÉ ---
// Affiche le loader immédiatement si une session est déjà active (avant tout rendu)
if (localStorage.getItem('bereal_session_active') === 'true') {
    document.getElementById('loading-screen').style.display = 'flex';
    document.getElementById('upload-overlay').style.display = 'none';
} else {
    document.getElementById('upload-overlay').style.display = 'flex';
}

// --- CONVERSION MEMORIES → GEOJSON ---
// Transforme les données brutes de l'archive en Features MapLibre
export function convertMemoriesToGeoJSON(data) {
    const momentCounts = {};
    return data.map(m => {
        // Détecte les BeReal Bonus (deuxième photo du même moment)
        const momentId = m.berealMoment || (m.takenTime ? m.takenTime.split('T')[0] : m.date);
        const isBonus = !!momentCounts[momentId];
        momentCounts[momentId] = true;

        const lng = parseFloat(m.location?.longitude);
        const lat = parseFloat(m.location?.latitude);

        return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [isNaN(lng) ? 0 : lng, isNaN(lat) ? 0 : lat] },
            properties: {
                front:   getLocalUrl(m.frontImage?.path),
                back:    getLocalUrl(m.backImage?.path),
                caption: m.caption || "",
                location: m.location,
                rawDate: m.takenTime,
                date: m.takenTime ? new Date(m.takenTime).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : "",
                time: m.takenTime ? new Date(m.takenTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : "",
                isLate:  m.isLate,
                isBonus: isBonus
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
                watchZoomRadius(allMemoriesData, (data) => refreshMapMarkers(data, convertMemoriesToGeoJSON));
            }
        };
        if (map.loaded()) injectFeatures();
        else map.once('load', injectFeatures);
    }

    calculateStats(memoriesData, userData, friendsData);
    setup3DBuildings();
    syncPWAHeight();
}

// --- REPOSITIONNEMENT D'UN BEREAL ---
// Activé par le bouton "Replacer" dans la modale
map.on('click', async (e) => {
    if (!isRelocating || !memoryToUpdate) return;

    const { lng, lat } = e.lngLat;
    const index = allMemoriesData.findIndex(m => m.takenTime === memoryToUpdate.rawDate);
    if (index === -1) return;

    // Mise à jour en mémoire et en session
    allMemoriesData[index].location = { latitude: lat, longitude: lng };
    const blob = new Blob([JSON.stringify(allMemoriesData)], { type: 'application/json' });
    await saveFileToSession("memories.json", blob);

    // Refresh carte + bouton export
    refreshMapMarkers(allMemoriesData, convertMemoriesToGeoJSON);
    checkDifferencesAndShowExport();

    // Recalcul des stats géographiques (on invalide le cache d'abord)
    try {
        const userData = JSON.parse(await fileMap['user.json'].text());
        const friendsData = fileMap['friends.json'] ? JSON.parse(await fileMap['friends.json'].text()) : [];
        setCachedStats(null);
        await calculateStats(allMemoriesData, userData, friendsData);
    } catch (err) {
        console.error("Erreur recalcul stats:", err);
    }

    setIsRelocating(false);
    document.getElementById('map').style.cursor = '';
    alert("Position mise à jour !");
});

// --- UPLOAD INITIAL ---
document.getElementById('folder-input').addEventListener('change', async (e) => {
    const files = e.target.files;
    const statusMsg = document.getElementById('status-msg');
    const newFileMap = {};
    let count = 0;

    for (const file of files) {
        const path = file.webkitRelativePath.split('/').slice(1).join('/');
        newFileMap[path] = file;
        await saveFileToSession(path, file);
        count++;
        if (count % 25 === 0) {
            statusMsg.innerText = `Création de la session... (${Math.round((count / files.length) * 100)}%)`;
        }
    }
    setFileMap(newFileMap);

    try {
        const memoriesFile = newFileMap['memories.json'];
        // Sauvegarde une copie originale pour détecter les modifications (bouton export)
        await saveFileToSession("memories_original.json", memoriesFile);

        const userData    = JSON.parse(await newFileMap['user.json'].text());
        const memoriesData = JSON.parse(await memoriesFile.text());
        const friendsData  = JSON.parse(await newFileMap['friends.json'].text());

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
// Restaure la session depuis IndexedDB si elle existe
async function handleAutoLogin() {
    const loader       = document.getElementById('loading-screen');
    const uploadOverlay = document.getElementById('upload-overlay');

    try {
        const savedFiles = await loadSessionFiles();

        if (Object.keys(savedFiles).length > 0 && savedFiles['user.json'] && savedFiles['memories.json']) {
            setFileMap(savedFiles);
            uploadOverlay.style.display = 'none';

            const userData    = JSON.parse(await savedFiles['user.json'].text());
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
    // Bloque le scroll natif du browser sur les touches directionnelles
    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();

    const modal = document.getElementById('bereal-modal');
    if (modal.style.display === 'flex') {
        if (e.key === 'ArrowRight') nextPhoto();
        if (e.key === 'ArrowLeft')  prevPhoto();
        if (e.key === 'Escape')     closeModal();
        return; // On n'écoute pas le dashboard si la modale photo est ouverte
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
handleAutoLogin();

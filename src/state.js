/**
 * STATE.JS — État global partagé entre les modules
 *
 * Toutes les variables mutables sont centralisées ici.
 * Les modules lisent les valeurs et écrivent via les setters,
 * ce qui évite les mutations directes depuis l'extérieur.
 */

// --- MODALE PHOTO ---
export let currentPhotos = [];       // Photos affichées dans la modale courante
export let currentIndex = 0;         // Index de la photo active
export let isFlipped = false;        // Caméra avant/arrière inversée
export let currentMiniSide = 'left'; // Côté de snap de la miniature (gauche/droite)

// --- DRAG MINIATURE ---
export let isDragging = false;
export let hasDragged = false;
export let justFinishedDrag = false; // Bloque closeModal juste après un drag

// --- ZOOM & PAN ---
export let isZooming = false;
export let zoomScale = 1;
export let translateX = 0;
export let translateY = 0;
export let lastMouseX = 0;
export let lastMouseY = 0;

// --- CARTE & CLUSTERS ---
export let clusterMarkers = {};      // Markers HTML actifs sur la carte
export let isRelocating = false;     // Mode repositionnement actif
export let memoryToUpdate = null;    // Memory en cours de repositionnement

// --- DONNÉES ---
export let allMemoriesData = [];     // Source de vérité des memories
export let fileMap = {};             // Index des fichiers de l'archive { path: File }
export let objectUrlCache = new Map(); // Cache des Object URLs (évite les doublons)

// --- STATS & GEO ---
export let cachedStats = null;       // Résultat mis en cache de calculateStats
export let worldGeoCache = null;     // GeoJSON pays (fetché une seule fois)
export let depsGeoCache = null;      // GeoJSON départements FR (fetché une seule fois)

// --- UI ---
export let isUiLocked = false;       // Vrai quand une modale est ouverte

// --- SETTERS ---
export function setCurrentPhotos(val) { currentPhotos = val; }
export function setCurrentIndex(val) { currentIndex = val; }
export function setIsFlipped(val) { isFlipped = val; }
export function setCurrentMiniSide(val) { currentMiniSide = val; }
export function setIsDragging(val) { isDragging = val; }
export function setHasDragged(val) { hasDragged = val; }
export function setJustFinishedDrag(val) { justFinishedDrag = val; }
export function setIsZooming(val) { isZooming = val; }
export function setZoomScale(val) { zoomScale = val; }
export function setTranslateX(val) { translateX = val; }
export function setTranslateY(val) { translateY = val; }
export function setLastMouseX(val) { lastMouseX = val; }
export function setLastMouseY(val) { lastMouseY = val; }
export function setClusterMarkers(val) { clusterMarkers = val; }
export function setIsRelocating(val) { isRelocating = val; }
export function setMemoryToUpdate(val) { memoryToUpdate = val; }
export function setAllMemoriesData(val) { allMemoriesData = val; }
export function setFileMap(val) { fileMap = val; }
export function setCachedStats(val) { cachedStats = val; }
export function setWorldGeoCache(val) { worldGeoCache = val; }
export function setDepsGeoCache(val) { depsGeoCache = val; }
export function setIsUiLocked(val) { isUiLocked = val; }

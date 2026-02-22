/**
 * STATE.JS — État global partagé entre les modules
 */

// Variables d'état des photos
export let currentPhotos = [];
export let currentIndex = 0;
export let isFlipped = false;
export let currentMiniSide = 'left';
export let isDragging = false;
export let hasDragged = false;
export let justFinishedDrag = false;

// Zoom & Pan
export let isZooming = false;
export let zoomScale = 1;
export let translateX = 0;
export let translateY = 0;
export let lastMouseX = 0;
export let lastMouseY = 0;

// Cache & Markers
export let cachedStats = null;
export let clusterMarkers = {};

// Reposition
export let isRelocating = false;
export let memoryToUpdate = null;
export let allMemoriesData = [];

// GeoJSON cache
export let worldGeoCache = null;
export let depsGeoCache = null;

// UI Lock
export let isUiLocked = false;

// URL cache
export let objectUrlCache = new Map();

// fileMap global
export let fileMap = {};

// --- Setters pour les valeurs primitives (non mutables directement depuis l'extérieur) ---

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
export function setCachedStats(val) { cachedStats = val; }
export function setClusterMarkers(val) { clusterMarkers = val; }
export function setIsRelocating(val) { isRelocating = val; }
export function setMemoryToUpdate(val) { memoryToUpdate = val; }
export function setAllMemoriesData(val) { allMemoriesData = val; }
export function setWorldGeoCache(val) { worldGeoCache = val; }
export function setDepsGeoCache(val) { depsGeoCache = val; }
export function setIsUiLocked(val) { isUiLocked = val; }
export function setFileMap(val) { fileMap = val; }

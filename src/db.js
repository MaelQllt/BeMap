/**
 * DB.JS — Gestion de la session via IndexedDB
 */

const DB_NAME = "BeRealMapDB";
const STORE_NAME = "files";

export function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
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

export async function saveFileToSession(path, file) {
    const db = await openDB();
    const buffer = await file.arrayBuffer();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put({ buffer, type: file.type, name: file.name }, path);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject();
    });
}

export async function loadSessionFiles() {
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

export async function clearSession() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject();
    });
}

export async function checkDifferencesAndShowExport() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const reqCurrent = store.get("memories.json");
    const reqOriginal = store.get("memories_original.json");

    reqCurrent.onsuccess = () => {
        reqOriginal.onsuccess = () => {
            const exportBtn = document.getElementById('export-json-btn');
            if (!exportBtn) return;
            if (!reqOriginal.result || !reqCurrent.result) {
                exportBtn.style.display = 'none';
                return;
            }
            const currentData = new Uint8Array(reqCurrent.result.buffer);
            const originalData = new Uint8Array(reqOriginal.result.buffer);
            if (currentData.length !== originalData.length || currentData.some((val, i) => val !== originalData[i])) {
                exportBtn.style.setProperty('display', 'inline-flex', 'important');
            } else {
                exportBtn.style.display = 'none';
            }
        };
    };
}

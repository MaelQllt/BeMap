/**
 * DB.JS — Gestion de la session via IndexedDB
 */

const DB_NAME = "BeRealMapDB";
const STORE_NAME = "files";

export function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 2);
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
                const key  = cursor.key;
                try {
                    if (data && data.buffer && data.buffer.byteLength > 0) {
                        // Copie défensive du buffer pour éviter les buffers detached
                        const safeBuf = data.buffer.slice(0);
                        results[key] = new File([safeBuf], data.name || key, { type: data.type || '' });
                    }
                } catch (copyErr) {
                    console.warn('Impossible de lire le fichier en cache:', key, copyErr);
                }
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        request.onerror = (e) => reject('Erreur Cursor: ' + (e.target.error?.message || e.target.error));
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

    // Deux requêtes indépendantes dans leur propre transaction pour éviter
    // la race condition liée à l'imbrication de callbacks sur une transaction partagée.
    const getRecord = (key) => new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });

    const [current, original] = await Promise.all([
        getRecord("memories.json"),
        getRecord("memories_original.json"),
    ]);

    const exportBtn = document.getElementById('export-json-btn');
    if (!exportBtn) return;

    if (!current || !original) {
        exportBtn.style.display = 'none';
        const logoutBtns = document.querySelectorAll('.logout-card-minimal');
        const logoutLabel = logoutBtns[logoutBtns.length - 1]?.querySelector('.logout-label-minimal');
        if (logoutLabel) logoutLabel.textContent = 'Déconnexion / Changer d\'archive';
        return;
    }

    const cur = new Uint8Array(current.buffer);
    const ori = new Uint8Array(original.buffer);
    const isDifferent = cur.length !== ori.length || cur.some((val, i) => val !== ori[i]);
    exportBtn.style.setProperty('display', isDifferent ? 'inline-flex' : 'none', isDifferent ? 'important' : '');

    // Adapte le label du bouton déconnexion selon la présence de l'export
    const logoutBtns = document.querySelectorAll('.logout-card-minimal');
    const logoutLabel = logoutBtns[logoutBtns.length - 1]?.querySelector('.logout-label-minimal');
    if (logoutLabel) {
        logoutLabel.textContent = isDifferent ? 'Déconnexion' : 'Déconnexion / Changer d\'archive';
    }
}
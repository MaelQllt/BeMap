/**
 * GEO-CONVERT.JS — Conversion memories → GeoJSON
 * Fichier dédié pour éviter la dépendance circulaire app.js ↔ timeline.js
 */

import { getLocalUrl } from './utils.js';

export function convertMemoriesToGeoJSON(data) {
    const seenIds = new Set();
    return data.map(m => {
        const momentId = m.berealMoment || m.takenTime || m.date;
        const isBonus = seenIds.has(momentId);
        seenIds.add(momentId);

        const lng = parseFloat(m.location?.longitude);
        const lat = parseFloat(m.location?.latitude);

        const canBeRelocated = m._relocated === true
            || ((isNaN(lng) || lng === 0) && (isNaN(lat) || lat === 0));

        return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [isNaN(lng) ? 0 : lng, isNaN(lat) ? 0 : lat] },
            properties: {
                front:    getLocalUrl(m.frontImage?.path),
                back:     getLocalUrl(m.backImage?.path),
                caption:  m.caption || "",
                location: m.location,
                rawDate:  m.takenTime,
                uid:      m.uid ?? m.takenTime,
                canBeRelocated,
                date:     m.takenTime ? new Date(m.takenTime).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : "",
                time:     m.takenTime ? new Date(m.takenTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : "",
                isLate:   m.isLate,
                isBonus:  isBonus,
            }
        };
    });
}

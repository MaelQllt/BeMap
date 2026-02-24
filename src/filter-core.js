/**
 * FILTER-CORE.JS — État partagé des filtres + logique pure de filtrage
 * Importé par filters.js ET timeline.js sans créer de dépendance circulaire.
 */

// --- ÉTAT ---
export let activeFilters = {
    years:  [],    // [] = tous, sinon ["2022", "2023"]
    months: [],   // [] = tous, sinon [0, 1, ...] (0 = janvier)
    onTime: 'all' // 'all' | 'ontime' | 'late' | 'bonus'
};

export function setActiveFilters(val) { activeFilters = val; }
export function getActiveFilters()    { return activeFilters; }

export function hasActiveFilters() {
    return activeFilters.years.length > 0
        || activeFilters.months.length > 0
        || activeFilters.onTime !== 'all';
}

// --- CALCUL BONUS ---
// Même logique que convertMemoriesToGeoJSON dans app.js :
// un "bonus" est tout post dont le berealMoment (ou takenTime) a déjà été vu.
// On enrichit TOUJOURS les données (pas seulement pour le filtre bonus)
// pour que ontime/late puissent aussi exclure les bonus.
function enrichWithBonus(data) {
    const seenIds = new Set();
    return data.map(m => {
        const momentId = m.berealMoment || m.takenTime || m.date;
        const isBonus  = seenIds.has(momentId);
        seenIds.add(momentId);
        return { ...m, _isBonus: isBonus };
    });
}

// Cache pour éviter de recalculer à chaque appel si les données n'ont pas changé
let _cachedData    = null;
let _cachedEnriched = null;

export function applyFiltersToData(data, filters) {
    // Recalcule uniquement si les données ont changé
    if (data !== _cachedData) {
        _cachedData     = data;
        _cachedEnriched = enrichWithBonus(data);
    }

    // Si pas de filtre ponctualité, on peut travailler sur les données brutes
    const source = filters.onTime !== 'all' ? _cachedEnriched : data;

    return source.filter(m => {
        if (!m.takenTime) return true;

        const d     = new Date(m.takenTime);
        const year  = d.getFullYear().toString();
        const month = d.getMonth();

        if (filters.years.length  && !filters.years.includes(year))   return false;
        if (filters.months.length && !filters.months.includes(month)) return false;

        // ontime  = à l'heure ET pas un bonus
        if (filters.onTime === 'ontime' && (m.isLate !== false || m._isBonus === true))  return false;
        // late    = en retard ET pas un bonus
        if (filters.onTime === 'late'   && (m.isLate !== true  || m._isBonus === true))  return false;
        // bonus   = uniquement les bonus (peu importe isLate)
        if (filters.onTime === 'bonus'  && m._isBonus !== true)                           return false;

        return true;
    });
}
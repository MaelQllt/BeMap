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

// Cache des valeurs year/month pré-calculées pour éviter new Date() à chaque filtre
let _cachedParsed = null;

export function applyFiltersToData(data, filters) {
    // Recalcule uniquement si les données ont changé
    if (data !== _cachedData) {
        _cachedData     = data;
        _cachedEnriched = enrichWithBonus(data);
        // Pré-calcule year + month pour chaque entry
        _cachedParsed   = data.map(m => {
            if (!m.takenTime) return { year: null, month: null };
            const d = new Date(m.takenTime);
            return { year: d.getFullYear().toString(), month: d.getMonth() };
        });
    }

    const source  = filters.onTime !== 'all' ? _cachedEnriched : data;
    const needsYear  = filters.years.length > 0;
    const needsMonth = filters.months.length > 0;
    const needsTime  = filters.onTime !== 'all';

    return source.filter((m, i) => {
        if (!m.takenTime) return true;

        const parsed = _cachedParsed[i];

        if (needsYear  && !filters.years.includes(parsed.year))    return false;
        if (needsMonth && !filters.months.includes(parsed.month))  return false;

        if (needsTime) {
            if (filters.onTime === 'ontime' && (m.isLate !== false || m._isBonus === true)) return false;
            if (filters.onTime === 'late'   && (m.isLate !== true  || m._isBonus === true)) return false;
            if (filters.onTime === 'bonus'  && m._isBonus !== true)                          return false;
        }

        return true;
    });
}
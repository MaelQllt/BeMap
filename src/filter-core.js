/**
 * FILTER-CORE.JS — État partagé des filtres + logique pure de filtrage
 * Importé par filters.js ET timeline.js sans créer de dépendance circulaire.
 */

// --- ÉTAT ---
export let activeFilters = {
    years:  [],    // [] = tous, sinon ["2022", "2023"]
    months: [],   // [] = tous, sinon [0, 1, ...] (0 = janvier)
    onTime: 'all' // 'all' | 'ontime' | 'late'
};

export function setActiveFilters(val) { activeFilters = val; }
export function getActiveFilters()    { return activeFilters; }

export function hasActiveFilters() {
    return activeFilters.years.length > 0
        || activeFilters.months.length > 0
        || activeFilters.onTime !== 'all';
}

// --- LOGIQUE PURE ---
export function applyFiltersToData(data, filters) {
    return data.filter(m => {
        if (!m.takenTime) return true;

        const d     = new Date(m.takenTime);
        const year  = d.getFullYear().toString();
        const month = d.getMonth(); // 0-indexed

        if (filters.years.length  && !filters.years.includes(year))   return false;
        if (filters.months.length && !filters.months.includes(month)) return false;
        if (filters.onTime === 'ontime' && m.isLate !== false)         return false;
        if (filters.onTime === 'late'   && m.isLate !== true)          return false;

        return true;
    });
}
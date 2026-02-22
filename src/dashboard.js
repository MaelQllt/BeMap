/**
 * DASHBOARD.JS — Statistiques & Dashboard
 */

import { cachedStats, setCachedStats, worldGeoCache, depsGeoCache, setWorldGeoCache, setDepsGeoCache, allMemoriesData, objectUrlCache } from './state.js';
import { clearSession } from './db.js';
import { setMapFocus } from './map.js';

// Re-exporté pour que app.js puisse invalider le cache après une relocation
export { setCachedStats } from './state.js';

// Verrou anti-spam pendant l'animation du slider
let isAnimatingDash = false;

// Fait glisser le slider vers la page suivante ou précédente
export function switchDash(direction = 'right') {
    if (isAnimatingDash) return;
    isAnimatingDash = true;

    const slider = document.getElementById('dash-slider');
    const DURATION = 400;

    slider.style.transition = `transform ${DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;

    if (direction === 'right') {
        slider.style.transform = 'translateX(-50%)';
        setTimeout(() => {
            slider.style.transition = 'none';
            slider.appendChild(slider.firstElementChild); // Boucle la page vue à la fin
            slider.style.transform = 'translateX(0%)';
        }, DURATION);
    } else {
        // Pour aller à gauche : on prépend la dernière page et on anime depuis -50%
        slider.style.transition = 'none';
        slider.prepend(slider.lastElementChild);
        slider.style.transform = 'translateX(-50%)';
        slider.offsetHeight; // Force un reflow pour que la transition parte bien de -50%
        slider.style.transition = `transform ${DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        slider.style.transform = 'translateX(0%)';
    }

    setTimeout(() => { isAnimatingDash = false; }, DURATION);
}

// Calcule toutes les statistiques depuis les données brutes
// Le cache est invalidé par setCachedStats(null) avant d'appeler cette fonction
export async function calculateStats(data, userData, friendsData) {
    if (cachedStats && cachedStats.total === data.length) {
        updateDashboardUI();
        return;
    }
    try {
        // 1. STREAK — jours consécutifs max
        const uniqueDays = [...new Set(data.filter(m => m.takenTime).map(m => m.takenTime.split('T')[0]))].sort();
        let maxStreak = 0, streak = 0;
        for (let i = 0; i < uniqueDays.length; i++) {
            if (i === 0) { streak = 1; continue; }
            const diff = Math.round((new Date(uniqueDays[i]) - new Date(uniqueDays[i - 1])) / 86400000);
            if (diff === 1) streak++;
            else { maxStreak = Math.max(maxStreak, streak); streak = 1; }
        }
        maxStreak = Math.max(maxStreak, streak);

        // 2. PONCTUALITÉ — % de moments postés à l'heure
        const momentIds = [...new Set(data.map(m => m.berealMoment || m.takenTime?.split('T')[0]))];
        const onTimeCount = momentIds.filter(id =>
            data.some(m => (m.berealMoment === id || m.takenTime?.split('T')[0] === id) && m.isLate === false)
        ).length;
        const percent = momentIds.length > 0 ? Math.round((onTimeCount / momentIds.length) * 100) : 0;

        // 3. GÉOGRAPHIE — pays et départements visités
        const validMemories = data.filter(m => m.location?.latitude && m.location?.longitude);
        const geoPoints = validMemories.map(m => [m.location.longitude, m.location.latitude]);

        if (!worldGeoCache || !depsGeoCache) {
            const [respWorld, respDeps] = await Promise.all([
                fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'),
                fetch('https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson')
            ]);
            setWorldGeoCache(await respWorld.json());
            setDepsGeoCache(await respDeps.json());
        }

        const foundCountries = new Set();
        const foundDeps = new Set();
        geoPoints.forEach(coords => {
            const pt = turf.point(coords);
            for (const c of worldGeoCache.features) {
                if (turf.booleanPointInPolygon(pt, c)) { foundCountries.add(c.properties.ADMIN || c.properties.name); break; }
            }
            // Box approximative France métropolitaine pour limiter les calculs
            if (coords[0] > -5 && coords[0] < 10 && coords[1] > 41 && coords[1] < 52) {
                for (const d of depsGeoCache.features) {
                    if (turf.booleanPointInPolygon(pt, d)) { foundDeps.add(d.properties.nom); break; }
                }
            }
        });

        // 4. ANCIENNETÉ
        const joinDate = userData.createdAt ? new Date(userData.createdAt) : new Date();
        const daysOld = Math.floor((new Date() - joinDate) / 86400000);
        const joinDateStr = joinDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

        // 5. MOIS RECORD & HEURE MOYENNE
        const monthCounts = {};
        let totalMinutes = 0, validTimeCount = 0;
        data.forEach(m => {
            if (!m.takenTime) return;
            const d = new Date(m.takenTime);
            const key = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
            monthCounts[key] = (monthCounts[key] || 0) + 1;
            totalMinutes += d.getHours() * 60 + d.getMinutes();
            validTimeCount++;
        });

        let bestMonthName = "-", maxPhotos = 0;
        for (const [month, count] of Object.entries(monthCounts)) {
            if (count > maxPhotos) { maxPhotos = count; bestMonthName = month.charAt(0).toUpperCase() + month.slice(1); }
        }

        let avgTimeStr = "--:--";
        if (validTimeCount > 0) {
            const avg = totalMinutes / validTimeCount;
            avgTimeStr = `${Math.floor(avg / 60)}H${Math.round(avg % 60).toString().padStart(2, '0')}`;
        }

        // 6. MISE EN CACHE
        setCachedStats({
            total: data.length,
            percent,
            countries: foundCountries.size || (validMemories.length > 0 ? 1 : 0),
            deps: foundDeps.size,
            maxStreak,
            friends: friendsData?.length ?? 0,
            daysOld,
            joinDate: joinDateStr,
            bestMonthName,
            bestMonthLabel: `MOIS RECORD (${maxPhotos} BEREALS)`,
            avgTime: avgTimeStr
        });

        updateDashboardUI();
    } catch (e) {
        console.error("Erreur calcul stats:", e);
    }
}

// Injecte les valeurs calculées dans le DOM du dashboard
export function updateDashboardUI() {
    if (!cachedStats) return;
    const mapping = {
        'stat-streak':          cachedStats.total,
        'stat-ontime':          `${cachedStats.percent}%`,
        'stat-countries':       cachedStats.countries,
        'stat-deps':            cachedStats.deps,
        'stat-max-streak':      cachedStats.maxStreak,
        'stat-friends':         cachedStats.friends,
        'stat-age':             cachedStats.daysOld,
        'stat-join-date':       cachedStats.joinDate,
        'stat-best-month-name': cachedStats.bestMonthName,
        'stat-best-month-label':cachedStats.bestMonthLabel,
        'stat-avg-time':        cachedStats.avgTime.toUpperCase()
    };
    for (const [id, value] of Object.entries(mapping)) {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    }
}

export function openDashboard() {
    document.getElementById('dashboard-modal').style.display = 'flex';
    document.querySelector('.dashboard-positioner').style.display = 'flex';
    setMapFocus(true);
    if (cachedStats) updateDashboardUI();
}

export function closeDashboard() {
    document.getElementById('dashboard-modal').style.display = 'none';
    document.querySelector('.dashboard-positioner').style.display = 'none';
    setMapFocus(false);
}

// Attache tous les listeners du dashboard (appelé une seule fois au démarrage)
export function initDashboard() {
    document.querySelector('.prev-dash')?.addEventListener('click', () => switchDash('left'));
    document.querySelector('.next-dash')?.addEventListener('click', () => switchDash('right'));
    document.querySelector('.close-dash')?.addEventListener('click', closeDashboard);

    // Ferme en cliquant sur le fond (overlay), pas sur la carte elle-même
    document.getElementById('dashboard-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('dashboard-modal')) closeDashboard();
    });

    // Il y a deux .logout-card-minimal dans le HTML (export + déconnexion) — on prend le dernier
    const logoutBtns = document.querySelectorAll('.logout-card-minimal');
    logoutBtns[logoutBtns.length - 1]?.addEventListener('click', handleLogout);

    document.getElementById('export-json-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!allMemoriesData?.length) return;
        const blob = new Blob([JSON.stringify(allMemoriesData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement('a'), { href: url, download: 'memories.json' });
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });
}

async function handleLogout(event) {
    event?.stopPropagation();
    if (!confirm("Voulez-vous vraiment vous déconnecter et supprimer les données locales ?")) return;
    try {
        await clearSession();
    } catch (e) {
        console.error("Erreur clearSession:", e);
    }
    localStorage.removeItem('bereal_session_active');
    objectUrlCache.forEach(url => URL.revokeObjectURL(url));
    objectUrlCache.clear();
    window.location.reload();
}
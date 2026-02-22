/**
 * DASHBOARD.JS — Statistiques & Dashboard
 */

import { cachedStats, setCachedStats, worldGeoCache, depsGeoCache, setWorldGeoCache, setDepsGeoCache, isUiLocked, allMemoriesData, objectUrlCache } from './state.js';
import { clearSession } from './db.js';
import { setMapFocus } from './map.js';

export { setCachedStats } from './state.js';

export function switchDash(direction = 'right') {
    if (isAnimatingDash) return;
    isAnimatingDash = true;

    const slider = document.getElementById('dash-slider');
    const animDuration = 400;
    const unlockDelay = 300;

    slider.style.transition = `transform ${animDuration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;

    if (direction === 'right') {
        slider.style.transform = 'translateX(-50%)';
        setTimeout(() => {
            slider.style.transition = 'none';
            slider.appendChild(slider.firstElementChild);
            slider.style.transform = 'translateX(0%)';
        }, animDuration);
    } else {
        slider.style.transition = 'none';
        slider.prepend(slider.lastElementChild);
        slider.style.transform = 'translateX(-50%)';
        slider.offsetHeight;
        slider.style.transition = `transform ${animDuration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        slider.style.transform = 'translateX(0%)';
    }

    setTimeout(() => { isAnimatingDash = false; }, unlockDelay);
}

export async function calculateStats(data, userData, friendsData) {
    if (cachedStats && cachedStats.total === data.length) {
        updateDashboardUI();
        return;
    }
    try {
        // 1. STREAK
        const days = data.filter(m => m.date).map(m => m.date.split('T')[0]).sort();
        const uniqueDays = [...new Set(days)];
        let maxStreak = 0, currentStreak = 0;
        for (let i = 0; i < uniqueDays.length; i++) {
            if (i === 0) currentStreak = 1;
            else {
                const diffDays = Math.round((new Date(uniqueDays[i]) - new Date(uniqueDays[i - 1])) / 86400000);
                if (diffDays === 1) currentStreak++;
                else { maxStreak = Math.max(maxStreak, currentStreak); currentStreak = 1; }
            }
            maxStreak = Math.max(maxStreak, currentStreak);
        }

        // 2. PONCTUALITÉ
        const momentIds = [...new Set(data.map(m => m.berealMoment || m.takenTime?.split('T')[0]))];
        let onTimeCount = 0;
        momentIds.forEach(id => {
            if (data.some(m => (m.berealMoment === id || m.takenTime?.split('T')[0] === id) && m.isLate === false)) {
                onTimeCount++;
            }
        });
        const percent = momentIds.length > 0 ? Math.round((onTimeCount / momentIds.length) * 100) : 0;

        // 3. GÉOGRAPHIE
        const validMemories = data.filter(m => m.location?.latitude && m.location?.longitude);
        const uniqueGeoPoints = validMemories.map(m => [m.location.longitude, m.location.latitude]);

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

        uniqueGeoPoints.forEach(coords => {
            const pt = turf.point(coords);
            for (let c of worldGeoCache.features) {
                if (turf.booleanPointInPolygon(pt, c)) {
                    foundCountries.add(c.properties.ADMIN || c.properties.name);
                    break;
                }
            }
            if (coords[0] > -5 && coords[0] < 10 && coords[1] > 41 && coords[1] < 52) {
                for (let d of depsGeoCache.features) {
                    if (turf.booleanPointInPolygon(pt, d)) {
                        foundDeps.add(d.properties.nom);
                        break;
                    }
                }
            }
        });

        // 4. SOCIAL & ANCIENNETÉ
        const joinDate = userData.createdAt ? new Date(userData.createdAt) : new Date();
        const today = new Date();
        const diffDays = Math.floor((today - joinDate) / (1000 * 60 * 60 * 24));
        const formattedJoinDate = joinDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

        // 5. MOIS RECORD & HEURE MOYENNE
        const monthCounts = {};
        let totalMinutes = 0;
        let validTimeCount = 0;

        data.forEach(m => {
            if (m.takenTime) {
                const d = new Date(m.takenTime);
                let monthKey = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                monthKey = monthKey.charAt(0).toUpperCase() + monthKey.slice(1);
                monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
                totalMinutes += (d.getHours() * 60) + d.getMinutes();
                validTimeCount++;
            }
        });

        let bestMonthName = "-";
        let maxPhotos = 0;
        for (const [month, count] of Object.entries(monthCounts)) {
            if (count > maxPhotos) { maxPhotos = count; bestMonthName = month; }
        }

        let avgTimeStr = "--:--";
        if (validTimeCount > 0) {
            const avgMinutesTotal = totalMinutes / validTimeCount;
            const hh = Math.floor(avgMinutesTotal / 60);
            const mm = Math.round(avgMinutesTotal % 60);
            avgTimeStr = `${hh}H${mm.toString().padStart(2, '0')}`;
        }

        // 6. CACHE
        setCachedStats({
            total: data.length,
            percent,
            countries: foundCountries.size || (validMemories.length > 0 ? 1 : 0),
            deps: foundDeps.size,
            maxStreak,
            friends: friendsData ? friendsData.length : 0,
            daysOld: diffDays,
            joinDate: formattedJoinDate,
            bestMonthName,
            bestMonthLabel: `MOIS RECORD (${maxPhotos} BEREALS)`,
            avgTime: avgTimeStr
        });

        updateDashboardUI();
    } catch (e) {
        console.error("Erreur calcul stats détaillé:", e);
    }
}

export function updateDashboardUI() {
    if (!cachedStats) return;
    const mapping = {
        'stat-streak': cachedStats.total,
        'stat-ontime': `${cachedStats.percent}%`,
        'stat-countries': cachedStats.countries,
        'stat-deps': cachedStats.deps,
        'stat-max-streak': cachedStats.maxStreak,
        'stat-friends': cachedStats.friends,
        'stat-age': cachedStats.daysOld,
        'stat-join-date': cachedStats.joinDate,
        'stat-best-month-name': cachedStats.bestMonthName,
        'stat-best-month-label': cachedStats.bestMonthLabel,
        'stat-avg-time': cachedStats.avgTime.toUpperCase()
    };
    for (let id in mapping) {
        const el = document.getElementById(id);
        if (el) el.innerText = mapping[id];
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

export function initDashboard() {
    document.querySelector('.prev-dash')?.addEventListener('click', () => switchDash('left'));
    document.querySelector('.next-dash')?.addEventListener('click', () => switchDash('right'));
    document.querySelector('.close-dash')?.addEventListener('click', closeDashboard);

    // Logout — il y a deux .logout-card-minimal (export + logout), on prend le dernier
    const logoutBtns = document.querySelectorAll('.logout-card-minimal');
    const logoutBtn = logoutBtns[logoutBtns.length - 1];
    logoutBtn?.addEventListener('click', handleLogout);

    // Export JSON
    document.getElementById('export-json-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!allMemoriesData || allMemoriesData.length === 0) return;
        const blob = new Blob([JSON.stringify(allMemoriesData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = "memories.json";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });
}

async function handleLogout(event) {
    if (event) event.stopPropagation();
    if (confirm("Voulez-vous vraiment vous déconnecter et supprimer les données locales ?")) {
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
}
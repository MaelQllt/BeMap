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
        // Avec 3 pages en 300% de large, chaque page occupe 33.333%
        slider.style.transform = 'translateX(-33.333%)';
        setTimeout(() => {
            slider.style.transition = 'none';
            slider.appendChild(slider.firstElementChild);
            slider.style.transform = 'translateX(0%)';
        }, DURATION);
    } else {
        slider.style.transition = 'none';
        slider.prepend(slider.lastElementChild);
        slider.style.transform = 'translateX(-33.333%)';
        slider.offsetHeight;
        slider.style.transition = `transform ${DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        slider.style.transform = 'translateX(0%)';
    }

    setTimeout(() => { isAnimatingDash = false; }, DURATION);
}

// Calcule toutes les statistiques depuis les données brutes
// Le cache est invalidé par setCachedStats(null) avant d'appeler cette fonction
export async function calculateStats(data, userData, friendsData) {
    // 1. Sortie anticipée si les données n'ont pas changé
    if (cachedStats && cachedStats.total === data.length) {
        updateDashboardUI();
        return;
    }

    try {
        // --- 1. CALCUL DE LA STREAK (Logique spécifique validée) ---
        const days = data.filter(m => m.date).map(m => m.date.split('T')[0]).sort();
        const uniqueDays = [...new Set(days)];
        let maxStreak = 0, currentStreak = 0;

        for (let i = 0; i < uniqueDays.length; i++) {
            if (i === 0) {
                currentStreak = 1;
            } else {
                const diffDays = Math.round((new Date(uniqueDays[i]) - new Date(uniqueDays[i - 1])) / 86400000);
                if (diffDays === 1) {
                    currentStreak++;
                } else {
                    maxStreak = Math.max(maxStreak, currentStreak);
                    currentStreak = 1;
                }
            }
            maxStreak = Math.max(maxStreak, currentStreak);
        }

        // --- 2. PONCTUALITÉ (% à l'heure par moment unique) ---
        const momentIds = [...new Set(data.map(m => m.berealMoment || m.takenTime?.split('T')[0]))];
        const onTimeCount = momentIds.filter(id =>
            data.some(m => (m.berealMoment === id || m.takenTime?.split('T')[0] === id) && m.isLate === false)
        ).length;
        const percent = momentIds.length > 0 ? Math.round((onTimeCount / momentIds.length) * 100) : 0;

        // --- 3. GÉOGRAPHIE (Optimisation du chargement GeoJSON) ---
        const validMemories = data.filter(m => m.location?.latitude && m.location?.longitude);
        const geoPoints = validMemories.map(m => [m.location.longitude, m.location.latitude]);

        if (!worldGeoCache || !depsGeoCache) {
            const [respWorld, respDeps] = await Promise.all([
                fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'),
                fetch('https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson')
            ]);
            // On utilise les setters définis dans config.js
            setWorldGeoCache(await respWorld.json());
            setDepsGeoCache(await respDeps.json());
        }

        const foundCountries = new Set();
        const foundDeps = new Set();

        geoPoints.forEach(coords => {
            const pt = turf.point(coords);
            
            // Analyse Monde
            for (const c of worldGeoCache.features) {
                if (turf.booleanPointInPolygon(pt, c)) {
                    foundCountries.add(c.properties.ADMIN || c.properties.name);
                    break;
                }
            }
            
            // Analyse Départements (si dans la bounding box France métropolitaine)
            if (coords[0] > -5 && coords[0] < 10 && coords[1] > 41 && coords[1] < 52) {
                for (const d of depsGeoCache.features) {
                    if (turf.booleanPointInPolygon(pt, d)) {
                        foundDeps.add(d.properties.nom);
                        break;
                    }
                }
            }
        });

        // --- 4. ANCIENNETÉ & SOCIAL ---
        const joinDate = userData.createdAt ? new Date(userData.createdAt) : new Date();
        const daysOld = Math.floor((new Date() - joinDate) / 86400000);
        const joinDateStr = joinDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

        // --- 5. MOIS RECORD & HEURE MOYENNE (Une seule boucle) ---
        const monthCounts = {};
        let totalMinutes = 0, validTimeCount = 0;

        data.forEach(m => {
            if (!m.takenTime) return;
            const d = new Date(m.takenTime);
            
            // Groupement par mois
            const key = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
            monthCounts[key] = (monthCounts[key] || 0) + 1;
            
            // Cumul pour moyenne
            totalMinutes += d.getHours() * 60 + d.getMinutes();
            validTimeCount++;
        });

        let bestMonthName = "-", maxPhotos = 0;
        for (const [month, count] of Object.entries(monthCounts)) {
            if (count > maxPhotos) {
                maxPhotos = count;

                bestMonthName = month.charAt(0).toUpperCase() + month.slice(1);
            }
        }

        const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
        const monthlyChartData = Object.entries(monthCounts)
            .map(([label, count]) => {
                const parts    = label.split(' ');
                const monthIdx = MONTHS_FR.indexOf(parts[0].toLowerCase());
                const year     = parseInt(parts[1]);
                return { label, count, sortKey: year * 12 + monthIdx };
            })
            .sort((a, b) => a.sortKey - b.sortKey);

        let avgTimeStr = "--:--";
        if (validTimeCount > 0) {
            const avg = totalMinutes / validTimeCount;
            avgTimeStr = `${Math.floor(avg / 60)}H${Math.round(avg % 60).toString().padStart(2, '0')}`;
        }

        // --- 6. MISE À JOUR DE L'ÉTAT GLOBAL ---
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
            avgTime:          avgTimeStr,
            monthlyChartData: monthlyChartData
        });

        updateDashboardUI();

    } catch (e) {
        console.error("Erreur critique dans calculateStats:", e);
    }
}

// Injecte les valeurs calculées dans le DOM du dashboard

// --- GRAPHIQUE MENSUEL ---
let _chartBarRects = [];

function drawMonthlyChart(data, hoveredIndex = -1) {
    const canvas = document.getElementById('monthly-chart');
    if (!canvas || !data || !data.length) return;
    const ctx  = canvas.getContext('2d');
    const dpr  = window.devicePixelRatio || 1;
    const W    = canvas.offsetWidth;
    const H    = canvas.offsetHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const padL = 28, padR = 16, padT = 16, padB = 36;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const maxVal = Math.max(...data.map(d => d.count), 1);
    const n      = data.length;
    const barW   = Math.max(2, Math.floor(chartW / n) - 2);
    const gap    = (chartW - barW * n) / (n + 1);

    ctx.clearRect(0, 0, W, H);

    // Grille
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padT + chartH - (i / 4) * chartH;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + chartW, y); ctx.stroke();
    }

    // Barres
    _chartBarRects = [];
    data.forEach((d, i) => {
        const x     = padL + gap + i * (barW + gap);
        const barH  = (d.count / maxVal) * chartH;
        const y     = padT + chartH - barH;
        const isHov = i === hoveredIndex;
        _chartBarRects.push({ x, y: padT, w: barW, h: chartH, index: i });

        if (isHov) {
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(x - 2, padT, barW + 4, chartH);
        }

        const grad = ctx.createLinearGradient(0, y, 0, padT + chartH);
        grad.addColorStop(0, isHov ? 'rgba(255,255,255,1)'    : 'rgba(255,255,255,0.85)');
        grad.addColorStop(1, isHov ? 'rgba(255,255,255,0.3)'  : 'rgba(255,255,255,0.15)');
        ctx.fillStyle = grad;

        const r = Math.min(3, barW / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, padT + chartH); ctx.lineTo(x, padT + chartH);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath(); ctx.fill();

        if (isHov) {
            ctx.font = 'bold 11px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillText(d.count, x + barW / 2 + 0.5, y - 4.5);
            ctx.fillStyle = '#fff';
            ctx.fillText(d.count, x + barW / 2, y - 5);
        }
    });

    // Labels année
    ctx.font      = `${Math.max(8, Math.min(10, Math.floor(chartW / n * 0.9)))}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    let lastYear  = null;
    data.forEach((d, i) => {
        const x    = padL + gap + i * (barW + gap) + barW / 2;
        const year = d.label.split(' ')[1];
        if (year !== lastYear) {
            ctx.fillStyle = i === hoveredIndex ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)';
            ctx.fillText(year, x, H - 6);
            lastYear = year;
        }
    });

    // Max value
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font      = '9px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(maxVal, padL - 2, padT + 4);

    // Tooltip centré en haut (dessiné en dernier = au premier plan)
    if (hoveredIndex >= 0 && hoveredIndex < data.length) {
        const d       = data[hoveredIndex];
        const label   = d.label.charAt(0).toUpperCase() + d.label.slice(1);
        const tooltip = `${label}  ·  ${d.count} BeReal${d.count > 1 ? 's' : ''}`;
        ctx.font      = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        const tx = W / 2;
        const tw = ctx.measureText(tooltip).width;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.roundRect(tx - tw / 2 - 8, 4, tw + 16, 18, 6);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(tooltip, tx, 16);
    }
}

function initChartHover(data) {
    const canvas = document.getElementById('monthly-chart');
    if (!canvas || canvas._hoverInited) return;
    canvas._hoverInited = true;
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        let found = -1;
        for (const bar of _chartBarRects) {
            if (mx >= bar.x && mx <= bar.x + bar.w && my >= bar.y && my <= bar.y + bar.h) {
                found = bar.index; break;
            }
        }
        canvas.style.cursor = found >= 0 ? 'crosshair' : 'default';
        drawMonthlyChart(data, found);
    });
    canvas.addEventListener('mouseleave', () => {
        canvas.style.cursor = 'default';
        drawMonthlyChart(data, -1);
    });
}


// Adapte la taille de police pour qu'elle rentre dans la stat-card
function fitStatText(el, maxSize = 32, minSize = 8) {
    if (!el) return;
    const card = el.closest('.stat-card');
    if (!card) return;

    const availW = card.getBoundingClientRect().width - 30;

    // Si la card n'est pas encore visible (dashboard fermé), réessaie plus tard
    if (availW <= 0) {
        requestAnimationFrame(() => fitStatText(el, maxSize, minSize));
        return;
    }

    el.style.whiteSpace = 'nowrap';
    el.style.display    = 'inline-block';
    el.style.maxWidth   = availW + 'px';

    for (let size = maxSize; size >= minSize; size -= 1) {
        el.style.fontSize = size + 'px';
        if (el.scrollWidth <= availW) break;
    }

    el.style.display = 'block';
}

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

    // Ajuste la taille de police du mois record pour qu'il rentre dans la card
    requestAnimationFrame(() => fitStatText(document.getElementById('stat-best-month-name'), 28));
    
    if (cachedStats?.monthlyChartData) {
        requestAnimationFrame(() => {
            drawMonthlyChart(cachedStats.monthlyChartData);
            initChartHover(cachedStats.monthlyChartData);
        });
    }
}

export function openDashboard() {
    document.getElementById('dashboard-modal').style.display = 'flex';
    document.querySelector('.dashboard-positioner').style.display = 'flex';
    // Remet les 3 pages dans l'ordre + reset position
    const slider = document.getElementById('dash-slider');
    if (slider) {
        const p1 = slider.querySelector('#dash-page-1');
        const p2 = slider.querySelector('#dash-page-2');
        const p3 = slider.querySelector('#dash-page-3');
        if (p1 && p2 && p3) {
            slider.style.transition = 'none';
            slider.appendChild(p1);
            slider.appendChild(p2);
            slider.appendChild(p3);
            slider.style.transform = 'translateX(0%)';
        }
    }
    setMapFocus(true);
    if (cachedStats) {
        updateDashboardUI();
        requestAnimationFrame(() => {
            drawMonthlyChart(cachedStats.monthlyChartData);
            initChartHover(cachedStats.monthlyChartData);
        });
    }
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
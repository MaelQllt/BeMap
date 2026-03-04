# BeMap.

**Visualise tous tes BeReals sur une carte interactive.**

BeMap. est une PWA 100 % client-side qui lit ton archive BeReal et la transforme en carte explorable : clusters de photos, timeline chronologique, stats personnelles, repositionnement GPS et mode terrain 3D. Aucune donnée ne quitte ton appareil.

---

## Fonctionnalités

- **Carte interactive** — tous tes BeReals affichés en clusters sur MapLibre GL, avec zoom, pitch et mode nord
- **Timeline** — replay chronologique jour par jour ou mois par mois, avec lecture automatique et contrôle de vitesse
- **Dashboard de stats** — pays visités, streak record, pourcentage à l'heure, heure moyenne, villes les plus fréquentées et plus encore
- **Repositionnement GPS** — assigne ou corrige la localisation d'un BeReal directement sur la carte
- **Terrain 3D** — relief topographique avec ombrage et exagération
- **BeMerge** — utilitaire standalone (`merge.html`) pour fusionner deux `memories.json` en conservant tes relocalisations
- **PWA** — installable sur iOS et Android comme une vraie app, avec session persistante via IndexedDB
- **Filtres** — par année, par mois et par type (à l'heure, en retard, bonus)

---

## Comment obtenir ton archive BeReal

1. Dans l'app BeReal, ouvre ton profil puis **Paramètres > Aide > Nous contacter**
2. Choisis **Poser une Question > Dépannage > Memories**
3. Appuie sur **Encore besoin d'aide ?** et demande une copie de tes données
4. 1 à 2 jours plus tard, récupère le lien dans tes messages BeReal et télécharge **Profil et données d'activité**
5. Dézipe l'archive : tu obtiens un dossier contenant tes photos et tes fichiers JSON

Le tuto complet est intégré directement dans l'app via le bouton **Comment faire ?**.

---

## Structure de l'archive attendue

```
ton-dossier/
├── memories.json       # liste de tes BeReals (requis)
├── user.json           # informations de profil (requis)
├── friends.json        # liste d'amis (optionnel)
└── Photos/
    └── post/           # photos front et back
```

---

## Lancer l'app en local

BeMap. ne nécessite aucun build ni backend. Un simple serveur de fichiers statiques suffit.

```bash
# avec Node.js
npx serve .

# avec Python
python3 -m http.server 8080

# avec l'extension VS Code Live Server
# clic droit sur index.html > Open with Live Server
```

Ouvre ensuite `http://localhost:3000` (ou le port affiché) dans ton navigateur.

> **Important :** l'app doit être servie via HTTP(S), pas via le protocole `file://`, car elle utilise des modules ES6 et IndexedDB.

---

## Architecture des modules

| Fichier | Rôle |
|---|---|
| `app.js` | Point d'entrée, orchestration générale |
| `map.js` | Carte MapLibre, layers, clusters, terrain |
| `dashboard.js` | Stats, slides du dashboard |
| `timeline.js` | Mode replay chronologique |
| `filters.js` | Interface des filtres |
| `filter-core.js` | Logique de filtrage partagée (pas de dépendance circulaire) |
| `geo-convert.js` | Conversion `memories[]` vers GeoJSON |
| `modal.js` | Modale photo avec zoom, flip et drag |
| `badge.js` | Badge profil draggable avec inertie |
| `db.js` | Persistance session via IndexedDB |
| `state.js` | État global centralisé |
| `ui.js` | Toast, loader, bandeau relocation |
| `utils.js` | Helpers partagés (URLs locales, hauteur PWA) |
| `tuto.js` | Carousels tutoriel |

---

## Clé API MapTiler

La clé MapTiler incluse dans `map.js` est publique et restreinte au domaine de production. Pour un fork ou un déploiement personnel, remplace-la par ta propre clé gratuite sur [maptiler.com](https://www.maptiler.com).

```js
// map.js
style: 'https://api.maptiler.com/maps/dataviz-dark/style.json?key=TA_CLE_ICI'
```

---

## BeMerge

`merge.html` est un utilitaire standalone qui fusionne deux `memories.json` :

- conserve toutes les relocalisations manuelles (`_relocated: true`)
- importe les nouvelles localisations de la nouvelle archive si l'ancien n'en avait pas
- ajoute les BeReals présents uniquement dans l'ancienne archive
- télécharge directement le fichier fusionné, sans serveur

---

## Confidentialité

BeMap. ne collecte aucune donnée. Tout est traité localement dans ton navigateur :

- les fichiers de l'archive sont stockés dans IndexedDB sur ton appareil
- aucune requête n'est envoyée vers un serveur tiers (hormis les tuiles cartographiques MapTiler et les polices Google Fonts)
- la session peut être supprimée à tout moment via le bouton de déconnexion

---

## Licence

MIT — voir [LICENSE](./LICENSE)

# Politique de sécurité

## Architecture et données utilisateur

BeMap. est une application 100 % client-side. Aucune donnée personnelle n'est transmise à un serveur tiers :

- Les fichiers de l'archive BeReal (photos, `memories.json`, `user.json`) sont lus localement et stockés dans l'IndexedDB du navigateur sur l'appareil de l'utilisateur
- Aucun compte, aucune authentification et aucun backend
- Les seules requêtes réseau sortantes sont vers MapTiler (tuiles cartographiques) et Google Fonts (typographie) — aucune donnée utilisateur n'y est incluse

---

## Clé API MapTiler

La clé MapTiler présente dans `map.js` est publique et restreinte au domaine de production par règle de referer. Elle ne donne accès qu'aux tuiles cartographiques.

Si tu forkes le projet, remplace-la par ta propre clé gratuite sur [maptiler.com](https://www.maptiler.com) et configure une restriction de domaine dans ton tableau de bord MapTiler. Ne commite jamais de clé à accès étendu dans le dépôt.

---

## Signaler une vulnérabilité

Si tu découvres une faille de sécurité, merci de ne pas l'exposer publiquement via une issue GitHub.

**Signale-la de manière responsable :**

1. Ouvre une issue avec le titre `[SECURITY]` sans détailler la faille publiquement
2. Le mainteneur te contactera pour obtenir les détails de manière privée
3. Une fois la correction déployée, la vulnérabilité pourra être documentée publiquement si pertinent

---

## Périmètre

Sont dans le périmètre de cette politique :

- Toute faille permettant l'exfiltration de données de l'archive BeReal d'un utilisateur
- Toute injection de code (XSS) exploitable dans l'interface
- Tout comportement de `merge.html` permettant la corruption de données JSON

Sont hors périmètre :

- Les risques liés à une clé MapTiler mal configurée par un fork tiers
- Les comportements attendus des APIs navigateur (IndexedDB, Object URLs)

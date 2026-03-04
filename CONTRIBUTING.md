# Contribuer à BeMap.

Merci de l'intérêt pour le projet. Les contributions sont les bienvenues, qu'il s'agisse de corrections de bugs, d'améliorations ou de nouvelles idées.

---

## Avant de commencer

Ouvre une **issue** avant de soumettre une pull request, surtout pour les changements structurels. Cela permet d'aligner les intentions et d'éviter le travail en double.

Pour les corrections mineures (fautes de frappe, bugs évidents), une PR directe est tout à fait acceptable.

---

## Principes à respecter

**Architecture modulaire ES6**
Le projet utilise des modules ES6 natifs sans bundler. Chaque fichier a un rôle précis et les dépendances circulaires sont activement évitées (voir `filter-core.js` et `geo-convert.js` qui existent précisément pour ça). Maintiens ce découpage.

**Pas de bundler, pas de framework**
Le code doit rester importable directement dans un navigateur via `type="module"`. N'introduis pas de build step (Webpack, Vite, etc.) sans discussion préalable.

**Pas de dépendances npm**
L'app est intentionnellement sans `node_modules`. Les seules dépendances externes sont chargées via CDN (MapLibre, Google Fonts, MapTiler).

**État centralisé dans `state.js`**
Toute variable partagée entre modules passe par `state.js` avec ses setters dédiés. Ne crée pas de variables globales sur `window`.

**100 % client-side**
BeMap. ne doit jamais envoyer de données utilisateur vers un serveur. Toute contribution impliquant un appel réseau avec des données personnelles sera refusée.

---

## Workflow

```bash
# 1. Fork et clone
git clone https://github.com/ton-fork/bemap.git
cd bemap

# 2. Lance un serveur local
npx serve .

# 3. Crée une branche
git checkout -b fix/nom-du-bug
# ou
git checkout -b feat/nom-de-la-feature

# 4. Code, teste, commit
git commit -m "fix: description courte du changement"

# 5. Push et ouvre une PR vers main
```

---

## Style de code

- Commentaires en français (convention existante du projet)
- En-tête JSDoc en haut de chaque fichier (`/** NOM.JS — description */`)
- `const` par défaut, `let` si la valeur change, jamais `var`
- Pas de point-virgule superflu en fin de bloc
- Nommage camelCase pour les variables et fonctions, SCREAMING_SNAKE_CASE pour les constantes de configuration

---

## Tester ses changements

Il n'y a pas encore de suite de tests automatisés. Teste manuellement dans au minimum deux contextes :

- Desktop (Chrome ou Firefox)
- Mobile (Safari iOS ou Chrome Android, via les DevTools ou un vrai appareil)

Vérifie particulièrement les interactions touch si tu modifies `badge.js`, `modal.js` ou `timeline.js`.

---

## Signaler un bug

Ouvre une issue en incluant :

- La description du comportement observé
- Le comportement attendu
- Les étapes pour reproduire
- Le navigateur et l'OS utilisés
- Si possible une capture d'écran ou une console log

---

## Questions

Ouvre une issue avec le label `question`. Les discussions informelles sont les bienvenues.

# Documentation Workflow

## Emplacement
- `src/docs/user` : documentation fonctionnelle et guides utilisateurs.
- `src/docs/tech` : documentation technique et architecture.

## Génération
Le projet utilise actuellement des fichiers Markdown statiques.

Commande de vérification rapide :
- `npm run test -- --watch=false --browsers=ChromeHeadless --include="src/app/features/workflow/__tests__/**/*.spec.ts"`

Si vous ajoutez un générateur de docs plus tard, vous pouvez brancher la commande `npm run docs:generate` dans `package.json`.

// La version du produit, telle que le build la pose (scripts/construire.mjs et embarquer.mjs lisent package.json et la
// definissent a la compilation). Hors build (les tests, les sources importees telles quelles) elle n'existe pas : le
// produit se dit alors en developpement, sans lever d'erreur.

declare const VERSION_PRODUIT: string | undefined;

export const versionProduit = (): string => (typeof VERSION_PRODUIT === 'string' ? VERSION_PRODUIT : 'développement');

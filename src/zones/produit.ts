// La version du produit, telle que le build la pose (scripts/construire.mjs et embarquer.mjs lisent package.json et la
// definissent a la compilation). Hors build (les tests, les sources importees telles quelles) elle n'existe pas : le
// produit se dit alors en developpement, sans lever d'erreur.

import { t } from '../util/i18n.js';

declare const VERSION_PRODUIT: string | undefined;

export const versionProduit = (): string => (typeof VERSION_PRODUIT === 'string' ? VERSION_PRODUIT : t('développement'));

declare const DEPOT_PRODUIT: string | undefined;

/** Le depot declare par package.json (`repository.url`), tel que le build de la page le pose ; hors de ce build, rien. */
export const depotProduit = (): string | undefined => (typeof DEPOT_PRODUIT === 'string' && DEPOT_PRODUIT ? DEPOT_PRODUIT : undefined);

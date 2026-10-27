// L'index des polices telechargeables (ADR-0025), livre dans l'annexe polices-catalogue.js a cote de la page et charge a la
// demande par une balise <script> comme polices.js : le lire ne contacte aucun serveur tiers (le fichier est voisin, ou chez
// l'hote, sous `baseAnnexes`). Il est valide entierement (model/cataloguePolices.ts) avant d'etre cru.

import { validerCatalogue, type CataloguePolices } from '../model/cataloguePolices.js';
import { t } from '../util/i18n.js';
import { fabriquerChargeurAnnexe, navigateur, type Annexe } from './annexes.js';

export const FICHIER_CATALOGUE = 'polices-catalogue.js';

const annexe: Annexe<CataloguePolices> = {
  fichier: FICHIER_CATALOGUE,
  globale: '__cataloguePolicesSvg',
  get contenu() { return t('l’index des polices'); },
  get consigne() { return t('lancez « npm run construire »'); },
  donnees: true,
  valider: v => { if (v === undefined) return undefined; const c = validerCatalogue(v); return 'erreur' in c ? undefined : c; }
};

/** L'index, charge une fois, a la demande (un echec se retente au prochain appel). */
export const chargerCatalogue: () => Promise<CataloguePolices> = fabriquerChargeurAnnexe(annexe, navigateur).charger;

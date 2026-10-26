// Les apercus des polices du catalogue (ADR-0026), livres dans l'annexe polices-apercus.js a cote de la page et charges a la
// demande par une balise <script>, comme l'index (io/cataloguePolices.ts) : les lire ne contacte aucun serveur tiers. L'annexe
// est validee entierement (model/apercusPolices.ts) avant d'etre crue ; absente ou refusee, la liste ecrit les noms dans la
// police de l'interface.

import { validerApercus, type AnnexeApercus } from '../model/apercusPolices.js';
import { t } from '../util/i18n.js';
import { fabriquerChargeurAnnexe, navigateur, type Amenees, type Annexe } from './annexes.js';

export const FICHIER_APERCUS = 'polices-apercus.js';

export const ANNEXE_APERCUS: Annexe<AnnexeApercus> = {
  fichier: FICHIER_APERCUS,
  globale: '__apercusPolicesSvg',
  get contenu() { return t('les aperçus des polices'); },
  get consigne() { return t('lancez « npm run construire »'); },
  donnees: true,
  // Une valeur malformee ou trop grosse se lit comme absente : la validation rend une erreur, elle ne leve jamais.
  valider: v => { if (v === undefined) return undefined; const a = validerApercus(v); return 'erreur' in a ? undefined : a; }
};

/** Le chargeur des apercus pour des gestes donnes (les tests passent un faux navigateur). */
export const chargeurApercus = (amenees: Amenees) => fabriquerChargeurAnnexe(ANNEXE_APERCUS, amenees);

/** Les apercus, charges une fois, a la demande (un echec se retente au prochain appel). */
export const chargerApercus: () => Promise<AnnexeApercus> = chargeurApercus(navigateur).charger;

// Le traceur du navigateur, charge une fois, a la demande : le WebAssembly de vtracer (dist/vtracer.js,
// construit par scripts/vtracer.mjs) ne pese rien tant que personne ne vectorise. Une balise <script>
// plutot qu'un fetch ou un import() : cela marche aussi depuis le disque (file://), comme la
// bibliotheque et les fontes (le chargement est celui de io/annexes.ts). Un echec de chargement se dit,
// et l'image reste une image.

import type { Traceur } from '../engine/vectorisation.js';
import { t } from '../util/i18n.js';
import {
  fabriquerChargeurAnnexe, memoiserSucces, messageIntrouvable as messageAnnexeIntrouvable, navigateur,
  type Amenees, type Annexe, type Chargeur
} from './annexes.js';

export type { Amenees };

export const FICHIER_VTRACER = 'vtracer.js';

/** Ce que le script pose sur la fenetre : une fabrique, qui compile le .wasm au premier appel. */
export type FabriqueTraceur = () => Promise<Traceur>;

const annexe: Annexe<FabriqueTraceur> = {
  fichier: FICHIER_VTRACER,
  globale: '__vtracerSvg',
  get contenu() { return t('le traceur : reconstruisez-le avec « npm run construire »'); },
  get consigne() { return t('placez « {fichier} » dans le même dossier que la page (il se construit avec « npm run construire »)', { fichier: FICHIER_VTRACER }); },
  valider: v => (typeof v === 'function' ? v as FabriqueTraceur : undefined)
};

const raison = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 160);

export const messageIntrouvable = (): string => messageAnnexeIntrouvable(annexe);

/**
 * Un chargeur de traceur : le fichier se charge comme toute annexe (une injection, un succes qui se
 * garde, un echec remis a zero) ; le demarrage du WebAssembly se garde et se remet a zero de meme, pour
 * qu'un navigateur qui le refuse une fois (CSP) puisse reessayer sans recharger le fichier.
 */
export function fabriquerChargeur(a: Amenees): Chargeur<Traceur> {
  const fichier = fabriquerChargeurAnnexe(annexe, a);
  return memoiserSucces(async () => {
    const fabrique = await fichier.charger();
    try { return await fabrique(); } catch (e) { throw new Error(t('Le traceur ne démarre pas dans ce navigateur ({raison}).', { raison: raison(e) })); }
  });
}

const chargeur = fabriquerChargeur(navigateur);

export const chargerTraceur: () => Promise<Traceur> = chargeur.charger;

/** Vrai quand le traceur est deja la : un lancement qui suit n'a pas de chargement a annoncer. */
export const traceurCharge: () => boolean = chargeur.pret;

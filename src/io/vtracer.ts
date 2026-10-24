// Le traceur du navigateur, charge une fois, a la demande : le WebAssembly de vtracer (dist/vtracer.js,
// construit par scripts/vtracer.mjs) ne pese rien tant que personne ne vectorise. Une balise <script>
// plutot qu'un fetch ou un import() : cela marche aussi depuis le disque (file://), comme la
// bibliotheque et les fontes. Un echec de chargement se dit, et l'image reste une image.

import type { Traceur } from '../engine/vectorisation.js';
import { urlAnnexe } from './annexes.js';

export const FICHIER_VTRACER = 'vtracer.js';

/** Ce que le script pose sur la fenetre : une fabrique, qui compile le .wasm au premier appel. */
export type FabriqueTraceur = () => Promise<Traceur>;

/** Les deux gestes du navigateur, passes en parametre pour que le reste se teste sans page. */
export interface Amenees {
  /** Ajoute le script ; rend vrai s'il est arrive, faux s'il est introuvable. */
  injecter: (fichier: string) => Promise<boolean>;
  /** La fabrique que le script a posee, s'il l'a posee. */
  lire: () => FabriqueTraceur | undefined;
}

const raison = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 160);

export const messageIntrouvable = (): string =>
  'Le fichier ' + FICHIER_VTRACER + ' est introuvable à côté de la page : placez « ' + FICHIER_VTRACER + ' » dans le même dossier que la page (il se construit avec « npm run construire »).';

/**
 * Un chargeur de traceur : le script ne s'ajoute qu'une fois, un succes se garde, un echec se remet a
 * zero pour qu'un nouvel essai (le fichier a ete pose entre-temps) reparte de rien.
 */
export function fabriquerChargeur(a: Amenees): { charger: () => Promise<Traceur>; pret: () => boolean } {
  let promesse: Promise<Traceur> | null = null;
  let pret = false;
  const demarrer = async (): Promise<Traceur> => {
    let fabrique = a.lire();
    if (!fabrique) {
      if (!(await a.injecter(FICHIER_VTRACER))) throw new Error(messageIntrouvable());
      fabrique = a.lire();
    }
    if (!fabrique) throw new Error('Le fichier ' + FICHIER_VTRACER + ' ne contient pas le traceur : reconstruisez-le avec « npm run construire ».');
    try { return await fabrique(); } catch (e) { throw new Error('Le traceur ne démarre pas dans ce navigateur (' + raison(e) + ').'); }
  };
  return {
    charger: () => {
      promesse ??= demarrer().then(t => { pret = true; return t; }, (e: unknown) => {
        promesse = null;
        throw e instanceof Error ? e : new Error(String(e));
      });
      return promesse;
    },
    pret: () => pret
  };
}

const fenetre = () => window as unknown as { __vtracerSvg?: FabriqueTraceur };

const navigateur: Amenees = {
  lire: () => fenetre().__vtracerSvg,
  injecter: fichier => new Promise<boolean>(ok => {
    const s = document.createElement('script');
    s.src = urlAnnexe(fichier);
    s.onload = () => { s.remove(); ok(true); };
    s.onerror = () => { s.remove(); ok(false); };
    document.head.appendChild(s);
  })
};

const chargeur = fabriquerChargeur(navigateur);

export const chargerTraceur: () => Promise<Traceur> = chargeur.charger;

/** Vrai quand le traceur est deja la : un lancement qui suit n'a pas de chargement a annoncer. */
export const traceurCharge: () => boolean = chargeur.pret;

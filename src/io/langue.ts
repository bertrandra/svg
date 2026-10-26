// La langue de l'interface, posee avant le premier rendu (ADR-0042) : le dictionnaire anglais est une annexe (dist/langue-en.js,
// ecrite par scripts/langues.mjs, posee a cote de la page comme la bibliotheque), chargee a la demande SEULEMENT quand la langue
// vaut `en`. Le francais n'a pas de dictionnaire : ses cles sont le texte, et rien ne se charge. Si l'annexe manque, l'interface
// reste en francais et le dit une fois (`avertissementLangue`), avec le message commun des annexes.
//
// La page autonome (zones/demarrer.tsx), le site PHP (src/site, avec la langue du compte) et un hote qui embarque l'editeur
// (l'option `langue` d'`EditeurSvg.ouvrir`, ou un appel direct avant de monter le composant React) passent tous par
// `preparerLangue`. C'est ici, et seulement ici, que `document.documentElement.lang` suit la langue.

import { definirDictionnaire, definirLangue, dictionnairePose, t, type Dictionnaire, type Langue } from '../util/i18n.js';
import { fabriquerChargeurAnnexe, navigateur, type Amenees, type Annexe, type Chargeur } from './annexes.js';

export const FICHIER_LANGUE_EN = 'langue-en.js';

/** Un dictionnaire pose a la forme attendue : un objet de textes vers des textes, rien d'autre n'en sort ; undefined sinon. */
export function validerDictionnaire(v: unknown): Dictionnaire | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const table: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(v as Record<string, unknown>)) {
    if (typeof valeur !== 'string') return undefined;
    table[cle] = valeur;
  }
  return table;
}

/** L'annexe du dictionnaire anglais : `donnees`, pour que le site PHP la lise en JSON (`langue-en`) plutot que par un script. */
export const ANNEXE_LANGUE_EN: Annexe<Dictionnaire> = {
  fichier: FICHIER_LANGUE_EN,
  globale: '__langueSvg_en',
  // Par `t` comme toute annexe, bien qu'une plainte sur ce dictionnaire-ci se dise toujours en francais : il n'est pas arrive.
  get contenu() { return t('le dictionnaire anglais'); },
  get consigne() { return t('lancez « npm run langues »'); },
  donnees: true,
  valider: validerDictionnaire
};

/** Le chargeur du dictionnaire anglais, pour un navigateur donne (le vrai, ou un simule en test). */
export const chargeurLangueEn = (amenees: Amenees): Chargeur<Dictionnaire> => fabriquerChargeurAnnexe(ANNEXE_LANGUE_EN, amenees);

const chargeurs: Partial<Record<Langue, Chargeur<Dictionnaire>>> = {};
let avertissement: string | null = null;

/** Pose `lang` sur la racine du document, quand il y en a un (sous Node, rien). */
function poserLangDocument(l: Langue): void {
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = l;
}

/**
 * Prepare la langue de l'interface, avant tout rendu : charge le dictionnaire s'il en faut un et qu'il n'est pas deja la, pose
 * la langue (util/i18n.ts) et le `lang` du document. Ne leve jamais : une annexe introuvable ou vide laisse l'interface en
 * francais, et `avertissementLangue` dit pourquoi, une fois. `amenees` : le navigateur, remplacable en test.
 */
export async function preparerLangue(l: Langue, amenees: Amenees = navigateur): Promise<void> {
  if (!dictionnairePose(l)) {
    const chargeur = chargeurs[l] ??= chargeurLangueEn(amenees);
    try {
      definirDictionnaire(l, await chargeur.charger());
    } catch (e: unknown) {
      avertissement = t('{raison} L’interface reste en français.', { raison: e instanceof Error ? e.message : String(e) });
      definirLangue('fr');
      poserLangDocument('fr');
      return;
    }
  }
  definirLangue(l);
  poserLangDocument(l);
}

/** Ce que `preparerLangue` n'a pas pu faire, dit une fois : la phrase la premiere fois, null ensuite (et null sans echec). */
export function avertissementLangue(): string | null {
  const a = avertissement;
  avertissement = null;
  return a;
}

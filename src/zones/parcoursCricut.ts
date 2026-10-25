// La fin du parcours Cricut (ADR-0013, amendement) : ce que dit le bouton d'export selon les constats, la confirmation legere
// quand un point reste a corriger, les etapes dans Design Space apres l'export, le libelle du selecteur de machine et l'unite
// retenue. Pur : les composants (FinCricut.tsx, Production.tsx) ne font que l'afficher.
//
// Pourquoi : « Exporter pour Cricut » partait sans un mot alors qu'un constat « à corriger » disait que la lame dechirerait le
// papier, et rien ne disait quoi faire du fichier une fois telecharge. Un maker debutant restait seul au pire moment.

import { texteTaille, type Constat, type ProfilProduction } from '../engine/preparation.js';
import { CRICUT, type ChoixProduction, type UniteLongueur } from '../model/contextes.js';
import { pluriel } from '../util/texte.js';

/** Ce que le bouton d'export montre et fait : sa raison d'etre inactif, les points qui demandent une confirmation, son libelle. */
export interface EtatExport {
  /** Pourquoi l'export est refuse (analyse en cours, constat bloquant), en une phrase sans point final ; null : il est permis. */
  readonly raison: string | null;
  /** Les constats « à corriger » : tant qu'il en reste, l'export demande une confirmation. Un conseil ne compte pas. */
  readonly aCorriger: readonly Constat[];
  readonly libelle: string;
}

/** « 1 point à corriger », « 3 points à corriger ». */
export const pointsACorriger = (n: number): string => pluriel(n, 'point') + ' à corriger';

/**
 * L'etat du bouton d'export pour des constats (null : l'analyse n'est pas finie). Un bloquant refuse, un « à corriger » demande
 * une confirmation, un conseil ne change rien : il dit un risque, pas un defaut.
 */
export function etatExport(constats: readonly Constat[] | null): EtatExport {
  if (!constats) return { raison: 'L’analyse du dessin n’est pas finie', aCorriger: [], libelle: 'Exporter pour Cricut' };
  const bloquants = constats.filter(c => c.gravite === 'bloquant').length;
  const aCorriger = constats.filter(c => c.gravite === 'a-corriger');
  if (bloquants) return { raison: 'Corrigez d’abord ' + (bloquants > 1 ? 'les ' + bloquants + ' constats bloquants' : 'le constat bloquant'), aCorriger, libelle: 'Exporter pour Cricut' };
  return { raison: null, aCorriger, libelle: aCorriger.length ? 'Exporter quand même (' + pointsACorriger(aCorriger.length) + ')' : 'Exporter pour Cricut' };
}

/** Vrai quand l'export doit d'abord demander : il est permis, et un point reste a corriger. `quandMeme` est la reponse. */
export const demandeConfirmation = (e: EtatExport, quandMeme: boolean): boolean => e.raison === null && e.aCorriger.length > 0 && !quandMeme;

/** Ce que la region vocale dit quand la confirmation s'ouvre : combien, lesquels, et les deux choix. */
export function phraseConfirmation(aCorriger: readonly Constat[]): string {
  return 'Il reste ' + pointsACorriger(aCorriger.length) + ' : ' + aCorriger.map(c => c.message.replace(/\.$/, '')).join(' ; ') + '. Exporter quand même, ou Revoir.';
}

/** Ce que la barre d'etat dit de la confirmation, en une ligne : la liste est dans le panneau. */
export const phraseConfirmationCourte = (n: number): string => 'Il reste ' + pointsACorriger(n) + ', listés dans le panneau : exporter quand même, ou revoir.';

/** « 1 couche : 1 tapis », « 3 couches : 3 tapis » (tapis ne prend pas de s : `pluriel` le sait). */
export const phraseCouches = (n: number): string => pluriel(n, 'couche') + ' : ' + pluriel(n, 'tapis');

/** Une etape dans Design Space ; `aVerifier` quand elle repose sur un comportement que le protocole n'a pas encore confirme. */
export interface EtapeDesignSpace { readonly texte: string; readonly aVerifier?: true }

/**
 * Les etapes apres l'export, dans Design Space : importer le fichier, verifier sa taille, regler chaque couche (decoupe), ou
 * imprimer puis decouper (Print Then Cut). Rien n'est promis que l'on n'ait pas vu : ce que le protocole (docs/cricut/protocole.md)
 * n'a pas confirme est marque. `taille` est celle du dessin, en unites du plan ; null pour un dessin vide (l'export le refuse).
 */
export function etapesDesignSpace(p: ProfilProduction, nom: string, taille: { readonly l: number; readonly h: number } | null): EtapeDesignSpace[] {
  const dimension = taille ? texteTaille(taille.l, taille.h, p.unite) : null;
  if (p.procede === 'imprimer-decouper') {
    return [
      { texte: 'Ouvrez l’archive ' + nom + '-print-then-cut.zip : l’image à imprimer, la ligne de coupe et un mode d’emploi.' },
      { texte: 'Dans Design Space, « Nouveau projet », puis « Importer » l’image à imprimer, en « Imprimer puis découper » ; vérifiez sa taille avec le mode d’emploi' + (dimension ? ' (le dessin seul mesure ' + dimension + ')' : '') + '.', aVerifier: true },
      { texte: 'Importez la ligne de coupe, donnez-lui la même taille et centrez-la sur l’image.', aVerifier: true },
      { texte: 'La première fois, faites l’étalonnage d’Imprimer puis découper que propose Design Space.', aVerifier: true },
      { texte: 'Imprimez, posez la feuille sur le tapis comme l’aperçu le montre, puis lancez la coupe.' }
    ];
  }
  return [
    { texte: 'Dans Design Space, « Nouveau projet », puis « Importer ».' },
    { texte: 'Choisissez le fichier ' + nom + '-cricut.svg, importez-le, puis ajoutez-le au projet.' },
    { texte: (dimension ? 'Vérifiez sa taille : ' + dimension + '.' : 'Vérifiez sa taille.') + ' Ne la changez pas.', aVerifier: true },
    { texte: 'Pour chaque couche, choisissez couper, dessiner ou rainer : le fichier ne le dit pas.' }
  ];
}

/** Le nom court d'un tapis pour le selecteur : « 12 × 12 », « sans tapis ». */
const tapisCourt = (id: string): string => {
  const nom = CRICUT.tapis.find(t => t.id === id)?.nom ?? id;
  return /^Sans tapis/.test(nom) ? 'sans tapis' : nom.replace(/^Tapis (Joy )?/, '').replace(/ po$/, '');
};

/**
 * Ce que dit le bouton du selecteur : la machine et son tapis (« Cricut Maker · 12 × 12 »), ou « Machine : Générique ». Le mot
 * « Générique » seul ne disait pas que le bouton choisissait une machine.
 */
export function libelleSelecteur(c: ChoixProduction): string {
  if (c.contexte !== 'cricut') return 'Machine : Générique';
  const machine = CRICUT.machines.find(m => m.id === c.machine)?.nom.split(' ')[0] ?? c.machine;
  return 'Cricut ' + machine + ' · ' + tapisCourt(c.tapis) + (c.procede === 'imprimer-decouper' ? ' · Print Then Cut' : '');
}

/** La cle de l'unite retenue dans le stockage injecte : un confort, comme le brouillon. */
export const CLE_UNITE = 'svg.unite';

/** L'unite lue dans un stockage : « mm » ou « in », rien d'autre (une valeur abimee ou etrangere se lit comme absente). */
export const lireUnite = (v: unknown): UniteLongueur | null => (v === 'mm' || v === 'in' ? v : null);

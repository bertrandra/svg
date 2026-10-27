// La fonctionnalite « groupes » du modele v2 (ADR-0012, etape 1, annexe 2 §2 et §3) : en mode riche, un <g> ou un <a> devient un
// `Groupe` au lieu de se fondre dans ses feuilles. La matrice, l'heritage des peintures, `class` et `style` se resolvent toujours sur
// les feuilles (les transformations sont cuites, annexe 1 §1) ; seule l'opacite du groupe reste au groupe, ou elle compose vraiment
// (au lieu de se multiplier sur chaque feuille, l'approximation du mode plat). Un <use> se deplie comme avant : la structure de sa
// cible (ses <g>) est gardee, lue par ce meme lecteur.
//
// L'ecriture pose `opacity` et `data-ed-nom` (le nom, encode en pourcentage comme le texte vivant : il survit au nettoyage) aux
// rangs de l'annexe 2 §3. Un groupe n'a ni transformation, ni peinture, ni effet a lui : il ne touche a aucune feuille.

import type { Fonctionnalite, Marche } from '../fonctionnalites.js';
import { RANG_GROUPE, completerGroupe, type AttributEcrit } from '../fonctionnalites.js';
import type { Noeud } from '../../../util/xml.js';
import type { Groupe } from '../types.js';
import type { Pret } from '../parcours.js';
import { PROFONDEUR_GROUPES_MAX } from '../arbre.js';
import { arrondirOpacite, lireOpacite } from '../opacites.js';
import { decoderTexte, encoderTexte } from '../texteVivant.js';
import { nb } from '../chemins.js';
import { nombre, t } from '../../../util/i18n.js';

/** Le nombre de groupes qu'un dessin lu peut porter (annexe 5 §2) : au-dela, la lecture refuse en le nommant. */
export const GROUPES_MAX = 20_000;
/** La longueur d'un nom de groupe gardee a la lecture : un nom n'est pas un texte, il se lit dans une liste de calques. */
export const NOM_GROUPE_MAX = 200;
/** L'attribut du nom d'un groupe, encode en pourcentage. */
export const ATTRIBUT_NOM = 'data-ed-nom';

/** Les deux refus des groupes, dits dans la langue de l'interface au moment du refus (leur nombre formate avec). */
export const msgGroupesProfonds = (): string => t('des groupes emboîtés sur plus de {n} niveaux', { n: PROFONDEUR_GROUPES_MAX });
export const msgGroupesNombreux = (): string => t('des groupes trop nombreux (plus de {n})', { n: nombre(GROUPES_MAX) });
/** Les memes phrases, figees au chargement (avant la langue : en francais) : ce qu'un hote ou un test lisent par leur nom d'avant. */
export const MSG_GROUPES_PROFONDS = msgGroupesProfonds();
export const MSG_GROUPES_NOMBREUX = msgGroupesNombreux();

/**
 * Le nom d'un groupe lu : celui que l'editeur a ecrit (`data-ed-nom`, decode), le calque d'Inkscape (`inkscape:label`), le nom de
 * Figma ou d'Illustrator (`data-name`), a defaut l'identifiant. Absent si aucun ne dit rien.
 */
export function nomDuGroupe(a: Readonly<Record<string, string>>): string | undefined {
  const ecrit = a[ATTRIBUT_NOM] !== undefined ? decoderTexte(a[ATTRIBUT_NOM]) : null;
  for (const v of [ecrit, a['inkscape:label'], a['data-name'], a.id]) {
    const t = (v ?? '').trim();
    if (t) return [...t].slice(0, NOM_GROUPE_MAX).join('');
  }
  return undefined;
}

/** Combien de groupes enveloppent un groupe de la table (le groupe compris) ; borne, meme sur une table abimee. */
export function profondeurDans(table: ReadonlyMap<string, Groupe>, id: string | undefined): number {
  let n = 0;
  for (let g = id === undefined ? undefined : table.get(id); g && n <= PROFONDEUR_GROUPES_MAX; g = g.parent === undefined ? undefined : table.get(g.parent)) n++;
  return n;
}

/** Lit un <g> ou un <a> en groupe : il prend sa place dans la table, puis ses enfants se lisent dedans. */
function lireGroupe(n: Noeud, pret: Pret, marche: Marche): void {
  const table = marche.parcours.groupes;
  // Sans table (une liste de fonctionnalites donnee par un test, sans la lecture riche), le groupe se fond comme avant.
  if (!table) { marche.enfants(n, pret); return; }
  if (table.size >= GROUPES_MAX) { marche.refuser(msgGroupesNombreux()); return; }
  if (profondeurDans(table, pret.parent) >= PROFONDEUR_GROUPES_MAX) { marche.refuser(msgGroupesProfonds()); return; }
  const id = 'g' + (table.size + 1), nom = nomDuGroupe(n.attributs);
  const opacite = arrondirOpacite(pret.pr.opacity !== undefined ? lireOpacite(pret.pr.opacity) : 1);
  const lu: Groupe = {
    id,
    ...(pret.parent !== undefined ? { parent: pret.parent } : {}),
    ...(nom !== undefined ? { nom } : {}),
    visible: true,
    verrouille: false,
    ...(opacite < 1 ? { opacite } : {})
  };
  table.set(id, completerGroupe(marche.parcours.fonctions ?? [], lu, n, pret, marche));
  // Les feuilles recoivent la matrice et l'heritage du groupe, pas son opacite : elle compose au groupe.
  marche.enfants(n, { m: pret.m, heritees: pret.heritees, opacite: pret.opaciteDuParent, profondeur: pret.profondeur, parent: id });
}

/** Les attributs d'un groupe ecrit : son opacite si elle n'est pas pleine, son nom s'il en a un. Un groupe nu s'ecrit <g>. */
function attributsGroupe(g: Groupe): readonly AttributEcrit[] {
  const out: AttributEcrit[] = [];
  if (g.opacite !== undefined && g.opacite < 1) out.push([RANG_GROUPE.opacite, ' opacity="' + nb(arrondirOpacite(g.opacite), 3) + '"']);
  if (g.nom) out.push([RANG_GROUPE.nom, ' ' + ATTRIBUT_NOM + '="' + encoderTexte(g.nom) + '"']);
  return out;
}

export const groupes: Fonctionnalite = {
  nom: 'groupes',
  lecture: { elements: { g: lireGroupe, a: lireGroupe } },
  ecriture: { attributsGroupe }
};

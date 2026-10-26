// Les decoupes du modele v2, cote operations (ADR-0012, etape 5, annexe 3 §3) : creer une decoupe a la facon d'Illustrator (la
// forme du dessus decoupe les autres elements choisis, reunis dans un groupe) et la liberer (la forme revient, sans peinture qui la
// confondrait avec le dessin, et le groupe reste). Pur ; chaque operation rend le MEME dessin, et sa raison, quand elle ne s'applique
// pas, et un dessin qui respecte les invariants (arbre.ts, `verifierDessin`).

import type { DessinSvg, Forme, Groupe } from './types.js';
import { arbreDe, normaliser, unites, verrouilleEffectif, visibleEffectif, type NoeudArbre } from './arbre.js';
import { avecGroupes, groupeDe, grouper } from './groupes.js';
import { feuilleDeDecoupe } from './fonctions/decoupes.js';

/** Ce que disent les operations quand elles ne s'appliquent pas (phrases de l'interface, au vouvoiement). */
export const MSG_DECOUPE = {
  selection: 'Choisissez au moins deux éléments visibles et déverrouillés : la forme du dessus découpe les autres.',
  dessus: 'La forme du dessus doit être une seule forme (ni un groupe, ni une image) : c’est elle qui découpe les autres.',
  aucune: 'Ce groupe ne porte pas de découpe.'
} as const;

/** Le premier et le dernier index de `formes` couverts par un noeud. */
const debut = (n: NoeudArbre): number => (n.genre === 'feuille' ? n.index : n.debut);
const fin = (n: NoeudArbre): number => (n.genre === 'feuille' ? n.index : n.fin - 1);

/**
 * Creer une decoupe : parmi les elements choisis (visibles et deverrouilles), le plus haut dans l'ordre de peinture devient la
 * decoupe, sa geometrie seule (sa peinture ne compte plus) ; les autres sont reunis dans un groupe nouveau qui la porte, a la place
 * du plus haut d'entre eux (comme `grouper`). Le plus haut doit etre une feuille qui a un trace : ni un groupe, ni une image. Rend le
 * dessin et l'identifiant du groupe, ou le meme dessin, null et la raison.
 */
export function creerDecoupe(d: DessinSvg, ids: readonly string[]): { dessin: DessinSvg; id: string | null; erreur?: string } {
  const a = arbreDe(d);
  const us = unites(d, ids)
    .flatMap(id => { const n = a.parId.get(id); return n ? [n] : []; })
    .filter(n => { const id = n.genre === 'feuille' ? n.forme.id : n.groupe.id; return visibleEffectif(d, id) && !verrouilleEffectif(d, id); })
    .sort((x, y) => debut(x) - debut(y));
  const haut = us.reduce<NoeudArbre | undefined>((h, n) => (h === undefined || fin(n) > fin(h) ? n : h), undefined);
  if (us.length < 2 || !haut) return { dessin: d, id: null, erreur: MSG_DECOUPE.selection };
  if (haut.genre !== 'feuille' || haut.forme.image || !haut.forme.d.length) return { dessin: d, id: null, erreur: MSG_DECOUPE.dessus };
  const forme = haut.forme;
  const autres = us.filter(n => n !== haut).map(n => (n.genre === 'feuille' ? n.forme.id : n.groupe.id));
  // La forme du dessus quitte le dessin (un groupe qu'elle laisserait vide part avec elle), puis les autres se groupent.
  const sans = normaliser(avecGroupes(d, d.formes.filter(f => f !== forme), d.groupes ?? {}));
  const r = grouper(sans, autres);
  const g = r.id === null ? undefined : groupeDe(r.dessin, r.id);
  if (r.id === null || !g) return { dessin: d, id: null, erreur: MSG_DECOUPE.selection };
  const decoupe = { contenu: { formes: [feuilleDeDecoupe(forme.id, forme.d, forme.regle)] } };
  return { dessin: { ...r.dessin, groupes: { ...r.dessin.groupes, [r.id]: { ...g, decoupe } } }, id: r.id };
}

/**
 * Liberer la decoupe d'un groupe : le groupe la perd et reste ; les formes de la decoupe y reviennent au premier plan, sous leurs
 * identifiants, sans fond et d'un trait noir fin (une decoupe n'a pas de peinture : sans trait, la forme rendue serait invisible).
 * Les decoupes de la decoupe elle-meme, s'il y en avait, partent. Rend le dessin et les identifiants des formes rendues, ou le meme
 * dessin, sans identifiant, et la raison.
 */
export function liberer(d: DessinSvg, id: string): { dessin: DessinSvg; ids: string[]; erreur?: string } {
  const g = groupeDe(d, id);
  if (!g?.decoupe) return { dessin: d, ids: [], erreur: MSG_DECOUPE.aucune };
  const rendues = g.decoupe.contenu.formes.filter(f => f.d.length).map((f): Forme => {
    const { parent: _p, ...reste } = f;
    void _p;
    return { ...reste, remplissage: null, contour: '#000000', epaisseur: 1, opacite: 1, visible: true, verrouille: false, parent: id };
  });
  const { decoupe: _d, ...nu } = g;
  void _d;
  const groupes: Record<string, Groupe> = { ...d.groupes, [id]: nu };
  // Au premier plan du groupe : juste apres sa derniere feuille.
  const n = arbreDe(d).parId.get(id);
  const apres = n ? fin(n) : d.formes.length - 1;
  const formes = d.formes.flatMap((f, i) => (i === apres ? [f, ...rendues] : [f]));
  return { dessin: normaliser(avecGroupes(d, formes, groupes)), ids: rendues.map(f => f.id) };
}

// Les motifs du modele v2, cote operations (ADR-0012, etape 9 ; annexe 6 §4) : « Créer un motif depuis la sélection ». Les elements
// choisis (visibles et deverrouilles : des formes, des groupes entiers, peints comme ils le sont) deviennent la tuile d'un motif, qui
// prend exactement leur boite visuelle (trait et effets compris) : repetee, la selection se pave bord a bord, comme Illustrator le fait
// d'un glisser dans le nuancier. Ils quittent le dessin. Le motif peint ensuite :
//
// - la forme `cible` si on en donne une (une forme a trace, ni image ni element de la selection) : son remplissage devient le motif, sa
//   couleur de repli prend la place de la couleur ; elle garde sa place et le reste ;
// - sinon un rectangle neuf, sans trait, de trois tuiles sur trois centre sur la selection (assez pour voir le motif se repeter), pose
//   a la place de l'element le plus haut de la selection, dans le meme groupe.
//
// La tuile vit dans son propre repere, son origine au coin de la tuile (fonctions/motifs.ts) : la selection y est ramenee par une
// translation (degrades, motifs, effets, images et textes de la selection suivent, par les crochets de transformation), et le motif est
// pose sans matrice, sa tuile a la place de la selection. Ses identifiants sont ceux des elements choisis (la tuile est un espace a
// part). Pur ; chaque operation rend le MEME dessin, null et sa raison quand elle ne s'applique pas.

import type { Contenu, DessinSvg, Forme, Groupe, Motif } from './types.js';
import { arbreDe, normaliser, prochainNumero, unites, verrouilleEffectif, visibleEffectif, ancetres, type NoeudArbre } from './arbre.js';
import { avecGroupes } from './groupes.js';
import { boiteVisuelle } from './etendueVisuelle.js';
import { translation, unir } from './geometrie.js';
import { transformerFeuille, transformerGroupe } from './transformation.js';
import { couleurDeRepliMotif, TUILE_MIN } from './fonctions/motifs.js';

/** Ce que dit l'operation quand elle ne s'applique pas (phrases de l'interface, au vouvoiement). */
export const MSG_MOTIF = {
  selection: 'Choisissez au moins un élément visible et déverrouillé : il deviendra la tuile du motif.',
  vide: 'La sélection ne laisse rien voir (ou presque) : elle ne peut pas servir de tuile.',
  image: 'La sélection contient une image : une image ne se répète pas en motif ici.',
  cible: 'La forme à peindre doit être une forme visible et déverrouillée, hors de la sélection, et pas une image.'
} as const;

const idDe = (n: NoeudArbre): string => (n.genre === 'feuille' ? n.forme.id : n.groupe.id);
const debut = (n: NoeudArbre): number => (n.genre === 'feuille' ? n.index : n.debut);
const fin = (n: NoeudArbre): number => (n.genre === 'feuille' ? n.index : n.fin - 1);
const groupesDuSousArbre = (n: NoeudArbre): Groupe[] => (n.genre === 'feuille' ? [] : [n.groupe, ...n.enfants.flatMap(groupesDuSousArbre)]);

/** Le noeud sans parent : il devient une racine de la tuile. */
function sansParent<T extends { readonly parent?: string }>(x: T): T {
  if (x.parent === undefined) return x;
  const { parent: _p, ...reste } = x;
  void _p;
  return reste as T;
}

/** Le noeud avec ce parent, ou sans parent du tout. */
function avecParent<T extends { readonly parent?: string }>(x: T, parent: string | undefined): T {
  const nu = sansParent(x);
  return parent === undefined ? nu : { ...nu, parent };
}

/**
 * Creer un motif depuis la selection `ids` (voir l'en-tete). Rend le dessin et l'identifiant de la forme peinte, ou le meme dessin, null
 * et la raison.
 */
export function creerMotif(d: DessinSvg, ids: readonly string[], cible?: string): { dessin: DessinSvg; id: string | null; erreur?: string } {
  const a = arbreDe(d);
  const peinte = cible === undefined ? undefined : d.formes.find(f => f.id === cible);
  if (cible !== undefined) {
    const libre = peinte && !peinte.image && peinte.d.length > 0 && visibleEffectif(d, peinte.id) && !verrouilleEffectif(d, peinte.id);
    if (!libre || ids.includes(cible)) return { dessin: d, id: null, erreur: MSG_MOTIF.cible };
  }
  const us = unites(d, ids.filter(id => id !== cible))
    .flatMap(id => { const n = a.parId.get(id); return n ? [n] : []; })
    .filter(n => visibleEffectif(d, idDe(n)) && !verrouilleEffectif(d, idDe(n)))
    .sort((x, y) => debut(x) - debut(y));
  if (!us.length) return { dessin: d, id: null, erreur: MSG_MOTIF.selection };
  // La cible ne peut pas partir avec la selection (dans un groupe choisi).
  if (peinte && us.some(n => n.genre === 'groupe' && ancetres(d, peinte.id).includes(n.groupe.id))) return { dessin: d, id: null, erreur: MSG_MOTIF.cible };
  const feuilles = us.flatMap(n => (n.genre === 'feuille' ? [n.forme] : d.formes.slice(n.debut, n.fin)));
  if (feuilles.some(f => f.image)) return { dessin: d, id: null, erreur: MSG_MOTIF.image };
  const boite = unir(us.map(n => boiteVisuelle(d, idDe(n))));
  if (!boite || !(boite.l >= TUILE_MIN) || !(boite.h >= TUILE_MIN)) return { dessin: d, id: null, erreur: MSG_MOTIF.vide };
  // La tuile : la selection ramenee au coin de sa boite, ses racines sans parent, ses groupes avec elle.
  const vers = translation(-boite.x, -boite.y);
  const racines = new Set(us.map(idDe));
  const sous = us.flatMap(groupesDuSousArbre);
  const formesTuile = feuilles.map(f => { const x = transformerFeuille(f, vers); return racines.has(f.id) ? sansParent(x) : x; });
  const contenu = normaliser<Contenu>(sous.length
    ? { formes: formesTuile, groupes: Object.fromEntries(sous.map(g => { const x = transformerGroupe(g, vers); return [g.id, racines.has(g.id) ? sansParent(x) : x]; })) }
    : { formes: formesTuile });
  const motif: Motif = { genre: 'motif', x: boite.x, y: boite.y, l: boite.l, h: boite.h, contenu };
  const repli = couleurDeRepliMotif(contenu);
  const partis = new Set(feuilles.map(f => f.id)), groupesPartis = new Set(sous.map(g => g.id));
  const restants = Object.fromEntries(Object.entries(d.groupes ?? {}).filter(([k]) => !groupesPartis.has(k)));
  if (peinte) {
    const formes = d.formes.filter(f => !partis.has(f.id)).map(f => (f.id === peinte.id ? { ...peinte, remplissage: repli, peintureRemplissage: motif } : f));
    return { dessin: normaliser(avecGroupes(d, formes, restants)), id: peinte.id };
  }
  // Un rectangle neuf de trois tuiles sur trois, a la place du plus haut des elements choisis, dans son groupe.
  const haut = us.reduce((h, n) => (fin(n) > fin(h) ? n : h));
  const parent = haut.genre === 'feuille' ? haut.forme.parent : haut.groupe.parent;
  const x0 = boite.x - boite.l, y0 = boite.y - boite.h, x1 = boite.x + 2 * boite.l, y1 = boite.y + 2 * boite.h;
  const id = 'f' + prochainNumero(d, 'f');
  const rectangle: Forme = avecParent<Forme>({
    id, d: [{ c: 'M', p: [x0, y0] }, { c: 'L', p: [x1, y0] }, { c: 'L', p: [x1, y1] }, { c: 'L', p: [x0, y1] }, { c: 'Z', p: [] }],
    remplissage: repli, contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, peintureRemplissage: motif
  }, parent !== undefined && !groupesPartis.has(parent) ? parent : undefined);
  const apres = fin(haut);
  const formes = d.formes.flatMap((f, i) => [...(partis.has(f.id) ? [] : [f]), ...(i === apres ? [rectangle] : [])]);
  return { dessin: normaliser(avecGroupes(d, formes, restants)), id };
}

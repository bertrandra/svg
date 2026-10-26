// Les masques d'opacite du modele v2, cote operations (ADR-0012, etape 6, annexe 3 §3) : creer un masque a la facon d'Illustrator (le
// dessus de la selection masque les autres elements choisis, reunis dans un groupe), le liberer (son contenu revient dans le groupe,
// tel qu'il etait peint) et l'inverser (ce qui etait cache se voit). Pur ; chaque operation rend le MEME dessin, et sa raison, quand
// elle ne s'applique pas, et un dessin qui respecte les invariants (arbre.ts, `verifierDessin`).
//
// Inverser un masque de luminance, c'est peindre son contenu aux couleurs complementaires sur un fond blanc qui couvre sa region :
// la luminance d'un melange est lineaire dans les composantes, donc celle du contenu inverse sur blanc vaut 1 moins celle du contenu
// sur noir, recouvrements et opacites compris (exact quand la luminance se calcule sur les composantes sRVB, ce que font les
// navigateurs par defaut ; une approximation sur les gris sinon). Inverser encore retire ce fond. Un masque alpha s'inverse en
// masque de luminance : son contenu, peint en noir a ses opacites, sur le fond blanc. Une image (sa luminance ne se calcule pas ici)
// ou une couleur qui n'est pas un code #rrggbb empechent l'inversion, et c'est dit.

import type { Boite, Contenu, DessinSvg, Forme, Groupe, Masque, Peinture } from './types.js';
import { arbreDe, normaliser, prochainNumero, unites, verrouilleEffectif, visibleEffectif, type NoeudArbre } from './arbre.js';
import { avecGroupes, groupeDe, grouper } from './groupes.js';
import { boiteVisuelle } from './etendueVisuelle.js';
import { boiteChemin, unir } from './geometrie.js';
import { couleurDeRepli, estDegrade } from './degrades.js';
import { lireHex, versHex } from '../../util/couleur.js';
import { t } from '../../util/i18n.js';

/** Ce que disent les operations quand elles ne s'appliquent pas (phrases de l'interface, au vouvoiement) ; des accesseurs, traduits a la lecture. */
export const MSG_MASQUE = {
  get selection(): string { return t('Choisissez au moins deux éléments visibles et déverrouillés : celui du dessus masque les autres.'); },
  get vide(): string { return t('L’élément du dessus ne laisse rien voir : il ne peut pas servir de masque.'); },
  get aucun(): string { return t('Ce groupe ne porte pas de masque.'); },
  get image(): string { return t('Ce masque contient une image : il ne s’inverse pas.'); },
  get couleur(): string { return t('Ce masque porte une couleur ou une peinture qui ne s’inverse pas (seuls les codes #rrggbb et les dégradés s’inversent).'); }
};

const idDe = (n: NoeudArbre): string => (n.genre === 'feuille' ? n.forme.id : n.groupe.id);
/** Le premier et le dernier index de `formes` couverts par un noeud. */
const debut = (n: NoeudArbre): number => (n.genre === 'feuille' ? n.index : n.debut);
const fin = (n: NoeudArbre): number => (n.genre === 'feuille' ? n.index : n.fin - 1);

/** Les groupes d'un sous-arbre (lui compris s'il en est un), du haut vers le bas. */
const groupesDuSousArbre = (n: NoeudArbre): Groupe[] => (n.genre === 'feuille' ? [] : [n.groupe, ...n.enfants.flatMap(groupesDuSousArbre)]);

/** Le noeud sans parent : il devient une racine du contenu d'un masque. */
function sansParent<T extends { readonly parent?: string }>(x: T): T {
  if (x.parent === undefined) return x;
  const { parent: _p, ...reste } = x;
  void _p;
  return reste as T;
}

/**
 * Creer un masque : parmi les elements choisis (visibles et deverrouilles), le plus haut dans l'ordre de peinture (une forme, une
 * image ou un groupe entier) devient le contenu du masque, en luminance, peint comme il l'etait ; les autres sont reunis dans un groupe
 * nouveau qui le porte, a la place du plus haut d'entre eux (comme `grouper`). La region couvre le masque et ce qu'il masque. Rend le
 * dessin et l'identifiant du groupe, ou le meme dessin, null et la raison.
 */
export function creerMasque(d: DessinSvg, ids: readonly string[]): { dessin: DessinSvg; id: string | null; erreur?: string } {
  const a = arbreDe(d);
  const us = unites(d, ids)
    .flatMap(id => { const n = a.parId.get(id); return n ? [n] : []; })
    .filter(n => visibleEffectif(d, idDe(n)) && !verrouilleEffectif(d, idDe(n)))
    .sort((x, y) => debut(x) - debut(y));
  const haut = us.reduce<NoeudArbre | undefined>((h, n) => (h === undefined || fin(n) > fin(h) ? n : h), undefined);
  if (us.length < 2 || !haut) return { dessin: d, id: null, erreur: MSG_MASQUE.selection };
  const dessus = boiteVisuelle(d, idDe(haut));
  if (!dessus || !(dessus.l > 0) || !(dessus.h > 0)) return { dessin: d, id: null, erreur: MSG_MASQUE.vide };
  const region = unir(us.map(n => boiteVisuelle(d, idDe(n))));
  if (!region) return { dessin: d, id: null, erreur: MSG_MASQUE.selection };
  // Le contenu du masque : le sous-arbre du dessus, ses identifiants gardes (ils sont uniques dans tout le dessin, I1).
  const feuilles = haut.genre === 'feuille' ? [haut.forme] : d.formes.slice(haut.debut, haut.fin);
  const sous = groupesDuSousArbre(haut);
  const racine = idDe(haut);
  const formes = feuilles.map(f => (f.id === racine ? sansParent(f) : f));
  const contenu = normaliser<Contenu>(sous.length ? { formes, groupes: Object.fromEntries(sous.map(g => [g.id, g.id === racine ? sansParent(g) : g])) } : { formes });
  // Les autres se groupent d'abord (le numero du groupe nouveau tient compte de ceux du dessus), puis le dessus quitte le dessin ; un
  // groupe qu'il laisserait vide part avec lui.
  const r = grouper(d, us.filter(n => n !== haut).map(idDe));
  const g = r.id === null ? undefined : groupeDe(r.dessin, r.id);
  if (r.id === null || !g) return { dessin: d, id: null, erreur: MSG_MASQUE.selection };
  const partis = new Set(feuilles.map(f => f.id)), groupesPartis = new Set(sous.map(x => x.id));
  const restants = Object.fromEntries(Object.entries(r.dessin.groupes ?? {}).filter(([k]) => !groupesPartis.has(k)));
  const masque: Masque = { contenu, type: 'luminance', region };
  const sans = avecGroupes(r.dessin, r.dessin.formes.filter(f => !partis.has(f.id)), { ...restants, [r.id]: { ...g, masque } });
  return { dessin: normaliser(sans), id: r.id };
}

/**
 * Liberer le masque d'un groupe : le groupe le perd et reste ; le contenu du masque y revient au premier plan, sous ses identifiants,
 * peint comme il l'etait (ses groupes avec lui). Rend le dessin et les identifiants des elements rendus (feuilles et groupes du premier
 * niveau, dans l'ordre), ou le meme dessin, sans identifiant, et la raison.
 */
export function libererMasque(d: DessinSvg, id: string): { dessin: DessinSvg; ids: string[]; erreur?: string } {
  const g = groupeDe(d, id);
  if (!g?.masque) return { dessin: d, ids: [], erreur: MSG_MASQUE.aucun };
  const c = g.masque.contenu;
  const rendus = arbreDe(c).racine.map(idDe);
  const rendues = c.formes.map(f => (f.parent === undefined ? { ...f, parent: id } : f));
  const { masque: _m, ...nu } = g;
  void _m;
  const groupes: Record<string, Groupe> = { ...d.groupes, [id]: nu };
  for (const [k, x] of Object.entries(c.groupes ?? {})) groupes[k] = x.parent === undefined ? { ...x, parent: id } : x;
  // Au premier plan du groupe : juste apres sa derniere feuille.
  const n = arbreDe(d).parId.get(id);
  const apres = n ? fin(n) : d.formes.length - 1;
  const formes = d.formes.flatMap((f, i) => (i === apres ? [f, ...rendues] : [f]));
  return { dessin: normaliser(avecGroupes(d, formes, groupes)), ids: rendus };
}

// ---------------------------------------------------------------- inverser

/** La couleur complementaire d'un code #rrggbb ; null pour ce qui n'en est pas un. */
function complementaire(c: string): string | null {
  const rgb = /^#[0-9a-f]{6}$/i.test(c) ? lireHex(c) : null;
  return rgb ? versHex({ r: 255 - rgb.r, g: 255 - rgb.g, b: 255 - rgb.b }) : null;
}

/** Une peinture repeinte arret par arret ; null si elle ne se repeint pas (un motif, une couleur illisible). */
function repeindre(p: Peinture, couleur: (c: string) => string | null): Peinture | null {
  if (!estDegrade(p)) return null;
  const arrets = [];
  for (const x of p.arrets) { const c = couleur(x.couleur); if (c === null) return null; arrets.push({ ...x, couleur: c }); }
  return { ...p, arrets };
}

/** Une feuille repeinte (fond, trait, degrades, ombre) ; null si une de ses peintures ne se repeint pas. */
function repeindreFeuille(f: Forme, couleur: (c: string) => string | null): Forme | null {
  let x: Forme = f;
  for (const cote of ['remplissage', 'contour'] as const) {
    const champ = cote === 'remplissage' ? 'peintureRemplissage' : 'peintureContour';
    const p = x[champ];
    if (p) {
      const q = repeindre(p, couleur);
      if (!q || !estDegrade(q)) return null;
      x = { ...x, [champ]: q, [cote]: couleurDeRepli(q.arrets) };
    } else if (x[cote] !== null) {
      const c = couleur(x[cote] ?? '');
      if (c === null) return null;
      x = { ...x, [cote]: c };
    }
  }
  const ombre = x.effets?.ombre;
  if (ombre && x.effets) {
    const c = couleur(ombre.couleur);
    if (c === null) return null;
    x = { ...x, effets: { ...x.effets, ombre: { ...ombre, couleur: c } } };
  }
  return x;
}

/** Le rectangle d'une boite, en trace. */
const rectangle = (b: Boite): Forme['d'] => [
  { c: 'M', p: [b.x, b.y] }, { c: 'L', p: [b.x + b.l, b.y] }, { c: 'L', p: [b.x + b.l, b.y + b.h] }, { c: 'L', p: [b.x, b.y + b.h] }, { c: 'Z', p: [] }
];

/** Vrai si la feuille est le fond blanc d'un masque inverse : un quadrilatere blanc, plein, nu, dont la boite est la region. */
export function estFond(f: Forme | undefined, region: Boite): f is Forme {
  if (!f || f.parent !== undefined || !f.visible || f.remplissage !== '#ffffff' || f.contour !== null || f.opacite !== 1) return false;
  if (f.peintureRemplissage || f.effets || f.image || f.texte || f.opaciteRemplissage !== undefined) return false;
  if (f.d.length !== 5 || f.d.map(c => c.c).join('') !== 'MLLLZ') return false;
  const b = boiteChemin(f.d);
  const e = 1e-6 * Math.max(1, region.l, region.h);
  return !!b && Math.abs(b.x - region.x) <= e && Math.abs(b.y - region.y) <= e && Math.abs(b.l - region.l) <= e && Math.abs(b.h - region.h) <= e;
}

/**
 * Inverser le masque d'un groupe : ce qu'il cachait se voit, ce qu'il laissait voir se cache, dans sa region. Le resultat est un masque
 * de luminance ; inverser deux fois un masque de luminance le redonne. Rend le dessin, ou le meme dessin et la raison.
 */
export function inverserMasque(d: DessinSvg, id: string): { dessin: DessinSvg; erreur?: string } {
  const g = groupeDe(d, id);
  if (!g?.masque) return { dessin: d, erreur: MSG_MASQUE.aucun };
  const mq = g.masque, c = mq.contenu;
  if (c.formes.some(f => f.image)) return { dessin: d, erreur: MSG_MASQUE.image };
  const fond = mq.type === 'luminance' && estFond(c.formes[0], mq.region) ? c.formes[0] : undefined;
  // Un masque alpha : son contenu en noir (le complement du blanc qu'il vaut en luminance), a ses opacites.
  const couleur = mq.type === 'alpha' ? (): string => '#000000' : complementaire;
  const formes: Forme[] = [];
  for (const f of c.formes) {
    if (f === fond) continue;
    const x = repeindreFeuille(f, couleur);
    if (!x) return { dessin: d, erreur: MSG_MASQUE.couleur };
    formes.push(x);
  }
  if (!fond) {
    const nouveau: Forme = {
      id: 'f' + prochainNumero(d, 'f'), d: rectangle(mq.region), remplissage: '#ffffff', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false
    };
    formes.unshift(nouveau);
  }
  const contenu = normaliser<Contenu>(c.groupes ? { formes, groupes: c.groupes } : { formes });
  return { dessin: { ...d, groupes: { ...d.groupes, [id]: { ...g, masque: { contenu, type: 'luminance', region: mq.region } } } } };
}

// Les decoupes du modele v2 (ADR-0012, etape 5 ; annexe 1 §4, annexe 2 §2 et §5, annexe 5) : un `clip-path="url(#…)"` vers un
// <clipPath> devient `Groupe.decoupe`, dont le contenu est de la geometrie seule, dans le repere du plan (unites de boite,
// `transform` du <clipPath>, <use> deplie et `clip-rule` resolus a la lecture). Une feuille qui porte elle-meme une decoupe est
// enveloppee dans un groupe a elle, comme dans un logiciel de dessin. L'ecriture pose `clip-path` au rang de la decoupe et le
// <clipPath> dans <defs> sous un identifiant d'empreinte (`ed-c-…`, dedoublonne comme les degrades) ; une transformation du groupe
// emmene sa decoupe (regle de la fermeture) ; la boite visuelle d'un groupe est rognee par sa decoupe.
//
// Lecture (mode riche seulement : le mode plat ne consulte aucune fonctionnalite et refuse comme avant, « un masque ou une
// découpe »). Ce qu'un navigateur ignore est ignore ici aussi, et dit : une reference qui ne mene a aucun <clipPath>, un <g> ou
// une <image> dans un <clipPath>, un <use> qui n'y vise pas une forme. Ce qu'on ne sait pas reecrire est refuse en le nommant : une
// forme CSS (`circle()`), un renvoi a un autre fichier, un cycle, une imbrication au-dela de `PROFONDEUR_DEFS_MAX`, des contenus au-dela
// de `NOEUDS_DEFS_MAX`, une decoupe posee sur un <use>, un <symbol> ou le SVG entier.
//
// Les identifiants (un seul espace de numeros par dessin, contenus compris : annexe 1 §2, I1), la pile des definitions en cours, les
// places vides et le budget sont ceux de tout contenu de definition : `edition/contenus.ts`, partage avec les masques (etape 6).

import type { Noeud } from '../../../util/xml.js';
import type { ContexteEcriture, Fonctionnalite, Marche } from '../fonctionnalites.js';
import { RANG_GROUPE } from '../fonctionnalites.js';
import type { Contexte, Pret } from '../parcours.js';
import type { Boite, Chemin, Contenu, Decoupe, Forme, Groupe, Matrice } from '../types.js';
import { IDENTITE } from '../types.js';
import type { Proprietes } from '../ignores.js';
import { proprietesDe, type Analyse } from '../cascade.js';
import { heriter } from '../heritage.js';
import { boiteChemin, lireTransformation, multiplier, transformerChemin, unir } from '../geometrie.js';
import { cibleDe } from '../clones.js';
import { ecrireChemin } from '../chemins.js';
import { ancetres, visibleEffectif } from '../arbre.js';
import { lireReference, NOEUDS_DEFS_MAX, PROFONDEUR_DEFS_MAX } from '../resolution.js';
import type { Definition, Recueil } from '../definitions.js';
import {
  ancetresDe, boiteDescendants, boiteFeuille, etatContenus, FORMES, intersectionBoites, lireContenu, placeVide, reserverGroupe, type EtatContenus
} from '../contenus.js';

// ---------------------------------------------------------------- phrases

/** Ce que la lecture riche refuse en le nommant (apres « Ce SVG contient … », annexe 5 §1). */
export const REFUS_DECOUPES = {
  formeCss: 'une découpe par forme CSS',
  externe: 'une découpe ou un masque qui renvoie à un fichier extérieur',
  cycle: 'un cycle de découpes',
  profondeur: 'des découpes emboîtées sur plus de ' + PROFONDEUR_DEFS_MAX + ' niveaux',
  trop: 'des découpes trop lourdes (plus de ' + NOEUDS_DEFS_MAX.toLocaleString('fr-FR') + ' formes dans leurs définitions)',
  transformation: 'une découpe dont la transformation est illisible',
  porteur: 'une découpe posée sur un clone <use>, un symbole ou le SVG entier'
} as const;

/** Ce que la lecture riche dit perdre (`ignores`) : ce qu'un navigateur ignore aussi. */
export const MSG_DECOUPES = {
  absente: 'les découpes url(#…) qui ne renvoient à aucun <clipPath> (ignorées, comme dans un navigateur)',
  elements: 'des éléments de découpe qu’un navigateur ne lit pas (groupes, images, clones d’autre chose qu’une forme : ignorés)',
  boitePlate: 'les découpes en unités de boîte sur un objet sans largeur ou sans hauteur (rien n’est dessiné, comme dans un navigateur)'
} as const;

// ---------------------------------------------------------------- les feuilles d'une decoupe

/**
 * Une feuille de decoupe : de la geometrie et sa regle (`clip-rule`), rien d'autre. La peinture ne compte pas dans une decoupe ;
 * elle est fixee (un noir plein, sans trait) pour qu'une feuille de decoupe s'ecrive, se transforme et se garde toujours pareil.
 */
export function feuilleDeDecoupe(id: string, d: Chemin, regle: Forme['regle'], parent?: string, visible = true, verrouille = false): Forme {
  return { id, d, remplissage: '#000000', contour: null, epaisseur: 0, opacite: 1, regle, visible, verrouille, ...(parent !== undefined ? { parent } : {}) };
}

// ---------------------------------------------------------------- ce que la lecture retient

/** Les elements qui portent une decoupe, deja regardes, par lecture. */
const porteursLus = new WeakMap<object, Map<Noeud, boolean>>();
function porteursDe(marche: Marche): Map<Noeud, boolean> {
  let m = porteursLus.get(marche.parcours);
  if (!m) { m = new Map(); porteursLus.set(marche.parcours, m); }
  return m;
}

/** La valeur `clip-path` d'un element, ou null s'il n'en porte pas. */
function valeurDecoupe(pr: Proprietes): string | null {
  const v = (pr['clip-path'] ?? '').trim();
  return v === '' || v.toLowerCase() === 'none' ? null : v;
}

// ---------------------------------------------------------------- la regle d'une feuille de decoupe

const REGLE_STYLE = /(?:^|;)\s*clip-rule\s*:\s*([a-z]+)/i;
/** La `clip-rule` qu'un element declare (le style en ligne l'emporte sur l'attribut de presentation), ou undefined. */
function regleDeclaree(n: Noeud): Forme['regle'] | undefined {
  const v = (REGLE_STYLE.exec(n.attributs.style ?? '')?.[1] ?? n.attributs['clip-rule'] ?? '').trim().toLowerCase();
  return v === 'evenodd' || v === 'nonzero' ? v : undefined;
}
/** La premiere `clip-rule` declaree le long de ces elements (l'element, puis ce dont il herite) ; `nonzero` a defaut. */
const regleDe = (chaine: readonly Noeud[]): Forme['regle'] => {
  for (const n of chaine) { const r = regleDeclaree(n); if (r) return r; }
  return 'nonzero';
};

// ---------------------------------------------------------------- lecture d'une decoupe

/** Ce qu'un <clipPath> admet : des formes, du texte, des clones (SVG 1.1, 14.3.5). Le reste ne decoupe pas. */
const ADMIS = new Set([...FORMES, 'use', 'text']);
/** Ce qui ne se dessine jamais : rien n'est perdu a l'ignorer. */
const MUETS = new Set(['title', 'desc', 'metadata', 'animate', 'animateTransform', 'animateMotion', 'animateColor', 'set']);

/** Un <use> admis dans un <clipPath> : il vise une forme ou du texte (sinon un navigateur ne le compte pas). */
function cibleAdmise(a: Analyse, u: Noeud): Noeud | null | 'autre' {
  const c = cibleDe(u, a.ids);
  if (!('noeud' in c)) return null;
  return FORMES.has(c.noeud.nom) || c.noeud.nom === 'text' ? c.noeud : 'autre';
}

/**
 * La decoupe que designe une valeur `clip-path`, pour un element pose par `base` (sa matrice, la sienne comprise) et dont `boite`
 * donne la boite dans son repere ; null si la reference est ignoree, ou refusee (dit par `marche`).
 */
function lireDecoupe(valeur: string, base: Matrice, boite: () => Boite | null, profondeur: number, marche: Marche, etat: EtatContenus): Decoupe | null {
  const p = marche.parcours, a = p.analyse;
  const ref = lireReference(valeur);
  if (!ref) { marche.refuser(REFUS_DECOUPES.formeCss); return null; }
  if (ref.genre === 'externe') { marche.refuser(REFUS_DECOUPES.externe); return null; }
  const cible = a.ids.get(ref.id);
  if (!cible || cible.nom !== 'clipPath') { marche.ignorer(MSG_DECOUPES.absente); return null; }
  if (etat.actives.includes(cible)) { marche.refuser(REFUS_DECOUPES.cycle + ' (« #' + ref.id.slice(0, 40) + ' »)'); return null; }
  if (etat.actives.length >= PROFONDEUR_DEFS_MAX) { marche.refuser(REFUS_DECOUPES.profondeur); return null; }
  const t = cible.attributs.transform ? lireTransformation(cible.attributs.transform) : IDENTITE;
  if (!t) { marche.refuser(REFUS_DECOUPES.transformation); return null; }
  const repere = multiplier(base, t);
  let m = repere;
  if ((cible.attributs.clipPathUnits ?? '').trim() === 'objectBoundingBox') {
    const b = boite();
    if (!b || !(b.l > 0) || !(b.h > 0)) { marche.ignorer(MSG_DECOUPES.boitePlate); return { contenu: { formes: [] } }; }
    // Le `transform` du <clipPath> s'applique apres les unites de boite (comme Chromium et Firefox le calculent).
    m = multiplier(repere, [b.l, 0, 0, b.h, b.x, b.y]);
  }
  const table = p.groupes;
  if (!table) { marche.refuser('un masque ou une découpe'); return null; }
  const regles = new Map<string, Forme['regle']>();
  const lu = lireContenu(marche, etat, table, cible, locale => {
    // Une decoupe du <clipPath> lui-meme : le contenu entier est rogne par elle, donc range dans un groupe qui la porte.
    let parent: string | undefined;
    const propre = valeurDecoupe(proprietesDe(a, cible));
    if (propre) {
      const id = reserverGroupe(table, etat);
      const interne = lireDecoupe(propre, repere, boite, profondeur, marche, etat);
      if (interne) { locale.set(id, { id, visible: true, verrouille: false, decoupe: interne }); parent = id; }
    }
    // Les enfants heritent de l'endroit ou le <clipPath> est ecrit, pas de l'element qu'il decoupe.
    const chaine = ancetresDe(a, cible);
    const heritees = chaine.slice().reverse().reduce<Proprietes>((h, x) => heriter(h, proprietesDe(a, x)), {});
    const ctx: Contexte = { m, heritees, opacite: 1, profondeur, ...(parent !== undefined ? { parent } : {}) };
    for (const e of cible.enfants) {
      if (p.trop) break;
      if (!ADMIS.has(e.nom)) { if (!MUETS.has(e.nom)) marche.ignorer(MSG_DECOUPES.elements); continue; }
      const visee = e.nom === 'use' ? cibleAdmise(a, e) : null;
      if (visee === 'autre') { marche.ignorer(MSG_DECOUPES.elements); continue; }
      const i0 = p.formes.length;
      marche.visiter(e, ctx);
      // La regle d'un clone : celle de sa cible, sinon celle du <use> (dont le clone herite), puis celles du <clipPath> et des siens.
      const regle = regleDe([...(visee ? [visee] : []), e, ...chaine]);
      for (let i = i0; i < p.formes.length; i++) { const f = p.formes[i]; if (f && !regles.has(f.id)) regles.set(f.id, regle); }
    }
  }, REFUS_DECOUPES.trop);
  if (!lu) return null;
  // Les feuilles lues deviennent de la geometrie ; un groupe du contenu sans feuille est deja parti, et la table avec lui si elle se vide.
  const lues = lu.feuilles.map(f => feuilleDeDecoupe(f.id, f.d, regles.get(f.id) ?? 'nonzero', f.parent));
  return { contenu: lu.groupes.length ? { formes: lues, groupes: Object.fromEntries(lu.groupes) } : { formes: lues } };
}

/**
 * Vrai si un element en cours de lecture (un <use>, un <symbol>, la racine) porte une decoupe que la lecture ne sait pas garder. Un <svg>
 * imbrique n'en est pas : il devient un groupe qui garde la sienne (etape 13c) ; seule la racine n'a pas de parent.
 */
function porteurRefuse(marche: Marche): boolean {
  const p = marche.parcours, porteurs = porteursDe(marche);
  for (const n of p.actifs) {
    if (n.nom !== 'use' && n.nom !== 'symbol' && !(n.nom === 'svg' && !p.analyse.parents.has(n))) continue;
    let r = porteurs.get(n);
    if (r === undefined) { r = valeurDecoupe(proprietesDe(p.analyse, n)) !== null; porteurs.set(n, r); }
    if (r) return true;
  }
  return false;
}

/** Une feuille lue qui porte sa propre decoupe : enveloppee dans un groupe qui la porte (dans le contenu en cours de lecture). */
function completerFeuille(f: Forme, n: Noeud, pret: Pret, marche: Marche): Forme {
  if (porteurRefuse(marche)) { marche.refuser(REFUS_DECOUPES.porteur); return f; }
  const v = valeurDecoupe(pret.pr);
  if (!v) return f;
  const table = marche.parcours.groupes;
  if (!table) { marche.refuser('un masque ou une découpe'); return f; }
  const etat = etatContenus(marche);
  const id = reserverGroupe(table, etat);
  // La feuille a deja son numero (« taille + 1 ») mais n'est pas encore rangee : une place le lui garde le temps de lire sa decoupe,
  // dont les feuilles prennent les numeros suivants ; la place part ensuite, la feuille sera rangee par la marche.
  const formes = marche.parcours.formes, ici = formes.length;
  formes.push(placeVide(f.id));
  const decoupe = lireDecoupe(v, pret.m, () => boiteFeuille(f, n, pret, marche), pret.profondeur, marche, etat);
  if (formes[ici]?.id === f.id) formes.splice(ici, 1);
  if (!decoupe) return f;
  const cible = etat.tables[etat.tables.length - 1] ?? table;
  cible.set(id, { id, ...(f.parent !== undefined ? { parent: f.parent } : {}), visible: true, verrouille: false, decoupe });
  // Hors d'un contenu, le groupe prend sa place dans la table de la lecture : ce n'est plus une simple place.
  if (cible === table) etat.places.delete(id);
  return { ...f, parent: id };
}

/** Un groupe lu (<g>, <a>) qui porte une decoupe : il la garde. Le crochet est appele avant que ses enfants soient lus. */
function completerGroupe(g: Groupe, n: Noeud, pret: Pret, marche: Marche): Groupe {
  const v = valeurDecoupe(pret.pr);
  if (!v) return g;
  const etat = etatContenus(marche), avant = etat.enAttente;
  etat.enAttente = g.id;
  try {
    const decoupe = lireDecoupe(v, pret.m, () => boiteDescendants(marche.parcours.analyse, n, IDENTITE), pret.profondeur, marche, etat);
    return decoupe ? { ...g, decoupe } : g;
  } finally {
    etat.enAttente = avant;
  }
}

// ---------------------------------------------------------------- ecriture

/** Les decoupes des groupes ancetres d'une feuille dans un contenu, du plus exterieur au plus interieur. */
function decoupesAncetres(c: Contenu, f: Forme): Decoupe[] {
  if (!c.groupes) return [];
  const out: Decoupe[] = [];
  for (const id of ancetres(c, f.id)) { const d = c.groupes[id]?.decoupe; if (d) out.unshift(d); }
  return out;
}

/** Une definition de decoupe et celles qu'elle cite, dans l'ordre ou elles doivent etre posees (les dependances d'abord). */
interface DefinitionComposee { readonly definition: Definition; readonly dependances: readonly Definition[] }

/**
 * Le <clipPath> d'une decoupe, rognee en plus par `dehors` (des decoupes qui l'enveloppent) : ses feuilles visibles, chacune en
 * <path> avec sa regle et, si quelque chose la rogne encore, son propre `clip-path` (un <clipPath> n'admet pas de <g>, annexe 2 §5).
 */
function definitionDecoupe(dec: Decoupe, dehors: readonly Decoupe[], e: ContexteEcriture): DefinitionComposee {
  const c = dec.contenu, dependances: Definition[] = [];
  let enfants = '';
  for (const f of c.formes) {
    if (!f.d.length || !visibleEffectif(c, f.id)) continue;
    const ref = idDecoupe([...dehors, ...decoupesAncetres(c, f)], e, dependances);
    enfants += '<path d="' + ecrireChemin(f.d, e.precision) + '"' + (f.regle === 'evenodd' ? ' clip-rule="evenodd"' : '') + (ref ? ' clip-path="url(#' + ref + ')"' : '') + '/>';
  }
  return { definition: { genre: 'c', balise: 'clipPath', attributs: '', enfants }, dependances };
}

const memoDefinitions = new WeakMap<Decoupe, DefinitionComposee[]>();
const posees = new WeakMap<Recueil, Map<Definition, string>>();
function poser(r: Recueil, d: Definition): string {
  let t = posees.get(r);
  if (!t) { t = new Map(); posees.set(r, t); }
  let id = t.get(d);
  if (id === undefined) { id = r.poser(d); t.set(d, id); }
  return id;
}

/**
 * L'identifiant du <clipPath> qui vaut l'intersection de ces decoupes (de la plus exterieure a la plus interieure) ; null sans
 * decoupe. Une seule : sa definition, memorisee par precision avec celles qu'elle cite (reposees d'abord dans chaque recueil : une
 * ecriture suivante les ecrit aussi, et avant elle). Plusieurs : la plus interieure, dont chaque feuille est rognee par les autres ;
 * la relecture en fait une decoupe par feuille, qui se reecrit en ce meme texte (point fixe). `collecte` recoit, dans l'ordre, tout
 * ce qui a ete pose (pour la definition qui la cite).
 */
function idDecoupe(chaine: readonly Decoupe[], e: ContexteEcriture, collecte?: Definition[]): string | null {
  const dernier = chaine[chaine.length - 1];
  if (!dernier) return null;
  let x: DefinitionComposee | undefined;
  if (chaine.length > 1) x = definitionDecoupe(dernier, chaine.slice(0, -1), e);
  else {
    let t = memoDefinitions.get(dernier);
    if (!t) { t = []; memoDefinitions.set(dernier, t); }
    x = t[e.precision];
    if (!x) { x = definitionDecoupe(dernier, [], e); t[e.precision] = x; }
  }
  for (const d of x.dependances) poser(e.definitions, d);
  collecte?.push(...x.dependances, x.definition);
  return poser(e.definitions, x.definition);
}

// ---------------------------------------------------------------- transformation et boite

const estIdentite = (m: Matrice): boolean => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

/** Une decoupe transformee par `m` : ses feuilles, et les decoupes de ses groupes. */
export function transformerDecoupe(dec: Decoupe, m: Matrice): Decoupe {
  const c = dec.contenu;
  const formes = c.formes.map(f => ({ ...f, d: transformerChemin(f.d, m) }));
  if (!c.groupes) return { contenu: { formes } };
  const groupes: Record<string, Groupe> = {};
  for (const [id, g] of Object.entries(c.groupes)) groupes[id] = g.decoupe ? { ...g, decoupe: transformerDecoupe(g.decoupe, m) } : g;
  return { contenu: { formes, groupes } };
}

const memoBoites = new WeakMap<Decoupe, Boite | null>();
/** La boite d'une decoupe : l'union de ses feuilles visibles ; null si elle ne laisse rien voir. */
export function boiteDecoupe(dec: Decoupe): Boite | null {
  if (memoBoites.has(dec)) return memoBoites.get(dec) ?? null;
  const c = dec.contenu;
  const b = unir(c.formes.filter(f => visibleEffectif(c, f.id)).map(f => boiteChemin(f.d)));
  memoBoites.set(dec, b);
  return b;
}

export const decoupes: Fonctionnalite = {
  nom: 'decoupes',
  lecture: { prises: ['decoupe'], feuille: completerFeuille, groupe: completerGroupe },
  ecriture: {
    attributsGroupe(g, e) {
      if (!g.decoupe) return [];
      return [[RANG_GROUPE.decoupe, ' clip-path="url(#' + (idDecoupe([g.decoupe], e) ?? '') + ')"']];
    }
  },
  transformation: {
    groupe: (g, m) => (g.decoupe && !estIdentite(m) ? { ...g, decoupe: transformerDecoupe(g.decoupe, m) } : g)
  },
  etendue: {
    groupe: (g, b) => (g.decoupe ? intersectionBoites(b, boiteDecoupe(g.decoupe)) : b)
  }
};

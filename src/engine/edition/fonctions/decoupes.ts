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
// Les identifiants : un seul espace de numeros par dessin, contenus compris (annexe 1 §2, I1). Les feuilles d'une decoupe sont lues
// par la marche, donc numerotees a la suite des autres ; elles quittent ensuite la liste des formes et y laissent une place vide (un
// trace sans commande, que la lecture retire a la fin, comme toute forme vide) pour que la suite de la numerotation ne les reprenne
// pas. Les groupes d'un contenu (une decoupe elle-meme decoupee) reservent de meme leur numero dans la table des groupes, par une
// place sans feuille que `normaliser` retire.

import type { Noeud } from '../../../util/xml.js';
import type { ContexteEcriture, Fonctionnalite, Marche } from '../fonctionnalites.js';
import { RANG_GROUPE } from '../fonctionnalites.js';
import type { Contexte, Pret } from '../parcours.js';
import type { Boite, Chemin, Contenu, Decoupe, Forme, Groupe, Matrice } from '../types.js';
import { IDENTITE } from '../types.js';
import type { Proprietes } from '../ignores.js';
import { proprietesDe, type Analyse } from '../cascade.js';
import { heriter } from '../heritage.js';
import { boiteChemin, lireTransformation, multiplier, transformerChemin, translation, unir } from '../geometrie.js';
import { cheminDeForme } from '../elements.js';
import { cibleDe } from '../clones.js';
import { ecrireChemin } from '../chemins.js';
import { ancetres, visibleEffectif } from '../arbre.js';
import { lireReference, NOEUDS_DEFS_MAX, PROFONDEUR_DEFS_MAX } from '../resolution.js';
import type { Definition, Recueil } from '../definitions.js';

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

/** Une place vide laissee dans la liste des formes : elle garde son numero, et la lecture la retire a la fin (trace sans commande). */
const placeVide = (id: string): Forme => ({ id, d: [], remplissage: null, contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false });

// ---------------------------------------------------------------- ce que la lecture retient

/** Ce qui se retient par lecture. */
interface Etat {
  /** Les <clipPath> en cours de lecture, du plus exterieur au plus interieur : y revenir est un cycle. */
  readonly actives: Noeud[];
  /** Les tables des groupes des contenus en cours de lecture (une decoupe decoupee) ; vide hors d'un contenu. */
  readonly tables: Map<string, Groupe>[];
  /** Le numero du groupe que le lecteur des groupes est en train de poser (le crochet `groupe` est appele avant qu'il le range). */
  enAttente: string | undefined;
  /** Les feuilles et groupes lus dans toutes les decoupes (borne `NOEUDS_DEFS_MAX`). */
  noeuds: number;
  trop: boolean;
  /** Les elements qui portent une decoupe, deja regardes. */
  readonly porteurs: Map<Noeud, boolean>;
}
const etats = new WeakMap<object, Etat>();
function etatDe(marche: Marche): Etat {
  let e = etats.get(marche.parcours);
  if (!e) { e = { actives: [], tables: [], enAttente: undefined, noeuds: 0, trop: false, porteurs: new Map() }; etats.set(marche.parcours, e); }
  return e;
}

/** La valeur `clip-path` d'un element, ou null s'il n'en porte pas. */
function valeurDecoupe(pr: Proprietes): string | null {
  const v = (pr['clip-path'] ?? '').trim();
  return v === '' || v.toLowerCase() === 'none' ? null : v;
}

/**
 * Reserve un numero de groupe dans la table de la lecture, par une place sans feuille (que `normaliser` retire si rien ne la
 * reprend) : la table reste numerotee sans trou, et le lecteur des groupes, qui prend « taille + 1 », ne retombe jamais sur un numero
 * pris. Le groupe en attente (celui dont on lit la decoupe) a deja le sien.
 */
function reserverGroupe(table: Map<string, Groupe>, etat: Etat): string {
  let k = table.size + 1;
  while (table.has('g' + k) || 'g' + k === etat.enAttente) k++;
  const id = 'g' + k;
  table.set(id, { id, visible: true, verrouille: false });
  return id;
}

// ---------------------------------------------------------------- boites (unites de boite)

const FORMES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

/**
 * La boite des descendants d'un element (un groupe), dans son repere : ce que `objectBoundingBox` mesure. Les formes, les groupes et
 * les clones <use> d'une forme ou d'un groupe comptent ; le texte, les images et les symboles n'y entrent pas (une approximation,
 * rare : une decoupe en unites de boite sur un groupe qui n'en contient pas d'autre). Bornee : un groupe immense ne coute pas plus.
 */
function boiteDescendants(a: Analyse, n: Noeud, m: Matrice): Boite | null {
  let budget = 50_000;
  const vus = new Set<Noeud>();
  const boiteDe = (e: Noeud, me: Matrice, niveau: number): Boite | null => {
    if (--budget < 0 || niveau > 32) return null;
    if ((proprietesDe(a, e).display ?? '').trim() === 'none') return null;
    const t = e.attributs.transform ? lireTransformation(e.attributs.transform) : IDENTITE;
    if (!t) return null;
    const mt = multiplier(me, t);
    if (e.nom === 'g' || e.nom === 'a') return unir(e.enfants.map(x => boiteDe(x, mt, niveau + 1)));
    if (e.nom === 'use') {
      const c = cibleDe(e, a.ids);
      if (!('noeud' in c) || vus.has(c.noeud) || c.noeud.nom === 'symbol') return null;
      vus.add(c.noeud);
      const x = Number.parseFloat(e.attributs.x ?? '0'), y = Number.parseFloat(e.attributs.y ?? '0');
      const b = boiteDe(c.noeud, multiplier(mt, translation(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0)), niveau + 1);
      vus.delete(c.noeud);
      return b;
    }
    if (!FORMES.has(e.nom)) return null;
    const d = cheminDeForme(e);
    return d && d.length ? boiteChemin(transformerChemin(d, mt)) : null;
  };
  return unir(n.enfants.map(e => boiteDe(e, m, 0)));
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

/** L'element et ses ancetres, du plus proche au plus lointain (borne). */
function ancetresDe(a: Analyse, n: Noeud): Noeud[] {
  const out: Noeud[] = [];
  for (let x: Noeud | undefined = n; x && out.length < 256; x = a.parents.get(x)) out.push(x);
  return out;
}

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
function lireDecoupe(valeur: string, base: Matrice, boite: () => Boite | null, profondeur: number, marche: Marche, etat: Etat): Decoupe | null {
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
  etat.actives.push(cible);
  const locale = new Map<string, Groupe>();
  etat.tables.push(locale);
  const avant = p.formes.length;
  const regles = new Map<string, Forme['regle']>();
  try {
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
  } finally {
    etat.tables.pop();
    etat.actives.pop();
  }
  // Les feuilles lues quittent la liste des formes (leurs places restent, vides) et deviennent de la geometrie.
  const lues: Forme[] = [];
  for (let i = avant; i < p.formes.length; i++) {
    const f = p.formes[i];
    if (!f) continue;
    if (f.d.length) lues.push(feuilleDeDecoupe(f.id, f.d, regles.get(f.id) ?? 'nonzero', f.parent));
    p.formes[i] = placeVide(f.id);
  }
  // Un groupe du contenu sans feuille (une feuille vide, un contenu vide) part, et la table avec lui si elle se vide.
  const peuples = new Set<string>();
  for (const f of lues) for (let g = f.parent; g !== undefined && !peuples.has(g); g = locale.get(g)?.parent) peuples.add(g);
  const groupes = [...locale].filter(([id]) => peuples.has(id));
  etat.noeuds += lues.length + groupes.length;
  if (etat.noeuds > NOEUDS_DEFS_MAX) {
    if (!etat.trop) marche.refuser(REFUS_DECOUPES.trop);
    etat.trop = true;
    return null;
  }
  return { contenu: groupes.length ? { formes: lues, groupes: Object.fromEntries(groupes) } : { formes: lues } };
}

/** Vrai si un element en cours de lecture (un <use>, un <symbol>, la racine) porte une decoupe que la lecture ne sait pas garder. */
function porteurRefuse(marche: Marche, etat: Etat): boolean {
  const p = marche.parcours;
  for (const n of p.actifs) {
    if (n.nom !== 'use' && n.nom !== 'symbol' && n.nom !== 'svg') continue;
    let r = etat.porteurs.get(n);
    if (r === undefined) { r = valeurDecoupe(proprietesDe(p.analyse, n)) !== null; etat.porteurs.set(n, r); }
    if (r) return true;
  }
  return false;
}

/** La boite d'une feuille dans son repere (avant sa propre matrice, que `pret.m` porte deja) : une image par son cadre. */
function boiteFeuille(f: Forme, n: Noeud, pret: Pret, marche: Marche): Boite | null {
  if (f.image) return { x: f.image.x, y: f.image.y, l: f.image.l, h: f.image.h };
  return marche.boiteForme(n, { ...pret, m: IDENTITE });
}

/** Une feuille lue qui porte sa propre decoupe : enveloppee dans un groupe qui la porte (dans le contenu en cours de lecture). */
function completerFeuille(f: Forme, n: Noeud, pret: Pret, marche: Marche): Forme {
  const etat = etatDe(marche);
  if (porteurRefuse(marche, etat)) { marche.refuser(REFUS_DECOUPES.porteur); return f; }
  const v = valeurDecoupe(pret.pr);
  if (!v) return f;
  const table = marche.parcours.groupes;
  if (!table) { marche.refuser('un masque ou une découpe'); return f; }
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
  return { ...f, parent: id };
}

/** Un groupe lu (<g>, <a>) qui porte une decoupe : il la garde. Le crochet est appele avant que ses enfants soient lus. */
function completerGroupe(g: Groupe, n: Noeud, pret: Pret, marche: Marche): Groupe {
  const v = valeurDecoupe(pret.pr);
  if (!v) return g;
  const etat = etatDe(marche), avant = etat.enAttente;
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

/** L'intersection de deux boites ; vide, une boite sans largeur ni hauteur au bord de la premiere. */
function intersection(a: Boite, b: Boite | null): Boite {
  if (!b) return { x: a.x, y: a.y, l: 0, h: 0 };
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.l, b.x + b.l), y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 >= x0 && y1 >= y0 ? { x: x0, y: y0, l: x1 - x0, h: y1 - y0 } : { x: Math.min(Math.max(a.x, b.x), a.x + a.l), y: Math.min(Math.max(a.y, b.y), a.y + a.h), l: 0, h: 0 };
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
    groupe: (g, b) => (g.decoupe ? intersection(b, boiteDecoupe(g.decoupe)) : b)
  }
};

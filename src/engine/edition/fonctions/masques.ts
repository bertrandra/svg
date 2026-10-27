// Les masques d'opacite du modele v2 (ADR-0012, etape 6 ; annexe 1 §4, annexe 2 §2 et §5, annexe 5) : un `mask="url(#…)"` vers un
// <mask> devient `Groupe.masque`. Son contenu est un contenu ordinaire, PEINT (couleurs, opacites, degrades par leur fonctionnalite,
// images, groupes, effets), dans le repere du plan ; son type (luminance ou alpha, `mask-type`) et sa region (x, y, width, height,
// unites resolues) sont gardes. Une feuille qui porte un masque est enveloppee dans un groupe a elle, comme pour une decoupe.
// L'ecriture pose `mask` au rang du masque et le <mask> dans <defs> sous un identifiant d'empreinte (`ed-m-…`), toujours en unites du
// plan, la region toujours ecrite ; une transformation du groupe emmene son masque (contenu et region : regle de la fermeture) ; la
// boite visuelle d'un groupe masque est rognee par la region.
//
// Lecture (mode riche seulement : le mode plat ne consulte aucune fonctionnalite et refuse comme avant, « un masque ou une
// découpe »). Ce qu'un navigateur ignore est ignore ici aussi, et dit : une reference qui ne mene a aucun <mask>, une transformation
// posee sur le <mask> lui-meme (un <mask> n'en prend pas), un masque pose dans une decoupe (une decoupe ne garde que la geometrie).
// Ce qu'on ne sait pas reecrire est refuse en le nommant : un masque CSS (`mask-image`, `mask-mode`, `mask-composite`, `mask-border`,
// ou une valeur `mask` qui n'est pas un seul `url(#…)`), un renvoi a un autre fichier, un cycle, une imbrication au-dela de
// `PROFONDEUR_DEFS_MAX`, des contenus au-dela de `NOEUDS_DEFS_MAX` (budget commun avec les decoupes, `contenus.ts`). Un masque pose sur
// un <use>, un <symbol>, un texte lu en lettres ou le SVG entier est refuse par la marche, en disant ou (`refusHorsFeuille`, etape 7).
//
// La region : le modele la garde comme une boite du plan. Sous une rotation ou une inclinaison, le rectangle de la region devient un
// parallelogramme, que la boite enferme : rien ne change tant que le contenu du masque tient dans la region (hors de son contenu, un
// masque ne laisse rien voir), et la lecture le dit quand ce n'est pas le cas.

import type { Noeud } from '../../../util/xml.js';
import type { ContexteEcriture, Fonctionnalite, Marche, OutilsTransformation } from '../fonctionnalites.js';
import { RANG_GROUPE } from '../fonctionnalites.js';
import type { Contexte, Pret } from '../parcours.js';
import type { Boite, Contenu, Forme, Groupe, Masque, Matrice } from '../types.js';
import { IDENTITE } from '../types.js';
import type { Proprietes } from '../ignores.js';
import { proprietesDe } from '../cascade.js';
import { heriter } from '../heritage.js';
import { boiteChemin, facteur, multiplier, transformerChemin } from '../geometrie.js';
import { inverse } from '../clones.js';
import { normaliser } from '../arbre.js';
import { sansTexte } from '../texteVivant.js';
import { nb } from '../chemins.js';
import { COORDONNEE_MAX, coordonneeSaine } from '../limites.js';
import { lireLongueur, lireReference, NOEUDS_DEFS_MAX, PROFONDEUR_DEFS_MAX } from '../resolution.js';
import type { Definition } from '../definitions.js';
import {
  ancetresDe, boiteDescendants, boiteFeuille, etatContenus, intersectionBoites, lireContenu, placeVide, reserverGroupe, visiterSousBudget, type EtatContenus
} from '../contenus.js';
import { nombre, t } from '../../../util/i18n.js';

// ---------------------------------------------------------------- phrases

// Les phrases sont des accesseurs : traduites (et leurs nombres formates) dans la langue de l'interface au moment ou on les lit.

/** Ce que la lecture riche refuse en le nommant (apres « Ce SVG contient … », annexe 5 §1). */
export const REFUS_MASQUES = {
  get css(): string { return t('un masque CSS (mask-image…)'); },
  get externe(): string { return t('une découpe ou un masque qui renvoie à un fichier extérieur'); },
  get cycle(): string { return t('un cycle de masques'); },
  get profondeur(): string { return t('des masques emboîtés sur plus de {n} niveaux', { n: PROFONDEUR_DEFS_MAX }); },
  get trop(): string { return t('des masques trop lourds (plus de {n} formes dans leurs définitions)', { n: nombre(NOEUDS_DEFS_MAX) }); }
};

/** Ce que la lecture riche dit perdre (`ignores`). */
export const MSG_MASQUES = {
  get absente(): string { return t('les masques url(#…) qui ne renvoient à aucun <mask> (ignorés : la forme est dessinée sans)'); },
  get boitePlate(): string { return t('les masques en unités de boîte sur un objet sans largeur ou sans hauteur (rien n’est dessiné, comme dans un navigateur)'); },
  get transformation(): string { return t('une transformation posée sur un <mask> (ignorée, comme dans un navigateur)'); },
  get surMasque(): string { return t('une découpe, un masque, un filtre ou une opacité posés sur un <mask> lui-même (ignorés)'); },
  get dansDecoupe(): string { return t('des masques posés dans une découpe (ignorés, comme dans un navigateur : une découpe ne garde que la géométrie)'); },
  get unite(): string { return t('une longueur de masque dans une unité qui ne se calcule pas ici (sa valeur par défaut est prise)'); },
  get regionTournee(): string { return t('la région d’un masque tourné ou incliné, que son contenu dépasse (élargie au rectangle qui l’enferme)'); }
};

// ---------------------------------------------------------------- ce que porte un element

/** La valeur `mask` d'un element, ou null s'il n'en porte pas. */
function valeurMasque(pr: Proprietes): string | null {
  const v = (pr.mask ?? '').trim();
  return v === '' || v.toLowerCase() === 'none' ? null : v;
}

/** Les proprietes du masquage CSS (CSS Masking niveau 1) qu'un <mask> SVG ne dit pas : une image, une bordure, un mode, une composition. */
const CSS_IMAGE = /^(?:-webkit-)?mask-(?:image|border(?:-source)?|box-image(?:-source)?)$|^-webkit-mask$/;
const CSS_MODE = /^(?:-webkit-)?mask-(?:mode|composite|source-type)$/;
const NEUTRES = new Set(['none', 'initial', 'unset', 'revert', 'match-source', 'add', 'auto']);

/** Vrai si ces proprietes posent un masque CSS que la lecture ne sait pas garder. */
function masqueCss(pr: Proprietes): boolean {
  for (const [k, v] of Object.entries(pr)) {
    if (!CSS_IMAGE.test(k) && !CSS_MODE.test(k)) continue;
    if (!NEUTRES.has(v.trim().toLowerCase())) return true;
  }
  return false;
}

/** Les elements deja regardes (un masque CSS ?), par lecture. */
const regardes = new WeakMap<object, Map<Noeud, boolean>>();
/** Vrai si un element en cours de lecture (un groupe, un <use>, la racine…) pose un masque CSS. */
function masqueCssEnCours(marche: Marche): boolean {
  const p = marche.parcours;
  let vus = regardes.get(p);
  if (!vus) { vus = new Map(); regardes.set(p, vus); }
  for (const n of p.actifs) {
    let r = vus.get(n);
    if (r === undefined) { r = masqueCss(proprietesDe(p.analyse, n)); vus.set(n, r); }
    if (r) return true;
  }
  return false;
}

/** Vrai si la definition en cours de lecture est une decoupe : un masque n'y compte pas. */
const dansDecoupe = (etat: EtatContenus): boolean => etat.actives[etat.actives.length - 1]?.nom === 'clipPath';

// ---------------------------------------------------------------- la region

/** Une boite transformee : celle qui enferme ses quatre coins. */
function boiteSous(b: Boite, m: Matrice): Boite {
  const xs: number[] = [], ys: number[] = [];
  for (const [x, y] of [[b.x, b.y], [b.x + b.l, b.y], [b.x, b.y + b.h], [b.x + b.l, b.y + b.h]] as const) {
    xs.push(m[0] * x + m[2] * y + m[4]);
    ys.push(m[1] * x + m[3] * y + m[5]);
  }
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x: x0, y: y0, l: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

/** Vrai si la matrice garde les axes (ni rotation ni inclinaison, au quart de tour pres) : une boite reste une boite. */
const gardeLesAxes = (m: Matrice): boolean => (m[1] === 0 && m[2] === 0) || (m[0] === 0 && m[3] === 0);

/**
 * La region d'un <mask> dans le repere de l'element masque. En unites de boite (le defaut), chaque nombre ou pourcentage est une part
 * de la boite ; en unites du plan, un nombre est une coordonnee, un pourcentage une part du plan de travail. Les defauts : -10 %,
 * -10 %, 120 %, 120 %. Une largeur ou une hauteur negative ou nulle ne laisse rien voir.
 */
function regionLocale(cible: Noeud, b: Boite | null, plan: readonly [number, number, number, number], marche: Marche): Boite {
  const lire = (nom: 'x' | 'y' | 'width' | 'height', defaut: number, axe: number): number => {
    const v = lireLongueur(cible.attributs[nom]);
    if (v === 'unite') marche.ignorer(MSG_MASQUES.unite);
    if (v === null || v === 'unite') return b ? defaut : defaut * axe;
    return b || !v.part ? v.v : v.v * axe;
  };
  const fx = lire('x', -0.1, plan[2]), fy = lire('y', -0.1, plan[3]), fl = Math.max(0, lire('width', 1.2, plan[2])), fh = Math.max(0, lire('height', 1.2, plan[3]));
  return b ? { x: b.x + fx * b.l, y: b.y + fy * b.h, l: fl * b.l, h: fh * b.h } : { x: fx, y: fy, l: fl, h: fh };
}

/**
 * Vrai si le contenu tient dans la region locale portee par `m` : chaque feuille, ramenee dans le repere de la region (ses points de
 * controle enferment sa courbe), elargie de son trait. La boite du plan ne change alors rien a ce qui se voit.
 */
function contenuDansRegion(c: Contenu, local: Boite, m: Matrice): boolean {
  const inv = inverse(m);
  if (!inv) return false;
  const k = facteur(inv), marge = 1e-9 * Math.max(1, Math.abs(local.x), Math.abs(local.y), local.l, local.h);
  for (const f of c.formes) {
    const b = boiteChemin(transformerChemin(f.d, inv));
    if (!b) continue;
    const e = (f.contour !== null ? f.epaisseur * k : 0) - marge;
    if (b.x - e < local.x || b.y - e < local.y || b.x + b.l + e > local.x + local.l || b.y + b.h + e > local.y + local.h) return false;
  }
  return true;
}

// ---------------------------------------------------------------- lecture d'un masque

/** Le type d'un <mask> : `mask-type` (une regle ou le style l'emportent sur l'attribut de presentation), luminance par defaut. */
function typeDe(cible: Noeud, pr: Proprietes): Masque['type'] {
  return (pr['mask-type'] ?? cible.attributs['mask-type'] ?? '').trim().toLowerCase() === 'alpha' ? 'alpha' : 'luminance';
}

/** Les groupes d'un contenu dans l'ordre de leurs numeros : la table ne depend pas de l'ordre ou la lecture les a croises. */
const parNumero = (g: ReadonlyArray<readonly [string, Groupe]>): Array<readonly [string, Groupe]> =>
  [...g].sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)) || (a[0] < b[0] ? -1 : 1));

/**
 * Le masque que designe une valeur `mask`, pour un element pose par `base` (sa matrice, la sienne comprise) et dont `boite` donne la
 * boite dans son repere ; null si la reference est ignoree, ou refusee (dit par `marche`).
 */
function lireMasque(valeur: string, base: Matrice, boite: () => Boite | null, profondeur: number, marche: Marche, etat: EtatContenus): Masque | null {
  const p = marche.parcours, a = p.analyse;
  const ref = lireReference(valeur);
  // Une valeur `mask` qui n'est pas un seul `url(#…)` (une image CSS, plusieurs couches, une position) est un masque CSS.
  if (!ref || (ref.genre === 'locale' && ref.secours !== undefined)) { marche.refuser(REFUS_MASQUES.css); return null; }
  if (ref.genre === 'externe') { marche.refuser(REFUS_MASQUES.externe); return null; }
  const cible = a.ids.get(ref.id);
  if (!cible || cible.nom !== 'mask') { marche.ignorer(MSG_MASQUES.absente); return null; }
  if (etat.actives.includes(cible)) { marche.refuser(t('{refus} (« #{id} »)', { refus: REFUS_MASQUES.cycle, id: ref.id.slice(0, 40) })); return null; }
  if (etat.actives.length >= PROFONDEUR_DEFS_MAX) { marche.refuser(REFUS_MASQUES.profondeur); return null; }
  const pr = proprietesDe(a, cible);
  if (cible.attributs.transform !== undefined) marche.ignorer(MSG_MASQUES.transformation);
  if ([pr['clip-path'], pr.mask, pr.filter].some(v => v !== undefined && v.trim() !== '' && v.trim().toLowerCase() !== 'none') || (pr.opacity !== undefined && pr.opacity.trim() !== '1')) {
    marche.ignorer(MSG_MASQUES.surMasque);
  }
  const type = typeDe(cible, pr);
  const regionEnBoite = (cible.attributs.maskUnits ?? '').trim() !== 'userSpaceOnUse';
  const contenuEnBoite = (cible.attributs.maskContentUnits ?? '').trim() === 'objectBoundingBox';
  let b: Boite | null = null;
  if (regionEnBoite || contenuEnBoite) {
    b = boite();
    if (!b || !(b.l > 0) || !(b.h > 0)) {
      marche.ignorer(MSG_MASQUES.boitePlate);
      const o = boiteSous({ x: 0, y: 0, l: 0, h: 0 }, base);
      return { contenu: { formes: [] }, type, region: o };
    }
  }
  const local = regionLocale(cible, regionEnBoite ? b : null, p.plan, marche);
  const region = boiteSous(local, base);
  // Une region demesuree (1e309, ou une boite immense) ne s'ecrirait pas : refusee comme toute coordonnee hors bornes.
  if (![region.x, region.y, region.x + region.l, region.y + region.h].every(coordonneeSaine)) {
    marche.refuser(t('des coordonnées démesurées (au-delà de ± {max})', { max: nombre(COORDONNEE_MAX) }));
    return null;
  }
  const m = contenuEnBoite && b ? multiplier(base, [b.l, 0, 0, b.h, b.x, b.y]) : base;
  const table = p.groupes;
  if (!table) { marche.refuser(t('un masque ou une découpe')); return null; }
  // Les enfants heritent de l'endroit ou le <mask> est ecrit (le `fill="white"` de Figma et de Sketch), pas de l'element qu'il masque.
  const chaine = ancetresDe(a, cible);
  const heritees = chaine.slice().reverse().reduce<Proprietes>((h, x) => heriter(h, proprietesDe(a, x)), {});
  const ctx: Contexte = { m, heritees, opacite: 1, profondeur };
  const lu = lireContenu(marche, etat, table, cible, () => visiterSousBudget(marche, etat, cible.enfants, e => marche.visiter(e, ctx), REFUS_MASQUES.trop), REFUS_MASQUES.trop);
  if (!lu) return null;
  const contenu = normaliser<Contenu>(lu.groupes.length ? { formes: lu.feuilles, groupes: Object.fromEntries(parNumero(lu.groupes)) } : { formes: lu.feuilles });
  if (!gardeLesAxes(base) && !contenuDansRegion(contenu, local, base)) marche.ignorer(MSG_MASQUES.regionTournee);
  return { contenu, type, region };
}

/** Une feuille lue qui porte son propre masque : enveloppee dans un groupe qui le porte (dans le contenu en cours de lecture). */
function completerFeuille(f: Forme, n: Noeud, pret: Pret, marche: Marche): Forme {
  if (masqueCss(pret.pr) || masqueCssEnCours(marche)) { marche.refuser(REFUS_MASQUES.css); return f; }
  const v = valeurMasque(pret.pr);
  if (!v) return f;
  const etat = etatContenus(marche);
  if (dansDecoupe(etat)) { marche.ignorer(MSG_MASQUES.dansDecoupe); return f; }
  const table = marche.parcours.groupes;
  if (!table) { marche.refuser(t('un masque ou une découpe')); return f; }
  const id = reserverGroupe(table, etat);
  // La feuille a deja son numero mais n'est pas encore rangee : une place le lui garde le temps de lire son masque, dont les feuilles
  // et les groupes prennent les numeros suivants ; la place part ensuite, la feuille sera rangee par la marche.
  const formes = marche.parcours.formes, ici = formes.length;
  formes.push(placeVide(f.id));
  const masque = lireMasque(v, pret.m, () => boiteFeuille(f, n, pret, marche), pret.profondeur, marche, etat);
  if (formes[ici]?.id === f.id) formes.splice(ici, 1);
  if (!masque) return f;
  const cible = etat.tables[etat.tables.length - 1] ?? table;
  cible.set(id, { id, ...(f.parent !== undefined ? { parent: f.parent } : {}), visible: true, verrouille: false, masque });
  if (cible === table) etat.places.delete(id);
  return { ...f, parent: id };
}

/** Un groupe lu (<g>, <a>) qui porte un masque : il le garde. Le crochet est appele avant que ses enfants soient lus. */
function completerGroupe(g: Groupe, n: Noeud, pret: Pret, marche: Marche): Groupe {
  if (masqueCss(pret.pr)) { marche.refuser(REFUS_MASQUES.css); return g; }
  const v = valeurMasque(pret.pr);
  if (!v) return g;
  const table = marche.parcours.groupes;
  if (!table) { marche.refuser(t('un masque ou une découpe')); return g; }
  // Le groupe prend sa place dans la table avant que le contenu du masque soit lu : les <g> du masque prennent les numeros suivants
  // (le lecteur des groupes l'y range ensuite a la meme place).
  if (!table.has(g.id)) table.set(g.id, g);
  const masque = lireMasque(v, pret.m, () => boiteDescendants(marche.parcours.analyse, n, IDENTITE), pret.profondeur, marche, etatContenus(marche));
  return masque ? { ...g, masque } : g;
}

// ---------------------------------------------------------------- ecriture

/** Le <mask> d'un masque : toujours en unites du plan, la region toujours ecrite, le type alpha dit ; son contenu ecrit comme le dessin. */
function definitionMasque(mq: Masque, e: ContexteEcriture): Definition {
  const r = mq.region, p = e.precision;
  const attributs = ' maskUnits="userSpaceOnUse" x="' + nb(r.x, p) + '" y="' + nb(r.y, p) + '" width="' + nb(Math.max(0, r.l), p) + '" height="' + nb(Math.max(0, r.h), p) + '"'
    + (mq.type === 'alpha' ? ' style="mask-type:alpha"' : '');
  // Le contenu s'ecrit d'abord : ses propres definitions (degrades, decoupes, masques, filtres) se deposent avant le <mask> qui les cite.
  return { genre: 'm', balise: 'mask', attributs, enfants: e.contenu(enContours(mq.contenu)) };
}

/**
 * Le contenu d'un masque tel qu'il s'ecrit : ses textes vivants en contours (ADR-0012, etape 8). Le modele les garde vivants (liberer le
 * masque les rend retapables, le projet JSON les garde) ; le fichier n'en ecrit que les contours, sans `data-ed-*` : un masque est de la
 * luminance, et la specification de l'ecriture (`invariants.ts`) reste fermee aux attributs du texte vivant dans un <mask>. Le meme
 * contenu quand il n'a pas de texte.
 */
function enContours(c: Contenu): Contenu {
  return c.formes.some(f => f.texte) ? { ...c, formes: c.formes.map(sansTexte) } : c;
}

// ---------------------------------------------------------------- transformation et boite

const estIdentite = (m: Matrice): boolean => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

/**
 * Un masque transforme par `m` : ses feuilles et ses groupes par `outils` (toutes les fonctionnalites : un degrade, une image, un flou
 * du contenu suivent), sa region enfermee dans le rectangle de ses coins transformes.
 */
export function transformerMasque(mq: Masque, m: Matrice, outils: OutilsTransformation): Masque {
  const c = mq.contenu;
  const formes = c.formes.map(f => outils.feuille(f));
  let contenu: Contenu = { formes };
  if (c.groupes) {
    const groupes: Record<string, Groupe> = {};
    for (const [id, g] of Object.entries(c.groupes)) groupes[id] = outils.groupe(g);
    contenu = { formes, groupes };
  }
  return { contenu, type: mq.type, region: boiteSous(mq.region, m) };
}

export const masques: Fonctionnalite = {
  nom: 'masques',
  lecture: { prises: ['masque'], feuille: completerFeuille, groupe: completerGroupe },
  ecriture: {
    attributsGroupe(g, e) {
      if (!g.masque) return [];
      return [[RANG_GROUPE.masque, ' mask="url(#' + e.definitions.poser(definitionMasque(g.masque, e)) + ')"']];
    }
  },
  transformation: {
    groupe: (g, m, outils) => (g.masque && !estIdentite(m) ? { ...g, masque: transformerMasque(g.masque, m, outils) } : g)
  },
  etendue: {
    groupe: (g, b) => (g.masque ? intersectionBoites(b, g.masque.region) : b)
  }
};

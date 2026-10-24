// L'analyse d'un document SVG avant sa lecture (parents, identifiants, regles de ses feuilles <style>) et
// la cascade d'un element : les proprietes qu'il porte, une fois attributs, regles et `style` departages.
//
// L'ordre est celui de CSS : un attribut de presentation (`fill="red"`) pese moins que toute regle de feuille,
// qui pese moins que l'attribut `style` ; `!important` passe devant, un `style` important devant les regles
// importantes. Entre deux regles, la specificite decide, puis l'ordre de la feuille (la derniere gagne).
// Ni l'heritage ni les groupes ne sont ici : ce sont les proprietes PROPRES de l'element. Pur.

import type { Noeud } from '../../util/xml.js';
import { correspond } from './selecteurs.js';
import { lireDeclarations, lireFeuille, type Declaration, type Regle } from './feuille.js';
import { CONFRONTATIONS_MAX } from './limites.js';
import { MSG_FEUILLE_MEDIA, MSG_TRANSFORM_CSS, MSG_VARIABLES, textePeint, type Proprietes } from './ignores.js';

// Les attributs de presentation que la lecture sait porter ; `overflow` ne sert qu'au cadre d'un <symbol>.
const PROPRIETES = [
  'fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'display', 'visibility', 'clip-path', 'mask', 'filter',
  'color', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'marker-start', 'marker-mid', 'marker-end', 'overflow'
];

export interface Analyse {
  readonly parents: ReadonlyMap<Noeud, Noeud>;
  /** Le premier element de chaque identifiant, dans l'ordre du document (comme un navigateur). */
  readonly ids: ReadonlyMap<string, Noeud>;
  readonly regles: readonly Regle[];
  /** Les regles rangees par ce que vise leur dernier compose : un element ne regarde que celles qui peuvent le viser. */
  readonly index: IndexRegles;
  /** Le travail de confrontation fait jusqu'ici ; au-dela de `CONFRONTATIONS_MAX`, `depasse` passe a vrai et les regles ne sont plus lues. */
  readonly effort: { confrontations: number; depasse: boolean };
  /** Ce que la lecture a laisse tomber : la feuille d'abord, puis, au fil des elements, variables et `transform`. */
  readonly ignores: Set<string>;
  readonly cache: Map<Noeud, Proprietes>;
}

interface IndexRegles {
  readonly classes: ReadonlyMap<string, readonly Regle[]>;
  readonly ids: ReadonlyMap<string, readonly Regle[]>;
  readonly types: ReadonlyMap<string, readonly Regle[]>;
  /** Les regles dont le dernier compose n'a ni classe, ni identifiant, ni type (`*`, `[attribut]`, `:root`). */
  readonly autres: readonly Regle[];
}

/** Range les regles par leur dernier compose : une classe d'abord, sinon un identifiant, sinon un type, sinon « autres ». */
function indexer(regles: readonly Regle[]): IndexRegles {
  const classes = new Map<string, Regle[]>(), ids = new Map<string, Regle[]>(), types = new Map<string, Regle[]>(), autres: Regle[] = [];
  const ranger = (m: Map<string, Regle[]>, cle: string, r: Regle) => { const l = m.get(cle); if (l) l.push(r); else m.set(cle, [r]); };
  for (const r of regles) {
    const dernier = r.selecteur.parties[r.selecteur.parties.length - 1];
    const classe = dernier?.conditions.find(c => c.t === 'classe'), id = dernier?.conditions.find(c => c.t === 'id');
    if (classe) ranger(classes, classe.v, r);
    else if (id) ranger(ids, id.v, r);
    else if (dernier?.type) ranger(types, dernier.type, r);
    else autres.push(r);
  }
  return { classes, ids, types, autres };
}

/** Une feuille <style> n'est lue que si elle est du CSS et vaut pour un ecran (ou pour tous les medias). */
function feuilleLue(n: Noeud): 'oui' | 'media' | 'non' {
  const type = (n.attributs.type ?? '').trim().toLowerCase();
  if (type !== '' && type !== 'text/css') return 'non';
  const media = (n.attributs.media ?? '').trim().toLowerCase();
  return media === '' || media === 'all' || media === 'screen' ? 'oui' : 'media';
}

/** Les parents, les identifiants et les regles du document dont `racine` est l'element <svg>. */
export function analyser(racine: Noeud): Analyse {
  const parents = new Map<Noeud, Noeud>(), ids = new Map<string, Noeud>(), regles: Regle[] = [], ignores = new Set<string>();
  let ordre = 0;
  const marcher = (n: Noeud) => {
    const id = n.attributs.id;
    if (id !== undefined && !ids.has(id)) ids.set(id, n);
    if (n.nom === 'style') {
      const lue = feuilleLue(n);
      if (lue === 'media') { if (textePeint(n.texte)) ignores.add(MSG_FEUILLE_MEDIA); } else if (lue === 'oui') {
        const f = lireFeuille(n.texte, ordre);
        regles.push(...f.regles);
        f.ignores.forEach(m => ignores.add(m));
        ordre = f.suivant;
      }
    }
    for (const e of n.enfants) { parents.set(e, n); marcher(e); }
  };
  marcher(racine);
  return { parents, ids, regles, index: indexer(regles), effort: { confrontations: 0, depasse: false }, ignores, cache: new Map() };
}

const poser = (r: Proprietes, decls: readonly Declaration[], important: boolean) => {
  for (const d of decls) if (d.important === important) r[d.prop] = d.valeur;
};

/** Les regles qui visent l'element, de la moins a la plus forte (specificite, puis ordre dans la feuille). */
function reglesDe(a: Analyse, n: Noeud): Regle[] {
  if (!a.regles.length || a.effort.depasse) return [];
  const candidates: Regle[] = [...a.index.autres];
  const par = (m: ReadonlyMap<string, readonly Regle[]>, cle: string | undefined) => { const l = cle === undefined ? undefined : m.get(cle); if (l) candidates.push(...l); };
  par(a.index.ids, n.attributs.id);
  par(a.index.types, n.nom);
  for (const c of new Set((n.attributs.class ?? '').split(/\s+/))) par(a.index.classes, c);
  a.effort.confrontations += candidates.length;
  if (a.effort.confrontations > CONFRONTATIONS_MAX) { a.effort.depasse = true; return []; }
  return candidates.filter(r => correspond(r.selecteur, n, a.parents))
    .sort((x, y) => x.selecteur.specificite - y.selecteur.specificite || x.ordre - y.ordre);
}

/**
 * Les proprietes propres d'un element : attributs de presentation, puis regles, puis `style`, `!important`
 * en dernier. Une valeur `var(…)` n'est pas reprise (on ne resout pas les proprietes personnalisees) et
 * un `transform` de style non plus : l'un et l'autre sont dits, jamais devines.
 */
export function proprietesDe(a: Analyse, n: Noeud): Proprietes {
  const deja = a.cache.get(n);
  if (deja) return deja;
  const r: Proprietes = {};
  for (const p of PROPRIETES) { const v = n.attributs[p]; if (v !== undefined) r[p] = v; }
  const regles = reglesDe(a, n), enLigne = lireDeclarations(n.attributs.style ?? '');
  for (const regle of regles) poser(r, regle.declarations, false);
  poser(r, enLigne, false);
  for (const regle of regles) poser(r, regle.declarations, true);
  poser(r, enLigne, true);
  if (regles.some(g => g.declarations.some(d => d.prop === 'transform')) || enLigne.some(d => d.prop === 'transform')) a.ignores.add(MSG_TRANSFORM_CSS);
  for (const [k, v] of Object.entries(r)) {
    if (/var\s*\(/i.test(v)) { delete r[k]; a.ignores.add(MSG_VARIABLES); }
  }
  a.cache.set(n, r);
  return r;
}

// La descente des decoupes vers un dessin plat (ADR-0012, etape 5, annexe 5 §4) : ce qu'un exporteur qui ne sait pas rogner (PDF ecrit
// a la main, SVG de decoupe, DXF, EPS, fichiers de production, SVG « a plat ») recoit d'un groupe decoupe. Le REMPLISSAGE de chaque
// feuille est rogne exactement, par l'intersection booleenne de sa region avec celle de toutes les decoupes de ses ancetres
// (`polygon-clipping`, par les regions de `booleens.ts`) ; une feuille deja toute dedans ne change pas d'un octet. Un TRAIT n'est pas
// rogne (il le sera quand l'outil d'expansion de trait existera) : tout dedans, il reste ; tout dehors, il part ; a cheval, il est
// garde entier, en une feuille a part, et c'est dit. Les decoupes quittent ensuite les groupes, que la regle des groupes (la derniere)
// descend a son tour. Pure.

import clipping, { type MultiPolygon, type Pair } from 'polygon-clipping';
import { ancetres, boiteAvecTrait, prochainNumero, visibleEffectif, type Decoupe, type DessinSvg, type Forme, type Groupe } from '../editionSvg.js';
import { aireSignee, cheminDeRegion, cheminLisseDeRegion, regionDeChemin, toleranceBooleen } from '../booleens.js';
import type { RegleDescente } from '../aplatir.js';

/** Ce qui se dit a l'export (« Approché par ce format : … »). */
export const MSG_DESCENTE_DECOUPES = {
  rognees: 'les découpes (les formes pleines sont rognées à leur bord, les courbes rebâties)',
  traits: 'des traits sous une découpe (gardés entiers : ce format ne les rogne pas)'
} as const;

const aPropre = (o: object, cle: string): boolean => Object.prototype.hasOwnProperty.call(o, cle);
const VIDE: MultiPolygon = [];

/** L'aire d'une region (anneaux exterieurs moins trous). */
const aire = (r: MultiPolygon): number => r.reduce((s, poly) => s + poly.reduce((t, anneau, i) => t + (i ? -1 : 1) * Math.abs(aireSignee(anneau)), 0), 0);

const courbe = (f: Forme): boolean => f.d.some(c => c.c === 'C' || c.c === 'Q');

/** La region d'une decoupe : l'union de ses feuilles visibles, chacune rognee par les decoupes de ses groupes dans le contenu. */
export function regionDecoupe(dec: Decoupe, tolerance: number, memo: Map<Decoupe, MultiPolygon>): MultiPolygon {
  const deja = memo.get(dec);
  if (deja) return deja;
  const c = dec.contenu;
  const morceaux: MultiPolygon[] = [];
  for (const f of c.formes) {
    if (!f.d.length || !visibleEffectif(c, f.id)) continue;
    let r = regionDeChemin(f.d, f.regle, tolerance);
    for (const a of c.groupes ? ancetres(c, f.id) : []) {
      const interne = c.groupes && aPropre(c.groupes, a) ? c.groupes[a]?.decoupe : undefined;
      if (interne && r.length) r = clipping.intersection(r, regionDecoupe(interne, tolerance, memo));
    }
    if (r.length) morceaux.push(r);
  }
  const [premier, ...autres] = morceaux;
  const region = premier ? (autres.length ? clipping.union(premier, ...autres) : premier) : VIDE;
  memo.set(dec, region);
  return region;
}

/** Vrai si une decoupe ou ses contenus portent des courbes (le resultat se rebatit alors en courbes). */
export const decoupeCourbe = (dec: Decoupe): boolean =>
  dec.contenu.formes.some(courbe) || Object.values(dec.contenu.groupes ?? {}).some(g => !!g.decoupe && decoupeCourbe(g.decoupe));

/** Une boite en region. */
const regionBoite = (b: { x: number; y: number; l: number; h: number }): MultiPolygon => {
  const anneau: Pair[] = [[b.x, b.y], [b.x + b.l, b.y], [b.x + b.l, b.y + b.h], [b.x, b.y + b.h], [b.x, b.y]];
  return [[anneau]];
};

/** La feuille sans son trait (ni couleur, ni style de trait) : l'opacite du fond rejoint celle de la forme, comme a la lecture. */
function sansTrait(f: Forme): Forme {
  const { pointilles: _a, decalagePointilles: _b, bout: _c, jonction: _d, limiteMitre: _e, opaciteContour: _f, opaciteRemplissage, ...reste } = f;
  void _a; void _b; void _c; void _d; void _e; void _f;
  const o = Math.round(f.opacite * (opaciteRemplissage ?? 1) * 1000) / 1000;
  return { ...reste, contour: null, epaisseur: 0, opacite: o };
}

/** La feuille sans son fond. */
function sansFond(f: Forme): Forme {
  const { opaciteRemplissage: _o, texte: _t, ...reste } = f;
  void _o; void _t;
  return { ...reste, remplissage: null };
}

/** Le dessin sans decoupes : chaque feuille sous une decoupe rognee (fond) ou gardee (trait), les groupes sans leur decoupe. */
export function descendreDecoupes(d: DessinSvg): { readonly dessin: DessinSvg; readonly pertes: readonly string[] } {
  const table = d.groupes;
  if (!table || !Object.values(table).some(g => g.decoupe)) return { dessin: d, pertes: [] };
  const tolerance = toleranceBooleen(d), memo = new Map<Decoupe, MultiPolygon>();
  const groupe = (id: string): Groupe | undefined => (aPropre(table, id) ? table[id] : undefined);
  // La region qui rogne un groupe : celle de sa decoupe, rognee par celle de ses ancetres ; null si rien ne le rogne.
  const rognes = new Map<string, { readonly region: MultiPolygon; readonly courbe: boolean } | null>();
  const rogne = (id: string | undefined): { readonly region: MultiPolygon; readonly courbe: boolean } | null => {
    if (id === undefined) return null;
    if (rognes.has(id)) return rognes.get(id) ?? null;
    const g = groupe(id);
    rognes.set(id, null);
    const dessus = rogne(g?.parent);
    let r = dessus;
    if (g?.decoupe) {
      const propre = regionDecoupe(g.decoupe, tolerance, memo);
      r = { region: dessus ? (dessus.region.length && propre.length ? clipping.intersection(dessus.region, propre) : VIDE) : propre, courbe: (dessus?.courbe ?? false) || decoupeCourbe(g.decoupe) };
    }
    rognes.set(id, r);
    return r;
  };
  let suivant = prochainNumero(d, 'f'), rognees = false, traits = false;
  const formes = d.formes.flatMap((f): Forme[] => {
    const r = f.parent === undefined || f.image ? null : rogne(f.parent);
    if (!r || !f.visible || !visibleEffectif(d, f.id)) return [f];
    // Le fond : rogne s'il deborde (au-dela d'une aire de l'ordre de la tolerance), tel quel s'il est tout dedans.
    let fond: Forme | null = f.remplissage === null ? null : f;
    let fondRogne = false, sansAire = f.remplissage === null;
    if (f.remplissage !== null) {
      const region = regionDeChemin(f.d, f.regle, tolerance);
      sansAire = region.length === 0;
      const dehors = r.region.length ? clipping.difference(region, r.region) : region;
      const b = boiteAvecTrait(f);
      if (!r.region.length || aire(dehors) > tolerance * (b ? 2 * (b.l + b.h) : 1)) {
        fondRogne = true;
        const dedans = r.region.length && region.length ? clipping.intersection(region, r.region) : VIDE;
        const dc = courbe(f) || r.courbe ? cheminLisseDeRegion(dedans, tolerance) : cheminDeRegion(dedans);
        const { texte: _t, ...sansTexte } = sansTrait(f);
        void _t;
        fond = dc.length ? { ...sansTexte, d: dc, regle: 'nonzero' } : null;
      }
    }
    // Le trait : sa boite toute dedans, il reste ; sans rien en commun avec la decoupe, il part ; a cheval, il reste entier, et c'est dit.
    let trait: 'aucun' | 'dedans' | 'dehors' | 'cheval' = 'aucun';
    const bt = f.contour !== null && f.epaisseur > 0 ? boiteAvecTrait(f) : null;
    if (bt) {
      const rb = regionBoite(bt);
      const deborde = r.region.length ? aire(clipping.difference(rb, r.region)) > tolerance * 2 * (bt.l + bt.h) : true;
      const touche = r.region.length ? aire(clipping.intersection(rb, r.region)) > 0 : false;
      trait = !deborde ? 'dedans' : touche ? 'cheval' : 'dehors';
    }
    if (trait === 'cheval') traits = true;
    if (fondRogne && !sansAire) rognees = true;
    if (!fondRogne) {
      if (trait !== 'dehors') return [f];
      // Sans trait, un fond sans aire (une ligne) ne laisse rien.
      return sansAire ? [] : [sansTrait(f)];
    }
    if (trait === 'aucun' || trait === 'dehors') return fond ? [fond] : [];
    const seul = sansFond(f);
    return fond ? [fond, { ...seul, id: 'f' + suivant++ }] : [seul];
  });
  const groupes: Record<string, Groupe> = {};
  for (const [k, g] of Object.entries(table)) {
    if (!g.decoupe) { groupes[k] = g; continue; }
    const { decoupe: _d, ...nu } = g;
    void _d;
    groupes[k] = nu;
  }
  const pertes = [...(rognees ? [MSG_DESCENTE_DECOUPES.rognees] : []), ...(traits ? [MSG_DESCENTE_DECOUPES.traits] : [])];
  return { dessin: { ...d, formes, groupes }, pertes };
}

/**
 * La regle des decoupes, avant celle des groupes (qui lit encore leur table) : `natif` garde la decoupe (le PDF a l'etape 13) ;
 * `approche`, `raster` et `refus` rognent.
 */
export const descenteDecoupes: RegleDescente = {
  fonction: 'decoupes',
  descendre: (d, niveau) => (niveau === 'natif' ? { dessin: d, pertes: [] } : descendreDecoupes(d))
};

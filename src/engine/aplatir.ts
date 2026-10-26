// La descente d'un dessin riche vers un dessin plat (ADR-0012 §6, annexe 5 §4) : la SEULE porte par laquelle un exporteur qui ne
// sait pas tout (PDF, SVG de decoupe, DXF, EPS, fichiers de production) recoit un dessin. Un exporteur ne lit jamais `groupes` ni un
// champ v2 (un test d'architecture le garde) : il recoit un `DessinPlat` et la liste de ce qui a ete approche, a dire a l'export.
//
// Chaque fonctionnalite livre sa regle de descente avec elle (aucune etape ne fusionne sans), dans `engine/descente/<nom>.ts`, et
// l'inscrit par UNE ligne dans `REGLES_DESCENTE`. Elles vivent ici et non dans `edition/` parce qu'une decoupe se descend par les
// booleens (`booleens.ts` importe la facade d'`edition` : un cycle sinon). Un dessin plat passe par l'identite : le meme objet, sans
// cout et sans un octet de difference.

import { estPlat, visibleEffectif, type DessinSvg, type Forme } from './editionSvg.js';
import { degrades } from './descente/degrades.js';
import { images } from './descente/images.js';

/** Ce qu'un exporteur fait d'une fonction du modele : il la sait, il l'approche, il la rend en image, ou il la refuse. */
export type Niveau = 'natif' | 'approche' | 'raster' | 'refus';

/** Les fonctions du modele v2, telles qu'un exporteur les declare. */
export type FonctionV2 = 'groupes' | 'decoupes' | 'masques' | 'degrades' | 'motifs' | 'effets' | 'texte' | 'images';

/** Les capacites d'un exporteur, fonction par fonction (le tableau de l'annexe 5 §4). */
export type Capacites = Readonly<Record<FonctionV2, Niveau>>;

/**
 * Un dessin sans groupe ni champ v2, pret pour un exporteur. A l'etape 0, un simple alias de `DessinSvg` (les exporteurs le prennent
 * deja, rien d'autre ne change) ; l'etape 1 le verrouille par une marque de type, de sorte qu'un exporteur qui recoit un `DessinSvg`
 * sans passer par `aplatirPour` ne compile plus.
 */
export type DessinPlat = DessinSvg;

/** Un dessin descendu et ce qui a ete approche, en phrases a montrer a l'export (comme « courbes rebaties » des booleens). */
export interface Descente { readonly dessin: DessinPlat; readonly pertes: readonly string[] }

/** La regle d'une fonction : rend le dessin sans elle, au niveau que l'exporteur declare, et ce qu'elle a approche. */
export interface RegleDescente {
  readonly fonction: FonctionV2;
  descendre(d: DessinSvg, niveau: Niveau): { readonly dessin: DessinSvg; readonly pertes: readonly string[] };
}

/**
 * Les regles, dans l'ordre ou elles s'appliquent : une ligne par fonctionnalite, a sa place (les peintures et les effets avant les
 * decoupes et les masques, les groupes en dernier). Vide a l'etape 0.
 */
export const REGLES_DESCENTE: readonly RegleDescente[] = [
  degrades,
  images
];

/** Le SVG « a plat » (menu Fichier, des l'etape 2) : les octets du contrat d'avant le modele v2, le texte en contours. */
export const CAPACITES_PLAT: Capacites = {
  groupes: 'approche', decoupes: 'approche', masques: 'approche', degrades: 'approche', motifs: 'approche', effets: 'approche', texte: 'natif', images: 'approche'
};

const AUCUNE_PERTE: readonly string[] = [];

// Le filet : ce qu'aucune regle n'a descendu (une fonctionnalite livree sans la sienne, ce qui ne doit pas arriver) part quand meme,
// dit, pour que la promesse « un DessinPlat est plat » tienne toujours.
const FILET = {
  groupes: 'la structure et l’opacité des groupes (les formes sont gardées à plat)',
  peintures: 'les dégradés et les motifs (remplacés par une couleur unie)',
  effets: 'le flou et l’ombre portée',
  images: 'les images'
} as const;

function filet(d: DessinSvg): Descente {
  const pertes = new Set<string>();
  if (d.groupes) pertes.add(FILET.groupes);
  const formes: Forme[] = [];
  for (const f of d.formes) {
    if (f.image) { pertes.add(FILET.images); continue; }
    const { parent, peintureRemplissage, peintureContour, effets, image: _i, ...reste } = f;
    void _i;
    if (peintureRemplissage || peintureContour) pertes.add(FILET.peintures);
    if (effets) pertes.add(FILET.effets);
    // Un groupe masque masque ses formes : elles ne s'exportent pas, comme a l'enregistrement.
    formes.push(parent !== undefined && !visibleEffectif(d, f.id) ? { ...reste, visible: false } : reste);
  }
  const { groupes: _g, ...plan } = d;
  void _g;
  return { dessin: { ...plan, formes }, pertes: [...pertes] };
}

/**
 * Le dessin pour un exporteur de ces capacites. Plat : le meme objet, aucune perte. Sinon chaque regle descend sa fonction au niveau
 * declare, puis le filet retire ce qui resterait. Pur.
 */
export function aplatirPour(d: DessinSvg, capacites: Capacites, regles: readonly RegleDescente[] = REGLES_DESCENTE): Descente {
  if (estPlat(d)) return { dessin: d, pertes: AUCUNE_PERTE };
  let courant = d;
  const pertes: string[] = [];
  for (const r of regles) {
    const x = r.descendre(courant, capacites[r.fonction]);
    courant = x.dessin;
    for (const p of x.pertes) if (!pertes.includes(p)) pertes.push(p);
  }
  if (estPlat(courant)) return { dessin: courant, pertes };
  const reste = filet(courant);
  for (const p of reste.pertes) if (!pertes.includes(p)) pertes.push(p);
  return { dessin: reste.dessin, pertes };
}

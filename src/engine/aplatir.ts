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
import { descenteDecoupes } from './descente/decoupes.js';
import { descenteMasques } from './descente/masques.js';
import { effets } from './descente/effets.js';
import { descenteGroupes } from './descente/groupes.js';
import { sceneNative, type Scene } from './descente/scene.js';

export type { Scene, NoeudScene, FeuilleScene, ImageScene, PorteeScene, PeintureScene, DecoupeScene, MasqueScene } from './descente/scene.js';

/** Ce qu'un exporteur fait d'une fonction du modele : il la sait, il l'approche, il la rend en image, ou il la refuse. */
export type Niveau = 'natif' | 'approche' | 'raster' | 'refus';

/** Les fonctions du modele v2, telles qu'un exporteur les declare. */
export type FonctionV2 = 'groupes' | 'decoupes' | 'masques' | 'degrades' | 'motifs' | 'effets' | 'texte' | 'images';

/** Les capacites d'un exporteur, fonction par fonction (le tableau de l'annexe 5 §4). */
export type Capacites = Readonly<Record<FonctionV2, Niveau>>;

declare const plat: unique symbol;

/**
 * Un dessin sans groupe ni champ v2, pret pour un exporteur. Une marque de type (aucun champ a l'execution) verrouillee a l'etape 1 :
 * un exporteur qui recoit un `DessinSvg` sans passer par `aplatirPour` ne compile plus.
 */
export type DessinPlat = DessinSvg & { readonly [plat]: true };

/**
 * Un dessin descendu et ce qui a ete approche, en phrases a montrer a l'export (comme « courbes rebaties » des booleens) ; `perdus`
 * est la part de ces phrases qui ne s'exporte pas du tout (une image, un effet, un masque abandonnes), pour que l'export dise
 * « approché » ou « perdu » ; `scene`, ce que l'exporteur ecrit lui-meme (ses fonctions « natif », etape 13a), absente quand le
 * dessin n'en porte pas.
 */
export interface Descente { readonly dessin: DessinPlat; readonly pertes: readonly string[]; readonly perdus: readonly string[]; readonly scene?: Scene }

/**
 * La regle d'une fonction : rend le dessin sans elle, au niveau que l'exporteur declare, et ce qu'elle a approche ; `perdus`, parmi
 * ces phrases, celles de ce qui part tout a fait.
 */
export interface RegleDescente {
  readonly fonction: FonctionV2;
  descendre(d: DessinSvg, niveau: Niveau): { readonly dessin: DessinSvg; readonly pertes: readonly string[]; readonly perdus?: readonly string[] };
}

/**
 * Les regles, dans l'ordre ou elles s'appliquent : une ligne par fonctionnalite, a sa place (les peintures et les effets avant les
 * decoupes et les masques, les groupes en dernier). Groupes en dernier : les autres regles lisent encore les groupes.
 */
export const REGLES_DESCENTE: readonly RegleDescente[] = [
  degrades,
  images,
  descenteDecoupes,
  descenteMasques,
  effets,
  descenteGroupes
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
const FILET_PERDUS: readonly string[] = [FILET.effets, FILET.images];

function filet(d: DessinSvg): { readonly dessin: DessinSvg; readonly pertes: readonly string[] } {
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
 * declare, puis le filet retire ce qui resterait. Juste avant la regle des groupes (la derniere), ce que l'exporteur ecrit lui-meme
 * (ses fonctions « natif ») devient sa scene et quitte le dessin (`sceneNative`) ; rien de natif, pas de scene. Pur.
 */
export function aplatirPour(d: DessinSvg, capacites: Capacites, regles: readonly RegleDescente[] = REGLES_DESCENTE): Descente {
  if (estPlat(d)) return { dessin: d as DessinPlat, pertes: AUCUNE_PERTE, perdus: AUCUNE_PERTE };
  let courant = d, scene: Scene | undefined, vue = false;
  const pertes: string[] = [], perdus: string[] = [];
  const ajouter = (x: { readonly pertes: readonly string[]; readonly perdus?: readonly string[] }) => {
    for (const p of x.pertes) if (!pertes.includes(p)) pertes.push(p);
    for (const p of x.perdus ?? []) if (!perdus.includes(p)) perdus.push(p);
  };
  const natif = () => {
    vue = true;
    const s = sceneNative(courant, capacites, c => aplatirPour(c, capacites, regles));
    if (s) { scene = s.scene ?? undefined; courant = s.reste; ajouter(s); }
  };
  for (const r of regles) {
    if (r.fonction === 'groupes' && !vue) natif();
    const x = r.descendre(courant, capacites[r.fonction]);
    courant = x.dessin;
    ajouter(x);
  }
  if (!vue) natif();
  const fin = (dessin: DessinSvg): Descente => ({ dessin: dessin as DessinPlat, pertes, perdus, ...(scene ? { scene } : {}) });
  if (estPlat(courant)) return fin(courant);
  const reste = filet(courant);
  ajouter({ pertes: reste.pertes, perdus: reste.pertes.filter(p => FILET_PERDUS.includes(p)) });
  return fin(reste.dessin);
}

/**
 * La phrase des pertes a ajouter au message d'un export ; vide quand rien n'a ete approche (tout dessin plat). Ce qui est aussi dans
 * `perdus` se dit a part : approchee, la chose est dans le fichier, autrement ; perdue, elle n'y est pas.
 */
export const phrasePertes = (pertes: readonly string[], perdus: readonly string[] = []): string => {
  const approches = pertes.filter(p => !perdus.includes(p)), partis = pertes.filter(p => perdus.includes(p));
  return [
    ...(approches.length ? ['Approché par ce format : ' + approches.join(' ; ') + '.'] : []),
    ...(partis.length ? ['Perdu dans ce format : ' + partis.join(' ; ') + '.'] : [])
  ].join(' ');
};

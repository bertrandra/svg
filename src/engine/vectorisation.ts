// La vectorisation d'une image matricielle (ADR-0002) : ce que l'on demande au
// traceur, et ce que l'on garde de ce qu'il rend. Le traceur lui-meme (vtracer, en WebAssembly) vit
// cote io/ ; ici, seulement des reglages et du texte, purs : une meme image et un meme reglage
// donnent toujours le meme SVG.

/** Ce que la vectorisation cherche a garder de l'image. */
export type ModeVectorisation = 'aplats' | 'trait' | 'fidele';
export const MODES_VECTORISATION: readonly ModeVectorisation[] = ['aplats', 'trait', 'fidele'];

/** Le grain : `fine` garde les petits details, `lisse` les efface au profit de courbes franches. */
export type Finesse = 'fine' | 'normale' | 'lisse';
export const FINESSES: readonly Finesse[] = ['fine', 'normale', 'lisse'];

/** Le sous-ensemble des options de vtracer que l'on emploie. */
export interface OptionsTraceur {
  preset?: 'bw' | 'poster' | 'photo';
  clustering?: 'color-cluster' | 'bw';
  hierarchical?: 'stacked' | 'cutout';
  mode?: 'spline' | 'polygon';
  filterSpeckle?: number;
  colorPrecision?: number;
  layerDifference?: number;
  cornerThreshold?: number;
  simplify?: number;
  pathPrecision?: number;
  palette?: string[];
  maxColors?: number;
  adaptive?: boolean;
}

/** Le traceur : des pixels RGBA en entree, un SVG en sortie. Injecte : le WebAssembly au navigateur, le paquet Node aux tests. */
export type Traceur = (rgba: Uint8Array, largeur: number, hauteur: number, options: OptionsTraceur) => string;

/** Au-dela, une image vectorisee n'est plus un dessin : une photo tracee, lourde et sans interet. */
export const TRACES_MAX = 4000;

const GRAINS: Record<Finesse, { filterSpeckle: number; simplify?: number }> = {
  fine: { filterSpeckle: 2 },
  normale: { filterSpeckle: 4, simplify: 0.8 },
  lisse: { filterSpeckle: 8, simplify: 1.6 }
};

/**
 * Les options du traceur pour un mode et un grain. En `aplats`, la palette de l'image (les couleurs
 * extraites, huit au plus) est imposee : chaque forme prend exactement une couleur de l'image, sans
 * degrade parasite.
 */
export function optionsTraceur(mode: ModeVectorisation, finesse: Finesse, couleurs: readonly string[] = []): OptionsTraceur {
  const grain = GRAINS[finesse];
  const commun: OptionsTraceur = { mode: 'spline', hierarchical: 'stacked', pathPrecision: 2, filterSpeckle: grain.filterSpeckle, ...(grain.simplify ? { simplify: grain.simplify } : {}) };
  if (mode === 'trait') return { ...commun, clustering: 'bw', adaptive: true };
  if (mode === 'fidele') return { ...commun, preset: 'poster', colorPrecision: 7, layerDifference: 8 };
  const palette = couleurs.filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 8);
  return { ...commun, clustering: 'color-cluster', ...(palette.length ? { palette } : { maxColors: 8 }), colorPrecision: 6, layerDifference: 16, cornerThreshold: 60 };
}

/** Ce que le traceur rend, sans son en-tete XML ni son commentaire : le SVG seul, pret a nettoyer. */
export function svgDuTraceur(brut: string): string {
  const debut = brut.search(/<svg[\s>]/i);
  return (debut < 0 ? brut : brut.slice(debut)).replace(/<!--[\s\S]*?-->/g, '').trim();
}

export const compterTraces = (svg: string): number => (svg.match(/<path\b/gi) ?? []).length;

/**
 * Le meme SVG en contours seuls : chaque forme sans remplissage, filet fin d'epaisseur constante a
 * l'ecran. Une image vectorisee ressemble a l'image d'origine ; ses traces, eux, se voient ainsi. La
 * feuille de style l'emporte sur les attributs de presentation du traceur.
 */
export function svgContours(svg: string, couleur = '#0b6bcb'): string {
  const fin = svg.search(/<svg\b[^>]*>/i);
  if (fin < 0) return svg;
  const ouverture = svg.slice(fin).match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const style = '<style>*{fill:none!important;stroke:' + couleur + '!important;stroke-width:1px!important;vector-effect:non-scaling-stroke}</style>';
  const apres = fin + ouverture.length;
  return svg.slice(0, apres) + style + svg.slice(apres);
}

/**
 * Vrai s'il reste au moins un pixel opaque a tracer. Le traceur s'arrete en erreur sur une image
 * vide en mode couleur (vtracer 1.0.0-alpha.4) : on ne le lui demande jamais.
 */
export function aTracer(rgba: ArrayLike<number>, alphaMin = 128): boolean {
  for (let i = 3; i < rgba.length; i += 4) if ((rgba[i] ?? 0) >= alphaMin) return true;
  return false;
}

// Ce que la lecture laisse tomber sans refuser le SVG, et le dit : un rendu qui change a l'ouverture
// sans que personne le sache est pire qu'un refus. Les degrades, motifs, filtres, decoupes et masques
// n'ont pas leur place ici : une forme qui s'en sert est refusee avec son nom (lecture.ts), et une
// definition que rien n'utilise ne change aucun rendu. Ici, seulement ce qui est lu, ignore, et se voit.

export type Proprietes = Record<string, string>;

const A = {
  selecteurs: 'les règles de style qui ne visent pas une classe (balise, identifiant…)',
  marqueurs: 'les marqueurs des traits (pointes de flèche…)',
  pointilles: 'les pointillés (le trait s’écrit plein)',
  bouts: 'les bouts de trait arrondis ou carrés (ils s’écrivent plats)',
  jonctions: 'les jonctions de trait en pointe ou biseautées (elles s’écrivent arrondies)',
  racine: 'les couleurs et l’opacité posées sur la balise <svg> elle-même (elles ne se transmettent pas aux formes)',
  animations: 'les animations'
} as const;

export const ANIMATIONS = new Set(['animate', 'animateTransform', 'animateMotion', 'animateColor', 'set']);

/** Les proprietes de peinture qu'une regle de feuille peut poser : si elle n'en pose aucune, l'ignorer ne change rien. */
const PEINTURE = new Set([
  'fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'display', 'visibility',
  'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'marker', 'marker-start', 'marker-mid', 'marker-end'
]);

/** Vrai si une regle de feuille, ignoree faute de viser une classe, posait une propriete qui se voit. */
export const reglePeint = (decl: Proprietes): boolean => Object.keys(decl).some(k => PEINTURE.has(k));

export const MSG_SELECTEURS = A.selecteurs;
export const MSG_ANIMATIONS = A.animations;

/** Les marqueurs, quand la forme en porte (ils ne se dessinent pas). */
export function ignoresDeMarqueurs(h: Proprietes): string[] {
  const pose = (k: string) => { const v = (h[k] ?? '').trim(); return v !== '' && v !== 'none'; };
  return pose('marker') || pose('marker-start') || pose('marker-mid') || pose('marker-end') ? [A.marqueurs] : [];
}

/** Les particularites d'un trait que l'ecriture ne garde pas : pointilles, bouts, jonctions autres que ronde. */
export function ignoresDeTrait(h: Proprietes): string[] {
  const r: string[] = [];
  const tirets = (h['stroke-dasharray'] ?? '').trim().toLowerCase();
  // « 0 », « 0 0 » et « none » ne pointillent rien.
  if (tirets !== '' && tirets !== 'none' && !/^[0\s,.]*$/.test(tirets)) r.push(A.pointilles);
  const bout = (h['stroke-linecap'] ?? '').trim().toLowerCase();
  if (bout === 'round' || bout === 'square') r.push(A.bouts);
  const jonction = (h['stroke-linejoin'] ?? '').trim().toLowerCase();
  if (jonction !== '' && jonction !== 'round' && jonction !== 'inherit') r.push(A.jonctions);
  return r;
}

const PEINTURE_RACINE = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule'];

/** Les reglages de peinture poses sur la balise <svg> elle-meme : la lecture ne les transmet pas aux formes. */
export function ignoresDeRacine(pr: Proprietes): string[] {
  return PEINTURE_RACINE.some(k => pr[k] !== undefined && pr[k] !== 'inherit') ? [A.racine] : [];
}

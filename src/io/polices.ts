// Les fontes pour le texte en formes : neuf fontes libres (licence OFL) embarquees dans
// dist/polices.js, construit par scripts/polices.mjs et charge a la demande comme la bibliotheque,
// et toute fonte TTF ou OTF deposee par la personne. opentype.js lit la fonte ; le moteur ne voit
// qu'une interface `Glyphes`, pure.

import { parse, type Font } from 'opentype.js';
import type { Glyphes } from '../engine/texte.js';
import { annexePosee, fabriquerChargeurAnnexe, memoiserSucces, navigateur, type Annexe } from './annexes.js';
import { lireCrenageGpos } from './crenageGpos.js';
import { lireLigaturesGsub } from './ligaturesGsub.js';
import { glyphesTrait, validerTrait } from './policesTrait.js';
import { empreinteOctets, empreinteTexte } from '../util/empreinte.js';
import type { NaturePolice } from '../model/polices.js';

/** Une fonte de polices.js : une fonte TrueType en base64, ou une fonte a trait unique en donnees (policesTrait.ts). */
export type PoliceEmbarquee = { id: string; nom: string; base64: string } | { id: string; nom: string; nature: 'trait'; unitesParEm: number; avance: number; glyphes: unknown };
/**
 * Une fonte lue : ses glyphes, sa nature (a contour, ou a trait unique) et sa version, l'empreinte de ses octets (ADR-0021) :
 * un texte vivant la garde, pour dire a la relecture que la police a change depuis.
 */
export interface Police { id: string; nom: string; glyphes: Glyphes; nature: NaturePolice; version: string }

export const FICHIER_POLICES = 'polices.js';

const annexe: Annexe<PoliceEmbarquee[]> = {
  fichier: FICHIER_POLICES,
  globale: '__policesSvg',
  contenu: 'les polices',
  consigne: 'lancez « npm run construire »',
  valider: v => (Array.isArray(v) ? v as PoliceEmbarquee[] : undefined)
};
const embarquees = fabriquerChargeurAnnexe(annexe, navigateur);

/** Vrai quand polices.js est deja pose dans la page (l'outil Texte l'a charge, ou l'hote l'a inclus lui-meme). */
export const policesPosees = (): boolean => annexePosee(annexe);

function decoderBase64(b64: string): ArrayBuffer {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/**
 * L'interface pure du moteur, au-dessus d'une fonte lue. Avec les octets de la fonte, le crenage vient de
 * sa table GPOS (crenageGpos.ts), qu'opentype.js lit mal ; sans eux, ou si la fonte n'en porte pas, il
 * vient de la bibliotheque. Les ligatures viennent de sa table GSUB (ligaturesGsub.ts) : `ligature` n'existe
 * que si la fonte en porte au moins une, et une ligature est alors une glyphe comme une autre pour `contour`,
 * `avance` et `crenage`, appelees avec la chaine de ses caracteres (« fi »).
 */
export function glyphesDe(fonte: Font, octets?: ArrayBuffer): Glyphes {
  const cache = new Map<string, ReturnType<Font['charToGlyph']>>();
  const gpos = octets ? lireCrenageGpos(octets) : null;
  const liga = octets ? lireLigaturesGsub(octets) : null;
  const indices = (cars: readonly string[]) => cars.map(c => fonte.charToGlyph(c).index);
  const glyphe = (c: string) => {
    let g = cache.get(c);
    if (g) return g;
    const cars = [...c], lue = liga && cars.length > 1 ? liga.appliquer(indices(cars), 0) : null;
    // Une chaine de plusieurs caracteres n'est demandee que pour une ligature que `ligature` a annoncee.
    g = lue ? fonte.glyphs.get(lue.glyphe) : fonte.charToGlyph(c);
    cache.set(c, g);
    return g;
  };
  const bibliotheque = (a: string, b: string) => { try { return fonte.getKerningValue(glyphe(a), glyphe(b)) || 0; } catch { return 0; } };
  const ligature = (cars: readonly string[], debut: number): number => {
    if (!liga) return 0;
    const fenetre = cars.slice(debut, debut + liga.maxGlyphes);
    return liga.appliquer(indices(fenetre), 0)?.n ?? 0;
  };
  return {
    unitesParEm: fonte.unitsPerEm,
    contour: (c, x, y, taille) => glyphe(c).getPath(x, y, taille).commands,
    avance: c => glyphe(c).advanceWidth ?? fonte.unitsPerEm / 2,
    crenage: (a, b) => (gpos ? gpos(glyphe(a).index, glyphe(b).index) : bibliotheque(a, b)),
    possede: c => glyphe(c).index > 0,
    ...(liga ? { ligature } : {})
  };
}

/** Lit une fonte depuis ses octets ; rend null si elle ne se lit pas. */
export function lirePolice(id: string, nom: string, octets: ArrayBuffer): Police | null {
  try { return { id, nom, glyphes: glyphesDe(parse(octets), octets), nature: 'contour', version: empreinteOctets(new Uint8Array(octets)) }; } catch { return null; }
}

/** Une fonte de polices.js, lue ; null si elle ne se lit pas. */
function lireEmbarquee(p: PoliceEmbarquee): Police | null {
  if ('base64' in p) return lirePolice(p.id, p.nom, decoderBase64(p.base64));
  const donnees = validerTrait(p);
  return donnees ? { id: p.id, nom: p.nom, glyphes: glyphesTrait(donnees), nature: 'trait', version: empreinteTexte(JSON.stringify(donnees.glyphes)) } : null;
}

/** Les fontes embarquees, chargees une fois, a la demande. */
export const chargerPolices: () => Promise<Police[]> = memoiserSucces(async () =>
  (await embarquees.charger()).map(lireEmbarquee).filter((p): p is Police => p !== null)).charger;

/** Les fontes embarquees par identifiant : de quoi remplacer la police d'un texte lu (model/polices.ts). */
export async function fontesDeRemplacement(): Promise<ReadonlyMap<string, Glyphes>> {
  // Un texte lu d'un SVG ou d'un PDF se dessine en lettres pleines : une fonte a trait n'y remplace jamais rien.
  return new Map((await chargerPolices()).filter(p => p.nature === 'contour').map(p => [p.id, p.glyphes]));
}

/** Une fonte deposee par la personne (TTF ou OTF). */
export async function policeDeposee(fichier: File): Promise<Police | { erreur: string }> {
  const nom = fichier.name.replace(/\.(ttf|otf)$/i, '').slice(0, 60);
  const octets = await fichier.arrayBuffer();
  // L'identifiant d'une fonte deposee est son empreinte (`u-…`) : un texte vivant le garde, jamais le fichier (ADR-0021).
  const p = lirePolice('u-' + empreinteOctets(new Uint8Array(octets)), nom, octets);
  return p ?? { erreur: 'Cette fonte ne se lit pas : déposez un fichier TTF ou OTF.' };
}

// Les fontes deposees pendant la session : une fois lue, une fonte sert a tous les panneaux (creer un texte, le retaper,
// l'apercu) tant que la page est ouverte. Rien ne se garde au-dela : le fichier n'est jamais ecrit (ADR-0021).
const deposees: Police[] = [];

/** Retient une fonte deposee pour la session ; une fonte deja retenue (meme empreinte) ne se double pas. */
export function retenirDeposee(p: Police): void {
  if (!deposees.some(d => d.id === p.id)) deposees.push(p);
}

/** Les fontes embarquees, puis celles deposees pendant la session. */
export async function toutesLesPolices(): Promise<Police[]> {
  return [...(await chargerPolices()), ...deposees];
}

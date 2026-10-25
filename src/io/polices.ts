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
 * Une fonte lue : ses glyphes, sa nature (a contour, ou a trait unique) et sa version, l'empreinte de ses octets (ADR-0022) :
 * un texte vivant la garde, pour dire a la relecture que la police a change depuis.
 */
export interface Police { id: string; nom: string; glyphes: Glyphes; nature: NaturePolice; version: string }

export const FICHIER_POLICES = 'polices.js';

const annexe: Annexe<PoliceEmbarquee[]> = {
  fichier: FICHIER_POLICES,
  globale: '__policesSvg',
  contenu: 'les polices',
  consigne: 'lancez « npm run construire »',
  donnees: true,
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
  // L'identifiant d'une fonte deposee est son empreinte (`u-…`) : un texte vivant le garde, jamais le fichier (ADR-0022).
  const p = lirePolice('u-' + empreinteOctets(new Uint8Array(octets)), nom, octets);
  if (p) garderOctets(p.id, octets);
  return p ?? { erreur: 'Cette fonte ne se lit pas : déposez un fichier TTF ou OTF.' };
}

/** Une police de cet appareil, telle que le navigateur la decrit (Local Font Access) ; ses octets ne se lisent qu'au choix. */
export interface PoliceAppareil { readonly nom: string; readonly lire: () => Promise<ArrayBuffer> }

interface DonneesFonteAppareil { readonly fullName: string; readonly blob: () => Promise<Blob> }

/** Vrai quand le navigateur sait lister les polices de l'appareil (Local Font Access : Chromium seul, docs/navigateurs.md). */
export function policesAppareilDisponibles(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts === 'function';
}

/**
 * Les polices de l'appareil, sur un geste de la personne (le navigateur demande sa permission). Rien ne quitte l'appareil :
 * le fichier est lu sur place, comme une fonte deposee, et n'est jamais ecrit (ADR-0022, ADR-0025).
 */
export async function policesDeLAppareil(): Promise<PoliceAppareil[] | { erreur: string }> {
  if (!policesAppareilDisponibles()) return { erreur: 'Ce navigateur ne donne pas accès aux polices de l’appareil : déposez plutôt un fichier TTF ou OTF.' };
  try {
    const liste = await (window as unknown as { queryLocalFonts: () => Promise<DonneesFonteAppareil[]> }).queryLocalFonts();
    return liste.slice(0, 5000).map(f => ({ nom: String(f.fullName).slice(0, 60), lire: async () => (await f.blob()).arrayBuffer() }));
  } catch {
    return { erreur: 'Le navigateur a refusé l’accès aux polices de l’appareil.' };
  }
}

/** Une police de l'appareil, lue comme une fonte deposee (son identifiant est son empreinte). */
export async function lirePoliceAppareil(p: PoliceAppareil): Promise<Police | { erreur: string }> {
  try {
    const octets = await p.lire();
    const lue = lirePolice('u-' + empreinteOctets(new Uint8Array(octets)), p.nom, octets);
    if (lue) garderOctets(lue.id, octets);
    return lue ?? { erreur: 'Cette police de l’appareil ne se lit pas (format non pris en charge).' };
  } catch {
    return { erreur: 'Cette police de l’appareil ne se lit pas.' };
  }
}

// Les fontes deposees pendant la session (et celles du catalogue telechargees, ADR-0025) : une fois lue, une fonte sert a tous
// les panneaux (creer un texte, le retaper, l'apercu) tant que la page est ouverte. Rien ne se garde au-dela : le fichier n'est
// jamais ecrit (ADR-0022).
const deposees: Police[] = [];

/** Retient une fonte deposee pour la session ; une fonte deja retenue (meme empreinte) ne se double pas. */
export function retenirDeposee(p: Police): void {
  if (!deposees.some(d => d.id === p.id)) deposees.push(p);
}

// Les octets des fontes deposees pendant la session, par identifiant : rien ne les ecrit dans un SVG (ADR-0022), mais un hote qui
// garde des projets (le site, ADR-0030) les inclut dans le projet, pour qu'un texte rouvert se retape dans sa fonte.
const octetsDeposees = new Map<string, Uint8Array>();
const garderOctets = (id: string, octets: ArrayBuffer): void => { if (!octetsDeposees.has(id)) octetsDeposees.set(id, new Uint8Array(octets)); };

/** Les octets d'une fonte deposee pendant la session (ou relue d'un projet), ou null. */
export const octetsDeposee = (id: string): Uint8Array | null => octetsDeposees.get(id) ?? null;

/**
 * Une fonte deposee relue d'un projet (ADR-0030) : son identifiant doit etre l'empreinte de ses octets (un fichier change ne passe
 * pas pour un autre), elle doit se lire ; elle est alors retenue pour la session comme si on venait de la deposer. Null sinon.
 */
export function retenirFonteDuProjet(id: string, famille: string, octets: Uint8Array): Police | null {
  if (id !== 'u-' + empreinteOctets(octets)) return null;
  const tampon = octets.slice().buffer;
  const p = lirePolice(id, famille, tampon);
  if (!p) return null;
  garderOctets(id, tampon);
  retenirDeposee(p);
  return p;
}

/** Les fontes embarquees, puis celles deposees ou telechargees pendant la session. */
export async function toutesLesPolices(): Promise<Police[]> {
  return [...(await chargerPolices()), ...deposees];
}

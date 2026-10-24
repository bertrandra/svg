// Les fontes pour le texte en formes : neuf fontes libres (licence OFL) embarquees dans
// dist/polices.js, construit par scripts/polices.mjs et charge a la demande comme la bibliotheque,
// et toute fonte TTF ou OTF deposee par la personne. opentype.js lit la fonte ; le moteur ne voit
// qu'une interface `Glyphes`, pure.

import { parse, type Font } from 'opentype.js';
import type { Glyphes } from '../engine/texte.js';
import { fabriquerChargeurAnnexe, memoiserSucces, navigateur, type Annexe } from './annexes.js';
import { lireCrenageGpos } from './crenageGpos.js';

export interface PoliceEmbarquee { id: string; nom: string; base64: string }
export interface Police { id: string; nom: string; glyphes: Glyphes }

export const FICHIER_POLICES = 'polices.js';

const annexe: Annexe<PoliceEmbarquee[]> = {
  fichier: FICHIER_POLICES,
  globale: '__policesSvg',
  contenu: 'les polices',
  consigne: 'lancez « npm run construire »',
  valider: v => (Array.isArray(v) ? v as PoliceEmbarquee[] : undefined)
};
const embarquees = fabriquerChargeurAnnexe(annexe, navigateur);

function decoderBase64(b64: string): ArrayBuffer {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/**
 * L'interface pure du moteur, au-dessus d'une fonte lue. Avec les octets de la fonte, le crenage vient de
 * sa table GPOS (crenageGpos.ts), qu'opentype.js lit mal ; sans eux, ou si la fonte n'en porte pas, il
 * vient de la bibliotheque.
 */
export function glyphesDe(fonte: Font, octets?: ArrayBuffer): Glyphes {
  const cache = new Map<string, ReturnType<Font['charToGlyph']>>();
  const glyphe = (c: string) => { let g = cache.get(c); if (!g) { g = fonte.charToGlyph(c); cache.set(c, g); } return g; };
  const gpos = octets ? lireCrenageGpos(octets) : null;
  const bibliotheque = (a: string, b: string) => { try { return fonte.getKerningValue(glyphe(a), glyphe(b)) || 0; } catch { return 0; } };
  return {
    unitesParEm: fonte.unitsPerEm,
    contour: (c, x, y, taille) => glyphe(c).getPath(x, y, taille).commands,
    avance: c => glyphe(c).advanceWidth ?? fonte.unitsPerEm / 2,
    crenage: (a, b) => (gpos ? gpos(glyphe(a).index, glyphe(b).index) : bibliotheque(a, b))
  };
}

/** Lit une fonte depuis ses octets ; rend null si elle ne se lit pas. */
export function lirePolice(id: string, nom: string, octets: ArrayBuffer): Police | null {
  try { return { id, nom, glyphes: glyphesDe(parse(octets), octets) }; } catch { return null; }
}

/** Les fontes embarquees, chargees une fois, a la demande. */
export const chargerPolices: () => Promise<Police[]> = memoiserSucces(async () =>
  (await embarquees.charger()).map(p => lirePolice(p.id, p.nom, decoderBase64(p.base64))).filter((p): p is Police => p !== null)).charger;

/** Une fonte deposee par la personne (TTF ou OTF). */
export async function policeDeposee(fichier: File): Promise<Police | { erreur: string }> {
  const nom = fichier.name.replace(/\.(ttf|otf)$/i, '');
  const p = lirePolice('deposee-' + nom, nom, await fichier.arrayBuffer());
  return p ?? { erreur: 'Cette fonte ne se lit pas : déposez un fichier TTF ou OTF.' };
}

// Les fontes a trait unique (ADR-0022) : des glyphes en donnees (scripts/polices.mjs les tire d'une police SVG), chacun
// un ou plusieurs traces OUVERTS, la course d'une plume. Ce module en fait l'interface `Glyphes` du moteur, comme
// polices.ts le fait d'une fonte TrueType : le moteur compose une police a trait comme une autre, et ses traces restent
// ouverts (aucun Z n'est ajoute ; un trace qui revient a son depart, un « O », se ferme comme n'importe quel contour).

import type { CommandeGlyphe, Glyphes } from '../engine/texte.js';

/** Une fonte a trait telle que polices.js la porte : l'em, l'avance par defaut, et par caractere [caractere, avance, trace]. */
export interface DonneesTrait {
  readonly unitesParEm: number;
  readonly avance: number;
  readonly glyphes: ReadonlyArray<readonly [string, number, string]>;
}

/** Des donnees de fonte a trait bien formees, ou null : polices.js vient d'un fichier, on ne le croit pas sur parole. */
export function validerTrait(v: unknown): DonneesTrait | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const ok = typeof o.unitesParEm === 'number' && o.unitesParEm > 0 && typeof o.avance === 'number' && Array.isArray(o.glyphes)
    && o.glyphes.every(g => Array.isArray(g) && g.length === 3 && typeof g[0] === 'string' && typeof g[1] === 'number' && typeof g[2] === 'string');
  return ok ? (o as unknown as DonneesTrait) : null;
}

/** Les commandes d'un trace de police SVG (M, L, C, Q en absolu ; Y vers le haut), en unites de la fonte. */
function lireTrace(d: string): Array<{ c: 'M' | 'L' | 'C' | 'Q'; p: number[] }> {
  const out: Array<{ c: 'M' | 'L' | 'C' | 'Q'; p: number[] }> = [];
  const taille = { M: 2, L: 2, C: 6, Q: 4 } as const;
  let lettre: 'M' | 'L' | 'C' | 'Q' | null = null, nombres: number[] = [];
  const vider = () => {
    if (!lettre) return;
    const n = taille[lettre];
    for (let i = 0; i + n <= nombres.length; i += n) out.push({ c: i > 0 && lettre === 'M' ? 'L' : lettre, p: nombres.slice(i, i + n) });
  };
  for (const jeton of d.match(/[MLCQ]|-?\d*\.?\d+(?:e[+-]?\d+)?/gi) ?? []) {
    if (/^[MLCQ]$/i.test(jeton)) { vider(); lettre = jeton.toUpperCase() as 'M' | 'L' | 'C' | 'Q'; nombres = []; } else nombres.push(Number(jeton));
  }
  vider();
  return out;
}

/**
 * L'apostrophe typographique (U+2019) n'a pas de glyphe dans ces polices : elle s'ecrit avec l'apostrophe droite, qui en a un ; de
 * meme les guillemets simples et les espaces insecables. Les caracteres sont donnes par leur code : ce sont des donnees, pas un
 * texte de l'interface, et le compte des textes francais hors `t` ne doit pas les voir (ADR-0042).
 */
const EQUIVALENTS: Readonly<Record<string, string>> = Object.fromEntries(
  ([[0x2019, "'"], [0x2018, "'"], [0x201a, ','], [0x00a0, ' '], [0x202f, ' ']] as const).map(([code, remplacant]) => [String.fromCharCode(code), remplacant])
);

/** L'interface `Glyphes` d'une fonte a trait : contours ouverts, avances de la police, aucun crenage. */
export function glyphesTrait(donnees: DonneesTrait): Glyphes {
  const parCaractere = new Map(donnees.glyphes.map(([c, avance, d]) => [c, { avance, trace: lireTrace(d) }]));
  const glyphe = (c: string) => parCaractere.get(EQUIVALENTS[c] ?? c);
  return {
    unitesParEm: donnees.unitesParEm,
    contour: (c, x, y, taille): CommandeGlyphe[] => {
      const g = glyphe(c), k = taille / donnees.unitesParEm;
      if (!g) return [];
      const pt = (p: readonly number[], i: number): { x: number; y: number } => ({ x: x + (p[i] ?? 0) * k, y: y - (p[i + 1] ?? 0) * k });
      return g.trace.map((t): CommandeGlyphe => {
        if (t.c === 'C') { const a = pt(t.p, 0), b = pt(t.p, 2), e = pt(t.p, 4); return { type: 'C', x1: a.x, y1: a.y, x2: b.x, y2: b.y, x: e.x, y: e.y }; }
        if (t.c === 'Q') { const a = pt(t.p, 0), e = pt(t.p, 2); return { type: 'Q', x1: a.x, y1: a.y, x: e.x, y: e.y }; }
        return { type: t.c, ...pt(t.p, 0) };
      });
    },
    avance: c => glyphe(c)?.avance ?? donnees.avance,
    crenage: () => 0,
    possede: c => glyphe(c) !== undefined
  };
}

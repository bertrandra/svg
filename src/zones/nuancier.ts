// Lire un nuancier tape a la main : une teinte par ligne ou separee par des virgules, « #rrggbb »
// seul ou precede d'un nom (« Rouge #c81e28 », « Rouge : #c81e28 »). Ce qui ne se lit pas est passe.

import type { Teinte } from './EditeurSvg.js';

export function lireNuancier(texte: string): Teinte[] {
  const vus = new Set<string>(), r: Teinte[] = [];
  for (const morceau of texte.split(/[\n,;]+/)) {
    const m = /^\s*([^#]*?)\s*[:=]?\s*#([0-9a-f]{6}|[0-9a-f]{3})\b\s*$/i.exec(morceau);
    if (!m) continue;
    const brut = (m[2] ?? '').toLowerCase();
    const hex = '#' + (brut.length === 3 ? brut.split('').map(c => c + c).join('') : brut);
    if (vus.has(hex)) continue;
    vus.add(hex);
    r.push({ nom: (m[1] ?? '').trim() || hex, hex });
  }
  return r;
}

/** Le nuancier tel qu'on le retape : une teinte par ligne. */
export const ecrireNuancier = (t: readonly Teinte[]): string => t.map(x => (x.nom === x.hex ? x.hex : x.nom + ' ' + x.hex)).join('\n');

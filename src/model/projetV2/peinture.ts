// Une peinture non unie dans le projet JSON (ADR-0012, etape 3 ; ADR-0030) : un degrade lineaire ou radial, champ pour champ comme
// le modele (`Degrade`, engine/edition/types.ts), a pleine precision. Un motif y entrera a l'etape 9 ; d'ici la, il est refuse en le
// nommant. Pur ; chaque valeur est bornee, et un projet valide se reconstruit dans un ordre de champs fixe.

import type { OutilsProjet } from './champs.js';

/** Les arrets d'un degrade, au plus : la borne de la lecture d'un SVG (engine/edition/degrades.ts, `ARRETS_MAX`). */
export const ARRETS_PROJET_MAX = 64;

export interface ArretProjet { readonly position: number; readonly couleur: string; readonly opacite?: number }

interface CommunProjet {
  readonly arrets: readonly ArretProjet[];
  readonly matrice?: readonly [number, number, number, number, number, number];
  readonly etalement?: 'reflect' | 'repeat';
}
export interface LineaireProjet extends CommunProjet { readonly genre: 'lineaire'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
export interface RadialProjet extends CommunProjet {
  readonly genre: 'radial'; readonly cx: number; readonly cy: number; readonly r: number;
  readonly fx?: number; readonly fy?: number; readonly fr?: number;
}
export type PeintureProjet = LineaireProjet | RadialProjet;

const HEX = /^#[0-9a-f]{6}$/;

function lireArrets(v: unknown, o: OutilsProjet, quoi: string): readonly ArretProjet[] {
  const t = o.tableau(v, 'les arrêts de ' + quoi, ARRETS_PROJET_MAX);
  if (t.length < 2) o.refuser('les arrêts de ' + quoi + ' sont moins de deux');
  let avant = 0;
  return t.map(x => {
    const a = o.objet(x, 'un arrêt de ' + quoi);
    const position = o.nombre(a['position'], 'la position d’un arrêt', 0, 1);
    if (position < avant) o.refuser('les arrêts de ' + quoi + ' reculent');
    avant = position;
    const couleur = o.texte(a['couleur'], 'la couleur d’un arrêt', 7);
    if (!HEX.test(couleur)) o.refuser('la couleur d’un arrêt n’est pas un code #rrggbb');
    return { position, couleur, ...(a['opacite'] !== undefined ? { opacite: o.nombre(a['opacite'], 'l’opacité d’un arrêt', 0, 1) } : {}) };
  });
}

function lireMatrice(v: unknown, o: OutilsProjet, quoi: string): readonly [number, number, number, number, number, number] {
  const t = o.tableau(v, 'la matrice de ' + quoi, 6);
  if (t.length !== 6) o.refuser('la matrice de ' + quoi + ' n’a pas six valeurs');
  return t.map(x => o.nombre(x, 'la matrice de ' + quoi)) as unknown as readonly [number, number, number, number, number, number];
}

/** Un degrade de projet, lu et borne ; `quoi` le nomme dans un refus (« le dégradé du remplissage »). */
export function lirePeintureProjet(v: unknown, o: OutilsProjet, quoi: string): PeintureProjet {
  const p = o.objet(v, quoi);
  const genre = p['genre'];
  if (genre === 'motif') o.refuser('les motifs (' + quoi + ') attendent une version plus récente de l’éditeur');
  const g = o.choix(genre, 'le genre de ' + quoi, ['lineaire', 'radial'] as const);
  const n = (cle: string, min?: number) => o.nombre(p[cle], 'une coordonnée de ' + quoi, min);
  const commun = (): CommunProjet => ({
    arrets: lireArrets(p['arrets'], o, quoi),
    ...(p['matrice'] !== undefined ? { matrice: lireMatrice(p['matrice'], o, quoi) } : {}),
    ...(p['etalement'] !== undefined ? { etalement: o.choix(p['etalement'], 'l’étalement de ' + quoi, ['reflect', 'repeat'] as const) } : {})
  });
  if (g === 'lineaire') return { genre: 'lineaire', x1: n('x1'), y1: n('y1'), x2: n('x2'), y2: n('y2'), ...commun() };
  return {
    genre: 'radial', cx: n('cx'), cy: n('cy'), r: n('r', 0),
    ...(p['fx'] !== undefined ? { fx: n('fx') } : {}), ...(p['fy'] !== undefined ? { fy: n('fy') } : {}), ...(p['fr'] !== undefined ? { fr: n('fr', 0) } : {}),
    ...commun()
  };
}

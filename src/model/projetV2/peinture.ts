// Une peinture non unie dans le projet JSON (ADR-0012, etape 3 ; ADR-0030) : un degrade lineaire ou radial, champ pour champ comme
// le modele (`Degrade`, engine/edition/types.ts), a pleine precision ; un motif (etape 9) dans son fichier, `motif.ts`. Pur ; chaque
// valeur est bornee, et un projet valide se reconstruit dans un ordre de champs fixe.

import { t } from '../../util/i18n.js';
import type { OutilsProjet } from './champs.js';
import { lireMotifProjet, type MotifProjet } from './motif.js';

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
export type DegradeProjet = LineaireProjet | RadialProjet;
export type PeintureProjet = DegradeProjet | MotifProjet;

const HEX = /^#[0-9a-f]{6}$/;

function lireArrets(v: unknown, o: OutilsProjet, quoi: string): readonly ArretProjet[] {
  const liste = o.tableau(v, t('les arrêts de {quoi}', { quoi }), ARRETS_PROJET_MAX);
  if (liste.length < 2) o.refuser(t('les arrêts de {quoi} sont moins de deux', { quoi }));
  let avant = 0;
  return liste.map(x => {
    const a = o.objet(x, t('un arrêt de {quoi}', { quoi }));
    const position = o.nombre(a['position'], t('la position d’un arrêt'), 0, 1);
    if (position < avant) o.refuser(t('les arrêts de {quoi} reculent', { quoi }));
    avant = position;
    const couleur = o.texte(a['couleur'], t('la couleur d’un arrêt'), 7);
    if (!HEX.test(couleur)) o.refuser(t('la couleur d’un arrêt n’est pas un code #rrggbb'));
    return { position, couleur, ...(a['opacite'] !== undefined ? { opacite: o.nombre(a['opacite'], t('l’opacité d’un arrêt'), 0, 1) } : {}) };
  });
}

function lireMatrice(v: unknown, o: OutilsProjet, quoi: string): readonly [number, number, number, number, number, number] {
  const liste = o.tableau(v, t('la matrice de {quoi}', { quoi }), 6);
  if (liste.length !== 6) o.refuser(t('la matrice de {quoi} n’a pas six valeurs', { quoi }));
  return liste.map(x => o.nombre(x, t('la matrice de {quoi}', { quoi }))) as unknown as readonly [number, number, number, number, number, number];
}

/** Un degrade ou un motif de projet, lu et borne ; `quoi` le nomme dans un refus (« la peinture du remplissage »). */
export function lirePeintureProjet(v: unknown, o: OutilsProjet, quoi: string): PeintureProjet {
  const p = o.objet(v, quoi);
  const genre = p['genre'];
  if (genre === 'motif') return lireMotifProjet(p, o, quoi);
  const g = o.choix(genre, t('le genre de {quoi}', { quoi }), ['lineaire', 'radial'] as const);
  const n = (cle: string, min?: number) => o.nombre(p[cle], t('une coordonnée de {quoi}', { quoi }), min);
  const commun = (): CommunProjet => ({
    arrets: lireArrets(p['arrets'], o, quoi),
    ...(p['matrice'] !== undefined ? { matrice: lireMatrice(p['matrice'], o, quoi) } : {}),
    ...(p['etalement'] !== undefined ? { etalement: o.choix(p['etalement'], t('l’étalement de {quoi}', { quoi }), ['reflect', 'repeat'] as const) } : {})
  });
  if (g === 'lineaire') return { genre: 'lineaire', x1: n('x1'), y1: n('y1'), x2: n('x2'), y2: n('y2'), ...commun() };
  return {
    genre: 'radial', cx: n('cx'), cy: n('cy'), r: n('r', 0),
    ...(p['fx'] !== undefined ? { fx: n('fx') } : {}), ...(p['fy'] !== undefined ? { fy: n('fy') } : {}), ...(p['fr'] !== undefined ? { fr: n('fr', 0) } : {}),
    ...commun()
  };
}

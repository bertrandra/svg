// Les effets d'une forme ou d'un groupe dans le projet JSON (ADR-0030, ADR-0012 etape 7) : champ pour champ `Effets` du modele
// (engine/edition/types.ts), a pleine precision, en unites du plan. Un projet vient d'un fichier, d'un serveur ou d'un autre onglet :
// il ne se croit pas sur parole. Les objets sont reconstruits dans un ordre de champs fixe ; un objet vide, un nombre hors de ses bornes,
// une couleur qui n'est pas #rrggbb sont refuses en le nommant. Branche par une ligne de chaque cadre (`champs.ts`). Pur ; ne leve jamais
// (les gardes remontent par `o.refuser`).

import { t } from '../../util/i18n.js';
import type { OutilsProjet } from './champs.js';

/** Ce que le projet garde d'un flou : ses ecarts (isotrope sans `ecartY`). */
export interface FlouProjet { readonly ecart: number; readonly ecartY?: number }
/** Ce que le projet garde d'une ombre portee : decalage dans le repere du plan, ecart, couleur, opacite. */
export interface OmbreProjet { readonly dx: number; readonly dy: number; readonly ecart: number; readonly couleur: string; readonly opacite: number }
/** Les effets d'une forme ou d'un groupe : au moins l'un des deux. */
export interface EffetsProjet { readonly flou?: FlouProjet; readonly ombre?: OmbreProjet }

/** Les bornes d'un effet dans le projet : celles d'une coordonnee (la lecture borne plus serre, au plan). */
export const BORNE_EFFET_PROJET = 1e9;

/** Les effets d'une forme ou d'un groupe de projet, reconstruits dans l'ordre du format, ou refuses en le nommant. */
export function lireEffetsProjet(v: unknown, o: OutilsProjet, quoi: string): EffetsProjet {
  const B = BORNE_EFFET_PROJET;
  const e = o.objet(v, quoi);
  let flou: FlouProjet | undefined, ombre: OmbreProjet | undefined;
  if (e['flou'] !== undefined) {
    const f = o.objet(e['flou'], t('le flou de {quoi}', { quoi }));
    const ecart = o.nombre(f['ecart'], t('l’écart d’un flou'), 0, B);
    const ecartY = f['ecartY'] === undefined ? undefined : o.nombre(f['ecartY'], t('l’écart vertical d’un flou'), 0, B);
    if (!(ecart > 0) && !((ecartY ?? 0) > 0)) o.refuser(t('un flou sans écart'));
    flou = { ecart, ...(ecartY !== undefined ? { ecartY } : {}) };
  }
  if (e['ombre'] !== undefined) {
    const s = o.objet(e['ombre'], t('l’ombre de {quoi}', { quoi }));
    const couleur = o.texte(s['couleur'], t('la couleur d’une ombre'), 7);
    if (!/^#[0-9a-f]{6}$/.test(couleur)) o.refuser(t('la couleur d’une ombre n’est pas #rrggbb'));
    ombre = {
      dx: o.nombre(s['dx'], t('le décalage d’une ombre'), -B, B),
      dy: o.nombre(s['dy'], t('le décalage d’une ombre'), -B, B),
      ecart: o.nombre(s['ecart'], t('l’écart d’une ombre'), 0, B),
      couleur,
      opacite: o.nombre(s['opacite'], t('l’opacité d’une ombre'), 0, 1)
    };
  }
  if (!flou && !ombre) o.refuser(t('des effets vides (ils doivent être absents)'));
  return { ...(flou ? { flou } : {}), ...(ombre ? { ombre } : {}) };
}

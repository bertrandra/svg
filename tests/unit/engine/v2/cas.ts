// La forme d'un cas d'ecriture du modele v2 (ADR-0012, annexe 7 §2, annexe 8 §3). Chaque etape ajoute SON fichier de cas,
// `tests/unit/engine/v2/cas-<fonction>.ts`, qui exporte `CAS: readonly CasV2[]` ; `ecriture-stable-v2.test.ts` les trouve tous seul :
// aucun fichier partage a editer, deux etapes paralleles ne se rencontrent pas.

import type { DessinSvg } from '../../../../src/engine/editionSvg.js';

export interface CasV2 {
  /** Le nom du cas, unique : sa reference est `tests/fixtures/svg/v2/<nom>.attendu.svg`. */
  readonly nom: string;
  /** Le SVG d'entree, `tests/fixtures/svg/v2/<entree>.svg` (ou un fichier v1, `../<nom>.svg`), lu en mode riche ; ou bien `dessin`. */
  readonly entree?: string;
  /** Un dessin construit a la main, a la place d'une entree. */
  readonly dessin?: () => DessinSvg;
  /** L'operation du moteur a appliquer avant d'ecrire ; aucune : la relecture seule. */
  readonly operation?: (d: DessinSvg) => DessinSvg;
}

// Les points d'entree des exporteurs pour les tests (ADR-0012, etape 1) : depuis que `DessinPlat` est une marque de type, un exporteur
// ne recoit un dessin que par `aplatirPour`. Les tests d'export lisent des dessins plats : la descente les rend tels quels (le meme
// objet), donc ces enveloppes ne changent rien a ce qu'ils verifient ; un dessin a groupes y serait descendu comme dans l'editeur.

import type { DessinSvg } from '../../../src/engine/editionSvg.js';
import { aplatirPour, CAPACITES_PLAT, type DessinPlat } from '../../../src/engine/aplatir.js';
import { ecrirePdf as ecrirePdfPlat } from '../../../src/export/pdf.js';
import { svgDecoupe as svgDecoupePlat } from '../../../src/export/svgs.js';
import { ecrireDxf as ecrireDxfPlat } from '../../../src/export/dxf.js';
import { ecrireEps as ecrireEpsPlat } from '../../../src/export/eps.js';
import { svgCricut as svgCricutPlat } from '../../../src/export/cricut.js';
import { printThenCut as printThenCutPlat } from '../../../src/export/printThenCut.js';
import { svgPourStylo as svgPourStyloPlat } from '../../../src/export/stylo.js';
import { archiveOperations as archiveOperationsPlat, exportParOperation as exportParOperationPlat } from '../../../src/export/operations.js';

/** Le dessin tel qu'un exporteur le recoit. */
export const plat = (d: DessinSvg): DessinPlat => aplatirPour(d, CAPACITES_PLAT).dessin;

type Reste<F> = F extends (d: DessinPlat, ...r: infer R) => unknown ? R : never;

export const ecrirePdf = (d: DessinSvg, ...r: Reste<typeof ecrirePdfPlat>) => ecrirePdfPlat(plat(d), ...r);
export const svgDecoupe = (d: DessinSvg, ...r: Reste<typeof svgDecoupePlat>) => svgDecoupePlat(plat(d), ...r);
export const ecrireDxf = (d: DessinSvg, ...r: Reste<typeof ecrireDxfPlat>) => ecrireDxfPlat(plat(d), ...r);
export const ecrireEps = (d: DessinSvg, ...r: Reste<typeof ecrireEpsPlat>) => ecrireEpsPlat(plat(d), ...r);
export const svgCricut = (d: DessinSvg, ...r: Reste<typeof svgCricutPlat>) => svgCricutPlat(plat(d), ...r);
export const printThenCut = (d: DessinSvg, ...r: Reste<typeof printThenCutPlat>) => printThenCutPlat(plat(d), ...r);
export const svgPourStylo = (d: DessinSvg, ...r: Reste<typeof svgPourStyloPlat>) => svgPourStyloPlat(plat(d), ...r);
export const exportParOperation = (d: DessinSvg, ...r: Reste<typeof exportParOperationPlat>) => exportParOperationPlat(plat(d), ...r);
export const archiveOperations = (nom: string, d: DessinSvg, ...r: Parameters<typeof archiveOperationsPlat> extends [string, DessinPlat, ...infer R] ? R : never) =>
  archiveOperationsPlat(nom, plat(d), ...r);

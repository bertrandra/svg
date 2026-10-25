// Le corps de `ecrireDessin` d'avant le modele v2 (ADR-0012, annexe 7 §3, « loi du dessin plat »), recopie tel quel a l'etape 0.
// Il ne sert qu'aux tests : pour tout dessin plat, l'ecriture d'aujourd'hui doit rendre ces octets-la. Ne pas le « corriger » :
// il disparait a la bascule (etape 14), avec tout le dossier `anciennes/`.

import { attributsLien, ecrireForme, type DessinSvg, type Forme } from '../../../../src/engine/editionSvg.js';
import { nb } from '../../../../src/engine/edition/chemins.js';
import { metadonnees } from '../../../../src/engine/edition/provenance.js';
import { attributOperation } from '../../../../src/engine/edition/operation.js';

function lienDesTextes(dessin: DessinSvg, visibles: readonly Forme[], precision: number): (f: Forme) => string {
  if (!visibles.some(f => f.texte?.disposition)) return f => ecrireForme(f, precision);
  const formes = new Map(dessin.formes.map(f => [f.id, f])), rangs = new Map(visibles.map((f, i) => [f.id, i + 1]));
  return f => {
    const e = ecrireForme(f, precision), l = f.texte?.disposition ? attributsLien(f, formes, rangs, precision) : '';
    return l ? e.slice(0, -2) + l + '/>' : e;
  };
}

const avecOperation = (f: Forme, ecrite: string): string => (f.operation ? ecrite.slice(0, -2) + attributOperation(f) + '/>' : ecrite);

export function ecrireDessinAncien(dessin: DessinSvg, precision = 2, operations = false): string {
  const [x, y, l, h] = dessin.vb;
  const visibles = dessin.formes.filter(f => f.visible);
  const lien = lienDesTextes(dessin, visibles, precision);
  const corps = visibles.map(f => { const e = lien(f); return operations ? avecOperation(f, e) : e; }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [x, y, l, h].map(v => nb(v, 3)).join(' ') + '" width="' + nb(l, 3) + '" height="' + nb(h, 3) + '">' + metadonnees(visibles) + corps + '</svg>';
}

// La porte unique des exporteurs (ADR-0012 §6, annexe 5 §4, risque R3) : un exporteur ne lit jamais la structure d'un dessin riche,
// il recoit un `DessinPlat` par `aplatirPour`. Le texte des sources le dit, ce test le garde.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DOSSIER = resolve(__dirname, '../../../src/export');
const sansCommentaires = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
/** Le code sans ses textes : « en deux groupes » dans une phrase n'est pas une lecture de `groupes`. */
const sansTextes = (t: string): string => t.replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, "''");
const sources = readdirSync(DOSSIER).filter(n => /\.tsx?$/.test(n)).map(nom => ({ nom, code: sansCommentaires(readFileSync(join(DOSSIER, nom), 'utf8')) }));

/** Les points d'entree qui recoivent le dessin de la personne : chacun le prend en `DessinPlat`. */
const ENTREES = ['ecrirePdf', 'svgDecoupe', 'ecrireDxf', 'ecrireEps', 'svgCricut', 'printThenCut', 'svgPourStylo', 'exportParOperation', 'archiveOperations'];

describe('les exporteurs passent par la descente', () => {
  it('aucun fichier de src/export ne lit les groupes ni un champ v2 d une feuille', () => {
    const lus = /\.(?:groupes|parent|peintureRemplissage|peintureContour|effets|image)\b|\b(?:groupes|peintureRemplissage|peintureContour)\s*[,}]/;
    expect(sources.filter(s => lus.test(sansTextes(s.code))).map(s => s.nom)).toEqual([]);
    // Le controle voit une lecture reelle.
    expect(lus.test(sansTextes('const n = dessin.groupes; const t = "groupes";'))).toBe(true);
    expect(lus.test(sansTextes('const t = \'en deux groupes, ...\';'))).toBe(false);
  });

  it('chaque point d entree prend un DessinPlat', () => {
    const tous = sources.map(s => s.code).join('\n');
    for (const nom of ENTREES) expect(tous, nom).toMatch(new RegExp('export function ' + nom + '\\([^)]*\\bdessin: DessinPlat\\b'));
  });
});

// Les ligatures lues dans la table GSUB d'une fonte (feature « liga », script latn ou DFLT, langue par defaut) :
// les lookups de type 4 (substitution de ligatures : plusieurs glyphes deviennent un seul), directs ou derriere
// un lookup d'extension de type 7.
//
// Pourquoi ce lecteur : opentype.js 2.0.0 ne sait pas appliquer les ligatures de facon fiable, et leve sur
// certaines fontes en lisant leur GSUB (Inter et Oswald : « GSUB lookup type 6 format 2 not yet supported »),
// alors que ce qu'on cherche, un lookup de type 4, y est parfaitement lisible. Lecture pure sur les octets de la
// fonte : aucun DOM, aucune horloge, le meme resultat a chaque appel.
//
// Ce qui n'est PAS lu, et qu'un moteur de mise en forme complet ferait : les lookups de contexte et de chainage
// (types 5 et 6) qui appelleraient des ligatures, les drapeaux de lookup (marques sautees), les features `clig`,
// `rlig`, `dlig`, `hlig` et les ligatures propres a une langue autre que la langue par defaut.

import { adresseTable, glyphesCouverts, lookupsDeFeature, Zone } from './tablesOpentype.js';

/** Une ligature : les glyphes qui suivent le premier, et le glyphe unique qui remplace le tout. */
interface Ligature { readonly suite: readonly number[]; readonly glyphe: number }

export interface LecteurLigatures {
  /** Combien de ligatures la fonte porte (toujours au moins une : sans elles, la lecture rend null). */
  readonly nombre: number;
  /** Le plus grand nombre de glyphes qu'une ligature absorbe : la fenetre a presenter a `appliquer`. */
  readonly maxGlyphes: number;
  /**
   * La ligature qui commence a `glyphes[debut]` : le glyphe qui remplace la suite, et combien de glyphes (au moins 2)
   * il absorbe ; null quand rien ne s'y applique. La premiere qui s'ajuste, dans l'ordre de la fonte, l'emporte
   * (les fontes rangent les plus longues d'abord).
   */
  appliquer(glyphes: readonly number[], debut: number): { glyphe: number; n: number } | null;
}

/** Les ligatures d'une sous-table de type 4 (format 1), ajoutees a `dans` par premier glyphe. */
function lireSousTable(sous: Zone, dans: Map<number, Ligature[]>): void {
  if (sous.u16(0) !== 1) return;
  const premiers = glyphesCouverts(sous.sous16(2)), n = sous.u16(4);
  for (let rang = 0; rang < n; rang++) {
    const premier = premiers[rang];
    if (premier === undefined) continue;
    const jeu = sous.sous16(6 + rang * 2), nLigatures = jeu.u16(0);
    for (let k = 0; k < nLigatures; k++) {
      const lig = jeu.sous16(2 + k * 2), composants = lig.u16(2);
      // Un seul composant serait une substitution simple, et zero n'a pas de sens : seules les vraies ligatures comptent.
      if (composants < 2) continue;
      const suite = Array.from({ length: composants - 1 }, (_, i) => lig.u16(4 + i * 2));
      const liste = dans.get(premier);
      const ligature: Ligature = { suite, glyphe: lig.u16(0) };
      if (liste) liste.push(ligature); else dans.set(premier, [ligature]);
    }
  }
}

/** La sous-table de ligatures derriere une sous-table de lookup, directe (type 4) ou d'extension (type 7, format 1 vers le type 4) ; null pour un autre type. */
function sousTableDeLigatures(lookup: Zone, type: number, i: number): Zone | null {
  const sous = lookup.sous16(6 + i * 2);
  if (type === 4) return sous;
  if (type === 7 && sous.u16(0) === 1 && sous.u16(2) === 4) return sous.sous32(4);
  return null;
}

/**
 * Le lecteur de ligatures « liga » d'une fonte, ou null quand elle n'en porte aucune (pas de GSUB, pas de feature
 * « liga », aucun lookup de type 4) ou que ses octets ne se lisent pas (table tronquee). La table est lue d'un coup,
 * a l'ouverture : une table douteuse ne donne jamais des ligatures a moitie.
 */
export function lireLigaturesGsub(octets: ArrayBuffer): LecteurLigatures | null {
  try {
    const vue = new DataView(octets), debut = adresseTable(vue, 'GSUB');
    if (debut === null) return null;
    const gsub = new Zone(vue, debut), liste = gsub.sous16(8);
    const parPremier = new Map<number, Ligature[]>();
    for (const i of lookupsDeFeature(gsub, 'liga')) {
      const lookup = liste.sous16(2 + i * 2), type = lookup.u16(0), n = lookup.u16(4);
      if (type !== 4 && type !== 7) continue;
      for (let j = 0; j < n; j++) {
        const sous = sousTableDeLigatures(lookup, type, j);
        if (sous) lireSousTable(sous, parPremier);
      }
    }
    let nombre = 0, maxGlyphes = 0;
    for (const l of parPremier.values()) for (const g of l) { nombre++; maxGlyphes = Math.max(maxGlyphes, g.suite.length + 1); }
    if (nombre === 0) return null;
    return {
      nombre,
      maxGlyphes,
      appliquer(glyphes, depart) {
        const premier = glyphes[depart];
        const candidates = premier === undefined ? undefined : parPremier.get(premier);
        if (!candidates) return null;
        for (const c of candidates) {
          if (c.suite.every((g, k) => glyphes[depart + 1 + k] === g)) return { glyphe: c.glyphe, n: c.suite.length + 1 };
        }
        return null;
      }
    };
  } catch { return null; }
}

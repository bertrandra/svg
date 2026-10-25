// Exporter un nuancier (ADR-0037) : une palette GIMP (`.gpl`, que lisent aussi Inkscape, Krita et Scribus) et un Adobe Swatch
// Exchange (`.ase`, Illustrator, Photoshop, InDesign, Affinity). Ecrits a la main comme les autres exports (ADR-0018) : purs et
// deterministes, memes teintes memes octets, ni date ni identifiant tire au sort.
//
// Ni l'un ni l'autre ne porte d'opacite : une teinte translucide s'y ecrit pleine, et son nom le dit (« opacité 50 % »).

import { lireHex } from '../util/couleur.js';

/** Une teinte a exporter : son nom (tel que la palette l'affichera) et son code `#rrggbb`. */
export interface TeinteExportee { readonly nom: string; readonly hex: string }

/** Un nom sans caractere de controle ni retour a la ligne : il tient sur sa ligne du `.gpl` et dans un bloc `.ase`. */
const nomPropre = (s: string, max: number) => Array.from(s, c => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('').replace(/ {2,}/g, ' ').trim().slice(0, max);

/** Les teintes lisibles seulement : un code qui n'est pas hexadecimal ne s'exporte pas (jamais une couleur devinee). */
const lisibles = (teintes: readonly TeinteExportee[]) =>
  teintes.flatMap(t => { const rgb = lireHex(t.hex); return rgb ? [{ nom: nomPropre(t.nom, 200) || t.hex, rgb }] : []; });

/**
 * La palette GIMP : l'en-tete, le nom, huit colonnes (la grille de GIMP et d'Inkscape), puis une ligne par teinte, « R G B »
 * alignes sur trois caracteres, une tabulation et le nom. Fins de ligne LF, une ligne vide a la fin comme GIMP l'ecrit.
 */
export function ecrireGpl(nom: string, teintes: readonly TeinteExportee[]): string {
  const trois = (v: number) => String(v).padStart(3, ' ');
  const lignes = lisibles(teintes).map(t => trois(t.rgb.r) + ' ' + trois(t.rgb.g) + ' ' + trois(t.rgb.b) + '\t' + t.nom);
  return ['GIMP Palette', 'Name: ' + (nomPropre(nom, 120) || 'Nuancier'), 'Columns: 8', '#', ...lignes].join('\n') + '\n';
}

/** Les octets d'un nom ASE : sa longueur en mots UTF-16 (zero final compris), puis le nom en UTF-16 gros-boutiste et le zero. */
function nomAse(s: string): number[] {
  const o: number[] = [], n = s.length + 1;
  o.push((n >> 8) & 255, n & 255);
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); o.push((c >> 8) & 255, c & 255); }
  o.push(0, 0);
  return o;
}

function mot16(v: number): number[] { return [(v >> 8) & 255, v & 255]; }
function mot32(v: number): number[] { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }
function reel32(v: number): number[] {
  const d = new DataView(new ArrayBuffer(4));
  d.setFloat32(0, v, false);
  return [d.getUint8(0), d.getUint8(1), d.getUint8(2), d.getUint8(3)];
}

/** Un bloc ASE : son type, la longueur de ses donnees, ses donnees. */
const bloc = (type: number, donnees: readonly number[]): number[] => [...mot16(type), ...mot32(donnees.length), ...donnees];

/**
 * L'Adobe Swatch Exchange, version 1.0 : « ASEF », la version, le nombre de blocs, puis un groupe nomme (debut 0xC001, fin
 * 0xC002) qui porte une entree de couleur (0x0001) par teinte : son nom, le modele « RGB », trois reels de 0 a 1 en simple
 * precision gros-boutiste, et le type « normal » (2).
 */
export function ecrireAse(nom: string, teintes: readonly TeinteExportee[]): Uint8Array {
  const entrees = lisibles(teintes).map(t => bloc(0x0001, [
    ...nomAse(t.nom), 0x52, 0x47, 0x42, 0x20, ...reel32(t.rgb.r / 255), ...reel32(t.rgb.g / 255), ...reel32(t.rgb.b / 255), ...mot16(2)
  ]));
  const blocs = [bloc(0xc001, nomAse(nomPropre(nom, 120) || 'Nuancier')), ...entrees, bloc(0xc002, [])];
  return Uint8Array.from([0x41, 0x53, 0x45, 0x46, ...mot16(1), ...mot16(0), ...mot32(blocs.length), ...blocs.flat()]);
}

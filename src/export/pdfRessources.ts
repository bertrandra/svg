// Les ressources d'un PDF natif (ADR-0012, etape 13a) : les objets qui suivent ceux de la page (7 et suivants : groupes, images,
// fonctions citees plusieurs fois), et le dictionnaire des ressources (objet 6), partage par la page et tous les groupes. Chaque
// ressource prend un nom stable dans l'ordre de la premiere rencontre et n'est ecrite qu'une fois par texte (mille formes au meme
// degrade, un seul shading ; une image reprise, un seul XObject). Pur et deterministe.

import { fluxTexte, type ObjetPdf } from './pdfObjets.js';
import { nbk } from './pdfTrace.js';

/** Le premier objet libre : 1 a 5 sont ceux de la page, 6 les ressources. */
const PREMIER = 7;

export const tableau4 = (b: readonly number[]): string => '[' + b.map(v => nbk(v, 3)).join(' ') + ']';

export class RessourcesPdf {
  readonly objets: ObjetPdf[] = [];
  private readonly etats = new Map<string, string>();
  private readonly shadings = new Map<string, string>();
  private readonly motifs = new Map<string, string>();
  private readonly xobjets = new Map<number, string>();
  private readonly parCle = new Map<string, number>();

  /** Un objet de plus ; son numero. */
  ajouter(o: ObjetPdf): number { this.objets.push(o); return PREMIER + this.objets.length - 1; }

  private nom(table: Map<string, string>, prefixe: string, texte: string): string {
    let n = table.get(texte);
    if (n === undefined) { n = prefixe + table.size; table.set(texte, n); }
    return n;
  }

  /** Le nom d'un etat graphique (`gs`), d'apres son dictionnaire. */
  etat(dict: string): string { return this.nom(this.etats, 'GS', dict); }
  /** Le nom d'un shading (`sh`), d'apres son dictionnaire. */
  shading(dict: string): string { return this.nom(this.shadings, 'Sh', dict); }
  /** Le nom d'un motif (`SCN`), d'apres son dictionnaire ou son numero (`N 0 R`, un motif de pavage). */
  motif(texte: string): string { return this.nom(this.motifs, 'P', texte); }
  /** Le nom d'un XObject (`Do`), d'apres son numero. */
  xobjet(ref: number): string {
    let n = this.xobjets.get(ref);
    if (n === undefined) { n = 'X' + this.xobjets.size; this.xobjets.set(ref, n); }
    return n;
  }

  /** Un objet ecrit une seule fois par cle ; son numero. */
  unique(cle: string, faire: () => ObjetPdf): number {
    let n = this.parCle.get(cle);
    if (n === undefined) { n = this.ajouter(faire()); this.parCle.set(cle, n); }
    return n;
  }

  /** Une fonction rangee a part, pour etre citee par plusieurs periodes d'un degrade. */
  readonly fonction = (texte: string): number => this.unique('fonction ' + texte, () => texte);

  /**
   * Un groupe de transparence (XObject de formulaire) sur une boite du PDF ; `cs` precise son espace de couleur. Isole, comme le rendu
   * a part d'un groupe SVG (masque, opacite) : un masque doux y lit sa luminance sur le fond noir, alpha compris.
   */
  groupe(bbox: readonly number[], cs: string, contenu: string): number {
    const dict = '/Type /XObject /Subtype /Form /BBox ' + tableau4(bbox) + ' /Group << /S /Transparency' + cs + ' /I true >> /Resources 6 0 R';
    return this.unique('groupe ' + dict + '\n' + contenu, () => fluxTexte(dict, contenu));
  }

  /** Le dictionnaire des ressources, objet 6. */
  dictionnaire(): string {
    const section = (cle: string, table: Map<string, string>) => (table.size ? ['/' + cle + ' << ' + [...table].map(([texte, n]) => '/' + n + ' ' + texte).join(' ') + ' >>'] : []);
    const parties = [
      ...section('ExtGState', this.etats), ...section('Shading', this.shadings), ...section('Pattern', this.motifs),
      ...(this.xobjets.size ? ['/XObject << ' + [...this.xobjets].map(([r, n]) => '/' + n + ' ' + r + ' 0 R').join(' ') + ' >>'] : [])
    ];
    return '<< ' + parties.map(p => p + ' ').join('') + '>>';
  }
}

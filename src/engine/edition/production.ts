// La marque du contexte de production dans un SVG ecrit (ADR-0013) : des attributs `data-ed-*` sur la balise
// racine, pour qu'un fichier prepare pour une machine rouvre son panneau. Le moteur n'en connait que la
// forme : des identifiants courts, en minuscules ; ce qu'ils designent (une machine, un tapis) se resout dans
// `model/contextes.ts`. Sans marque, rien n'est ecrit : un dessin « Generique » garde ses octets.

/** Ce qu'un SVG ecrit dit de sa production. `contexte` seul est obligatoire. */
export interface MarqueProduction {
  readonly contexte: string;
  readonly machine?: string;
  readonly tapis?: string;
  readonly materiau?: string;
  readonly procede?: string;
  readonly unite?: string;
  /** « non » quand le recalage automatique est desactive (ADR-0039) ; absent sinon. Le document seul le porte, jamais un export. */
  readonly recalage?: string;
  /** La feuille sur le tapis (ADR-0039), « x-y-l-h » en centiemes d'unite du plan ; absente pour le tapis entier. */
  readonly feuille?: string;
}

/**
 * Les champs dans l'ordre d'ecriture : un ordre fixe, pour que la meme marque donne les memes octets. `recalage` vient en dernier
 * (ADR-0039) : absent d'une marque, il n'ecrit rien, et une marque d'avant garde ses octets.
 */
export const CHAMPS_PRODUCTION = ['contexte', 'machine', 'tapis', 'materiau', 'procede', 'unite', 'recalage', 'feuille'] as const;
export const PREFIXE_PRODUCTION = 'data-ed-';

/** Un identifiant de profil : des minuscules, des chiffres et des tirets, rien a echapper, rien d'executable. */
const IDENTIFIANT = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const identifiantValide = (v: string): boolean => IDENTIFIANT.test(v);

/** Les attributs d'une marque, dans l'ordre ; les valeurs invalides sont tues plutot qu'ecrites. */
function attributsDe(marque: MarqueProduction): string {
  return CHAMPS_PRODUCTION.map(c => {
    const v = marque[c];
    return v !== undefined && identifiantValide(v) ? ' ' + PREFIXE_PRODUCTION + c + '="' + v + '"' : '';
  }).join('');
}

/**
 * Le SVG avec la marque posee a la fin des attributs de sa balise racine. Sans marque (ou avec un contexte
 * invalide), le SVG est rendu tel quel : c'est ce qui garde les octets d'un dessin sans contexte.
 */
export function marquerProduction(svg: string, marque: MarqueProduction | null): string {
  if (!marque || !identifiantValide(marque.contexte)) return svg;
  const debut = svg.indexOf('<svg');
  const fin = debut < 0 ? -1 : svg.indexOf('>', debut);
  if (fin < 0) return svg;
  const auto = svg.charAt(fin - 1) === '/';
  const coupe = auto ? fin - 1 : fin;
  return svg.slice(0, coupe) + attributsDe(marque) + svg.slice(coupe);
}

/** La marque lue sur les attributs d'une balise racine, ou null s'il n'y en a pas (ou si son contexte ne se lit pas). */
export function lireProduction(attributs: Readonly<Record<string, string>>): MarqueProduction | null {
  const lu = (c: (typeof CHAMPS_PRODUCTION)[number]): string | undefined => {
    const v = (attributs[PREFIXE_PRODUCTION + c] ?? '').trim();
    return identifiantValide(v) ? v : undefined;
  };
  const contexte = lu('contexte');
  if (contexte === undefined) return null;
  const machine = lu('machine'), tapis = lu('tapis'), materiau = lu('materiau'), procede = lu('procede'), unite = lu('unite'), recalage = lu('recalage'), feuille = lu('feuille');
  return {
    contexte, ...(machine ? { machine } : {}), ...(tapis ? { tapis } : {}), ...(materiau ? { materiau } : {}),
    ...(procede ? { procede } : {}), ...(unite ? { unite } : {}), ...(recalage ? { recalage } : {}), ...(feuille ? { feuille } : {})
  };
}

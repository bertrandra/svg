// Ouvrir un PDF dans le navigateur (ADR-0020) : decompresser ses flux FlateDecode par l'API du navigateur (DecompressionStream,
// asynchrone), donner la decompression a la lecture pure (engine/lecturePdf.ts, synchrone), et rendre la page lue en SVG, pret
// pour la voie d'ouverture d'un SVG. La lecture leve `FluxEnAttente` pour les flux qu'elle n'a pas encore : on les decompresse,
// on les garde, et on la relance ; elle reprend du debut avec ce qu'elle a deja (quelques tours : la table en flux, les flux
// d'objets, puis tous les flux de la page d'un coup). Rien ne leve : un fichier hostile rend un refus nomme.

import { ecrireDessin, type Glyphes } from '../engine/editionSvg.js';
import { FluxEnAttente, LIMITES_PDF, lirePdf, type Decompression, type LecturePdf, type PolicesPdf, type ResultatDecompression } from '../engine/lecturePdf.js';
import { t } from '../util/i18n.js';
import { fontesDeRemplacement } from './polices.js';
import { lireFontePdf } from './policesPdf.js';

/** Une page lue, en SVG ; ou un refus, avec le nombre de pages quand le document s'est ouvert. */
export type PdfOuvert =
  | { readonly svg: string; readonly ignores: readonly string[]; readonly pages: number; readonly page: number }
  | { readonly erreur: string; readonly pages?: number };

/** Plus de reprises que de flux qu'un PDF reel demande : chaque reprise decompresse au moins un flux nouveau. */
const REPRISES_MAX = 10_000;

/** Vrai si les octets sont ceux d'un PDF (« %PDF- » dans le premier kilo-octet, comme le tolerent les lecteurs). */
export function estPdf(octets: Uint8Array): boolean {
  const debut = octets.subarray(0, 1029);
  for (let i = 0; i + 5 <= debut.length; i++) {
    if (debut[i] === 0x25 && debut[i + 1] === 0x50 && debut[i + 2] === 0x44 && debut[i + 3] === 0x46 && debut[i + 4] === 0x2d) return true;
  }
  return false;
}

/** Vrai si un fichier choisi ou depose se presente comme un PDF (son type, ou son extension faute de type). */
export const fichierPdf = (f: { readonly name: string; readonly type: string }): boolean => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/**
 * Decompresse un flux zlib par DecompressionStream('deflate'), en s'arretant des que la sortie depasse `max` : une bombe ne produit
 * jamais plus que la borne. Un flux tronque ou a la somme fausse rend ce qui a pu etre lu, comme les lecteurs courants ; rien du tout,
 * c'est « illisible ».
 */
export async function decompresserZlib(brut: Uint8Array, max: number): Promise<ResultatDecompression> {
  if (typeof DecompressionStream !== 'function') return 'indisponible';
  let flux: DecompressionStream;
  try { flux = new DecompressionStream('deflate'); } catch { return 'indisponible'; }
  const ecrivain = flux.writable.getWriter(), lecteur = flux.readable.getReader();
  // L'ecriture echoue quand on coupe la lecture (bombe) ou sur un flux casse : son erreur est celle de la lecture, deja traitee.
  const ecriture = ecrivain.write(brut as Uint8Array<ArrayBuffer>).then(() => ecrivain.close()).catch(() => undefined);
  const morceaux: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      total += value.length;
      if (total > max) { await lecteur.cancel().catch(() => undefined); return 'trop'; }
      morceaux.push(value);
    }
  } catch {
    if (!total) { await ecriture; return 'illisible'; }
  }
  await ecriture;
  const out = new Uint8Array(total);
  let i = 0;
  for (const m of morceaux) { out.set(m, i); i += m.length; }
  return out;
}

/** Ce que `ouvrirPdf` emploie du navigateur : la decompression et les fontes de remplacement (dist/polices.js), remplacables en test. */
export interface OutilsPdf {
  readonly decompresser: (brut: Uint8Array, max: number) => Promise<ResultatDecompression>;
  readonly remplacantes: () => Promise<ReadonlyMap<string, Glyphes>>;
}

const OUTILS: OutilsPdf = { decompresser: decompresserZlib, remplacantes: fontesDeRemplacement };

/**
 * Lit la page `page` (1 par defaut) d'un PDF et la rend en SVG. Le texte se dessine en lettres : un programme de fonte embarque se
 * lit tout de suite (opentype.js est dans la page) ; une police a remplacer demande les fontes de dist/polices.js, chargees
 * seulement si la page en a besoin, puis la lecture reprend avec elles.
 */
export async function ouvrirPdf(octets: Uint8Array, page = 1, outils: Partial<OutilsPdf> = {}): Promise<PdfOuvert> {
  const o = { ...OUTILS, ...outils };
  if (octets.length > LIMITES_PDF.octets) return { erreur: t('Ce PDF pèse plus de {mo} Mo : il est trop gros pour être lu ici.', { mo: LIMITES_PDF.octets / 1048576 }) };
  const faits = new Map<number, ResultatDecompression>();
  let remplacantes: ReadonlyMap<string, Glyphes> | null = null;
  const polices: PolicesPdf = { lire: lireFontePdf, remplacement: id => remplacantes?.get(id) ?? null };
  const donne: Decompression = (brut, max, cle) => {
    const r = faits.get(cle);
    if (r !== undefined) return r;
    throw new FluxEnAttente([{ cle, brut, max }]);
  };
  try {
    for (let reprise = 0; reprise < REPRISES_MAX; reprise++) {
      let lu: LecturePdf;
      try { lu = lirePdf(octets, { page, decompresser: donne, polices }); } catch (e) {
        if (!(e instanceof FluxEnAttente)) throw e;
        for (const d of e.demandes) if (!faits.has(d.cle)) faits.set(d.cle, await o.decompresser(d.brut, d.max));
        continue;
      }
      if (lu.policesManquantes && remplacantes === null) {
        // Les fontes manquent seulement si le fichier polices.js manque : la lecture le dira, elle n'echoue pas.
        try { remplacantes = await o.remplacantes(); } catch { remplacantes = new Map(); }
        continue;
      }
      return 'erreur' in lu ? { erreur: lu.erreur, ...(lu.pages ? { pages: lu.pages } : {}) } : { svg: ecrireDessin(lu.dessin, 3), ignores: lu.ignores, pages: lu.pages, page: lu.page };
    }
    return { erreur: t('Ce PDF demande trop de décompressions pour être lu ici.') };
  } catch {
    // Un defaut de la lecture elle-meme (jamais un fichier : ceux-la sont des refus nommes) ne doit pas laisser la page sans reponse.
    return { erreur: t('Ce PDF ne se lit pas (erreur inattendue de la lecture) : signalez-le avec le fichier si vous le pouvez.') };
  }
}

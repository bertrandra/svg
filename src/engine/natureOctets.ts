// La nature d'un fichier recu par une adresse (ADR-0036), decidee sur ses octets : la signature d'une image (PNG, JPEG, GIF, WebP,
// BMP), « %PDF- », ou un texte XML dont la racine est <svg>. Jamais sur l'extension de l'adresse, ni sur le `Content-Type` du
// serveur : l'une et l'autre se choisissent librement, et un « logo.png » qui est un SVG a script doit suivre la voie d'un SVG (le
// nettoyage et la lecture d'un fichier d'inconnu, ADR-0014), pas celle d'une image. Pur, sans DOM ; ne leve jamais.

export type NatureImage = 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp';
export type NatureOctets = 'svg' | 'pdf' | NatureImage;

/**
 * Ce que les octets sont : une nature qu'on sait ouvrir, `html` (une page web : le plus souvent la page d'erreur ou de connexion
 * d'un site, dite comme telle), `vide`, ou `inconnue`.
 */
export type Reconnaissance = NatureOctets | 'html' | 'vide' | 'inconnue';

/** Le type MIME d'une image, pour la donner au decodeur du navigateur. */
export const TYPES_IMAGE: Readonly<Record<NatureImage, string>> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };

export const estImage = (n: NatureOctets): n is NatureImage => n in TYPES_IMAGE;

/** Le debut d'un texte qu'on lit pour y chercher la racine : un SVG reel la pose bien avant (un en-tete d'Illustrator : 1 Ko). */
const FENETRE_TEXTE = 256 * 1024;
/** « %PDF- » se cherche dans le premier kilo-octet, comme le tolerent les lecteurs (et `estPdf` dans io/pdf.ts). */
const FENETRE_PDF = 1029;

const commencePar = (o: Uint8Array, signature: readonly number[], a = 0): boolean => o.length >= a + signature.length && signature.every((x, i) => o[a + i] === x);
const ascii = (t: string): number[] => Array.from(t, c => c.charCodeAt(0));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF87 = ascii('GIF87a'), GIF89 = ascii('GIF89a');
const RIFF = ascii('RIFF'), WEBP = ascii('WEBP');
const BM = ascii('BM');
const PDF = ascii('%PDF-');
/** Les tailles d'en-tete DIB connues (BITMAPCOREHEADER a BITMAPV5HEADER) : « BM » seul n'est que deux lettres d'un texte. */
const ENTETES_BMP = new Set([12, 16, 40, 52, 56, 64, 108, 124]);

function natureImage(o: Uint8Array): NatureImage | null {
  if (commencePar(o, PNG)) return 'png';
  if (commencePar(o, JPEG)) return 'jpeg';
  if (commencePar(o, GIF87) || commencePar(o, GIF89)) return 'gif';
  if (commencePar(o, RIFF) && commencePar(o, WEBP, 8)) return 'webp';
  if (commencePar(o, BM) && o.length >= 26) {
    const entete = (o[14] ?? 0) | ((o[15] ?? 0) << 8) | ((o[16] ?? 0) << 16) | ((o[17] ?? 0) << 24);
    if (ENTETES_BMP.has(entete)) return 'bmp';
  }
  return null;
}

function contientPdf(o: Uint8Array): boolean {
  const fin = Math.min(o.length, FENETRE_PDF);
  for (let i = 0; i + PDF.length <= fin; i++) if (commencePar(o, PDF, i)) return true;
  return false;
}

/**
 * Le debut du fichier en texte, octet par octet : l'ASCII tel quel, tout autre octet en « ? ». Assez pour reconnaitre des balises
 * sans decoder (un UTF-8 casse ne fait pas lever), et borne a la fenetre.
 */
function debutTexte(o: Uint8Array): string {
  const fin = Math.min(o.length, FENETRE_TEXTE);
  let t = '';
  for (let i = 0; i < fin; i += 8192) t += String.fromCharCode(...Array.from(o.subarray(i, Math.min(fin, i + 8192)), x => (x < 0x80 ? x : 0x3f)));
  return t;
}

/** La racine `<svg` (ou `<prefixe:svg`), suivie d'un blanc, de `>` ou de `/` : SVG distingue la casse, `<SVG` n'en est pas un. */
const RACINE_SVG = /<(?:[A-Za-z_][\w.-]*:)?svg[\s>/]/;
/** Les marques d'une page HTML, avant toute racine SVG : une page d'erreur qui porte des icones SVG reste une page. */
const MARQUE_HTML = /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i;

/** Reconnait des octets recus. L'ordre compte : une signature d'image en tete, puis « %PDF- » en tete, puis un texte qui commence par « < ». */
export function natureDesOctets(o: Uint8Array): Reconnaissance {
  if (!o.length) return 'vide';
  const image = natureImage(o);
  if (image) return image;
  if (commencePar(o, PDF)) return 'pdf';
  // La marque d'ordre des octets d'UTF-8 se saute, comme le fait la lecture du texte (TextDecoder).
  const texte = debutTexte(commencePar(o, [0xef, 0xbb, 0xbf]) ? o.subarray(3) : o).replace(/^\s+/, '');
  if (texte.startsWith('<')) {
    const svg = RACINE_SVG.exec(texte)?.index ?? -1, html = MARQUE_HTML.exec(texte)?.index ?? -1;
    if (html >= 0 && (svg < 0 || html < svg)) return 'html';
    return svg >= 0 ? 'svg' : 'inconnue';
  }
  // Un PDF peut porter quelques octets avant son en-tete ; un texte qui commence par « < » ne passe jamais ici.
  return contientPdf(o) ? 'pdf' : 'inconnue';
}

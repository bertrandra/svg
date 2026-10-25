// La lecture d'un PDF en dessin a plat (ADR-0020), en pur. Ce fichier n'est que la facade : le travail vit dans `pdf/`, un
// module par sujet (objets, structure, pages, filtres, couleurs, fonctions, contenu). Les autres couches n'importent que d'ici.
//
// La decompression des flux n'est pas ici : elle se fait dans le navigateur (`io/pdf.ts`, DecompressionStream) et la lecture
// la recoit en fonction (`Decompression`). Une fonction qui n'a pas encore un flux leve `FluxEnAttente` : l'appelant le
// decompresse et relance la lecture, qui reprend du debut avec ce qu'elle a deja.

export { lirePdf, matricePage, type LecturePdf, type PdfLu, type OptionsLecturePdf } from './pdf/lecture.js';
export { FluxEnAttente, LIMITES_PDF, type Decompression, type DemandeFlux, type ResultatDecompression } from './pdf/limites.js';
export type { FonteEmbarquee, PolicesPdf } from './pdf/polices.js';

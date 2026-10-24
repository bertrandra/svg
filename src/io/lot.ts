// Convertir plusieurs images d'un coup, une apres l'autre (jamais en parallele : le traceur est synchrone
// et la page ne doit pas se figer). Entre deux images la main est rendue au navigateur (`pause`), de sorte
// que les boutons, la liste et « Annuler » restent vivants. Chaque image est convertie avec les memes
// reglages, relevees au depart : changer un curseur pendant le lot ne change pas la moitie des resultats.
// Une image qui echoue ne fait pas echouer les autres ; elle dit pourquoi.

import type { Traceur } from '../engine/vectorisation.js';
import { pause } from './fichiers.js';
import { lireSource, resumeConversion, traiterImage, type ImageConvertie, type SourceImage, type Traitement } from './image.js';

/** Ou en est une image du lot. */
export type EtatLot = 'attente' | 'encours' | 'ok' | 'erreur' | 'annule';

/**
 * Ce qu'on garde d'une image convertie : le SVG et de quoi le dire. Pas ses pixels (la source, les
 * essais) : un lot de cinquante images ne tient pas en memoire s'il les garde tous.
 */
export interface ResultatLot { svg: string; traces: number | null; duree: number; resume: string }

export interface ImageDuLot {
  id: number;
  nom: string;
  etat: EtatLot;
  /** Le resultat quand `etat` vaut « ok ». */
  resultat?: ResultatLot;
  /** Pourquoi, quand `etat` vaut « erreur ». */
  erreur?: string;
}

/** Ce que le lot appelle : par defaut le vrai decodage, le vrai traitement et la vraie pause. Remplacable en test. */
export interface OutilsLot {
  lire: (f: Blob) => Promise<SourceImage | { erreur: string }>;
  traiter: (s: SourceImage, t: Traitement, tr?: Traceur) => Promise<ImageConvertie | { erreur: string }>;
  pause: () => Promise<void>;
}

const OUTILS: OutilsLot = { lire: lireSource, traiter: traiterImage, pause };

/** Le nom sans son extension, pour nommer le SVG qui en vient. */
export const sansExtension = (nom: string): string => nom.replace(/\.[a-z0-9]+$/i, '').trim() || 'image';

/**
 * Convertit les fichiers dans l'ordre. `surChangement` recoit l'etat complet de la liste a chaque pas (une
 * copie : le composant la range telle quelle). `annule()` est relue avant chaque image : une fois vrai, le
 * reste passe a « annule » et le lot se termine ; l'image en cours finit, on ne coupe pas un traceur en plein vol.
 * Rend la liste finale.
 */
export async function convertirLot(
  fichiers: readonly (Blob & { name: string })[], traitement: Traitement, surChangement: (liste: readonly ImageDuLot[]) => void,
  annule: () => boolean, traceur?: Traceur, outils: OutilsLot = OUTILS
): Promise<ImageDuLot[]> {
  const liste: ImageDuLot[] = fichiers.map((f, id) => ({ id, nom: f.name, etat: 'attente' }));
  const dire = () => surChangement(liste.map(i => ({ ...i })));
  dire();
  for (const [k, f] of fichiers.entries()) {
    const image = liste[k];
    if (!image) continue;
    if (annule()) { for (const reste of liste.slice(k)) reste.etat = 'annule'; dire(); break; }
    image.etat = 'encours';
    dire();
    // Le « en cours » se peint avant le calcul, qui fige la page quelques dizaines de millisecondes.
    await outils.pause();
    try {
      const source = await outils.lire(f);
      const r = 'erreur' in source ? source : await outils.traiter(source, traitement, traceur);
      if ('erreur' in r) { image.etat = 'erreur'; image.erreur = r.erreur; } else { image.etat = 'ok'; image.resultat = { svg: r.svg, traces: r.traces, duree: r.duree, resume: resumeConversion(r) }; }
    } catch (e) {
      image.etat = 'erreur';
      image.erreur = e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160);
    }
    dire();
    await outils.pause();
  }
  return liste;
}

// Le catalogue des fonctionnalites du modele v2 (ADR-0012, annexe 8) : la lecture riche, l'ecriture riche et les transformations
// consultent cette liste, dans cet ordre. Une etape ajoute son fichier dans `fonctions/` et UNE ligne ici, a sa place ; elle n'edite
// aucun corps de fonction de la lecture ni de l'ecriture. Vide a l'etape 0 : la lecture riche lit alors comme la lecture plate, et
// aucune feuille ne change en se transformant.
//
// Ordre prevu (une ligne chacune, sans toucher aux autres) : groupes (etape 1), degrades (3), decoupes (5), masques (6), effets (7),
// motifs (9), images (12).

import type { Fonctionnalite } from './fonctionnalites.js';
import { groupes } from './fonctions/groupes.js';
import { degrades } from './fonctions/degrades.js';
import { decoupes } from './fonctions/decoupes.js';
import { masques } from './fonctions/masques.js';
import { effets } from './fonctions/effets.js';
import { motifs } from './fonctions/motifs.js';
import { images } from './fonctions/images.js';

export const FONCTIONNALITES: readonly Fonctionnalite[] = [
  groupes,
  degrades,
  decoupes,
  masques,
  effets,
  motifs,
  images
];

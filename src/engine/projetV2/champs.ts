// Les champs du modele v2, du modele au projet et retour (ADR-0012, annexe 8 §5.1, paquet 1-C ; ADR-0030) : chaque etape qui livre
// un champ de forme y ajoute UNE ligne, et son aller-retour vit dans un fichier a elle (`peinture.ts` pour l'etape 3). Les corps de
// `formeProjet` et `formeDuProjet` (engine/projet.ts) n'ont plus a changer : ils etalent ces lignes, dans cet ordre (celui du format,
// model/projetV2/champs.ts).

import type { FormeProjet } from '../../model/projet.js';
import type { ChampsFormeV2 } from '../../model/projetV2/champs.js';
import type { Forme } from '../editionSvg.js';
import { estDegrade } from '../edition/degrades.js';
import { peintureDuProjet, peintureProjet } from './peinture.js';

/** Une ligne : de la forme du modele vers le projet, et retour ; chacune ne rend que ses champs, et seulement s'ils sont la. */
interface AllerRetour {
  readonly versProjet: (f: Forme) => ChampsFormeV2;
  readonly versModele: (f: FormeProjet) => Partial<Forme>;
}

const ALLERS_RETOURS: readonly AllerRetour[] = [
  // Etape 3 : les degrades. Un motif (etape 9) n'a pas encore de lecteur : aucune forme n'en porte.
  {
    versProjet: f => ({
      ...(estDegrade(f.peintureRemplissage) ? { peintureRemplissage: peintureProjet(f.peintureRemplissage) } : {}),
      ...(estDegrade(f.peintureContour) ? { peintureContour: peintureProjet(f.peintureContour) } : {})
    }),
    versModele: f => ({
      ...(f.peintureRemplissage !== undefined ? { peintureRemplissage: peintureDuProjet(f.peintureRemplissage) } : {}),
      ...(f.peintureContour !== undefined ? { peintureContour: peintureDuProjet(f.peintureContour) } : {})
    })
  }
];

/** Les champs v2 d'une forme du modele, en projet, dans l'ordre du format. */
export const champsV2VersProjet = (f: Forme): ChampsFormeV2 => Object.assign({}, ...ALLERS_RETOURS.map(a => a.versProjet(f))) as ChampsFormeV2;

/** Les champs v2 d'une forme de projet (deja validee), dans le modele. */
export const champsV2VersModele = (f: FormeProjet): Partial<Forme> => Object.assign({}, ...ALLERS_RETOURS.map(a => a.versModele(f))) as Partial<Forme>;

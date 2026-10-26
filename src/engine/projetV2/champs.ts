// Les champs du modele v2, du modele au projet et retour (ADR-0012, annexe 8 §5.1, paquet 1-C ; ADR-0030) : chaque etape qui livre
// un champ de forme y ajoute UNE ligne, et son aller-retour vit dans un fichier a elle (`peinture.ts` pour l'etape 3). Les corps de
// `formeProjet` et `formeDuProjet` (engine/projet.ts) n'ont plus a changer : ils etalent ces lignes, dans cet ordre (celui du format,
// model/projetV2/champs.ts).

import type { FormeProjet } from '../../model/projet.js';
import type { ChampsFormeV2 } from '../../model/projetV2/champs.js';
import type { Forme } from '../editionSvg.js';
import { estDegrade } from '../edition/degrades.js';
import { peintureDuProjet, peintureProjet } from './peinture.js';
import { imageDuProjet, imageProjet, refusImagesProjet } from './image.js';

/** Une ligne : de la forme du modele vers le projet, et retour ; chacune ne rend que ses champs, et seulement s'ils sont la. */
interface AllerRetour {
  readonly versProjet: (f: Forme) => ChampsFormeV2;
  readonly versModele: (f: FormeProjet) => Partial<Forme>;
  /** Ce que la validation du format ne peut pas voir (des octets a decoder), verifie sur tout le dessin avant l'ouverture ; null s'il tient. */
  readonly refus?: (formes: readonly FormeProjet[]) => string | null;
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
  },
  // Etape 12 : l'image integree. Au retour, `d` redevient exactement le rectangle de l'image ; ses octets sont verifies par `refus`
  // (comme a la lecture d'un SVG) avant que `etatDuProjet` ne rouvre le dessin.
  {
    versProjet: f => (f.image !== undefined ? { image: imageProjet(f.image) } : {}),
    versModele: f => {
      if (f.image === undefined) return {};
      const r = imageDuProjet(f.image);
      return 'erreur' in r ? {} : { image: r.image, d: r.d };
    },
    refus: formes => {
      const lues: { octets: number }[] = [];
      for (const f of formes) {
        if (f.image === undefined) continue;
        const r = imageDuProjet(f.image);
        if ('erreur' in r) return r.erreur;
        lues.push(r);
      }
      return refusImagesProjet(lues);
    }
  }
];

/** Les champs v2 d'une forme du modele, en projet, dans l'ordre du format. */
export const champsV2VersProjet = (f: Forme): ChampsFormeV2 => Object.assign({}, ...ALLERS_RETOURS.map(a => a.versProjet(f))) as ChampsFormeV2;

/** Ce qui empeche d'ouvrir les champs v2 d'un dessin de projet deja valide dans sa forme (des octets d'image), ou null. */
export function refusChampsV2(formes: readonly FormeProjet[]): string | null {
  for (const a of ALLERS_RETOURS) { const r = a.refus?.(formes) ?? null; if (r !== null) return r; }
  return null;
}

/** Les champs v2 d'une forme de projet (deja validee), dans le modele. */
export const champsV2VersModele = (f: FormeProjet): Partial<Forme> => Object.assign({}, ...ALLERS_RETOURS.map(a => a.versModele(f))) as Partial<Forme>;

// Les champs du modele v2, du modele au projet et retour (ADR-0012, annexe 8 §5.1, paquet 1-C ; ADR-0030) : chaque etape qui livre
// un champ de forme y ajoute UNE ligne, et son aller-retour vit dans un fichier a elle (`peinture.ts` pour l'etape 3). Les corps de
// `formeProjet` et `formeDuProjet` (engine/projet.ts) n'ont plus a changer : ils etalent ces lignes, dans cet ordre (celui du format,
// model/projetV2/champs.ts).

import type { FormeProjet, GroupeProjet } from '../../model/projet.js';
import type { ChampsFormeV2 } from '../../model/projetV2/champs.js';
import type { Forme, Groupe } from '../editionSvg.js';
import { estDegrade } from '../edition/degrades.js';
import { peintureDuProjet, peintureProjet } from './peinture.js';
import { imageDuProjet, imageProjet, refusImagesProjet } from './image.js';
import { decoupeDuProjet, decoupeProjet } from './decoupe.js';
import { effetsDuProjet, effetsProjet } from './effets.js';

/** Une ligne : de la forme du modele vers le projet, et retour ; chacune ne rend que ses champs, et seulement s'ils sont la. */
interface AllerRetour {
  readonly versProjet: (f: Forme) => ChampsFormeV2;
  readonly versModele: (f: FormeProjet) => Partial<Forme>;
  /** Ce que la validation du format ne peut pas voir (des octets a decoder), verifie sur tout le dessin avant l'ouverture ; null s'il tient. */
  readonly refus?: (formes: readonly FormeProjet[]) => string | null;
}

const ALLERS_RETOURS: readonly AllerRetour[] = [
  // Etape 1 : le groupe parent, un identifiant, tel quel dans les deux sens.
  {
    versProjet: f => (f.parent !== undefined ? { parent: f.parent } : {}),
    versModele: f => (f.parent !== undefined ? { parent: f.parent } : {})
  },
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
  // Etape 7 : les effets, champ pour champ.
  {
    versProjet: f => (f.effets !== undefined ? { effets: effetsProjet(f.effets) } : {}),
    versModele: f => (f.effets !== undefined ? { effets: effetsDuProjet(f.effets) } : {})
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

// ---------------------------------------------------------------- les groupes (etape 1)

/** Un champ v2 d'un groupe au-dela de sa base (decoupe, masque, effets : une ligne par etape, dans l'ordre de `CHAMPS_GROUPE_V2`). */
interface AllerRetourGroupe {
  readonly versProjet: (g: Groupe) => Record<string, unknown>;
  readonly versModele: (g: GroupeProjet) => Partial<Groupe>;
}

/** Une ligne par etape, dans l'ordre de `CHAMPS_GROUPE_V2` (model/projetV2/champs.ts). */
const ALLERS_RETOURS_GROUPE: readonly AllerRetourGroupe[] = [
  // Etape 5 : la decoupe, de la geometrie seule a pleine precision.
  {
    versProjet: g => (g.decoupe ? { decoupe: decoupeProjet(g.decoupe) } : {}),
    versModele: g => (g.decoupe ? { decoupe: decoupeDuProjet(g.decoupe) } : {})
  },
  // Etape 7 : les effets du groupe.
  {
    versProjet: g => (g.effets !== undefined ? { effets: effetsProjet(g.effets) } : {}),
    versModele: g => (g.effets !== undefined ? { effets: effetsDuProjet(g.effets) } : {})
  }
];

/** Un groupe du modele en groupe de projet : sa base dans l'ordre du format, puis ses champs v2. */
export function groupeProjet(g: Groupe): GroupeProjet {
  return Object.assign({
    id: g.id,
    ...(g.parent !== undefined ? { parent: g.parent } : {}),
    ...(g.nom !== undefined ? { nom: g.nom } : {}),
    visible: g.visible,
    verrouille: g.verrouille,
    ...(g.opacite !== undefined ? { opacite: g.opacite } : {}),
    ...(g.origine !== undefined ? { origine: [...g.origine] } : {})
  }, ...ALLERS_RETOURS_GROUPE.map(a => a.versProjet(g))) as GroupeProjet;
}

/** Un groupe de projet (deja valide) en groupe du modele. */
export function groupeDuProjet(g: GroupeProjet): Groupe {
  return Object.assign({
    id: g.id,
    ...(g.parent !== undefined ? { parent: g.parent } : {}),
    ...(g.nom !== undefined ? { nom: g.nom } : {}),
    visible: g.visible,
    verrouille: g.verrouille,
    ...(g.opacite !== undefined ? { opacite: g.opacite } : {}),
    ...(g.origine !== undefined ? { origine: [...g.origine] } : {})
  }, ...ALLERS_RETOURS_GROUPE.map(a => a.versModele(g))) as Groupe;
}

/** Une table de groupes copiee dans un sens, dans l'ordre de ses cles, a etaler ; rien si le dessin n'en a pas. */
export function tableVers<A, B>(t: Readonly<Record<string, A>> | undefined, f: (a: A) => B): { groupes?: Record<string, B> } {
  if (t === undefined) return {};
  const out: Record<string, B> = {};
  for (const [k, v] of Object.entries(t)) out[k] = f(v);
  return { groupes: out };
}

// Les champs du modele v2 dans le projet JSON (ADR-0012, annexe 8 §0 et §5.1, paquet 1-C ; ADR-0030) : chaque etape qui livre un
// champ de forme y ajoute UNE ligne (sa cle, son lecteur, sa garde), et son lecteur vit dans un fichier a elle (`peinture.ts` pour
// l'etape 3). Le corps de `lireForme` (model/projet.ts) n'a plus a changer : il lit ces lignes, dans cet ordre.
//
// Un champ v2 n'existe qu'au format 2 : dans un projet au format 1, il est inconnu, donc ignore (« un champ inconnu n'y entre pas »),
// comme le ferait un programme d'avant lui. Pur ; un lecteur refuse par `o.refuser`, qui remonte jusqu'a `lireProjet` sans lever.

import { lirePeintureProjet, type PeintureProjet } from './peinture.js';
import { lireImageProjet, type ImageIntegreeProjet } from './image.js';

/** Ce que la validation du projet prete a un lecteur de champ : ses gardes, qui refusent en nommant (jamais une exception visible). */
export interface OutilsProjet {
  refuser(raison: string): never;
  texte(v: unknown, quoi: string, max: number): string;
  nombre(v: unknown, quoi: string, min?: number, max?: number): number;
  booleen(v: unknown, quoi: string): boolean;
  tableau(v: unknown, quoi: string, max: number): readonly unknown[];
  objet(v: unknown, quoi: string): Record<string, unknown>;
  choix<T extends string>(v: unknown, quoi: string, permis: readonly T[]): T;
}

/** Les champs v2 d'une forme de projet, tels que les lecteurs les rendent. */
export interface ChampsFormeV2 {
  readonly peintureRemplissage?: PeintureProjet;
  readonly peintureContour?: PeintureProjet;
  readonly image?: ImageIntegreeProjet;
}

/** Une ligne : la cle du champ, son lecteur, et la garde qui le confronte au reste de la forme (deja lue). */
export interface ChampFormeV2 {
  readonly cle: keyof ChampsFormeV2;
  readonly lire: (v: unknown, o: OutilsProjet) => unknown;
  readonly verifier?: (forme: { readonly remplissage: string | null; readonly contour: string | null }, o: OutilsProjet) => void;
}

/** Les champs v2 d'une forme, dans l'ordre ou ils se lisent et s'ecrivent. Une ligne par etape. */
export const CHAMPS_FORME_V2: readonly ChampFormeV2[] = [
  // Etape 3 : les degrades. Sous une peinture non unie, la couleur de repli est obligatoire (annexe 1 §5, I5).
  {
    cle: 'peintureRemplissage', lire: (v, o) => lirePeintureProjet(v, o, 'le dégradé du remplissage'),
    verifier: (f, o) => { if (f.remplissage === null) o.refuser('un dégradé de remplissage n’a pas de couleur de repli'); }
  },
  {
    cle: 'peintureContour', lire: (v, o) => lirePeintureProjet(v, o, 'le dégradé du contour'),
    verifier: (f, o) => { if (f.contour === null) o.refuser('un dégradé de contour n’a pas de couleur de repli'); }
  },
  // Etape 12 : l'image integree. Sa forme est validee ici ; ses octets (nature, dimensions, pixels, 16 Mo par dessin) le sont par le
  // moteur a l'ouverture (engine/projetV2/champs.ts, `refusChampsV2`). Une image ne porte ni remplissage ni contour.
  {
    cle: 'image', lire: (v, o) => { const r = lireImageProjet(v); return 'erreur' in r ? o.refuser(r.erreur) : r.image; },
    verifier: (f, o) => { if (f.remplissage !== null || f.contour !== null) o.refuser('une image porte un remplissage ou un contour'); }
  }
];

/** Les champs v2 presents dans l'objet d'une forme, lus et gardes, dans l'ordre des lignes ; rien au format 1. */
export function lireChampsFormeV2(o: Record<string, unknown>, forme: { readonly remplissage: string | null; readonly contour: string | null }, version: number, outils: OutilsProjet): ChampsFormeV2 {
  if (version < 2) return {};
  const lus: Record<string, unknown> = {};
  for (const c of CHAMPS_FORME_V2) {
    const v = o[c.cle];
    if (v === undefined) continue;
    lus[c.cle] = c.lire(v, outils);
    c.verifier?.(forme, outils);
  }
  return lus as ChampsFormeV2;
}

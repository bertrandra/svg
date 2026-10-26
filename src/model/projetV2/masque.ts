// Un masque d'opacite dans le projet JSON (ADR-0012, etape 6 ; ADR-0030) : le `Masque` du modele (engine/edition/types.ts), champ pour
// champ : son type, sa region dans le repere du plan, et son contenu, des formes et des groupes ENTIERS, peints (couleurs, opacites,
// degrades, images, effets, decoupes et masques imbriques), valides exactement comme ceux du dessin par les gardes que la validation
// du projet prete (`OutilsProjet.forme`, `OutilsProjet.groupes`). Pur ; chaque valeur est bornee, un projet valide se reconstruit dans
// un ordre de champs fixe ; l'arbre (identifiants uniques dans tout le dessin, contiguite) est verifie a l'ouverture par le moteur
// (`verifierDessin`), les octets d'une image du contenu aussi (`refusChampsV2`).

import { t } from '../../util/i18n.js';
import type { OutilsProjet } from './champs.js';
import type { FormeProjet } from '../projet.js';
import type { GroupeProjet } from './groupes.js';

/** Les formes et groupes d'un masque, au plus : la borne de la lecture d'un SVG (engine/edition/resolution.ts, `NOEUDS_DEFS_MAX`). */
export const NOEUDS_MASQUE_PROJET_MAX = 20_000;
/** L'imbrication des masques, au plus : la borne de la lecture d'un SVG (`PROFONDEUR_DEFS_MAX`). */
export const PROFONDEUR_MASQUE_PROJET_MAX = 8;

export interface RegionProjet { readonly x: number; readonly y: number; readonly l: number; readonly h: number }

export interface MasqueProjet {
  readonly type: 'luminance' | 'alpha';
  readonly region: RegionProjet;
  readonly formes: readonly FormeProjet[];
  readonly groupes?: Readonly<Record<string, GroupeProjet>>;
}

// Les masques en cours de lecture : un masque se lit par les groupes de son contenu, qui portent eux-memes des masques ; la profondeur
// ne peut pas passer par les gardes pretees. Remise a zero a chaque sortie, meme sur un refus (qui leve jusqu'a `lireProjet`).
let enCours = 0;

/** Le masque d'un groupe de projet, reconstruit champ par champ. */
export function lireMasqueProjet(v: unknown, o: OutilsProjet): MasqueProjet {
  if (enCours >= PROFONDEUR_MASQUE_PROJET_MAX) o.refuser(t('des masques emboîtés sur plus de {max} niveaux', { max: PROFONDEUR_MASQUE_PROJET_MAX }));
  enCours++;
  try {
    const x = o.objet(v, t('le masque d’un groupe'));
    const type = o.choix(x['type'], t('le type d’un masque'), ['luminance', 'alpha'] as const);
    const r = o.objet(x['region'], t('la région d’un masque'));
    const region: RegionProjet = {
      x: o.nombre(r['x'], t('la région d’un masque')), y: o.nombre(r['y'], t('la région d’un masque')),
      l: o.nombre(r['l'], t('la largeur de la région d’un masque'), 0), h: o.nombre(r['h'], t('la hauteur de la région d’un masque'), 0)
    };
    const vus = new Set<string>();
    const formes = o.tableau(x['formes'], t('les formes d’un masque'), NOEUDS_MASQUE_PROJET_MAX).map((brute, i) => {
      const f = o.forme(brute, i);
      if (vus.has(f.id)) o.refuser(t('deux formes d’un masque portent l’identifiant « {id} »', { id: f.id }));
      vus.add(f.id);
      return f;
    });
    const groupes = x['groupes'] !== undefined ? o.groupes(x['groupes']) : undefined;
    if (groupes && Object.keys(groupes).length + formes.length > NOEUDS_MASQUE_PROJET_MAX) o.refuser(t('un masque compte plus de {max} formes et groupes', { max: NOEUDS_MASQUE_PROJET_MAX }));
    for (const f of formes) {
      if (f.parent !== undefined && !(groupes && Object.prototype.hasOwnProperty.call(groupes, f.parent))) o.refuser(t('une forme d’un masque est dans un groupe absent'));
      if (groupes && Object.prototype.hasOwnProperty.call(groupes, f.id)) o.refuser(t('une forme et un groupe d’un masque portent l’identifiant « {id} »', { id: f.id }));
    }
    return { type, region, formes, ...(groupes ? { groupes } : {}) };
  } finally {
    enCours--;
  }
}

// Un motif dans le projet JSON (ADR-0012, etape 9 ; ADR-0030) : le `Motif` du modele (engine/edition/types.ts), champ pour champ : sa
// tuile (x, y, largeur, hauteur, dans le repere du motif), sa matrice, et son contenu, des formes et des groupes ENTIERS, peints, valides
// exactement comme ceux du dessin par les gardes que la validation du projet prete (`OutilsProjet.forme`, `OutilsProjet.groupes`), dans
// le repere de la tuile. Les identifiants d'une tuile sont uniques dans la tuile (un espace a part : une peinture se partage). Une image
// n'y entre pas (la lecture d'un SVG la refuse aussi). Pur ; chaque valeur est bornee, un projet valide se reconstruit dans un ordre de
// champs fixe.

import { t } from '../../util/i18n.js';
import type { OutilsProjet } from './champs.js';
import type { FormeProjet } from '../projet.js';
import type { GroupeProjet } from './groupes.js';

/** Les formes et groupes d'une tuile, au plus : la borne de la lecture d'un SVG (engine/edition/resolution.ts, `NOEUDS_DEFS_MAX`). */
export const NOEUDS_MOTIF_PROJET_MAX = 20_000;
/** L'imbrication des motifs, au plus : la borne de la lecture d'un SVG (`PROFONDEUR_DEFS_MAX`). */
export const PROFONDEUR_MOTIF_PROJET_MAX = 8;
/** La plus petite tuile : celle de la lecture d'un SVG (engine/edition/fonctions/motifs.ts, `TUILE_MIN`). */
export const TUILE_PROJET_MIN = 0.01;

export interface MotifProjet {
  readonly genre: 'motif';
  readonly x: number; readonly y: number; readonly l: number; readonly h: number;
  readonly matrice?: readonly [number, number, number, number, number, number];
  readonly formes: readonly FormeProjet[];
  readonly groupes?: Readonly<Record<string, GroupeProjet>>;
}

// Les motifs en cours de lecture : un motif se lit par les formes de sa tuile, qui portent elles-memes des motifs ; la profondeur ne peut
// pas passer par les gardes pretees. Remise a zero a chaque sortie, meme sur un refus (qui leve jusqu'a `lireProjet`).
let enCours = 0;

/** Un motif de projet (une peinture dont le genre est « motif »), reconstruit champ par champ ; `quoi` le nomme dans un refus. */
export function lireMotifProjet(p: Record<string, unknown>, o: OutilsProjet, quoi: string): MotifProjet {
  if (enCours >= PROFONDEUR_MOTIF_PROJET_MAX) o.refuser(t('des motifs emboîtés sur plus de {max} niveaux', { max: PROFONDEUR_MOTIF_PROJET_MAX }));
  enCours++;
  try {
    const x = o.nombre(p['x'], t('la tuile de {quoi}', { quoi })), y = o.nombre(p['y'], t('la tuile de {quoi}', { quoi }));
    const l = o.nombre(p['l'], t('la largeur de la tuile de {quoi}', { quoi }), TUILE_PROJET_MIN), h = o.nombre(p['h'], t('la hauteur de la tuile de {quoi}', { quoi }), TUILE_PROJET_MIN);
    let matrice: MotifProjet['matrice'];
    if (p['matrice'] !== undefined) {
      const liste = o.tableau(p['matrice'], t('la matrice de {quoi}', { quoi }), 6);
      if (liste.length !== 6) o.refuser(t('la matrice de {quoi} n’a pas six valeurs', { quoi }));
      matrice = liste.map(v => o.nombre(v, t('la matrice de {quoi}', { quoi }))) as unknown as MotifProjet['matrice'];
    }
    const vus = new Set<string>();
    const formes = o.tableau(p['formes'], t('les formes de {quoi}', { quoi }), NOEUDS_MOTIF_PROJET_MAX).map((brute, i) => {
      const f = o.forme(brute, i);
      if (vus.has(f.id)) o.refuser(t('deux formes de {quoi} portent l’identifiant « {id} »', { quoi, id: f.id }));
      if (f.image !== undefined) o.refuser(t('une image dans la tuile de {quoi}', { quoi }));
      vus.add(f.id);
      return f;
    });
    if (!formes.length) o.refuser(t('la tuile de {quoi} est vide', { quoi }));
    const groupes = p['groupes'] !== undefined ? o.groupes(p['groupes']) : undefined;
    if (groupes && Object.keys(groupes).length + formes.length > NOEUDS_MOTIF_PROJET_MAX) o.refuser(t('{quoi} compte plus de {max} formes et groupes', { quoi, max: NOEUDS_MOTIF_PROJET_MAX }));
    for (const f of formes) {
      if (f.parent !== undefined && !(groupes && Object.prototype.hasOwnProperty.call(groupes, f.parent))) o.refuser(t('une forme de {quoi} est dans un groupe absent', { quoi }));
      if (groupes && Object.prototype.hasOwnProperty.call(groupes, f.id)) o.refuser(t('une forme et un groupe de {quoi} portent l’identifiant « {id} »', { quoi, id: f.id }));
    }
    return { genre: 'motif', x, y, l, h, ...(matrice ? { matrice } : {}), formes, ...(groupes ? { groupes } : {}) };
  } finally {
    enCours--;
  }
}

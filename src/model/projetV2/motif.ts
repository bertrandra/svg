// Un motif dans le projet JSON (ADR-0012, etape 9 ; ADR-0030) : le `Motif` du modele (engine/edition/types.ts), champ pour champ : sa
// tuile (x, y, largeur, hauteur, dans le repere du motif), sa matrice, et son contenu, des formes et des groupes ENTIERS, peints, valides
// exactement comme ceux du dessin par les gardes que la validation du projet prete (`OutilsProjet.forme`, `OutilsProjet.groupes`), dans
// le repere de la tuile. Les identifiants d'une tuile sont uniques dans la tuile (un espace a part : une peinture se partage). Une image
// n'y entre pas (la lecture d'un SVG la refuse aussi). Pur ; chaque valeur est bornee, un projet valide se reconstruit dans un ordre de
// champs fixe.

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
  if (enCours >= PROFONDEUR_MOTIF_PROJET_MAX) o.refuser('des motifs emboîtés sur plus de ' + PROFONDEUR_MOTIF_PROJET_MAX + ' niveaux');
  enCours++;
  try {
    const x = o.nombre(p['x'], 'la tuile de ' + quoi), y = o.nombre(p['y'], 'la tuile de ' + quoi);
    const l = o.nombre(p['l'], 'la largeur de la tuile de ' + quoi, TUILE_PROJET_MIN), h = o.nombre(p['h'], 'la hauteur de la tuile de ' + quoi, TUILE_PROJET_MIN);
    let matrice: MotifProjet['matrice'];
    if (p['matrice'] !== undefined) {
      const t = o.tableau(p['matrice'], 'la matrice de ' + quoi, 6);
      if (t.length !== 6) o.refuser('la matrice de ' + quoi + ' n’a pas six valeurs');
      matrice = t.map(v => o.nombre(v, 'la matrice de ' + quoi)) as unknown as MotifProjet['matrice'];
    }
    const vus = new Set<string>();
    const formes = o.tableau(p['formes'], 'les formes de ' + quoi, NOEUDS_MOTIF_PROJET_MAX).map((brute, i) => {
      const f = o.forme(brute, i);
      if (vus.has(f.id)) o.refuser('deux formes de ' + quoi + ' portent l’identifiant « ' + f.id + ' »');
      if (f.image !== undefined) o.refuser('une image dans la tuile de ' + quoi);
      vus.add(f.id);
      return f;
    });
    if (!formes.length) o.refuser('la tuile de ' + quoi + ' est vide');
    const groupes = p['groupes'] !== undefined ? o.groupes(p['groupes']) : undefined;
    if (groupes && Object.keys(groupes).length + formes.length > NOEUDS_MOTIF_PROJET_MAX) o.refuser(quoi + ' compte plus de ' + NOEUDS_MOTIF_PROJET_MAX + ' formes et groupes');
    for (const f of formes) {
      if (f.parent !== undefined && !(groupes && Object.prototype.hasOwnProperty.call(groupes, f.parent))) o.refuser('une forme de ' + quoi + ' est dans un groupe absent');
      if (groupes && Object.prototype.hasOwnProperty.call(groupes, f.id)) o.refuser('une forme et un groupe de ' + quoi + ' portent l’identifiant « ' + f.id + ' »');
    }
    return { genre: 'motif', x, y, l, h, ...(matrice ? { matrice } : {}), formes, ...(groupes ? { groupes } : {}) };
  } finally {
    enCours--;
  }
}

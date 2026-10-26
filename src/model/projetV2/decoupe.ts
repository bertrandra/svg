// Une decoupe dans le projet JSON (ADR-0012, etape 5 ; ADR-0030) : le contenu d'un <clipPath>, comme le modele le garde (`Decoupe`,
// engine/edition/types.ts) : des feuilles de geometrie seule (identifiant, trace, regle, visibilite, verrou, groupe) et, pour une
// decoupe elle-meme decoupee, les groupes qui portent ces decoupes. Une feuille de decoupe n'a pas de peinture (elle ne compte pas) :
// le projet n'en ecrit aucune, le moteur la refixe au retour (engine/projetV2/decoupe.ts). Pur ; chaque valeur est bornee, un projet
// valide se reconstruit dans un ordre de champs fixe, l'arbre (identifiants uniques dans tout le dessin, contiguite) est verifie a
// l'ouverture par le moteur (`verifierDessin`).

import type { OutilsProjet } from './champs.js';

/** Les feuilles et groupes d'une decoupe, au plus : la borne de la lecture d'un SVG (engine/edition/resolution.ts, `NOEUDS_DEFS_MAX`). */
export const NOEUDS_DECOUPE_PROJET_MAX = 20_000;
/** L'imbrication des decoupes, au plus : la borne de la lecture d'un SVG (`PROFONDEUR_DEFS_MAX`). */
export const PROFONDEUR_DECOUPE_PROJET_MAX = 8;

export interface FeuilleDecoupeProjet {
  readonly id: string;
  readonly d: string;
  readonly regle: 'nonzero' | 'evenodd';
  readonly visible: boolean;
  readonly verrouille: boolean;
  readonly parent?: string;
}
export interface GroupeDecoupeProjet {
  readonly id: string;
  readonly parent?: string;
  readonly visible: boolean;
  readonly verrouille: boolean;
  readonly decoupe?: DecoupeProjet;
}
export interface DecoupeProjet {
  readonly formes: readonly FeuilleDecoupeProjet[];
  readonly groupes?: Readonly<Record<string, GroupeDecoupeProjet>>;
}

/** Un identifiant de l'arbre, ou le refus nomme. */
function identifiant(v: unknown, o: OutilsProjet, quoi: string): string {
  const s = o.texte(v, quoi, 64);
  return o.identifiant.test(s) ? s : o.refuser(quoi + ' est mal désigné');
}

/** La decoupe d'un groupe de projet, reconstruite champ par champ ; `niveau` compte les decoupes qui l'enveloppent. */
export function lireDecoupeProjet(v: unknown, o: OutilsProjet, niveau = 0): DecoupeProjet {
  if (niveau >= PROFONDEUR_DECOUPE_PROJET_MAX) o.refuser('des découpes emboîtées sur plus de ' + PROFONDEUR_DECOUPE_PROJET_MAX + ' niveaux');
  const x = o.objet(v, 'la découpe d’un groupe');
  const formes = o.tableau(x['formes'], 'les formes d’une découpe', NOEUDS_DECOUPE_PROJET_MAX).map((brute): FeuilleDecoupeProjet => {
    const f = o.objet(brute, 'une forme de découpe');
    return {
      id: identifiant(f['id'], o, 'l’identifiant d’une forme de découpe'),
      d: o.chemin(f['d'], 'le tracé d’une forme de découpe'),
      regle: o.choix(f['regle'], 'la règle d’une forme de découpe', ['nonzero', 'evenodd'] as const),
      visible: o.booleen(f['visible'], 'la visibilité d’une forme de découpe'),
      verrouille: o.booleen(f['verrouille'], 'le verrouillage d’une forme de découpe'),
      ...(f['parent'] !== undefined ? { parent: identifiant(f['parent'], o, 'le groupe d’une forme de découpe') } : {})
    };
  });
  let groupes: Record<string, GroupeDecoupeProjet> | undefined;
  if (x['groupes'] !== undefined) {
    const t = o.objet(x['groupes'], 'les groupes d’une découpe');
    const cles = Object.keys(t);
    if (!cles.length) o.refuser('la table des groupes d’une découpe est vide (elle doit être absente)');
    if (cles.length + formes.length > NOEUDS_DECOUPE_PROJET_MAX) o.refuser('une découpe compte plus de ' + NOEUDS_DECOUPE_PROJET_MAX + ' formes et groupes');
    groupes = {};
    for (const cle of cles) {
      const g = o.objet(t[cle], 'un groupe de découpe');
      const id = identifiant(g['id'], o, 'l’identifiant d’un groupe de découpe');
      if (id !== cle) o.refuser('le groupe de découpe rangé sous « ' + cle.slice(0, 20) + ' » est mal désigné');
      groupes[cle] = {
        id,
        ...(g['parent'] !== undefined ? { parent: identifiant(g['parent'], o, 'le parent d’un groupe de découpe') } : {}),
        visible: o.booleen(g['visible'], 'la visibilité d’un groupe de découpe'),
        verrouille: o.booleen(g['verrouille'], 'le verrouillage d’un groupe de découpe'),
        ...(g['decoupe'] !== undefined ? { decoupe: lireDecoupeProjet(g['decoupe'], o, niveau + 1) } : {})
      };
    }
  }
  const dans = (p: string | undefined): boolean => p === undefined || (groupes !== undefined && Object.prototype.hasOwnProperty.call(groupes, p));
  for (const f of formes) if (!dans(f.parent)) o.refuser('une forme de découpe est dans un groupe absent');
  for (const g of Object.values(groupes ?? {})) if (!dans(g.parent)) o.refuser('un groupe de découpe a un parent absent');
  return groupes ? { formes, groupes } : { formes };
}

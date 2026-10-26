// Une decoupe dans le projet JSON (ADR-0012, etape 5 ; ADR-0030) : le contenu d'un <clipPath>, comme le modele le garde (`Decoupe`,
// engine/edition/types.ts) : des feuilles de geometrie seule (identifiant, trace, regle, visibilite, verrou, groupe) et, pour une
// decoupe elle-meme decoupee, les groupes qui portent ces decoupes. Une feuille de decoupe n'a pas de peinture (elle ne compte pas) :
// le projet n'en ecrit aucune, le moteur la refixe au retour (engine/projetV2/decoupe.ts). Pur ; chaque valeur est bornee, un projet
// valide se reconstruit dans un ordre de champs fixe, l'arbre (identifiants uniques dans tout le dessin, contiguite) est verifie a
// l'ouverture par le moteur (`verifierDessin`).

import { t } from '../../util/i18n.js';
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
  return o.identifiant.test(s) ? s : o.refuser(t('{quoi} est mal désigné', { quoi }));
}

/** La decoupe d'un groupe de projet, reconstruite champ par champ ; `niveau` compte les decoupes qui l'enveloppent. */
export function lireDecoupeProjet(v: unknown, o: OutilsProjet, niveau = 0): DecoupeProjet {
  if (niveau >= PROFONDEUR_DECOUPE_PROJET_MAX) o.refuser(t('des découpes emboîtées sur plus de {max} niveaux', { max: PROFONDEUR_DECOUPE_PROJET_MAX }));
  const x = o.objet(v, t('la découpe d’un groupe'));
  const formes = o.tableau(x['formes'], t('les formes d’une découpe'), NOEUDS_DECOUPE_PROJET_MAX).map((brute): FeuilleDecoupeProjet => {
    const f = o.objet(brute, t('une forme de découpe'));
    return {
      id: identifiant(f['id'], o, t('l’identifiant d’une forme de découpe')),
      d: o.chemin(f['d'], t('le tracé d’une forme de découpe')),
      regle: o.choix(f['regle'], t('la règle d’une forme de découpe'), ['nonzero', 'evenodd'] as const),
      visible: o.booleen(f['visible'], t('la visibilité d’une forme de découpe')),
      verrouille: o.booleen(f['verrouille'], t('le verrouillage d’une forme de découpe')),
      ...(f['parent'] !== undefined ? { parent: identifiant(f['parent'], o, t('le groupe d’une forme de découpe')) } : {})
    };
  });
  let groupes: Record<string, GroupeDecoupeProjet> | undefined;
  if (x['groupes'] !== undefined) {
    const table = o.objet(x['groupes'], t('les groupes d’une découpe'));
    const cles = Object.keys(table);
    if (!cles.length) o.refuser(t('la table des groupes d’une découpe est vide (elle doit être absente)'));
    if (cles.length + formes.length > NOEUDS_DECOUPE_PROJET_MAX) o.refuser(t('une découpe compte plus de {max} formes et groupes', { max: NOEUDS_DECOUPE_PROJET_MAX }));
    groupes = {};
    for (const cle of cles) {
      const g = o.objet(table[cle], t('un groupe de découpe'));
      const id = identifiant(g['id'], o, t('l’identifiant d’un groupe de découpe'));
      if (id !== cle) o.refuser(t('le groupe de découpe rangé sous « {cle} » est mal désigné', { cle: cle.slice(0, 20) }));
      groupes[cle] = {
        id,
        ...(g['parent'] !== undefined ? { parent: identifiant(g['parent'], o, t('le parent d’un groupe de découpe')) } : {}),
        visible: o.booleen(g['visible'], t('la visibilité d’un groupe de découpe')),
        verrouille: o.booleen(g['verrouille'], t('le verrouillage d’un groupe de découpe')),
        ...(g['decoupe'] !== undefined ? { decoupe: lireDecoupeProjet(g['decoupe'], o, niveau + 1) } : {})
      };
    }
  }
  const dans = (p: string | undefined): boolean => p === undefined || (groupes !== undefined && Object.prototype.hasOwnProperty.call(groupes, p));
  for (const f of formes) if (!dans(f.parent)) o.refuser(t('une forme de découpe est dans un groupe absent'));
  for (const g of Object.values(groupes ?? {})) if (!dans(g.parent)) o.refuser(t('un groupe de découpe a un parent absent'));
  return groupes ? { formes, groupes } : { formes };
}

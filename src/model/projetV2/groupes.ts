// Les groupes dans le projet JSON (ADR-0012, etape 1 ; ADR-0030) : la table `dessin.groupes`, champ pour champ celle du modele
// (engine/edition/types.ts, `Groupe`), absente d'un dessin plat. La validation borne et verifie ce qu'elle peut sans le moteur
// (chaque cle est l'identifiant de son groupe, chaque parent existe, la table n'est jamais vide) ; l'arbre lui-meme (cycles,
// profondeur, contiguite) est verifie a l'ouverture par le moteur (`verifierDessin`, engine/projet.ts). Comme tout champ v2, la
// table n'existe qu'au format 2 : un projet au format 1 qui en porterait une la voit ignoree (model/projet.ts). Pur.

import { CHAMPS_GROUPE_V2, type ChampsGroupeV2, type OutilsProjet } from './champs.js';

/** Un groupe du projet : sa base (etape 1), puis ce que les etapes suivantes ajoutent (`ChampsGroupeV2`). */
export type GroupeProjet = {
  readonly id: string;
  readonly parent?: string;
  readonly nom?: string;
  readonly visible: boolean;
  readonly verrouille: boolean;
  readonly opacite?: number;
  readonly origine?: readonly string[];
} & ChampsGroupeV2;

/** Ce qu'un projet porte de groupes au plus : la borne de la lecture d'un SVG (annexe 5 §2). */
export const GROUPES_PROJET_MAX = 20_000;
/** La longueur d'un nom de groupe : celle que la lecture garde. */
export const NOM_GROUPE_PROJET_MAX = 200;

/**
 * La table des groupes d'un projet, reconstruite dans l'ordre de ses cles et l'ordre des champs du format. `origines` : la lecture
 * des provenances d'une forme (model/projet.ts), la meme pour un groupe.
 */
export function lireGroupesProjet(v: unknown, o: OutilsProjet, origines: (v: unknown) => readonly string[]): Readonly<Record<string, GroupeProjet>> {
  const t = o.objet(v, 'les groupes du dessin');
  const cles = Object.keys(t);
  if (!cles.length) o.refuser('la table des groupes est vide (elle doit être absente)');
  if (cles.length > GROUPES_PROJET_MAX) o.refuser('le dessin compte plus de ' + GROUPES_PROJET_MAX + ' groupes');
  const out: Record<string, GroupeProjet> = {};
  for (const cle of cles) {
    const g = o.objet(t[cle], 'un groupe du dessin');
    const id = o.texte(g['id'], 'l’identifiant d’un groupe', 64);
    if (!o.identifiant.test(id) || id !== cle) o.refuser('le groupe rangé sous « ' + cle.slice(0, 20) + ' » est mal désigné');
    const parent = g['parent'] === undefined ? undefined : o.texte(g['parent'], 'le parent d’un groupe', 64);
    const nom = g['nom'] === undefined ? undefined : o.texte(g['nom'], 'le nom d’un groupe', NOM_GROUPE_PROJET_MAX);
    const opacite = g['opacite'] === undefined ? undefined : o.nombre(g['opacite'], 'l’opacité d’un groupe', 0, 1);
    if (opacite === 1) o.refuser('l’opacité pleine d’un groupe ne s’écrit pas');
    const base: Record<string, unknown> = {
      id,
      ...(parent !== undefined ? { parent } : {}),
      ...(nom !== undefined ? { nom } : {}),
      visible: o.booleen(g['visible'], 'la visibilité d’un groupe'),
      verrouille: o.booleen(g['verrouille'], 'le verrouillage d’un groupe'),
      ...(opacite !== undefined ? { opacite } : {}),
      ...(g['origine'] !== undefined ? { origine: origines(g['origine']) } : {})
    };
    for (const c of CHAMPS_GROUPE_V2) if (g[c.cle] !== undefined) base[c.cle] = c.lire(g[c.cle], o);
    out[cle] = base as GroupeProjet;
  }
  for (const g of Object.values(out)) {
    if (g.parent !== undefined && !Object.prototype.hasOwnProperty.call(out, g.parent)) o.refuser('le groupe « ' + g.id + ' » a un parent absent');
  }
  return out;
}

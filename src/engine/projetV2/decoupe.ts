// Une decoupe, du modele au projet et retour (ADR-0012, etape 5 ; ADR-0030) : les feuilles de decoupe gardent leur geometrie a pleine
// precision (identifiant, trace, regle, visibilite, verrou, groupe) ; leur peinture, qui ne compte pas, n'est pas ecrite et se refixe
// au retour (`feuilleDeDecoupe`). Les groupes d'une decoupe decoupee suivent, recursivement. Pur ; l'aller-retour est exact pour
// toute decoupe que la lecture ou `creerDecoupe` produisent.

import type { DecoupeProjet, FeuilleDecoupeProjet, GroupeDecoupeProjet } from '../../model/projetV2/decoupe.js';
import { feuilleDeDecoupe, type Decoupe, type Forme, type Groupe } from '../editionSvg.js';
import { ecrireCheminProjet, lireCheminProjet } from './chemin.js';

/** Une decoupe du modele en decoupe de projet. */
export function decoupeProjet(dec: Decoupe): DecoupeProjet {
  const c = dec.contenu;
  const formes = c.formes.map((f): FeuilleDecoupeProjet => ({
    id: f.id, d: ecrireCheminProjet(f.d), regle: f.regle, visible: f.visible, verrouille: f.verrouille, ...(f.parent !== undefined ? { parent: f.parent } : {})
  }));
  if (!c.groupes) return { formes };
  const groupes: Record<string, GroupeDecoupeProjet> = {};
  for (const [k, g] of Object.entries(c.groupes)) {
    groupes[k] = { id: g.id, ...(g.parent !== undefined ? { parent: g.parent } : {}), visible: g.visible, verrouille: g.verrouille, ...(g.decoupe ? { decoupe: decoupeProjet(g.decoupe) } : {}) };
  }
  return { formes, groupes };
}

/** Une decoupe de projet (deja validee) en decoupe du modele. */
export function decoupeDuProjet(dec: DecoupeProjet): Decoupe {
  const formes = dec.formes.map((f): Forme => feuilleDeDecoupe(f.id, lireCheminProjet(f.d), f.regle, f.parent, f.visible, f.verrouille));
  if (!dec.groupes) return { contenu: { formes } };
  const groupes: Record<string, Groupe> = {};
  for (const [k, g] of Object.entries(dec.groupes)) {
    groupes[k] = { id: g.id, ...(g.parent !== undefined ? { parent: g.parent } : {}), visible: g.visible, verrouille: g.verrouille, ...(g.decoupe ? { decoupe: decoupeDuProjet(g.decoupe) } : {}) };
  }
  return { contenu: { formes, groupes } };
}

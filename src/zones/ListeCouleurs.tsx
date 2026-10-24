// La liste des couleurs de « Par couleur », fenetree au-dela de `SEUIL_COULEURS` lignes (ADR-0008 : un dessin
// issu d'une photo compte des milliers de couleurs, et chaque ligne coute cinq boutons).
//
// Contrairement aux calques, la liste est elle-meme le conteneur qui defile (hauteur maximale de 260 px) :
// les lignes absentes se tiennent par deux cales de leur hauteur (un `padding` ne convient pas : avec une
// hauteur maximale, il gonflerait la liste). Au-dessous du seuil, le DOM est exactement celui d'avant : une
// liste, ses lignes, rien d'autre. Retirer la ligne qui a le focus ne ramene pas le defilement en arriere
// (deux tests de navigateur le gardent), contrairement aux calques, dont la liste ne defile pas elle-meme.

import { memo, type ReactElement } from 'react';
import type { GroupeCouleur, SurCouleur } from '../engine/editionSvg.js';
import { au } from '../util/tableaux.js';
import { useFenetreDefilante } from './Fenetre.js';
import { LigneCouleur, type ActionsLigne } from './LigneCouleur.js';
import type { SuiviCouleur } from './actionsCouleur.js';
import type { Teinte } from './typesEditeur.js';

/** Au-dela de ce nombre de couleurs, la liste ne dessine que les lignes qu'on voit et quelques-unes de marge. */
export const SEUIL_COULEURS = 100;

interface Proprietes {
  groupes: readonly GroupeCouleur[];
  choisies: ReadonlySet<string>;
  sur: SurCouleur;
  nuancier: readonly Teinte[];
  actions: ActionsLigne;
  suivi: SuiviCouleur | null;
}

export const ListeCouleurs = memo(function ListeCouleurs({ groupes, choisies, sur, nuancier, actions, suivi }: Proprietes) {
  const total = groupes.length;
  const { liste, fenetre, actif } = useFenetreDefilante<HTMLUListElement>(total, SEUIL_COULEURS);
  // La ligne qu'on recolore garde sa cle d'avant le geste, sans quoi elle serait remontee et le selecteur natif se fermerait.
  const cleDe = (g: GroupeCouleur) => (suivi && g.couleur === suivi.vers && !groupes.some(x => x.couleur === suivi.cle) ? suivi.cle : g.couleur);
  const lignes: ReactElement[] = [];
  // Les cales gardent la place des lignes absentes ; la gouttiere de 1 px entre deux elements fait partie du pas.
  if (actif && fenetre.haut > 1) lignes.push(<li key="cale-haut" data-cale="" aria-hidden="true" style={{ height: fenetre.haut - 1 }} />);
  for (let i = fenetre.debut; i < fenetre.fin; i++) {
    const g = au(groupes, i);
    const choisie = g.libres.length > 0 && g.libres.every(id => choisies.has(id));
    lignes.push(<LigneCouleur key={cleDe(g)} g={g} choisie={choisie} sur={sur} nuancier={nuancier} actions={actions} rang={i + 1} taille={actif ? total : 0} />);
  }
  if (actif && fenetre.bas > 0) lignes.push(<li key="cale-bas" data-cale="" aria-hidden="true" style={{ height: fenetre.bas }} />);
  return (
    <ul className="par-couleur" ref={liste}>
      {lignes}
    </ul>
  );
});

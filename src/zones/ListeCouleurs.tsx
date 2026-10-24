// La liste des couleurs de « Par couleur », fenetree au-dela de `SEUIL_COULEURS` lignes (ADR-0008 : un dessin
// issu d'une photo compte des milliers de couleurs, et chaque ligne coute cinq boutons).
//
// Contrairement aux calques, la liste est elle-meme le conteneur qui defile (hauteur maximale de 260 px) :
// les lignes absentes se tiennent par deux cales de leur hauteur (un `padding` ne convient pas : avec une
// hauteur maximale, il gonflerait la liste). Au-dessous du seuil, le DOM est exactement celui d'avant : une
// liste, ses lignes, rien d'autre. Retirer la ligne qui a le focus ne ramene pas le defilement en arriere
// (deux tests de navigateur le gardent), contrairement aux calques, dont la liste ne defile pas elle-meme.
// La ligne dont le selecteur de couleur est ouvert reste dessinee meme si son nouveau rang la sort de la fenetre.

import { memo, type ReactElement } from 'react';
import type { GroupeCouleur, SurCouleur } from '../engine/editionSvg.js';
import { segmentsFenetre } from '../util/fenetre.js';
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
  const { liste, fenetre, pas, actif } = useFenetreDefilante<HTMLUListElement>(total, SEUIL_COULEURS);
  // La ligne qu'on recolore garde sa cle d'avant le geste, sans quoi elle serait remontee et le selecteur natif se fermerait.
  const cleDe = (g: GroupeCouleur) => (suivi && g.couleur === suivi.vers && !groupes.some(x => x.couleur === suivi.cle) ? suivi.cle : g.couleur);
  // Recolorer change le rang de la ligne (le tri suit le nombre de formes, puis le code) : si elle sort de la fenetre,
  // elle resterait sans etre dessinee et le selecteur se fermerait sous le doigt. On la garde tant que le geste dure.
  const epingle = actif && suivi ? groupes.findIndex(g => g.couleur === suivi.vers) : -1;
  // Les cales gardent la place des lignes absentes ; la gouttiere de 1 px entre deux elements fait partie du pas.
  const lignes: ReactElement[] = segmentsFenetre(fenetre, total, pas, epingle >= 0 ? epingle : null).map(sg => {
    if (sg.type === 'cale') return <li key={'cale-' + sg.lieu} data-cale="" aria-hidden="true" style={{ height: sg.hauteur }} />;
    const g = au(groupes, sg.index);
    const choisie = g.libres.length > 0 && g.libres.every(id => choisies.has(id));
    return <LigneCouleur key={cleDe(g)} g={g} choisie={choisie} sur={sur} nuancier={nuancier} actions={actions} rang={sg.index + 1} taille={actif ? total : 0} />;
  });
  return (
    <ul className="par-couleur" ref={liste}>
      {lignes}
    </ul>
  );
});

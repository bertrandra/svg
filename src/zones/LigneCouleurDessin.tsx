// Une ligne de « Recolorer le dessin » : une couleur, la changer partout, choisir ses formes, la remplacer par une
// teinte du nuancier (un menu a pastilles : un select natif, repete par couleur, est lent a parcourir et ne montre pas les teintes).
//
// Comme `LigneCouleur`, la ligne ne lit que ses proprietes et des verbes stables : memoisee, elle ne se redessine que
// si SA couleur change. Les options du nuancier sont le gros de son poids (une dizaine de noeuds par teinte) : c'est
// ce que la fenetre evite de dessiner des milliers de fois.

import { memo } from 'react';
import type { CouleurDuDessin } from '../engine/editionSvg.js';
import { estHex } from './aidesEditeur.js';
import { MenuDeroulant } from './commun/Menu.js';
import type { ActionsCouleurDessin } from './actionsCouleursDessin.js';
import type { Teinte } from './typesEditeur.js';
import { t } from '../util/i18n.js';

interface Proprietes {
  c: CouleurDuDessin;
  nuancier: readonly Teinte[];
  actions: ActionsCouleurDessin;
  /** Le rang de la ligne (de 1) et la taille de la liste, pour une liste fenetree ; `taille` 0 : liste entiere, rien a dire de plus. */
  rang: number;
  taille: number;
}

export const LigneCouleurDessin = memo(function LigneCouleurDessin({ c, nuancier, actions, rang, taille }: Proprietes) {
  // Une couleur du nuancier se dit par son nom avant son code (« Rouge #C81E28 ») ; une teinte sans nom n'a que son code.
  const teinte = nuancier.find(t => t.hex === c.couleur.toLowerCase() && t.nom !== t.hex);
  return (
    <li aria-posinset={taille ? rang : undefined} aria-setsize={taille || undefined}>
      <input type="color" aria-label={t('Remplacer {couleur}', { couleur: c.couleur })} value={estHex(c.couleur) ? c.couleur : '#000000'}
        onClick={actions.debuterRecolorer} onChange={e => actions.recolorer(c.couleur, e.target.value, rang)} onBlur={actions.finirRecolorer} />
      <button type="button" className="discret couleur-code" title={t('Sélectionner les formes de cette couleur')} onClick={() => actions.choisir(c.couleur)}>
        {teinte ? <><span className="couleur-nom">{t(teinte.nom)}</span> </> : null}<code>{c.couleur.toUpperCase()}</code> <span className="couleur-compte">· {c.formes}</span>
      </button>
      {nuancier.length ? (
        <MenuDeroulant etiquette={t('Remplacer {couleur} par une couleur du nuancier', { couleur: c.couleur })} icone="palette" chevron={false} alignement="droite"
          elements={nuancier.map(te => ({ id: te.hex, libelle: t(te.nom) + ' (' + te.hex.toUpperCase() + ')', pastille: te.hex, onClick: () => actions.remplacer(c.couleur, te.hex) }))} />

      ) : null}
    </li>
  );
});

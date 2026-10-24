// Une ligne de « Par couleur » : une couleur du dessin, ses formes, et ce qu'on peut en faire d'un geste :
// les choisir, la changer partout, les afficher ou les masquer, les verrouiller, n'afficher qu'elles,
// choisir ses nuances proches, les combiner, les supprimer.
//
// La ligne ne lit que ses proprietes et les verbes (stables) : ni le dessin ni la selection. Ainsi, memoisee,
// elle ne se redessine que si SA couleur change (un groupe repris tel quel d'un dessin a l'autre) ou si elle
// devient entierement choisie ou cesse de l'etre. Ce qui demande l'etat du moment (la selection, le dessin
// pour combiner) est dans `ActionsLigne`, que la section lit au moment du geste.

import { memo } from 'react';
import { modifier, remplacerCouleurSur, type GroupeCouleur, type SurCouleur } from '../engine/editionSvg.js';
import { pluriel } from '../util/texte.js';
import { Bouton } from './commun/Bouton.js';
import { MenuDeroulant, type ElementMenu } from './commun/Menu.js';
import { estHex } from './aidesEditeur.js';
import { useActions } from './contexteEditeur.js';
import type { Teinte } from './typesEditeur.js';

/** Ce que la section prete a chaque ligne. Les verbes ne changent jamais d'identite : ils lisent l'etat au moment du geste. */
export interface ActionsLigne {
  /** Choisit les formes libres de la couleur (`ajout` : elles s'ajoutent a la selection). */
  choisir: (g: GroupeCouleur, ajout: boolean) => void;
  /** Ce qu'on masque ou verrouille quitte la selection : on ne retouche pas ce qu'on ne voit plus. */
  horsSelection: (ids: readonly string[]) => void;
  /** Un nouveau geste de couleur commence (le sélecteur s'ouvre). */
  debuterRecolorer: () => void;
  /** Une valeur du sélecteur, en cours de glisse : tous les changements d'un geste se fondent en une entree d'historique. */
  recolorer: (g: GroupeCouleur, vers: string) => void;
  finirRecolorer: () => void;
  isoler: (g: GroupeCouleur) => void;
  nuancesProches: (g: GroupeCouleur) => void;
  combiner: (g: GroupeCouleur) => void;
  supprimer: (g: GroupeCouleur) => void;
}

const accord = (n: number) => (n > 1 ? 's' : '');

/** Ce que « Fond » ou « Trait » change, pour les messages : rien de plus quand on lit les deux. */
export const precisionSur = (sur: SurCouleur): string => (sur === 'remplissage' ? ' (fond)' : sur === 'contour' ? ' (trait)' : '');

interface Proprietes {
  g: GroupeCouleur;
  /** Toutes les formes libres de la couleur sont choisies. */
  choisie: boolean;
  sur: SurCouleur;
  nuancier: readonly Teinte[];
  actions: ActionsLigne;
  /** Le rang de la ligne et la taille de la liste, pour une liste fenetree dont les lignes absentes se comptent quand meme ; `taille` 0 : liste entiere. */
  rang: number;
  taille: number;
}

export const LigneCouleur = memo(function LigneCouleur({ g, choisie, sur, nuancier, actions, rang, taille }: Proprietes) {
  const ac = useActions();
  const toutesMasquees = g.visibles === 0, toutesVerrouillees = g.verrouillees === g.ids.length;
  const nom = g.couleur.toUpperCase();
  const basculerVisible = () => {
    ac.faire(d => modifier(d, g.ids, { visible: toutesMasquees }), pluriel(g.ids.length, 'forme') + (toutesMasquees ? ' affichée' : ' masquée') + accord(g.ids.length) + ' (' + nom + ').');
    if (!toutesMasquees) actions.horsSelection(g.ids);
  };
  const basculerVerrou = () => {
    ac.faire(d => modifier(d, g.ids, { verrouille: !toutesVerrouillees }), pluriel(g.ids.length, 'forme') + (toutesVerrouillees ? ' déverrouillée' : ' verrouillée') + accord(g.ids.length) + ' (' + nom + ').');
    if (!toutesVerrouillees) actions.horsSelection(g.ids);
  };
  // Le nuancier de la page : un clic remplace la couleur partout, en une entree d'historique.
  const duNuancier: ElementMenu[] = nuancier.map((t, i) => ({
    id: 'nuancier-' + t.hex, libelle: 'Remplacer par ' + t.nom + (t.nom === t.hex ? '' : ' (' + t.hex.toUpperCase() + ')'), pastille: t.hex, separateur: i === 0, desactive: t.hex === g.couleur,
    onClick: () => ac.faire(d => remplacerCouleurSur(d, g.couleur, t.hex, sur), nom + ' remplacée par ' + t.hex.toUpperCase() + precisionSur(sur) + ' : ' + pluriel(g.ids.length, 'forme') + '.')
  }));
  const elements: ElementMenu[] = [
    { id: 'ajouter', libelle: 'Ajouter à la sélection', icone: 'ajouter', desactive: !g.libres.length, onClick: () => actions.choisir(g, true) },
    { id: 'proches', libelle: 'Sélectionner les nuances proches', icone: 'palette', onClick: () => actions.nuancesProches(g) },
    { id: 'isoler', libelle: 'N’afficher que cette couleur', icone: 'oeil', onClick: () => actions.isoler(g) },
    { id: 'combiner', libelle: 'Combiner en une forme', icone: 'combiner', desactive: g.libres.length < 2, onClick: () => actions.combiner(g) },
    ...duNuancier,
    { id: 'supprimer', libelle: 'Supprimer ces formes (' + g.libres.length + ')', icone: 'supprimer', danger: true, separateur: true, desactive: !g.libres.length, onClick: () => actions.supprimer(g) }
  ];
  const cible = sur === 'remplissage' ? 'le fond' : sur === 'contour' ? 'le trait' : 'le fond et le trait';
  return (
    <li className={(choisie ? 'choisi' : '') + (toutesMasquees ? ' attenue' : '')} aria-posinset={taille ? rang : undefined} aria-setsize={taille || undefined}>
      {estHex(g.couleur) ? (
        <input type="color" className="recolorer" aria-label={'Changer la couleur ' + nom} title={'Changer ' + nom + ' pour ' + pluriel(g.ids.length, 'forme') + ' : ' + cible}
          value={g.couleur} onClick={actions.debuterRecolorer} onChange={e => actions.recolorer(g, e.target.value)} onBlur={actions.finirRecolorer} />
      ) : null}
      <button type="button" className="couleur-choix" title={'Choisir les formes ' + nom + ' (Maj : ajouter à la sélection)'} onClick={e => actions.choisir(g, e.shiftKey)}>
        <span className="echantillon" style={{ background: g.couleur }} />
        <code>{nom}</code>
        <span className="aide">{g.ids.length}{g.visibles < g.ids.length ? ' · ' + (g.ids.length - g.visibles) + ' masquée' + accord(g.ids.length - g.visibles) : ''}</span>
      </button>
      <Bouton icone={toutesMasquees ? 'masquer' : 'oeil'} aide={(toutesMasquees ? 'Afficher' : 'Masquer') + ' les formes ' + nom} pressed={toutesMasquees} onClick={basculerVisible} />
      <Bouton icone={toutesVerrouillees ? 'verrouiller' : 'deverrouiller'} aide={(toutesVerrouillees ? 'Déverrouiller' : 'Verrouiller') + ' les formes ' + nom} pressed={toutesVerrouillees} onClick={basculerVerrou} />
      <MenuDeroulant etiquette={'Autres actions sur ' + nom} icone="options" chevron={false} alignement="gauche" elements={elements} />
    </li>
  );
});

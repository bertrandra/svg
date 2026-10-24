// Une ligne de « Par couleur » : une couleur du dessin, ses formes, et ce qu'on peut en faire d'un geste :
// les choisir, la changer partout, les afficher ou les masquer, les verrouiller, n'afficher qu'elles,
// choisir ses nuances proches, les combiner, les supprimer.

import { combiner, modifier, remplacerCouleurSur, supprimer, type GroupeCouleur, type SurCouleur } from '../engine/editionSvg.js';
import { pluriel } from '../util/texte.js';
import { Bouton } from './commun/Bouton.js';
import { MenuDeroulant, type ElementMenu } from './commun/Menu.js';
import { estHex } from './aidesEditeur.js';
import { useActions, useDessin } from './contexteEditeur.js';

/** Ce que la section prete a chaque ligne : ce qui est partage entre les lignes ou qui survit a leur remontage. */
export interface ActionsLigne {
  sur: SurCouleur;
  /** Ce que la ligne a choisi en dernier, pour que « Sélectionner les nuances proches » sache de quelle couleur partir. */
  choisie: (couleur: string) => void;
  /** Un nouveau geste de couleur commence (le sélecteur s'ouvre). */
  debuterRecolorer: () => void;
  /** Une valeur du sélecteur, en cours de glisse : tous les changements d'un geste se fondent en une entree d'historique. */
  recolorer: (g: GroupeCouleur, vers: string) => void;
  finirRecolorer: () => void;
  isoler: (g: GroupeCouleur) => void;
  nuancesProches: (g: GroupeCouleur) => void;
}

const accord = (n: number) => (n > 1 ? 's' : '');

/** Ce que « Fond » ou « Trait » change, pour les messages : rien de plus quand on lit les deux. */
export const precisionSur = (sur: SurCouleur): string => (sur === 'remplissage' ? ' (fond)' : sur === 'contour' ? ' (trait)' : '');

export function LigneCouleur({ g, actions }: { g: GroupeCouleur; actions: ActionsLigne }) {
  const mo = useDessin(), ac = useActions();
  const { sel } = mo;
  const { sur } = actions;
  const toutesChoisies = g.libres.length > 0 && g.libres.every(id => mo.choisies.has(id));
  const toutesMasquees = g.visibles === 0, toutesVerrouillees = g.verrouillees === g.ids.length;
  const nom = g.couleur.toUpperCase();
  const choisir = (ajout: boolean) => {
    if (!g.libres.length) { ac.dire('Les formes ' + nom + ' sont masquées ou verrouillées.'); return; }
    ac.choisir(ajout ? [...new Set([...sel, ...g.libres])] : g.libres);
    ac.poserPoint(null);
    actions.choisie(g.couleur);
  };
  // Ce qu'on masque ou verrouille quitte la selection : on ne retouche pas ce qu'on ne voit plus.
  const horsSelection = () => ac.choisir(sel.filter(id => !g.ids.includes(id)));
  const basculerVisible = () => {
    ac.faire(d => modifier(d, g.ids, { visible: toutesMasquees }), pluriel(g.ids.length, 'forme') + (toutesMasquees ? ' affichée' : ' masquée') + accord(g.ids.length) + ' (' + nom + ').');
    if (!toutesMasquees) horsSelection();
  };
  const basculerVerrou = () => {
    ac.faire(d => modifier(d, g.ids, { verrouille: !toutesVerrouillees }), pluriel(g.ids.length, 'forme') + (toutesVerrouillees ? ' déverrouillée' : ' verrouillée') + accord(g.ids.length) + ' (' + nom + ').');
    if (!toutesVerrouillees) horsSelection();
  };
  const combinerCouleur = () => {
    const r = combiner(mo.dessin, g.libres);
    if (!r.id) return;
    ac.appliquer(() => r.dessin);
    ac.choisir([r.id]);
    ac.dire(pluriel(g.libres.length, 'forme') + ' combinée' + accord(g.libres.length) + ' en une (' + nom + ').');
  };
  const supprimerCouleur = () => {
    ac.faire(d => supprimer(d, g.libres), pluriel(g.libres.length, 'forme') + ' ' + nom + ' supprimée' + accord(g.libres.length) + '.');
    ac.choisir(sel.filter(id => !g.libres.includes(id)));
  };
  // Le nuancier de la page : un clic remplace la couleur partout, en une entree d'historique.
  const duNuancier: ElementMenu[] = mo.nuancier.map((t, i) => ({
    id: 'nuancier-' + t.hex, libelle: 'Remplacer par ' + t.nom + (t.nom === t.hex ? '' : ' (' + t.hex.toUpperCase() + ')'), pastille: t.hex, separateur: i === 0, desactive: t.hex === g.couleur,
    onClick: () => ac.faire(d => remplacerCouleurSur(d, g.couleur, t.hex, sur), nom + ' remplacée par ' + t.hex.toUpperCase() + precisionSur(sur) + ' : ' + pluriel(g.ids.length, 'forme') + '.')
  }));
  const elements: ElementMenu[] = [
    { id: 'ajouter', libelle: 'Ajouter à la sélection', icone: 'ajouter', desactive: !g.libres.length, onClick: () => choisir(true) },
    { id: 'proches', libelle: 'Sélectionner les nuances proches', icone: 'palette', onClick: () => actions.nuancesProches(g) },
    { id: 'isoler', libelle: 'N’afficher que cette couleur', icone: 'oeil', onClick: () => actions.isoler(g) },
    { id: 'combiner', libelle: 'Combiner en une forme', icone: 'combiner', desactive: g.libres.length < 2, onClick: combinerCouleur },
    ...duNuancier,
    { id: 'supprimer', libelle: 'Supprimer ces formes (' + g.libres.length + ')', icone: 'supprimer', danger: true, separateur: true, desactive: !g.libres.length, onClick: supprimerCouleur }
  ];
  const cible = sur === 'remplissage' ? 'le fond' : sur === 'contour' ? 'le trait' : 'le fond et le trait';
  return (
    <li className={(toutesChoisies ? 'choisi' : '') + (toutesMasquees ? ' attenue' : '')}>
      {estHex(g.couleur) ? (
        <input type="color" className="recolorer" aria-label={'Changer la couleur ' + nom} title={'Changer ' + nom + ' pour ' + pluriel(g.ids.length, 'forme') + ' : ' + cible}
          value={g.couleur} onClick={actions.debuterRecolorer} onChange={e => actions.recolorer(g, e.target.value)} onBlur={actions.finirRecolorer} />
      ) : null}
      <button type="button" className="couleur-choix" title={'Choisir les formes ' + nom + ' (Maj : ajouter à la sélection)'} onClick={e => choisir(e.shiftKey)}>
        <span className="echantillon" style={{ background: g.couleur }} />
        <code>{nom}</code>
        <span className="aide">{g.ids.length}{g.visibles < g.ids.length ? ' · ' + (g.ids.length - g.visibles) + ' masquée' + accord(g.ids.length - g.visibles) : ''}</span>
      </button>
      <Bouton icone={toutesMasquees ? 'masquer' : 'oeil'} aide={(toutesMasquees ? 'Afficher' : 'Masquer') + ' les formes ' + nom} pressed={toutesMasquees} onClick={basculerVisible} />
      <Bouton icone="verrouiller" aide={(toutesVerrouillees ? 'Déverrouiller' : 'Verrouiller') + ' les formes ' + nom} pressed={toutesVerrouillees} onClick={basculerVerrou} />
      <MenuDeroulant etiquette={'Autres actions sur ' + nom} icone="options" chevron={false} alignement="gauche" elements={elements} />
    </li>
  );
}

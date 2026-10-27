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
import { t } from '../util/i18n.js';
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

/** Ce que « Fond » ou « Trait » change, pour les messages : rien de plus quand on lit les deux. */
export const precisionSur = (sur: SurCouleur): string => (sur === 'remplissage' ? t(' (fond)') : sur === 'contour' ? t(' (trait)') : '');

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
    const formes = pluriel(g.ids.length, 'forme'), plusieurs = g.ids.length > 1;
    const dit = toutesMasquees
      ? (plusieurs ? t('{formes} affichées ({nom}).', { formes, nom }) : t('{formes} affichée ({nom}).', { formes, nom }))
      : (plusieurs ? t('{formes} masquées ({nom}).', { formes, nom }) : t('{formes} masquée ({nom}).', { formes, nom }));
    ac.faire(d => modifier(d, g.ids, { visible: toutesMasquees }), dit);
    if (!toutesMasquees) actions.horsSelection(g.ids);
  };
  const basculerVerrou = () => {
    const formes = pluriel(g.ids.length, 'forme'), plusieurs = g.ids.length > 1;
    const dit = toutesVerrouillees
      ? (plusieurs ? t('{formes} déverrouillées ({nom}).', { formes, nom }) : t('{formes} déverrouillée ({nom}).', { formes, nom }))
      : (plusieurs ? t('{formes} verrouillées ({nom}).', { formes, nom }) : t('{formes} verrouillée ({nom}).', { formes, nom }));
    ac.faire(d => modifier(d, g.ids, { verrouille: !toutesVerrouillees }), dit);
    if (!toutesVerrouillees) actions.horsSelection(g.ids);
  };
  // Le nuancier de la page : un clic remplace la couleur partout, en une entree d'historique.
  const duNuancier: ElementMenu[] = nuancier.map((te, i) => ({
    id: 'nuancier-' + te.hex, libelle: t('Remplacer par {teinte}', { teinte: t(te.nom) + (te.nom === te.hex ? '' : ' (' + te.hex.toUpperCase() + ')') }), pastille: te.hex, separateur: i === 0, desactive: te.hex === g.couleur,
    onClick: () => ac.faire(d => remplacerCouleurSur(d, g.couleur, te.hex, sur), t('{de} remplacée par {vers}{sur} : {formes}.', { de: nom, vers: te.hex.toUpperCase(), sur: precisionSur(sur), formes: pluriel(g.ids.length, 'forme') }))
  }));
  const elements: ElementMenu[] = [
    { id: 'ajouter', libelle: t('Ajouter à la sélection'), icone: 'ajouter', desactive: !g.libres.length, onClick: () => actions.choisir(g, true) },
    { id: 'proches', libelle: t('Sélectionner les nuances proches'), icone: 'palette', onClick: () => actions.nuancesProches(g) },
    { id: 'isoler', libelle: t('N’afficher que cette couleur'), icone: 'oeil', onClick: () => actions.isoler(g) },
    { id: 'combiner', libelle: t('Combiner en une forme'), icone: 'combiner', desactive: g.libres.length < 2, onClick: () => actions.combiner(g) },
    ...duNuancier,
    { id: 'supprimer', libelle: t('Supprimer ces formes ({n})', { n: g.libres.length }), icone: 'supprimer', danger: true, separateur: true, desactive: !g.libres.length, onClick: () => actions.supprimer(g) }
  ];
  const cible = sur === 'remplissage' ? t('le fond') : sur === 'contour' ? t('le trait') : t('le fond et le trait');
  return (
    <li className={(choisie ? 'choisi' : '') + (toutesMasquees ? ' attenue' : '')} aria-posinset={taille ? rang : undefined} aria-setsize={taille || undefined}>
      {estHex(g.couleur) ? (
        <input type="color" className="recolorer" aria-label={t('Changer la couleur {nom}', { nom })} title={t('Changer {nom} pour {formes} : {cible}', { nom, formes: pluriel(g.ids.length, 'forme'), cible })}
          value={g.couleur} onClick={actions.debuterRecolorer} onChange={e => actions.recolorer(g, e.target.value)} onBlur={actions.finirRecolorer} />
      ) : null}
      <button type="button" className="couleur-choix" title={t('Choisir les formes {nom} (Maj : ajouter à la sélection)', { nom })} onClick={e => actions.choisir(g, e.shiftKey)}>
        <span className="echantillon" style={{ background: g.couleur }} />
        <code>{nom}</code>
        <span className="aide">{g.ids.length}{g.visibles < g.ids.length ? ' · ' + pluriel(g.ids.length - g.visibles, 'masquée') : ''}</span>
      </button>
      <Bouton icone={toutesMasquees ? 'masquer' : 'oeil'} aide={toutesMasquees ? t('Afficher les formes {nom}', { nom }) : t('Masquer les formes {nom}', { nom })} pressed={toutesMasquees} onClick={basculerVisible} />
      <Bouton icone={toutesVerrouillees ? 'verrouiller' : 'deverrouiller'} aide={toutesVerrouillees ? t('Déverrouiller les formes {nom}', { nom }) : t('Verrouiller les formes {nom}', { nom })} pressed={toutesVerrouillees} onClick={basculerVerrou} />
      <MenuDeroulant etiquette={t('Autres actions sur {nom}', { nom })} icone="options" chevron={false} alignement="gauche" elements={elements} />

    </li>
  );
});

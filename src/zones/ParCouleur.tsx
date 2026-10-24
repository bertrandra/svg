// Les calques par couleur (ADR-0006) : chaque couleur du dessin, avec ses formes, et ce qu'on peut en
// faire d'un geste : les choisir, les afficher ou les masquer, les verrouiller, n'afficher qu'elles,
// les combiner, les supprimer. Les listes se lisent sur le remplissage, le contour, ou les deux.

import { useMemo, useState } from 'react';
import { combiner, groupesDeCouleur, modifier, montrerSeulement, supprimer, type GroupeCouleur, type SurCouleur } from '../engine/editionSvg.js';
import type { Edition } from './EditeurSvg.js';
import { Bouton } from './BarreOutils.js';
import { MenuDeroulant, type ElementMenu } from './Menu.js';
import { Section } from './Section.js';

const SURS: ReadonlyArray<readonly [SurCouleur, string, string]> = [
  ['tout', 'Les deux', 'Couleurs du remplissage et du contour'], ['remplissage', 'Fond', 'Couleurs de remplissage seulement'], ['contour', 'Trait', 'Couleurs de contour seulement']
];

const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');

function LigneCouleur({ ed, g }: { ed: Edition; g: GroupeCouleur }) {
  const { sel } = ed;
  const toutesChoisies = g.libres.length > 0 && g.libres.every(id => sel.includes(id));
  const toutesMasquees = g.visibles === 0, toutesVerrouillees = g.verrouillees === g.ids.length;
  const nom = g.couleur.toUpperCase();
  const choisir = (ajout: boolean) => {
    if (!g.libres.length) { ed.dire('Les formes ' + nom + ' sont masquées ou verrouillées.'); return; }
    ed.choisir(ajout ? [...new Set([...sel, ...g.libres])] : g.libres);
    ed.poserPoint(null);
  };
  // Ce qu'on masque ou verrouille quitte la selection : on ne retouche pas ce qu'on ne voit plus.
  const horsSelection = () => ed.choisir(sel.filter(id => !g.ids.includes(id)));
  const basculerVisible = () => {
    ed.faire(d => modifier(d, g.ids, { visible: toutesMasquees }), pluriel(g.ids.length, 'forme') + (toutesMasquees ? ' affichée' : ' masquée') + (g.ids.length > 1 ? 's' : '') + ' (' + nom + ').');
    if (!toutesMasquees) horsSelection();
  };
  const basculerVerrou = () => {
    ed.faire(d => modifier(d, g.ids, { verrouille: !toutesVerrouillees }), pluriel(g.ids.length, 'forme') + (toutesVerrouillees ? ' déverrouillée' : ' verrouillée') + (g.ids.length > 1 ? 's' : '') + ' (' + nom + ').');
    if (!toutesVerrouillees) horsSelection();
  };
  const combinerCouleur = () => {
    const r = combiner(ed.dessin, g.libres);
    if (!r.id) return;
    ed.appliquer(() => r.dessin);
    ed.choisir([r.id]);
    ed.dire(pluriel(g.libres.length, 'forme') + ' combinée' + (g.libres.length > 1 ? 's' : '') + ' en une (' + nom + ').');
  };
  const supprimerCouleur = () => {
    ed.faire(d => supprimer(d, g.libres), pluriel(g.libres.length, 'forme') + ' ' + nom + ' supprimée' + (g.libres.length > 1 ? 's' : '') + '.');
    ed.choisir(sel.filter(id => !g.libres.includes(id)));
  };
  const elements: ElementMenu[] = [
    { id: 'ajouter', libelle: 'Ajouter à la sélection', icone: 'ajouter', desactive: !g.libres.length, onClick: () => choisir(true) },
    { id: 'isoler', libelle: 'N’afficher que cette couleur', icone: 'oeil', onClick: () => { ed.faire(d => montrerSeulement(d, g.ids), 'Seules les formes ' + nom + ' restent affichées.'); ed.choisir(sel.filter(id => g.ids.includes(id))); } },
    { id: 'combiner', libelle: 'Combiner en une forme', icone: 'combiner', desactive: g.libres.length < 2, onClick: combinerCouleur },
    { id: 'supprimer', libelle: 'Supprimer ces formes (' + g.libres.length + ')', icone: 'supprimer', danger: true, separateur: true, desactive: !g.libres.length, onClick: supprimerCouleur }
  ];
  return (
    <li className={(toutesChoisies ? 'choisi' : '') + (toutesMasquees ? ' attenue' : '')}>
      <button type="button" className="couleur-choix" title={'Choisir les formes ' + nom + ' (Maj : ajouter à la sélection)'} onClick={e => choisir(e.shiftKey)}>
        <span className="echantillon" style={{ background: g.couleur }} />
        <code>{nom}</code>
        <span className="aide">{g.ids.length}{g.visibles < g.ids.length ? ' · ' + (g.ids.length - g.visibles) + ' masquée' + (g.ids.length - g.visibles > 1 ? 's' : '') : ''}</span>
      </button>
      <Bouton icone={toutesMasquees ? 'masquer' : 'oeil'} aide={(toutesMasquees ? 'Afficher' : 'Masquer') + ' les formes ' + nom} pressed={toutesMasquees} onClick={basculerVisible} />
      <Bouton icone="verrouiller" aide={(toutesVerrouillees ? 'Déverrouiller' : 'Verrouiller') + ' les formes ' + nom} pressed={toutesVerrouillees} onClick={basculerVerrou} />
      <MenuDeroulant etiquette={'Autres actions sur ' + nom} icone="options" chevron={false} alignement="gauche" elements={elements} />
    </li>
  );
}

export function ParCouleur({ ed }: { ed: Edition }) {
  const [sur, poserSur] = useState<SurCouleur>('tout');
  const groupes = useMemo(() => groupesDeCouleur(ed.dessin, sur), [ed.dessin, sur]);
  if (!ed.dessin.formes.length) return null;
  return (
    <Section titre="Par couleur" ouverte note={groupes.length}>
      <div className="mini-onglets" role="group" aria-label="Couleurs lues sur">
        {SURS.map(([id, libelle, aide]) => <button key={id} type="button" aria-pressed={sur === id} title={aide} onClick={() => poserSur(id)}>{libelle}</button>)}
      </div>
      {groupes.length ? (
        <ul className="par-couleur">{groupes.map(g => <LigneCouleur key={g.couleur} ed={ed} g={g} />)}</ul>
      ) : <p className="aide">Aucune forme n’a de {sur === 'contour' ? 'contour' : 'remplissage'}.</p>}
    </Section>
  );
}

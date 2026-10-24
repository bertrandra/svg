// La barre principale de l'editeur (ADR-0006) : une barre ne montre que ce qui sert tout le temps, les
// outils, les couleurs, l'historique, le zoom. Le reste vit dans des menus qui disent leur raccourci
// (MenusBarre.tsx) et dans la rangee de la selection (BarreSelection.tsx). Chaque groupe lit seul ce
// qu'il montre : les outils ne se redessinent pas quand le dessin change.

import { memo, useEffect, useState } from 'react';
import { modifier, type Style } from '../engine/editionSvg.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { Icone, type NomIcone } from './icones.js';
import { Bouton } from './commun/Bouton.js';
import { FORMES, estHex } from './aidesEditeur.js';
import { MenuDeroulant } from './commun/Menu.js';
import { MenuEdition, MenuFichier, MenuVue } from './MenusBarre.js';
import type { Outil, OutilForme } from './typesEditeur.js';

const OUTILS_FIXES: ReadonlyArray<readonly [Outil, NomIcone, string]> = [
  ['selection', 'selection', 'Sélection (V)'], ['points', 'points', 'Points et poignées (A)'], ['main', 'main', 'Main : déplacer la vue (H, ou espace)']
];
const OUTILS_APRES: ReadonlyArray<readonly [Outil, NomIcone, string]> = [
  ['plume', 'plume', 'Plume (P) : cliquez les points, Entrée ferme, Échap abandonne'], ['texte', 'texte', 'Texte en formes (T)']
];
const FORMES_MENU: ReadonlyArray<readonly [OutilForme, NomIcone, string, string]> = [
  ['rectangle', 'rectangle', 'Rectangle', 'R'], ['ellipse', 'ellipse', 'Ellipse', 'E'], ['etoile', 'etoile', 'Étoile', 'S'], ['ligne', 'ligne', 'Ligne', 'L']
];

/** Les quatre formes derriere un seul outil : le bouton reprend la derniere employee, le chevron liste les autres. */
function OutilFormes() {
  const { outil } = useInterface(), ac = useActions();
  const [derniere, poserDerniere] = useState<OutilForme>('rectangle');
  useEffect(() => { if (FORMES.has(outil)) poserDerniere(outil as OutilForme); }, [outil]);
  const courante = FORMES_MENU.find(f => f[0] === derniere) ?? FORMES_MENU[0];
  if (!courante) return null;
  return (
    <span className="outil-formes">
      <Bouton icone={courante[1]} aide={courante[2] + ' (' + courante[3] + ')' + (courante[0] === 'rectangle' || courante[0] === 'ellipse' ? ' · Maj : proportions' : courante[0] === 'ligne' ? ' · Maj : droite' : '')} pressed={FORMES.has(outil)} onClick={() => ac.poserOutil(derniere)} />
      <MenuDeroulant etiquette="Choisir une forme" className="chevron-seul"
        elements={FORMES_MENU.map(([id, icone, libelle, raccourci]) => ({ id, libelle, icone, raccourci, coche: outil === id, onClick: () => ac.poserOutil(id) }))} />
    </span>
  );
}

/** Les outils : ne lit que l'outil courant, jamais le dessin. */
const GroupeOutils = memo(function GroupeOutils() {
  const { outil } = useInterface(), ac = useActions();
  return (
    <div className="groupe outils" role="group" aria-label="Outil">
      {OUTILS_FIXES.map(([o, icone, aide]) => <Bouton key={o} icone={icone} aide={aide} pressed={outil === o} onClick={() => ac.poserOutil(o)} />)}
      <OutilFormes />
      {OUTILS_APRES.map(([o, icone, aide]) => <Bouton key={o} icone={icone} aide={aide} pressed={outil === o} onClick={() => ac.poserOutil(o)} />)}
    </div>
  );
});

/**
 * Les deux couleurs a portee de main : celles de la selection quand il y en a une (un clic les change
 * pour toutes les formes choisies), celles des formes a venir sinon.
 */
function StyleCourant() {
  const { dessin, sel } = useDessin(), { style } = useInterface(), ac = useActions();
  const premiere = sel.length ? dessin.formes.find(f => f.id === sel[0]) ?? null : null;
  const remplissage = premiere ? premiere.remplissage : style.remplissage, contour = premiere ? premiere.contour : style.contour;
  const poser = (r: Partial<Pick<Style, 'remplissage' | 'contour'>>, cle: string) => {
    if (premiere) ac.appliquer(d => modifier(d, sel, r), cle + ':' + sel.join(','));
    else ac.poserStyle({ ...style, ...r });
  };
  const pastille = (libelle: string, valeur: string | null, cle: 'remplissage' | 'contour') => (
    <span className="pastille-style" title={libelle + (premiere ? ' de la sélection' : ' des formes à venir') + ' : ' + (valeur ?? 'aucun')}>
      <input type="color" aria-label={libelle} value={estHex(valeur) ? valeur : '#000000'} onChange={e => poser({ [cle]: e.target.value }, cle)} onBlur={ac.finir} />
      <button type="button" className={'aucun' + (valeur === null ? ' actif' : '')} aria-pressed={valeur === null} title={libelle + (valeur === null ? ' : aucun (cliquez pour en mettre un)' : ' : retirer')} aria-label={libelle + ' : aucun'} onClick={() => { poser({ [cle]: valeur === null ? '#000000' : null }, cle); ac.finir(); }}><Icone nom="fermer" taille={12} /></button>
    </span>
  );
  return (
    <div className="groupe style-courant" role="group" aria-label="Couleurs">
      {pastille('Remplissage', remplissage, 'remplissage')}
      {pastille('Contour', contour, 'contour')}
    </div>
  );
}

function GroupeHistorique() {
  const { h } = useDessin(), ac = useActions();
  return (
    <div className="groupe" role="group" aria-label="Historique">
      <Bouton icone="annuler" aide="Annuler (Ctrl+Z)" disabled={!h.passe.length} onClick={ac.defaire} />
      <Bouton icone="retablir" aide="Rétablir (Ctrl+Maj+Z)" disabled={!h.futur.length} onClick={ac.refaire} />
    </div>
  );
}

/** Le zoom : ne lit que la vue. */
const GroupeZoom = memo(function GroupeZoom() {
  const { vues } = useInterface();
  return (
    <div className="groupe" role="group" aria-label="Zoom">
      <Bouton icone="zoom-moins" aide="Dézoomer (−)" onClick={() => vues.zoomer(0.8)} />
      <button type="button" className="zoom" title="Ajuster à l’écran (0)" onClick={vues.ajuster} aria-live="polite">{Math.round(vues.vue.zoom * 100)} %</button>
      <Bouton icone="zoom-plus" aide="Zoomer (+)" onClick={() => vues.zoomer(1.25)} />
    </div>
  );
});

function BoutonEnregistrer() {
  const { h } = useDessin(), ac = useActions();
  return <button type="button" className="primaire texte" title="Enregistrer (Ctrl+S)" onClick={ac.enregistrerTout} disabled={!h.passe.length}><Icone nom="enregistrer" /> Enregistrer</button>;
}

/** La barre principale : outils, couleurs, historique, zoom, puis les menus Vue, Edition et Fichier. */
export const Barre = memo(function Barre({ titre, nom }: { titre: string; nom: string }) {
  return (
    <header className="editeur-barre">
      <strong className="editeur-titre">{titre}</strong>
      <GroupeOutils />
      <StyleCourant />
      <GroupeHistorique />
      <GroupeZoom />
      <div className="groupe menus" role="group" aria-label="Menus">
        <MenuVue />
        <MenuEdition />
      </div>
      <span className="espace" />
      <div className="groupe fin" role="group" aria-label="Fichier">
        <MenuFichier nom={nom} />
        <BoutonEnregistrer />
      </div>
    </header>
  );
});

// La barre principale de l'editeur (ADR-0006) : une barre ne montre que ce qui sert tout le temps, les
// outils, les couleurs, l'historique, le zoom. Le reste vit dans des menus qui disent leur raccourci
// (MenusBarre.tsx) et dans la rangee de la selection (BarreSelection.tsx). Chaque groupe lit seul ce
// qu'il montre : les outils ne se redessinent pas quand le dessin change.

import { memo, useEffect, useId, useState } from 'react';
import { modifier, type Style } from '../engine/editionSvg.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { Icone, type NomIcone } from './icones.js';
import { Bouton } from './commun/Bouton.js';
import { BoutonRaison } from './commun/BoutonRaison.js';
import { FORMES, estHex } from './aidesEditeur.js';
import { MenuDeroulant } from './commun/Menu.js';
import { MenuEdition, MenuFichier, MenuPlus, MenuVue } from './MenusBarre.js';
import { MenuAide } from './AideEditeur.js';
import { useSignalVisite } from './contexteGuide.js';
import { useTelephone } from './Vue.js';
import { SelecteurContexte } from './Production.js';
import type { Outil, OutilForme } from './typesEditeur.js';

const OUTILS_FIXES: ReadonlyArray<readonly [Outil, NomIcone, string]> = [
  ['selection', 'selection', 'Sélection (V)'], ['points', 'points', 'Points et poignées (A)'], ['main', 'main', 'Main : déplacer la vue (H, ou espace)']
];
const OUTILS_APRES: ReadonlyArray<readonly [Outil, NomIcone, string]> = [
  ['plume', 'plume', 'Plume (P) : cliquez les points, Entrée ferme, Échap abandonne'], ['texte', 'texte', 'Texte (T)']
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
  const cible = premiere ? ' de la sélection' : ' des formes à venir';
  return (
    <div className="groupe style-courant" role="group" aria-label="Couleurs">
      <PastilleStyle libelle="Remplissage" cible={cible} valeur={remplissage} onChange={v => poser({ remplissage: v }, 'remplissage')} />
      <PastilleStyle libelle="Contour" cible={cible} valeur={contour} onChange={v => poser({ contour: v }, 'contour')} />
    </div>
  );
}

/**
 * Une couleur de la barre : le selecteur, et le bouton « aucun ». Le selecteur n'a que l'infobulle pour dire la couleur courante, que
 * ni le clavier ni un lecteur d'ecran ne lisent : elle devient sa description (un texte masque a l'ecran). Le bouton « aucun » a un nom
 * fixe, c'est `aria-pressed` qui porte l'etat (un nom qui changerait avec l'etat serait lu deux fois).
 */
function PastilleStyle({ libelle, cible, valeur, onChange }: { libelle: string; cible: string; valeur: string | null; onChange: (v: string | null) => void }) {
  const ac = useActions(), idDescription = useId();
  const decrit = libelle + cible + ' : ' + (valeur ?? 'aucun');
  return (
    <span className="pastille-style" title={decrit}>
      <input type="color" aria-label={libelle} aria-describedby={idDescription} value={estHex(valeur) ? valeur : '#000000'} onChange={e => onChange(e.target.value)} onBlur={ac.finir} />
      <span id={idDescription} className="sr-only">{decrit}</span>
      <button type="button" className={'aucun' + (valeur === null ? ' actif' : '')} aria-pressed={valeur === null} title={libelle + ' : aucun'} aria-label={libelle + ' : aucun'} onClick={() => { onChange(valeur === null ? '#000000' : null); ac.finir(); }}><Icone nom="aucun" taille={14} /></button>
    </span>
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

/**
 * Le niveau de zoom, qui ajuste le dessin a l'ecran d'un appui : seul reste visible de tout le zoom sur un telephone. Son nom dit
 * ce qu'il fait apres ce qu'il montre (WCAG 2.5.3 : le libelle visible ouvre le nom), « 279 % » seul ne le disait pas.
 */
const BoutonNiveauZoom = memo(function BoutonNiveauZoom() {
  const { vues } = useInterface();
  const niveau = Math.round(vues.vue.zoom * 100) + ' %';
  return <button type="button" className="zoom" title={'Zoom à ' + niveau + ' : ajuster à l’écran (touche zéro)'} aria-label={niveau + ' : ajuster à l’écran'} onClick={vues.ajuster}>{niveau}</button>;
});

/** Le zoom : ne lit que la vue. */
const GroupeZoom = memo(function GroupeZoom() {
  const { vues } = useInterface();
  return (
    <div className="groupe" role="group" aria-label="Zoom">
      <Bouton icone="zoom-moins" aide="Dézoomer (−)" onClick={() => vues.zoomer(0.8)} />
      <BoutonNiveauZoom />
      <Bouton icone="zoom-plus" aide="Zoomer (+)" onClick={() => vues.zoomer(1.25)} />
    </div>
  );
});

/** Enregistrer, grise tant que rien n'a change : il en dit la raison (BoutonRaison) et reste dans l'ordre de Tab. */
export function BoutonEnregistrer() {
  const { h } = useDessin(), ac = useActions(), { productionModifiee } = useInterface(), signaler = useSignalVisite();
  return (
    <BoutonRaison className="primaire texte" aide="Enregistrer (Ctrl+S)" raison={h.passe.length || productionModifiee ? null : 'Aucune modification à enregistrer'} onClick={() => { signaler('recupere'); ac.enregistrerTout(); }}>
      <Icone nom="enregistrer" /> Enregistrer
    </BoutonRaison>
  );
}

/**
 * La barre principale : outils, couleurs, historique, zoom, puis les menus Vue, Edition et Fichier. Sur un telephone, elle ne
 * garde que les outils, les couleurs et l'historique, plus « Plus » qui porte tout le reste, zoom compris (Enregistrer passe
 * dans la barre d'etat) : rien ne depend d'un defilement horizontal qu'on ne devine pas.
 */
export const Barre = memo(function Barre({ titre, nom }: { titre: string; nom: string }) {
  const telephone = useTelephone();
  if (telephone) {
    return (
      <header className="editeur-barre telephone">
        <GroupeOutils />
        <div className="groupe plus" role="group" aria-label="Plus"><MenuPlus nom={nom} /></div>
        <StyleCourant />
        <GroupeHistorique />
        <div className="groupe" role="group" aria-label="Zoom"><BoutonNiveauZoom /></div>
      </header>
    );
  }
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
        <MenuAide />
      </div>
      <SelecteurContexte />
      <span className="espace" />
      <div className="groupe fin" role="group" aria-label="Fichier">
        <MenuFichier nom={nom} />
        <BoutonEnregistrer />
      </div>
    </header>
  );
});

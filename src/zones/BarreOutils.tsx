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
import { FORMES, estHex, nomOutilForme } from './aidesEditeur.js';
import { MenuDeroulant } from './commun/Menu.js';
import { MenuEdition, MenuFichier, MenuPlus, MenuVue } from './MenusBarre.js';
import { MenuAide } from './AideEditeur.js';
import { useSignalVisite } from './contexteGuide.js';
import { useTelephone } from './Vue.js';
import { SelecteurContexte } from './Production.js';
import type { Outil, OutilForme } from './typesEditeur.js';
import { aEnregistrer, raisonRienAEnregistrer } from './enregistrement.js';
import { OutilSelectionBarre } from './OutilsSelection.js';
import { lentilleDe } from './lentille.js';
import { RAISONS_LENTILLE } from './phrasesContenus.js';

const OUTILS_FIXES: ReadonlyArray<readonly [Outil, NomIcone, string]> = [
  ['points', 'points', 'Points et poignées (A)'], ['main', 'main', 'Main : déplacer la vue (H, ou espace)']
];
const OUTILS_APRES: ReadonlyArray<readonly [Outil, NomIcone, string]> = [
  ['plume', 'plume', 'Plume (P) : cliquez les points, Entrée ferme, Échap abandonne'], ['texte', 'texte', 'Texte (T)']
];
/**
 * La palette des formes (ADR-0033), en rubriques : ce qu'on trace le plus souvent d'abord, les traits ouverts a la fin. Les formes
 * d'avant gardent leur lettre (R, E, S, L) ; la palette s'ouvre par F.
 */
export const GROUPES_FORMES: ReadonlyArray<{ readonly id: string; readonly titre: string; readonly formes: readonly OutilForme[] }> = [
  { id: 'basiques', titre: 'Basiques', formes: ['rectangle', 'carre', 'rectangle-arrondi', 'ellipse', 'cercle'] },
  { id: 'polygones', titre: 'Polygones', formes: ['triangle', 'losange', 'parallelogramme', 'trapeze', 'polygone', 'etoile'] },
  { id: 'symboles', titre: 'Symboles', formes: ['coeur', 'fleche', 'croix', 'anneau', 'demi-cercle', 'goutte', 'lune', 'nuage'] },
  { id: 'etiquettes', titre: 'Étiquettes', formes: ['etiquette', 'badge', 'bulle'] },
  { id: 'traits', titre: 'Traits', formes: ['ligne', 'arc', 'spirale', 'vague'] }
];
const RACCOURCIS_FORMES: Partial<Record<OutilForme, string>> = { rectangle: 'R', ellipse: 'E', etoile: 'S', ligne: 'L' };

/** L'infobulle et le nom du bouton de la forme : son nom, sa lettre, et ce que fait Maj (le carre et le cercle sont deja carres). */
function aideForme(f: OutilForme): string {
  const r = RACCOURCIS_FORMES[f];
  return nomOutilForme(f) + (r ? ' (' + r + ')' : '') + (f === 'ligne' ? ' · Maj : droite' : f === 'carre' || f === 'cercle' ? '' : ' · Maj : proportions');
}

/**
 * Les formes derriere un seul outil (ADR-0006) : le bouton reprend la derniere employee, le chevron « Formes » ouvre la palette en
 * grille, groupee, chaque forme avec son icone et son nom ; la forme du bouton y est cochee. F l'ouvre au clavier.
 */
function OutilFormes() {
  const { outil, demandeFormes } = useInterface(), ac = useActions();
  const [derniere, poserDerniere] = useState<OutilForme>('rectangle');
  useEffect(() => { if (FORMES.has(outil)) poserDerniere(outil as OutilForme); }, [outil]);
  return (
    <span className="outil-formes">
      <Bouton icone={derniere} aide={aideForme(derniere)} pressed={FORMES.has(outil)} onClick={() => ac.poserOutil(derniere)} />
      <MenuDeroulant etiquette="Formes (F)" titreMenu="Formes" className="chevron-seul" grille demandeOuverture={demandeFormes}
        sections={GROUPES_FORMES.map(g => ({
          id: g.id, titre: g.titre,
          elements: g.formes.map(f => { const r = RACCOURCIS_FORMES[f]; return { id: f, libelle: nomOutilForme(f), icone: f, ...(r ? { raccourci: r } : {}), radio: true, coche: f === derniere, onClick: () => ac.poserOutil(f) }; })
        }))} />
    </span>
  );
}

/** Les outils : ne lit que l'outil courant et le contexte d'edition, jamais le dessin. */
const GroupeOutils = memo(function GroupeOutils({ telephone = false }: { telephone?: boolean }) {
  const { outil, contexte } = useInterface(), ac = useActions();
  // Dans une decoupe ou un masque (paquet 8-D), le texte ne se pose pas : son bouton est grise, la raison dans son infobulle.
  const sansTexte = lentilleDe(contexte) !== null;
  return (
    <div className="groupe outils" role="group" aria-label="Outil">
      {/* La selection, le cadre et le lasso derriere un seul bouton (ADR-0035) ; sur un telephone, les points aussi. */}
      <OutilSelectionBarre avecPoints={telephone} />
      {OUTILS_FIXES.filter(([o]) => !(telephone && o === 'points')).map(([o, icone, aide]) => <Bouton key={o} icone={icone} aide={aide} pressed={outil === o} onClick={() => ac.poserOutil(o)} />)}
      <OutilFormes />
      {OUTILS_APRES.map(([o, icone, aide]) => (o === 'texte' && sansTexte
        ? <Bouton key={o} icone={icone} aide={aide + ' — ' + RAISONS_LENTILLE.texte} pressed={false} disabled onClick={() => ac.poserOutil(o)} />
        : <Bouton key={o} icone={icone} aide={aide} pressed={outil === o} onClick={() => ac.poserOutil(o)} />))}
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
  const { vues } = useInterface(), ac = useActions();
  const niveau = Math.round(vues.vue.zoom * 100) + ' %';
  return <button type="button" className="zoom" title={'Zoom à ' + niveau + ' : ajuster à l’écran (touche zéro)'} aria-label={niveau + ' : ajuster à l’écran'} onClick={ac.ajuster}>{niveau}</button>;
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

/**
 * Le geste de fin, sous le libelle que la page ou l'hote a donne : « Terminer » dans la page (il ramene a la fiche du dessin, meme
 * sans modification), « Enregistrer » par defaut (il rend le dessin ; grise tant que rien n'a change, il en dit la raison et reste
 * dans l'ordre de Tab). Plus de Ctrl+S ici : Ctrl+S garde un brouillon, il ne ferme jamais (sauf sur le site, `ctrlSEnregistre`).
 * Une icone seule, carree, la seule action pleine de la barre (ADR-0006) : le libelle de l'hote est son nom accessible, l'infobulle
 * dit le geste et son raccourci. Le texte visible a quitte la barre a la demande du proprietaire (26 octobre 2026) ; le menu
 * Fichier, la confirmation d'abandon et la visite guidee le disent toujours en toutes lettres.
 */
export function BoutonEnregistrer() {
  const { h } = useDessin(), ac = useActions(), { productionModifiee, fin, enregistrement } = useInterface(), signaler = useSignalVisite();
  const change = aEnregistrer(h.passe.length > 0, productionModifiee, enregistrement);
  return (
    <BoutonRaison className="primaire bouton-fin" etiquette={fin.libelle}
      aide={fin.fermerSansModification ? fin.libelle + ' : revenir à la page, le dessin prêt à télécharger' : fin.libelle + (fin.ctrlSEnregistre ? ' (Ctrl+S)' : '')}
      raison={change || fin.fermerSansModification ? null : raisonRienAEnregistrer(enregistrement)} onClick={() => { if (change) signaler('recupere'); ac.terminer(); }}>
      <Icone nom={fin.fermerSansModification ? 'coche' : 'enregistrer'} />
    </BoutonRaison>
  );
}

/**
 * La barre principale : outils, couleurs, historique, zoom, les menus Vue, Edition et Aide, la machine, puis a droite le menu
 * Fichier (une icone ; il porte « Télécharger le SVG », l'export Cricut et les autres formats) et le geste de fin (une icone pleine).
 * Sur un telephone, elle ne garde que les outils, les couleurs et l'historique, plus « Plus » qui porte tout le reste, zoom compris
 * (le geste de fin passe dans la barre d'etat) : rien ne depend d'un defilement horizontal qu'on ne devine pas.
 */
export const Barre = memo(function Barre({ titre, nom }: { titre: string; nom: string }) {
  const telephone = useTelephone();
  if (telephone) {
    return (
      <header className="editeur-barre telephone">
        <GroupeOutils telephone />
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
      {/* Le fichier, d'un seul tenant : le menu Fichier et le geste de fin, deux icones, a droite. */}
      <div className="groupe fin" role="group" aria-label="Fichier">
        <MenuFichier nom={nom} />
        <BoutonEnregistrer />
      </div>
    </header>
  );
});

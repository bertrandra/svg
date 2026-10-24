// Les barres d'outils de l'editeur (ADR-0006) : la barre principale, ses menus (formes, vue, edition,
// fichier), et la rangee de la selection. Une barre ne montre que ce qui sert tout le temps : les
// outils, les couleurs, l'historique, le zoom. Le reste vit dans des menus qui disent leur raccourci.

import { useEffect, useState } from 'react';
import { aligner, ecrireDessin, modifier, ordonner, retourner, sousChemins, tourner, type Alignement, type Ordre, type Style } from '../engine/editionSvg.js';
import type { Booleen } from '../engine/booleens.js';
import { proposer, copier, texteOctets } from '../io/fichiers.js';
import type { Edition, Outil, OutilForme, Vues } from './EditeurSvg.js';
import { ContenuExport } from './Exporter.js';
import { Icone, type NomIcone } from './icones.js';
import { MenuDeroulant, type ElementMenu } from './Menu.js';

export const FORMES = new Set<Outil>(['rectangle', 'ellipse', 'etoile', 'ligne']);
type Fond = 'damier' | 'blanc' | 'sombre';

const OUTILS_FIXES: ReadonlyArray<readonly [Outil, NomIcone, string]> = [
  ['selection', 'selection', 'Sélection (V)'], ['points', 'points', 'Points et poignées (A)'], ['main', 'main', 'Main : déplacer la vue (H, ou espace)']
];
const OUTILS_APRES: ReadonlyArray<readonly [Outil, NomIcone, string]> = [
  ['plume', 'plume', 'Plume (P) : cliquez les points, Entrée ferme, Échap abandonne'], ['texte', 'texte', 'Texte en formes (T)']
];
const FORMES_MENU: ReadonlyArray<readonly [OutilForme, NomIcone, string, string]> = [
  ['rectangle', 'rectangle', 'Rectangle', 'R'], ['ellipse', 'ellipse', 'Ellipse', 'E'], ['etoile', 'etoile', 'Étoile', 'S'], ['ligne', 'ligne', 'Ligne', 'L']
];
const FONDS: ReadonlyArray<readonly [Fond, NomIcone, string]> = [['damier', 'fond-damier', 'Fond damier'], ['blanc', 'fond-blanc', 'Fond blanc'], ['sombre', 'fond-sombre', 'Fond sombre']];
const ALIGNEMENTS_ICONES: ReadonlyArray<readonly [Alignement, NomIcone, string]> = [
  ['gauche', 'aligner-gauche', 'Aligner à gauche'], ['centreH', 'aligner-centre-h', 'Centrer horizontalement'], ['droite', 'aligner-droite', 'Aligner à droite'],
  ['haut', 'aligner-haut', 'Aligner en haut'], ['centreV', 'aligner-centre-v', 'Centrer verticalement'], ['bas', 'aligner-bas', 'Aligner en bas']
];
const ORDRES_ICONES: ReadonlyArray<readonly [Ordre, NomIcone, string]> = [['premier', 'premier-plan', 'Premier plan (Ctrl+Maj+])'], ['avant', 'avancer', 'Avancer (Ctrl+])'], ['arriere', 'reculer', 'Reculer (Ctrl+[)'], ['dernier', 'arriere-plan', 'Arrière-plan (Ctrl+Maj+[)']];
export const BOOLEENS_ICONES: ReadonlyArray<readonly [Booleen, NomIcone, string]> = [
  ['union', 'union', 'Union : réunir les formes en une seule'], ['soustraction', 'soustraction', 'Soustraction : la plus basse moins les autres'],
  ['intersection', 'intersection', 'Intersection : ce que les formes ont en commun'], ['exclusion', 'exclusion', 'Exclusion : tout sauf les recouvrements']
];

const estHex = (v: string | null): v is string => !!v && /^#[0-9a-f]{6}$/.test(v);

/** Un bouton d'outil : une icone, une infobulle qui dit le geste et son raccourci. */
export function Bouton({ icone, aide, onClick, pressed, disabled, className }: { icone: NomIcone; aide: string; onClick: () => void; pressed?: boolean; disabled?: boolean; className?: string }) {
  return <button type="button" className={'icone-bouton' + (className ? ' ' + className : '')} title={aide} aria-label={aide} aria-pressed={pressed} disabled={disabled} onClick={onClick}><Icone nom={icone} /></button>;
}

/** Les quatre formes derriere un seul outil : le bouton reprend la derniere employee, le chevron liste les autres. */
function OutilFormes({ ed }: { ed: Edition }) {
  const [derniere, poserDerniere] = useState<OutilForme>('rectangle');
  useEffect(() => { if (FORMES.has(ed.outil)) poserDerniere(ed.outil as OutilForme); }, [ed.outil]);
  const courante = FORMES_MENU.find(f => f[0] === derniere) ?? FORMES_MENU[0];
  if (!courante) return null;
  return (
    <span className="outil-formes">
      <Bouton icone={courante[1]} aide={courante[2] + ' (' + courante[3] + ')' + (courante[0] === 'rectangle' || courante[0] === 'ellipse' ? ' · Maj : proportions' : courante[0] === 'ligne' ? ' · Maj : droite' : '')} pressed={FORMES.has(ed.outil)} onClick={() => ed.poserOutil(derniere)} />
      <MenuDeroulant etiquette="Choisir une forme" className="chevron-seul"
        elements={FORMES_MENU.map(([id, icone, libelle, raccourci]) => ({ id, libelle, icone, raccourci, coche: ed.outil === id, onClick: () => ed.poserOutil(id) }))} />
    </span>
  );
}

interface ProprietesBarre {
  ed: Edition; titre: string; nom: string; vues: Vues; contours: boolean; poserContours: (f: (c: boolean) => boolean) => void;
  fond: Fond; poserFond: (f: Fond) => void; defaire: () => void; refaire: () => void; demanderFermeture: () => void; modifie: boolean;
}

function elementsVue({ ed, vues, contours, poserContours, fond, poserFond }: ProprietesBarre): ElementMenu[] {
  return [
    { id: 'ajuster', libelle: 'Ajuster à l’écran', icone: 'ajuster', raccourci: '0', onClick: vues.ajuster },
    { id: 'reel', libelle: 'Taille réelle (100 %)', icone: 'taille-reelle', raccourci: '1', onClick: vues.centrer100 },
    { id: 'selection', libelle: 'Zoomer sur la sélection', icone: 'zoom-selection', raccourci: 'Z', desactive: !ed.sel.length, onClick: ed.zoomerSelection },
    { id: 'grille', libelle: 'Grille magnétique (pas ' + ed.pas + ')', raccourci: 'G', coche: ed.grille, separateur: true, onClick: () => ed.poserGrille(!ed.grille) },
    { id: 'aimants', libelle: 'Aimants vers les autres formes', raccourci: 'M', coche: ed.aimants, onClick: () => ed.poserAimants(!ed.aimants) },
    { id: 'contours', libelle: 'Vue contours', raccourci: 'O', coche: contours, onClick: () => poserContours(c => !c) },
    ...FONDS.map(([f, icone, libelle], i): ElementMenu => ({ id: 'fond-' + f, libelle, icone, coche: fond === f, separateur: i === 0, onClick: () => poserFond(f) }))
  ];
}

function elementsEdition({ ed, defaire, refaire }: ProprietesBarre): ElementMenu[] {
  const rien = !ed.sel.length;
  return [
    { id: 'annuler', libelle: 'Annuler', icone: 'annuler', raccourci: 'Ctrl+Z', desactive: !ed.h.passe.length, onClick: defaire },
    { id: 'retablir', libelle: 'Rétablir', icone: 'retablir', raccourci: 'Ctrl+Maj+Z', desactive: !ed.h.futur.length, onClick: refaire },
    { id: 'copier', libelle: 'Copier', icone: 'copier', raccourci: 'Ctrl+C', desactive: rien, separateur: true, onClick: ed.copierSelection },
    { id: 'couper', libelle: 'Couper', icone: 'couper', raccourci: 'Ctrl+X', desactive: rien, onClick: ed.couperSelection },
    { id: 'coller', libelle: 'Coller', icone: 'coller', raccourci: 'Ctrl+V', desactive: !ed.presse.length, onClick: ed.collerPresse },
    { id: 'dupliquer', libelle: 'Dupliquer', icone: 'dupliquer', raccourci: 'Ctrl+D', desactive: rien, onClick: ed.dupliquerSelection },
    { id: 'tout', libelle: 'Tout sélectionner', icone: 'tout-selectionner', raccourci: 'Ctrl+A', separateur: true, desactive: !ed.dessin.formes.length, onClick: () => ed.choisir(ed.dessin.formes.filter(f => f.visible && !f.verrouille).map(f => f.id)) },
    { id: 'meme-couleur', libelle: 'Sélectionner la même couleur', icone: 'palette', raccourci: 'C', desactive: rien, onClick: ed.choisirMemeCouleur },
    { id: 'aucun', libelle: 'Ne rien sélectionner', icone: 'aucune-selection', raccourci: 'Échap', desactive: rien, onClick: () => { ed.choisir([]); ed.poserPoint(null); } },
    { id: 'supprimer', libelle: 'Supprimer', icone: 'supprimer', raccourci: 'Suppr', danger: true, separateur: true, desactive: rien, onClick: ed.supprimerSelection }
  ];
}

/** La barre principale : outils, couleurs, historique, zoom, puis les menus Vue, Edition et Fichier. */
export function Barre(p: ProprietesBarre) {
  const { ed, titre, nom, vues, defaire, refaire, demanderFermeture, modifie } = p;
  const z = vues.vue.zoom;
  const fichier: ElementMenu[] = [
    { id: 'enregistrer', libelle: 'Enregistrer', icone: 'enregistrer', raccourci: 'Ctrl+S', desactive: !modifie, onClick: ed.enregistrerTout },
    { id: 'telecharger', libelle: 'Télécharger le SVG', icone: 'telecharger', onClick: () => { void proposer(nom + '.svg', texteOctets(ecrireDessin(ed.dessin, 3))).then(ed.dire); } },
    { id: 'copier-code', libelle: 'Copier le code SVG', icone: 'copier', onClick: () => { void copier(ecrireDessin(ed.dessin, 3)).then(ok => ed.dire(ok ? 'Code SVG copié.' : 'La page n’a pas le droit d’écrire dans le presse-papiers.')); } },
    { id: 'fermer', libelle: 'Fermer l’éditeur', icone: 'fermer', raccourci: 'Échap', separateur: true, onClick: demanderFermeture }
  ];
  return (
    <header className="editeur-barre">
      <strong className="editeur-titre">{titre}</strong>
      <div className="groupe outils" role="group" aria-label="Outil">
        {OUTILS_FIXES.map(([o, icone, aide]) => <Bouton key={o} icone={icone} aide={aide} pressed={ed.outil === o} onClick={() => ed.poserOutil(o)} />)}
        <OutilFormes ed={ed} />
        {OUTILS_APRES.map(([o, icone, aide]) => <Bouton key={o} icone={icone} aide={aide} pressed={ed.outil === o} onClick={() => ed.poserOutil(o)} />)}
      </div>
      <StyleCourant ed={ed} />
      <div className="groupe" role="group" aria-label="Historique">
        <Bouton icone="annuler" aide="Annuler (Ctrl+Z)" disabled={!ed.h.passe.length} onClick={defaire} />
        <Bouton icone="retablir" aide="Rétablir (Ctrl+Maj+Z)" disabled={!ed.h.futur.length} onClick={refaire} />
      </div>
      <div className="groupe" role="group" aria-label="Zoom">
        <Bouton icone="zoom-moins" aide="Dézoomer (−)" onClick={() => vues.zoomer(0.8)} />
        <button type="button" className="zoom" title="Ajuster à l’écran (0)" onClick={vues.ajuster} aria-live="polite">{Math.round(z * 100)} %</button>
        <Bouton icone="zoom-plus" aide="Zoomer (+)" onClick={() => vues.zoomer(1.25)} />
      </div>
      <div className="groupe menus" role="group" aria-label="Menus">
        <MenuDeroulant etiquette="Vue" libelle="Vue" elements={elementsVue(p)} />
        <MenuDeroulant etiquette="Édition" libelle="Édition" elements={elementsEdition(p)} />
      </div>
      <span className="espace" />
      <div className="groupe fin" role="group" aria-label="Fichier">
        <MenuDeroulant etiquette="Fichier" libelle="Fichier" alignement="droite" elements={fichier}
          enfants={<><hr className="menu-filet" /><p className="menu-titre">Exporter</p><ContenuExport svg="" dessin={ed.dessin} nom={nom} dire={ed.dire} /></>} />
        <button type="button" className="primaire texte" title="Enregistrer (Ctrl+S)" onClick={ed.enregistrerTout} disabled={!modifie}><Icone nom="enregistrer" /> Enregistrer</button>
      </div>
    </header>
  );
}

/**
 * Les deux couleurs a portee de main : celles de la selection quand il y en a une (un clic les change
 * pour toutes les formes choisies), celles des formes a venir sinon.
 */
function StyleCourant({ ed }: { ed: Edition }) {
  const premiere = ed.sel.length ? ed.dessin.formes.find(f => f.id === ed.sel[0]) ?? null : null;
  const remplissage = premiere ? premiere.remplissage : ed.style.remplissage, contour = premiere ? premiere.contour : ed.style.contour;
  const poser = (r: Partial<Pick<Style, 'remplissage' | 'contour'>>, cle: string) => {
    if (premiere) ed.appliquer(d => modifier(d, ed.sel, r), cle + ':' + ed.sel.join(','));
    else ed.poserStyle({ ...ed.style, ...r });
  };
  const pastille = (libelle: string, valeur: string | null, cle: 'remplissage' | 'contour') => (
    <span className="pastille-style" title={libelle + (premiere ? ' de la sélection' : ' des formes à venir') + ' : ' + (valeur ?? 'aucun')}>
      <input type="color" aria-label={libelle} value={estHex(valeur) ? valeur : '#000000'} onChange={e => poser({ [cle]: e.target.value }, cle)} onBlur={ed.finir} />
      <button type="button" className={'aucun' + (valeur === null ? ' actif' : '')} aria-pressed={valeur === null} title={libelle + (valeur === null ? ' : aucun (cliquez pour en mettre un)' : ' : retirer')} aria-label={libelle + ' : aucun'} onClick={() => { poser({ [cle]: valeur === null ? '#000000' : null }, cle); ed.finir(); }}><Icone nom="fermer" taille={12} /></button>
    </span>
  );
  return (
    <div className="groupe style-courant" role="group" aria-label="Couleurs">
      {pastille('Remplissage', remplissage, 'remplissage')}
      {pastille('Contour', contour, 'contour')}
    </div>
  );
}

/** La rangee de la selection : aligner, retourner, tourner, empiler, booleens, combiner, separer, et le reste d'un geste. */
export function BarreSelection({ ed }: { ed: Edition }) {
  const { sel } = ed;
  const separable = !!ed.formeSeule && sousChemins(ed.formeSeule.d).length > 1;
  const surPlan = sel.length > 1 ? '' : ' (sur le plan)';
  return (
    <div className="editeur-barre-selection" role="toolbar" aria-label="Sélection">
      <span className="aide">{sel.length} sélectionnée{sel.length > 1 ? 's' : ''}</span>
      <div className="groupe" role="group" aria-label="Aligner">
        {ALIGNEMENTS_ICONES.map(([a, icone, aide]) => <Bouton key={a} icone={icone} aide={aide + surPlan} onClick={() => ed.faire(d => aligner(d, sel, a))} />)}
      </div>
      <div className="groupe" role="group" aria-label="Transformer">
        <Bouton icone="miroir-h" aide="Miroir horizontal" onClick={() => ed.faire(d => retourner(d, sel, 'h'))} />
        <Bouton icone="miroir-v" aide="Miroir vertical" onClick={() => ed.faire(d => retourner(d, sel, 'v'))} />
        <Bouton icone="rotation-gauche" aide="Tourner de 90° vers la gauche" onClick={() => ed.faire(d => tourner(d, sel, -90))} />
        <Bouton icone="rotation-droite" aide="Tourner de 90° vers la droite" onClick={() => ed.faire(d => tourner(d, sel, 90))} />
      </div>
      <div className="groupe" role="group" aria-label="Empiler">
        {ORDRES_ICONES.map(([o, icone, aide]) => <Bouton key={o} icone={icone} aide={aide} onClick={() => ed.faire(d => ordonner(d, sel, o))} />)}
      </div>
      <div className="groupe" role="group" aria-label="Booléens">
        {BOOLEENS_ICONES.map(([op, icone, aide]) => <Bouton key={op} icone={icone} aide={aide} disabled={sel.length < 2} onClick={() => ed.booleen(op)} />)}
      </div>
      <div className="groupe" role="group" aria-label="Formes">
        <Bouton icone="combiner" aide="Combiner en une forme (Ctrl+G)" disabled={sel.length < 2} onClick={ed.combinerSelection} />
        <Bouton icone="separer" aide="Séparer les tracés (Ctrl+Maj+G)" disabled={!separable} onClick={ed.separerSelection} />
        <Bouton icone="dupliquer" aide="Dupliquer (Ctrl+D)" onClick={ed.dupliquerSelection} />
        <Bouton icone="masquer" aide="Masquer" onClick={ed.masquerSelection} />
        <Bouton icone="verrouiller" aide="Verrouiller" onClick={ed.verrouillerSelection} />
        <Bouton icone="supprimer" aide="Supprimer (Suppr)" className="danger" onClick={ed.supprimerSelection} />
      </div>
    </div>
  );
}

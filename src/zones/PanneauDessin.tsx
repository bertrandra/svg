// Le panneau du dessin : sans selection, ou avec un outil de trace. Style des formes nouvelles, couleurs,
// nettoyage, bibliotheque, versions, raccourcis.

import { memo, useMemo, useState } from 'react';
import { ajusterPlan, regrouper, retirerPetites, simplifier, statistiques } from '../engine/editionSvg.js';
import { bibliothequeChargee, type Bibliotheque } from '../io/bibliotheque.js';
import type { EntreeBibliotheque } from '../model/bibliotheque.js';
import { origineDeBibliotheque } from '../model/credits.js';
import { SCENES } from '../model/scenes.js';
import { pluriel } from '../util/texte.js';
import { RechercheFormes, useBibliotheque } from './Bibliotheque.js';
import { FORMES } from './aidesEditeur.js';
import { Section } from './commun/Section.js';
import { CouleursDuDessin } from './CouleursDuDessin.js';
import { Icone } from './icones.js';
import { Nombre, Peinture } from './Inspecteur.js';
import { PanneauPalettes } from './Palettes.js';
import { PanneauTexte } from './Texte.js';
import { PanneauVersions } from './Versions.js';
import { phraseIgnores } from './aidesEditeur.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';

const SEUILS: ReadonlyArray<readonly [number, string]> = [[0.0001, 'Poussières (0,01 %)'], [0.0005, 'Petits détails (0,05 %)'], [0.002, 'Détails moyens (0,2 %)']];

/** Sans selection, ou avec un outil de trace : le style des formes nouvelles, le dessin entier, ses couleurs, son nettoyage, la bibliotheque. */
export function PanneauDessin() {
  const mo = useDessin(), ac = useActions(), ui = useInterface();
  const { dessin } = mo;
  const [seuil, poserSeuil] = useState(0.0005);
  const stats = useMemo(() => statistiques(dessin), [dessin]);
  const masquees = dessin.formes.filter(f => !f.visible).length;
  const trace = FORMES.has(ui.outil) || ui.outil === 'plume' || ui.outil === 'texte';
  return (
    <>
      <h3>{ui.outil === 'texte' ? 'Texte' : trace ? 'Nouvelle forme' : 'Dessin'}</h3>
      {ui.outil === 'texte' ? <PanneauTexte /> : null}
      {trace ? <StyleNouvelleForme /> : null}
      <p className="aide">{pluriel(stats.formes, 'forme')} · {stats.points} points · {Math.max(1, Math.round(stats.octets / 1024))} Ko{masquees ? ' · ' + pluriel(masquees, 'masquée') + ', retirée' + (masquees > 1 ? 's' : '') + ' à l’enregistrement' : ''}</p>
      {mo.ignores.length ? <p className="aide" role="note">{phraseIgnores(mo.ignores)}</p> : null}
      <CouleursDuDessin />
      <PanneauPalettes />
      {mo.bibliotheque ? <PanneauBibliotheque bibliotheque={mo.bibliotheque} /> : null}
      <Section titre="Nettoyer le tracé">
        <label className="champ-ligne">
          <span>Seuil</span>
          <select value={String(seuil)} onChange={e => poserSeuil(Number(e.target.value))}>
            {SEUILS.map(([v, t]) => <option key={v} value={String(v)}>{t}</option>)}
          </select>
        </label>
        <div className="boutons">
          <button type="button" onClick={() => { const r = retirerPetites(dessin, seuil); ac.appliquer(() => r.dessin); ac.dire(r.retirees ? pluriel(r.retirees, 'petite forme') + ' retirée' + (r.retirees > 1 ? 's' : '') + '.' : 'Aucune forme sous ce seuil.'); }}>Retirer les petites formes</button>
          <button type="button" onClick={() => { const r = regrouper(dessin); ac.appliquer(() => r.dessin); ac.dire(r.reunies ? pluriel(r.reunies, 'forme') + ' regroupée' + (r.reunies > 1 ? 's' : '') + ' avec leur voisine de même couleur.' : 'Rien à regrouper sans changer le rendu.'); }}>Regrouper les voisines de même couleur</button>
          <button type="button" title="Retire les points inutiles des segments droits, à l’écart près du seuil ; les courbes et les formes verrouillées restent" onClick={() => { const r = simplifier(dessin, dessin.formes.map(f => f.id), Math.max(dessin.vb[2], dessin.vb[3]) * seuil); ac.appliquer(() => r.dessin); ac.dire(r.retires ? pluriel(r.retires, 'point') + ' retiré' + (r.retires > 1 ? 's' : '') + ' sur ' + pluriel(r.formes, 'forme') + '.' : 'Aucun point à retirer à ce seuil.'); }}>Simplifier les tracés</button>
          <button type="button" onClick={() => ac.faire(d => ajusterPlan(d), 'Plan de travail ajusté au dessin.')}>Ajuster le plan de travail</button>
        </div>
      </Section>
      <PanneauVersions />
      <Section titre="Raccourcis">
        <ul className="raccourcis">
          <li>V sélection · A points · H, ou espace maintenu en glissant : main · O contours</li>
          <li>R rectangle · E ellipse · S étoile · L ligne · P plume (Entrée ferme, Retour arrière retire un point) · T texte</li>
          <li>M aimants · poignée ronde : rotation (Maj : par 15°) · deux doigts : zoom</li>
          <li>Ctrl+Z annuler · Ctrl+Maj+Z ou Ctrl+Y rétablir</li>
          <li>Ctrl+C copier · Ctrl+X couper · Ctrl+V coller · Ctrl+D dupliquer · Ctrl+A tout sélectionner · Suppr supprimer</li>
          <li>Ctrl+G combiner · Ctrl+Maj+G séparer · Ctrl+] avancer, Ctrl+[ reculer (Maj : premier ou arrière-plan)</li>
          <li>G grille magnétique · Z zoom sur la sélection · C choisir les formes de même couleur · Ctrl+S enregistrer</li>
          <li>Flèches : déplacer (Maj : ×10) · Alt+flèches : redimensionner, coin haut gauche fixe (Maj : ×10) · Ctrl+flèche gauche ou droite : tourner de 15° (Maj : 1°) · Maj en glissant : contraindre</li>
          <li>Au clavier, sur la toile : Tab et Maj+Tab passent à la forme suivante ou précédente (en mode points, au point suivant ou précédent) ; après la dernière, Tab quitte la toile · Page suivante et Page précédente : forme suivante ou précédente, en boucle · Entrée sur une forme : ses points</li>
          <li>Outils de tracé au clavier : les flèches déplacent le réticule (Maj : ×10), Entrée pose la forme à sa taille par défaut au réticule, ou un point avec la plume (Maj+Entrée termine le tracé) · Échap puis Tab quittent la toile · « Aller à la toile » est le premier arrêt de Tab</li>
          <li>Une forme à deux coins au clavier : Espace (ou Maj+Entrée) pose le premier coin au réticule, les flèches déplacent l’autre coin (un aperçu en pointillés suit), Espace ou Entrée le pose ; Échap annule le premier coin</li>
          <li>Sélection additive au clavier (outil sélection) : Maj+Page suivante ou Maj+Page précédente ajoute la forme voisine à la sélection et y place le curseur ; Espace ajoute ou retire la forme au curseur. Il n’y a pas de cadre de sélection au clavier : Ctrl+A, « Tout », « Inverser » et C (même couleur) en tiennent lieu</li>
          <li>Outil texte : Entrée met le focus dans le champ Texte du panneau ; « Ajouter le texte » pose les lettres au centre du plan</li>
          <li>Molette : zoom · Maj+molette : défiler · + / − · 0 ajuster · 1 taille réelle · Échap désélectionner</li>
        </ul>
      </Section>
    </>
  );
}

/** Le style des formes a venir : remplissage, contour, epaisseur. */
function StyleNouvelleForme() {
  const mo = useDessin(), ac = useActions(), ui = useInterface();
  const s = ui.style;
  return (
    <>
      <Peinture libelle="Remplissage" valeur={s.remplissage} mixte={false} nuancier={mo.nuancier} finir={() => undefined} poser={v => ac.poserStyle({ ...s, remplissage: v })} />
      <Peinture libelle="Contour" valeur={s.contour} mixte={false} nuancier={mo.nuancier} finir={() => undefined} poser={v => ac.poserStyle({ ...s, contour: v })} />
      {s.contour || ui.outil === 'ligne' ? <Nombre libelle="Épaisseur" valeur={s.epaisseur} min={0} poser={v => ac.poserStyle({ ...s, epaisseur: v })} /> : null}
      <p className="aide">{ui.outil === 'ligne' ? 'Une ligne prend la couleur de contour, ou celle du remplissage à défaut.' : 'Les formes tracées prennent ce style ; elles se règlent ensuite comme les autres.'}</p>
    </>
  );
}

/** La bibliotheque dans l'editeur : chercher, cliquer, la forme arrive au centre du plan. */
function PanneauBibliotheque({ bibliotheque }: { bibliotheque: Bibliotheque | 'a-charger' }) {
  const [voulue, vouloir] = useState(bibliotheque !== 'a-charger' || bibliothequeChargee());
  return (
    <Section titre="Bibliothèque de formes">
      {voulue ? <BibliothequeChargee bibliotheque={bibliotheque} /> : <button type="button" className="primaire" onClick={() => vouloir(true)}>Charger la bibliothèque (environ 7 Mo)</button>}
    </Section>
  );
}

const BibliothequeChargee = memo(function BibliothequeChargee({ bibliotheque }: { bibliotheque: Bibliotheque | 'a-charger' }) {
  const ac = useActions();
  const chargee = useBibliotheque();
  const [panier, poserPanier] = useState<EntreeBibliotheque[]>([]);
  const [sceneId, poserSceneId] = useState(SCENES[0]?.id ?? '');
  const b = bibliotheque !== 'a-charger' ? bibliotheque : chargee.bibliotheque;
  if (chargee.erreur && !b) return <p className="aide" role="alert">{chargee.erreur}</p>;
  if (!b) return <p className="aide" role="status">Chargement…</p>;
  // Chaque forme de la bibliotheque s'insere avec son origine : c'est ce qui fait ecrire la mention CC BY 3.0 dans le SVG.
  const choisir = (x: EntreeBibliotheque) => ac.insererForme(x.svg, origineDeBibliotheque(x.id));
  // Le panier en grille : autant de colonnes que la racine du nombre, chaque case a 80 % de sa cellule.
  const insererPanier = () => {
    const n = panier.length, cols = Math.ceil(Math.sqrt(n)), lignes = Math.ceil(n / cols), cellule = 1 / Math.max(cols, lignes);
    ac.insererPlusieurs(panier.map((x, i) => ({ svg: x.svg, origine: origineDeBibliotheque(x.id), x: (i % cols) * cellule + cellule * 0.1, y: Math.floor(i / cols) * cellule + cellule * 0.1 + ((Math.max(cols, lignes) - lignes) * cellule) / 2, taille: cellule * 0.8 })));
    poserPanier([]);
  };
  const insererScene = () => {
    const sc = SCENES.find(x => x.id === sceneId);
    if (!sc) return;
    const parId = new Map(b.entrees.map(x => [x.id, x.svg]));
    ac.insererPlusieurs(sc.elements.flatMap(e => { const svg = parId.get(e.id); return svg ? [{ svg, origine: origineDeBibliotheque(e.id), x: e.x, y: e.y, taille: e.taille }] : []; }));
  };
  return (
    <>
      <div className="champ-ligne scene">
        <span>Scène</span>
        <select aria-label="Scène prête" value={sceneId} onChange={e => poserSceneId(e.target.value)}>{SCENES.map(sc => <option key={sc.id} value={sc.id}>{sc.nom}</option>)}</select>
        <button type="button" title="Insérer la scène : ses formes, à leur place" aria-label="Insérer la scène" onClick={insererScene}><Icone nom="scene" taille={14} /></button>
      </div>
      <RechercheFormes bibliotheque={b} choisir={choisir} ajouter={x => poserPanier(p => (p.includes(x) ? p : [...p, x]))} parPage={24} compact />
      {panier.length ? (
        <div className="panier">
          <span className="aide">{panier.length} dans le panier : {panier.map(x => x.nom).join(', ')}</span>
          <div className="boutons">
            <button type="button" className="primaire" onClick={insererPanier}>Insérer en grille</button>
            <button type="button" className="discret" onClick={() => poserPanier([])}>Vider</button>
          </div>
        </div>
      ) : <p className="aide">Un clic insère au centre ; « + » met dans le panier pour insérer plusieurs formes en grille.</p>}
    </>
  );
});

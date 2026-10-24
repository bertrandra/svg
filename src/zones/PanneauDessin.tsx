// Le panneau du dessin : sans selection, ou avec un outil de trace. Style des formes nouvelles, couleurs,
// nettoyage, bibliotheque, versions, raccourcis.

import { useMemo, useState } from 'react';
import { ajusterPlan, couleursDuDessin, idsDeCouleur, regrouper, remplacerCouleur, retirerPetites, statistiques } from '../engine/editionSvg.js';
import { bibliothequeChargee } from '../io/bibliotheque.js';
import type { EntreeBibliotheque } from '../model/bibliotheque.js';
import { SCENES } from '../model/scenes.js';
import { RechercheFormes, useBibliotheque } from './Bibliotheque.js';
import { FORMES } from './BarreOutils.js';
import { Section } from './Section.js';
import { Icone } from './icones.js';
import { Nombre, Peinture } from './Inspecteur.js';
import { PanneauPalettes } from './Palettes.js';
import { PanneauTexte } from './Texte.js';
import { PanneauVersions } from './Versions.js';
import { estHex } from './aidesEditeur.js';
import type { Edition } from './typesEditeur.js';

const SEUILS: ReadonlyArray<readonly [number, string]> = [[0.0001, 'Poussières (0,01 %)'], [0.0005, 'Petits détails (0,05 %)'], [0.002, 'Détails moyens (0,2 %)']];

/** Sans selection, ou avec un outil de trace : le style des formes nouvelles, le dessin entier, ses couleurs, son nettoyage, la bibliotheque. */
export function PanneauDessin({ ed }: { ed: Edition }) {
  const { dessin } = ed;
  const [seuil, poserSeuil] = useState(0.0005);
  const stats = useMemo(() => statistiques(dessin), [dessin]);
  const couleurs = useMemo(() => couleursDuDessin(dessin), [dessin]);
  const masquees = dessin.formes.filter(f => !f.visible).length;
  const pl = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
  const trace = FORMES.has(ed.outil) || ed.outil === 'plume' || ed.outil === 'texte';
  return (
    <>
      <h3>{ed.outil === 'texte' ? 'Texte' : trace ? 'Nouvelle forme' : 'Dessin'}</h3>
      {ed.outil === 'texte' ? <PanneauTexte ed={ed} /> : null}
      {trace ? <StyleNouvelleForme ed={ed} /> : null}
      <p className="aide">{pl(stats.formes, 'forme')} · {stats.points} points · {Math.max(1, Math.round(stats.octets / 1024))} Ko{masquees ? ' · ' + pl(masquees, 'masquée') + ', retirée' + (masquees > 1 ? 's' : '') + ' à l’enregistrement' : ''}</p>
      <Section titre="Couleurs du dessin" ouverte note={couleurs.length}>
        <ul className="couleurs-dessin">
          {couleurs.map((c, i) => (
            <li key={i}>
              <input type="color" aria-label={'Remplacer ' + c.couleur} value={estHex(c.couleur) ? c.couleur : '#000000'}
                onChange={e => ed.appliquer(d => remplacerCouleur(d, c.couleur, e.target.value), 'recolorer-' + i)} onBlur={ed.finir} />
              <button type="button" className="discret" title="Sélectionner les formes de cette couleur" onClick={() => ed.choisir(idsDeCouleur(dessin, c.couleur))}>
                {c.couleur.toUpperCase()} · {c.formes}
              </button>
              {ed.nuancier.length ? (
                <select aria-label={'Remplacer ' + c.couleur + ' par une couleur du nuancier'} value="" onChange={e => { const v = e.target.value; if (v) ed.faire(d => remplacerCouleur(d, c.couleur, v)); }}>
                  <option value="">→ nuancier…</option>
                  {ed.nuancier.map(t => <option key={t.hex} value={t.hex}>{t.nom} ({t.hex.toUpperCase()})</option>)}
                </select>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>
      <PanneauPalettes ed={ed} />
      {ed.bibliotheque ? <PanneauBibliotheque ed={ed} /> : null}
      <Section titre="Nettoyer le tracé">
        <label className="champ-ligne">
          <span>Seuil</span>
          <select value={String(seuil)} onChange={e => poserSeuil(Number(e.target.value))}>
            {SEUILS.map(([v, t]) => <option key={v} value={String(v)}>{t}</option>)}
          </select>
        </label>
        <div className="boutons">
          <button type="button" onClick={() => { const r = retirerPetites(dessin, seuil); ed.appliquer(() => r.dessin); ed.dire(r.retirees ? pl(r.retirees, 'petite forme') + ' retirée' + (r.retirees > 1 ? 's' : '') + '.' : 'Aucune forme sous ce seuil.'); }}>Retirer les petites formes</button>
          <button type="button" onClick={() => { const r = regrouper(dessin); ed.appliquer(() => r.dessin); ed.dire(r.reunies ? pl(r.reunies, 'forme') + ' regroupée' + (r.reunies > 1 ? 's' : '') + ' avec leur voisine de même couleur.' : 'Rien à regrouper sans changer le rendu.'); }}>Regrouper les voisines de même couleur</button>
          <button type="button" onClick={() => ed.faire(d => ajusterPlan(d), 'Plan de travail ajusté au dessin.')}>Ajuster le plan de travail</button>
        </div>
      </Section>
      <PanneauVersions ed={ed} />
      <Section titre="Raccourcis">
        <ul className="raccourcis">
          <li>V sélection · A points · H ou espace : main · O contours</li>
          <li>R rectangle · E ellipse · S étoile · L ligne · P plume (Entrée ferme, Retour arrière retire un point) · T texte</li>
          <li>M aimants · poignée ronde : rotation (Maj : par 15°) · deux doigts : zoom</li>
          <li>Ctrl+Z annuler · Ctrl+Maj+Z ou Ctrl+Y rétablir</li>
          <li>Ctrl+C copier · Ctrl+X couper · Ctrl+V coller · Ctrl+D dupliquer · Ctrl+A tout sélectionner · Suppr supprimer</li>
          <li>Ctrl+G combiner · Ctrl+Maj+G séparer · Ctrl+] avancer, Ctrl+[ reculer (Maj : premier ou arrière-plan)</li>
          <li>G grille magnétique · Z zoom sur la sélection · Ctrl+S enregistrer</li>
          <li>Flèches : déplacer (Maj : ×10) · Maj en glissant : contraindre</li>
          <li>Molette : zoom · Maj+molette : défiler · + / − · 0 ajuster · 1 taille réelle · Échap désélectionner</li>
        </ul>
      </Section>
    </>
  );
}

/** Le style des formes a venir : remplissage, contour, epaisseur. */
function StyleNouvelleForme({ ed }: { ed: Edition }) {
  const s = ed.style;
  return (
    <>
      <Peinture libelle="Remplissage" valeur={s.remplissage} mixte={false} nuancier={ed.nuancier} finir={() => undefined} poser={v => ed.poserStyle({ ...s, remplissage: v })} />
      <Peinture libelle="Contour" valeur={s.contour} mixte={false} nuancier={ed.nuancier} finir={() => undefined} poser={v => ed.poserStyle({ ...s, contour: v })} />
      {s.contour || ed.outil === 'ligne' ? <Nombre libelle="Épaisseur" valeur={s.epaisseur} min={0} poser={v => ed.poserStyle({ ...s, epaisseur: v })} /> : null}
      <p className="aide">{ed.outil === 'ligne' ? 'Une ligne prend la couleur de contour, ou celle du remplissage à défaut.' : 'Les formes tracées prennent ce style ; elles se règlent ensuite comme les autres.'}</p>
    </>
  );
}

/** La bibliotheque dans l'editeur : chercher, cliquer, la forme arrive au centre du plan. */
function PanneauBibliotheque({ ed }: { ed: Edition }) {
  const [voulue, vouloir] = useState(ed.bibliotheque !== 'a-charger' || bibliothequeChargee());
  return (
    <Section titre="Bibliothèque de formes">
      {voulue ? <BibliothequeChargee ed={ed} /> : <button type="button" className="primaire" onClick={() => vouloir(true)}>Charger la bibliothèque (environ 7 Mo)</button>}
    </Section>
  );
}

function BibliothequeChargee({ ed }: { ed: Edition }) {
  const chargee = useBibliotheque();
  const [panier, poserPanier] = useState<EntreeBibliotheque[]>([]);
  const [sceneId, poserSceneId] = useState(SCENES[0]?.id ?? '');
  const b = ed.bibliotheque !== 'a-charger' && ed.bibliotheque ? ed.bibliotheque : chargee.bibliotheque;
  if (chargee.erreur && !b) return <p className="aide" role="alert">{chargee.erreur}</p>;
  if (!b) return <p className="aide" role="status">Chargement…</p>;
  const choisir = (x: EntreeBibliotheque) => ed.insererForme(x.svg);
  // Le panier en grille : autant de colonnes que la racine du nombre, chaque case a 80 % de sa cellule.
  const insererPanier = () => {
    const n = panier.length, cols = Math.ceil(Math.sqrt(n)), lignes = Math.ceil(n / cols), cellule = 1 / Math.max(cols, lignes);
    ed.insererPlusieurs(panier.map((x, i) => ({ svg: x.svg, x: (i % cols) * cellule + cellule * 0.1, y: Math.floor(i / cols) * cellule + cellule * 0.1 + ((Math.max(cols, lignes) - lignes) * cellule) / 2, taille: cellule * 0.8 })));
    poserPanier([]);
  };
  const insererScene = () => {
    const sc = SCENES.find(x => x.id === sceneId);
    if (!sc) return;
    const parId = new Map(b.entrees.map(x => [x.id, x.svg]));
    ed.insererPlusieurs(sc.elements.flatMap(e => { const svg = parId.get(e.id); return svg ? [{ svg, x: e.x, y: e.y, taille: e.taille }] : []; }));
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
}

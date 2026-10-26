// Le panneau du dessin : sans selection, ou avec un outil de trace. Style des formes nouvelles, couleurs,
// nettoyage, bibliotheque, versions, raccourcis.

import { memo, useMemo, useState } from 'react';
import { ajusterPlan, FICHES_FORMES, regrouper, retirerPetites, simplifier, statistiques } from '../engine/editionSvg.js';
import type { Bibliotheque } from '../io/bibliotheque.js';
import type { EntreeBibliotheque } from '../model/bibliotheque.js';
import { origineDeBibliotheque, origineDeForme } from '../model/credits.js';
import { SCENES } from '../model/scenes.js';
import { pluriel } from '../util/texte.js';
import { RechercheFormes, useBibliotheque } from './Bibliotheque.js';
import { FORMES } from './aidesEditeur.js';
import { EtatVide } from './commun/EtatVide.js';
import { Section } from './commun/Section.js';
import { ListeRaccourcis } from './AideEditeur.js';
import { CouleursDuDessin } from './CouleursDuDessin.js';
import { SectionNuancier } from './SectionNuancier.js';
import { Icone } from './icones.js';
import { Nombre, Peinture } from './Inspecteur.js';
import { PanneauPalettes } from './Palettes.js';
import { PanneauTexte } from './Texte.js';
import { PanneauVersions } from './Versions.js';
import { ReglagesForme } from './ReglagesForme.js';
import { phraseIgnores } from './aidesEditeur.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import type { OutilForme } from './typesEditeur.js';
import { lentilleDe } from './lentille.js';
import { RAISONS_LENTILLE } from './phrasesContenus.js';
import { t } from '../util/i18n.js';

// Une fonction, pas une constante : les libelles se traduisent au rendu, quand le dictionnaire de la langue est pose (ADR-0042).
const seuils = (): ReadonlyArray<readonly [number, string]> => [[0.0001, t('Poussières (0,01 %)')], [0.0005, t('Petits détails (0,05 %)')], [0.002, t('Détails moyens (0,2 %)')]];

/** Sans selection, ou avec un outil de trace : le style des formes nouvelles, le dessin entier, ses couleurs, son nettoyage, la bibliotheque. */
export function PanneauDessin() {
  const mo = useDessin(), ac = useActions(), ui = useInterface();
  const { dessin } = mo;
  const lentille = lentilleDe(ui.contexte) !== null;
  // Sans recalage automatique (ADR-0039), le plan est le tapis, fixe : l'ajuster au dessin le recalerait.
  const planFixe = !!ui.profil && !ui.profil.recalage && ui.profil.procede !== 'imprimer-decouper';
  const raisonPlan = lentille ? RAISONS_LENTILLE.plan : planFixe ? t('Sans recalage automatique, le plan de travail est le tapis : il ne suit pas le dessin.') : undefined;
  const [seuil, poserSeuil] = useState(0.0005);
  const stats = useMemo(() => statistiques(dessin), [dessin]);
  const masquees = dessin.formes.filter(f => !f.visible).length;
  const trace = FORMES.has(ui.outil) || ui.outil === 'plume' || ui.outil === 'texte';
  return (
    <>
      <h3>{ui.outil === 'texte' ? t('Texte') : trace ? t('Nouvelle forme') : t('Dessin')}</h3>
      {ui.outil === 'texte' ? <PanneauTexte /> : null}
      {FORMES.has(ui.outil) ? <ReglagesForme /> : null}
      {trace ? <StyleNouvelleForme /> : <SansSelection />}
      <p className="aide">{pluriel(stats.formes, 'forme')} · {t('{n} points', { n: stats.points })} · {t('{n} Ko', { n: Math.max(1, Math.round(stats.octets / 1024)) })}{masquees ? ' · ' + (masquees > 1 ? t('{masquees}, retirées à l’enregistrement', { masquees: pluriel(masquees, 'masquée') }) : t('{masquees}, retirée à l’enregistrement', { masquees: pluriel(masquees, 'masquée') })) : ''}</p>
      {mo.ignores.length ? <p className="aide" role="note">{phraseIgnores(mo.ignores)}</p> : null}
      <SectionNuancier />
      <CouleursDuDessin />
      <PanneauPalettes />
      {mo.bibliotheque ? <PanneauBibliotheque bibliotheque={mo.bibliotheque} /> : null}
      <Section titre={t('Nettoyer le tracé')}>
        <label className="champ-ligne">
          <span>{t('Seuil')}</span>
          <select value={String(seuil)} onChange={e => poserSeuil(Number(e.target.value))}>
            {seuils().map(([v, libelle]) => <option key={v} value={String(v)}>{libelle}</option>)}
          </select>
        </label>
        <div className="boutons">
          <button type="button" onClick={() => { const r = retirerPetites(dessin, seuil); ac.appliquer(() => r.dessin); const formes = pluriel(r.retirees, 'petite forme'); ac.dire(r.retirees ? (r.retirees > 1 ? t('{formes} retirées.', { formes }) : t('{formes} retirée.', { formes })) : t('Aucune forme sous ce seuil.')); }}>{t('Retirer les petites formes')}</button>
          <button type="button" onClick={() => { const r = regrouper(dessin); ac.appliquer(() => r.dessin); const formes = pluriel(r.reunies, 'forme'); ac.dire(r.reunies ? (r.reunies > 1 ? t('{formes} regroupées avec leur voisine de même couleur.', { formes }) : t('{formes} regroupée avec leur voisine de même couleur.', { formes })) : t('Rien à regrouper sans changer le rendu.')); }}>{t('Regrouper les voisines de même couleur')}</button>
          <button type="button" title={ui.profil ? t('Retire les points inutiles des segments droits, à la tolérance du matériau ; les courbes et les formes verrouillées restent') : t('Retire les points inutiles des segments droits, à l’écart près du seuil ; les courbes et les formes verrouillées restent')} onClick={() => { const r = simplifier(dessin, dessin.formes.map(f => f.id), ui.profil ? ui.profil.toleranceNettoyage : Math.max(dessin.vb[2], dessin.vb[3]) * seuil); ac.appliquer(() => r.dessin); const v = { points: pluriel(r.retires, 'point'), formes: pluriel(r.formes, 'forme') }; ac.dire(r.retires ? (r.retires > 1 ? t('{points} retirés sur {formes}.', v) : t('{points} retiré sur {formes}.', v)) : t('Aucun point à retirer à ce seuil.')); }}>{t('Simplifier les tracés')}</button>
          {/* Le plan est celui du dessin entier : il ne se regle pas depuis une decoupe ou un masque (paquet 8-D). */}
          <button type="button" disabled={lentille || planFixe} title={raisonPlan} onClick={() => ac.faire(d => ajusterPlan(d), t('Plan de travail ajusté au dessin.'))}>{t('Ajuster le plan de travail')}</button>
        </div>
      </Section>
      <PanneauVersions />
      <Section titre={t('Raccourcis')}>
        <ListeRaccourcis />
      </Section>
    </>
  );
}

/**
 * Rien n'est choisi (ADR-0019, etats vides) : dire ce que ce panneau regle alors, et le geste qui donne une forme a regler. Un
 * dessin sans forme ne s'ouvre pas (la lecture le refuse) : s'il est vide, c'est qu'on a tout retire, et le retour est a un clic.
 */
function SansSelection() {
  const mo = useDessin(), ac = useActions();
  const choisissables = mo.dessin.formes.filter(f => f.visible && !f.verrouille);
  // Un projet vierge du site (ADR-0030) part sans forme et sans rien a defaire : il dit le premier geste, pas le retour.
  if (!mo.dessin.formes.length && !mo.h.passe.length) {
    return (
      <EtatVide genre="premiere-fois" titre={t('Le plan est vide.')}>
        {t('Tracez une première forme avec les outils de la barre, ou insérez-en une de la bibliothèque de formes, ci-dessous.')}
      </EtatVide>
    );
  }
  if (!mo.dessin.formes.length) {
    return (
      <EtatVide genre="vide" icone="annuler" titre={t('Vous avez retiré toutes les formes.')} action={{ libelle: t('Faire revenir les formes'), onClick: ac.defaire }}>
        {t('Annuler (Ctrl+Z) défait le dernier geste : rien n’est perdu. Ou tracez une forme neuve avec les outils de la barre.')}
      </EtatVide>
    );
  }
  const premiere = choisissables[0];
  return (
    <EtatVide genre="premiere-fois" titre={t('Aucune forme choisie.')} action={premiere ? { libelle: t('Choisir la forme {id}', { id: premiere.id.slice(1) }), onClick: () => ac.choisir([premiere.id]) } : undefined}>
      {t('Cliquez une forme sur la toile pour régler sa couleur, sa taille et sa place. En attendant, ce panneau règle le dessin entier.')}
    </EtatVide>
  );
}

/** Le style des formes a venir : remplissage, contour, epaisseur. */
function StyleNouvelleForme() {
  const mo = useDessin(), ac = useActions(), ui = useInterface();
  const s = ui.style, trait = ui.outil === 'ligne' || (FORMES.has(ui.outil) && FICHES_FORMES[ui.outil as OutilForme].trait);
  return (
    <>
      <Peinture libelle={t('Remplissage')} valeur={s.remplissage} mixte={false} nuancier={mo.nuancier} finir={() => undefined} poser={v => ac.poserStyle({ ...s, remplissage: v })} />
      <Peinture libelle={t('Contour')} valeur={s.contour} mixte={false} nuancier={mo.nuancier} finir={() => undefined} poser={v => ac.poserStyle({ ...s, contour: v })} />
      {s.contour || trait ? <Nombre libelle={t('Épaisseur')} valeur={s.epaisseur} min={0} poser={v => ac.poserStyle({ ...s, epaisseur: v })} /> : null}
      <p className="aide">{trait ? t('Un trait prend la couleur de contour, ou celle du remplissage à défaut.') : t('Les formes tracées prennent ce style ; elles se règlent ensuite comme les autres.')}</p>
    </>
  );
}

/**
 * La bibliotheque dans l'editeur : chercher, cliquer, la forme arrive au centre du plan. Elle se charge d'elle-meme a la premiere
 * ouverture de sa section (un fichier voisin, aucun serveur) : une section fermee ne coute rien, ouverte elle montre les formes.
 */
function PanneauBibliotheque({ bibliotheque }: { bibliotheque: Bibliotheque | 'a-charger' }) {
  return (
    <Section titre={t('Bibliothèque de formes')} differee>
      <BibliothequeChargee bibliotheque={bibliotheque} />
    </Section>
  );
}

const BibliothequeChargee = memo(function BibliothequeChargee({ bibliotheque }: { bibliotheque: Bibliotheque | 'a-charger' }) {
  const ac = useActions();
  // Le procede du contexte de production : au stylo, les formes en ligne sont proposees d'abord (NATURE_PROPOSEE_PAR_PROCEDE).
  const procede = useInterface().profil?.procede;
  const chargee = useBibliotheque();
  const [panier, poserPanier] = useState<EntreeBibliotheque[]>([]);
  const [sceneId, poserSceneId] = useState(SCENES[0]?.id ?? '');
  const b = bibliotheque !== 'a-charger' ? bibliotheque : chargee.bibliotheque;
  if (chargee.erreur && !b) return <p className="aide" role="alert">{chargee.erreur}</p>;
  if (!b) return <p className="aide" role="status">{t('Chargement…')}</p>;
  // Chaque forme de la bibliotheque s'insere avec son origine (`game-icons:…`, `mdi:…`) : celle de game-icons fait ecrire la
  // mention CC BY 3.0 dans le SVG ; celle d'une source libre ne laisse que son `data-origine`.
  const choisir = (x: EntreeBibliotheque) => ac.insererForme(x.svg, origineDeForme(x.source, x.id));
  // Le panier en grille : autant de colonnes que la racine du nombre, chaque case a 80 % de sa cellule.
  const insererPanier = () => {
    const n = panier.length, cols = Math.ceil(Math.sqrt(n)), lignes = Math.ceil(n / cols), cellule = 1 / Math.max(cols, lignes);
    ac.insererPlusieurs(panier.map((x, i) => ({ svg: x.svg, origine: origineDeForme(x.source, x.id), x: (i % cols) * cellule + cellule * 0.1, y: Math.floor(i / cols) * cellule + cellule * 0.1 + ((Math.max(cols, lignes) - lignes) * cellule) / 2, taille: cellule * 0.8 })));
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
        <span>{t('Scène')}</span>
        <select aria-label={t('Scène prête')} value={sceneId} onChange={e => poserSceneId(e.target.value)}>{SCENES.map(sc => <option key={sc.id} value={sc.id}>{t(sc.nom)}</option>)}</select>
        <button type="button" title={t('Insérer la scène : ses formes, à leur place')} aria-label={t('Insérer la scène')} onClick={insererScene}><Icone nom="scene" taille={14} /></button>
      </div>
      <RechercheFormes bibliotheque={b} choisir={choisir} ajouter={x => poserPanier(p => (p.includes(x) ? p : [...p, x]))} parPage={24} compact procede={procede} />
      {panier.length ? (
        <div className="panier">
          <span className="aide">{t('{n} dans le panier : {noms}', { n: panier.length, noms: panier.map(x => x.nom).join(', ') })}</span>
          <div className="boutons">
            <button type="button" className="primaire" onClick={insererPanier}>{t('Insérer en grille')}</button>
            <button type="button" className="discret" onClick={() => poserPanier([])}>{t('Vider')}</button>
          </div>
        </div>
      ) : <p className="aide">{t('Panier vide. Un clic sur une forme l’insère au centre du dessin ; « + » la met dans le panier, pour en insérer plusieurs d’un coup, rangées en grille.')}</p>}

    </>
  );
});

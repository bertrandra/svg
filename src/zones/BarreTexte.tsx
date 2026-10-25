// La barre de texte (ADR-0027), comme dans un traitement de texte : quand on tape sur la toile ou qu'un texte est choisi seul,
// elle prend la place de la rangee de la selection et porte les reglages frequents : la police (« Toutes les polices » ouvre le
// choix complet du panneau), son style (Normal, Gras…), la taille, l'alignement, et « Plus d'options » qui ouvre le panneau
// Texte (espace, interligne, ligatures, apercu forme / ligne, vectoriser…). Le rare reste dans le panneau et les menus
// (ADR-0006). Sans saisie, les gestes de la selection restent a un clic, dans un menu, et « Supprimer » au bout.
//
// Pendant la saisie, la barre fait partie de la saisie : y aller (Alt+F10, ou la souris) ne la termine pas ; un reglage fait a
// la souris rend le focus au texte, au clavier il reste dans la barre, et Echap y ramene au texte.

import { memo, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import type { TexteVivant } from '../engine/editionSvg.js';
import type { Police } from '../io/polices.js';
import { appliquerChangement, policeDe, rienNeSePose, traceDe, type ChangementTexte } from './actionsTexte.js';
import { phraseRienNeTient } from './phrasesDisposition.js';
import { AIDES_TRACE, ChoixTrace, RAISON_PLEIN_TRAIT } from './ChoixTrace.js';
import { useStylesPolice } from './ChoixPolice.js';
import { ChoixPoliceListe } from './ChoixPoliceListe.js';
import { useSectionsSelection } from './BarreSelection.js';
import { Bouton } from './commun/Bouton.js';
import { MenuDeroulant, type ElementMenu, type SectionMenu } from './commun/Menu.js';
import { Nombre } from './commun/Nombre.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useSaisie } from './contexteSaisie.js';
import { usePolices, useTexte } from './contexteTexte.js';
import { Icone, type NomIcone } from './icones.js';
import { policeNouveauTexte, tailleNouveauTexte, type ReglagesNouveauTexte } from './saisie.js';
import { useRangeeCompacte } from './Vue.js';
import { ChoixDispositionBarre, useChoixDisposition } from './ChoixDisposition.js';

const ALIGNEMENTS: ReadonlyArray<readonly [TexteVivant['alignement'], NomIcone, string]> = [
  ['gauche', 'texte-gauche', 'Aligner les lignes à gauche'], ['centre', 'texte-centre', 'Centrer les lignes'], ['droite', 'texte-droite', 'Aligner les lignes à droite']
];
/** Sur une forme (ADR-0031), l'alignement dit ou le texte se pose par rapport a son point de depart : il commence, s'y centre, ou y finit. */
const ALIGNEMENTS_SUR: ReadonlyArray<readonly [TexteVivant['alignement'], NomIcone, string]> = [
  ['gauche', 'texte-gauche', 'Aligner au début : le texte part du point de départ'], ['centre', 'texte-centre', 'Centrer le texte sur le point de départ'], ['droite', 'texte-droite', 'Aligner à la fin : le texte finit au point de départ']
];
const AIDE_JUSTIFIER = 'Justifier les lignes dans la forme';

/** Les alignements d'un texte, selon qu'il est libre, sur une forme ou dans une forme (avec « Justifier »). */
function alignementsDe(t: TexteVivant | null) {
  const p = t?.disposition;
  return p?.mode === 'sur' ? ALIGNEMENTS_SUR : ALIGNEMENTS;
}

/** Ce que la barre regle, et sur quoi : la forme en saisie ou le texte choisi, sinon le prochain texte (une saisie neuve, encore vide). */
function useBarreTexte() {
  const mo = useDessin(), ac = useActions(), ui = useInterface(), sx = useSaisie(), tx = useTexte(), { polices } = usePolices();
  const parPointeur = useRef(false);
  // L'outil Texte sans saisie regle le prochain texte, meme si un texte est encore choisi.
  const id = sx.saisie ? sx.saisie.id : ui.outil === 'selection' && mo.formeSeule?.texte ? mo.formeSeule.id : null;
  const forme = id ? mo.dessin.formes.find(f => f.id === id) : undefined, t = forme?.texte ?? null;
  const policeForme = forme ? policeDe(forme, polices) : null;
  const police = t ? t.police.id : policeNouveauTexte(sx.nouveau, polices)?.id ?? '';
  const verrou = !!forme?.verrouille, inactif = verrou || (!!t && polices !== null && !policeForme);

  /** Apres un reglage a la souris pendant la saisie, le focus revient au texte : on continue de taper. Au clavier, il reste ici. */
  const revenir = () => { if (sx.saisie && parPointeur.current) document.querySelector<HTMLElement>('.saisie-champ')?.focus({ preventScroll: true }); };
  const changer = (c: ChangementTexte) => {
    // Sans texte (l'outil Texte), le reglage est celui du prochain texte ; pendant une saisie, le prochain texte le retient aussi,
    // comme un traitement de texte garde la mise en forme courante.
    if (sx.saisie || !t) {
      const n: { -readonly [K in keyof ReglagesNouveauTexte]?: ReglagesNouveauTexte[K] } = {};
      if (c.police) n.police = c.police.id;
      if (c.taille !== undefined) n.taille = c.taille;
      if (c.alignement !== undefined) n.alignement = c.alignement;
      if (c.trace !== undefined) n.trace = c.trace;
      sx.poserNouveau(n);
    }
    const p = c.police ?? policeForme;
    // Un texte pose qui ne dessinerait plus rien (trop grand pour sa forme) ne change pas, et c'est dit (ADR-0031).
    if (forme && t && p && t.disposition && rienNeSePose(mo.dessin, forme.id, c, p)) ac.dire(phraseRienNeTient(t.disposition.mode));
    else if (forme && t && p) ac.appliquer(d => appliquerChangement(d, forme.id, c, p, ui.profil), ac.nouvelleCle());
    revenir();
  };
  const poserPolice = (pid: string, donnee?: Police) => {
    const p = donnee ?? polices?.find(x => x.id === pid);
    if (!p) return;
    tx.noterRecente(p.id);
    changer({ police: p });
  };
  const styles = useStylesPolice(police, polices, poserPolice);
  // Le trace : celui du texte, sinon celui du prochain texte ; une police a trait unique n'a que sa ligne.
  const trait = (policeForme ?? polices?.find(p => p.id === police))?.nature === 'trait';
  const trace = t ? traceDe(t) : trait ? 'median' : sx.nouveau.trace;
  /** Vers le panneau Texte : la saisie se termine (le texte reste), le tiroir s'ouvre sur un petit ecran, la section prend le focus. */
  const versPanneau = (polices: boolean) => {
    sx.poignee.current?.terminer(false);
    sx.demanderPanneau(polices);
    const panneau = document.querySelector<HTMLElement>('.editeur-inspecteur');
    if (panneau && getComputedStyle(panneau).visibility === 'hidden') ac.poserTiroir('inspecteur');
  };
  const racine = {
    onPointerDown: () => { parPointeur.current = true; },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      parPointeur.current = false;
      // Echap ramene au texte en saisie (un menu ouvert, ou une liste deroulee, le prend avant).
      if (e.key === 'Escape' && sx.saisie && !e.defaultPrevented) { e.preventDefault(); document.querySelector<HTMLElement>('.saisie-champ')?.focus({ preventScroll: true }); }
    },
    // Un clic sur le fond de la barre ne retire pas le focus au texte en saisie.
    onMouseDown: (e: MouseEvent<HTMLDivElement>) => { if (sx.saisie && e.target === e.currentTarget) e.preventDefault(); }
  };
  const p = t?.disposition;
  const justifie = p?.mode === 'dans' && p.justifier;
  /** Un alignement : dans une forme justifiee, il retire la justification ; « Justifier » la pose (calee a gauche). */
  const aligner = (a: TexteVivant['alignement']) => changer(p?.mode === 'dans' && p.justifier ? { alignement: a, disposition: { ...p, justifier: false } } : { alignement: a });
  const justifier = () => { if (p?.mode === 'dans' && !p.justifier) changer({ alignement: 'gauche', disposition: { ...p, justifier: true } }); };
  return {
    forme: t ? forme : undefined, aligner, justifier, justifie: !!justifie, dans: p?.mode === 'dans', alignements: alignementsDe(t), ajuste: p?.mode === 'dans' && p.ajuster,
    sx, ac, tx, polices, police, styles, verrou, inactif, racine, trait, trace, choisi: !sx.saisie && !!t,
    etiquette: sx.saisie ? 'Saisie · Échap pour finir' : t ? 'Texte' : 'Prochain texte', changer, poserPolice, versPanneau,
    taille: t ? t.taille : tailleNouveauTexte(sx.nouveau, mo.dessin.vb), alignement: t ? t.alignement : sx.nouveau.alignement,
    absente: t ? 'Police absente : ' + (t.police.famille ?? t.police.id) : undefined
  };
}

type Barre = ReturnType<typeof useBarreTexte>;

function ChoixPoliceBarre({ b }: { b: Barre }) {
  if (b.polices === null) return <span className="aide">Chargement des polices…</span>;
  return <ChoixPoliceListe compacte polices={b.polices} valeur={b.police} absente={b.absente} desactive={b.verrou} poser={b.poserPolice} explorer={b.tx.enLigne ? () => b.versPanneau(true) : undefined} />;
}

// Dans une forme a taille ajustee (ADR-0031), la taille se calcule : le champ la montre, inactif.
const TailleBarre = ({ b }: { b: Barre }) => <Nombre libelle="Taille" valeur={b.taille} min={0.01} desactive={!!b.ajuste} poser={v => b.changer({ taille: v })} />;

export const BarreTexte = memo(function BarreTexte() {
  const b = useBarreTexte();
  const sections = useSectionsSelection(true);
  return useRangeeCompacte() ? <BarreCompacte b={b} gestes={sections} /> : <BarreEntiere b={b} gestes={sections} />;
});

function BarreEntiere({ b, gestes }: { b: Barre; gestes: SectionMenu[] }) {
  const { ac } = b;
  return (
    <div className="editeur-barre-selection barre-texte" role="toolbar" aria-label="Texte" {...b.racine}>
      <span className="aide">{b.etiquette}</span>
      <div className="groupe" role="group" aria-label="Police">
        <ChoixPoliceBarre b={b} />
        {b.styles.options.length ? (
          <select aria-label="Style de la police" value={b.police} disabled={b.inactif} onChange={e => void b.styles.choisir(e.target.value)}>
            {b.styles.options.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        ) : null}
        {b.tx.enLigne ? <button type="button" onClick={() => b.versPanneau(true)}>Toutes les polices</button> : null}
      </div>
      <div className="groupe" role="group" aria-label="Taille"><TailleBarre b={b} /></div>
      <ChoixTrace className="groupe choix-trace" trace={b.trace} trait={b.trait} desactive={b.inactif} poser={v => b.changer({ trace: v })} />
      {b.forme?.texte ? <ChoixDispositionBarre forme={b.forme} /> : null}
      <div className="groupe" role="group" aria-label="Alignement des lignes">
        {b.alignements.map(([a, icone, nom]) => <Bouton key={a} icone={icone} aide={nom} pressed={!b.justifie && b.alignement === a} disabled={b.inactif} onClick={() => b.aligner(a)} />)}
        {b.dans ? <Bouton icone="texte-justifie" aide={AIDE_JUSTIFIER} pressed={b.justifie} disabled={b.inactif} onClick={b.justifier} /> : null}
      </div>
      <div className="groupe">
        <button type="button" className="plus-options" onClick={() => b.versPanneau(false)}><Icone nom="options" taille={16} /><span>Plus d’options</span></button>
      </div>
      {b.choisi ? (
        <div className="groupe" role="group" aria-label="Sélection">
          <MenuDeroulant etiquette="Gestes de la sélection : transformer, aligner, empiler, booléens" icone="selection" chevron={false} alignement="droite" sections={gestes} />
          <Bouton icone="supprimer" aide="Supprimer (Suppr)" className="danger" onClick={ac.supprimerSelection} />
        </div>
      ) : null}
    </div>
  );
}

/** Au doigt ou sous 640 px : la police et la taille, puis un menu qui porte le style, l'alignement, les options et les gestes. */
function BarreCompacte({ b, gestes }: { b: Barre; gestes: SectionMenu[] }) {
  const { ac } = b;
  const dispo = useChoixDisposition(b.forme);
  const sections: SectionMenu[] = [
    ...(b.forme?.texte ? [{ id: 'disposition', titre: 'Disposition', elements: dispo.menu }] : []),
    { id: 'alignement', titre: 'Alignement', elements: [
      ...b.alignements.map(([a, icone, nom]): ElementMenu => ({ id: 'aligner-texte-' + a, libelle: nom, icone, radio: true, coche: !b.justifie && b.alignement === a, desactive: b.inactif, onClick: () => b.aligner(a) })),
      ...(b.dans ? [{ id: 'aligner-texte-justifie', libelle: AIDE_JUSTIFIER, icone: 'texte-justifie', radio: true, coche: b.justifie, desactive: b.inactif, onClick: b.justifier } as const] : [])
    ] },
    { id: 'trace', titre: 'Tracé', elements: [
      { id: 'trace-plein', libelle: b.trait ? 'Plein : ' + RAISON_PLEIN_TRAIT.split(' : ')[0]?.toLowerCase() : AIDES_TRACE.plein, radio: true, coche: b.trace === 'plein', desactive: b.inactif || b.trait, onClick: () => b.changer({ trace: 'plein' }) },
      { id: 'trace-median', libelle: AIDES_TRACE.median, radio: true, coche: b.trace === 'median', desactive: b.inactif, onClick: () => b.changer({ trace: 'median' }) }
    ] },
    ...(b.styles.options.length ? [{ id: 'style', titre: 'Style', elements: b.styles.options.map((s): ElementMenu => ({ id: 'style-' + s.id, libelle: s.nom, radio: true, coche: b.police === s.id, desactive: b.inactif, onClick: () => void b.styles.choisir(s.id) })) }] : []),
    { id: 'texte', titre: 'Texte', elements: [
      ...(b.tx.enLigne ? [{ id: 'toutes-polices', libelle: 'Toutes les polices', onClick: () => b.versPanneau(true) }] : []),
      { id: 'plus-options', libelle: 'Plus d’options', icone: 'options', onClick: () => b.versPanneau(false) }
    ] },
    ...(b.choisi ? gestes : [])
  ];
  return (
    <div className="editeur-barre-selection barre-texte compacte" role="toolbar" aria-label="Texte" {...b.racine}>
      <div className="groupe" role="group" aria-label="Police et taille">
        <ChoixPoliceBarre b={b} />
        <TailleBarre b={b} />
      </div>
      <div className="groupe" role="group" aria-label="Plus">
        <MenuDeroulant etiquette="Plus de réglages du texte : style, alignement, options" icone="options" chevron={false} alignement="droite" sections={sections} />
        {b.choisi ? <Bouton icone="supprimer" aide="Supprimer (Suppr)" className="danger" onClick={ac.supprimerSelection} /> : null}
      </div>
    </div>
  );
}

// La section « Texte » de l'inspecteur (ADR-0022) : un texte vivant se retape et se restyle ici, comme un formulaire
// (le clavier y fait tout), et se vectorise d'ici dans l'un des trois modes. Chaque reglage est une entree d'historique ;
// la frappe dans le champ se fond en une seule, par sa cle, jusqu'a ce qu'on le quitte. Depuis l'ADR-0027, on tape d'abord
// sur la toile, et la barre de texte porte les reglages frequents : ici, tous les reglages (« Plus d'options » y mene), et le
// champ pour qui le prefere ou pour un lecteur d'ecran.

import { useEffect, useId, useRef, useState } from 'react';
import type { Forme, TexteVivant } from '../engine/editionSvg.js';
import { MODES_VECTORISATION, NOMS_MODES, type ModeVectorisation } from '../engine/texte/vectoriser.js';
import { Section } from './commun/Section.js';
import { ChoixPolice } from './ChoixPolice.js';
import { Nombre } from './commun/Nombre.js';
import { appliquerChangement, nomDePolice, policeDe, poseApres, rienNeSePose, traceDe, useActionsTexte, type ChangementTexte } from './actionsTexte.js';
import { phraseRienNeTient, RAISON_TAILLE_AJUSTEE, RAISON_TAILLE_ENVELOPPE } from './phrasesDisposition.js';
import { ChoixTrace } from './ChoixTrace.js';
import { ReglagesDisposition } from './InspecteurDisposition.js';
import { natureDuTexte } from '../engine/texte/vivant.js';
import { naturePolice } from '../model/polices.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useDemandePanneau } from './contexteSaisie.js';
import { usePolices, useTexte } from './contexteTexte.js';
import { estIdCatalogue, trouverVariante } from '../model/cataloguePolices.js';
import type { Police } from '../io/polices.js';
import { t } from '../util/i18n.js';

// Des fonctions, pas des constantes : les libelles se traduisent au rendu, quand le dictionnaire de la langue est pose (ADR-0042).
const alignements = (): ReadonlyArray<readonly [TexteVivant['alignement'], string]> => [['gauche', t('À gauche')], ['centre', t('Au centre')], ['droite', t('À droite')]];
/** Sur une forme (ADR-0031), l'alignement dit comment le texte se pose sur son point de depart : il en part, s'y centre, y finit. */
const alignementsSur = (): ReadonlyArray<readonly [TexteVivant['alignement'], string]> => [['gauche', t('Début')], ['centre', t('Centre')], ['droite', t('Fin')]];

export function SectionTexte({ forme }: { forme: Forme & { texte: TexteVivant } }) {
  const ac = useActions(), ui = useInterface(), tx = useTexte(), { polices, deposer } = usePolices(), { dessin } = useDessin();
  const at = useActionsTexte();
  const tv = forme.texte, police = policeDe(forme, polices);
  const [brouillon, poserBrouillon] = useState(tv.texte);
  const cle = useRef<string | null>(null);
  const idMode = useId();
  const explorerDemande = useDemandePanneau();
  useEffect(() => { if (cle.current === null) poserBrouillon(tv.texte); }, [tv.texte]);
  const absente = polices !== null && !police;
  const nom = nomDePolice(tv.police.id, polices, tv.police.famille);
  const changer = (c: ChangementTexte, cleGeste: string | null = null) => {
    const p = c.police ?? police;
    if (!p) return;
    // Un texte pose qui ne dessinerait plus rien (trop grand pour sa forme) ne change pas, et c'est dit (ADR-0031).
    if (tv.disposition && rienNeSePose(dessin, forme.id, c, p)) { ac.dire(phraseRienNeTient(tv.disposition.mode, poseApres(dessin, forme.id, c, p)?.refus)); return; }
    ac.appliquer(d => appliquerChangement(d, forme.id, c, p, ui.profil), cleGeste ?? ac.nouvelleCle());
  };
  const taper = (v: string) => {
    poserBrouillon(v);
    if (!v.trim()) return;
    cle.current ??= 'texte-' + forme.id + '-' + ac.nouvelleCle();
    changer({ texte: v }, cle.current);
  };
  const quitterChamp = () => { cle.current = null; ac.finir(); poserBrouillon(tv.texte); };
  const choisirPolice = (id: string, donnee?: Police) => { const p = donnee ?? polices?.find(x => x.id === id); if (p) changer({ police: p }); };
  const mode: ModeVectorisation = at.mode;
  const enTrait = natureDuTexte(tv) === 'trait';
  const dispo = tv.disposition, justifie = dispo?.mode === 'dans' && dispo.justifier;
  return (
    <Section titre={t('Texte')} ouverte className="section-texte" note={enTrait ? (naturePolice(tv.police.id) === 'trait' ? t('trait unique') : t('tracé médian')) : undefined}>
      <textarea rows={2} value={brouillon} disabled={absente} aria-label={t('Texte')} onChange={e => taper(e.target.value)} onBlur={quitterChamp} />
      {absente ? (
        <p className="aide" role="status">
          {t('Police absente : {nom}. Déposez-la, ou choisissez-en une autre (le texte sera recomposé).', { nom })}
        </p>
      ) : police && tv.police.version && police.version !== tv.police.version ? (
        <p className="aide">{t('La police {police} a changé depuis l’écriture de ce texte : le modifier le recomposera avec la version actuelle.', { police: police.nom })}</p>
      ) : null}
      <ChoixPolice polices={polices} valeur={tv.police.id} poser={choisirPolice} texte={brouillon} absente={t('Police absente : {nom}', { nom })} explorerDemande={explorerDemande} />
      {absente ? <RetrouverPolice texte={tv} poser={choisirPolice} /> : null}
      {absente ? <DeposerPolice deposer={deposer} poser={choisirPolice} /> : null}
      <div className="grille-2">
        <Nombre libelle={t('Taille')} valeur={tv.taille} min={0.01} desactive={(dispo?.mode === 'dans' && dispo.ajuster) || dispo?.mode === 'enveloppe'}
          raison={dispo?.mode === 'enveloppe' ? RAISON_TAILLE_ENVELOPPE : RAISON_TAILLE_AJUSTEE} poser={v => changer({ taille: v })} />
        <Nombre libelle={t('Espace')} valeur={tv.interlettrage} poser={v => changer({ interlettrage: v })} />
        <Nombre libelle={t('Interligne')} valeur={tv.interligne} min={0.1} poser={v => changer({ interligne: v })} />
      </div>
      <div className="alignement-texte" role="group" aria-label={t('Alignement des lignes')}>
        {(dispo?.mode === 'sur' ? alignementsSur() : alignements()).map(([a, libelle]) => (
          <button key={a} type="button" aria-pressed={!justifie && tv.alignement === a} disabled={absente}
            onClick={() => changer(dispo?.mode === 'dans' && dispo.justifier ? { alignement: a, disposition: { ...dispo, justifier: false } } : { alignement: a })}>{libelle}</button>
        ))}
        {dispo?.mode === 'dans' ? <button type="button" aria-pressed={justifie} disabled={absente} onClick={() => { if (!dispo.justifier) changer({ alignement: 'gauche', disposition: { ...dispo, justifier: true } }); }}>{t('Justifié')}</button> : null}
      </div>
      <ChoixTrace trace={traceDe(tv)} trait={naturePolice(tv.police.id) === 'trait'} desactive={absente} poser={v => changer({ trace: v })} />
      <ReglagesDisposition forme={forme} />
      {police?.glyphes.ligature ? (
        <label className="case">
          <input type="checkbox" checked={tv.ligatures} disabled={tv.interlettrage !== 0} onChange={e => changer({ ligatures: e.target.checked })} /> {t('Ligatures (fi, fl…)')}
        </label>
      ) : null}
      <fieldset className="editeur-groupe vectoriser-texte">
        <legend id={idMode}>{t('Vectoriser le texte')}</legend>
        {MODES_VECTORISATION.map(m => (
          <label key={m} className="case"><input type="radio" name={idMode} checked={mode === m} onChange={() => tx.poserMode(m)} /> {t(NOMS_MODES[m])}</label>
        ))}
        <button type="button" onClick={() => { void at.vectoriser(mode); }}>{t('Vectoriser le texte')}</button>
        <p className="aide">{t('Le texte devient des formes ordinaires : il ne se retape plus. Ctrl+Maj+O ; Ctrl+Z annule.')}</p>
      </fieldset>
    </Section>
  );
}

/**
 * Une police du catalogue absente (un dessin rouvert, ADR-0025) : la telecharger, a la version qu'il porte quand l'index la
 * connait encore, sinon a la version courante (et c'est dit : le texte se recomposera avec elle).
 */
function RetrouverPolice({ texte, poser }: { texte: TexteVivant; poser: (id: string, p?: Police) => void }) {
  const tx = useTexte(), ac = useActions();
  const [erreur, poserErreur] = useState('');
  const id = texte.police.id, catalogue = tx.catalogue;
  useEffect(() => { if (estIdCatalogue(id) && tx.enLigne) tx.chargerCatalogue(); }, [id, tx]);
  if (!estIdCatalogue(id) || !tx.enLigne || !catalogue) return null;
  const exacte = trouverVariante(catalogue, id, texte.police.version), v = exacte ?? trouverVariante(catalogue, id);
  if (!v) return null;
  const telecharger = async () => {
    const r = await tx.telecharger(v);
    if ('erreur' in r) { poserErreur(r.erreur); ac.dire(r.erreur); return; }
    poserErreur('');
    // A la meme version, rien ne change : la police revient, le texte n'est pas recompose. A une autre, il l'est au prochain reglage.
    if (exacte) ac.dire(t('Police {nom} téléchargée et vérifiée : le texte est de nouveau modifiable.', { nom: v.nom }));
    else poser(r.id, r.police);
  };
  return (
    <div className="boutons">
      <button type="button" className="discret" onClick={() => void telecharger()}>{t('Télécharger {nom}', { nom: v.nom })}</button>
      {exacte ? null : <p className="aide">{t('L’index ne connaît plus la version de ce texte : il sera recomposé avec la version actuelle.')}</p>}
      {erreur ? <p className="aide" role="alert">{erreur}</p> : null}
    </div>
  );
}

/** Deposer la fonte qui manque : relue, elle retrouve son texte si c'est la meme (meme empreinte). */
function DeposerPolice({ deposer, poser }: { deposer: (f: File) => Promise<{ id: string } | { erreur: string }>; poser: (id: string) => void }) {
  const entree = useRef<HTMLInputElement>(null);
  const [erreur, poserErreur] = useState('');
  return (
    <div className="boutons">
      <button type="button" className="discret" onClick={() => entree.current?.click()}>{t('Déposer une fonte TTF/OTF…')}</button>

      <input ref={entree} type="file" accept=".ttf,.otf,font/ttf,font/otf" hidden onChange={e => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) void deposer(f).then(r => { if ('erreur' in r) poserErreur(r.erreur); else { poserErreur(''); poser(r.id); } });
      }} />
      {erreur ? <p className="aide" role="alert">{erreur}</p> : null}
    </div>
  );
}

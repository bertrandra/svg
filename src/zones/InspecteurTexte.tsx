// La section « Texte » de l'inspecteur (ADR-0022) : un texte vivant se retape et se restyle ici, comme un formulaire
// (le clavier y fait tout), et se vectorise d'ici dans l'un des trois modes. Chaque reglage est une entree d'historique ;
// la frappe dans le champ se fond en une seule, par sa cle, jusqu'a ce qu'on le quitte.

import { useEffect, useId, useRef, useState } from 'react';
import type { Forme, TexteVivant } from '../engine/editionSvg.js';
import { MODES_VECTORISATION, NOMS_MODES, type ModeVectorisation } from '../engine/texte/vectoriser.js';
import { naturePolice } from '../model/polices.js';
import { Section } from './commun/Section.js';
import { ChoixPolice } from './ChoixPolice.js';
import { Nombre } from './commun/Nombre.js';
import { appliquerChangement, nomDePolice, policeDe, useActionsTexte, type ChangementTexte } from './actionsTexte.js';
import { useActions, useInterface } from './contexteEditeur.js';
import { usePolices, useTexte } from './contexteTexte.js';
import { estIdCatalogue, trouverVariante } from '../model/cataloguePolices.js';
import type { Police } from '../io/polices.js';

const ALIGNEMENTS: ReadonlyArray<readonly [TexteVivant['alignement'], string]> = [['gauche', 'À gauche'], ['centre', 'Au centre'], ['droite', 'À droite']];

export function SectionTexte({ forme }: { forme: Forme & { texte: TexteVivant } }) {
  const ac = useActions(), ui = useInterface(), tx = useTexte(), { polices, deposer } = usePolices();
  const at = useActionsTexte();
  const t = forme.texte, police = policeDe(forme, polices);
  const [brouillon, poserBrouillon] = useState(t.texte);
  const cle = useRef<string | null>(null);
  const idMode = useId();
  useEffect(() => { if (cle.current === null) poserBrouillon(t.texte); }, [t.texte]);
  const absente = polices !== null && !police;
  const nom = nomDePolice(t.police.id, polices, t.police.famille);
  const changer = (c: ChangementTexte, cleGeste: string | null = null) => {
    const p = c.police ?? police;
    if (!p) return;
    ac.appliquer(d => appliquerChangement(d, forme.id, c, p, ui.profil), cleGeste ?? ac.nouvelleCle());
  };
  const taper = (v: string) => {
    poserBrouillon(v);
    if (!v.trim()) return;
    cle.current ??= 'texte-' + forme.id + '-' + ac.nouvelleCle();
    changer({ texte: v }, cle.current);
  };
  const quitterChamp = () => { cle.current = null; ac.finir(); poserBrouillon(t.texte); };
  const choisirPolice = (id: string, donnee?: Police) => { const p = donnee ?? polices?.find(x => x.id === id); if (p) changer({ police: p }); };
  const mode: ModeVectorisation = at.mode;
  const enTrait = naturePolice(t.police.id) === 'trait';
  return (
    <Section titre="Texte" ouverte note={enTrait ? 'trait unique' : undefined}>
      <textarea rows={2} value={brouillon} disabled={absente} aria-label="Texte" onChange={e => taper(e.target.value)} onBlur={quitterChamp} />
      {absente ? (
        <p className="aide" role="status">
          Police absente : {nom}. Déposez-la, ou choisissez-en une autre (le texte sera recomposé).
        </p>
      ) : police && t.police.version && police.version !== t.police.version ? (
        <p className="aide">La police {police.nom} a changé depuis l’écriture de ce texte : le modifier le recomposera avec la version actuelle.</p>
      ) : null}
      <ChoixPolice polices={polices} valeur={t.police.id} poser={choisirPolice} texte={brouillon} absente={'Police absente : ' + nom} />
      {absente ? <RetrouverPolice texte={t} poser={choisirPolice} /> : null}
      {absente ? <DeposerPolice deposer={deposer} poser={choisirPolice} /> : null}
      <div className="grille-2">
        <Nombre libelle="Taille" valeur={t.taille} min={0.01} poser={v => changer({ taille: v })} />
        <Nombre libelle="Espace" valeur={t.interlettrage} poser={v => changer({ interlettrage: v })} />
        <Nombre libelle="Interligne" valeur={t.interligne} min={0.1} poser={v => changer({ interligne: v })} />
      </div>
      <div className="alignement-texte" role="group" aria-label="Alignement des lignes">
        {ALIGNEMENTS.map(([a, libelle]) => (
          <button key={a} type="button" aria-pressed={t.alignement === a} disabled={absente} onClick={() => changer({ alignement: a })}>{libelle}</button>
        ))}
      </div>
      {police?.glyphes.ligature ? (
        <label className="case">
          <input type="checkbox" checked={t.ligatures} disabled={t.interlettrage !== 0} onChange={e => changer({ ligatures: e.target.checked })} /> Ligatures (fi, fl…)
        </label>
      ) : null}
      <fieldset className="editeur-groupe vectoriser-texte">
        <legend id={idMode}>Vectoriser le texte</legend>
        {MODES_VECTORISATION.map(m => (
          <label key={m} className="case"><input type="radio" name={idMode} checked={mode === m} onChange={() => tx.poserMode(m)} /> {NOMS_MODES[m]}</label>
        ))}
        <button type="button" onClick={() => { void at.vectoriser(mode); }}>Vectoriser le texte</button>
        <p className="aide">Le texte devient des formes ordinaires : il ne se retape plus. Ctrl+Maj+O ; Ctrl+Z annule.</p>
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
    if (exacte) ac.dire('Police ' + v.nom + ' téléchargée et vérifiée : le texte est de nouveau modifiable.');
    else poser(r.id, r.police);
  };
  return (
    <div className="boutons">
      <button type="button" className="discret" onClick={() => void telecharger()}>Télécharger {v.nom}</button>
      {exacte ? null : <p className="aide">L’index ne connaît plus la version de ce texte : il sera recomposé avec la version actuelle.</p>}
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
      <button type="button" className="discret" onClick={() => entree.current?.click()}>Déposer une fonte TTF/OTF…</button>
      <input ref={entree} type="file" accept=".ttf,.otf,font/ttf,font/otf" hidden onChange={e => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) void deposer(f).then(r => { if ('erreur' in r) poserErreur(r.erreur); else { poserErreur(''); poser(r.id); } });
      }} />
      {erreur ? <p className="aide" role="alert">{erreur}</p> : null}
    </div>
  );
}

// Le panneau de l'outil Texte (ADR-0022, ADR-0027) : on tape d'abord sur la toile (un clic, ou Entree au clavier) ; ce
// panneau regle le prochain texte (police, taille, espace, interligne, alignement, ligatures), les memes reglages que la barre
// de texte, et garde un champ pour qui prefere ecrire ici (ou un lecteur d'ecran) : « Ajouter le texte » le pose au centre du
// plan. Le texte reste VIVANT, une seule forme qu'on retape ensuite et qu'on vectorise apres le design. Une police a trait
// unique se compose en traits ouverts, pour le stylo. Le SVG ecrit ne contient jamais de <text>.

import { useRef, useState } from 'react';
import type { TexteVivant } from '../engine/editionSvg.js';
import { useDessin, useInterface } from './contexteEditeur.js';
import { useDemandePanneau, useSaisie } from './contexteSaisie.js';
import { usePolices } from './contexteTexte.js';
import { ChoixPolice } from './ChoixPolice.js';
import { ChoixTrace } from './ChoixTrace.js';
import { useActionsTexte } from './actionsTexte.js';
import { Nombre } from './commun/Nombre.js';
import { policeNouveauTexte, tailleNouveauTexte } from './saisie.js';
import { selonSaisie } from '../util/texte.js';
import { useTactile } from './Vue.js';

const ALIGNEMENTS: ReadonlyArray<readonly [TexteVivant['alignement'], string]> = [['gauche', 'À gauche'], ['centre', 'Au centre'], ['droite', 'À droite']];

export function PanneauTexte() {
  const mo = useDessin(), ui = useInterface(), sx = useSaisie(), { polices, erreurPolices, deposer } = usePolices(), at = useActionsTexte();
  const doigt = useTactile();
  const [erreur, poserErreur] = useState('');
  const [texte, poserTexte] = useState('Joyeux anniversaire');
  const entree = useRef<HTMLInputElement>(null);
  const explorerDemande = useDemandePanneau();
  const n = sx.nouveau, police = policeNouveauTexte(n, polices), taille = tailleNouveauTexte(n, mo.dessin.vb);
  const aDesLigatures = police?.glyphes.ligature !== undefined;

  const deposerFichier = (f: File | undefined) => {
    if (!f) return;
    void deposer(f).then(r => {
      if ('erreur' in r) { poserErreur(r.erreur); return; }
      sx.poserNouveau({ police: r.id });
      poserErreur('');
    });
  };
  const ajouter = () => {
    if (!police || !texte.trim()) return;
    at.creer(texte, police, taille, { interlettrage: n.interlettrage, interligne: n.interligne, alignement: n.alignement, ligatures: n.ligatures && aDesLigatures && n.interlettrage === 0 }, n.trace);
  };
  const message = erreur || erreurPolices;

  return (
    <fieldset className="editeur-groupe panneau-texte">
      <legend>Texte</legend>
      <p className="aide">{selonSaisie('Cliquez sur la toile là où écrire, puis tapez : les lettres s’y posent. Ou écrivez ici et ajoutez le texte au centre du plan.', doigt)}</p>
      <textarea rows={2} value={texte} onChange={e => poserTexte(e.target.value)} aria-label="Texte" placeholder="Votre texte" />
      <ChoixPolice polices={polices} valeur={police?.id ?? ''} poser={id => sx.poserNouveau({ police: id })} texte={texte} explorerDemande={explorerDemande} />
      <div className="grille-2">
        <Nombre libelle="Taille" valeur={taille} min={0.01} poser={v => sx.poserNouveau({ taille: v })} />
        <Nombre libelle="Espace" valeur={n.interlettrage} poser={v => sx.poserNouveau({ interlettrage: v })} />
        <Nombre libelle="Interligne" valeur={n.interligne} min={0.1} poser={v => sx.poserNouveau({ interligne: v })} />
      </div>
      <div className="alignement-texte" role="group" aria-label="Alignement des lignes">
        {ALIGNEMENTS.map(([a, libelle]) => <button key={a} type="button" aria-pressed={n.alignement === a} onClick={() => sx.poserNouveau({ alignement: a })}>{libelle}</button>)}
      </div>
      <ChoixTrace trace={police?.nature === 'trait' ? 'median' : n.trace} trait={police?.nature === 'trait'} poser={v => sx.poserNouveau({ trace: v })} />
      {aDesLigatures ? (
        <label className="case">
          <input type="checkbox" checked={n.ligatures} disabled={n.interlettrage !== 0} onChange={e => sx.poserNouveau({ ligatures: e.target.checked })} /> Ligatures (fi, fl…)
          {n.interlettrage !== 0 ? <span className="aide"> Sans effet avec un espace entre les lettres.</span> : null}
        </label>
      ) : null}
      <div className="boutons">
        <button type="button" className="primaire" disabled={!police || !texte.trim()} onClick={ajouter}>Ajouter le texte</button>
        <button type="button" className="discret" onClick={() => entree.current?.click()}>Déposer une fonte TTF/OTF…</button>
        <input ref={entree} type="file" accept=".ttf,.otf,font/ttf,font/otf" hidden onChange={e => { deposerFichier(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {message ? <p className="aide" role="alert">{message}</p> : (
        <p className="aide">
          {police?.nature === 'trait'
            ? 'Une police à trait unique se dessine en traits ouverts, sans fond : ce que suit la pointe d’un stylo.'
            : 'Le texte prend le remplissage et le contour courants, et reste modifiable.'}
          {ui.profil ? ' Pour la machine, vectorisez-le une fois le design fini.' : ''}
        </p>
      )}
    </fieldset>
  );
}

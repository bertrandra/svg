// L'outil Texte (ADR-0021) : un texte tape, une police livree ou deposee, une taille, un interlettrage ; il devient un
// texte VIVANT au centre du plan, une seule forme qu'on retape ensuite (double-clic, Entree ou l'inspecteur) et qu'on
// vectorise apres le design. Une police a trait unique se compose en traits ouverts, pour le stylo. Le SVG ecrit ne
// contient jamais de <text> : des contours, et de quoi les recomposer.

import { useEffect, useRef, useState } from 'react';
import { useDessin, useInterface } from './contexteEditeur.js';
import { usePolices } from './contexteTexte.js';
import { ChoixPolice } from './ChoixPolice.js';
import { useActionsTexte } from './actionsTexte.js';

export function PanneauTexte() {
  const mo = useDessin(), ui = useInterface(), { polices, erreurPolices, deposer } = usePolices(), at = useActionsTexte();
  const [erreur, poserErreur] = useState('');
  const [texte, poserTexte] = useState('Joyeux anniversaire');
  const [policeId, poserPoliceId] = useState('');
  const [taille, poserTaille] = useState(() => Math.round(Math.min(mo.dessin.vb[2], mo.dessin.vb[3]) / 6));
  const [interlettrage, poserInterlettrage] = useState(0);
  // Les ligatures (fi, fl…) sont ouvertes par defaut quand la fonte en a : un navigateur ou un logiciel de mise en page les
  // applique toujours, et « fi » mal lie fait toucher le crochet du f au point du i. On les retire d'une case a cocher.
  const [ligatures, poserLigatures] = useState(true);
  const entree = useRef<HTMLInputElement>(null);
  useEffect(() => { if (polices?.length && !policeId) poserPoliceId(polices[0]?.id ?? ''); }, [polices, policeId]);
  const police = polices?.find(p => p.id === policeId) ?? polices?.[0] ?? null;
  const aDesLigatures = police?.glyphes.ligature !== undefined;

  const deposerFichier = (f: File | undefined) => {
    if (!f) return;
    void deposer(f).then(r => {
      if ('erreur' in r) { poserErreur(r.erreur); return; }
      poserPoliceId(r.id);
      poserErreur('');
    });
  };
  const ajouter = () => {
    if (!police || !texte.trim()) return;
    at.creer(texte, police, taille, { interlettrage, ligatures: ligatures && aDesLigatures && interlettrage === 0 });
  };
  const message = erreur || erreurPolices;

  return (
    <fieldset className="editeur-groupe">
      <legend>Texte</legend>
      <textarea rows={2} value={texte} onChange={e => poserTexte(e.target.value)} aria-label="Texte" placeholder="Votre texte" />
      <ChoixPolice polices={polices} valeur={police?.id ?? ''} poser={poserPoliceId} texte={texte} />
      <div className="grille-2">
        <label className="champ-ligne"><span>Taille</span><input type="text" inputMode="decimal" value={String(taille)} onChange={e => poserTaille(Math.max(1, Number(e.target.value.replace(',', '.')) || 1))} /></label>
        <label className="champ-ligne"><span>Espace</span><input type="text" inputMode="decimal" value={String(interlettrage)} onChange={e => poserInterlettrage(Number(e.target.value.replace(',', '.')) || 0)} title="Interlettrage, en part de la taille" /></label>
      </div>
      {aDesLigatures ? (
        <label className="case">
          <input type="checkbox" checked={ligatures} disabled={interlettrage !== 0} onChange={e => poserLigatures(e.target.checked)} /> Ligatures (fi, fl…)
          {interlettrage !== 0 ? <span className="aide"> Sans effet avec un espace entre les lettres.</span> : null}
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

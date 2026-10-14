// Convertir une image en SVG (ADR-0002) : une image PNG ou JPG deposee, son fond detoure ou
// non, a quelle tolerance ; sa forme, image enveloppee ou vrais vecteurs (vtracer), dans quel mode et
// a quel grain. Tout se refait depuis l'image d'origine : on essaie, on compare, on garde, puis on
// ouvre le resultat dans l'editeur.

import { useRef, useState, type DragEvent } from 'react';
import { TOLERANCE_DEFAUT } from '../engine/detourage.js';
import { FINESSES, MODES_VECTORISATION, svgContours, type Finesse, type ModeVectorisation } from '../engine/vectorisation.js';
import { copier, proposer, texteOctets } from '../io/fichiers.js';
import { lireSource, resumeConversion, traiterImage, TRAITEMENT_DEFAUT, type ImageConvertie, type SourceImage, type Traitement } from '../io/image.js';

export const NOMS_MODES: Record<ModeVectorisation, string> = { aplats: 'Aplats aux couleurs de l’image', trait: 'Trait noir (une couleur)', fidele: 'Fidèle (plus de nuances)' };
export const NOMS_FINESSES: Record<Finesse, string> = { fine: 'Fin : garde les petits détails', normale: 'Normal', lisse: 'Lisse : des courbes franches' };
const TOLERANCES: ReadonlyArray<readonly [number, string]> = [[0.04, 'Serrée : seul le fond exact'], [TOLERANCE_DEFAUT, 'Normale'], [0.16, 'Large : un fond irrégulier, une ombre']];

const enImage = (svg: string): string => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const sansExtension = (nom: string) => nom.replace(/\.[a-z0-9]+$/i, '').trim() || 'image';

export function Vectoriser({ ouvrir }: { ouvrir: (nom: string, svg: string) => void }) {
  const [source, poserSource] = useState<{ nom: string; image: SourceImage } | null>(null);
  const [t, poserT] = useState<Traitement>(TRAITEMENT_DEFAUT);
  const [resultat, poserResultat] = useState<ImageConvertie | null>(null);
  const [message, dire] = useState('');
  const [enCours, poserEnCours] = useState(false);
  const [survol, poserSurvol] = useState(false);
  const entree = useRef<HTMLInputElement>(null);

  const deposer = (f: File | undefined) => {
    if (!f) return;
    void lireSource(f).then(r => {
      if ('erreur' in r) { dire(r.erreur); return; }
      poserSource({ nom: sansExtension(f.name), image: r });
      poserResultat(null);
      dire(r.largeur + ' × ' + r.hauteur + ' px. Réglez, puis « Vectoriser ».');
    });
  };
  const glisser = (e: DragEvent<HTMLElement>) => { e.preventDefault(); poserSurvol(false); deposer(e.dataTransfer.files[0]); };
  const appliquer = async () => {
    if (!source) return;
    poserEnCours(true);
    dire(t.vecteurs ? 'Vectorisation…' : 'Détourage…');
    try {
      const r = await traiterImage(source.image, t);
      if ('erreur' in r) { dire(r.erreur); return; }
      poserResultat(r);
      dire(resumeConversion(r) + '.');
    } finally {
      poserEnCours(false);
    }
  };
  const vecteurs = t.vecteurs;

  return (
    <section className="vectoriser" aria-label="Convertir une image en SVG">
      <h2>Convertir une image en SVG</h2>
      <div className={'depot petit' + (survol ? ' survol' : '')} onDragOver={e => { e.preventDefault(); poserSurvol(true); }} onDragLeave={() => poserSurvol(false)} onDrop={glisser}>
        <p>{source ? source.nom + ' · ' + source.image.largeur + ' × ' + source.image.hauteur + ' px' : 'Déposez un PNG, un JPG, un GIF ou un WebP, ou'}</p>
        <button type="button" className={source ? 'discret' : undefined} onClick={() => entree.current?.click()}>{source ? 'Changer d’image…' : 'Choisir une image…'}</button>
        <input ref={entree} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={e => { deposer(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {source ? (
        <div className="reglages-image">
          <fieldset className="editeur-groupe">
            <legend>Fond</legend>
            <label className="case"><input type="checkbox" checked={t.detourer} onChange={e => poserT({ ...t, detourer: e.target.checked })} /> Détourer le fond</label>
            {t.detourer ? (
              <label className="champ-ligne"><span>Tolérance</span>
                <select value={String(t.tolerance)} onChange={e => poserT({ ...t, tolerance: Number(e.target.value) })}>
                  {TOLERANCES.map(([v, l]) => <option key={v} value={String(v)}>{l}</option>)}
                </select>
              </label>
            ) : null}
          </fieldset>
          <fieldset className="editeur-groupe">
            <legend>Forme</legend>
            <div className="mini-onglets" role="group" aria-label="Forme du résultat">
              <button type="button" aria-pressed={Boolean(vecteurs)} onClick={() => poserT({ ...t, vecteurs: vecteurs ?? { mode: 'aplats', finesse: 'normale' } })}>Vecteurs (SVG)</button>
              <button type="button" aria-pressed={!vecteurs} onClick={() => poserT({ ...t, vecteurs: null })}>Image enveloppée</button>
            </div>
            {vecteurs ? (
              <>
                <label className="champ-ligne"><span>Mode</span>
                  <select value={vecteurs.mode} onChange={e => poserT({ ...t, vecteurs: { ...vecteurs, mode: e.target.value as ModeVectorisation } })}>
                    {MODES_VECTORISATION.map(m => <option key={m} value={m}>{NOMS_MODES[m]}</option>)}
                  </select>
                </label>
                <label className="champ-ligne"><span>Grain</span>
                  <select value={vecteurs.finesse} onChange={e => poserT({ ...t, vecteurs: { ...vecteurs, finesse: e.target.value as Finesse } })}>
                    {FINESSES.map(f => <option key={f} value={f}>{NOMS_FINESSES[f]}</option>)}
                  </select>
                </label>
                <p className="aide">Des formes vectorielles, nettes à toute taille, que l’éditeur sait reprendre. Un dessin plat s’y prête ; une photo non.</p>
              </>
            ) : <p className="aide">L’image détourée, gardée telle quelle dans un SVG : fidèle au pixel, mais l’éditeur ne la retouche pas.</p>}
          </fieldset>
          <div className="actions">
            <button type="button" disabled={enCours} onClick={() => { void appliquer(); }}>{vecteurs ? 'Vectoriser' : 'Envelopper'}</button>
            <span className="aide" role="status">{message}</span>
          </div>
        </div>
      ) : message ? <p className="aide" role="status">{message}</p> : null}
      {resultat && source ? <ResultatImage resultat={resultat} nom={source.nom} ouvrir={ouvrir} /> : null}
    </section>
  );
}

/** Le resultat en grand, sur un damier qui montre le fond retire ; vue « Contours » pour ses traces. */
function ResultatImage({ resultat, nom, ouvrir }: { resultat: ImageConvertie; nom: string; ouvrir: (nom: string, svg: string) => void }) {
  const [contours, poserContours] = useState(false);
  const [dit, dire] = useState('');
  const vecteurs = resultat.traces !== null;
  const vue = vecteurs && contours ? svgContours(resultat.svg) : resultat.svg;
  return (
    <div className="resultat-image">
      <img className="apercu" alt={vecteurs ? 'Image vectorisée' : 'Image détourée'} src={enImage(vue)} />
      <div className="fiche">
        <p className="aide">{resumeConversion(resultat)}</p>
        {vecteurs ? (
          <div className="mini-onglets" role="group" aria-label="Vue du résultat">
            <button type="button" aria-pressed={!contours} onClick={() => poserContours(false)}>Rendu</button>
            <button type="button" aria-pressed={contours} onClick={() => poserContours(true)}>Contours</button>
          </div>
        ) : null}
        <div className="actions">
          <button type="button" disabled={!vecteurs} title={vecteurs ? undefined : 'Une image enveloppée ne s’édite pas : vectorisez-la.'} onClick={() => ouvrir(nom, resultat.svg)}>Ouvrir dans l’éditeur</button>
          <button type="button" className="discret" onClick={() => { void proposer(nom + '.svg', texteOctets(resultat.svg)).then(dire); }}>Télécharger le SVG</button>
          <button type="button" className="discret" onClick={() => { void copier(resultat.svg).then(ok => dire(ok ? 'Code SVG copié.' : 'Cette page n’a pas le droit de copier : téléchargez le SVG.')); }}>Copier le code</button>
        </div>
        <span className="aide" role="status">{dit}</span>
      </div>
    </div>
  );
}

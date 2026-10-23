// L'atelier du resultat (ADR-0005), sous la zone de depot : l'image deposee et son trace cote a cote
// (rideau), en rendu, en contours, detouree ou telle quelle ; le zoom et le fond ; les reglages du
// traceur, rejoues a chaque changement ou a la demande ; et les essais precedents, pour comparer et
// reprendre un reglage d'un clic. Tout se refait depuis l'image d'origine, sans perte cumulee.

import { useMemo, useState } from 'react';
import { cleTraitement, FINESSES, MODES_VECTORISATION, resumeReglages, svgContours, type Finesse, type ModeVectorisation, type Traitement } from '../engine/vectorisation.js';
import { copier, proposer, texteOctets } from '../io/fichiers.js';
import { apercuDetoure, resumeConversion, type ImageConvertie, type SourceImage } from '../io/image.js';
import { Icone, type NomIcone } from './icones.js';
import { ReglagesFinsPanneau } from './ReglagesFins.js';

export const NOMS_MODES: Record<ModeVectorisation, string> = { aplats: 'Aplats aux couleurs de l’image', trait: 'Trait noir (une couleur)', fidele: 'Fidèle (plus de nuances)' };
export const NOMS_FINESSES: Record<Finesse, string> = { fine: 'Fin : garde les petits détails', normale: 'Normal', lisse: 'Lisse : des courbes franches' };

/** Un essai : les reglages, et ce qu'ils ont donne. Le plus recent d'abord, huit au plus. */
export interface Essai { id: number; traitement: Traitement; resultat: ImageConvertie }

type VueResultat = 'rendu' | 'contours' | 'origine' | 'detouree' | 'comparer';
type Fond = 'damier' | 'blanc' | 'sombre';
type Zoom = 'ajuste' | 1 | 2 | 4;

const VUES: ReadonlyArray<readonly [VueResultat, string, string]> = [
  ['comparer', 'Comparer', 'Rideau : l’image détourée à gauche, les vecteurs à droite'],
  ['rendu', 'Rendu', 'Les vecteurs seuls'],
  ['contours', 'Contours', 'Les tracés en filets'],
  ['detouree', 'Détourée', 'L’image après détourage, avant le tracé'],
  ['origine', 'Originale', 'L’image déposée, telle quelle']
];
const ZOOMS: ReadonlyArray<readonly [Zoom, string]> = [['ajuste', 'Ajusté'], [1, '100 %'], [2, '200 %'], [4, '400 %']];
const FONDS: ReadonlyArray<readonly [Fond, NomIcone, string]> = [['damier', 'fond-damier', 'Fond damier'], ['blanc', 'fond-blanc', 'Fond blanc'], ['sombre', 'fond-sombre', 'Fond sombre']];

const enImage = (svg: string): string => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

interface ProprietesVisionneuse {
  source: SourceImage; original: string; detouree: string; resultat: ImageConvertie | null;
  vue: VueResultat; zoom: Zoom; fond: Fond; rideau: number;
}

/** L'image et son trace, a l'echelle voulue. Le calque de base donne sa taille a l'ensemble ; le trace le recouvre. */
function Visionneuse({ source, original, detouree, resultat, vue, zoom, fond, rideau }: ProprietesVisionneuse) {
  // Sans resultat, il n'y a que l'image : originale ou detouree.
  const effective: VueResultat = resultat ? vue : vue === 'origine' ? 'origine' : 'detouree';
  const avecTrace = resultat !== null && (effective === 'rendu' || effective === 'contours' || effective === 'comparer');
  const svgVue = useMemo(() => {
    if (!resultat) return '';
    return enImage(effective === 'contours' && resultat.traces !== null ? svgContours(resultat.svg) : resultat.svg);
  }, [resultat, effective]);
  const taille = zoom === 'ajuste' ? { maxWidth: '100%', maxHeight: 460 } : { width: source.largeur * zoom, height: source.hauteur * zoom, maxWidth: 'none' };
  return (
    <div className={'visionneuse fond-' + fond}>
      <div className="plan">
        <img className={'calque base' + (avecTrace && effective !== 'comparer' ? ' cache' : '')} src={effective === 'origine' ? original : detouree} alt={effective === 'origine' ? 'Image déposée' : 'Image détourée'} style={taille} />
        {avecTrace ? <img className="calque haut" src={svgVue} alt={resultat?.traces !== null ? 'Image vectorisée' : 'Image enveloppée'} style={effective === 'comparer' ? { clipPath: 'inset(0 0 0 ' + rideau + '%)' } : undefined} /> : null}
        {effective === 'comparer' ? <span className="ligne-rideau" style={{ left: rideau + '%' }} aria-hidden="true" /> : null}
      </div>
    </div>
  );
}

interface Proprietes {
  nom: string; source: SourceImage; original: string; t: Traitement; poserT: (t: Traitement) => void;
  resultat: ImageConvertie | null; essais: readonly Essai[]; auto: boolean; poserAuto: (a: boolean) => void;
  enCours: boolean; message: string; rejouer: () => void; reprendre: (e: Essai) => void; ouvrir: (nom: string, svg: string) => void;
}

export function AtelierResultat({ nom, source, original, t, poserT, resultat, essais, auto, poserAuto, enCours, message, rejouer, reprendre, ouvrir }: Proprietes) {
  const [vue, poserVue] = useState<VueResultat>('comparer');
  const [zoom, poserZoom] = useState<Zoom>('ajuste');
  const [fond, poserFond] = useState<Fond>('damier');
  const [rideau, poserRideau] = useState(50);
  const [dit, dire] = useState('');
  const detouree = useMemo(() => apercuDetoure(source, t), [source, t.detourer, t.tolerance, t.portee]);
  const v = t.vecteurs;
  const vecteurs = resultat !== null && resultat.traces !== null;
  const cle = cleTraitement(t);
  return (
    <section className="atelier-vecto" aria-label="Résultat" aria-busy={enCours}>
      <div className="colonne-resultat">
        <div className="barre-visionneuse" role="toolbar" aria-label="Affichage du résultat">
          <div className="mini-onglets" role="group" aria-label="Vue">
            {VUES.map(([id, libelle, aide]) => <button key={id} type="button" aria-pressed={vue === id} title={aide} onClick={() => poserVue(id)}>{libelle}</button>)}
          </div>
          <select aria-label="Zoom" value={String(zoom)} onChange={e => poserZoom(e.target.value === 'ajuste' ? 'ajuste' : (Number(e.target.value) as Zoom))}>
            {ZOOMS.map(([z, l]) => <option key={String(z)} value={String(z)}>{l}</option>)}
          </select>
          <div className="groupe" role="group" aria-label="Fond">
            {FONDS.map(([f, icone, aide]) => <button key={f} type="button" className="icone-bouton" aria-pressed={fond === f} title={aide} aria-label={aide} onClick={() => poserFond(f)}><Icone nom={icone} /></button>)}
          </div>
        </div>
        <Visionneuse source={source} original={original} detouree={detouree} resultat={resultat} vue={vue} zoom={zoom} fond={fond} rideau={rideau} />
        {vue === 'comparer' && resultat ? (
          <label className="rideau">
            <span className="aide">Image détourée</span>
            <input type="range" min={0} max={100} value={rideau} aria-label="Position du rideau" onChange={e => poserRideau(Number(e.target.value))} />
            <span className="aide">Vecteurs</span>
          </label>
        ) : null}
        {resultat ? (
          <div className="fiche-resultat">
            <p className="aide">{resumeConversion(resultat)} · {resultat.duree} ms{resultat.traitement.vecteurs ? ' · ' + resumeReglages(resultat.traitement.vecteurs) : ''}</p>
            <div className="actions">
              <button type="button" className="primaire" disabled={!vecteurs} title={vecteurs ? undefined : 'Une image enveloppée ne s’édite pas : vectorisez-la.'} onClick={() => ouvrir(nom, resultat.svg)}>Ouvrir dans l’éditeur</button>
              <button type="button" className="discret" onClick={() => { void proposer(nom + '.svg', texteOctets(resultat.svg)).then(dire); }}>Télécharger le SVG</button>
              <button type="button" className="discret" onClick={() => { void copier(resultat.svg).then(ok => dire(ok ? 'Code SVG copié.' : 'Cette page n’a pas le droit de copier : téléchargez le SVG.')); }}>Copier le code</button>
            </div>
            <span className="aide" role="status">{dit}</span>
          </div>
        ) : <p className="aide">{enCours ? 'Vectorisation…' : 'Pas encore de résultat : réglez, puis « Vectoriser ».'}</p>}
        {essais.length > 1 ? (
          <div className="essais">
            <h3>Essais <span className="aide">les {essais.length} derniers : un clic reprend les réglages</span></h3>
            <ul>
              {essais.map(e => (
                <li key={e.id}>
                  <button type="button" aria-pressed={cleTraitement(e.traitement) === cle} title={e.traitement.vecteurs ? resumeReglages(e.traitement.vecteurs) : 'Image enveloppée'} onClick={() => reprendre(e)}>
                    <img src={enImage(e.resultat.svg)} alt="" width={64} height={64} />
                    <span>{e.traitement.vecteurs ? resumeReglages(e.traitement.vecteurs) : 'Enveloppée'}</span>
                    <span className="aide">{e.resultat.traces !== null ? e.resultat.traces + ' tracé' + (e.resultat.traces > 1 ? 's' : '') + ' · ' : ''}{Math.max(1, Math.round(e.resultat.svg.length / 1024))} Ko · {e.resultat.duree} ms</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <aside className="reglages-vecto" aria-label="Réglages du tracé">
        {v ? (
          <>
            <fieldset className="editeur-groupe">
              <legend>Tracé</legend>
              <label className="champ-ligne"><span>Mode</span>
                <select value={v.mode} onChange={e => poserT({ ...t, vecteurs: { mode: e.target.value as ModeVectorisation, finesse: v.finesse } })}>
                  {MODES_VECTORISATION.map(m => <option key={m} value={m}>{NOMS_MODES[m]}</option>)}
                </select>
              </label>
              <label className="champ-ligne"><span>Grain</span>
                <select value={v.finesse} onChange={e => poserT({ ...t, vecteurs: { mode: v.mode, finesse: e.target.value as Finesse } })}>
                  {FINESSES.map(f => <option key={f} value={f}>{NOMS_FINESSES[f]}</option>)}
                </select>
              </label>
              <p className="aide">Changer de mode ou de grain remet les réglages fins à leurs valeurs.</p>
            </fieldset>
            <ReglagesFinsPanneau v={v} nCouleurs={resultat?.couleurs.length ?? 0} poser={nv => poserT({ ...t, vecteurs: nv })} />
          </>
        ) : <p className="aide">Image enveloppée : un seul réglage, le fond. Passez à « Vecteurs (SVG) » pour régler le tracé.</p>}
        <label className="case" title="Chaque changement de réglage relance la vectorisation, après une courte pause">
          <input type="checkbox" checked={auto} onChange={e => poserAuto(e.target.checked)} /> Rejouer à chaque changement
        </label>
        <div className="actions">
          <button type="button" className={resultat ? undefined : 'primaire'} disabled={enCours} onClick={rejouer}>{enCours ? 'En cours…' : resultat ? 'Rejouer' : v ? 'Vectoriser' : 'Envelopper'}</button>
          <span className="aide" role="status">{message}</span>
        </div>
      </aside>
    </section>
  );
}

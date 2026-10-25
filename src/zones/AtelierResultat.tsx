// L'atelier du resultat (ADR-0005), sous la zone de depot : l'image deposee et son trace cote a cote
// (rideau), en rendu, en contours, detouree ou telle quelle ; le zoom et le fond ; les reglages du
// traceur, rejoues a chaque changement ou a la demande ; et les essais precedents, pour comparer et
// reprendre un reglage d'un clic. Tout se refait depuis l'image d'origine, sans perte cumulee.
//
// Au premier resultat, seul l'essentiel se voit (ADR-0006, une action primaire par panneau) : le resultat,
// deux vues (Comparer, Contours), le mode et le grain, « Ouvrir dans l'editeur ». Les autres vues, le zoom et
// le fond du plan sont sous « Plus de vues » ; les reglages fins et le pretraitement, en sections repliees.

import { useMemo, useState } from 'react';
import { COULEURS_MAX, resumePretraitement } from '../engine/pretraitement.js';
import { cleTraitement, COULEURS_PALETTE_MAX, FINESSES, MODES_VECTORISATION, resumeReglages, sansPretraitement, svgContours, type Finesse, type ModeVectorisation, type Traitement } from '../engine/vectorisation.js';
import { copier, proposer, texteOctets } from '../io/fichiers.js';
import { apercuDetoure, resumeConversion, type ApercuPretraite, type ImageConvertie, type SourceImage } from '../io/image.js';
import { MenuDeroulant, type SectionMenu } from './commun/Menu.js';
import { Section } from './commun/Section.js';
import type { NomIcone } from './icones.js';
import { ReglagesFinsPanneau } from './ReglagesFins.js';
import { EpaisseurLigne, ReglagesLignePanneau } from './ReglagesLigne.js';
import { ReglagesPretraitementPanneau } from './ReglagesPretraitement.js';
import { Repere } from './Repere.js';

export const NOMS_MODES: Record<ModeVectorisation, string> = {
  aplats: 'Aplats aux couleurs de l’image', trait: 'Trait noir (une couleur)', fidele: 'Fidèle (plus de nuances)', mediane: 'Ligne médiane (stylo)'
};
export const NOMS_FINESSES: Record<Finesse, string> = { fine: 'Fin : garde les petits détails', normale: 'Normal', lisse: 'Lisse : des courbes franches' };

/** Un essai : les reglages, et ce qu'ils ont donne. Le plus recent d'abord, huit au plus. */
export interface Essai { id: number; traitement: Traitement; resultat: ImageConvertie }

type VueResultat = 'rendu' | 'contours' | 'origine' | 'detouree' | 'pretraitee' | 'comparer';
/** L'image du cote gauche du rideau, et des vues sans trace. */
type Cote = 'origine' | 'detouree' | 'pretraitee';
type Fond = 'damier' | 'blanc' | 'sombre';
type Zoom = 'ajuste' | 1 | 2 | 4;

const VUES: ReadonlyArray<readonly [VueResultat, string, string]> = [
  ['comparer', 'Comparer', 'Rideau : une image à gauche (détourée, prétraitée ou originale), les vecteurs à droite'],
  ['contours', 'Contours', 'Les tracés en filets'],
  ['rendu', 'Rendu', 'Les vecteurs seuls'],
  ['pretraitee', 'Prétraitée', 'L’image après prétraitement et détourage : ce que le traceur lit. Sans prétraitement, la même que Détourée'],
  ['detouree', 'Détourée', 'L’image après détourage, avant le tracé'],
  ['origine', 'Originale', 'L’image déposée, telle quelle']
];
/** Les vues toujours visibles ; les autres sont sous « Plus de vues ». */
const VUES_VISIBLES: ReadonlySet<VueResultat> = new Set(['comparer', 'contours']);
const NOMS_COTES: ReadonlyArray<readonly [Cote, string, string]> = [['detouree', 'Détourée', 'Image détourée'], ['pretraitee', 'Prétraitée', 'Image prétraitée'], ['origine', 'Originale', 'Image déposée']];
const ZOOMS: ReadonlyArray<readonly [Zoom, string]> = [['ajuste', 'Ajusté'], [1, '100 %'], [2, '200 %'], [4, '400 %']];
const FONDS: ReadonlyArray<readonly [Fond, NomIcone, string]> = [['damier', 'fond-damier', 'Damier (transparence)'], ['blanc', 'fond-blanc', 'Blanc'], ['sombre', 'fond-sombre', 'Sombre']];

const enImage = (svg: string): string => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

interface ProprietesVisionneuse {
  source: SourceImage; original: string; detouree: string; pretraitee: string; resultat: ImageConvertie | null;
  vue: VueResultat; zoom: Zoom; fond: Fond; rideau: number; gauche: Cote;
}

/** L'image et son trace, a l'echelle voulue. Le calque de base donne sa taille a l'ensemble ; le trace le recouvre. */
function Visionneuse({ source, original, detouree, pretraitee, resultat, vue, zoom, fond, rideau, gauche }: ProprietesVisionneuse) {
  // Sans resultat, il n'y a que l'image : originale, detouree ou pretraitee.
  const effective: VueResultat = resultat ? vue : vue === 'origine' || vue === 'pretraitee' ? vue : 'detouree';
  // Le calque de base : l'image seule, ou le cote gauche du rideau.
  const cote: Cote = effective === 'origine' || effective === 'pretraitee' ? effective : effective === 'comparer' ? gauche : 'detouree';
  const [, , altCote] = NOMS_COTES.find(c => c[0] === cote) ?? NOMS_COTES[0] ?? ['detouree', '', 'Image détourée'];
  const avecTrace = resultat !== null && (effective === 'rendu' || effective === 'contours' || effective === 'comparer');
  const svgVue = useMemo(() => {
    if (!resultat) return '';
    return enImage(effective === 'contours' && resultat.traces !== null ? svgContours(resultat.svg) : resultat.svg);
  }, [resultat, effective]);
  const taille = zoom === 'ajuste' ? { maxWidth: '100%', maxHeight: 460 } : { width: source.largeur * zoom, height: source.hauteur * zoom, maxWidth: 'none' };
  return (
    <div className={'visionneuse fond-' + fond}>
      <div className="plan">
        <img className={'calque base' + (avecTrace && effective !== 'comparer' ? ' cache' : '')} src={cote === 'origine' ? original : cote === 'pretraitee' ? pretraitee : detouree} alt={altCote} style={taille} />
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
  /** L'image prétraitée que le traceur lira, calculée à part ; null sans prétraitement. */
  apercu: ApercuPretraite | null;
  /** Trace l'image sans prétraitement et l'ajoute aux essais, pour mesurer l'effet. */
  mesurerSans: () => void;
}

/** La barre de la visionneuse : deux vues visibles, le reste (autres vues, zoom, fond du plan) dans « Plus de vues ». */
function BarreVisionneuse({ vue, poserVue, zoom, poserZoom, fond, poserFond }: { vue: VueResultat; poserVue: (v: VueResultat) => void; zoom: Zoom; poserZoom: (z: Zoom) => void; fond: Fond; poserFond: (f: Fond) => void }) {
  const cachee = VUES.find(([id]) => id === vue && !VUES_VISIBLES.has(id));
  const rubriques: SectionMenu[] = [
    { id: 'vues', titre: 'Vue', elements: VUES.filter(([id]) => !VUES_VISIBLES.has(id)).map(([id, libelle]) => ({ id, libelle, radio: true, coche: vue === id, onClick: () => poserVue(id) })) },
    { id: 'zoom', titre: 'Zoom', elements: ZOOMS.map(([z, libelle]) => ({ id: 'zoom-' + String(z), libelle, radio: true, coche: zoom === z, onClick: () => poserZoom(z) })) },
    { id: 'fond', titre: 'Fond du plan', elements: FONDS.map(([f, icone, libelle]) => ({ id: 'fond-' + f, libelle, icone, radio: true, coche: fond === f, onClick: () => poserFond(f) })) }
  ];
  return (
    <div className="barre-visionneuse" role="toolbar" aria-label="Affichage du résultat">
      <div className="mini-onglets" role="group" aria-label="Vue">
        {VUES.filter(([id]) => VUES_VISIBLES.has(id)).map(([id, libelle, aide]) => <button key={id} type="button" aria-pressed={vue === id} title={aide} onClick={() => poserVue(id)}>{libelle}</button>)}
      </div>
      {/* Une vue cachee qu'on a choisie donne son nom au bouton : on voit toujours ce qu'on regarde. */}
      <MenuDeroulant etiquette="Plus de vues : autres vues, zoom et fond du plan" libelle={cachee ? cachee[1] : 'Plus de vues'} sections={rubriques} className={'vue-plus' + (cachee ? ' active' : '')} />
    </div>
  );
}

/** Ce que le resultat a donne, dit une seule fois (et lu par les lecteurs d'ecran), et ce qu'on en fait. */
function FicheResultat({ nom, resultat, ouvrir }: { nom: string; resultat: ImageConvertie; ouvrir: (nom: string, svg: string) => void }) {
  const [dit, dire] = useState('');
  const vecteurs = resultat.traces !== null;
  return (
    <div className="fiche-resultat">
      <p className="aide" role="status">{resumeConversion(resultat)} · {resultat.duree} ms{resultat.traitement.vecteurs ? ' · ' + resumeReglages(resultat.traitement.vecteurs) : ''}</p>
      {resultat.pretraite ? <p className="aide">Prétraitement : {resumePretraitement(resultat.traitement.pretraitement)}.</p> : null}
      <div className="actions">
        <button type="button" className="primaire" disabled={!vecteurs} title={vecteurs ? undefined : 'Une image gardée telle quelle ne s’édite pas : vectorisez-la.'} onClick={() => ouvrir(nom, resultat.svg)}>Ouvrir dans l’éditeur</button>
        <button type="button" className="discret" onClick={() => { void proposer(nom + '.svg', texteOctets(resultat.svg)).then(dire); }}>Télécharger le SVG</button>
        <button type="button" className="discret" onClick={() => { void copier(resultat.svg).then(ok => dire(ok ? 'Code SVG copié.' : 'Cette page n’a pas le droit de copier : téléchargez le SVG.')); }}>Copier le code</button>
      </div>
      <span className="aide" role="status">{dit}</span>
    </div>
  );
}

/** Les essais precedents : un clic reprend les reglages et le resultat, sans relancer le traceur. */
function Essais({ essais, cle, reprendre }: { essais: readonly Essai[]; cle: string; reprendre: (e: Essai) => void }) {
  return (
    <div className="essais">
      <h3>Essais <span className="aide">les {essais.length} derniers : un clic reprend les réglages</span></h3>
      <ul>
        {essais.map(e => (
          <li key={e.id}>
            <button type="button" aria-pressed={cleTraitement(e.traitement) === cle} title={(e.traitement.vecteurs ? resumeReglages(e.traitement.vecteurs) : 'Image telle quelle') + (e.traitement.pretraitement ? ' · ' + resumePretraitement(e.traitement.pretraitement) : '')} onClick={() => reprendre(e)}>
              <img src={enImage(e.resultat.svg)} alt="" width={64} height={64} />
              <span>{e.traitement.vecteurs ? resumeReglages(e.traitement.vecteurs) : 'Telle quelle'}</span>
              {e.traitement.pretraitement ? <span className="aide pre-essai">{resumePretraitement(e.traitement.pretraitement)}</span> : null}
              <span className="aide">{e.resultat.traces !== null ? e.resultat.traces + ' tracé' + (e.resultat.traces > 1 ? 's' : '') + ' · ' : ''}{Math.max(1, Math.round(e.resultat.svg.length / 1024))} Ko · {e.resultat.duree} ms</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AtelierResultat({ nom, source, original, t, poserT, resultat, essais, auto, poserAuto, enCours, message, rejouer, reprendre, ouvrir, apercu, mesurerSans }: Proprietes) {
  const [vue, poserVue] = useState<VueResultat>('comparer');
  const [zoom, poserZoom] = useState<Zoom>('ajuste');
  const [fond, poserFond] = useState<Fond>('damier');
  const [rideau, poserRideau] = useState(50);
  // Le cote gauche du rideau : celui qu'on a choisi, sinon l'image que le traceur lit (pretraitee si elle l'est).
  const [gaucheChoisi, poserGauche] = useState<Cote | null>(null);
  const gauche: Cote = gaucheChoisi ?? (t.pretraitement ? 'pretraitee' : 'detouree');
  const detouree = useMemo(() => apercuDetoure(source, t), [source, t.detourer, t.tolerance, t.portee]);
  const pretraitee = apercu?.url ?? detouree;
  const v = t.vecteurs;
  const cle = cleTraitement(t);
  // L'essai de reference d'un prétraitement : les mêmes réglages, sans lui.
  const reference = t.pretraitement ? essais.find(e => cleTraitement(e.traitement) === cleTraitement(sansPretraitement(t)))?.resultat : undefined;
  const aJour = resultat !== null && cleTraitement(resultat.traitement) === cle;
  const mediane = v?.mode === 'mediane';
  // L'epaisseur de la ligne mediane se regle a cote du mode : elle ne compte pas parmi les reglages fins.
  const touches = mediane ? Object.keys(v?.ligne ?? {}).filter(k => k !== 'epaisseur').length : Object.keys(v?.fins ?? {}).length;
  const mesure = resultat?.ligne ?? null;
  // Le bouton ne sert que s'il n'y a rien a montrer encore, ou si l'on rejoue a la main.
  const bouton = !auto || resultat === null;
  return (
    <section className="atelier-vecto" aria-label="Résultat" aria-busy={enCours}>
      <div className="colonne-resultat">
        <BarreVisionneuse vue={vue} poserVue={poserVue} zoom={zoom} poserZoom={poserZoom} fond={fond} poserFond={poserFond} />
        <Visionneuse source={source} original={original} detouree={detouree} pretraitee={pretraitee} resultat={resultat} vue={vue} zoom={zoom} fond={fond} rideau={rideau} gauche={gauche} />
        {vue === 'comparer' && resultat ? (
          <label className="rideau">
            <select aria-label="Image du côté gauche du rideau" value={gauche} onChange={e => poserGauche(e.target.value as Cote)}>
              {NOMS_COTES.map(([c, libelle]) => <option key={c} value={c}>{libelle}</option>)}
            </select>
            <input type="range" min={0} max={100} value={rideau} aria-label="Position du rideau" onChange={e => poserRideau(Number(e.target.value))} />
            <span className="aide">Vecteurs</span>
          </label>
        ) : null}
        {resultat?.ligne ? (
          <Repere id="conversion" titre="Votre dessin est devenu des lignes">
            La vue « Contours » montre les lignes seules, au milieu du trait. Des petites branches en trop ? Montez « Retirer les barbules » dans les réglages fins. Puis « Ouvrir dans l’éditeur ».
          </Repere>
        ) : resultat && resultat.traces !== null ? (
          <Repere id="conversion" titre="Votre image est devenue des formes">
            La vue « Comparer » pose l’image d’origine et le résultat côte à côte. Trop de petites formes ? Passez le grain à « Lisse » ; trop peu ? à « Fin ». Puis « Ouvrir dans l’éditeur » pour recolorer chaque forme.
          </Repere>
        ) : null}
        {resultat ? <FicheResultat nom={nom} resultat={resultat} ouvrir={ouvrir} /> : <p className="aide" role="status">{message || (enCours ? 'Vectorisation…' : 'Pas encore de résultat : réglez, puis « Vectoriser ».')}</p>}
        {essais.length > 1 ? <Essais essais={essais} cle={cle} reprendre={reprendre} /> : null}
      </div>
      <aside className="reglages-vecto" aria-label="Réglages du tracé">
        {v ? (
          <>
            <fieldset className="editeur-groupe">
              <legend>Tracé</legend>
              <label className="champ-ligne"><span>Mode</span>
                <select value={v.mode} onChange={e => poserT({ ...t, vecteurs: { mode: e.target.value as ModeVectorisation, finesse: v.finesse } })}>
                  {MODES_VECTORISATION.map(m => <option key={m} value={m} title={m === 'mediane' ? 'Dessin au trait : une seule ligne au milieu du trait, pour le stylo' : undefined}>{NOMS_MODES[m]}</option>)}
                </select>
              </label>
              <label className="champ-ligne"><span>Grain</span>
                {/* Le grain remet les reglages fins a zero ; l'epaisseur de la ligne mediane, reglee a cote, reste. */}
                <select value={v.finesse} onChange={e => poserT({ ...t, vecteurs: { mode: v.mode, finesse: e.target.value as Finesse, ...(mediane && v.ligne?.epaisseur !== undefined ? { ligne: { epaisseur: v.ligne.epaisseur } } : {}) } })}>
                  {FINESSES.map(f => <option key={f} value={f}>{NOMS_FINESSES[f]}</option>)}
                </select>
              </label>
              {mediane ? (
                <>
                  <EpaisseurLigne v={v} mesure={mesure} poser={nv => poserT({ ...t, vecteurs: nv })} />
                  <p className="aide">Pour le stylo d’une Cricut : une seule ligne par trait, sans remplissage.</p>
                </>
              ) : null}
            </fieldset>
            <Section titre="Réglages fins" note={touches ? touches + ' modifié' + (touches > 1 ? 's' : '') : undefined}>
              {mediane
                ? <ReglagesLignePanneau v={v} mesure={mesure} poser={nv => poserT({ ...t, vecteurs: nv })} />
                : <ReglagesFinsPanneau v={v} nCouleurs={resultat?.couleurs.length ?? 0} plafond={resultat?.pretraite && t.pretraitement?.couleurs !== undefined ? COULEURS_MAX : COULEURS_PALETTE_MAX} poser={nv => poserT({ ...t, vecteurs: nv })} />}
              <label className="case" title="Chaque changement de réglage relance la vectorisation, après une courte pause">
                <input type="checkbox" checked={auto} onChange={e => poserAuto(e.target.checked)} /> Rejouer à chaque changement
              </label>
            </Section>
          </>
        ) : <p className="aide">Image gardée telle quelle : un seul réglage, le fond. Passez à « Vecteurs (SVG) » pour régler le tracé.</p>}
        <ReglagesPretraitementPanneau t={t} poserT={poserT} apercu={apercu} resultat={aJour ? resultat : null} reference={reference} mesurer={mesurerSans} enCours={enCours} />
        <div className="actions">
          {bouton ? <button type="button" className={resultat ? undefined : 'primaire'} disabled={enCours} onClick={rejouer}>{enCours ? 'En cours…' : resultat ? 'Rejouer' : v ? 'Vectoriser' : 'Créer le SVG'}</button> : null}
          {/* Sans resultat, le message (progres, echec, ce qui manque au navigateur) se lit sous la visionneuse : pas deux fois. */}
          <span className="aide" role="status">{resultat ? message : ''}</span>
        </div>
      </aside>
    </section>
  );
}

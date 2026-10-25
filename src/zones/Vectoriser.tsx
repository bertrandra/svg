// Convertir une image en SVG (ADR-0002, ADR-0005) : une image PNG ou JPG deposee, affichee des le
// depot ; son fond detoure ou non, a quelle tolerance et sur quelle portee ; sa forme, image enveloppee
// ou vrais vecteurs (vtracer). Le resultat vit dans l'atelier juste dessous, ou les reglages se
// rejouent depuis l'image d'origine : on essaie, on compare, on garde, puis on ouvre dans l'editeur.

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { TOLERANCE_DEFAUT } from '../engine/detourage.js';
import { cleTraitement, sansPretraitement, type Traceur } from '../engine/vectorisation.js';
import { sonderNavigateur } from '../io/capacites.js';
import { pause } from '../io/fichiers.js';
import { apercuDetoure, apercuPretraite, lireSource, resumeConversion, traiterImage, TRAITEMENT_DEFAUT, type ApercuPretraite, type ImageConvertie, type SourceImage, type Traitement } from '../io/image.js';
import { chargerTraceur, traceurCharge } from '../io/vtracer.js';
import { manquantes, phraseManquantes } from '../util/capacites.js';
import { AtelierResultat, type Essai } from './AtelierResultat.js';
import { LotImages } from './LotImages.js';

const TOLERANCES: ReadonlyArray<readonly [number, string]> = [[0.04, 'Serrée : seul le fond exact'], [TOLERANCE_DEFAUT, 'Normale'], [0.16, 'Large : un fond irrégulier, une ombre']];
const ESSAIS_MAX = 8;
/** La pause avant de rejouer : on laisse finir un geste (un curseur qu'on tire) avant de relancer le traceur. */
const PAUSE_REJEU = 400;

const sansExtension = (nom: string) => nom.replace(/\.[a-z0-9]+$/i, '').trim() || 'image';
/** La pause avant de recalculer l'aperçu prétraité : plus courte que celle du traceur, le calcul est moins lourd. */
const PAUSE_APERCU = 150;

interface Deposee { nom: string; image: SourceImage; original: string }

// La vignette « avant, apres » : un disque et un triangle, d'abord en gros pixels (une image), puis en formes lisses (des vecteurs).
// Elle est decorative (aria-hidden, la legende dit la meme chose en mots) et ne dessine que par les jetons de l'interface : aucun
// fichier, aucun reseau, aucune couleur en dur. Les cases se calculent une fois, au chargement du module.
const CASE = 4;
const dansDisque = (x: number, y: number) => (x - 22) ** 2 + (y - 26) ** 2 <= 13 ** 2;
const dansTriangle = (x: number, y: number) => y >= 16 && y <= 38 && Math.abs(x - 46) <= (y - 16) * 0.5;
const CASES: ReadonlyArray<{ x: number; y: number; forme: 'disque' | 'triangle' }> = (() => {
  const r: Array<{ x: number; y: number; forme: 'disque' | 'triangle' }> = [];
  for (let y = 0; y < 48; y += CASE) for (let x = 0; x < 64; x += CASE) {
    const cx = x + CASE / 2, cy = y + CASE / 2;
    if (dansDisque(cx, cy)) r.push({ x, y, forme: 'disque' });
    else if (dansTriangle(cx, cy)) r.push({ x, y, forme: 'triangle' });
  }
  return r;
})();

function ApercuConversion() {
  return (
    <figure className="avant-apres">
      <div className="avant-apres-vignettes" aria-hidden="true">
        <div>
          <svg viewBox="0 0 64 48" focusable="false" shapeRendering="crispEdges">
            {CASES.map(c => <rect key={c.x + ',' + c.y} className={c.forme === 'disque' ? 'forme-a' : 'forme-b'} x={c.x} y={c.y} width={CASE} height={CASE} />)}
          </svg>
          <span className="aide">Image</span>
        </div>
        <svg className="fleche" viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h15M13 6l6 6-6 6" /></svg>
        <div>
          <svg viewBox="0 0 64 48" focusable="false">
            <circle className="forme-a" cx="22" cy="26" r="13" />
            <path className="forme-b" d="M46 16 L57 38 L35 38 Z" />
          </svg>
          <span className="aide">SVG</span>
        </div>
      </div>
      <figcaption className="aide">Une image en pixels devient des formes vectorielles, nettes à toute taille. Un logo ou un dessin aux couleurs franches s’y prête le mieux ; plusieurs images déposées d’un coup se convertissent en lot, avec les mêmes réglages.</figcaption>
    </figure>
  );
}

export function Vectoriser({ ouvrir }: { ouvrir: (nom: string, svg: string) => void }) {
  const [source, poserSource] = useState<Deposee | null>(null);
  const [t, poserT] = useState<Traitement>(TRAITEMENT_DEFAUT);
  const [resultat, poserResultat] = useState<ImageConvertie | null>(null);
  const [essais, poserEssais] = useState<readonly Essai[]>([]);
  const [auto, poserAuto] = useState(true);
  const [message, dire] = useState('');
  const [enCours, poserEnCours] = useState(false);
  const [survol, poserSurvol] = useState(false);
  const [apercu, poserApercu] = useState<ApercuPretraite | null>(null);
  const [fichiersLot, poserFichiersLot] = useState<readonly File[]>([]);
  const entree = useRef<HTMLInputElement>(null);
  // Chaque lancement prend un numero ; un resultat qui revient apres un lancement plus recent est jete.
  const jeton = useRef(0);

  const lancer = useCallback(async (image: SourceImage, traitement: Traitement) => {
    // WebAssembly (le traceur) et le canvas (les pixels) se verifient avant de charger quoi que ce soit : la phrase dit quoi faire.
    const absentes = manquantes(sonderNavigateur(), traitement.vecteurs ? 'vectorisation' : 'image');
    if (absentes.length) { dire(phraseManquantes(absentes)); return; }
    const mien = ++jeton.current;
    poserEnCours(true);
    // Le traceur ne se charge qu'ici, au premier trace : deposer une image, la detourer ou l'envelopper
    // ne le demande pas. Son chargement se dit avant, et ses echecs avec la marche a suivre.
    let traceur: Traceur | undefined;
    if (traitement.vecteurs && !traceurCharge()) {
      dire('Chargement du traceur…');
      try { traceur = await chargerTraceur(); } catch (e) {
        if (mien === jeton.current) { poserEnCours(false); dire(e instanceof Error ? e.message : String(e)); }
        return;
      }
      if (mien !== jeton.current) return;
    }
    dire(traitement.vecteurs ? 'Vectorisation…' : 'Détourage…');
    await pause();
    const r = await traiterImage(image, traitement, traceur);
    if (mien !== jeton.current) return;
    poserEnCours(false);
    if ('erreur' in r) { dire(r.erreur); return; }
    poserResultat(r);
    const cle = cleTraitement(traitement);
    poserEssais(es => [{ id: mien, traitement, resultat: r }, ...es.filter(e => cleTraitement(e.traitement) !== cle)].slice(0, ESSAIS_MAX));
    dire(resumeConversion(r) + '.');
  }, []);

  // Rejouer a chaque changement : sauf si le resultat montre deja ces reglages sur cette image.
  useEffect(() => {
    if (!auto || !source) return;
    if (resultat && resultat.source === source.image && cleTraitement(resultat.traitement) === cleTraitement(t)) return;
    const id = setTimeout(() => { void lancer(source.image, t); }, PAUSE_REJEU);
    return () => clearTimeout(id);
  }, [auto, source, t, resultat, lancer]);

  // L'aperçu prétraité (ce que le traceur lira) se recalcule après une courte pause, hors du chemin du traceur ;
  // le tampon pretraité est mémorisé dans io, le tracé qui suit ne le recalcule pas.
  const clePre = JSON.stringify([t.pretraitement ?? null, t.detourer, t.tolerance, t.portee]);
  useEffect(() => {
    if (!source || !t.pretraitement) { poserApercu(null); return; }
    let vivant = true;
    const id = setTimeout(() => { void pause().then(() => { if (vivant) poserApercu(apercuPretraite(source.image, t)); }); }, PAUSE_APERCU);
    return () => { vivant = false; clearTimeout(id); };
  }, [source, clePre]);

  // Mesurer l'effet du prétraitement : le même tracé sans lui, ajouté aux essais (il ne remplace pas le résultat affiché).
  const mesurerSans = useCallback(() => {
    if (!source) return;
    const sans = sansPretraitement(t), mien = ++jeton.current;
    poserEnCours(true);
    void (async () => {
      await pause();
      const r = await traiterImage(source.image, sans);
      if (mien !== jeton.current) return;
      poserEnCours(false);
      if ('erreur' in r) { dire(r.erreur); return; }
      const cle = cleTraitement(sans);
      poserEssais(es => [{ id: mien, traitement: sans, resultat: r }, ...es.filter(e => cleTraitement(e.traitement) !== cle)].slice(0, ESSAIS_MAX));
      dire('Essai sans prétraitement ajouté : ' + resumeConversion(r) + '.');
    })();
  }, [source, t]);

  const deposerUne = (f: File | undefined) => {
    if (!f) return;
    void lireSource(f).then(r => {
      if ('erreur' in r) { dire(r.erreur); return; }
      jeton.current++;
      poserSource({ nom: sansExtension(f.name), image: r, original: apercuDetoure(r, { detourer: false, tolerance: TOLERANCE_DEFAUT, portee: 'bord' }) });
      poserResultat(null);
      poserEssais([]);
      poserEnCours(false);
      dire(r.largeur + ' × ' + r.hauteur + ' px.' + (auto ? ' Vectorisation automatique dans un instant.' : ' Réglez, puis « Vectoriser ».'));
    });
  };
  // Une image : le circuit d'avant, inchangé. Plusieurs : la première s'ouvre dans l'atelier (pour régler), et
  // le lot les convertit toutes avec les réglages du moment.
  const deposer = (fichiers: FileList | File[] | null | undefined) => {
    const liste = Array.from(fichiers ?? []);
    poserFichiersLot(liste.length > 1 ? liste : []);
    deposerUne(liste[0]);
  };
  const glisser = (e: DragEvent<HTMLElement>) => { e.preventDefault(); poserSurvol(false); deposer(e.dataTransfer.files); };
  const vecteurs = t.vecteurs;

  return (
    <section className="vectoriser" aria-label="Convertir une image en SVG">
      <h2 className="sr-only">Convertir une image en SVG</h2>
      <div className={'depot petit' + (survol ? ' survol' : '')} onDragOver={e => { e.preventDefault(); poserSurvol(true); }} onDragLeave={() => poserSurvol(false)} onDrop={glisser}>
        {source ? null : <ApercuConversion />}
        {source ? <img className="miniature" src={source.original} alt={'Image déposée : ' + source.nom} /> : null}
        <p>{source ? source.nom + ' · ' + source.image.largeur + ' × ' + source.image.hauteur + ' px' : 'Déposez un PNG, un JPG, un GIF ou un WebP, ou'}</p>
        <button type="button" className={source ? 'discret' : 'primaire'} onClick={() => entree.current?.click()}>{source ? 'Changer d’image…' : 'Choisir une image…'}</button>
        <input ref={entree} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={e => { deposer(e.target.files); e.target.value = ''; }} />
      </div>
      {source ? (
        <div className="reglages-image">
          <fieldset className="editeur-groupe">
            <legend>Fond</legend>
            <label className="case"><input type="checkbox" checked={t.detourer} onChange={e => poserT({ ...t, detourer: e.target.checked })} /> Détourer le fond</label>
            {t.detourer ? (
              <>
                <label className="champ-ligne"><span>Tolérance</span>
                  <select value={String(t.tolerance)} onChange={e => poserT({ ...t, tolerance: Number(e.target.value) })}>
                    {TOLERANCES.map(([v, l]) => <option key={v} value={String(v)}>{l}</option>)}
                  </select>
                </label>
                <label className="case" title="Rend transparente la couleur de fond partout, y compris à l’intérieur des formes : l’œil d’une lettre, un aplat de la même couleur">
                  <input type="checkbox" checked={t.portee === 'partout'} onChange={e => poserT({ ...t, portee: e.target.checked ? 'partout' : 'bord' })} /> Sur toute l’image : transparence complète de cette couleur
                </label>
                <p className="aide">{t.portee === 'partout' ? 'Chaque pixel de la couleur du bord s’efface, où qu’il soit.' : 'Seuls les pixels reliés au bord s’effacent ; un blanc enfermé dans une forme reste.'}</p>
              </>
            ) : null}
          </fieldset>
          <fieldset className="editeur-groupe">
            <legend>Forme</legend>
            <div className="mini-onglets" role="group" aria-label="Forme du résultat">
              <button type="button" aria-pressed={Boolean(vecteurs)} onClick={() => poserT({ ...t, vecteurs: vecteurs ?? TRAITEMENT_DEFAUT.vecteurs })}>Vecteurs (SVG)</button>
              <button type="button" aria-pressed={!vecteurs} onClick={() => poserT({ ...t, vecteurs: null })}>Image enveloppée</button>
            </div>
            <p className="aide">{vecteurs ? 'Des formes vectorielles, nettes à toute taille, que l’éditeur sait reprendre. Un dessin plat s’y prête ; une photo non.' : 'L’image détourée, gardée telle quelle dans un SVG : fidèle au pixel, mais l’éditeur ne la retouche pas.'}</p>
          </fieldset>
        </div>
      ) : message ? <p className="aide" role="status">{message}</p> : null}
      {fichiersLot.length > 1 ? <LotImages fichiers={fichiersLot} traitement={t} ouvrir={ouvrir} fermer={() => poserFichiersLot([])} /> : null}
      {source ? (
        <AtelierResultat nom={source.nom} source={source.image} original={source.original} t={t} poserT={poserT} resultat={resultat} essais={essais}
          auto={auto} poserAuto={poserAuto} enCours={enCours} message={message} ouvrir={ouvrir} apercu={apercu} mesurerSans={mesurerSans}
          rejouer={() => { void lancer(source.image, t); }}
          reprendre={e => { poserT(e.traitement); poserResultat(e.resultat); dire('Réglages de l’essai repris.'); }} />
      ) : null}
    </section>
  );
}

// Les reglages de pretraitement de l'atelier (ADR-0005 prolonge) : une section repliable de la colonne de
// droite. Comme les reglages fins, un curseur n'est « modifie » que s'il differe de la valeur neutre, et
// chacun se retire d'un clic. Les prereglages posent plusieurs reglages d'un coup, qui se lisent ensuite comme
// des valeurs touchees. Sous les curseurs : ce que le pretraitement a fait (les couleurs avant et apres,
// la taille lue par le traceur) et son effet sur le trace, mesure contre l'essai sans pretraitement.

import {
  PARAMETRES_PRETRAITEMENT, poserPre, PRESETS_PRETRAITEMENT, resumePretraitement,
  type ClePretraitement, type Force, type ParametrePre, type ReglagesPretraitement
} from '../engine/pretraitement.js';
import { sansPretraitement, type Traitement } from '../engine/vectorisation.js';
import type { ApercuPretraite, ImageConvertie } from '../io/image.js';
import { Section } from './commun/Section.js';
import { Icone } from './icones.js';

const nombre = (n: number): string => n.toLocaleString('fr-FR');
const ko = (svg: string): string => Math.max(1, Math.round(svg.length / 1024)) + ' Ko';
const arrondi = (v: number): number => Math.round(v * 100) / 100;

interface Proprietes {
  t: Traitement;
  poserT: (t: Traitement) => void;
  /** L'image prétraitée telle que le traceur la lira (null tant que rien n'est touché ou calculé). */
  apercu: ApercuPretraite | null;
  resultat: ImageConvertie | null;
  /** Le résultat du même traitement sans prétraitement, quand un essai le donne. */
  reference: ImageConvertie | undefined;
  mesurer: () => void;
  enCours: boolean;
}

/** Un curseur : l'étiquette, la valeur, une marque quand elle est touchée, le retour d'un clic. */
function Curseur({ p, valeur, pose, retirer }: { p: ParametrePre; valeur: number | undefined; pose: (v: number) => void; retirer: () => void }) {
  const touche = valeur !== undefined;
  const v = valeur ?? p.neutre;
  return (
    <label className={'fin' + (touche ? ' touche' : '')} title={p.aide}>
      <span className="fin-libelle">{p.libelle}</span>
      <input type="range" min={p.min} max={p.max} step={p.pas} value={v} aria-label={p.libelle} onChange={e => pose(Number(e.target.value))} />
      <output>{arrondi(v)}</output>
      <button type="button" className="icone-bouton petit" disabled={!touche} title={'Retirer le réglage « ' + p.libelle + ' »'} aria-label={'Retirer le réglage « ' + p.libelle + ' »'}
        onClick={retirer}><Icone nom="annuler" taille={12} /></button>
    </label>
  );
}

function Bilan({ apercu, resultat, reference, mesurer, enCours, actif }: Pick<Proprietes, 'apercu' | 'resultat' | 'reference' | 'mesurer' | 'enCours'> & { actif: boolean }) {
  if (!actif) return <p className="aide">Rien n’est modifié : l’image part au traceur telle quelle.</p>;
  const pret = resultat?.pretraite;
  return (
    <div className="bilan-pretraitement">
      {apercu ? (
        <p className="aide" role="status">
          {apercu.etapes.length ? 'Après prétraitement : ' : 'Image lue : '}
          <strong>{nombre(apercu.couleurs)} couleur{apercu.couleurs > 1 ? 's' : ''}</strong> (avant : {nombre(apercu.couleursAvant)}) · {apercu.largeur} × {apercu.hauteur} px.
        </p>
      ) : <p className="aide" role="status">Calcul de l’aperçu…</p>}
      {pret && resultat ? (
        <p className="aide">
          Tracé : {resultat.traces !== null ? resultat.traces + ' tracé' + (resultat.traces > 1 ? 's' : '') + ' · ' : ''}{ko(resultat.svg)}
          {reference ? ' (sans prétraitement : ' + (reference.traces !== null ? reference.traces + ' tracé' + (reference.traces > 1 ? 's' : '') + ' · ' : '') + ko(reference.svg) + ')' : ''}
        </p>
      ) : null}
      {resultat && !reference ? (
        <button type="button" className="discret" disabled={enCours} onClick={mesurer} title="Trace aussi l’image sans prétraitement, et l’ajoute aux essais pour comparer">Comparer à l’image sans prétraitement</button>
      ) : null}
    </div>
  );
}

export function ReglagesPretraitementPanneau({ t, poserT, apercu, resultat, reference, mesurer, enCours }: Proprietes) {
  const pre = t.pretraitement;
  const fixer = (r: ReglagesPretraitement | undefined) => {
    poserT(r ? { ...t, pretraitement: r } : sansPretraitement(t));
  };
  const poser = <K extends ClePretraitement>(cle: K, valeur: ReglagesPretraitement[K] | undefined) => fixer(poserPre(pre, cle, valeur));
  const touches = Object.keys(pre ?? {}).length;
  const param = (pid: ParametrePre['id']): ParametrePre => PARAMETRES_PRETRAITEMENT.find(p => p.id === pid) ?? PARAMETRES_PRETRAITEMENT[0] as ParametrePre;
  const force = (cle: 'debruitage' | 'nettete' | 'lissage') => (
    <Curseur p={param(cle)} valeur={pre?.[cle]} pose={v => poser(cle, v === 0 ? undefined : (Math.min(3, Math.max(1, v)) as Force))} retirer={() => poser(cle, undefined)} />
  );
  const couleurs = param('couleurs');
  return (
    <Section titre="Prétraitement" note={touches ? touches + ' modifié' + (touches > 1 ? 's' : '') : undefined}>
      <div className="reglages-pretraitement">
        <div className="mini-onglets" role="group" aria-label="Préréglages de prétraitement">
          {PRESETS_PRETRAITEMENT.map(p => (
            <button key={p.id} type="button" title={p.aide} aria-pressed={resumePretraitement(pre) === resumePretraitement(p.reglages)} onClick={() => fixer(p.reglages)}>{p.libelle}</button>
          ))}
        </div>
        <label className="case" title="Les pixels à moitié transparents d’un PNG anticrénelé laissent un liseré autour des formes : on les aplatit contre le fond">
          <input type="checkbox" checked={pre?.alpha === true} onChange={e => poser('alpha', e.target.checked ? true : undefined)} /> Aplatir les bords translucides
        </label>
        {force('debruitage')}
        <label className="case" title="Pour une petite image : le traceur place mieux ses courbes avec deux fois plus de pixels. Le SVG garde la taille de l’image d’origine.">
          <input type="checkbox" checked={pre?.agrandir === true} onChange={e => poser('agrandir', e.target.checked ? true : undefined)} /> Agrandir ×2 avant le tracé
        </label>
        {force('nettete')}
        <Curseur p={param('gamma')} valeur={pre?.gamma} pose={v => poser('gamma', v)} retirer={() => poser('gamma', undefined)} />
        <label className="case" title={couleurs.aide}>
          <input type="checkbox" checked={pre?.couleurs !== undefined} onChange={e => poser('couleurs', e.target.checked ? couleurs.neutre : undefined)} /> Réduire le nombre de couleurs
        </label>
        {pre?.couleurs !== undefined ? (
          <>
            <Curseur p={couleurs} valeur={pre.couleurs} pose={v => poser('couleurs', v)} retirer={() => poser('couleurs', undefined)} />
            <label className="case" title="La couleur du pourtour (ou le blanc) reste exactement elle-même, et compte parmi les N couleurs">
              <input type="checkbox" checked={pre.garderFond === true} onChange={e => poser('garderFond', e.target.checked ? true : undefined)} /> Garder le blanc / le fond
            </label>
          </>
        ) : null}
        {force('lissage')}
        <Bilan apercu={apercu} resultat={resultat} reference={reference} mesurer={mesurer} enCours={enCours} actif={touches > 0} />
        <button type="button" className="discret" disabled={!touches} onClick={() => fixer(undefined)}>Retirer tout le prétraitement</button>
      </div>
    </Section>
  );
}

/** Le prétraitement d'un essai en une ligne, ou rien. */
export const lignePretraitement = (t: Traitement): string => resumePretraitement(t.pretraitement);

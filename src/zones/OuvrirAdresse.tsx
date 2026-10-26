// « Ouvrir depuis une adresse » (ADR-0036) : un champ, un bouton « Ouvrir », l'etat « Téléchargement… » annulable, et les erreurs
// dites. Le champ vit dans les voies « Ouvrir un SVG ou un PDF » et « Convertir une image », et dans l'editeur (menu Fichier →
// « Insérer depuis une adresse… », InsererAdresse.tsx). Le type se decide sur les octets recus (engine/natureOctets.ts) : une image
// ouvre le convertisseur, un SVG ou un PDF l'editeur, quelle que soit la voie ou l'on a tape l'adresse.
//
// Rien ne part avant le geste (ADR-0025) : taper l'adresse n'envoie rien ; « Ouvrir » (ou Entree), un lien depose sur la zone de
// depot, ou une adresse collee seule dans la zone de code la demandent. Le champ n'existe que si l'hote a pose une ouverture par
// adresse (io/adresse.ts) : la page autonome et le site PHP, pas l'embarquement.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import { estAdresseSeule, nomDepuisAdresse, validerAdresse } from '../model/adresse.js';
import { estImage, natureDesOctets, TYPES_IMAGE, type NatureImage, type NatureOctets } from '../engine/natureOctets.js';
import { ouvertureAdresse, telechargerAdresse } from '../io/adresse.js';
import type { TonMessage } from './commun/Message.js';
import type { Voie } from './publics.js';
// Sous un autre nom : `t` est ici le telechargement (`ChampAdresse({ t })`, une propriete que d'autres fichiers passent).
import { t as traduire } from '../util/i18n.js';

/** Vrai quand l'hote a pose une ouverture par adresse (la page autonome, le site) : sans elle, ni champ, ni collage, ni lien depose. */
export const adressesPermises = (): boolean => ouvertureAdresse() !== null;

/** Un fichier recu d'une adresse, reconnu sur ses octets : son nom (tire de l'adresse), sa nature, ses octets. */
export interface Recu { readonly nom: string; readonly nature: NatureOctets; readonly octets: Uint8Array }

export type Dire = (texte: string, ton?: TonMessage) => void;

// Les phrases des refus se traduisent au moment du refus ; les constantes, evaluees au chargement, sont leurs cles en francais.
const phraseHtml = (): string => traduire('Cette adresse renvoie une page web, pas un fichier : ouvrez-la dans un onglet pour trouver le lien du fichier lui-même (ou la page d’erreur qu’elle affiche).');
const phraseInconnue = (): string => traduire('Ce fichier n’est ni un SVG, ni un PDF, ni une image PNG, JPEG, GIF, WebP ou BMP : il ne s’ouvre pas ici.');
export const PHRASE_HTML = phraseHtml();
export const PHRASE_INCONNUE = phraseInconnue();

/** Reconnait des octets recus ; rend le fichier a ouvrir, ou la phrase du refus. */
export function reconnaitre(nom: string, octets: Uint8Array): Recu | { readonly erreur: string } {
  const n = natureDesOctets(octets);
  if (n === 'html') return { erreur: phraseHtml() };
  if (n === 'vide') return { erreur: traduire('Le serveur a renvoyé un fichier vide.') };
  if (n === 'inconnue') return { erreur: phraseInconnue() };
  return { nom, nature: n, octets };
}

/** Le texte d'un SVG recu, decode comme `File.text()` le fait pour un fichier depose (UTF-8, marque d'ordre des octets retiree). */
export const texteDuSvg = (o: Uint8Array): string => new TextDecoder('utf-8').decode(o);

/** Une image recue en fichier, pour la voie « Convertir une image », qui la lit comme une image deposee. */
export const fichierImage = (r: Recu): File => {
  const nature = r.nature as NatureImage;
  return new File([r.octets as BlobPart], r.nom + '.' + (nature === 'jpeg' ? 'jpg' : nature), { type: TYPES_IMAGE[nature] });
};

/** L'adresse d'un lien glisse sur la page (`text/uri-list`, ou un texte qui n'est qu'une adresse), ou null. */
export function adresseDeposee(d: Pick<DataTransfer, 'getData'>): string | null {
  const liste = d.getData('text/uri-list').split(/\r?\n/).map(l => l.trim()).find(l => l && !l.startsWith('#'));
  if (liste && estAdresseSeule(liste)) return liste;
  const texte = d.getData('text/plain').trim();
  return estAdresseSeule(texte) ? texte : null;
}

export interface Telecharger {
  readonly valeur: string;
  readonly poserValeur: (v: string) => void;
  /** L'hote en cours de telechargement, ou null. */
  readonly enCours: string | null;
  /** Lance le telechargement de l'adresse du champ, ou de `texte` (un lien depose, une adresse collee), qui remplit alors le champ. */
  readonly lancer: (texte?: string) => void;
  readonly annuler: () => void;
}

/** Le telechargement d'une adresse : valider, demander, reconnaitre, puis remettre le fichier a `recevoir`. Un seul a la fois. */
export function useTelechargement(recevoir: (r: Recu) => void, dire: Dire): Telecharger {
  const [valeur, poserValeur] = useState('');
  const [enCours, poserEnCours] = useState<string | null>(null);
  const courant = useRef<AbortController | null>(null);
  const suite = useRef({ recevoir, dire });
  suite.current = { recevoir, dire };
  // Quitter la voie (ou l'editeur) pendant un telechargement l'arrete : ses octets n'arriveraient nulle part.
  useEffect(() => () => courant.current?.abort(), []);

  const lancer = useCallback((texte?: string) => {
    const o = ouvertureAdresse();
    if (!o) return;
    const brut = texte ?? valeur;
    if (texte !== undefined) poserValeur(texte);
    const v = validerAdresse(brut, { http: o.http === true });
    if ('erreur' in v) { suite.current.dire(v.erreur); return; }
    courant.current?.abort();
    const ctl = new AbortController();
    courant.current = ctl;
    poserEnCours(v.hote);
    suite.current.dire('');
    void telechargerAdresse(v.url, ctl.signal).then(r => {
      if (courant.current !== ctl) return;
      courant.current = null;
      poserEnCours(null);
      if ('erreur' in r) { suite.current.dire(r.erreur, r.code === 'annule' ? 'info' : 'alerte'); return; }
      const recu = reconnaitre(nomDepuisAdresse(v.url), r.octets);
      if ('erreur' in recu) { suite.current.dire(recu.erreur); return; }
      suite.current.recevoir(recu);
    });
  }, [valeur]);

  const annuler = useCallback(() => { courant.current?.abort(); }, []);
  return { valeur, poserValeur, enCours, lancer, annuler };
}

/**
 * Le champ « Ouvrir depuis une adresse » : une adresse, « Ouvrir » (une action secondaire : la voie garde la sienne, ADR-0006),
 * et pendant le telechargement, son etat et « Annuler ». `aide` : ce que la voie accepte.
 */
export function ChampAdresse({ t, aide, champ: champDonne }: { t: Telecharger; aide: string; champ?: RefObject<HTMLInputElement | null> }) {
  const id = useId();
  const champPropre = useRef<HTMLInputElement>(null), champ = champDonne ?? champPropre;
  const o = ouvertureAdresse();
  const occupe = t.enCours !== null;
  // « Annuler » disparait a la fin du telechargement : s'il avait le focus, le champ le reprend, plutot que la page entiere. Les
  // deux boutons ont chacun leur cle : reutilise, l'element de « Annuler » deviendrait « Ouvrir » (submit) avant la fin de son
  // propre clic, et le formulaire repartirait.
  const avaitFocus = useRef(false);
  useEffect(() => {
    if (!occupe && avaitFocus.current) { avaitFocus.current = false; champ.current?.focus(); }
  }, [occupe]);
  if (!o) return null;
  const envoyer = (e: FormEvent) => { e.preventDefault(); if (!occupe) t.lancer(); };
  return (
    <form className="adresse" noValidate onSubmit={envoyer} aria-busy={occupe}>
      <label htmlFor={id + '-champ'}>{traduire('Ouvrir depuis une adresse')}</label>
      <div className="adresse-ligne">
        <input id={id + '-champ'} ref={champ} type="url" inputMode="url" autoComplete="url" spellCheck={false} placeholder="https://…"
          value={t.valeur} readOnly={occupe} aria-describedby={id + '-aide'} onChange={e => t.poserValeur(e.target.value)} />
        {occupe
          ? <button key="annuler" type="button" onFocus={() => { avaitFocus.current = true; }} onBlur={e => { if (e.relatedTarget) avaitFocus.current = false; }} onClick={t.annuler}>{traduire('Annuler')}</button>
          : <button key="ouvrir" type="submit">{traduire('Ouvrir')}</button>}
      </div>
      <p id={id + '-aide'} className="aide">{aide} {o.qui}</p>
      <p className="aide adresse-etat" role="status">{occupe ? traduire('Téléchargement depuis {hote}…', { hote: t.enCours ?? '' }) : ''}</p>

    </form>
  );
}

/** Un fichier recu, numerote : la meme adresse ouverte deux fois arrive deux fois. */
export interface Arrivee { readonly recu: Recu; readonly n: number }

/**
 * La reception partagee par les voies : une image va au convertisseur, un SVG ou un PDF a la voie d'ouverture, et la voie qui le
 * recoit passe au premier plan. Chaque voie lit son arrivee par `useArrivee`.
 */
export interface Reception {
  readonly recevoir: (r: Recu) => void;
  readonly documentRecu: Arrivee | null;
  readonly imageRecue: Arrivee | null;
}

export function useReception(poserVoie: (v: Voie) => void): Reception {
  const [documentRecu, poserDocument] = useState<Arrivee | null>(null);
  const [imageRecue, poserImage] = useState<Arrivee | null>(null);
  const compte = useRef(0);
  const recevoir = useCallback((r: Recu) => {
    const a = { recu: r, n: ++compte.current };
    if (estImage(r.nature)) { poserImage(a); poserVoie('image'); } else { poserDocument(a); poserVoie('svg'); }
  }, [poserVoie]);
  return useMemo(() => ({ recevoir, documentRecu, imageRecue }), [recevoir, documentRecu, imageRecue]);
}

/** Traite chaque arrivee une seule fois (son numero), avec la fonction du moment. */
export function useArrivee(a: Arrivee | null | undefined, traiter: (r: Recu) => void): void {
  const fonction = useRef(traiter);
  fonction.current = traiter;
  const vu = useRef(0);
  useEffect(() => {
    if (!a || a.n === vu.current) return;
    vu.current = a.n;
    fonction.current(a.recu);
  }, [a]);
}

/**
 * L'adresse dans une voie : le telechargement (remis a la reception partagee), l'arrivee qui revient a cette voie (`arrivee`,
 * traitee par `traiter`), et `lienDepose`, qui lance le telechargement d'un lien glisse sur la zone de depot (vrai s'il y en avait un).
 */
export function useAdresseDeVoie(reception: Reception | undefined, dire: Dire, arrivee: Arrivee | null | undefined, traiter: (r: Recu) => void) {
  const t = useTelechargement(r => reception?.recevoir(r), dire);
  useArrivee(arrivee, traiter);
  const lienDepose = (d: Pick<DataTransfer, 'getData'>): boolean => {
    const lien = reception && adressesPermises() ? adresseDeposee(d) : null;
    if (lien) t.lancer(lien);
    return lien !== null;
  };
  return { t, lienDepose };
}

// La bibliotheque de formes dans la page : chargee a la demande, cherchee par nom et par
// evenement, et chaque forme s'ouvre dans l'editeur. Le meme composant de recherche sert dans
// l'editeur, pour inserer une forme dans le dessin en cours.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { appliquerCorrections, chercher, lireCorrections, type Correction, type Corrections, type EntreeBibliotheque, type Evenement, type FamilleEvenement } from '../model/bibliotheque.js';
import { chargerBibliotheque, type Bibliotheque } from '../io/bibliotheque.js';
import { proposer, texteOctets } from '../io/fichiers.js';
import { useStockage } from './contexteStockage.js';
import { Icone } from './icones.js';

// Les corrections ne se gardent que si la page donne un stockage ; sans lui, elles vivent le temps de la page.
const CLE_CORRECTIONS = 'svg.corrections';

export const enImage = (svg: string): string => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

const FAMILLES: ReadonlyArray<readonly [FamilleEvenement, string]> = [['calendrier', 'Calendrier'], ['vie', 'Événements de la vie'], ['categorie', 'Catégories']];
const MOIS = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Le selecteur d'evenement, par famille, les mois du calendrier dans l'ordre. */
function ChoixEvenement({ evenements, valeur, poser }: { evenements: readonly Evenement[]; valeur: string | null; poser: (v: string | null) => void }) {
  return (
    <select aria-label="Événement" value={valeur ?? ''} onChange={e => poser(e.target.value || null)}>
      <option value="">Tous les événements</option>
      {FAMILLES.map(([f, nom]) => (
        <optgroup key={f} label={nom}>
          {evenements.filter(ev => ev.famille === f).map(ev => <option key={ev.id} value={ev.id}>{ev.nom}{ev.mois ? ' · ' + MOIS[ev.mois] : ''}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/** Charge la bibliotheque au premier rendu ; rend ce qu'il y a a montrer en attendant. */
export function useBibliotheque(): { bibliotheque: Bibliotheque | null; erreur: string } {
  const [bibliotheque, poser] = useState<Bibliotheque | null>(null);
  const [erreur, poserErreur] = useState('');
  useEffect(() => {
    let vivant = true;
    chargerBibliotheque().then(b => { if (vivant) poser(b); }).catch((e: unknown) => { if (vivant) poserErreur(e instanceof Error ? e.message : String(e)); });
    return () => { vivant = false; };
  }, []);
  return { bibliotheque, erreur };
}

interface ProprietesRecherche {
  bibliotheque: Bibliotheque;
  choisir: (e: EntreeBibliotheque) => void;
  /** Un second geste par vignette : mettre dans un panier. */
  ajouter?: (e: EntreeBibliotheque) => void;
  /** Permettre de corriger le nom et le classement d'une forme (la page, pas l'editeur). */
  corriger?: boolean;
  parPage?: number;
  compact?: boolean;
}

/** La recherche et la grille : `choisir` recoit la forme cliquee. */
export function RechercheFormes({ bibliotheque, choisir, ajouter, corriger = false, parPage = 48, compact = false }: ProprietesRecherche) {
  const [texte, poserTexte] = useState('');
  const [evenement, poserEvenement] = useState<string | null>(null);
  const [page, poserPage] = useState(1);
  const stockage = useStockage();
  const [corrections, poserCorrections] = useState<Corrections>(() => (corriger ? lireCorrections(stockage?.lire<unknown>(CLE_CORRECTIONS)) : {}));
  const [enEdition, poserEnEdition] = useState<string | null>(null);
  const entrees = useMemo(() => (Object.keys(corrections).length ? appliquerCorrections(bibliotheque.entrees, corrections) : bibliotheque.entrees), [bibliotheque, corrections]);
  const resultats = useMemo(() => chercher(entrees, texte, evenement), [entrees, texte, evenement]);
  const montres = resultats.slice(0, page * parPage);
  const poserCorrection = (id: string, c: Correction) => { const n = { ...corrections, [id]: c }; poserCorrections(n); stockage?.ecrire(CLE_CORRECTIONS, n); };
  const nCorrections = Object.keys(corrections).length;
  return (
    <div className={'recherche-formes' + (compact ? ' compact' : '')}>
      <div className="filtres">
        <input type="search" aria-label="Chercher une forme" placeholder="Chercher : sapin, lapin, guitare…" value={texte} onChange={e => { poserTexte(e.target.value); poserPage(1); }} />
        <ChoixEvenement evenements={bibliotheque.evenements} valeur={evenement} poser={v => { poserEvenement(v); poserPage(1); }} />
      </div>
      <p className="aide" aria-live="polite">{resultats.length} forme{resultats.length > 1 ? 's' : ''}{resultats.length !== entrees.length ? ' sur ' + entrees.length : ''}
        {corriger && nCorrections ? <> · {nCorrections} correction{nCorrections > 1 ? 's' : ''} <button type="button" className="discret" onClick={() => { void proposer('corrections.json', texteOctets(JSON.stringify(corrections, null, 1))).then(() => undefined); }}>Exporter les corrections</button></> : null}
      </p>
      <ul className="grille-formes">
        {montres.map(x => (
          <li key={x.id} className={enEdition === x.id ? 'en-edition' : undefined}>
            <button type="button" className="vignette" title={x.nom + ' (' + x.id + ')'} onClick={() => choisir(x)}>
              <img src={enImage(x.svg)} alt="" loading="lazy" width={64} height={64} />
              <span>{x.nom}</span>
            </button>
            {ajouter ? <button type="button" className="icone-bouton plus" title={'Mettre « ' + x.nom + ' » dans le panier'} aria-label={'Mettre ' + x.nom + ' dans le panier'} onClick={() => ajouter(x)}><Icone nom="ajouter" taille={14} /></button> : null}
            {corriger ? <button type="button" className="icone-bouton plus" title={'Corriger « ' + x.nom + ' »'} aria-label={'Corriger ' + x.nom} onClick={() => poserEnEdition(enEdition === x.id ? null : x.id)}><Icone nom="texte" taille={14} /></button> : null}
            {corriger && enEdition === x.id ? <Correcteur entree={x} evenements={bibliotheque.evenements} poser={c => { poserCorrection(x.id, c); poserEnEdition(null); }} fermer={() => poserEnEdition(null)} /> : null}
          </li>
        ))}
      </ul>
      {montres.length < resultats.length ? <button type="button" className="discret" onClick={() => poserPage(p => p + 1)}>Afficher {Math.min(parPage, resultats.length - montres.length)} de plus</button> : null}
    </div>
  );
}

/** Corriger une forme : son nom, ses evenements ; la correction reste dans ce navigateur et s'exporte en JSON. */
function Correcteur({ entree, evenements, poser, fermer }: { entree: EntreeBibliotheque; evenements: readonly Evenement[]; poser: (c: Correction) => void; fermer: () => void }) {
  const [nom, poserNom] = useState(entree.nom);
  const [choisis, poserChoisis] = useState<string[]>([...entree.evenements]);
  return (
    <div className="correcteur" role="dialog" aria-label={'Corriger ' + entree.id}>
      <label className="champ-ligne"><span>Nom</span><input type="text" value={nom} onChange={e => poserNom(e.target.value)} /></label>
      <div className="cases-evenements">
        {evenements.map(ev => (
          <label key={ev.id} className="case"><input type="checkbox" checked={choisis.includes(ev.id)} onChange={e => poserChoisis(c => (e.target.checked ? [...c, ev.id] : c.filter(x => x !== ev.id)))} /> {ev.nom}</label>
        ))}
      </div>
      <div className="boutons">
        <button type="button" onClick={() => poser({ nom, evenements: choisis })}>Garder la correction</button>
        <button type="button" className="discret" onClick={fermer}>Annuler</button>
      </div>
      <p className="aide">Identifiant : {entree.id}. « Exporter les corrections » donne le fichier à poser dans bibliotheque/corrections.json.</p>
    </div>
  );
}

/** La section de la page : chargement, recherche, et l'ouverture d'une forme dans l'editeur. */
export function SectionBibliotheque({ ouvrir, enfants }: { ouvrir: (e: EntreeBibliotheque) => void; enfants?: ReactNode }) {
  const [voulue, vouloir] = useState(false);
  return (
    <section className="bibliotheque" aria-label="Bibliothèque de formes">
      <h2 className="sr-only">Bibliothèque de formes</h2>
      <p className="aide">Plus de 4 000 silhouettes nommées en français et classées par événement du calendrier (Noël, Pâques, Halloween…), par événement de la vie (naissance, anniversaire, concert…) et par catégorie (personnage, bâtiment, animal…). Une forme s’ouvre dans l’éditeur, où elle se recolore et se retouche. Source : game-icons.net, licence CC BY 3.0.</p>
      {voulue ? <Chargee ouvrir={ouvrir} /> : <button type="button" className="primaire" onClick={() => vouloir(true)}>Charger la bibliothèque (environ 7 Mo)</button>}
      {enfants}
    </section>
  );
}

function Chargee({ ouvrir }: { ouvrir: (e: EntreeBibliotheque) => void }) {
  const { bibliotheque, erreur } = useBibliotheque();
  if (erreur) return <p className="message" role="alert">{erreur}</p>;
  if (!bibliotheque) return <p className="aide" role="status">Chargement de la bibliothèque…</p>;
  return <RechercheFormes bibliotheque={bibliotheque} choisir={ouvrir} corriger />;
}

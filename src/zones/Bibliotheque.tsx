// La bibliotheque de formes dans la page : chargee a la demande, cherchee par nom et par
// evenement, et chaque forme s'ouvre dans l'editeur. Le meme composant de recherche sert dans
// l'editeur, pour inserer une forme dans le dessin en cours.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { chercher, type EntreeBibliotheque, type Evenement, type FamilleEvenement } from '../model/bibliotheque.js';
import { chargerBibliotheque, type Bibliotheque } from '../io/bibliotheque.js';

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

/** La recherche et la grille : `choisir` recoit la forme cliquee. */
export function RechercheFormes({ bibliotheque, choisir, parPage = 48, compact = false }: { bibliotheque: Bibliotheque; choisir: (e: EntreeBibliotheque) => void; parPage?: number; compact?: boolean }) {
  const [texte, poserTexte] = useState('');
  const [evenement, poserEvenement] = useState<string | null>(null);
  const [page, poserPage] = useState(1);
  const resultats = useMemo(() => chercher(bibliotheque.entrees, texte, evenement), [bibliotheque, texte, evenement]);
  const montres = resultats.slice(0, page * parPage);
  return (
    <div className={'recherche-formes' + (compact ? ' compact' : '')}>
      <div className="filtres">
        <input type="search" aria-label="Chercher une forme" placeholder="Chercher : sapin, lapin, guitare…" value={texte} onChange={e => { poserTexte(e.target.value); poserPage(1); }} />
        <ChoixEvenement evenements={bibliotheque.evenements} valeur={evenement} poser={v => { poserEvenement(v); poserPage(1); }} />
      </div>
      <p className="aide" aria-live="polite">{resultats.length} forme{resultats.length > 1 ? 's' : ''}{resultats.length !== bibliotheque.entrees.length ? ' sur ' + bibliotheque.entrees.length : ''}</p>
      <ul className="grille-formes">
        {montres.map(x => (
          <li key={x.id}>
            <button type="button" className="vignette" title={x.nom + ' (' + x.id + ')'} onClick={() => choisir(x)}>
              <img src={enImage(x.svg)} alt="" loading="lazy" width={64} height={64} />
              <span>{x.nom}</span>
            </button>
          </li>
        ))}
      </ul>
      {montres.length < resultats.length ? <button type="button" className="discret" onClick={() => poserPage(p => p + 1)}>Afficher {Math.min(parPage, resultats.length - montres.length)} de plus</button> : null}
    </div>
  );
}

/** La section de la page : chargement, recherche, et l'ouverture d'une forme dans l'editeur. */
export function SectionBibliotheque({ ouvrir, enfants }: { ouvrir: (e: EntreeBibliotheque) => void; enfants?: ReactNode }) {
  const [voulue, vouloir] = useState(false);
  return (
    <section className="bibliotheque" aria-label="Bibliothèque de formes">
      <h2>Bibliothèque de formes</h2>
      <p className="aide">Plus de 4 000 silhouettes nommées en français et classées par événement du calendrier (Noël, Pâques, Halloween…), par événement de la vie (naissance, anniversaire, concert…) et par catégorie (personnage, bâtiment, animal…). Une forme s’ouvre dans l’éditeur, où elle se recolore et se retouche. Source : game-icons.net, licence CC BY 3.0.</p>
      {voulue ? <Chargee ouvrir={ouvrir} /> : <button type="button" onClick={() => vouloir(true)}>Charger la bibliothèque (environ 7 Mo)</button>}
      {enfants}
    </section>
  );
}

function Chargee({ ouvrir }: { ouvrir: (e: EntreeBibliotheque) => void }) {
  const { bibliotheque, erreur } = useBibliotheque();
  if (erreur) return <p className="message" role="alert">{erreur}</p>;
  if (!bibliotheque) return <p className="aide" role="status">Chargement de la bibliothèque…</p>;
  return <RechercheFormes bibliotheque={bibliotheque} choisir={ouvrir} />;
}

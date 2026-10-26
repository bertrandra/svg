// La bibliotheque de formes dans la page : chargee d'elle-meme quand sa voie s'ouvre (un fichier voisin, aucun serveur), cherchee par nom et par
// evenement, et chaque forme s'ouvre dans l'editeur. Le meme composant de recherche sert dans
// l'editeur, pour inserer une forme dans le dessin en cours. Ce qu'un mot trouve et dans quel ordre
// est du modele (model/recherche.ts) ; ici, le champ, les pastilles, la grille et l'etat vide.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { appliquerCorrections, cleCorrection, lireCorrections, nomAffiche, type Correction, type Corrections, type EntreeBibliotheque, type Evenement } from '../model/bibliotheque.js';
import { cleEntree, filtrerEntrees, natureDeEntree, sourceDeEntree } from '../model/bibliothequeSources.js';
import { SOURCE_PAR_DEFAUT, sourceFormes, type NatureForme } from '../model/sourcesFormes.js';
import type { Procede } from '../model/contextes.js';
import { PastillesFiltre, optionsNatures, optionsSources, useSourcesLibres } from './FiltresBibliotheque.js';
import { evenementsLies, indexer, rechercher, suggestions, type EvenementPropose, type Suggestion } from '../model/recherche.js';
import { EXEMPLES_RECHERCHE } from '../model/synonymes.js';
import { chargerBibliotheque, type Bibliotheque } from '../io/bibliotheque.js';
import { proposer, texteOctets } from '../io/fichiers.js';
import { useStockage } from './contexteStockage.js';
import { Icone } from './icones.js';
import { PastillesEvenements } from './PastillesEvenements.js';
import { insecables, pluriel } from '../util/texte.js';
import { t } from '../util/i18n.js';

// Les corrections ne se gardent que si la page donne un stockage ; sans lui, elles vivent le temps de la page.
const CLE_CORRECTIONS = 'svg.corrections';

export const enImage = (svg: string): string => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

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
  /** Le procede du contexte de production (au stylo, les formes en ligne sont proposees d'abord). */
  procede?: Procede | undefined;
}

/** Le libelle d'une proposition de l'etat vide : une phrase qui se comprend seule, avec ce qu'elle trouvera. */
function libelleSuggestion(s: Suggestion): string {
  if (s.type === 'tous') return t('Chercher dans tous les événements ({n})', { n: s.nombre });
  if (s.type === 'texte') return t('Chercher « {texte} » ({n})', { texte: s.texte, n: s.nombre });
  // Le nom de l'evenement est une donnee du modele : il se traduit a l'affichage (ADR-0042).
  return t('Essayez l’événement {nom} ({n})', { nom: t(s.nom), n: s.nombre });
}

/** Rien ne correspond : le dire, proposer ce qui trouvera quelque chose, et de quoi tout effacer. */
function AucunResultat({ texte, evenement, propositions, appliquer, effacer }: { texte: string; evenement: Evenement | undefined; propositions: readonly Suggestion[]; appliquer: (s: Suggestion) => void; effacer: () => void }) {
  const ou = evenement ? t(' dans l’événement {nom}', { nom: t(evenement.nom) }) : '';
  return (
    // Un etat vide « aucun resultat » (ADR-0019) : ce qui ne repond pas, ce qui repondra, et le geste qui efface.
    <div className="aucun-resultat etat-vide" data-vide="aucun-resultat">
      <p className="aucun-resultat-titre etat-vide-titre">{insecables(texte.trim() ? t('Aucune forme ne correspond à « {texte} »{ou}.', { texte: texte.trim(), ou }) : t('Aucune forme{ou}.', { ou }))}</p>
      {propositions.length ? (
        <ul className="suggestions-recherche" aria-label={t('Suggestions')}>
          {propositions.map(s => <li key={s.type + (s.type === 'evenement' ? s.id : s.type === 'texte' ? s.texte : '')}><button type="button" className="discret" onClick={() => appliquer(s)}>{libelleSuggestion(s)}</button></li>)}
        </ul>
      ) : null}
      <button type="button" onClick={effacer}>{t('Effacer la recherche')}</button>
    </div>
  );
}

/** Ce que la vignette dit de sa source, apres le nom : « Lucide, en ligne », « game-icons ». */
export function sourceDite(e: EntreeBibliotheque): string {
  const s = sourceFormes(sourceDeEntree(e));
  return (s?.nomCourt ?? sourceDeEntree(e)) + (natureDeEntree(e) === 'ligne' ? t(', en ligne') : '');
}

/**
 * La vignette d'une forme : le libelle tient sur deux lignes au plus ; le nom complet suivi de sa source est son nom accessible
 * et son infobulle (deux formes de meme nom viennent de deux sources, la source les distingue).
 */
function Vignette({ entree, choisir }: { entree: EntreeBibliotheque; choisir: (e: EntreeBibliotheque) => void }) {
  // Le nom d'une forme de la bibliotheque ne passe pas par `t` (ADR-0042 §3) : en anglais, les mots de son identifiant (nomAffiche).
  const nom = nomAffiche(entree) + ' (' + sourceDite(entree) + ')';
  return (
    <button type="button" className="vignette" title={nom} aria-label={nom} onClick={() => choisir(entree)}>
      <img src={enImage(entree.svg)} alt="" loading="lazy" width={64} height={64} />
      <span>{nomAffiche(entree)}</span>
    </button>
  );
}

/** La recherche et la grille : `choisir` recoit la forme cliquee. */
export function RechercheFormes({ bibliotheque, choisir, ajouter, corriger = false, parPage = 48, compact = false, procede }: ProprietesRecherche) {
  const [texte, poserTexte] = useState('');
  const [evenement, poserEvenement] = useState<string | null>(null);
  const [page, poserPage] = useState(1);
  // La source par defaut d'abord : les autres ne se chargent que choisies (une pastille, « Toutes », ou une nature qu'elle n'a pas).
  const [source, poserSource] = useState<string | null>(SOURCE_PAR_DEFAUT);
  const [nature, poserNature] = useState<NatureForme | null>(null);
  const sources = useSourcesLibres(source, nature);
  const stockage = useStockage();
  const [corrections, poserCorrections] = useState<Corrections>(() => (corriger ? lireCorrections(stockage?.lire<unknown>(CLE_CORRECTIONS)) : {}));
  const [enEdition, poserEnEdition] = useState<string | null>(null);
  // Le mois se lit ici, une fois : le coeur pur le recoit en parametre et ne lit jamais l'horloge.
  const [mois] = useState(() => new Date().getMonth() + 1);
  const disponibles = useMemo(() => [...bibliotheque.entrees, ...[...sources.chargees.values()].flatMap(c => c.entrees)], [bibliotheque, sources.chargees]);
  const filtrees = useMemo(() => (source === null && nature === null ? disponibles : filtrerEntrees(disponibles, source, nature)), [disponibles, source, nature]);
  const entrees = useMemo(() => (Object.keys(corrections).length ? appliquerCorrections(filtrees, corrections) : filtrees), [filtrees, corrections]);
  const index = useMemo(() => indexer(entrees, bibliotheque.evenements), [entrees, bibliotheque.evenements]);
  const resultats = useMemo(() => rechercher(index, texte, evenement), [index, texte, evenement]);
  const lies: EvenementPropose[] = useMemo(() => (evenement === null ? evenementsLies(index, texte) : []), [index, texte, evenement]);
  const propositions = useMemo(() => (resultats.length ? [] : suggestions(index, texte, evenement, mois)), [index, texte, evenement, mois, resultats.length]);
  const montres = resultats.slice(0, page * parPage);
  const poserCorrection = (cle: string, c: Correction) => { const n = { ...corrections, [cle]: c }; poserCorrections(n); stockage?.ecrire(CLE_CORRECTIONS, n); };
  const nCorrections = Object.keys(corrections).length;
  const filtrer = (id: string | null) => { poserEvenement(id); poserPage(1); };
  // Un filtre ne mene jamais a une grille vide par construction : une source qui n'a pas la nature choisie (Lucide et « Pleines »)
  // remet la nature a « Toutes » ; une nature que la source choisie n'a pas (« En ligne » sur game-icons) elargit aux sources qui l'ont.
  const aLaNature = (id: string | null, n: NatureForme | null) => id === null || n === null || (sourceFormes(id)?.variantes.some(x => x.nature === n) ?? true);
  const choisirSource = (id: string | null) => {
    poserSource(id);
    poserPage(1);
    if (!aLaNature(id, nature)) poserNature(null);
  };
  const choisirNature = (n: string | null) => {
    const v = n === 'plein' || n === 'ligne' ? n : null;
    poserNature(v);
    poserPage(1);
    if (!aLaNature(source, v)) poserSource(null);
  };
  const voirEvenement = (id: string) => { poserTexte(''); filtrer(id); };
  const appliquer = (s: Suggestion) => {
    if (s.type === 'tous') filtrer(null);
    else if (s.type === 'texte') { poserTexte(s.texte); poserPage(1); }
    else voirEvenement(s.id);
  };
  // Apres une proposition ou un effacement, l'etat vide disparait : le focus revient au champ plutot qu'au corps de la page.
  const champ = useRef<HTMLInputElement>(null);
  const reprendre = (geste: () => void) => { geste(); champ.current?.focus(); };
  const choisiEv = evenement === null ? undefined : bibliotheque.evenements.find(ev => ev.id === evenement);
  return (
    <div className={'recherche-formes' + (compact ? ' compact' : '')}>
      <input ref={champ} type="search" aria-label={t('Chercher une forme')} placeholder={t('Chercher : {exemples}…', { exemples: EXEMPLES_RECHERCHE.map(x => t(x)).join(', ') })} value={texte} onChange={e => { poserTexte(e.target.value); poserPage(1); }} />
      <div className="filtres-source">
        <PastillesFiltre libelle={t('Source')} options={optionsSources(new Set([SOURCE_PAR_DEFAUT, ...sources.chargees.keys()]))} valeur={source} poser={choisirSource} />
        <PastillesFiltre libelle={t('Nature')} options={optionsNatures(procede)} valeur={nature} poser={choisirNature} />
      </div>
      <PastillesEvenements evenements={bibliotheque.evenements} valeur={evenement} poser={filtrer} mois={mois} compact={compact} />
      {sources.erreurs.map(m => <p key={m} className="message" role="alert">{m}</p>)}
      <p className="aide" aria-live="polite">{pluriel(resultats.length, 'forme')}{resultats.length !== entrees.length ? t(' sur {total}', { total: entrees.length }) : ''}
        {sources.enCours.length ? t(' · chargement de {sources} (environ {mo} Mo)…', { sources: sources.enCours.map(x => x.nomCourt).join(', '), mo: sources.enCours.reduce((n, x) => n + x.poidsMo, 0) }) : null}
        {corriger && nCorrections ? <> · {pluriel(nCorrections, 'correction')} <button type="button" className="discret" onClick={() => { void proposer('corrections.json', texteOctets(JSON.stringify(corrections, null, 1))).then(() => undefined); }}>{t('Exporter les corrections')}</button></> : null}
      </p>
      {lies.length && resultats.length ? (
        <p className="voir-aussi">{lies.map(l => <button key={l.id} type="button" className="discret" onClick={() => voirEvenement(l.id)}>{t('Voir l’événement {nom} ({n})', { nom: t(l.nom), n: l.nombre })}</button>)}</p>
      ) : null}
      {resultats.length ? (
        <ul className="grille-formes" aria-busy={sources.enCours.length > 0}>
          {montres.map(x => (
            <li key={cleEntree(x)} className={enEdition === cleEntree(x) ? 'en-edition' : undefined}>
              <Vignette entree={x} choisir={choisir} />
              {ajouter ? <button type="button" className="icone-bouton plus" title={t('Mettre « {nom} » dans le panier', { nom: nomAffiche(x) })} aria-label={t('Mettre {nom} dans le panier', { nom: nomAffiche(x) })} onClick={() => ajouter(x)}><Icone nom="ajouter" taille={14} /></button> : null}
              {corriger ? <button type="button" className="icone-bouton plus" title={t('Corriger « {nom} »', { nom: nomAffiche(x) })} aria-label={t('Corriger {nom}', { nom: nomAffiche(x) })} onClick={() => poserEnEdition(enEdition === cleEntree(x) ? null : cleEntree(x))}><Icone nom="texte" taille={14} /></button> : null}
              {corriger && enEdition === cleEntree(x) ? <Correcteur entree={x} evenements={bibliotheque.evenements} poser={c => { poserCorrection(cleCorrection(x), c); poserEnEdition(null); }} fermer={() => poserEnEdition(null)} /> : null}
            </li>
          ))}
        </ul>
      ) : <AucunResultat texte={texte} evenement={choisiEv} propositions={propositions} appliquer={s => reprendre(() => appliquer(s))} effacer={() => reprendre(() => { poserTexte(''); filtrer(null); })} />}
      {montres.length < resultats.length ? <button type="button" className="discret" onClick={() => poserPage(p => p + 1)}>{t('Afficher {n} de plus', { n: Math.min(parPage, resultats.length - montres.length) })}</button> : null}
    </div>
  );
}

/** Corriger une forme : son nom, ses evenements ; la correction reste dans ce navigateur et s'exporte en JSON. */
function Correcteur({ entree, evenements, poser, fermer }: { entree: EntreeBibliotheque; evenements: readonly Evenement[]; poser: (c: Correction) => void; fermer: () => void }) {
  const [nom, poserNom] = useState(entree.nom);
  const [choisis, poserChoisis] = useState<string[]>([...entree.evenements]);
  return (
    <div className="correcteur" role="dialog" aria-label={t('Corriger {nom}', { nom: cleCorrection(entree) })}>
      <label className="champ-ligne"><span>{t('Nom')}</span><input type="text" value={nom} onChange={e => poserNom(e.target.value)} /></label>
      <div className="cases-evenements">
        {evenements.map(ev => (
          <label key={ev.id} className="case"><input type="checkbox" checked={choisis.includes(ev.id)} onChange={e => poserChoisis(c => (e.target.checked ? [...c, ev.id] : c.filter(x => x !== ev.id)))} /> {t(ev.nom)}</label>
        ))}
      </div>
      <div className="boutons">
        <button type="button" onClick={() => poser({ nom, evenements: choisis })}>{t('Garder la correction')}</button>
        <button type="button" className="discret" onClick={fermer}>{t('Annuler')}</button>
      </div>
      <p className="aide">{t('Identifiant : {id}. « Exporter les corrections » donne le fichier à poser dans bibliotheque/corrections.json.', { id: cleCorrection(entree) })}</p>
    </div>
  );
}

/**
 * La section de la page : chargement, recherche, et l'ouverture d'une forme dans l'editeur. La bibliotheque se charge a la
 * premiere ouverture de sa voie (`active`), puis reste : c'est un fichier voisin de la page (bibliotheque.js), lu sans contacter
 * aucun serveur ; ouvrir la voie « Formes » est deja le geste qui la demande, un bouton de plus ne protegeait rien. Les panneaux
 * des voies restent montes : sans `active`, la page chargerait les 7 Mo des son ouverture.
 */
export function SectionBibliotheque({ ouvrir, active = true, enfants }: { ouvrir: (e: EntreeBibliotheque) => void; active?: boolean; enfants?: ReactNode }) {
  const [vue, poserVue] = useState(active);
  useEffect(() => { if (active) poserVue(true); }, [active]);
  return (
    <section className="bibliotheque" aria-label={t('Bibliothèque de formes')}>
      <h2 className="sr-only">{t('Bibliothèque de formes')}</h2>
      <p className="aide">{t('Plus de 4 000 silhouettes nommées en français et classées par événement du calendrier (Noël, Pâques, Halloween…), par événement de la vie (naissance, anniversaire, concert…) et par catégorie (personnage, bâtiment, animal…). Une forme s’ouvre dans l’éditeur, où elle se recolore et se retouche. Source : game-icons.net, licence CC BY 3.0. Cinq autres bibliothèques libres se chargent à la demande (pastilles « Source »), en formes pleines pour la découpe ou en ligne pour le stylo ; leurs licences sont dans « À propos et crédits ».')}</p>
      {vue || active ? <Chargee ouvrir={ouvrir} /> : null}
      {enfants}
    </section>
  );
}

function Chargee({ ouvrir }: { ouvrir: (e: EntreeBibliotheque) => void }) {
  const { bibliotheque, erreur } = useBibliotheque();
  if (erreur) return <p className="message" role="alert">{erreur}</p>;
  if (!bibliotheque) return <p className="aide" role="status">{t('Chargement de la bibliothèque…')}</p>;
  return <RechercheFormes bibliotheque={bibliotheque} choisir={ouvrir} corriger />;
}

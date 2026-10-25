// « Toutes les polices » (ADR-0025) : chercher et filtrer parmi les polices livrees, celles qu'on a deposees et les polices
// libres de l'index, garder ses favoris, retrouver ses recentes, et voir en tete les polices du document, avec « Remplacer
// partout ». Un panneau dans le flux, ouvert au clic (rien d'obligatoire). Aucun apercu ne telecharge quoi que ce soit : le
// nom d'une police non telechargee s'ecrit dans la police de l'interface. La longue liste se fenetre (ADR-0008).

import { useMemo, useRef, useState, type ReactElement } from 'react';
import { CATEGORIES, NOMS_CATEGORIES, filtrerFamilles, trouverVariante, variantePrincipale, type CategoriePolice, type FamilleCatalogue, type VariantePolice } from '../model/cataloguePolices.js';
import { LICENCES_POLICES, SERVEURS_POLICES, SOURCES_POLICES, type IdSourcePolices, type LicencePolice } from '../model/sourcesPolices.js';
import { estPoliceLivree, type IdPoliceLivree, type NaturePolice } from '../model/polices.js';
import { lirePoliceAppareil, policesAppareilDisponibles, policesDeLAppareil, type Police, type PoliceAppareil } from '../io/polices.js';
import { SEUIL_FENETRE, segmentsFenetre } from '../util/fenetre.js';
import { au } from '../util/tableaux.js';
import { pluriel } from '../util/texte.js';
import { montrerLigneAuClavier, useFenetreDefilante } from './Fenetre.js';
import { useActions, useDessin } from './contexteEditeur.js';
import { useTexte } from './contexteTexte.js';
import { nomDePolice, useActionsTexte } from './actionsTexte.js';

/** Les categories des fontes livrees, pour que les filtres les rangent avec les autres. */
const CATEGORIES_LIVREES: Readonly<Record<IdPoliceLivree, CategoriePolice>> = {
  inter: 'lineale', 'inter-gras': 'lineale', oswald: 'affiche', bebas: 'affiche', playfair: 'empattements', lobster: 'manuscrite',
  pacifico: 'manuscrite', caveat: 'manuscrite', fredoka: 'lineale', 'ems-readability': 'autre'
};

/** Le nom court d'une source, pour le badge d'une ligne. */
const COURTS: Readonly<Record<IdSourcePolices, string>> = {
  google: 'Google Fonts', fontsource: 'Fontsource', league: 'League', sil: 'SIL', collletttivo: 'Collletttivo', velvetyne: 'Velvetyne', fontshare: 'Fontshare'
};

type SourceEntree = IdSourcePolices | 'livree' | 'deposee';

/** Une ligne de la liste : une police deja chargee (livree, deposee, telechargee) ou une famille de l'index. */
interface Entree {
  readonly cle: string;
  readonly nom: string;
  readonly source: SourceEntree;
  readonly categorie: CategoriePolice;
  readonly nature: NaturePolice;
  readonly licence?: LicencePolice;
  readonly police?: Police;
  readonly famille?: FamilleCatalogue;
}

/** Un nom en minuscules sans accents, pour chercher « fete » dans « Fête ». */
const sansAccents = (t: string): string => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** La cle d'une famille de l'index, celle que retiennent les favoris. */
export const cleFamille = (f: Pick<FamilleCatalogue, 'depot' | 'id'>): string => f.depot + ':' + f.id;

export interface ProprietesExplorateur {
  readonly id: string;
  readonly polices: readonly Police[];
  /** La police choisie en ce moment (identifiant), cible de « Remplacer partout ». */
  readonly valeur: string;
  readonly poser: (id: string, police?: Police) => void;
}

export function ExplorateurPolices({ id, polices, valeur, poser }: ProprietesExplorateur) {
  const tx = useTexte(), ac = useActions();
  const [texte, poserTexte] = useState('');
  const [categorie, poserCategorie] = useState<CategoriePolice | ''>('');
  const [nature, poserNature] = useState<NaturePolice | ''>('');
  const [source, poserSource] = useState<SourceEntree | ''>('');
  const [enCours, poserEnCours] = useState<string | null>(null);
  const [erreur, poserErreur] = useState('');
  const [note, poserNote] = useState('');
  const { catalogue } = tx;

  // Toutes les entrees : les fontes chargees d'abord (livrees, deposees, telechargees), puis les familles de l'index.
  const entrees = useMemo<Entree[]>(() => {
    const r: Entree[] = [];
    for (const p of polices) {
      if (estPoliceLivree(p.id)) r.push({ cle: p.id, nom: p.nom, source: 'livree', categorie: CATEGORIES_LIVREES[p.id], nature: p.nature, police: p });
      else if (p.id.startsWith('u-')) r.push({ cle: p.id, nom: p.nom, source: 'deposee', categorie: 'autre', nature: p.nature, police: p });
    }
    for (const f of catalogue?.familles ?? []) r.push({ cle: cleFamille(f), nom: f.nom, source: f.source, categorie: f.categorie, nature: 'contour', licence: LICENCES_POLICES[f.licence], famille: f });
    return r;
  }, [polices, catalogue]);

  const filtrees = useMemo(() => {
    const familles = new Set(filtrerFamilles(entrees.flatMap(e => (e.famille ? [e.famille] : [])), { texte, categorie }));
    const mots = sansAccents(texte).split(/\s+/).filter(Boolean);
    const garde = (e: Entree) => (!source || e.source === source) && (!nature || e.nature === nature);
    const chargees = entrees.filter(e => !e.famille && garde(e) && (!categorie || e.categorie === categorie)
      && mots.every(m => sansAccents(e.nom).includes(m)));
    // L'ordre de la recherche (un nom qui commence par le mot cherche d'abord) vient de filtrerFamilles.
    const parCle = new Map(entrees.filter(e => e.famille).map(e => [e.cle, e]));
    const ordonnees = filtrerFamilles([...familles], { texte }).map(f => parCle.get(cleFamille(f))).filter((e): e is Entree => !!e && garde(e));
    return [...chargees, ...ordonnees];
  }, [entrees, texte, categorie, nature, source]);

  const parCle = useMemo(() => new Map(entrees.map(e => [e.cle, e])), [entrees]);

  /** Choisit une entree : une police chargee tout de suite ; une famille de l'index, sa variante reguliere, telechargee au besoin. */
  const choisirVariante = async (v: VariantePolice) => {
    poserErreur(''); poserNote('');
    const deja = polices.find(p => p.id === v.id);
    if (deja) { poser(deja.id, deja); return; }
    poserEnCours(v.id);
    ac.dire('Téléchargement de la police ' + v.nom + '…');
    const r = await tx.telecharger(v);
    poserEnCours(null);
    if (r === null) { poserNote('Rien n’a été téléchargé.'); ac.dire('Rien n’a été téléchargé.'); return; }
    if ('erreur' in r) { poserErreur(r.erreur); ac.dire(r.erreur); return; }
    poser(r.id, r.police);
    ac.dire('Police ' + v.nom + ' téléchargée et vérifiée.');
  };
  const choisir = (e: Entree) => {
    if (e.police) { poserErreur(''); poser(e.police.id, e.police); return; }
    const v = e.famille ? variantePrincipale(e.famille) : null;
    if (v) void choisirVariante(v);
  };


  const sources = useMemo(() => SOURCES_POLICES.filter(s => catalogue?.familles.some(f => f.source === s.id)), [catalogue]);

  return (
    <div className="explorateur-polices" id={id} role="group" aria-label="Toutes les polices">
      <input type="search" value={texte} onChange={e => poserTexte(e.target.value)} aria-label="Rechercher une police" placeholder="Rechercher une police" />
      <div className="grille-3">
        <label className="champ-ligne"><span>Genre</span>
          <select value={categorie} onChange={e => poserCategorie(e.target.value as CategoriePolice | '')}>
            <option value="">Tous</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{NOMS_CATEGORIES[c]}</option>)}
          </select>
        </label>
        <label className="champ-ligne"><span>Tracé</span>
          <select value={nature} onChange={e => poserNature(e.target.value as NaturePolice | '')}>
            <option value="">Tous</option>
            <option value="contour">Contour (lettres pleines)</option>
            <option value="trait">Trait unique (stylo)</option>
          </select>
        </label>
        <label className="champ-ligne"><span>Source</span>
          <select value={source} onChange={e => poserSource(e.target.value as SourceEntree | '')}>
            <option value="">Toutes</option>
            <option value="livree">Livrées avec l’éditeur</option>
            <option value="deposee">Vos polices</option>
            {sources.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        </label>
      </div>
      {erreur ? <p className="aide" role="alert">{erreur}</p> : note ? <p className="aide">{note}</p> : null}

      <PolicesDuDocument polices={polices} valeur={valeur} poser={poser} occupee={enCours !== null} telecharger={v => void choisirVariante(v)} />

      <Raccourcis parCle={parCle} polices={polices} choisir={choisir} poser={poser} choisirVariante={v => void choisirVariante(v)} />

      <h4 className="polices-total">{tx.catalogue ? pluriel(filtrees.length, 'police') : tx.erreurCatalogue ? 'Polices livrées et déposées' : 'Chargement de l’index des polices…'}</h4>
      {tx.erreurCatalogue ? <p className="aide">{tx.erreurCatalogue}</p> : null}
      <ListePolices entrees={filtrees} valeur={valeur} enCours={enCours} choisir={choisir} favoris={tx.favoris} basculerFavori={tx.basculerFavori} />
      {!filtrees.length && tx.catalogue ? <p className="aide">Aucune police ne répond à ces critères.</p> : null}

      <VosPolices poser={poser} />
      <PiedConsentement />
    </div>
  );
}

/** Les polices du document, en tete : chacune une fois, avec son nombre de textes, et « Remplacer partout » par la police choisie. */
function PolicesDuDocument({ polices, valeur, poser, occupee, telecharger }: {
  polices: readonly Police[]; valeur: string; poser: (id: string, p?: Police) => void; occupee: boolean; telecharger: (v: VariantePolice) => void;
}) {
  const mo = useDessin(), tx = useTexte(), at = useActionsTexte(), { catalogue } = tx;
  const duDocument = useMemo(() => {
    const vues = new Map<string, { id: string; version?: string | undefined; famille?: string | undefined; textes: number }>();
    for (const f of mo.dessin.formes) {
      if (!f.texte) continue;
      const p = f.texte.police, d = vues.get(p.id);
      if (d) d.textes++; else vues.set(p.id, { id: p.id, version: p.version, famille: p.famille, textes: 1 });
    }
    return [...vues.values()];
  }, [mo.dessin.formes]);
  if (!duDocument.length) return null;
  const courante = polices.find(p => p.id === valeur) ?? null;
  return (
    <section className="polices-groupe" aria-label="Polices du document">
      <h4>Dans ce document</h4>
      <ul className="polices-courtes">
        {duDocument.map(d => {
          const chargee = polices.find(p => p.id === d.id) ?? null;
          const variante = !chargee && catalogue ? trouverVariante(catalogue, d.id, d.version) ?? trouverVariante(catalogue, d.id) : null;
          return (
            <li key={d.id}>
              <span className="police-nom">{nomDePolice(d.id, polices, d.famille)}</span> <span className="aide">{pluriel(d.textes, 'texte')}{chargee ? '' : ' · absente'}</span>
              {chargee ? (d.id !== valeur ? <button type="button" className="discret" onClick={() => poser(chargee.id, chargee)}>Choisir</button> : null)
                : variante ? <button type="button" className="discret" disabled={occupee} onClick={() => telecharger(variante)}>Télécharger</button> : null}
              {courante && d.id !== courante.id ? (
                <button type="button" className="discret" onClick={() => at.remplacerPartout(d.id, courante)}>Remplacer partout par {courante.nom}</button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Les favoris (des familles ou des fontes livrees) et les polices recentes, retenus dans le stockage injecte. */
function Raccourcis({ parCle, polices, choisir, poser, choisirVariante }: {
  parCle: ReadonlyMap<string, Entree>; polices: readonly Police[]; choisir: (e: Entree) => void; poser: (id: string, p?: Police) => void; choisirVariante: (v: VariantePolice) => void;
}) {
  const tx = useTexte(), { catalogue } = tx;
  const favoris = tx.favoris.map(c => parCle.get(c)).filter((e): e is Entree => !!e);
  const recentes = tx.recentes.map(rid => {
    const p = polices.find(x => x.id === rid);
    if (p) return { cle: 'r-' + rid, nom: p.nom, agir: () => poser(p.id, p) };
    const v = catalogue ? trouverVariante(catalogue, rid) : null;
    return v ? { cle: 'r-' + rid, nom: v.nom, agir: () => choisirVariante(v) } : null;
  }).filter((x): x is { cle: string; nom: string; agir: () => void } => x !== null);
  if (!favoris.length && !recentes.length) return null;
  return (
    <div className="grille-2 polices-raccourcis">
      {favoris.length ? (
        <section className="polices-groupe" aria-label="Favoris">
          <h4>Favoris</h4>
          <ul className="polices-courtes">{favoris.map(e => <li key={e.cle}><button type="button" className="discret" onClick={() => choisir(e)}>{e.nom}</button></li>)}</ul>
        </section>
      ) : null}
      {recentes.length ? (
        <section className="polices-groupe" aria-label="Récentes">
          <h4>Récentes</h4>
          <ul className="polices-courtes">{recentes.map(r => <li key={r.cle}><button type="button" className="discret" onClick={r.agir}>{r.nom}</button></li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}

/** La longue liste, fenetree au-dela de 150 lignes : seules les lignes visibles et une marge sont dessinees. */
function ListePolices({ entrees, valeur, enCours, choisir, favoris, basculerFavori }: {
  entrees: readonly Entree[]; valeur: string; enCours: string | null; choisir: (e: Entree) => void; favoris: readonly string[]; basculerFavori: (cle: string) => void;
}) {
  const total = entrees.length;
  const { liste, fenetre, pas, actif } = useFenetreDefilante<HTMLUListElement>(total, SEUIL_FENETRE);
  const lignes: ReactElement[] = segmentsFenetre(fenetre, total, pas).map(sg => {
    if (sg.type === 'cale') return <li key={'cale-' + sg.lieu} data-cale="" aria-hidden="true" style={{ height: sg.hauteur }} />;
    const e = au(entrees, sg.index);
    const choisie = e.police ? e.police.id === valeur : false, favori = favoris.includes(e.cle);
    const occupee = enCours !== null;
    return (
      <li key={e.cle} aria-posinset={actif ? sg.index + 1 : undefined} aria-setsize={actif ? total : undefined}>
        <button type="button" className="police-ligne" aria-pressed={choisie} disabled={occupee} onClick={() => choisir(e)}>
          <span className="police-nom">{e.nom}</span>
          <span className="police-badges">
            <span className="badge-source">{e.source === 'livree' ? 'Livrée' : e.source === 'deposee' ? 'Déposée' : COURTS[e.source]}</span>
            {e.nature === 'trait' ? <span className="badge-source">Trait unique</span> : null}
            {e.licence?.badge ? <span className="badge-licence" title={e.licence.nom}>{e.licence.badge}</span> : null}
          </span>
        </button>
        {e.famille || estPoliceLivree(e.cle) ? (
          <button type="button" className="discret police-favori" aria-pressed={favori} aria-label={'Favori : ' + e.nom} onClick={() => basculerFavori(e.cle)}>{favori ? '★' : '☆'}</button>
        ) : null}
      </li>
    );
  });
  return <ul className="liste-polices" ref={liste} aria-label="Polices" onFocus={montrerLigneAuClavier}>{lignes}</ul>;
}

/** Vos polices : celles de cet appareil, quand le navigateur sait les lire (Local Font Access) et qu'on le demande. */
function VosPolices({ poser }: { poser: (id: string, police?: Police) => void }) {
  const tx = useTexte(), ac = useActions();
  const [liste, poserListe] = useState<readonly PoliceAppareil[] | null>(null);
  const [choix, poserChoix] = useState(0);
  const [erreur, poserErreur] = useState('');
  const entree = useRef<HTMLInputElement>(null);
  const disponible = policesAppareilDisponibles();
  const ouvrir = async () => {
    const r = await policesDeLAppareil();
    if ('erreur' in r) { poserErreur(r.erreur); return; }
    poserErreur('');
    poserListe(r);
  };
  const employer = async () => {
    const p = liste?.[choix];
    if (!p) return;
    const r = await lirePoliceAppareil(p);
    if ('erreur' in r) { poserErreur(r.erreur); return; }
    tx.retenir(r);
    poser(r.id, r);
    ac.dire('Police ' + r.nom + ' de cet appareil choisie : elle n’est jamais écrite dans le fichier.');
  };
  return (
    <section className="polices-groupe" aria-label="Vos polices">
      <h4>Vos polices</h4>
      <div className="boutons">
        <button type="button" className="discret" onClick={() => entree.current?.click()}>Déposer une fonte TTF/OTF…</button>
        <input ref={entree} type="file" accept=".ttf,.otf,font/ttf,font/otf" hidden onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void tx.deposer(f).then(r => { if ('erreur' in r) poserErreur(r.erreur); else { poserErreur(''); poser(r.id); } });
        }} />
        {disponible && !liste ? <button type="button" className="discret" onClick={() => void ouvrir()}>Polices de cet appareil…</button> : null}
      </div>
      {liste ? (
        liste.length ? (
          <div className="boutons">
            <select aria-label="Police de cet appareil" value={choix} onChange={e => poserChoix(Number(e.target.value))}>
              {liste.map((p, i) => <option key={p.nom + i} value={i}>{p.nom}</option>)}
            </select>
            <button type="button" onClick={() => void employer()}>Employer</button>
          </div>
        ) : <p className="aide">Le navigateur n’a donné aucune police de cet appareil.</p>
      ) : null}
      {erreur ? <p className="aide" role="alert">{erreur}</p> : null}
    </section>
  );
}

/** L'etat du consentement et de quoi le retirer, dans le meme panneau (ADR-0025). */
function PiedConsentement() {
  const tx = useTexte(), ac = useActions();
  const serveurs = [...tx.acceptes].map(s => SERVEURS_POLICES[s].nom);
  return (
    <p className="aide pied-consentement">
      {serveurs.length ? <>Téléchargement autorisé auprès de {serveurs.join(', ')}.{' '}
        <button type="button" className="discret" onClick={() => { tx.revoquer(); ac.dire('Autorisation retirée : plus aucune police ne sera téléchargée sans vous le demander.'); }}>Retirer l’autorisation</button></>
        : 'Aucun téléchargement n’est autorisé : choisir une police non livrée vous le demandera d’abord.'}
    </p>
  );
}

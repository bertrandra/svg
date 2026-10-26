// La liste deroulante des polices (ADR-0034), partout ou l'on choisit une police (le panneau Texte, l'inspecteur, la barre de
// texte) : un champ ou l'on tape pour chercher, et une liste de toutes les polices, celles qu'on a deja et celles du catalogue,
// comme le selecteur de police d'un traitement de texte. Le motif ARIA « combobox » : le focus reste dans le champ, la ligne
// active est dite par `aria-activedescendant` ; fleches, Page haut et bas, Debut et Fin parcourent, Entree choisit, Echap
// ferme sans rien changer, Tab ne retient pas le focus.
//
// Chaque ligne dessine le nom dans sa police (ADR-0026 : calcule pour une fonte disponible, prepare pour le catalogue, sinon
// ecrit) et marque d'un nuage et d'une fleche, avec « à télécharger » dans son nom accessible, une police ni livree, ni deposee,
// ni deja telechargee ou gardee dans le cache. Ouvrir, parcourir et chercher ne font partir aucune requete (ADR-0025) : seul le
// choix d'une police marquee la telecharge, verifiee par son empreinte, par le serveur de l'hote quand il en pose un (ADR-0030).
// La longue liste se fenetre (ADR-0008) : seules les lignes visibles du catalogue sont dessinees.

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactElement, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { estIdCatalogue, familleDe, variantePrincipale, type FamilleCatalogue, type VariantePolice } from '../model/cataloguePolices.js';
import { CADRE_APERCU, cheminApercu, vueApercu } from '../model/apercusPolices.js';
import { baseDeGrasse } from '../model/polices.js';
import type { Police } from '../io/polices.js';
import { adressesEnCache, varianteEnCache } from '../io/policesEnLigne.js';
import { SEUIL_FENETRE, segmentsFenetre } from '../util/fenetre.js';
import { au } from '../util/tableaux.js';
import { useFenetre } from './Fenetre.js';
import { useActions, useDessin } from './contexteEditeur.js';
import { useTexte } from './contexteTexte.js';
import { choisirApercu, type ApercuLigne } from './apercusPolices.js';
import { Icone } from './icones.js';
import {
  badgeSource, cleFamille, estChoisie, etatLigne, groupesListe, idDeLigne, nomAccessibleLigne, nombrePolices, pasDePage, placerListe, varianteDeLigne,
  type Disponibilite, type EtatLigne, type GroupePolices, type IdGroupe, type LignePolice, type Placement, type PoliceDuDocument
} from './lignesPolices.js';
import { nombre as formaterNombre } from '../util/i18n.js';

export interface ProprietesChoixPoliceListe {
  readonly polices: readonly Police[];
  /** La police choisie (identifiant). */
  readonly valeur: string;
  /** Pose la police choisie ; `police` est donnee quand elle vient d'etre lue ou telechargee. */
  readonly poser: (id: string, police?: Police) => void;
  /** Ce que dit le champ d'une police que la page n'a pas (une fonte deposee sur une autre machine). */
  readonly absente?: string | undefined;
  readonly desactive?: boolean;
  /** La barre de texte : un champ etroit, une liste plus large que lui (sans deborder de l'ecran). */
  readonly compacte?: boolean;
  /** Ouvre « Toutes les polices » (filtres par genre, trace et source, favoris, vos polices) ; absent, le pied n'en parle pas. */
  readonly explorer?: (() => void) | undefined;
}

/** Les adresses que le cache gardait a la derniere ouverture : la liste suivante s'ouvre deja juste, puis se relit. */
let enCacheConnu: ReadonlySet<string> = new Set();

/** Un petit ecran : la liste s'ouvre en feuille de toute la largeur, du champ au bord de l'ecran. */
const PETIT_ECRAN = '(max-width: 640px)';

/** Le nom montre dans le champ ferme : la famille livree pour sa variante grasse (le gras se dit dans « Style »). */
function nomDansLeChamp(polices: readonly Police[], valeur: string, absente: string | undefined): string {
  if (!valeur) return '';
  const p = polices.find(x => x.id === (baseDeGrasse(valeur) ?? valeur));
  return p ? p.nom : absente ?? 'Police absente';
}

const formatNombre = (n: number): string => formaterNombre(n) + ' ' + (n > 1 ? 'polices' : 'police');

export function ChoixPoliceListe({ polices, valeur, poser, absente, desactive = false, compacte = false, explorer }: ProprietesChoixPoliceListe) {
  const tx = useTexte();
  const [ouvert, poserOuvert] = useState(false);
  // Ce qu'on a tape depuis l'ouverture ; null : rien encore, la liste montre tout.
  const [saisie, poserSaisie] = useState<string | null>(null);
  const [actif, poserActif] = useState(-1);
  const [enCache, poserEnCache] = useState<ReadonlySet<string>>(enCacheConnu);
  // Ou poser la liste ouverte : a la racine de l'editeur, hors des panneaux qui defilent (leur bord la couperait pour axe et WebKit).
  const [hote, poserHote] = useState<HTMLElement | null>(null);
  const champ = useRef<HTMLInputElement>(null), flottant = useRef<HTMLDivElement>(null), defile = useRef<HTMLDivElement>(null);
  const parClavier = useRef(false);
  const base = useId(), idListe = base + '-liste', idEtat = base + '-etat';
  const nomCourant = nomDansLeChamp(polices, valeur, absente);
  const texte = saisie ?? '';
  const fermer = useCallback(() => { poserOuvert(false); poserSaisie(null); poserActif(-1); }, []);
  const { groupes, options } = useGroupesOuverts(ouvert, polices, valeur, absente, texte);
  const { placement, placer } = usePlacement(ouvert, champ, flottant, fermer);
  const prise = usePriseDePolice(polices, poser);
  const total = options.length, a = actif < total ? actif : total - 1;
  // Ce qui est deja la : les fontes lues, le cache du navigateur, le telechargement en cours.
  const dispo = useMemo<Disponibilite>(() => ({
    chargees: new Set(polices.map(p => p.id)), enCache: v => varianteEnCache(v, enCache), enCours: prise.enCours?.id ?? null
  }), [polices, enCache, prise.enCours]);

  const ouvrir = (depart: 'choisie' | 'aucune') => {
    if (desactive || ouvert) return;
    // L'index et ses apercus sont des annexes voisines : les lire ne contacte personne (ADR-0025).
    if (tx.enLigne) tx.chargerCatalogue();
    poserSaisie(null);
    poserActif(depart === 'choisie' ? 0 : -1);
    poserHote(champ.current?.closest<HTMLElement>('.editeur-cadre') ?? document.body);
    placer();
    poserOuvert(true);
    void adressesEnCache().then(s => { enCacheConnu = s; poserEnCache(s); });
  };
  const choisir = (l: LignePolice) => {
    const etat = etatLigne(l, dispo);
    if (etat === 'absente' || etat === 'en-cours' || (prise.enCours && etat !== 'locale')) return;
    fermer();
    champ.current?.focus({ preventScroll: true });
    // La police deja choisie ne se repose pas : comme une liste deroulante, rien ne change, rien n'entre dans l'historique.
    const id = idDeLigne(l);
    if (id !== null && (id === valeur || id === baseDeGrasse(valeur))) return;
    void prise.prendre(l);
  };

  // La ligne active reste visible quand le clavier la deplace ; a la souris, la liste ne bouge pas sous le pointeur.
  useLayoutEffect(() => {
    if (!ouvert || a < 0 || !parClavier.current) return;
    parClavier.current = false;
    document.getElementById(idOption(base, a))?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  const aller = (i: number) => {
    if (!total) return;
    parClavier.current = true;
    poserActif(Math.max(0, Math.min(total - 1, i)));
  };
  const pasPage = () => {
    const ligne = a >= 0 ? document.getElementById(idOption(base, a)) : null;
    return pasDePage(defile.current?.clientHeight ?? 0, ligne?.getBoundingClientRect().height ?? 32);
  };
  const clavier = (e: KeyboardEvent<HTMLInputElement>) => {
    if (desactive || e.nativeEvent.isComposing) return;
    if (!ouvert) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') { e.preventDefault(); ouvrir(e.altKey ? 'aucune' : 'choisie'); }
      return;
    }
    const depart = a < 0 ? 0 : a;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (!e.altKey) aller(a < 0 ? 0 : a + 1); break;
      case 'ArrowUp': e.preventDefault(); if (e.altKey) fermer(); else aller(a < 0 ? total - 1 : a - 1); break;
      case 'PageDown': e.preventDefault(); aller(depart + pasPage()); break;
      case 'PageUp': e.preventDefault(); aller(depart - pasPage()); break;
      case 'Home': e.preventDefault(); aller(0); break;
      case 'End': e.preventDefault(); aller(total - 1); break;
      case 'Enter': { e.preventDefault(); const o = options[depart]; if (o) choisir(o.ligne); else fermer(); break; }
      // Echap ferme la liste et rend le champ tel qu'il etait ; la barre de texte ne le voit pas (elle ramenerait au texte).
      case 'Escape': e.preventDefault(); e.stopPropagation(); fermer(); break;
      // Tab ne retient pas le focus : la liste se ferme, ou le focus passe au lien de son pied (puis plus loin, voir ListeOuverte).
      case 'Tab': {
        const lien = flottant.current?.querySelector<HTMLElement>('.liste-polices-pied button');
        if (!e.shiftKey && lien) { e.preventDefault(); lien.focus(); } else fermer();
        break;
      }
    }
  };
  // Le focus qui quitte le champ et la liste ferme la liste ; un clic dans la liste garde le focus au champ.
  const quitte = (e: FocusEvent) => {
    const vers = e.relatedTarget as Node | null;
    if (vers && !flottant.current?.contains(vers) && !champ.current?.contains(vers)) fermer();
  };
  const etatTexte = prise.enCours ? 'Téléchargement de ' + prise.enCours.nom + '…' : prise.erreur;
  const enErreur = !prise.enCours && !!prise.erreur;

  return (
    <span className={'liste-polices-choix' + (compacte ? ' compacte' : '')} onBlur={quitte}>
      <span className="liste-polices-champ">
        <input ref={champ} type="text" role="combobox" aria-label="Police" aria-expanded={ouvert} aria-controls={idListe} aria-autocomplete="list"
          aria-activedescendant={ouvert && a >= 0 ? idOption(base, a) : undefined} aria-describedby={etatTexte ? idEtat : undefined} aria-busy={prise.enCours ? true : undefined}
          autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={desactive} data-valeur={baseDeGrasse(valeur) ?? valeur}
          value={ouvert ? saisie ?? nomCourant : nomCourant} title={nomCourant}
          onChange={e => {
            // La premiere lettre tapee commence une recherche : elle remplace le nom affiche, qu'il soit choisi ou non.
            const v = e.target.value, tape = saisie === null && v.startsWith(nomCourant) && v.length > nomCourant.length ? v.slice(nomCourant.length) : v;
            if (!ouvert) ouvrir('choisie');
            poserSaisie(tape);
            poserActif(0);
          }}
          onFocus={e => { if (!ouvert) e.currentTarget.select(); }}
          onClick={() => { if (!ouvert) { ouvrir('choisie'); champ.current?.select(); } else if (saisie === null) fermer(); }}
          onKeyDown={clavier} />
        <span className="liste-polices-chevron" aria-hidden="true"><Icone nom="chevron-bas" taille={12} /></span>
      </span>
      {etatTexte ? <span id={idEtat} className={'aide liste-polices-etat' + (enErreur ? ' erreur' : '')} role={enErreur ? 'alert' : undefined} title={etatTexte}>{etatTexte}</span> : null}
      {ouvert && placement && hote ? createPortal(
        <ListeOuverte flottant={flottant} defile={defile} base={base} idListe={idListe} placement={placement} groupes={groupes} options={options} actif={a}
          dispo={dispo} polices={polices} valeur={valeur} texte={texte} choisir={choisir} explorer={explorer ? () => { fermer(); explorer(); } : undefined}
          quitterLien={sens => { if (sens !== 'avant') champ.current?.focus(); if (sens === 'arriere') return; fermer(); if (sens === 'avant') focusApres(champ.current); }} />, hote
      ) : null}
    </span>
  );
}

const idOption = (base: string, i: number): string => base + '-o' + i;

type Option = { readonly groupe: IdGroupe; readonly ligne: LignePolice };

/** Les groupes et les lignes de la liste ouverte (rien, fermee) : les polices du document ne se lisent qu'alors. */
function useGroupesOuverts(ouvert: boolean, polices: readonly Police[], valeur: string, absente: string | undefined, texte: string) {
  const tx = useTexte(), formes = useDessin().dessin.formes;
  const duDocument = useMemo<PoliceDuDocument[]>(() => {
    if (!ouvert) return [];
    const r: PoliceDuDocument[] = [];
    for (const f of formes) if (f.texte) r.push({ id: f.texte.police.id, version: f.texte.police.version, famille: f.texte.police.famille });
    return r;
  }, [ouvert, formes]);
  const { catalogue, favoris, recentes } = tx;
  const groupes = useMemo<GroupePolices[]>(() => (ouvert ? groupesListe({ polices, catalogue, valeur, absente, duDocument, favoris, recentes, texte }) : []),
    [ouvert, polices, catalogue, valeur, absente, duDocument, favoris, recentes, texte]);
  const options = useMemo<Option[]>(() => groupes.flatMap(g => g.lignes.map(l => ({ groupe: g.id, ligne: l }))), [groupes]);
  return { groupes, options };
}

/** Ou poser la liste ouverte, et la suivre : une barre qui defile, le clavier virtuel qui reduit l'ecran, une fenetre redimensionnee. */
function usePlacement(ouvert: boolean, champ: RefObject<HTMLInputElement | null>, flottant: RefObject<HTMLDivElement | null>, fermer: () => void) {
  const [placement, poserPlacement] = useState<Placement | null>(null);
  const placer = useCallback(() => {
    const c = champ.current;
    if (!c) return;
    const vv = window.visualViewport;
    const petit = typeof window.matchMedia === 'function' && window.matchMedia(PETIT_ECRAN).matches;
    poserPlacement(placerListe(c.getBoundingClientRect(), { largeur: window.innerWidth, hauteur: vv ? vv.height + vv.offsetTop : window.innerHeight }, petit));
  }, [champ]);
  useEffect(() => {
    if (!ouvert) return;
    let image = 0;
    const suivre = (e?: Event) => {
      // Le defilement de la liste elle-meme ne la deplace pas.
      if (e && e.target instanceof Node && flottant.current?.contains(e.target)) return;
      cancelAnimationFrame(image);
      image = requestAnimationFrame(placer);
    };
    const dehors = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!flottant.current?.contains(t) && !champ.current?.contains(t)) fermer();
    };
    const vv = window.visualViewport;
    window.addEventListener('resize', suivre);
    window.addEventListener('scroll', suivre, true);
    window.addEventListener('pointerdown', dehors);
    vv?.addEventListener('resize', suivre);
    vv?.addEventListener('scroll', suivre);
    return () => {
      cancelAnimationFrame(image);
      window.removeEventListener('resize', suivre);
      window.removeEventListener('scroll', suivre, true);
      window.removeEventListener('pointerdown', dehors);
      vv?.removeEventListener('resize', suivre);
      vv?.removeEventListener('scroll', suivre);
    };
  }, [ouvert, placer, fermer, champ, flottant]);
  return { placement, placer };
}

/** Poser la police d'une ligne : une fonte lue tout de suite ; une police du catalogue, telechargee puis posee (le choix vaut demande). */
function usePriseDePolice(polices: readonly Police[], poser: (id: string, police?: Police) => void) {
  const tx = useTexte(), ac = useActions();
  const [enCours, poserEnCours] = useState<VariantePolice | null>(null);
  const [erreur, poserErreur] = useState('');
  const prendre = async (l: LignePolice) => {
    poserErreur('');
    if (l.police) { poser(l.police.id, l.police); return; }
    const v = varianteDeLigne(l);
    if (!v) return;
    const deja = polices.find(p => p.id === v.id);
    if (deja) { poser(deja.id, deja); return; }
    poserEnCours(v);
    ac.dire('Téléchargement de la police ' + v.nom + '…');
    const r = await tx.telecharger(v);
    poserEnCours(null);
    if ('erreur' in r) { poserErreur(r.erreur); ac.dire(r.erreur); return; }
    poser(r.id, r.police);
    ac.dire('Police ' + v.nom + ' téléchargée et vérifiée.');
  };
  return { enCours, erreur, prendre };
}

interface ProprietesListeOuverte {
  readonly flottant: RefObject<HTMLDivElement | null>;
  readonly defile: RefObject<HTMLDivElement | null>;
  readonly base: string;
  readonly idListe: string;
  readonly placement: Placement;
  readonly groupes: readonly GroupePolices[];
  readonly options: readonly Option[];
  readonly actif: number;
  readonly dispo: Disponibilite;
  readonly polices: readonly Police[];
  readonly valeur: string;
  readonly texte: string;
  readonly choisir: (l: LignePolice) => void;
  readonly explorer: (() => void) | undefined;
  /** Quitter le lien du pied : Maj+Tab revient au champ ; Tab ferme la liste et va au controle qui suit le champ ; Echap ferme et rend le champ. */
  readonly quitterLien: (sens: 'arriere' | 'avant' | 'echap') => void;
}

/** Les controles qu'on atteint par Tab, dans l'ordre de la page. */
const TABULABLES = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Donne le focus au controle qui suit `el` dans l'ordre de Tab : la liste ouverte vit a la racine de l'editeur (un portail), son
 * lien n'est donc pas a sa place dans la page ; quitter ce lien par Tab doit mener la ou Tab menait depuis le champ.
 */
function focusApres(el: HTMLElement | null): void {
  if (!el) return;
  const tous = Array.from(document.querySelectorAll<HTMLElement>(TABULABLES)).filter(x => !x.closest('.liste-polices-flottant') && x.getClientRects().length > 0 && x.tabIndex >= 0);
  const i = tous.indexOf(el);
  const suivant = i >= 0 ? tous[i + 1] : undefined;
  if (suivant) suivant.focus(); else el.blur();
}

/** La liste ouverte : les groupes, puis le pied (le nombre de polices, la legende de la marque, le lien vers les filtres). */
function ListeOuverte({ flottant, defile, base, idListe, placement: p, groupes, options, actif, dispo, polices, valeur, texte, choisir, explorer, quitterLien }: ProprietesListeOuverte) {
  const tx = useTexte(), { catalogue, apercus } = tx;
  // La famille de l'index dont une variante est lue dans la session : sa ligne se dessine dans cette fonte (la principale d'abord).
  const lueParFamille = useMemo(() => {
    const m = new Map<FamilleCatalogue, Police>();
    if (!catalogue) return m;
    for (const x of polices) {
      if (!estIdCatalogue(x.id)) continue;
      const f = familleDe(catalogue, x.id);
      if (f && (!m.has(f) || variantePrincipale(f)?.id === x.id)) m.set(f, x);
    }
    return m;
  }, [polices, catalogue]);
  const familleChoisie = useMemo(() => (catalogue && estIdCatalogue(valeur) ? familleDe(catalogue, valeur) : null), [catalogue, valeur]);
  const nombre = nombrePolices(groupes), cherche = texte.trim();
  return (
    <div ref={flottant} className={'liste-polices-flottant' + (p.feuille ? ' feuille' : '')}
      style={{ left: p.left, width: p.width, maxHeight: p.maxHeight, ...(p.top !== undefined ? { top: p.top } : { bottom: p.bottom }) }}
      onMouseDown={e => { if (!(e.target as HTMLElement).closest('button')) e.preventDefault(); }}>
      <div ref={defile} role="listbox" id={idListe} aria-label="Polices" tabIndex={-1} className="liste-polices-options">
        {groupes.map(g => {
          const debut = options.findIndex(o => o.groupe === g.id);
          const ligne = (l: LignePolice, i: number) => (
            <OptionPolice key={l.cle} id={idOption(base, debut + i)} ligne={l} groupe={g.id} active={debut + i === actif} etat={etatLigne(l, dispo)}
              choisie={estChoisie(l, valeur, familleChoisie)} apercu={apercuDe(l, polices, lueParFamille, apercus)} choisir={() => choisir(l)} />
          );
          return g.id === 'catalogue' && g.lignes.length > SEUIL_FENETRE
            ? <GroupeFenetre key={g.id} base={base} groupe={g} defile={defile} epingle={actif >= debut ? actif - debut : null} ligne={ligne} />
            : <GroupeSimple key={g.id} base={base} groupe={g} ligne={ligne} />;
        })}
      </div>
      <div className="liste-polices-pied">
        <p className="aide">{cherche && !nombre ? 'Aucune police ne répond à « ' + cherche + ' ».'
          : tx.enLigne && !catalogue ? (tx.erreurCatalogue || 'Chargement de l’index des polices…') : formatNombre(nombre)}
          {catalogue && tx.erreurApercus ? ' Les noms s’écrivent sans aperçu.' : ''}</p>
        {catalogue ? (
          // Deux phrases courtes, chacune sur sa ligne : sous WebKit, axe ne sait pas lire le fond d'un texte enveloppe dans ce pied.
          <>
            <div className="liste-polices-legende"><Icone nom="nuage-telecharger" taille={16} /><p className="aide">À télécharger quand vous la choisissez.</p></div>
            <p className="aide">Parcourir et chercher ne téléchargent rien.</p>
          </>
        ) : null}
        {explorer ? (
          <button type="button" className="discret" onClick={explorer}
            onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); quitterLien(e.shiftKey ? 'arriere' : 'avant'); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); quitterLien('echap'); } }}>
            Filtrer par genre, tracé ou source…
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** L'apercu d'une ligne : la fonte lue d'abord, puis l'apercu prepare de sa famille (seulement sous le nom de la famille), puis le nom. */
function apercuDe(l: LignePolice, polices: readonly Police[], lueParFamille: ReadonlyMap<FamilleCatalogue, Police>, annexe: ReturnType<typeof useTexte>['apercus']): ApercuLigne {
  const v = l.variante;
  const lue = l.police ?? (v ? polices.find(p => p.id === v.id) : l.famille ? lueParFamille.get(l.famille) : undefined) ?? null;
  const cle = l.famille && l.nom === l.famille.nom ? cleFamille(l.famille) : null;
  return choisirApercu(l.nom, lue, cle, annexe);
}

interface ProprietesGroupe {
  readonly base: string;
  readonly groupe: GroupePolices;
  readonly ligne: (l: LignePolice, i: number) => ReactElement;
}

/** Un groupe court : toutes ses lignes. */
function GroupeSimple({ base, groupe, ligne }: ProprietesGroupe) {
  const id = base + '-g-' + groupe.id;
  return (
    <div role="group" aria-labelledby={id} className="liste-polices-groupe" data-groupe={groupe.id}>
      <div id={id} className="liste-polices-titre">{groupe.titre}</div>
      <div className="liste-polices-lignes">{groupe.lignes.map(ligne)}</div>
    </div>
  );
}

/**
 * Le catalogue, fenetre au-dela de 150 lignes (ADR-0008) : seules les lignes visibles et une marge sont dessinees, deux cales
 * tiennent la place des autres. La ligne active reste dessinee meme hors de la fenetre (`epingle`) : `aria-activedescendant`
 * designe toujours un element de la page.
 */
function GroupeFenetre({ base, groupe, ligne, defile, epingle }: ProprietesGroupe & { readonly defile: RefObject<HTMLDivElement | null>; readonly epingle: number | null }) {
  const id = base + '-g-' + groupe.id, total = groupe.lignes.length;
  const f = useFenetre(total, defile);
  const lignes = segmentsFenetre(f.fenetre, total, f.pas, epingle, 0).map(sg => (sg.type === 'cale'
    ? <div key={'cale-' + sg.lieu} data-cale="" aria-hidden="true" style={{ height: sg.hauteur }} />
    : ligne(au(groupe.lignes, sg.index), sg.index)));
  return (
    <div role="group" aria-labelledby={id} className="liste-polices-groupe" data-groupe={groupe.id}>
      <div id={id} className="liste-polices-titre">{groupe.titre}</div>
      <div className="liste-polices-lignes" ref={f.liste as unknown as RefObject<HTMLDivElement>}>{lignes}</div>
    </div>
  );
}

function OptionPolice({ id, ligne: l, groupe, active, etat, choisie, apercu, choisir }: {
  id: string; ligne: LignePolice; groupe: IdGroupe; active: boolean; etat: EtatLigne; choisie: boolean; apercu: ApercuLigne; choisir: () => void;
}) {
  const source = badgeSource(l, groupe, etat);
  return (
    <div role="option" id={id} aria-label={nomAccessibleLigne(l, groupe, etat)} aria-selected={choisie} aria-disabled={etat === 'absente' || etat === 'en-cours' ? true : undefined}
      className={'police-option' + (active ? ' active' : '')} data-police={idDeLigne(l) ?? undefined} data-etat={etat} onClick={choisir}>
      <span className="police-coche" aria-hidden="true">{choisie ? <Icone nom="coche" taille={14} /> : null}</span>
      <NomPolice nom={l.nom} apercu={apercu} />{' '}
      {/* Des blancs entre les badges : leurs mots se lisent separes (le nom accessible les reprend dans cet ordre). */}
      <span className="police-badges">{[
        source ? <span key="source" className="badge-source">{source}</span> : null,
        l.nature === 'trait' ? <span key="trait" className="badge-source">Trait unique</span> : null,
        l.licence?.badge ? <span key="licence" className="badge-licence" title={l.licence.nom}>{l.licence.badge}</span> : null
      ].filter(b => b !== null).flatMap((b, i) => (i ? [' ', b] : [b]))}</span>{' '}
      <span className="police-dispo" title={etat === 'a-telecharger' ? 'À télécharger' : undefined}>
        {etat === 'a-telecharger' ? <Icone nom="nuage-telecharger" taille={16} />
          : etat === 'en-cours' ? <span className="police-arrive">Téléchargement…</span>
          : etat === 'absente' && !/absente/i.test(l.nom) ? <span className="police-absente">absente</span> : null}
      </span>
    </div>
  );
}

/** Le nom d'une ligne : dessine (image decorative, a la couleur du texte) et dit en texte pour le nom accessible ; ou ecrit. */
function NomPolice({ nom, apercu }: { nom: string; apercu: ApercuLigne }) {
  if (apercu.source === 'nom') return <span className="police-nom">{nom}</span>;
  const t = apercu.trace;
  return (
    <span className="police-nom police-nom-apercu" data-apercu={apercu.source}>
      <svg className={apercu.plein ? 'apercu-nom' : 'apercu-nom au-trait'} viewBox={vueApercu(t)} width={t.largeur} height={CADRE_APERCU.haut + CADRE_APERCU.bas}
        preserveAspectRatio="xMinYMid meet" aria-hidden="true" focusable="false">
        <path d={cheminApercu(t)} />
      </svg>
      <span className="sr-only">{nom}</span>
    </span>
  );
}

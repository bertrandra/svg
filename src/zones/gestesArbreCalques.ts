// Les gestes de l'arbre des calques (ArbreCalques.tsx), delegues a la grille : le clic, le double-clic, le clavier, le focus, le
// glisser-deposer, et les verbes qu'ils partagent (choisir, plier, entrer, deplacer, renommer). Ils lisent l'etat du rendu
// (`EtatArbre`) et ne posent rien que par les verbes de l'editeur et les setters du composant ; le calcul est pur ailleurs
// (lignesCalques.ts, deplacerCalques.ts).

import type { DragEvent, FocusEvent, KeyboardEvent, MouseEvent, RefObject } from 'react';
import { ancetres, groupeDe, modifier, NOM_GROUPE_MAX, unites, verrouilleEffectif, type DessinSvg } from '../engine/editionSvg.js';
import type { ElementMenu } from './commun/Menu.js';
import { changerDeRang, ciblesDe, deplacerVers, entrerAuDessus, renommerGroupe, sortirDuGroupe, type Deplacement } from './deplacerCalques.js';
import { destinations, enfantsDe, etendue, groupeCommun, idNoeud, parentDe, type LigneArbre } from './lignesCalques.js';
import { PHRASE_FEUILLE_SANS_NOM, PHRASE_VERROUILLE, phraseDeplie, phraseFreresDeplies, phraseReplie } from './phrasesCalques.js';
import type { ActionsEditeur, ContexteEdition } from './typesEditeur.js';
import { niveauEdition } from './lentille.js';
import { t } from '../util/i18n.js';

/** Le type des donnees glissees d'une ligne : les identifiants des noeuds, separes par des espaces. */
export const TYPE_GLISSE = 'application/x-svg-noeuds';

/** La ligne qui porte le focus, et sur quoi : la ligne elle-meme (-1) ou l'une de ses cellules a bouton (0 visibilite, 1 verrou). */
export interface FocusArbre { readonly id: string; readonly cellule: number }

/** Ou se pose ce qu'on glisse : dans un groupe, ou juste sous une feuille. */
export type Depot = { readonly id: string; readonly mode: 'dans' | 'sous' } | null;

/** Ce que les gestes retiennent d'un rendu a l'autre, hors de l'etat de React. */
export interface MemoireArbre {
  /** L'origine d'un Maj+clic ou d'un Maj+fleche. */
  ancre: string | null;
  /** Le prochain rendu donne le focus a la ligne active (un geste du clavier l'a deplacee). */
  focusVoulu: boolean;
  /** L'element de la grille qui avait le focus : s'il disparait (sa forme supprimee), le focus revient a la ligne active. */
  dernierFocus: HTMLElement | null;
  /** Le groupe qu'on renomme (F2), tant que le champ est ouvert. */
  renommeEnCours: string | null;
  /**
   * La ligne du premier clic d'un double-clic : le premier clic choisit, la rangee de la selection apparait au-dessus des panneaux et
   * decale la liste d'une ligne, et le second clic tombait sur la ligne voisine (vu par le paquet 8-D). Le second clic et le
   * double-clic visent donc la ligne du premier.
   */
  premierClic: string | null;
}

export interface EtatArbre {
  readonly dessin: DessinSvg; readonly sel: string[]; readonly choisies: ReadonlySet<string>;
  readonly deplies: ReadonlySet<string>; readonly contexte: ContexteEdition | null;
  readonly lignes: readonly LigneArbre[]; readonly index: ReadonlyMap<string, number>;
  readonly focus: FocusArbre | null; readonly depot: Depot; readonly pas: number;
  readonly ac: ActionsEditeur; readonly panneau: RefObject<HTMLElement | null>; readonly memoire: MemoireArbre;
  readonly poserFocus: (f: FocusArbre) => void; readonly poserRenomme: (id: string | null) => void; readonly poserDepot: (d: Depot) => void;
  /** Demande l'ouverture de « Déplacer vers… » (Maj+F10). */
  readonly demanderMenu: () => void;
}

export type VerbesArbre = ReturnType<typeof verbesArbre>;

/** Les verbes que les gestes partagent. */
export function verbesArbre(e: EtatArbre) {
  const { dessin, sel, choisies, deplies, lignes, index, ac, memoire } = e;

  /** Donne le focus (au clavier) a la ligne `i`, sur elle-meme (-1) ou sur une de ses cellules. */
  const aller = (i: number, cel = -1) => {
    const l = lignes[Math.max(0, Math.min(lignes.length - 1, i))];
    if (!l) return;
    memoire.focusVoulu = true;
    e.poserFocus({ id: l.id, cellule: cel });
  };

  /** Le contexte d'edition suit ce qu'on choisit dans l'arbre : le groupe qui contient tout le choix (la racine sinon). */
  const choisirIds = (ids: string[]) => {
    ac.choisir(ids);
    ac.poserPoint(null);
    if (!ids.length) return;
    const g = groupeCommun(dessin, ids);
    if (g !== niveauEdition(e.contexte)) ac.poserNiveau(g);
  };

  const choisirLigne = (id: string, mode: 'seul' | 'basculer' | 'etendre') => {
    if (mode === 'seul' && verrouilleEffectif(dessin, id)) { ac.dire(PHRASE_VERROUILLE); return; }
    if (mode === 'etendre') {
      const a = index.get(memoire.ancre ?? id) ?? index.get(id) ?? 0;
      choisirIds(unites(dessin, etendue(lignes, a, index.get(id) ?? a).filter(x => !verrouilleEffectif(dessin, x))));
      return;
    }
    memoire.ancre = id;
    if (mode === 'seul') choisirIds([id]);
    else if (choisies.has(id)) choisirIds(sel.filter(s => s !== id));
    else if (verrouilleEffectif(dessin, id)) ac.dire(PHRASE_VERROUILLE);
    else choisirIds(unites(dessin, [...sel, id]));
  };

  const basculer = (id: string) => {
    const n = lignes[index.get(id) ?? -1]?.noeud;
    if (n?.genre !== 'groupe') return;
    const ouvert = deplies.has(id);
    ac.deplier([id], !ouvert);
    ac.annoncer(ouvert ? phraseReplie(n.groupe) : phraseDeplie(n.groupe, n.enfants.length));
  };

  /** Entree ou double-clic sur un groupe : il devient le contexte d'edition, et se deplie pour montrer ce qu'on y choisira. */
  const entrer = (id: string) => { if (ac.entrerGroupe(id)) ac.deplier([id, ...ancetres(dessin, id)], true); };

  const appliquerDeplacement = (r: Deplacement, focusSur: string | null) => {
    if (r.dessin !== dessin) ac.appliquer(() => r.dessin);
    if (r.deplier.length) ac.deplier(r.deplier, true);
    ac.dire(r.phrase);
    if (focusSur !== null) { memoire.focusVoulu = true; e.poserFocus({ id: focusSur, cellule: -1 }); }
  };

  /** Ctrl+Maj+fleches : monter, descendre, sortir du groupe, entrer dans le groupe au-dessus. */
  const deplacerAuClavier = (id: string, touche: string) => {
    const cibles = ciblesDe(dessin, id, sel);
    const r = touche === 'ArrowUp' ? changerDeRang(dessin, cibles, 'monte') : touche === 'ArrowDown' ? changerDeRang(dessin, cibles, 'descend')
      : touche === 'ArrowLeft' ? sortirDuGroupe(dessin, id, cibles) : entrerAuDessus(dessin, id, cibles);
    appliquerDeplacement(r, id);
  };

  const commencerRenommage = (id: string) => {
    if (!groupeDe(dessin, id)) { ac.dire(PHRASE_FEUILLE_SANS_NOM); return; }
    memoire.renommeEnCours = id;
    e.poserRenomme(id);
  };

  /** Fin du renommage : Entree ou la perte du focus valident, Echap abandonne. Le focus revient a la ligne si le clavier l'a voulu. */
  const finirRenommage = (valider: boolean, valeur: string, rendreFocus: boolean) => {
    const id = memoire.renommeEnCours;
    if (id === null) return;
    memoire.renommeEnCours = null;
    e.poserRenomme(null);
    const r = valider ? renommerGroupe(dessin, id, valeur.slice(0, NOM_GROUPE_MAX)) : null;
    if (r) { ac.appliquer(() => r.dessin); ac.dire(r.phrase); }
    if (rendreFocus) { memoire.focusVoulu = true; e.poserFocus({ id, cellule: -1 }); }
  };

  /** La touche * : tous les groupes freres de la ligne se deplient. */
  const deplierFreres = (l: LigneArbre) => {
    const ids = enfantsDe(dessin, l.parent).filter(n => n.genre === 'groupe' && !deplies.has(n.groupe.id)).map(idNoeud);
    if (ids.length) ac.deplier(ids, true);
    ac.annoncer(phraseFreresDeplies(ids.length));
  };

  /** Maj+F10 ou la touche Menu : la ligne est choisie si elle ne l'etait pas, et « Déplacer vers… » s'ouvre. */
  const ouvrirMenu = (id: string) => {
    if (!choisies.has(id)) choisirLigne(id, 'seul');
    e.demanderMenu();
  };

  /** Les elements de « Déplacer vers… » : la racine et chaque groupe ; le parent commun et les groupes deplaces inactifs. */
  const elementsMenu = (): ElementMenu[] => (sel.length
    ? destinations(dessin, sel).map(dst => ({
      id: dst.id ?? 'racine', libelle: dst.libelle, desactive: dst.refusee,
      onClick: () => appliquerDeplacement(deplacerVers(dessin, sel, dst.id), unites(dessin, sel)[0] ?? null)
    }))
    : [{ id: 'rien', libelle: t('Choisissez d’abord un calque à déplacer'), desactive: true }]);

  return { aller, choisirLigne, basculer, entrer, appliquerDeplacement, deplacerAuClavier, commencerRenommage, finirRenommage, deplierFreres, ouvrirMenu, elementsMenu };
}

/** La ligne qui contient un element de la grille, et son identifiant. */
function ligneDe(t: EventTarget | null): { el: HTMLElement; id: string } | null {
  const el = t instanceof Element ? t.closest<HTMLElement>('[data-ligne]') : null;
  const id = el?.dataset['ligne'];
  return el && id !== undefined ? { el, id } : null;
}

/** La cellule d'un element : -1 pour la ligne elle-meme, sinon son `data-cellule`. */
const celluleDe = (t: HTMLElement, ligne: HTMLElement): number => (t === ligne ? -1 : Number(t.dataset['cellule'] ?? -1));

/** Le clic, le double-clic et le focus de la grille. */
export function gestesSouris(e: EtatArbre, v: VerbesArbre) {
  const { dessin, sel, ac, memoire } = e;
  const clic = (ev: MouseEvent<HTMLDivElement>) => {
    const t = ev.target as HTMLElement, sous = ligneDe(t);
    if (!sous || t.closest('input')) return;
    const action = t.closest<HTMLElement>('[data-action]')?.dataset['action'];
    // Le second clic d'un double-clic (`detail` 2) vise la ligne du premier, meme si la liste a bouge sous le pointeur entre les deux.
    if (ev.detail <= 1 || action) memoire.premierClic = action ? null : sous.id;
    const l = ev.detail >= 2 && memoire.premierClic !== null && !action ? { ...sous, id: memoire.premierClic } : sous;
    if (action === 'deplier') { v.basculer(l.id); return; }
    const g = groupeDe(dessin, l.id), f = g ? undefined : dessin.formes.find(x => x.id === l.id);
    if (action === 'visible') { const vu = g?.visible ?? f?.visible ?? true; ac.appliquer(d => modifier(d, [l.id], { visible: !vu })); return; }
    if (action === 'verrou') {
      const pris = g?.verrouille ?? f?.verrouille ?? false;
      ac.appliquer(d => modifier(d, [l.id], { verrouille: !pris }));
      // Ce qu'on verrouille sort de la selection, avec ce qu'il contient.
      if (!pris) ac.choisir(sel.filter(s => s !== l.id && !ancetres(dessin, s).includes(l.id)));
      return;
    }
    v.choisirLigne(l.id, ev.shiftKey ? 'etendre' : ev.ctrlKey || ev.metaKey ? 'basculer' : 'seul');
  };
  const doubleClic = (ev: MouseEvent<HTMLDivElement>) => {
    const t = ev.target as HTMLElement, sous = ligneDe(t);
    const l = sous && memoire.premierClic !== null ? { ...sous, id: memoire.premierClic } : sous;
    if (!l || t.closest('[data-action], input') || !groupeDe(dessin, l.id)) return;
    // La pastille d'une decoupe ou d'un masque : on en modifie le contenu (paquet 8-D) ; ailleurs sur la ligne, on entre dans le groupe.
    const pastille = sous?.id === l.id ? t.closest<HTMLElement>('[data-pastille]')?.dataset.pastille : undefined;
    if (pastille === 'decoupe' || pastille === 'masque') { ac.modifierContenu(pastille, l.id); return; }
    v.entrer(l.id);
  };
  const prendFocus = (ev: FocusEvent<HTMLDivElement>) => {
    const t = ev.target as HTMLElement;
    if (t instanceof HTMLInputElement) { t.select(); return; }
    const l = ligneDe(t);
    if (!l) return;
    memoire.dernierFocus = t;
    const cel = celluleDe(t, l.el);
    if (e.focus?.id !== l.id || e.focus.cellule !== cel) e.poserFocus({ id: l.id, cellule: cel });
  };
  const perdFocus = (ev: FocusEvent<HTMLDivElement>) => {
    const t = ev.target as HTMLElement;
    if (t instanceof HTMLInputElement) { v.finirRenommage(true, t.value, false); return; }
    // Un focus parti ailleurs n'est plus a rendre ; un element retire du DOM (sa forme supprimee) le garde, pour le rendu suivant.
    if (ev.relatedTarget || t.isConnected) memoire.dernierFocus = null;
  };
  return { clic, doubleClic, prendFocus, perdFocus };
}

/** Le clavier de la grille (annexe 6 §1). Une touche prise ne descend pas a la toile : une fleche y deplacerait la selection. */
export function gesteClavier(e: EtatArbre, v: VerbesArbre) {
  const { lignes, index, deplies, memoire } = e;
  return (ev: KeyboardEvent<HTMLDivElement>) => {
    const t = ev.target as HTMLElement;
    if (t instanceof HTMLInputElement) {
      if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); v.finirRenommage(ev.key === 'Enter', t.value, true); }
      return;
    }
    const l = ligneDe(t), i = l ? index.get(l.id) : undefined, ligne = i === undefined ? undefined : lignes[i];
    if (!l || i === undefined || !ligne) return;
    const cel = celluleDe(t, l.el), groupe = ligne.noeud.genre === 'groupe', k = ev.key, total = lignes.length;
    const page = Math.max(1, Math.floor((e.panneau.current?.clientHeight ?? 270) / e.pas) - 1);
    let fait = true;
    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && k.startsWith('Arrow')) v.deplacerAuClavier(l.id, k);
    else if (k === 'ArrowDown' || k === 'ArrowUp') {
      const j = i + (k === 'ArrowDown' ? 1 : -1);
      if (j >= 0 && j < total) {
        if (ev.shiftKey) { memoire.ancre ??= l.id; v.choisirLigne(lignes[j]?.id ?? l.id, 'etendre'); }
        v.aller(j, cel);
      }
    } else if (k === 'Home') v.aller(0, cel);
    else if (k === 'End') v.aller(total - 1, cel);
    else if (k === 'PageDown') v.aller(i + page, cel);
    else if (k === 'PageUp') v.aller(i - page, cel);
    else if (k === 'ArrowRight') {
      if (cel >= 0) v.aller(i, Math.min(1, cel + 1));
      else if (groupe && !deplies.has(l.id)) v.basculer(l.id);
      else if (groupe) v.aller(i + 1);
      else v.aller(i, 0);
    } else if (k === 'ArrowLeft') {
      if (cel > 0) v.aller(i, cel - 1);
      else if (cel === 0) v.aller(i, -1);
      else if (groupe && deplies.has(l.id)) v.basculer(l.id);
      else if (ligne.parent !== null) v.aller(index.get(ligne.parent) ?? i);
    } else if (cel < 0 && k === 'Enter') { if (groupe) v.entrer(l.id); else v.choisirLigne(l.id, 'seul'); }
    else if (cel < 0 && k === ' ') v.choisirLigne(l.id, 'basculer');
    else if (k === 'F2') v.commencerRenommage(l.id);
    else if (k === '*') v.deplierFreres(ligne);
    else if (k === 'ContextMenu' || (ev.shiftKey && k === 'F10')) v.ouvrirMenu(l.id);
    else fait = false;
    if (fait) ev.preventDefault();
  };
}

/** Le glisser-deposer : une ligne posee sur un groupe y entre (au premier plan), posee sur une feuille se range juste sous elle. */
export function gestesDepot(e: EtatArbre, v: VerbesArbre) {
  const { dessin, sel } = e;
  const glisser = (ev: DragEvent<HTMLDivElement>) => {
    const l = ligneDe(ev.target);
    if (!l) return;
    ev.dataTransfer.setData(TYPE_GLISSE, ciblesDe(dessin, l.id, sel).join(' '));
    ev.dataTransfer.effectAllowed = 'move';
  };
  const survoler = (ev: DragEvent<HTMLDivElement>) => {
    const l = ligneDe(ev.target);
    if (!l || !ev.dataTransfer.types.includes(TYPE_GLISSE)) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    const mode = groupeDe(dessin, l.id) ? 'dans' : 'sous';
    if (e.depot?.id !== l.id || e.depot.mode !== mode) e.poserDepot({ id: l.id, mode });
  };
  const deposer = (ev: DragEvent<HTMLDivElement>) => {
    const l = ligneDe(ev.target), ids = ev.dataTransfer.getData(TYPE_GLISSE).split(' ').filter(Boolean);
    e.poserDepot(null);
    if (!l || !ids.length) return;
    ev.preventDefault();
    v.appliquerDeplacement(groupeDe(dessin, l.id) ? deplacerVers(dessin, ids, l.id) : deplacerVers(dessin, ids, parentDe(dessin, l.id), l.id), null);
  };
  const quitter = (ev: DragEvent<HTMLDivElement>) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) e.poserDepot(null); };
  const finir = () => e.poserDepot(null);
  return { glisser, survoler, deposer, quitter, finir };
}

// Un menu deroulant accessible (ADR-0006) : un bouton, un panneau d'elements avec leur raccourci, et
// la navigation au clavier d'un vrai menu (fleches, debut, fin, Echap, Tab). Le panneau se pose en
// position fixe sous le bouton : les barres d'outils defilent sur mobile et couperaient un panneau
// absolu. Il se ferme sur un clic au-dehors, sur Echap, au defilement et au redimensionnement.

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent as KE, type ReactNode } from 'react';
import { dernier, premier, suivant, voisinVertical } from '../../util/menu.js';
import { Icone, type NomIcone } from '../icones.js';
import { focusAuClavier } from './focusClavier.js';

export interface ElementMenu {
  id: string;
  libelle: string;
  icone?: NomIcone;
  /** Le raccourci, tel qu'on le lit : « Ctrl+Z ». */
  raccourci?: string;
  onClick?: () => void;
  desactive?: boolean;
  /** Un element a deux etats (grille, aimants) : la coche dit celui d'aujourd'hui. */
  coche?: boolean;
  /** Un choix parmi les elements de sa rubrique (un contexte, une machine) : `menuitemradio`, la coche dit le choix. */
  radio?: boolean;
  danger?: boolean;
  /** Une pastille de couleur a la place de l'icone (un nuancier). */
  pastille?: string;
  /** Un filet avant cet element. */
  separateur?: boolean;
  /** Pourquoi l'element est grise (son infobulle, annexe 6 §3) ; sans effet tant qu'il ne l'est pas. */
  raison?: string;
}

/**
 * Une partie d'un menu a plusieurs rubriques (le menu « Plus » des petits ecrans : Vue, Edition, Fichier). Chaque
 * rubrique est un `role="menu"` nomme par son titre, que le clavier parcourt d'un seul tenant avec les autres ;
 * `libre` est du contenu hors menu (le panneau d'export) qui suit ses elements.
 */
export interface SectionMenu {
  id: string;
  titre: string;
  elements?: readonly ElementMenu[];
  libre?: ReactNode;
}

interface Proprietes {
  /** Ce que lisent les lecteurs d'ecran et l'infobulle. */
  etiquette: string;
  /** Le texte visible du bouton ; absent, le bouton n'a que son icone. */
  libelle?: string;
  icone?: NomIcone;
  chevron?: boolean;
  elements?: readonly ElementMenu[];
  /** Du contenu libre sous les elements (le panneau d'export). Un clic dedans ne ferme pas le menu. */
  enfants?: ReactNode;
  /** Plusieurs rubriques titrees a la place de `elements` et `enfants` (un menu « Plus »). */
  sections?: readonly SectionMenu[];
  /** Le bord du bouton auquel le panneau s'aligne. */
  alignement?: 'gauche' | 'droite';
  className?: string;
  /**
   * Les rubriques en grille de tuiles (la palette des formes, ADR-0033) : un seul menu nomme `titreMenu`, un groupe par rubrique,
   * chaque element une tuile (son icone, son nom, sa lettre) ; les fleches vont a gauche et a droite, en haut et en bas.
   */
  grille?: boolean;
  /** Le nom du menu d'une grille, quand l'etiquette du bouton porte aussi son raccourci (« Formes (F) »). */
  titreMenu?: string;
  /** Un compteur : quand il change, le menu s'ouvre comme au clavier, le focus sur l'element coche (un raccourci, F). */
  demandeOuverture?: number;
}

interface Position { top: number; left?: number; right?: number }

/**
 * Ce qu'un menu ouvert dit au cadre qui le porte (l'editeur) : tant qu'un menu est ouvert, il porte l'action de l'instant, et le
 * cadre pose les autres actions pleines en secondaires (DESIGN.md, l'encre unique). Hors de tout fournisseur (la page), rien.
 */
const ContexteMenusOuverts = createContext<((ouvert: boolean) => void) | null>(null);
export const FournisseurMenusOuverts = ContexteMenusOuverts.Provider;

export function MenuDeroulant({ etiquette, libelle, icone, chevron = true, elements = [], enfants, sections, alignement = 'gauche', className, grille = false, titreMenu, demandeOuverture }: Proprietes) {
  const [ouvert, poserOuvert] = useState(false);
  const [position, poserPosition] = useState<Position | null>(null);
  const bouton = useRef<HTMLButtonElement>(null), panneau = useRef<HTMLDivElement>(null);
  const focusInitial = useRef<'premier' | 'dernier' | 'coche' | null>(null);
  const origine = useRef<{ top: number; left: number } | null>(null);
  const signaler = useContext(ContexteMenusOuverts);
  useEffect(() => {
    if (!ouvert || !signaler) return;
    signaler(true);
    return () => signaler(false);
  }, [ouvert, signaler]);

  const fermer = useCallback((rendreFocus: boolean) => {
    poserOuvert(false);
    if (rendreFocus) bouton.current?.focus();
  }, []);
  const ouvrir = (focus: 'premier' | 'dernier' | 'coche' | null) => {
    const r = bouton.current?.getBoundingClientRect();
    if (!r) return;
    focusInitial.current = focus;
    origine.current = { top: r.top, left: r.left };
    poserPosition(alignement === 'droite' ? { top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) } : { top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 220)) });
    poserOuvert(true);
  };

  const elementsActifs = (): HTMLButtonElement[] => Array.from(panneau.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? []);
  // A l'ouverture au clavier, le focus va a un element (dans une grille, a l'element coche) ; a la souris, au panneau lui-meme.
  useLayoutEffect(() => {
    if (!ouvert) return;
    const liste = elementsActifs(), d = liste.map(b => b.disabled), coche = liste.findIndex(b => b.getAttribute('aria-checked') === 'true' && !b.disabled);
    const voulu = focusInitial.current === 'premier' && grille ? 'coche' : focusInitial.current;
    const i = voulu === 'dernier' ? dernier(d) : voulu === 'coche' ? (coche >= 0 ? coche : premier(d)) : voulu === 'premier' ? premier(d) : -1;
    (liste[i] ?? panneau.current)?.focus({ preventScroll: true });
  }, [ouvert, grille]);

  // Un raccourci global (F pour les formes) demande l'ouverture : le compteur a change depuis le dernier rendu.
  const demandeVue = useRef(demandeOuverture);
  useEffect(() => {
    if (demandeOuverture === demandeVue.current) return;
    demandeVue.current = demandeOuverture;
    if (!ouvert) ouvrir('coche');
    else elementsActifs().find(b => b.getAttribute('aria-checked') === 'true')?.focus();
  });

  // Le panneau tient dans l'ecran : un contenu large (le panneau d'export) ne doit pas sortir d'un cote ou de l'autre.
  // On mesure la largeur de mise en page (`offsetWidth`), que l'animation d'entree (une echelle) ne fausse pas.
  useLayoutEffect(() => {
    const el = panneau.current;
    if (!ouvert || !el) return;
    const marge = 8, largeur = el.offsetWidth, ecran = window.innerWidth, hauteur = el.offsetHeight, bas = window.innerHeight;
    poserPosition(p0 => {
      if (!p0) return p0;
      // Un bouton bas dans l'ecran (la visionneuse de la conversion) : le panneau s'ouvre au-dessus s'il y tient, sinon il
      // remonte juste assez pour finir dans l'ecran. Les barres du haut ne sont jamais concernees.
      const haut = origine.current?.top ?? p0.top;
      const p = p0.top + hauteur <= bas - marge ? p0 : { ...p0, top: haut - 4 - hauteur >= marge ? haut - 4 - hauteur : Math.max(marge, bas - marge - hauteur) };
      if (p.right !== undefined) {
        const gauche = ecran - p.right - largeur;
        return gauche < marge ? { ...p, right: Math.max(marge, p.right - (marge - gauche)) } : p;
      }
      const gauche = p.left ?? marge, droite = gauche + largeur;
      return droite > ecran - marge ? { ...p, left: Math.max(marge, ecran - marge - largeur) } : p;
    });
  }, [ouvert]);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => { const t = e.target as Node; if (!panneau.current?.contains(t) && !bouton.current?.contains(t)) fermer(false); };
    const ferme = () => fermer(false);
    // Un defilement ne ferme le menu que s'il a deplace le bouton : celui du panneau lui-meme, ou celui
    // qu'une activation a fait avant l'ouverture, laissent le menu en place.
    const defile = () => {
      const r = bouton.current?.getBoundingClientRect(), o = origine.current;
      if (!r || !o || Math.abs(r.top - o.top) > 1 || Math.abs(r.left - o.left) > 1) fermer(false);
    };
    window.addEventListener('pointerdown', dehors);
    window.addEventListener('resize', ferme);
    window.addEventListener('scroll', defile, true);
    return () => { window.removeEventListener('pointerdown', dehors); window.removeEventListener('resize', ferme); window.removeEventListener('scroll', defile, true); };
  }, [ouvert, fermer]);

  const clavierPanneau = (e: KE<HTMLDivElement>) => {
    const liste = elementsActifs(), d = liste.map(b => b.disabled);
    const courant = liste.indexOf(document.activeElement as HTMLButtonElement);
    const aller = (i: number) => { if (i >= 0) focusAuClavier(liste[i]); };
    // Dans une grille, gauche et droite suivent l'ordre (en boucle), haut et bas changent de rangee a la case la plus proche.
    const vertical = (sens: 1 | -1) => {
      if (!grille || courant < 0) return suivant(d, courant, sens);
      const cases = liste.map(b => { const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, l: r.width, h: r.height, desactive: b.disabled }; });
      return voisinVertical(cases, courant, sens);
    };
    if (e.key === 'ArrowDown') { e.preventDefault(); aller(vertical(1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); aller(vertical(-1)); }
    else if (grille && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); aller(suivant(d, courant, e.key === 'ArrowRight' ? 1 : -1)); }
    else if (e.key === 'Home') { e.preventDefault(); aller(premier(d)); }
    else if (e.key === 'End') { e.preventDefault(); aller(dernier(d)); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(true); }
    // Tab sort d'un menu d'elements ; dans un contenu libre (les autres formats, leurs options), il va d'un controle a l'autre, et le
    // menu ne se ferme que quand le focus le quitte (ci-dessous). Avant, Tab fermait tout : ce contenu ne s'atteignait pas au clavier.
    // Un menu a rubriques peut porter un contenu libre entre deux rubriques (les autres formats du menu Fichier) : Tab, depuis un
    // element, y entre s'il en vient un apres lui, au lieu de fermer ; sans lui, ce contenu ne s'atteignait qu'a la souris.
    else if (e.key === 'Tab' && (e.target as HTMLElement).closest('[role="menu"]')) {
      const libre = e.shiftKey ? null : premierLibreApres(panneau.current, e.target as HTMLElement);
      if (libre) { e.preventDefault(); focusAuClavier(libre); }
      else fermer(false);
    }
  };
  const quitte = (e: FocusEvent<HTMLDivElement>) => {
    const vers = e.relatedTarget as Node | null;
    if (vers && !panneau.current?.contains(vers) && !bouton.current?.contains(vers)) fermer(false);
  };
  const clavierBouton = (e: KE<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); ouvrir('premier'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ouvrir('dernier'); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (ouvert) fermer(false); else ouvrir('premier'); }
  };

  // Pas d'aria-controls : avec aria-haspopup, axe le range toujours « a relire » (il ne sait pas dire si le panneau
  // existe), et aria-haspopup + aria-expanded disent deja ce que les lecteurs d'ecran utilisent d'un menu-bouton.
  return (
    <span className={'menu-deroulant' + (className ? ' ' + className : '')}>
      <button ref={bouton} type="button" className={libelle ? 'menu-bouton texte' : 'icone-bouton menu-bouton'} aria-haspopup="menu" aria-expanded={ouvert}
        title={etiquette} aria-label={libelle ? undefined : etiquette}
        onClick={() => { if (ouvert) fermer(false); else ouvrir(null); }} onKeyDown={clavierBouton}>
        {icone ? <Icone nom={icone} /> : null}
        {libelle ? <span>{libelle}</span> : null}
        {chevron ? <Icone nom="chevron-bas" taille={12} /> : null}
      </button>
      {ouvert && position ? (
        <div ref={panneau} className={'menu-panneau' + (grille ? ' menu-panneau-grille' : '')} tabIndex={-1} style={position} onKeyDown={clavierPanneau} onBlur={quitte}>
          {/* Le menu n'est que ses elements : un contenu libre (l'export) n'est pas un enfant permis d'un role menu. */}
          {grille && sections ? <GrilleElements titre={titreMenu ?? etiquette} sections={sections} fermer={fermer} /> : sections ? sections.map(sc => (
            <div key={sc.id} className="menu-rubrique">
              <p className="menu-titre" aria-hidden="true">{sc.titre}</p>
              {sc.elements?.length ? <ListeElements titre={sc.titre} elements={sc.elements} fermer={fermer} /> : null}
              {sc.libre ? <div className="menu-libre">{sc.libre}</div> : null}
            </div>
          )) : (
            <>
              {elements.length ? <ListeElements titre={etiquette} elements={elements} fermer={fermer} /> : null}
              {enfants ? <div className="menu-libre">{enfants}</div> : null}
            </>
          )}
        </div>
      ) : null}
    </span>
  );
}

/**
 * Un menu en grille : un seul `role="menu"`, un `role="group"` par rubrique (nomme par son titre, que l'on voit mais que le lecteur
 * d'ecran lit par le nom du groupe), chaque element une tuile : l'icone, le nom, la lettre s'il en a une. Un choix exclusif est un
 * `menuitemradio`, coche quand il est le choix du moment.
 */
function GrilleElements({ titre, sections, fermer }: { titre: string; sections: readonly SectionMenu[]; fermer: (rendreFocus: boolean) => void }) {
  const base = useId();
  return (
    <div role="menu" aria-label={titre} className="menu-grille">{sections.map(sc => (
      <div key={sc.id} role="group" aria-labelledby={base + sc.id} className="menu-groupe">
        <span id={base + sc.id} className="menu-titre" aria-hidden="true">{sc.titre}</span>
        <div className="menu-tuiles" role="none">{(sc.elements ?? []).map(el => (
          <button key={el.id} type="button" role={el.radio ? 'menuitemradio' : 'menuitem'} aria-checked={el.radio ? !!el.coche : undefined} disabled={el.desactive}
            className="menu-tuile" onClick={() => { fermer(true); el.onClick?.(); }}>
            {el.icone ? <Icone nom={el.icone} taille={22} /> : null}
            <span className="menu-libelle">{el.libelle}</span>
            {el.raccourci ? <kbd className="menu-raccourci">{el.raccourci}</kbd> : null}
          </button>
        ))}</div>
      </div>
    ))}</div>
  );
}

/** Les elements d'un menu : un `role="menu"` nomme, une ligne par element, un filet avant ceux qui le demandent. */
function ListeElements({ titre, elements, fermer }: { titre: string; elements: readonly ElementMenu[]; fermer: (rendreFocus: boolean) => void }) {
  return (
    <div role="menu" aria-label={titre}>{elements.map(el => (
      <div key={el.id} className="menu-ligne">
        {el.separateur ? <hr className="menu-filet" /> : null}
        <button type="button" role={el.radio ? 'menuitemradio' : el.coche !== undefined ? 'menuitemcheckbox' : 'menuitem'} aria-checked={el.coche} disabled={el.desactive} className={'menu-element' + (el.danger ? ' danger' : '')}
          title={el.desactive ? el.raison : undefined} onClick={() => { fermer(true); el.onClick?.(); }}>
          <span className="menu-coche">{el.coche ? <Icone nom="coche" taille={14} /> : el.pastille ? <span className="menu-pastille" style={{ background: el.pastille }} /> : el.icone ? <Icone nom={el.icone} taille={14} /> : null}</span>
          <span className="menu-libelle">{el.libelle}</span>
          {el.raccourci ? <kbd className="menu-raccourci">{el.raccourci}</kbd> : null}
        </button>
      </div>
    ))}</div>
  );
}

/** Le premier controle tabulable d'un contenu libre qui suit `depuis` dans le panneau (ordre du document), ou null. */
function premierLibreApres(panneau: HTMLElement | null, depuis: HTMLElement): HTMLElement | null {
  const candidats = panneau?.querySelectorAll<HTMLElement>('.menu-libre :is(button, summary, select, input, a[href]):not([disabled]):not([tabindex="-1"])') ?? [];
  for (const c of candidats) {
    // Un controle d'un <details> ferme n'est pas visible : seul son resume se tabule.
    const ferme = c.closest('details:not([open])');
    if (ferme && c.parentElement !== ferme) continue;
    if (depuis.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) return c;
  }
  return null;
}

// Un menu deroulant accessible (ADR-0006) : un bouton, un panneau d'elements avec leur raccourci, et
// la navigation au clavier d'un vrai menu (fleches, debut, fin, Echap, Tab). Le panneau se pose en
// position fixe sous le bouton : les barres d'outils defilent sur mobile et couperaient un panneau
// absolu. Il se ferme sur un clic au-dehors, sur Echap, au defilement et au redimensionnement.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as KE, type ReactNode } from 'react';
import { dernier, premier, suivant } from '../../util/menu.js';
import { Icone, type NomIcone } from '../icones.js';

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
  danger?: boolean;
  /** Une pastille de couleur a la place de l'icone (un nuancier). */
  pastille?: string;
  /** Un filet avant cet element. */
  separateur?: boolean;
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
}

interface Position { top: number; left?: number; right?: number }

export function MenuDeroulant({ etiquette, libelle, icone, chevron = true, elements = [], enfants, sections, alignement = 'gauche', className }: Proprietes) {
  const [ouvert, poserOuvert] = useState(false);
  const [position, poserPosition] = useState<Position | null>(null);
  const bouton = useRef<HTMLButtonElement>(null), panneau = useRef<HTMLDivElement>(null);
  const focusInitial = useRef<'premier' | 'dernier' | null>(null);
  const origine = useRef<{ top: number; left: number } | null>(null);

  const fermer = useCallback((rendreFocus: boolean) => {
    poserOuvert(false);
    if (rendreFocus) bouton.current?.focus();
  }, []);
  const ouvrir = (focus: 'premier' | 'dernier' | null) => {
    const r = bouton.current?.getBoundingClientRect();
    if (!r) return;
    focusInitial.current = focus;
    origine.current = { top: r.top, left: r.left };
    poserPosition(alignement === 'droite' ? { top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) } : { top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 220)) });
    poserOuvert(true);
  };

  const elementsActifs = (): HTMLButtonElement[] => Array.from(panneau.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? []);
  // A l'ouverture au clavier, le focus va a un element ; a la souris, au panneau lui-meme.
  useLayoutEffect(() => {
    if (!ouvert) return;
    const liste = elementsActifs(), d = liste.map(b => b.disabled);
    const i = focusInitial.current === 'dernier' ? dernier(d) : focusInitial.current === 'premier' ? premier(d) : -1;
    (liste[i] ?? panneau.current)?.focus({ preventScroll: true });
  }, [ouvert]);

  // Le panneau tient dans l'ecran : un contenu large (le panneau d'export) ne doit pas sortir d'un cote ou de l'autre.
  // On mesure la largeur de mise en page (`offsetWidth`), que l'animation d'entree (une echelle) ne fausse pas.
  useLayoutEffect(() => {
    const el = panneau.current;
    if (!ouvert || !el) return;
    const marge = 8, largeur = el.offsetWidth, ecran = window.innerWidth;
    poserPosition(p => {
      if (!p) return p;
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
    const aller = (i: number) => { if (i >= 0) liste[i]?.focus(); };
    if (e.key === 'ArrowDown') { e.preventDefault(); aller(suivant(d, courant, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); aller(suivant(d, courant, -1)); }
    else if (e.key === 'Home') { e.preventDefault(); aller(premier(d)); }
    else if (e.key === 'End') { e.preventDefault(); aller(dernier(d)); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(true); }
    else if (e.key === 'Tab') fermer(false);
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
        <div ref={panneau} className="menu-panneau" tabIndex={-1} style={position} onKeyDown={clavierPanneau}>
          {/* Le menu n'est que ses elements : un contenu libre (l'export) n'est pas un enfant permis d'un role menu. */}
          {sections ? sections.map(sc => (
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

/** Les elements d'un menu : un `role="menu"` nomme, une ligne par element, un filet avant ceux qui le demandent. */
function ListeElements({ titre, elements, fermer }: { titre: string; elements: readonly ElementMenu[]; fermer: (rendreFocus: boolean) => void }) {
  return (
    <div role="menu" aria-label={titre}>{elements.map(el => (
      <div key={el.id} className="menu-ligne">
        {el.separateur ? <hr className="menu-filet" /> : null}
        <button type="button" role={el.coche !== undefined ? 'menuitemcheckbox' : 'menuitem'} aria-checked={el.coche} disabled={el.desactive} className={'menu-element' + (el.danger ? ' danger' : '')}
          onClick={() => { fermer(true); el.onClick?.(); }}>
          <span className="menu-coche">{el.coche ? <Icone nom="coche" taille={14} /> : el.pastille ? <span className="menu-pastille" style={{ background: el.pastille }} /> : el.icone ? <Icone nom={el.icone} taille={14} /> : null}</span>
          <span className="menu-libelle">{el.libelle}</span>
          {el.raccourci ? <kbd className="menu-raccourci">{el.raccourci}</kbd> : null}
        </button>
      </div>
    ))}</div>
  );
}

// Le focus a l'ouverture et a la fermeture de l'editeur plein ecran. Il est une fenetre modale : en
// s'ouvrant il prend le focus (sur la toile), il met le reste de la page hors d'atteinte (inert : ni
// Tab, ni lecteur d'ecran ne vont derriere lui), et en se fermant il rend tout cela a l'hote, qui
// retrouve le focus la ou il l'avait laisse. Indispensable a l'embarquement : le bouton « Éditer » de
// l'hote doit etre refocalise, pas le debut de sa page.

import { useEffect, useRef, type RefObject } from 'react';

/** Ce que l'editeur doit montrer en premier : la toile, ou a defaut le premier bouton (l'ecran d'erreur). */
function premierFocus(racine: HTMLElement): HTMLElement | null {
  return racine.querySelector<HTMLElement>('.editeur-svg-toile') ?? racine.querySelector<HTMLElement>('button');
}

/**
 * Rend inertes les freres de la racine qui ne le sont pas deja, et rend la fonction qui les retablit. Ils sont
 * aussi caches (`visibility`) : l'editeur les recouvre d'un fond plein, rien ne se perd a l'ecran, mais un
 * element inerte reste dans la pile que les outils d'audit lisent derriere chaque texte, et le contraste d'un
 * texte de l'editeur y devenait « impossible a determiner ». Le style en ligne de l'hote est remis tel quel.
 */
function isolerLePeuple(racine: HTMLElement, cacher = true): () => void {
  const touches: Array<{ e: HTMLElement; visibilite: string }> = [];
  // Les freres de la racine : ceux du corps pour l'editeur, ceux de l'editeur pour une boite posee dedans.
  for (const frere of Array.from((racine.parentElement ?? document.body).children)) {
    if (!(frere instanceof HTMLElement) || frere === racine || frere.inert) continue;
    touches.push({ e: frere, visibilite: frere.style.visibility });
    frere.inert = true;
    if (cacher) frere.style.visibility = 'hidden';
  }
  return () => { for (const t of touches) { t.e.inert = false; t.e.style.visibility = t.visibilite; } };
}

export function useFocusEditeur(racine: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const el = racine.current;
    if (!el) return;
    const avant = document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement ? document.activeElement : null;
    const retablir = isolerLePeuple(el);
    premierFocus(el)?.focus({ preventScroll: true });
    return () => {
      retablir();
      // Le focus de l'hote, s'il avait un element precis et qu'il est encore la.
      if (avant && avant !== document.body && avant.isConnected) avant.focus({ preventScroll: true });
    };
  }, [racine]);
}

/**
 * Une boite de dialogue modale (A propos et credits) : a son ouverture elle prend le focus et rend inerte ce qui l'entoure (ni Tab ni
 * lecteur d'ecran n'y vont) ; Echap la ferme, et le focus retourne a ce qui l'avait. Echap est pris en phase de capture sur la
 * fenetre, quel que soit l'element focalise : sans cela, l'Echap de la boite fermerait aussi l'editeur derriere elle
 * (Clavier.ts lit la meme touche). Tab ne piege rien : la boite se quitte par Echap ou « Fermer », et Tab, inerte autour, sort au navigateur.
 * `racine` est ce qui est pose a cote de ce qu'elle masque (le voile), `cible` la boite qui prend le focus.
 */
export function useFocusDialogue(racine: RefObject<HTMLElement | null>, cible: RefObject<HTMLElement | null>, fermer: () => void): void {
  const fermeture = useRef(fermer);
  fermeture.current = fermer;
  useEffect(() => {
    const el = racine.current;
    if (!el) return;
    const avant = document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement ? document.activeElement : null;
    const retablir = isolerLePeuple(el, false);
    (cible.current ?? el).focus({ preventScroll: true });
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      fermeture.current();
    };
    window.addEventListener('keydown', touche, true);
    return () => {
      window.removeEventListener('keydown', touche, true);
      retablir();
      if (avant && avant !== document.body && avant.isConnected) avant.focus({ preventScroll: true });
    };
  }, [racine, cible]);
}

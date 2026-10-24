// Le focus a l'ouverture et a la fermeture de l'editeur plein ecran. Il est une fenetre modale : en
// s'ouvrant il prend le focus (sur la toile), il met le reste de la page hors d'atteinte (inert : ni
// Tab, ni lecteur d'ecran ne vont derriere lui), et en se fermant il rend tout cela a l'hote, qui
// retrouve le focus la ou il l'avait laisse. Indispensable a l'embarquement : le bouton « Éditer » de
// l'hote doit etre refocalise, pas le debut de sa page.

import { useEffect, type RefObject } from 'react';

/** Ce que l'editeur doit montrer en premier : la toile, ou a defaut le premier bouton (l'ecran d'erreur). */
function premierFocus(racine: HTMLElement): HTMLElement | null {
  return racine.querySelector<HTMLElement>('.editeur-svg-toile') ?? racine.querySelector<HTMLElement>('button');
}

/** Rend inertes les freres de la racine qui ne le sont pas deja, et rend la fonction qui les retablit. */
function isolerLePeuple(racine: HTMLElement): () => void {
  const touches: HTMLElement[] = [];
  for (const frere of Array.from(document.body.children)) {
    if (!(frere instanceof HTMLElement) || frere === racine || frere.inert) continue;
    frere.inert = true;
    touches.push(frere);
  }
  return () => { for (const e of touches) e.inert = false; };
}

export function useFocusEditeur(racine: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const el = racine.current;
    if (!el) return;
    const avant = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const retablir = isolerLePeuple(el);
    premierFocus(el)?.focus({ preventScroll: true });
    return () => {
      retablir();
      // Le focus de l'hote, s'il avait un element precis et qu'il est encore la.
      if (avant && avant !== document.body && avant.isConnected) avant.focus({ preventScroll: true });
    };
  }, [racine]);
}

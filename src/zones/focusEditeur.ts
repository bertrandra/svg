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

/**
 * Rend inertes les freres de la racine qui ne le sont pas deja, et rend la fonction qui les retablit. Ils sont
 * aussi caches (`visibility`) : l'editeur les recouvre d'un fond plein, rien ne se perd a l'ecran, mais un
 * element inerte reste dans la pile que les outils d'audit lisent derriere chaque texte, et le contraste d'un
 * texte de l'editeur y devenait « impossible a determiner ». Le style en ligne de l'hote est remis tel quel.
 */
function isolerLePeuple(racine: HTMLElement): () => void {
  const touches: Array<{ e: HTMLElement; visibilite: string }> = [];
  for (const frere of Array.from(document.body.children)) {
    if (!(frere instanceof HTMLElement) || frere === racine || frere.inert) continue;
    touches.push({ e: frere, visibilite: frere.style.visibility });
    frere.inert = true;
    frere.style.visibility = 'hidden';
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

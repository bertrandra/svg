// La region vocale de l'editeur : UNE seule zone « polite » pour tout ce qu'un lecteur d'ecran doit
// entendre (selection, outil, point actif, zoom au clavier, et chaque phrase dite par `annoncer` ou
// `dire` : annuler, creer, supprimer, erreurs). La barre d'etat, elle, n'est plus une region vivante :
// elle contient des boutons et un compteur, qu'on ne veut pas relire a chaque modification.

import { useEffect, useRef, useState } from 'react';
import { useDessin, useInterface } from './contexteEditeur.js';
import { phraseOutil, phrasePoint, phraseSelection, phraseZoom } from './annonces.js';

const memes = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Ce que le dernier rendu a deja dit : de quoi ne parler que de ce qui change. */
interface Vu { rang: number; sel: readonly string[]; outil: string; point: number | null; formes: number; zoom: number }

export function RegionVocale() {
  const mo = useDessin(), ui = useInterface();
  const [texte, poserTexte] = useState('');
  const vu = useRef<Vu>({ rang: ui.annonce.rang, sel: mo.sel, outil: ui.outil, point: ui.point, formes: mo.dessin.formes.length, zoom: ui.vues.vue.zoom });
  const minuteur = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dernierAppui = useRef(-Infinity);

  useEffect(() => {
    const appui = () => { dernierAppui.current = performance.now(); };
    window.addEventListener('keydown', appui, true);
    return () => { window.removeEventListener('keydown', appui, true); clearTimeout(minuteur.current); };
  }, []);

  // Vider puis remplir : un lecteur d'ecran ne relit pas un texte qui n'a pas change, et la meme phrase
  // (« Annulé. » deux fois de suite) doit pourtant etre redite. Un court delai laisse le vide se constater.
  const parler = (phrase: string, delai: number) => {
    clearTimeout(minuteur.current);
    poserTexte('');
    minuteur.current = setTimeout(() => poserTexte(phrase), delai);
  };

  // Apres chaque rendu : une phrase au plus, la plus precise d'abord (ce qu'une action a dit, puis la selection, l'outil, le point).
  useEffect(() => {
    const avant = vu.current, { sel, dessin, formeSeule } = mo;
    let phrase = '', delai = 60;
    if (ui.annonce.rang !== avant.rang) phrase = ui.annonce.texte;
    else if (sel !== avant.sel && !memes(sel, avant.sel)) phrase = phraseSelection(dessin, sel, dessin.formes.length > avant.formes);
    else if (ui.outil !== avant.outil) phrase = phraseOutil(ui.outil);
    else if (ui.point !== avant.point && ui.point !== null && formeSeule) phrase = phrasePoint(formeSeule, ui.point);
    else if (ui.vues.vue.zoom !== avant.zoom && performance.now() - dernierAppui.current < 600) { phrase = phraseZoom(ui.vues.vue.zoom); delai = 300; }
    vu.current = { rang: ui.annonce.rang, sel, outil: ui.outil, point: ui.point, formes: dessin.formes.length, zoom: ui.vues.vue.zoom };
    if (phrase) parler(phrase, delai);
  });

  return <div className="annonces sr-only" role="status" aria-live="polite" aria-atomic="true">{texte}</div>;
}

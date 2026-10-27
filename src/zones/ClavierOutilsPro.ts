// Les raccourcis des regles et des reperes (ADR-0038), et les touches d'un repere choisi. Ecoutes a la capture : ils passent
// avant ceux de l'editeur (Clavier.ts), qui ignore une touche deja prise (`defaultPrevented`). Ainsi Suppr retire le repere choisi
// sans supprimer la selection, et Maj+R n'appelle pas l'outil rectangle.
//
//   Maj+R          afficher ou masquer les regles (Ctrl+R recharge la page dans tout navigateur)
//   Ctrl+;         afficher ou masquer les reperes
//   Ctrl+Alt+;     verrouiller ou deverrouiller les reperes
//   Ctrl+Maj+;     effacer les reperes
//   un repere choisi : Suppr le retire, les fleches le deplacent (Maj : dix fois plus), Entree ouvre son champ, Echap le rend.

import { useEffect, useRef } from 'react';
import { pasDeplacement } from '../engine/navigation.js';
import { useActions, useDessin } from './contexteEditeur.js';
import { nomRepere, useActionsRegles, useRegles } from './contexteRegles.js';
import { t } from '../util/i18n.js';

/**
 * La touche point-virgule, sur tout clavier : son caractere, ou sa place (QWERTY, et Option sur Mac qui en change le caractere),
 * ou, avec Maj, ce qu'elle donne en QWERTY (« : ») et en AZERTY (« . » sur la touche du point-virgule).
 */
export function estPointVirgule(e: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey'>): boolean {
  if (e.key === ';' || e.code === 'Semicolon') return true;
  return e.shiftKey && (e.key === ':' || (e.key === '.' && e.code === 'Comma'));
}

export function useClavierOutilsPro(): void {
  const rg = useRegles(), arg = useActionsRegles(), mo = useDessin(), ac = useActions();
  const courant = useRef({ rg, mo });
  courant.current = { rg, mo };
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const cible = e.target as HTMLElement | null;
      if (cible && (/^(INPUT|SELECT|TEXTAREA)$/.test(cible.tagName) || cible.isContentEditable)) return;
      if (cible?.closest('.menu-panneau, .bulle-visite')) return;
      const { rg: r, mo: m } = courant.current, mod = e.ctrlKey || e.metaKey;
      const prendre = (faire: () => void) => { e.preventDefault(); e.stopPropagation(); faire(); };
      if (mod && estPointVirgule(e)) {
        if (e.shiftKey && !e.altKey) prendre(arg.effacer);
        else if (e.altKey && !e.shiftKey) prendre(arg.basculerVerrou);
        else if (!e.altKey && !e.shiftKey) prendre(arg.basculerReperes);
        return;
      }
      if (!mod && !e.altKey && e.shiftKey && e.key.toLowerCase() === 'r') { prendre(arg.basculerRegles); return; }
      const choisi = r.choisi;
      // Les touches d'un repere choisi ne valent que sur la toile (ou sans focus) : ailleurs, elles sont au controle qui l'a.
      if (!choisi || mod || !(cible === null || cible === document.body || cible.closest('.editeur-svg-toile'))) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { prendre(() => arg.supprimer(choisi)); return; }
      if (e.key === 'Escape') { prendre(() => { arg.choisir(null); ac.annoncer(t('Repère rendu.')); }); return; }
      if (e.key === 'Enter') { prendre(() => arg.ouvrir('reperes', choisi)); return; }
      const sens = choisi.axe === 'h' ? { ArrowUp: -1, ArrowDown: 1 } : { ArrowLeft: -1, ArrowRight: 1 };
      const k = (sens as Record<string, number | undefined>)[e.key];
      // Une fleche de travers ne fait rien : elle ne doit pas deplacer, derriere le repere choisi, les formes choisies.
      if (k === undefined) { if (e.key.startsWith('Arrow')) prendre(() => undefined); return; }
      prendre(() => {
        const valeur = choisi.valeur + k * pasDeplacement(m.dessin.vb, e.shiftKey);
        arg.deplacer(choisi, valeur);
        ac.annoncer(nomRepere({ axe: choisi.axe, valeur: Number(valeur.toFixed(3)) }, r.unite) + '.');
      });
    };
    window.addEventListener('keydown', touche, true);
    return () => window.removeEventListener('keydown', touche, true);
  }, [arg, ac]);
}

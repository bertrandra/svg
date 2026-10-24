// Le point d'entree du bundle d'embarquement (scripts/embarquer.mjs) : pose `window.EditeurSvg`.
// Le composant et l'API sont dans src/zones/embarque.tsx ; ici, seulement ce que seul le build
// connait : la version du paquet et le texte des feuilles de style (le module virtuel
// `feuille-editeur`, assemble par scripts/feuilles.mjs), que l'API cantonne a la racine de l'editeur.
import { creerApi } from '../../src/zones/embarque.js';
import feuille from 'feuille-editeur';

declare const VERSION_EMBARQUEE: string;

(window as unknown as { EditeurSvg: unknown }).EditeurSvg = creerApi(VERSION_EMBARQUEE, feuille);

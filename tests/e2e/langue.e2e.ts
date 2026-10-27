// L'interface en anglais (ADR-0042) sur la page construite : le reglage `svg.langue` pose puis la page rechargee, `html[lang=en]`,
// un texte traduit a l'accueil, le selecteur de l'accueil et le menu Aide de l'editeur qui changent de langue (reglage ecrit, page
// rechargee) ; l'editeur entier traduit (barre, panneaux, parcours Cricut sans un mot de francais), le dictionnaire charge par
// l'amorce AVANT le moteur ; et en francais, le defaut, rien ne change.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, ouvrirExemple, ouvrirMenu, pilote, textesDe } from './aide.js';

/** Les elements du menu Aide de l'editeur, dans la langue de la page (le menu lui-meme se prend par sa classe, pas par son nom). */
const elementsAide = async (page: Page): Promise<string[]> => {
  await ouvrirMenu(page, 'Aide');
  return textesDe(page.getByRole('menu', { name: /^(?:Aide|Help)$/ }).getByRole('menuitem'));
};
const AIDE_FR = ['Visite guidée', 'Raccourcis clavier', 'Guide de l’éditeur', 'La Cricut, c’est simple', 'Language: English'];
const AIDE_EN = ['Guided tour', 'Keyboard shortcuts', 'Editor guide (in French)', 'Cricut made simple (in French)', 'Langue : français'];

/** Un mot francais qui n'a rien a faire dans une interface anglaise : une lettre accentuee, un guillemet francais. */
const FRANCAIS = /[àâçéèêëîïôûùüœÀÂÇÉÈÊËÎÏÔÛÙÜŒ«»]/;

/** Les noms des menus de la barre de l'editeur, tels que la barre les annonce. */
const menusDeLaBarre = (page: Page): Promise<string[]> => page.locator('.editeur-barre [aria-haspopup=menu]').evaluateAll(
  l => l.map(e => (e.getAttribute('aria-label') ?? e.textContent ?? '').trim())
);

/** Choisit la Cricut Maker dans le selecteur de la barre et attend le panneau Cricut. */
async function choisirCricutMaker(page: Page): Promise<void> {
  await page.locator('.selecteur-contexte .menu-bouton').click();
  await page.getByRole('menuitemradio', { name: /^Cricut Maker/ }).click();
  await page.locator('.panneau-cricut').waitFor();
}

const CHAPEAU_FR = 'Ouvrez un dessin vectoriel, convertissez une image, ou prenez une forme dans la bibliothèque ; retouchez en plein écran comme dans un logiciel de dessin, et récupérez un fichier propre, pour l’écran ou pour une machine de découpe. Rien ne quitte votre navigateur.';
const CHAPEAU_EN = 'Open a vector drawing, convert an image, or pick a shape from the library; edit it full screen as in a drawing application, and get a clean file back, for the screen or for a cutting machine. Nothing leaves your browser.';

describe('la langue de l interface', () => {
  const navigateur = pilote();

  it('est le francais par defaut : rien n est garde, rien ne change', async () => {
    const { page } = await navigateur.ouvrir();
    expect(await page.locator('html').getAttribute('lang')).toBe('fr');
    expect(await page.getByRole('heading', { level: 1 }).textContent()).toBe('Éditeur SVG');
    expect((await page.locator('.tete p').textContent())?.replace(/\u00a0/g, ' ')).toBe(CHAPEAU_FR);
    expect(await page.evaluate(() => localStorage.getItem('svg.langue'))).toBeNull();
    const choix = page.getByLabel('Langue');
    expect(await choix.inputValue()).toBe('fr');
    expect(await textesDe(choix.locator('option'))).toEqual(['Français', 'English']);
    // Le dictionnaire anglais ne se charge pas pour rien : aucune balise <script> vers langue-en.js.
    expect(await page.evaluate(() => '__langueSvg_en' in window)).toBe(false);
  });

  it('en anglais : html[lang=en], le dictionnaire charge, l accueil traduit, le selecteur sur English', async () => {
    const { page } = await navigateur.ouvrir({ langue: 'en' });
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    await page.getByRole('heading', { level: 1, name: 'SVG editor' }).waitFor();
    expect((await page.locator('.tete p').textContent())?.replace(/\u00a0/g, ' ')).toBe(CHAPEAU_EN);
    expect(await page.evaluate(() => '__langueSvg_en' in window)).toBe(true);
    const choix = page.getByLabel('Language');
    expect(await choix.inputValue()).toBe('en');
    // Le menu Aide de l'editeur, traduit, propose le retour au francais, dans sa langue.
    await ouvrirExemple(page);
    expect(await elementsAide(page)).toEqual(AIDE_EN);
    await page.getByRole('menuitem', { name: 'Langue : français' }).click();
    await page.getByRole('heading', { level: 1, name: 'Éditeur SVG' }).waitFor();
    expect(await page.locator('html').getAttribute('lang')).toBe('fr');
    expect(await page.evaluate(() => localStorage.getItem('svg.langue'))).toBe(JSON.stringify({ langue: 'fr' }));
  });

  it('le selecteur de l accueil ecrit le reglage et recharge la page dans l autre langue', async () => {
    const { page } = await navigateur.ouvrir();
    await page.getByLabel('Langue').selectOption('en');
    await page.getByRole('heading', { level: 1, name: 'SVG editor' }).waitFor();
    expect(await page.evaluate(() => localStorage.getItem('svg.langue'))).toBe(JSON.stringify({ langue: 'en' }));
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    // Le menu Aide, en anglais, nomme le retour ; au bureau comme la page le montre, il reste en dernier.
    await ouvrirExemple(page);
    await attend(() => elementsAide(page)).toEqual(AIDE_EN);
  });

  it('l editeur en anglais : lang, la barre (View, Edit), le panneau Drawing, puis Ready for Cricut sans un mot de francais', async () => {
    const { page } = await navigateur.ouvrir({ langue: 'en', largeur: 1280, hauteur: 800 });
    // L'amorce : le dictionnaire est arrive AVANT le moteur (une balise ecrite par la page, pas injectee par preparerLangue).
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)['__langueSvgLangue'])).toBe('en');
    expect(await page.locator('script[src="langue-en.js"]').count()).toBe(1);
    await ouvrirExemple(page);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    const menus = await menusDeLaBarre(page);
    expect(menus).toEqual(expect.arrayContaining(['View', 'Edit', 'Machine: Generic', 'Help', 'File']));
    expect(menus.filter(m => FRANCAIS.test(m))).toEqual([]);
    expect(await textesDe(page.locator('.editeur-svg h3', { hasText: /^Drawing$/ }).first())).toEqual(['Drawing']);
    await choisirCricutMaker(page);
    expect(await textesDe(page.locator('.panneau-cricut details.section > summary > span').first())).toEqual(['Ready for Cricut']);
    // Aucun texte du panneau Cricut (constats, materiaux, tapis, export) ne garde un mot francais.
    const texte = (await page.locator('.panneau-cricut').innerText()).replace(/\s+/g, ' ');
    const mots = texte.split(' ').filter(m => FRANCAIS.test(m));
    expect(mots, texte.slice(0, 600)).toEqual([]);
  });

  it('le meme parcours en francais donne les libelles d avant, mot pour mot', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    expect(await page.evaluate(() => '__langueSvgLangue' in window || '__langueSvg_en' in window)).toBe(false);
    await ouvrirExemple(page);
    expect(await page.locator('html').getAttribute('lang')).toBe('fr');
    expect(await menusDeLaBarre(page)).toEqual(['Choisir un outil de sélection', 'Formes (F)', 'Vue', 'Édition', 'Machine : Générique', 'Aide', 'Fichier']);
    expect(await textesDe(page.locator('.editeur-svg h3', { hasText: /^Dessin$/ }).first())).toEqual(['Dessin']);
    expect(await elementsAide(page)).toEqual(AIDE_FR);
    await page.keyboard.press('Escape');
    await choisirCricutMaker(page);
    expect(await textesDe(page.locator('.panneau-cricut details.section > summary > span').first())).toEqual(['Prêt pour Cricut']);
  });
});

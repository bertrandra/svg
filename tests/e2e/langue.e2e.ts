// L'interface en anglais (ADR-0042) sur la page construite : le reglage `svg.langue` pose puis la page rechargee, `html[lang=en]`,
// un texte traduit a l'accueil, le selecteur de l'accueil et le menu Aide de l'editeur qui changent de langue (reglage ecrit, page
// rechargee) ; et en francais, le defaut, rien ne change. Le socle seulement : les textes de l'editeur arrivent par vagues.

import { describe, expect, it } from 'vitest';
import { attend, ouvrirExemple, ouvrirMenu, pilote, textesDe } from './aide.js';

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
    // Le menu Aide de l'editeur propose le retour au francais, dans sa langue.
    await ouvrirExemple(page);
    await ouvrirMenu(page, 'Aide');
    expect(await textesDe(page.getByRole('menu', { name: 'Aide' }).getByRole('menuitem'))).toContain('Langue : français');
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
    await ouvrirMenu(page, 'Aide');
    await attend(() => textesDe(page.getByRole('menu', { name: 'Aide' }).getByRole('menuitem'))).toEqual(['Visite guidée', 'Raccourcis clavier', 'Guide de l’éditeur', 'La Cricut, c’est simple', 'Langue : français']);
  });
});

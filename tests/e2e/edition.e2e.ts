// L'edition d'un dessin : la rangee de selection, l'inspecteur a plat (ADR-0006), les gestes a la
// souris, les booleens, l'historique et l'enregistrement.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { aLeFocus, attend, nombreDeCalques, ouvrirExemple, ouvrirMenu, pilote, texteDe } from './aide.js';

describe('edition', () => {
  const navigateur = pilote();

  async function editeur() {
    const session = await navigateur.ouvrir();
    await ouvrirExemple(session.page);
    return session.page;
  }

  const forme = (page: Page, id: string) => page.locator(`.editeur-svg-toile path[data-id="${id}"]`);
  const sections = (page: Page) => page.locator('.editeur-inspecteur .section > summary span:first-child').evaluateAll(l => l.map(e => (e as HTMLElement).innerText));
  const sectionsOuvertes = (page: Page) => page.locator('.editeur-inspecteur .section[open] > summary span:first-child').evaluateAll(l => l.map(e => (e as HTMLElement).innerText));
  const modifications = async (page: Page) => Number(/(\d+) modification/.exec(await texteDe(page.locator('.editeur-etat')))?.[1] ?? NaN);
  /** La valeur du champ numerique de l'inspecteur dont l'etiquette est `libelle` (X, Y, L, H). */
  const champ = (page: Page, libelle: string) => page.locator('.editeur-inspecteur .grille-2 label', { hasText: new RegExp('^' + libelle + '$') }).locator('input');

  it('n\'affiche la rangee de selection qu\'avec une selection, et l\'inspecteur du dessin sans', async () => {
    const page = await editeur();
    expect(await page.locator('.editeur-barre-selection').count()).toBe(0);
    expect(await sections(page)).toEqual(['Nuancier', 'Recolorer le dessin', 'Palettes', 'Bibliothèque de formes', 'Nettoyer le tracé', 'Versions nommées', 'Raccourcis']);
    expect(await page.locator('.editeur-cadre button.primaire:visible').count()).toBeLessThanOrEqual(1);

    await forme(page, 'f2').click();
    await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
    expect(await texteDe(page.locator('.editeur-barre-selection .aide').first())).toBe('1 sélectionnée');
    // Ce que la rangée fait, l'inspecteur ne le repète pas.
    expect(await page.locator('.editeur-inspecteur').getByRole('button', { name: /Aligner|Miroir|Union/ }).count()).toBe(0);
  });

  it('range l\'inspecteur en sections sans cadre, trois ouvertes (le nuancier, ADR-0037) et le chiffre ferme', async () => {
    const page = await editeur();
    await forme(page, 'f2').click();
    await attend(() => sections(page)).toEqual(['Apparence', 'Nuancier', 'Position et taille', 'Transformer']);
    expect(await sectionsOuvertes(page)).toEqual(['Apparence', 'Nuancier', 'Position et taille']);
    expect(await page.locator('.editeur-inspecteur fieldset').count()).toBe(0);
    // Une seule action pleine par panneau (ADR-0006) : ici aucune, tout est secondaire.
    expect(await page.locator('.editeur-cadre button.primaire:visible').count()).toBeLessThanOrEqual(1);

    const transformer = page.locator('.editeur-inspecteur .section > summary', { hasText: 'Transformer' });
    expect(await page.locator('.transformations-numeriques').isVisible()).toBe(false);
    await transformer.click();
    await attend(() => page.locator('.transformations-numeriques').isVisible()).toBe(true);
  });

  it('retient d\'un panneau a l\'autre qu\'une section est fermee', async () => {
    const page = await editeur();
    await forme(page, 'f2').click();
    await page.locator('.editeur-inspecteur .section > summary', { hasText: 'Apparence' }).click();
    await attend(() => sectionsOuvertes(page)).toEqual(['Nuancier', 'Position et taille']);

    await page.keyboard.press('Escape');
    await attend(() => page.locator('.editeur-barre-selection').count()).toBe(0);
    await forme(page, 'f3').click();
    await attend(() => sections(page)).toEqual(['Apparence', 'Nuancier', 'Position et taille', 'Transformer']);
    expect(await sectionsOuvertes(page)).toEqual(['Nuancier', 'Position et taille']);
  });

  it('donne a la toile un nom, et un anneau de focus visible au clavier', async () => {
    const page = await editeur();
    const toile = page.locator('.editeur-svg-toile');
    expect(await toile.getAttribute('aria-label')).toBe('Plan de travail de exemple.svg : 4 formes');
    // Le focus arrive par le clavier : Tab quitte la toile (rien n'est choisi), Maj+Tab y revient. :focus-visible s'applique
    // alors partout, le contour fait 3 px. (Une touche Maj seule puis un focus par script ne suffit qu'a Chromium : en CI,
    // Firefox et WebKit n'appliquaient pas :focus-visible apres ce focus-la, leur heuristique pour un focus par script differe.)
    await toile.focus();
    await attend(() => aLeFocus(toile)).toBe(true);
    await page.keyboard.press('Tab');
    await attend(() => aLeFocus(toile)).toBe(false);
    await page.keyboard.press('Shift+Tab');
    await attend(() => aLeFocus(toile)).toBe(true);
    const anneau = await toile.evaluate(e => ({ visible: e.matches(':focus-visible'), largeur: getComputedStyle(e).outlineWidth }));
    expect(anneau).toEqual({ visible: true, largeur: '3px' });
  });

  it('deplace une forme a la souris, compte la modification, et l\'annule', async () => {
    const page = await editeur();
    const cercle = forme(page, 'f2');
    const boite = await cercle.boundingBox();
    if (!boite) throw new Error('le cercle n’a pas de boîte');
    const x = boite.x + boite.width / 2, y = boite.y + boite.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y, { steps: 5 });
    await page.mouse.up();

    await attend(() => modifications(page)).toBe(1);
    const apres = await champ(page, 'X').inputValue();
    await page.keyboard.press('Control+z');
    await attend(() => modifications(page)).toBe(0);
    await forme(page, 'f2').click();
    await attend(() => champ(page, 'X').inputValue()).not.toBe(apres);
  });

  it('trace un rectangle avec la touche R et un glisser', async () => {
    const page = await editeur();
    const avant = await nombreDeCalques(page);
    const toile = await page.locator('.editeur-svg-toile').boundingBox();
    if (!toile) throw new Error('la toile n’a pas de boîte');
    await page.keyboard.press('r');
    await page.mouse.move(toile.x + 100, toile.y + 100);
    await page.mouse.down();
    await page.mouse.move(toile.x + 220, toile.y + 180, { steps: 6 });
    await page.mouse.up();
    await attend(() => nombreDeCalques(page)).toBe(avant + 1);
  });

  it('copie et colle, puis reunit et separe des formes', async () => {
    const page = await editeur();
    const avant = await nombreDeCalques(page);
    await forme(page, 'f2').click();
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await attend(() => nombreDeCalques(page)).toBe(avant + 1);

    await forme(page, 'f3').click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: /^Combiner en une forme/ }).click();
    await attend(() => nombreDeCalques(page)).toBeLessThan(avant + 1);
    await page.getByRole('button', { name: /^Séparer les tracés/ }).click();
    await attend(() => nombreDeCalques(page)).toBeGreaterThan(1);
  });

  it('fait une union puis une soustraction, que l\'historique defait', async () => {
    const page = await editeur();
    const avant = await nombreDeCalques(page);
    await forme(page, 'f2').click();
    await forme(page, 'f3').click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: /^Union/ }).click();
    await attend(() => nombreDeCalques(page)).toBe(avant - 1);

    await page.keyboard.press('Control+z');
    await attend(() => nombreDeCalques(page)).toBe(avant);
    await forme(page, 'f2').click();
    await forme(page, 'f3').click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: /^Soustraction/ }).click();
    await attend(() => nombreDeCalques(page)).toBe(avant - 1);
  });

  it('garde un brouillon par Ctrl+S sans fermer, puis « Terminer » montre le resultat sur l\'accueil', async () => {
    const page = await editeur();
    await forme(page, 'f2').click();
    await page.keyboard.press('Delete');
    await attend(() => nombreDeCalques(page)).toBe(3);
    // Ctrl+S garde le travail (le brouillon du navigateur) et le dit : l'editeur reste ouvert.
    await page.keyboard.press('Control+s');
    await attend(() => texteDe(page.locator('.message-etat'))).toBe('Brouillon gardé.');
    expect(await page.locator('.editeur-cadre').count()).toBe(1);
    const brouillon = await page.evaluate(() => JSON.parse(localStorage.getItem('svg.brouillon') ?? 'null') as { svg?: string } | null);
    expect(brouillon?.svg?.match(/<path /g)?.length).toBe(3);
    // Fermer est un geste a part : « Terminer ».
    await page.locator('.editeur-barre .groupe.fin button.primaire').click();
    await page.locator('.resultat').waitFor();
    expect(await texteDe(page.locator('.resultat .fiche .aide'))).toMatch(/^3 formes/);
    expect(await page.locator('.editeur-cadre').count()).toBe(0);
  });

  it('demande confirmation avant d\'abandonner des modifications', async () => {
    const page = await editeur();
    await forme(page, 'f2').click();
    await page.keyboard.press('Delete');
    await attend(() => modifications(page)).toBe(1);
    await ouvrirMenu(page, 'Fichier');
    await page.getByRole('menuitem', { name: /Fermer l’éditeur/ }).click();
    const dialogue = page.getByRole('alertdialog');
    await attend(() => dialogue.isVisible()).toBe(true);
    await dialogue.getByRole('button', { name: 'Continuer l’édition' }).click();
    await attend(() => dialogue.count()).toBe(0);
    expect(await nombreDeCalques(page)).toBe(3);
  });
});

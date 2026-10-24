// Les outils de l'editeur au-dela du trace de base (ADR-0004) : texte en formes, transformations,
// aimants, palettes, versions nommees, reprise d'un dessin apres rechargement.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, nombreDeCalques, ouvrirExemple, ouvrirMenu, pilote, texteDe } from './aide.js';

describe('outils de l\'editeur', () => {
  const navigateur = pilote();

  async function editeur() {
    const { page } = await navigateur.ouvrir();
    await ouvrirExemple(page);
    return page;
  }

  const forme = (page: Page, id: string) => page.locator(`.editeur-svg-toile path[data-id="${id}"]`);
  const message = (page: Page) => texteDe(page.locator('.editeur-etat .message-etat'));
  const champ = (page: Page, libelle: string) => page.locator('.editeur-inspecteur .grille-2 label', { hasText: new RegExp('^' + libelle + '$') }).locator('input');
  const modifications = async (page: Page) => Number(/(\d+) modification/.exec(await texteDe(page.locator('.editeur-etat')))?.[1] ?? NaN);
  const section = (page: Page, titre: string) => page.locator('.editeur-inspecteur .section', { has: page.locator('summary', { hasText: titre }) });
  /** Ouvre une section de l'inspecteur si elle est fermee. */
  async function ouvrirSection(page: Page, titre: string) {
    const s = section(page, titre);
    if (!(await s.evaluate(e => (e as HTMLDetailsElement).open))) await s.locator('summary').click();
    await attend(() => s.evaluate(e => (e as HTMLDetailsElement).open)).toBe(true);
    return s;
  }

  it('compose un texte en formes, une par lettre, jamais en <text>', async () => {
    const page = await editeur();
    const avant = await nombreDeCalques(page);
    await page.keyboard.press('t');
    // Les fontes se chargent a la demande (polices.js).
    const fonte = page.locator('.editeur-inspecteur select[aria-label="Fonte"]');
    await fonte.waitFor({ timeout: 30_000 });
    await page.locator('.editeur-inspecteur textarea[aria-label="Texte"]').fill('Noël');
    await fonte.selectOption('lobster');
    await page.getByRole('button', { name: 'Ajouter le texte' }).click();

    await attend(() => nombreDeCalques(page)).toBe(avant + 4);
    expect(await page.locator('.editeur-svg-toile text').count()).toBe(0);
    expect(await message(page)).not.toBe('');
  });

  it('tourne par la poignee ronde, et met a l\'echelle par les champs chiffres', async () => {
    const page = await editeur();
    await forme(page, 'f2').click();
    const poignee = await page.locator('.editeur-svg-toile .poignee-rotation').boundingBox();
    const boite = await page.locator('.editeur-svg-toile .boite-choisie').boundingBox();
    if (!poignee || !boite) throw new Error('la poignée de rotation ou la boîte de sélection manque');
    const cx = boite.x + boite.width / 2, cy = boite.y + boite.height / 2;
    await page.mouse.move(poignee.x + poignee.width / 2, poignee.y + poignee.height / 2);
    await page.mouse.down();
    await page.mouse.move(cx + 200, cy, { steps: 8 });
    await page.mouse.up();
    await attend(() => modifications(page)).toBe(1);

    await ouvrirSection(page, 'Transformer');
    const largeur = Number(await champ(page, 'L').inputValue());
    // Echelle 50 % : la largeur de la selection doit tomber bien en dessous des trois quarts.
    const echelle = page.locator('.transformations-numeriques label', { hasText: 'Échelle' }).locator('input');
    await echelle.fill('50');
    await page.locator('.transformations-numeriques').getByRole('button', { name: 'Appliquer' }).click();
    await attend(() => modifications(page)).toBe(2);
    await attend(async () => Number(await champ(page, 'L').inputValue())).toBeLessThan(largeur * 0.75);
  });

  it('montre des guides d\'alignement pendant un geste, et les retire a la fin', async () => {
    const page = await editeur();
    await ouvrirMenu(page, 'Vue');
    await page.getByRole('menuitem', { name: /Ajuster à l’écran/ }).click();
    const f1 = await forme(page, 'f1').boundingBox();
    if (!f1) throw new Error('la forme f1 manque');
    await page.mouse.move(f1.x + 20, f1.y + 20);
    await page.mouse.down();
    await page.mouse.move(f1.x + 60, f1.y + 50, { steps: 10 });
    await attend(() => page.locator('.editeur-svg-toile .guide').count()).toBeGreaterThan(0);
    await page.mouse.up();
    await attend(() => page.locator('.editeur-svg-toile .guide').count()).toBe(0);
  });

  it('recolore le dessin avec la palette d\'un evenement', async () => {
    const page = await editeur();
    const couleurs = () => page.locator('.couleurs-dessin li button').allInnerTexts();
    const avant = await couleurs();
    const recolorer = await ouvrirSection(page, 'Recolorer');
    await recolorer.locator('select').filter({ hasText: 'Halloween' }).first().selectOption('halloween');
    await recolorer.getByRole('button', { name: 'Appliquer la palette' }).click();
    await attend(() => modifications(page)).toBe(1);
    await attend(couleurs).not.toEqual(avant);
    expect(await message(page)).toMatch(/^Palette « Halloween » appliquée/);
    // Une palette est un seul geste d'historique : un Ctrl+Z rend les couleurs d'origine.
    await page.keyboard.press('Control+z');
    await attend(couleurs).toEqual(avant);
  });

  it('garde une version nommee, y revient, et la retrouve apres un rechargement', async () => {
    const page = await editeur();
    const versions = await ouvrirSection(page, 'Versions nommées');
    await versions.locator('input[aria-label="Nom de la version"]').fill('avant suppression');
    await versions.getByRole('button', { name: 'Garder', exact: true }).click();
    await attend(() => versions.locator('.versions li').count()).toBe(1);
    expect(await texteDe(versions.locator('.nom-version'))).toContain('avant suppression');

    await forme(page, 'f2').click();
    await page.keyboard.press('Delete');
    await attend(() => nombreDeCalques(page)).toBe(3);
    await versions.getByRole('button', { name: 'Revenir', exact: true }).click();
    await attend(() => nombreDeCalques(page)).toBe(4);
    expect(await message(page)).toMatch(/^Retour à « avant suppression »/);

    // Le navigateur la garde : une page neuve la retrouve.
    await page.reload();
    await ouvrirExemple(page);
    const apres = await ouvrirSection(page, 'Versions nommées');
    await attend(() => apres.locator('.versions li').count()).toBe(1);
  });

  it('propose de reprendre le dessin en cours apres un rechargement', async () => {
    const page = await editeur();
    await forme(page, 'f2').click();
    await page.keyboard.press('Delete');
    await attend(() => nombreDeCalques(page)).toBe(3);
    // Le brouillon s'ecrit une seconde apres la derniere modification : on attend qu'il soit la.
    await page.waitForFunction(() => localStorage.getItem('svg.brouillon') !== null, null, { timeout: 10_000 });

    await page.reload();
    const reprise = page.locator('.reprise');
    await reprise.waitFor();
    expect(await texteDe(reprise.locator('p'))).toMatch(/exemple\.svg/);
    await reprise.getByRole('button', { name: 'Reprendre' }).click();
    await page.locator('.editeur-cadre').waitFor();
    await attend(() => nombreDeCalques(page)).toBe(3);
  });

  it('oublie le brouillon sur demande', async () => {
    const page = await editeur();
    await forme(page, 'f2').click();
    await page.keyboard.press('Delete');
    await page.waitForFunction(() => localStorage.getItem('svg.brouillon') !== null, null, { timeout: 10_000 });
    await page.reload();
    await page.locator('.reprise').getByRole('button', { name: 'Oublier' }).click();
    await attend(() => page.locator('.reprise').count()).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('svg.brouillon'))).toBeNull();
  });
});

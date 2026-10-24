// Les ligatures du texte en formes (troisieme lot de l'ADR-0009), par la vraie page : la case « Ligatures » n'existe que
// pour une fonte qui en a, elle est cochee par defaut, et « fi » donne une forme avec elle, deux sans.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, nombreDeCalques, ouvrirExemple, pilote } from './aide.js';

describe('ligatures du texte', () => {
  const navigateur = pilote();

  async function panneauTexte(): Promise<Page> {
    const { page } = await navigateur.ouvrir();
    await ouvrirExemple(page);
    await page.keyboard.press('t');
    // Les fontes se chargent a la demande (polices.js).
    await page.locator('.editeur-inspecteur select[aria-label="Fonte"]').waitFor({ timeout: 30_000 });
    return page;
  }
  const case_ = (page: Page) => page.getByRole('checkbox', { name: 'Ligatures (fi, fl…)' });
  async function ajouter(page: Page, texte: string, fonte: string): Promise<number> {
    const avant = await nombreDeCalques(page);
    await page.locator('.editeur-inspecteur textarea[aria-label="Texte"]').fill(texte);
    await page.locator('.editeur-inspecteur select[aria-label="Fonte"]').selectOption(fonte);
    await page.getByRole('button', { name: 'Ajouter le texte' }).click();
    await attend(() => nombreDeCalques(page)).toBeGreaterThan(avant);
    return (await nombreDeCalques(page)) - avant;
  }

  it('la case est cochee par defaut pour une fonte a ligatures : « fi » ne fait qu\'une forme', async () => {
    const page = await panneauTexte();
    await page.locator('.editeur-inspecteur select[aria-label="Fonte"]').selectOption('playfair');
    await expect(case_(page).isChecked()).resolves.toBe(true);
    expect(await ajouter(page, 'fi', 'playfair')).toBe(1);
  });

  it('decochee, « fi » redonne une forme par lettre', async () => {
    const page = await panneauTexte();
    await page.locator('.editeur-inspecteur select[aria-label="Fonte"]').selectOption('playfair');
    await case_(page).uncheck();
    expect(await ajouter(page, 'fi', 'playfair')).toBe(2);
  });

  it('un mot entier : « office » se lie en o, ffi, c, e', async () => {
    const page = await panneauTexte();
    expect(await ajouter(page, 'office', 'playfair')).toBe(4);
  });

  it('une fonte sans ligature « liga » (Inter, Bebas Neue) n\'offre pas la case, et garde une forme par lettre', async () => {
    const page = await panneauTexte();
    await page.locator('.editeur-inspecteur select[aria-label="Fonte"]').selectOption('inter');
    await expect(case_(page).count()).resolves.toBe(0);
    await page.locator('.editeur-inspecteur select[aria-label="Fonte"]').selectOption('bebas');
    await expect(case_(page).count()).resolves.toBe(0);
    expect(await ajouter(page, 'fi', 'inter')).toBe(2);
  });

  it('la case revient avec une fonte qui en a, et se grise quand les lettres sont espacees', async () => {
    const page = await panneauTexte();
    const fonte = page.locator('.editeur-inspecteur select[aria-label="Fonte"]');
    await fonte.selectOption('inter');
    await expect(case_(page).count()).resolves.toBe(0);
    await fonte.selectOption('lobster');
    await expect(case_(page).isChecked()).resolves.toBe(true);
    await page.locator('.editeur-inspecteur label', { hasText: /^Espace$/ }).locator('input').fill('0.05');
    await expect(case_(page).isDisabled()).resolves.toBe(true);
    expect(await ajouter(page, 'fi', 'lobster')).toBe(2);
  });
});

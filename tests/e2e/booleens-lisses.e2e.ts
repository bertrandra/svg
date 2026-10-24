// Les booleens rebatissent les courbes (reglage « Booléens : rebâtir les courbes » du menu Édition, actif par defaut) :
// l'union de deux cercles reste ronde, avec peu de points ; coupee, elle rend des segments droits.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, formesVisibles, nombreDeCalques, ouvrirCode, ouvrirMenu, pilote, texteDe } from './aide.js';

const DEUX_CERCLES = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
  + '<circle cx="40" cy="50" r="25" fill="#c81e28"/><circle cx="65" cy="50" r="25" fill="#1428a0"/></svg>';

describe('booleens lisses', () => {
  const navigateur = pilote();

  async function editeur() {
    const session = await navigateur.ouvrir();
    await ouvrirCode(session.page, DEUX_CERCLES);
    return session.page;
  }

  /** Les attributs `d` des formes de la toile, dans l'ordre du dessin. */
  const traces = (page: Page) => page.locator('.editeur-svg-toile path[data-id]').evaluateAll(l => l.map(e => e.getAttribute('d') ?? ''));
  /** Les points d'un tracé : toute commande qui n'est pas une fermeture. */
  const points = (d: string) => (d.match(/[MLCQ]/g) ?? []).length;

  const reglage = async (page: Page) => {
    await ouvrirMenu(page, 'Édition');
    const item = page.getByRole('menuitemcheckbox', { name: /Booléens : rebâtir les courbes/ });
    return { item, etat: await item.getAttribute('aria-checked') };
  };

  /** Coche ou decoche le reglage par le menu (qui se referme au clic). */
  async function regler(page: Page, voulu: boolean) {
    const { item, etat } = await reglage(page);
    if (etat === String(voulu)) { await page.keyboard.press('Escape'); return; }
    await item.click();
  }

  async function unir(page: Page) {
    await ouvrirMenu(page, 'Édition');
    await page.getByRole('menuitem', { name: /Tout sélectionner/ }).click();
    await page.getByRole('button', { name: /^Union/ }).click();
  }

  it('rebatit les courbes par defaut : l\'union de deux cercles garde des C et peu de points', async () => {
    const page = await editeur();
    expect((await reglage(page)).etat).toBe('true');
    await page.keyboard.press('Escape');
    await attend(() => nombreDeCalques(page)).toBe(2);

    await unir(page);
    await attend(() => nombreDeCalques(page)).toBe(1);
    const [d = ''] = await traces(page);
    expect(d).toMatch(/C/);
    expect(d).not.toMatch(/L/);
    expect(points(d)).toBeLessThan(40);
    expect(await texteDe(page.locator('.editeur-etat'))).toContain('Union faite : 2 formes, ' + points(d) + ' points (courbes rebâties).');
  });

  it('rend des segments droits, bien plus nombreux, quand le reglage est coupe', async () => {
    const page = await editeur();
    await regler(page, false);
    expect((await reglage(page)).etat).toBe('false');
    await page.keyboard.press('Escape');

    await unir(page);
    await attend(() => nombreDeCalques(page)).toBe(1);
    const [d = ''] = await traces(page);
    expect(d).toMatch(/L/);
    expect(d).not.toMatch(/[CQ]/);
    expect(points(d)).toBeGreaterThan(200);
    expect(await texteDe(page.locator('.editeur-etat'))).toContain('Union faite : 2 formes, ' + points(d) + ' points en segments droits.');
  });

  it('defait l\'union avec Ctrl+Z, et le reglage suit ce que l\'on coche', async () => {
    const page = await editeur();
    const avant = await traces(page);
    await unir(page);
    await attend(() => formesVisibles(page)).toBe(1);

    await page.keyboard.press('Control+z');
    await attend(() => formesVisibles(page)).toBe(2);
    expect(await traces(page)).toEqual(avant);

    await regler(page, false);
    await unir(page);
    await attend(() => formesVisibles(page)).toBe(1);
    expect(((await traces(page))[0] ?? '')).not.toMatch(/C/);
    await page.keyboard.press('Control+z');
    await attend(() => formesVisibles(page)).toBe(2);
    expect(await traces(page)).toEqual(avant);

    await regler(page, true);
    expect((await reglage(page)).etat).toBe('true');
  });
});

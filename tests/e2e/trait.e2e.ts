// Le style du trait dans le navigateur : une icone de type Feather s'ouvre en traits (la peinture de sa
// balise racine se transmet), et l'inspecteur regle bout, jonction et pointilles, que la toile dessine.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, formesVisibles, modifications, ouvrirCode, pilote } from './aide.js';

const FEATHER = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
  + '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/><circle cx="12" cy="12" r="10"/></svg>';

describe('style du trait', () => {
  const navigateur = pilote();

  async function editeur(svg = FEATHER) {
    const session = await navigateur.ouvrir();
    await ouvrirCode(session.page, svg);
    return session.page;
  }

  const forme = (page: Page, id: string) => page.locator(`.editeur-svg-toile path[data-id="${id}"]`);
  const reglage = (page: Page, libelle: string) => page.locator('.editeur-inspecteur label.champ-ligne', { hasText: libelle }).locator('select');

  it('ouvre une icone de type Feather en traits arrondis, pas en formes noires pleines', async () => {
    const page = await editeur();
    await attend(() => formesVisibles(page)).toBe(2);
    for (const id of ['f1', 'f2']) {
      const f = forme(page, id);
      expect(await f.getAttribute('fill')).toBe('none');
      expect(await f.getAttribute('stroke')).toBe('#000000');
      expect(await f.getAttribute('stroke-width')).toBe('2');
      expect(await f.getAttribute('stroke-linecap')).toBe('round');
      expect(await f.getAttribute('stroke-linejoin')).toBe('round');
      expect(await f.getAttribute('stroke-dasharray')).toBeNull();
    }
  });

  it('regle le bout, la jonction et les pointilles depuis l\'inspecteur, et l\'annule', async () => {
    const page = await editeur();
    await forme(page, 'f1').click();
    await attend(() => reglage(page, 'Bout').inputValue()).toBe('round');
    expect(await reglage(page, 'Jonction').inputValue()).toBe('round');
    expect(await reglage(page, 'Style du trait').inputValue()).toBe('plein');
    const avant = await modifications(page);

    await reglage(page, 'Bout').selectOption('square');
    await attend(() => forme(page, 'f1').getAttribute('stroke-linecap')).toBe('square');
    await reglage(page, 'Jonction').selectOption('miter');
    await attend(() => forme(page, 'f1').getAttribute('stroke-linejoin')).toBe('miter');
    expect(await page.locator('.editeur-inspecteur', { hasText: 'Limite de pointe' }).count()).toBe(1);

    await reglage(page, 'Style du trait').selectOption('tirets');
    await attend(() => forme(page, 'f1').getAttribute('stroke-dasharray')).toBe('6 6');
    await reglage(page, 'Style du trait').selectOption('pointilles');
    await attend(() => forme(page, 'f1').getAttribute('stroke-dasharray')).toBe('0 4');
    expect(await forme(page, 'f2').getAttribute('stroke-dasharray')).toBeNull();

    await reglage(page, 'Style du trait').selectOption('plein');
    await attend(() => forme(page, 'f1').getAttribute('stroke-dasharray')).toBeNull();
    await page.keyboard.press('Control+z');
    await attend(() => forme(page, 'f1').getAttribute('stroke-dasharray')).toBe('0 4');
    expect(await modifications(page)).toBeGreaterThan(avant);
  });

  it('ne montre ces reglages que pour une forme qui a un contour', async () => {
    const page = await editeur('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>');
    await forme(page, 'f1').click();
    await attend(() => page.locator('.editeur-inspecteur h3').count()).toBe(1);
    expect(await page.locator('.editeur-inspecteur label.champ-ligne', { hasText: 'Style du trait' }).count()).toBe(0);
    expect(await page.locator('.editeur-inspecteur label.champ-ligne', { hasText: 'Jonction' }).count()).toBe(0);
  });
});

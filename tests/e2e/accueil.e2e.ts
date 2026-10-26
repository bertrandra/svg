// La page d'accueil (ADR-0006) : une entree, trois voies en onglets, une seule action primaire.

import { describe, expect, it } from 'vitest';
import { aLeFocus, attend, ouvrirExemple, pilote } from './aide.js';

describe('accueil', () => {
  const navigateur = pilote();

  it('offre trois voies cote a cote, trois panneaux montes dont un seul visible', async () => {
    const { page } = await navigateur.ouvrir();
    const onglets = page.getByRole('tab');
    await attend(() => onglets.count()).toBe(3);

    // Cote a cote : les trois onglets partagent le meme haut.
    const hauts = await onglets.evaluateAll(l => l.map(e => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(hauts).size).toBe(1);

    // Montes (pour qu'un detour ne fasse pas perdre une image deposee), mais un seul est montre.
    expect(await page.locator('[role=tabpanel]').count()).toBe(3);
    expect(await page.locator('[role=tabpanel]:not([hidden])').count()).toBe(1);
    expect(await page.locator('[role=tab][aria-selected=true]').count()).toBe(1);
  });

  it('ne met en avant qu\'une action par voie, au plus', async () => {
    const { page } = await navigateur.ouvrir();
    // Ouvrir et Convertir ont leur action pleine ; la Bibliotheque n'en a plus : elle se charge d'elle-meme, et son geste est le
    // choix d'une vignette (plus de bouton « Charger la bibliothèque »).
    for (const [voie, pleines] of [[/^Ouvrir/, 1], [/^Convertir/, 1], [/^Bibliothèque/, 0]] as const) {
      await page.getByRole('tab', { name: voie }).click();
      await attend(() => page.locator('main button.primaire:visible').count()).toBe(pleines);
    }
    await page.locator('.bibliotheque .vignette').first().waitFor({ timeout: 60_000 });
    expect(await page.locator('main button.primaire:visible').count()).toBe(0);
  });

  it('change de voie au clic, puis aux fleches avec le focus qui suit', async () => {
    const { page } = await navigateur.ouvrir();
    const onglets = page.getByRole('tab');
    await onglets.nth(1).click();
    await attend(() => page.locator('#panneau-image').isVisible()).toBe(true);
    expect(await page.locator('#panneau-svg').isVisible()).toBe(false);

    await page.keyboard.press('ArrowRight');
    await attend(() => onglets.nth(2).getAttribute('aria-selected')).toBe('true');
    await attend(() => aLeFocus(onglets.nth(2))).toBe(true);
    expect(await page.locator('#panneau-formes').isVisible()).toBe(true);

    // La liste est circulaire dans les deux sens.
    await page.keyboard.press('ArrowRight');
    await attend(() => onglets.nth(0).getAttribute('aria-selected')).toBe('true');
    await page.keyboard.press('ArrowLeft');
    await attend(() => onglets.nth(2).getAttribute('aria-selected')).toBe('true');

    // Seul l'onglet courant est dans l'ordre de tabulation.
    expect(await onglets.nth(2).getAttribute('tabindex')).toBe('0');
    expect(await onglets.nth(0).getAttribute('tabindex')).toBe('-1');
  });

  it('garde le nuancier replie jusqu\'a ce qu\'on l\'ouvre', async () => {
    const { page } = await navigateur.ouvrir();
    const nuancier = page.locator('details.nuancier-page');
    expect(await nuancier.evaluate(e => (e as HTMLDetailsElement).open)).toBe(false);
    await nuancier.locator('summary').click();
    await attend(() => nuancier.locator('textarea').isVisible()).toBe(true);
  });

  it('ouvre l\'exemple dans l\'editeur', async () => {
    const { page } = await navigateur.ouvrir();
    await ouvrirExemple(page);
    expect(await page.locator('.editeur-svg-toile').isVisible()).toBe(true);
    expect(await page.locator('.editeur-barre').isVisible()).toBe(true);
    expect(await page.locator('.editeur-calques ol > li').count()).toBeGreaterThan(0);
  });
});

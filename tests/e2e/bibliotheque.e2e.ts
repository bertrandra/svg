// La bibliotheque de formes (ADR-0003), chargee a la demande : dans la page pour ouvrir une forme,
// dans l'editeur pour en inserer une, une scene ou un panier. Le fichier fait pres de 7 Mo : on ne
// le charge que dans les tests qui en ont besoin.

import { describe, expect, it } from 'vitest';
import type { Locator } from 'playwright';
import { attend, choisirEvenement, nombreDeCalques, ouvrirExemple, pilote, texteDe } from './aide.js';

// Lire et analyser la bibliotheque prend un instant sur une machine lente.
const CHARGEMENT = 60_000;

describe('bibliotheque de formes', () => {
  const navigateur = pilote();

  /** « 4134 formes » ou « 76 formes sur 4134 » : [affichees, total]. */
  async function decompte(zone: Locator): Promise<[number, number]> {
    const t = await texteDe(zone);
    const m = /^(\d+) formes?(?: sur (\d+))?/.exec(t);
    if (!m) throw new Error('décompte illisible : ' + t);
    const n = Number(m[1]);
    return [n, m[2] ? Number(m[2]) : n];
  }

  it('se charge a la demande dans la page, puis se filtre par evenement et par mot', async () => {
    const { page } = await navigateur.ouvrir();
    await page.getByRole('tab', { name: /Bibliothèque/ }).click();
    expect(await page.locator('.bibliotheque .vignette').count()).toBe(0);
    await page.getByRole('button', { name: /Charger la bibliothèque/ }).click();
    await page.locator('.bibliotheque .vignette').first().waitFor({ timeout: CHARGEMENT });

    const compte = page.locator('.bibliotheque .aide[aria-live]');
    const [tout, total] = await decompte(compte);
    expect(total).toBeGreaterThan(4000);
    expect(tout).toBe(total);

    // Chaque evenement garde au moins dix formes (tests/unit/model/bibliotheque.test.ts le garantit aussi).
    await choisirEvenement(page.locator('.bibliotheque'), 'Pâques');
    await attend(async () => (await decompte(compte))[0], 10_000).toBeLessThan(total);
    expect((await decompte(compte))[0]).toBeGreaterThanOrEqual(10);

    await page.locator('.bibliotheque input[type=search]').fill('lapin');
    await attend(async () => (await decompte(compte))[0]).toBeLessThan(total);
    expect(await page.locator('.bibliotheque .vignette').count()).toBeGreaterThan(0);
  });

  it('ouvre dans l\'editeur la forme cliquee dans la page', async () => {
    const { page } = await navigateur.ouvrir();
    await page.getByRole('tab', { name: /Bibliothèque/ }).click();
    await page.getByRole('button', { name: /Charger la bibliothèque/ }).click();
    const vignette = page.locator('.bibliotheque .vignette').first();
    await vignette.waitFor({ timeout: CHARGEMENT });
    await vignette.click();
    await page.locator('.editeur-cadre').waitFor();
    expect(await nombreDeCalques(page)).toBeGreaterThanOrEqual(1);
  });

  /** L'editeur sur l'exemple, la bibliotheque de son panneau chargee. */
  async function editeurAvecBibliotheque() {
    const { page } = await navigateur.ouvrir();
    await ouvrirExemple(page);
    await page.locator('.editeur-inspecteur .section > summary', { hasText: 'Bibliothèque de formes' }).click();
    await page.getByRole('button', { name: /Charger la bibliothèque/ }).click();
    await page.locator('.editeur-inspecteur .vignette').first().waitFor({ timeout: CHARGEMENT });
    return page;
  }

  it('insere une forme de la bibliotheque au centre du dessin, et l\'historique la retire', async () => {
    const page = await editeurAvecBibliotheque();
    const avant = await nombreDeCalques(page);
    await choisirEvenement(page.locator('.editeur-inspecteur'), 'Noël');
    await page.locator('.editeur-inspecteur input[type=search]').fill('bonhomme de neige');
    const vignette = page.locator('.editeur-inspecteur .vignette').first();
    await vignette.waitFor();
    await vignette.click();

    await attend(() => nombreDeCalques(page)).toBeGreaterThan(avant);
    await attend(() => texteDe(page.locator('.editeur-etat'))).toMatch(/1 modification/);
    // La forme insérée est choisie : l'inspecteur parle de sa selection.
    await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);

    await page.keyboard.press('Control+z');
    await attend(() => nombreDeCalques(page)).toBe(avant);
  });

  it('insere une scene prete, puis un panier en grille', async () => {
    const page = await editeurAvecBibliotheque();
    const avant = await nombreDeCalques(page);

    await page.locator('select[aria-label="Scène prête"]').selectOption('noel');
    await page.getByRole('button', { name: 'Insérer la scène' }).click();
    await attend(() => nombreDeCalques(page)).toBeGreaterThan(avant + 1);
    const apresScene = await nombreDeCalques(page);

    // Deux formes mises au panier (le « + » de la vignette), puis inserees ensemble.
    await page.keyboard.press('Escape');
    await page.locator('.editeur-inspecteur input[type=search]').fill('lapin');
    await attend(() => page.locator('.editeur-inspecteur .plus').count()).toBeGreaterThanOrEqual(2);
    const plus = page.locator('.editeur-inspecteur .plus');
    await plus.nth(0).click({ force: true });
    await plus.nth(1).click({ force: true });
    await attend(() => texteDe(page.locator('.panier .aide'))).toMatch(/^2 dans le panier/);
    await page.getByRole('button', { name: 'Insérer en grille' }).click();
    await attend(() => nombreDeCalques(page)).toBeGreaterThanOrEqual(apresScene + 2);
    expect(await page.locator('.panier').count()).toBe(0);
  });
});

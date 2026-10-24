// Ce que la page doit aux personnes qui ne l'utilisent pas comme nous : mouvement reduit, themes
// clair et sombre, noms accessibles des boutons a icone, onglets relies a leurs panneaux (ADR-0006).

import { describe, expect, it } from 'vitest';
import { attend, ouvrirExemple, pilote } from './aide.js';

describe('accessibilite', () => {
  const navigateur = pilote();

  /** La plus longue duree de transition du premier bouton de la page, en secondes. */
  async function dureeTransition(options: { mouvementReduit: boolean }) {
    const { page } = await navigateur.ouvrir({ largeur: 1200, hauteur: 800, ...options });
    return page.locator('button').first().evaluate(e => Math.max(...getComputedStyle(e).transitionDuration.split(',').map(parseFloat)));
  }

  it('garde des transitions de 120 ms par defaut', async () => {
    expect(await dureeTransition({ mouvementReduit: false })).toBeCloseTo(0.12, 2);
  });

  it('coupe toute duree sous prefers-reduced-motion', async () => {
    expect(await dureeTransition({ mouvementReduit: true })).toBeLessThan(0.001);
  });

  /** La plus longue animation ou transition du panneau d'un menu ouvert, en secondes. */
  async function dureeMenu(options: { mouvementReduit: boolean }) {
    const { page } = await navigateur.ouvrir(options);
    await ouvrirExemple(page);
    await page.locator('.menu-bouton', { hasText: 'Vue' }).click();
    return page.locator('.menu-panneau').evaluate(e => {
      const c = getComputedStyle(e);
      return Math.max(...[c.animationDuration, c.transitionDuration].flatMap(d => d.split(',').map(parseFloat)));
    });
  }

  it('fait fondre les menus, sauf sous prefers-reduced-motion', async () => {
    // Les deux cotes : sans le premier, le second ne prouverait rien (un menu sans animation passerait).
    expect(await dureeMenu({ mouvementReduit: false })).toBeGreaterThan(0.05);
    expect(await dureeMenu({ mouvementReduit: true })).toBeLessThan(0.001);
  });

  it('nomme chaque bouton a icone de la barre et de la rangee de selection', async () => {
    const { page } = await navigateur.ouvrir();
    await ouvrirExemple(page);
    await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
    await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
    expect(await page.locator('.editeur-barre .icone-bouton, .editeur-barre-selection .icone-bouton').count()).toBeGreaterThan(30);
    expect(await page.locator('.editeur-barre .icone-bouton:not([aria-label]), .editeur-barre-selection .icone-bouton:not([aria-label])').count()).toBe(0);
  });

  it('suit le theme du systeme sans erreur, clair comme sombre', async () => {
    const fonds: string[] = [];
    for (const schema of ['light', 'dark'] as const) {
      const { page } = await navigateur.ouvrir({ schema });
      await ouvrirExemple(page);
      await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
      fonds.push(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
    }
    // Deux themes, deux fonds : sinon la feuille sombre n'est jamais appliquee.
    expect(new Set(fonds).size).toBe(2);
  });

  it('relie chaque onglet a son panneau', async () => {
    const { page } = await navigateur.ouvrir();
    expect(await page.getByRole('tablist', { name: 'Point de départ' }).count()).toBe(1);
    // Chaque onglet designe son panneau, et chaque panneau son onglet.
    const liens = await page.getByRole('tab').evaluateAll(l => l.map(e => {
      const panneau = document.getElementById(e.getAttribute('aria-controls') ?? '');
      return panneau?.getAttribute('aria-labelledby') === e.id;
    }));
    expect(liens).toEqual([true, true, true]);
  });
});

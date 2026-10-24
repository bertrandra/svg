// L'editeur au doigt (ADR-0006) sur un telephone de 420 px : des cibles de 40 px au moins, des
// tiroirs qui s'ouvrent sous un voile et que le voile referme, le pincement pour zoomer.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, formesVisibles, ouvrirExemple, pilote } from './aide.js';

const TELEPHONE = { largeur: 420, hauteur: 860, tactile: true } as const;
const CIBLE_MIN = 40;

describe('editeur au doigt (420 px)', () => {
  const navigateur = pilote();

  async function telephone() {
    const { page } = await navigateur.ouvrir(TELEPHONE);
    await ouvrirExemple(page, true);
    return page;
  }

  /** Les controles de la zone `racine` dont un cote est sous `CIBLE_MIN` : nom, largeur, hauteur. */
  const petitesCibles = (page: Page, racine: string) => page.locator(`${racine} button:visible, ${racine} select:visible, ${racine} input:visible`).evaluateAll(
    (l, min) => l
      .map(e => { const r = e.getBoundingClientRect(); return { nom: (e.getAttribute('aria-label') ?? (e as HTMLElement).innerText ?? e.className).slice(0, 30), l: Math.round(r.width), h: Math.round(r.height), type: (e as HTMLInputElement).type }; })
      // Un curseur est une piste et une case une coche : seule leur hauteur compte, pas leur largeur.
      .filter(c => c.h < min || (c.type !== 'range' && c.type !== 'checkbox' && c.l < min)),
    CIBLE_MIN
  );

  it('detecte un pointeur grossier', async () => {
    const { page } = await navigateur.ouvrir(TELEPHONE);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  });

  it('donne 40 px au moins aux boutons et aux listes de la barre', async () => {
    const page = await telephone();
    const cibles = await page.locator('.editeur-cadre button:visible, .editeur-cadre select:visible').evaluateAll(
      l => l.filter(e => !e.closest('.editeur-calques, .editeur-inspecteur')).map(e => {
        const r = e.getBoundingClientRect();
        return { nom: (e.getAttribute('aria-label') ?? (e as HTMLElement).innerText ?? e.className).slice(0, 30), l: Math.round(r.width), h: Math.round(r.height) };
      })
    );
    expect(cibles.length).toBeGreaterThan(10);
    expect(cibles.filter(c => c.l < CIBLE_MIN || c.h < CIBLE_MIN)).toEqual([]);
  });

  it('ouvre l\'inspecteur en tiroir sous un voile, et le voile le referme', async () => {
    const page = await telephone();
    const inspecteur = page.locator('.editeur-inspecteur');
    // Au repos le tiroir est cache : ni visible, ni accessible.
    expect(await inspecteur.evaluate(e => getComputedStyle(e).visibility)).toBe('hidden');
    expect(await page.locator('.voile').count()).toBe(0);

    await page.getByRole('button', { name: 'Inspecteur' }).tap();
    await attend(() => page.locator('.voile').count()).toBe(1);
    // Il glisse (0,22 s) puis se pose : plus aucune translation.
    await attend(() => inspecteur.evaluate(e => getComputedStyle(e).transform)).toBe('none');
    expect(await inspecteur.evaluate(e => getComputedStyle(e).visibility)).toBe('visible');
    expect(await page.getByRole('button', { name: 'Inspecteur' }).getAttribute('aria-pressed')).toBe('true');

    // Dans le tiroir aussi, les champs et les boutons ont leur taille de doigt.
    expect(await petitesCibles(page, '.editeur-inspecteur')).toEqual([]);

    await page.locator('.voile').tap({ position: { x: 20, y: 200 } });
    await attend(() => page.locator('.voile').count()).toBe(0);
    await attend(() => inspecteur.evaluate(e => getComputedStyle(e).visibility)).toBe('hidden');
  });

  it('ouvre les calques en tiroir, et le bouton les referme', async () => {
    const page = await telephone();
    const calques = page.locator('.editeur-calques');
    expect(await calques.evaluate(e => getComputedStyle(e).visibility)).toBe('hidden');
    await page.getByRole('button', { name: 'Calques' }).tap();
    await attend(() => calques.evaluate(e => getComputedStyle(e).visibility)).toBe('visible');
    expect(await petitesCibles(page, '.editeur-calques')).toEqual([]);

    await page.getByRole('button', { name: 'Calques' }).tap();
    await attend(() => page.locator('.voile').count()).toBe(0);
    await attend(() => calques.evaluate(e => getComputedStyle(e).visibility)).toBe('hidden');
  });

  it('zoome au pincement de deux doigts sans rien modifier au dessin', async () => {
    const page = await telephone();
    const zoom = page.locator('.editeur-barre .zoom');
    const avant = await zoom.innerText();
    const toile = await page.locator('.editeur-svg-toile').boundingBox();
    if (!toile) throw new Error('la toile n’a pas de boîte');
    const cx = toile.x + toile.width / 2, cy = toile.y + toile.height / 2;
    // Playwright n'a pas de pincement : on rejoue les evenements de pointeur que la toile ecoute.
    await page.evaluate(({ cx, cy }) => {
      const el = document.querySelector('.editeur-svg-toile');
      if (!el) throw new Error('pas de toile');
      const ev = (type: string, id: number, x: number, y: number) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1, button: 0 }));
      ev('pointerdown', 1, cx - 40, cy); ev('pointerdown', 2, cx + 40, cy);
      ev('pointermove', 1, cx - 80, cy); ev('pointermove', 2, cx + 80, cy);
      ev('pointerup', 1, cx - 80, cy); ev('pointerup', 2, cx + 80, cy);
    }, { cx, cy });

    await attend(() => zoom.innerText()).not.toBe(avant);
    expect(await formesVisibles(page)).toBe(4);
    expect(await page.locator('.editeur-etat').innerText()).toMatch(/0 modification/);
  });

  it('ouvre l\'accueil sans debordement horizontal et avec des onglets de 40 px', async () => {
    const { page } = await navigateur.ouvrir(TELEPHONE);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const hauteurs = await page.getByRole('tab').evaluateAll(l => l.map(e => Math.round(e.getBoundingClientRect().height)));
    expect(hauteurs).toHaveLength(3);
    expect(Math.min(...hauteurs)).toBeGreaterThanOrEqual(CIBLE_MIN);
  });
});

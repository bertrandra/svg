// La ligne mediane dans la voie « Convertir une image » (ADR-0021) : un dessin au trait depose, le mode « Ligne médiane »
// choisi, des traces sans remplissage, une seule ligne par trait ; la vue Contours ; l'ouverture dans l'editeur en traces
// ouverts ; le tout au clavier, au doigt a 390 px, et sans remarque d'axe-core.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import { aLeFocus, attend, attendreAnimations, choisirVue, encoderPng, pilote, RACINE_DEPOT, texteDe } from './aide.js';

const TRACE = 60_000;
const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const dSeg = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
};

/** Un dessin au trait de 6 px a l'encre : un « T », un anneau, un « X ». Trois dessins, cinq lignes au milieu du trait. */
function dessinAuTrait() {
  const traits: ReadonlyArray<readonly [number, number, number, number]> = [[20, 30, 80, 30], [50, 30, 50, 110], [160, 30, 220, 110], [160, 110, 220, 30]];
  const png = encoderPng(260, 140, (x, y) => {
    const c = [x + 0.5, y + 0.5] as const, anneau = Math.hypot(c[0] - 115, c[1] - 70);
    return traits.some(([a, b, d, e]) => dSeg(c[0], c[1], a, b, d, e) <= 3) || (anneau >= 22 && anneau <= 28) ? [0x18, 0x18, 0x1c] : null;
  });
  return { name: 'dessin.png', mimeType: 'image/png', buffer: png };
}

async function auditer(page: Page): Promise<string[]> {
  await attendreAnimations(page);
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: unknown[] }> }>; incomplete: Array<{ id: string; nodes: Array<{ target: unknown[] }> }> }> } };
    const r = await w.axe.run(document, { resultTypes: ['violations', 'incomplete'] });
    const dire = (genre: string) => (v: { id: string; nodes: Array<{ target: unknown[] }> }) => genre + ' ' + v.id + ' ' + JSON.stringify(v.nodes.slice(0, 3).map(n => n.target));
    return [...r.violations.map(dire('violation')), ...r.incomplete.map(dire('à relire'))];
  });
}

describe('convertir une image en ligne mediane', () => {
  const navigateur = pilote();
  const resume = (page: Page) => texteDe(page.locator('.fiche-resultat [role=status]').first());
  const mode = (page: Page) => page.locator('.reglages-vecto select').first();

  async function deposer(options: Parameters<typeof navigateur.ouvrir>[0] = {}) {
    const { page } = await navigateur.ouvrir(options);
    const onglet = page.getByRole('tab', { name: /^Convertir une image/ });
    if (options.tactile) await onglet.tap(); else await onglet.click();
    await page.locator('.vectoriser input[type=file]').setInputFiles(dessinAuTrait());
    await page.locator('.fiche-resultat').waitFor({ timeout: TRACE });
    return page;
  }

  it('trace une seule ligne par trait, sans remplissage, et l ouvre en traces ouverts dans l editeur', async () => {
    const page = await deposer({ largeur: 1280, hauteur: 800 });
    await mode(page).selectOption('mediane');
    await attend(() => resume(page), TRACE).toMatch(/^fond #FFFFFF retiré depuis le bord \(\d+ %\) · 5 tracés · une ligne au milieu du trait · \d+ Ko · \d+ ms · Ligne médiane · normal$/);
    // L'essentiel se voit : l'epaisseur du trait, l'aide du stylo ; une seule action pleine.
    expect(await page.getByLabel('Épaisseur du trait', { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText('Pour le stylo d’une Cricut : une seule ligne par trait, sans remplissage.').isVisible()).toBe(true);
    expect(await page.locator('main button.primaire:visible').count()).toBe(1);
    // Les vecteurs du rideau : des traits sans remplissage.
    const svg = decodeURIComponent((await page.locator('.visionneuse .calque.haut').getAttribute('src') ?? '').replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
    expect((svg.match(/<path\b/g) ?? []).length).toBe(5);
    expect((svg.match(/fill="none"/g) ?? []).length).toBe(5);
    expect(svg).toContain('stroke-linecap="round"');
    await choisirVue(page, 'Contours');
    await attend(() => page.locator('.visionneuse .calque.haut').count()).toBe(1);
    expect(await auditer(page)).toEqual([]);

    await page.getByRole('button', { name: 'Ouvrir dans l’éditeur' }).click();
    await page.locator('.editeur-cadre').waitFor();
    await attend(() => page.locator('.editeur-calques ol > li').count()).toBe(5);
    // Sur la toile, chaque forme est un trait : aucun remplissage, et la boucle de l'anneau seule est fermee.
    const formes = page.locator('.editeur-cadre svg path[data-id]');
    expect(await formes.evaluateAll(l => l.map(e => e.getAttribute('fill')))).toEqual(Array(5).fill('none'));
    expect(await formes.evaluateAll(l => l.filter(e => /z\s*$/i.test(e.getAttribute('d') ?? '')).length)).toBe(1);
  });

  it('se pilote au clavier : le mode, le grain, l epaisseur, puis les reglages fins', async () => {
    const page = await deposer({ largeur: 1280, hauteur: 800 });
    await mode(page).focus();
    await page.keyboard.press('End');
    await attend(() => mode(page).inputValue()).toBe('mediane');
    await attend(() => resume(page), TRACE).toContain('une ligne au milieu du trait');
    const epaisseur = page.getByLabel('Épaisseur du trait', { exact: true });
    // Mode, Grain, puis l'epaisseur : l'ordre du regard.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await attend(() => aLeFocus(epaisseur)).toBe(true);
    const avant = await resume(page);
    await page.keyboard.press('ArrowRight');
    await attend(() => resume(page), TRACE).not.toBe(avant);
    expect(await resume(page)).toMatch(/Ligne médiane · normal · épaisseur \d+(\.\d)?$/);
    // L'epaisseur n'est pas un reglage fin : la section repliee ne la compte pas.
    const fins = page.locator('.reglages-vecto details.section', { has: page.locator('summary', { hasText: 'Réglages fins' }) });
    expect(await texteDe(fins.locator('summary'))).toBe('Réglages fins');
    await fins.locator('summary').focus();
    await page.keyboard.press('Enter');
    await attend(() => fins.getAttribute('open')).not.toBeNull();
    for (const libelle of ['Séparer le trait du fond', 'Ignorer les taches de moins de', 'Retirer les barbules de moins de', 'Raccorder les coupures de moins de']) {
      expect(await page.getByLabel(libelle, { exact: true }).count(), libelle).toBe(1);
    }
    await page.getByLabel('Raccorder les coupures de moins de', { exact: true }).focus();
    await page.keyboard.press('Home');
    await attend(() => texteDe(fins.locator('summary'))).toBe('Réglages fins 1 modifié');
    await attend(() => resume(page), TRACE).toContain('coupures 0');
    expect(await auditer(page)).toEqual([]);
  });

  it('au doigt (390 px) : des cibles de 40 px, rien ne deborde, axe sans remarque', async () => {
    const page = await deposer({ largeur: 390, hauteur: 2400, tactile: true });
    await mode(page).selectOption('mediane');
    await attend(() => resume(page), TRACE).toContain('une ligne au milieu du trait');
    const fins = page.locator('.reglages-vecto details.section', { has: page.locator('summary', { hasText: 'Réglages fins' }) });
    await fins.locator('summary').tap();
    await attend(() => fins.getAttribute('open')).not.toBeNull();
    const petites = await page.locator('.vectoriser button:visible, .vectoriser select:visible, .vectoriser summary:visible').evaluateAll(l => l
      .map(e => ({ nom: (e.getAttribute('aria-label') ?? (e as HTMLElement).innerText).slice(0, 30), h: Math.round(e.getBoundingClientRect().height) }))
      .filter(c => c.h < 40));
    expect(petites).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(await auditer(page)).toEqual([]);
  });
});

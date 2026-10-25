// Les bibliotheques libres (Material, Phosphor, Tabler, Healthicons, Lucide), chargees a la demande a cote de game-icons :
// filtrer par source et par nature, chercher « cœur » dans toutes les sources, inserer une forme Material et une forme Lucide
// en ligne dans l'editeur (leur origine s'ecrit, sans <metadata> CC BY), les credits qui les nomment, le clavier, le
// telephone, et axe-core sans rien a redire.

import { describe, expect, it } from 'vitest';
import type { Locator, Page } from 'playwright';
import { aLeFocus, attend, attendreAnimations, ouvrirExemple, pilote, RACINE_DEPOT, texteDe } from './aide.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CHARGEMENT = 60_000;
const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

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

/** « 4134 formes » ou « 76 formes sur 4134 · chargement… » : le nombre affiche, et vrai tant qu'une source se charge. */
async function decompte(zone: Locator): Promise<{ n: number; charge: boolean }> {
  const t = await texteDe(zone.locator('.recherche-formes > .aide[aria-live]'));
  const m = /^(\d+) formes?/.exec(t);
  if (!m) throw new Error('décompte illisible : ' + t);
  return { n: Number(m[1]), charge: t.includes('chargement de') };
}

/** Les noms accessibles des vignettes montrees. */
const nomsVignettes = (zone: Locator) => zone.locator('.vignette').evaluateAll(l => l.map(e => e.getAttribute('aria-label') ?? ''));
const pastille = (zone: Locator, groupe: 'Source' | 'Nature', nom: string) => zone.getByRole('group', { name: groupe }).getByRole('button', { name: nom, exact: true });
/** Attend la fin de tout chargement de source. */
const charge = (zone: Locator) => attend(async () => (await decompte(zone)).charge, CHARGEMENT).toBe(false);

describe('bibliotheques libres', () => {
  const navigateur = pilote();
  const apercu = (page: Page) => page.locator('img.apercu').evaluate(i => decodeURIComponent((i as HTMLImageElement).src.replace(/^data:image\/svg\+xml;charset=utf-8,/, '')));

  async function page(options: Parameters<typeof navigateur.ouvrir>[0] = {}) {
    const { page: p } = await navigateur.ouvrir(options);
    await p.getByRole('tab', { name: /Bibliothèque/ }).click();
    await p.getByRole('button', { name: /Charger la bibliothèque/ }).click();
    await p.locator('.bibliotheque .vignette').first().waitFor({ timeout: CHARGEMENT });
    return p;
  }

  it('filtre par source, puis par nature : « En ligne » elargit aux sources qui en ont, chaque vignette dit sa source', async () => {
    const p = await page();
    const zone = p.locator('.bibliotheque');
    expect(await pastille(zone, 'Source', 'game-icons').getAttribute('aria-pressed')).toBe('true');
    expect(await pastille(zone, 'Source', 'Material').getAttribute('title')).toMatch(/Apache 2\.0 · formes pleines · environ \d+ Mo à charger$/);

    await pastille(zone, 'Source', 'Material').click();
    await charge(zone);
    expect((await decompte(zone)).n).toBeGreaterThan(5000);
    expect((await nomsVignettes(zone)).every(n => n.endsWith(' (Material)'))).toBe(true);

    await pastille(zone, 'Nature', 'En ligne (stylo)').click();
    await attend(() => pastille(zone, 'Source', 'Toutes').getAttribute('aria-pressed')).toBe('true');
    await charge(zone);
    const lignes = await nomsVignettes(zone);
    expect(lignes.length).toBeGreaterThan(0);
    expect(lignes.every(n => n.endsWith(', en ligne)'))).toBe(true);

    // Lucide n'a que des lignes : la choisir avec « Pleines » remet la nature a « Toutes », la grille ne reste jamais vide.
    await pastille(zone, 'Nature', 'Pleines (découpe)').click();
    await pastille(zone, 'Source', 'Lucide').click();
    await attend(() => pastille(zone, 'Nature', 'Toutes').getAttribute('aria-pressed')).toBe('true');
    await charge(zone);
    expect((await decompte(zone)).n).toBeGreaterThan(1000);
    expect((await nomsVignettes(zone)).every(n => n.endsWith(' (Lucide, en ligne)'))).toBe(true);
    expect(await auditer(p)).toEqual([]);
  });

  it('cherche « cœur » dans toutes les sources chargees', async () => {
    const p = await page();
    const zone = p.locator('.bibliotheque');
    await pastille(zone, 'Source', 'Toutes').click();
    await zone.locator('input[type=search]').fill('cœur');
    await charge(zone);
    const noms = await zone.locator('.vignette').evaluateAll(l => l.map(e => e.getAttribute('aria-label') ?? ''));
    for (const source of ['game-icons', 'Material', 'Phosphor', 'Tabler', 'Healthicons', 'Lucide']) {
      // Les 48 premieres vignettes peuvent ne pas toutes les montrer : on demande la suite tant qu'il en manque une.
      if (!noms.some(n => n.includes('(' + source))) {
        for (let i = 0; i < 6 && !(await zone.locator('.vignette').evaluateAll((l, s) => l.some(e => (e.getAttribute('aria-label') ?? '').includes('(' + s)), source)); i++) {
          await zone.getByRole('button', { name: /^Afficher \d+ de plus$/ }).click();
        }
      }
      expect(await zone.locator('.vignette').evaluateAll((l, s) => l.some(e => (e.getAttribute('aria-label') ?? '').includes('(' + s)), source), source).toBe(true);
    }
    expect(await auditer(p)).toEqual([]);
  });

  it('se pilote au clavier : Tab entre dans le groupe des sources, les fleches y vont de l une a l autre, Entree choisit', async () => {
    const p = await page();
    const zone = p.locator('.bibliotheque');
    await zone.locator('input[type=search]').focus();
    await p.keyboard.press('Tab');
    const toutes = pastille(zone, 'Source', 'Toutes');
    expect(await aLeFocus(toutes)).toBe(true);
    await p.keyboard.press('End');
    const lucide = pastille(zone, 'Source', 'Lucide');
    expect(await aLeFocus(lucide)).toBe(true);
    await p.keyboard.press('Enter');
    await attend(() => lucide.getAttribute('aria-pressed')).toBe('true');
    await charge(zone);
    await p.keyboard.press('ArrowRight');
    expect(await aLeFocus(toutes)).toBe(true);
    expect((await nomsVignettes(zone)).every(n => n.endsWith('(Lucide, en ligne)'))).toBe(true);
  });

  it('au doigt (390 px) : les sources defilent sur une ligne, des cibles de 40 px, rien ne deborde, axe sans remarque', async () => {
    const p = await page({ largeur: 390, hauteur: 800, tactile: true });
    const zone = p.locator('.bibliotheque');
    const rangee = zone.getByRole('group', { name: 'Source' }).locator('.pastilles');
    const forme = await rangee.evaluate(e => ({ h: e.getBoundingClientRect().height, defile: e.scrollWidth > e.clientWidth }));
    expect(forme.defile).toBe(true);
    expect(forme.h).toBeLessThan(60);
    expect(await zone.locator('button.pastille-filtre').evaluateAll(l => l.map(e => e.getBoundingClientRect().height).filter(h => h < 40))).toEqual([]);
    await pastille(zone, 'Source', 'Tabler').tap();
    await charge(zone);
    expect(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(await auditer(p)).toEqual([]);
  });

  it('insere une forme Material et une forme Lucide en ligne : leur origine s ecrit, sans <metadata> CC BY', async () => {
    const { page: p } = await navigateur.ouvrir();
    await ouvrirExemple(p);
    await p.locator('.editeur-inspecteur .section > summary', { hasText: 'Bibliothèque de formes' }).click();
    await p.getByRole('button', { name: /Charger la bibliothèque/ }).click();
    const zone = p.locator('.editeur-inspecteur');
    await zone.locator('.vignette').first().waitFor({ timeout: CHARGEMENT });

    await pastille(zone, 'Source', 'Material').click();
    await zone.locator('input[type=search]').fill('cœur');
    await charge(zone);
    await zone.getByRole('button', { name: 'cœur (Material)', exact: true }).click();
    await attend(() => p.locator('.editeur-barre-selection').count()).toBe(1);
    await p.keyboard.press('Escape');

    // Sans selection, le panneau du dessin revient : la recherche repart de zero.
    await pastille(zone, 'Source', 'Lucide').click();
    await zone.locator('input[type=search]').fill('cœur');
    await charge(zone);
    await zone.getByRole('button', { name: 'cœur (Lucide, en ligne)', exact: true }).click();
    await attend(() => p.locator('.editeur-barre-selection').count()).toBe(1);

    await p.keyboard.press('Control+s');
    await p.locator('img.apercu').waitFor();
    const svg = await apercu(p);
    expect(svg).toContain('data-origine="mdi:heart"');
    expect(svg).toMatch(/fill="none" stroke="#000000"[^>]*data-origine="lucide:heart"/);
    expect(svg).not.toContain('<metadata');
    expect(svg).not.toContain('CC BY');
  });

  it('les credits nomment chaque autre bibliotheque, sa licence et son titulaire', async () => {
    const { page: p } = await navigateur.ouvrir();
    await p.getByRole('button', { name: 'À propos et crédits' }).click();
    const boite = p.getByRole('dialog', { name: 'À propos et crédits' });
    await boite.waitFor();
    const texte = await boite.innerText();
    for (const attendu of ['Material Design Icons', 'Pictogrammers', 'Apache License 2.0', 'Phosphor Icons', 'Tabler Icons', 'Paweł Kuna', 'Healthicons', 'Resolve to Save Lives', 'Lucide', 'licence ISC']) {
      expect(texte, attendu).toContain(attendu);
    }
    expect(await auditer(p)).toEqual([]);
  });
});

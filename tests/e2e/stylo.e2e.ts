// Le procede « Dessin au stylo » (ADR-0022), par la vraie page : la Cricut ecrit avec un stylo, elle ne remplit pas. Le choisir
// dans le selecteur de machine ; une forme pleine se hachure ; un texte a contour passe en police a trait unique ; l'export ecrit
// des traits sans fond, a taille physique ; en decoupe, un trait ouvert se dit et des lettres serrees se soudent ; au doigt.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Download, Page } from 'playwright';
import { attend, ouvrirCode, pilote, RACINE_DEPOT, texteDe } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
/** Un carre plein de 2 po (a 96 unites par pouce) et une ligne ouverte. */
const DESSIN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 288"><path d="M48 48H240V240H48Z" fill="#c81e28"/><path d="M288 96L432 96" fill="none" stroke="#1f4e8c" stroke-width="2"/></svg>';

describe('le dessin au stylo', () => {
  const navigateur = pilote();
  const panneau = (page: Page) => page.locator('.panneau-cricut');
  const selecteur = (page: Page) => page.locator('.selecteur-contexte .menu-bouton');
  const message = (page: Page) => texteDe(page.locator('.message-etat'));

  async function editeur(svg = DESSIN, options: Parameters<typeof navigateur.ouvrir>[0] = {}): Promise<Page> {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800, ...options });
    await ouvrirCode(page, svg, options.tactile);
    return page;
  }
  async function choisir(page: Page, procede: 'Dessin au stylo' | 'Découpe') {
    await selecteur(page).click();
    await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
    await panneau(page).locator('.constat, .pret').first().waitFor();
    if (procede === 'Découpe') return;
    await selecteur(page).click();
    await page.getByRole('menuitemradio', { name: 'Dessin au stylo', exact: true }).click();
    await attend(() => texteDe(panneau(page).locator('summary').first())).toMatch(/^Prêt pour le stylo/);
  }
  async function ajouterTexte(page: Page, texte: string, police: string) {
    await page.keyboard.press('t');
    await page.locator('.editeur-inspecteur select[aria-label="Police"]').waitFor({ timeout: 30_000 });
    await page.locator('.editeur-inspecteur textarea[aria-label="Texte"]').fill(texte);
    await page.locator('.editeur-inspecteur select[aria-label="Police"]').selectOption(police);
    await page.getByRole('button', { name: 'Ajouter le texte' }).click();
    await page.locator('.editeur-inspecteur details.section', { has: page.locator('summary', { hasText: 'Texte' }) }).waitFor();
  }

  it('se choisit dans le selecteur, a cote des outils a venir, et dit que le stylo trace le pourtour d une forme pleine', async () => {
    const page = await editeur();
    await choisir(page, 'Dessin au stylo');
    await expect(selecteur(page).textContent()).resolves.toBe('Cricut Maker · 12 × 12 · Stylo');
    await selecteur(page).click();
    expect(await page.getByRole('menuitem', { name: 'Bientôt : gravure, dorure (foil)' }).isDisabled()).toBe(true);
    await page.keyboard.press('Escape');
    const constat = panneau(page).locator('.constat', { hasText: 'Le stylo trace le pourtour des formes pleines' });
    await attend(() => constat.count()).toBe(1);
    // Deux corrections pour une forme sans texte : garder le contour, hachurer.
    await expect(constat.getByRole('button').allInnerTexts()).resolves.toEqual(['Garder le contour', 'Hachurer', 'Choisir les formes']);
  });

  it('hachure la forme pleine : des lignes et le pourtour, sans fond ; Ctrl+Z la rend', async () => {
    const page = await editeur();
    await choisir(page, 'Dessin au stylo');
    await panneau(page).getByRole('button', { name: 'Hachurer', exact: true }).click();
    await attend(() => message(page)).toMatch(/^1 forme hachurée à la largeur du stylo/);
    const carre = page.locator('.editeur-svg-toile path[data-id="f1"]');
    await expect(carre.getAttribute('fill')).resolves.toBe('none');
    await expect(carre.getAttribute('stroke')).resolves.toBe('#c81e28');
    await attend(() => panneau(page).locator('.constat').count()).toBe(0);
    await page.keyboard.press('Control+z');
    await attend(() => carre.getAttribute('fill')).toBe('#c81e28');
  });

  it('un texte a contour : « Police à trait unique » le recompose en traits ouverts, puis l export ecrit des traits sans fond', async () => {
    const page = await editeur();
    await choisir(page, 'Dessin au stylo');
    await ajouterTexte(page, 'Merci', 'inter');
    await attend(() => panneau(page).locator('.constat', { hasText: /^Double trait/ }).count()).toBe(1);
    await panneau(page).locator('.constat', { hasText: /^Double trait/ }).getByRole('button', { name: 'Police à trait unique' }).click();
    await attend(() => message(page)).toMatch(/^1 texte en police à trait unique/);
    await attend(() => page.locator('.editeur-inspecteur select[aria-label="Police"]').inputValue()).toBe('ems-readability');
    await expect(page.locator('.editeur-svg-toile path[data-id="f3"]').getAttribute('fill')).resolves.toBe('none');
    // Le carre reste plein : on le garde en contour, puis plus rien n'est a corriger.
    await panneau(page).getByRole('button', { name: 'Garder le contour', exact: true }).click();
    await attend(() => panneau(page).locator('.constat').count()).toBe(0);
    const [t]: [Download, void] = await Promise.all([page.waitForEvent('download'), panneau(page).getByRole('button', { name: 'Exporter pour le stylo' }).click()]);
    expect(t.suggestedFilename()).toBe('dessin-stylo.svg');
    const svg = readFileSync(await t.path(), 'utf8');
    expect(svg).toMatch(/ width="[\d.]+mm" height="[\d.]+mm"/);
    expect(svg).toContain('data-ed-procede="dessin-stylo"');
    expect([...svg.matchAll(/ fill="([^"]*)"/g)].map(m => m[1]).every(f => f === 'none')).toBe(true);
    expect(svg).not.toContain('data-ed-texte');
    // La carte « Dans Design Space » dit les etapes du stylo, et ce qui n'est pas verifie.
    const carte = panneau(page).locator('.carte-design-space');
    await expect(carte.locator('li', { hasText: 'Pour chaque couche, choisissez « Dessiner »' }).locator('.a-verifier').count()).resolves.toBe(1);
  });

  it('en decoupe, un texte a trait unique se range « À écrire » ; dit « à couper », le constat du trait ouvert propose d y revenir', async () => {
    const page = await editeur('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 288"><path d="M48 48H240V240H48Z" fill="#c81e28"/></svg>');
    await choisir(page, 'Découpe');
    await ajouterTexte(page, 'Lune', 'ems-readability');
    // ADR-0028 : un texte a trait unique se propose a ecrire, le carre plein a couper ; aucun constat ne bloque.
    const aEcrire = page.locator('.editeur-calques .groupe-ecriture');
    await attend(() => aEcrire.locator('li').count()).toBe(1);
    const constat = panneau(page).locator('.constat', { hasText: /^Un trait ouvert ne se découpe pas/ });
    await attend(() => constat.count()).toBe(0);
    // Le texte choisi (il vient d'etre pose), Maj+X le dit « à couper » : la lame ne le saurait pas, le constat le dit.
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('Shift+X');
    await attend(() => constat.count()).toBe(1);
    await constat.getByRole('button', { name: 'Écrire au stylo' }).click();
    await attend(() => constat.count()).toBe(0);
    await attend(() => aEcrire.locator('li').count()).toBe(1);
    expect(await texteDe(panneau(page).locator('summary').first())).toMatch(/^Prêt pour Cricut/);
  });

  it('en decoupe, des lettres serrees se chevauchent : « Souder » les rend d un seul tenant', async () => {
    const page = await editeur('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 288"><path d="M8 8H20V20H8Z" fill="#1f4e8c"/></svg>');
    await choisir(page, 'Découpe');
    await ajouterTexte(page, 'mamie', 'pacifico');
    const constat = panneau(page).locator('.constat', { hasText: 'Les lettres se chevauchent' });
    await attend(() => constat.count()).toBe(1);
    await constat.getByRole('button', { name: 'Souder', exact: true }).click();
    await attend(() => message(page)).toMatch(/^1 texte soudé/);
    await attend(() => constat.count()).toBe(0);
  });

  it('a 390 px au doigt, le procede se choisit dans le menu « Plus », et le panneau passe axe-core', async () => {
    const page = await editeur(DESSIN, { largeur: 390, hauteur: 800, tactile: true });
    const plus = page.locator('.editeur-barre .menu-bouton[aria-label^="Plus d’actions"]');
    await plus.tap();
    await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).tap();
    await plus.tap();
    await page.getByRole('menuitemradio', { name: 'Dessin au stylo', exact: true }).tap();
    await page.locator('.editeur-etat button[aria-label="Inspecteur"]').tap();
    await attend(() => texteDe(panneau(page).locator('summary').first())).toMatch(/^Prêt pour le stylo/);
    const hachurer = panneau(page).getByRole('button', { name: 'Hachurer', exact: true });
    expect((await hachurer.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
    await page.addScriptTag({ content: AXE });
    const graves = await page.evaluate(async () => {
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null }> }> } };
      return (await w.axe.run(document, { resultTypes: ['violations'] })).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id);
    });
    expect(graves).toEqual([]);
  });
});

// Le texte deforme dans une forme (ADR-0032), par la vraie page : « Dans la forme » dans la barre de texte, puis un clic sur le cœur,
// et le texte en prend la silhouette ; retape sur la toile, il se redeforme ; la forme deplacee, il la suit ; « Remplir : En lignes »
// dans le panneau rend l'ancien remplissage, et un texte deja en lignes le garde ; le trace Median ; le fichier (des contours et la
// disposition) ; axe-core en clair et en sombre ; 390 px au doigt. Avec CAPTURES, les captures d'un texte deforme dans un cœur, un
// cercle et une etoile (1280 et 390 px, clair et sombre).

import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Download, Page } from 'playwright';
import { aLeFocus, attend, telechargerParFichier, modifications, ouvrirCode, pilote, RACINE_DEPOT, texteDe } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const CAPTURES = process.env['CAPTURES'] ?? '';

// Un cercle (f1) et un cœur (f2), loin du coin haut gauche ou l'on tape le texte (f3).
const COEUR = 'M300 110C300 80 255 60 240 95C225 130 270 170 300 200C330 170 375 130 360 95C345 60 300 80 300 110Z';
const PLAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<circle cx="120" cy="160" r="70" fill="#f2c94c"/><path d="' + COEUR + '" fill="#eb5757"/></svg>';

/** Un cercle, un cœur et une etoile, cote a cote, pour les captures. */
const ETOILE = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 26 : 62; pts.push((332 + r * Math.cos(a)).toFixed(1) + ' ' + (180 + r * Math.sin(a)).toFixed(1)); }
  return 'M' + pts.join('L') + 'Z';
})();
const TROIS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<circle cx="68" cy="180" r="58" fill="#f2c94c"/>'
  + '<path d="M200 150C200 125 162 108 150 138C138 168 175 200 200 228C225 200 262 168 250 138C238 108 200 125 200 150Z" fill="#eb5757"/>'
  + '<path d="' + ETOILE + '" fill="#6fcf97"/></svg>';

describe('le texte deforme dans une forme', () => {
  const navigateur = pilote();
  const barre = (page: Page) => page.getByRole('toolbar', { name: 'Texte' });
  const dit = (page: Page) => page.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim());
  const message = (page: Page) => texteDe(page.locator('.message-etat'));
  const disposition = (page: Page, nom: 'Libre' | 'Sur la forme' | 'Dans la forme') => barre(page).getByRole('group', { name: 'Disposition' }).locator('button[aria-label^="' + nom + '"]');
  const remplir = (page: Page) => page.locator('.editeur-inspecteur .disposition-texte').getByRole('group', { name: 'Remplir' });

  async function boite(page: Page, id: string) {
    const r = await page.locator('.editeur-svg-toile path[data-id="' + id + '"]').boundingBox();
    if (!r) throw new Error('forme ' + id + ' introuvable');
    return r;
  }

  async function surPlan(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
    const r = await page.locator('.editeur-svg-toile .plan-travail').boundingBox();
    if (!r) throw new Error('plan de travail introuvable');
    return { x: r.x + (r.width * x) / 400, y: r.y + (r.height * y) / 300 };
  }

  /** Un texte tape en haut a gauche du plan, puis choisi (la saisie terminee). */
  async function taper(page: Page, texte: string, id: string, tactile = false): Promise<void> {
    if (tactile) await page.locator('.editeur-barre button[title^="Texte (T)"]').tap(); else await page.keyboard.press('t');
    const p = await surPlan(page, 20, 30);
    if (tactile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    await attend(() => aLeFocus(page.locator('textarea.saisie-champ'))).toBe(true);
    await page.keyboard.type(texte);
    await attend(() => page.locator('.editeur-svg-toile path[data-id="' + id + '"]').count()).toBe(1);
    await page.keyboard.press('Escape');
    await attend(() => page.locator('textarea.saisie-champ').count()).toBe(0);
  }

  async function avecTexte(page: Page, texte = 'AVEC AMOUR', tactile = false): Promise<void> {
    await ouvrirCode(page, PLAN, tactile);
    await taper(page, texte, 'f3', tactile);
    await attend(() => disposition(page, 'Libre').count()).toBe(tactile ? 0 : 1);
  }

  /** « Dans la forme » dans la barre, puis un clic sur la forme. */
  async function deformer(page: Page, x: number, y: number): Promise<void> {
    await disposition(page, 'Dans la forme').click();
    await attend(() => message(page)).toMatch(/^Cliquez la forme dans laquelle poser le texte/);
    const p = await surPlan(page, x, y);
    await page.mouse.click(p.x, p.y);
    await attend(() => page.locator('.editeur-toile[data-choix-forme]').count()).toBe(0);
  }

  async function capture(page: Page, nom: string): Promise<void> {
    if (!CAPTURES) return;
    mkdirSync(CAPTURES, { recursive: true });
    await page.screenshot({ path: resolve(CAPTURES, nom + '.png') });
  }

  async function auditAxe(page: Page): Promise<string[]> {
    await page.addScriptTag({ content: AXE });
    return page.evaluate(async () => {
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: unknown[] }> }> }> } };
      return (await w.axe.run(document, { resultTypes: ['violations'] })).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)));
    });
  }

  /**
   * Vrai si la boite du texte remplit celle de la forme : dedans, et presque de bord a bord (en hauteur, moins pour des minuscules :
   * au milieu, sans hampe ni jambage, leur encre ne monte pas jusqu'au haut du bloc).
   */
  async function remplitLaForme(page: Page, texte: string, forme: string, hauteur = 0.75): Promise<void> {
    const t = await boite(page, texte), c = await boite(page, forme);
    expect(t.x).toBeGreaterThanOrEqual(c.x - 1);
    expect(t.x + t.width).toBeLessThanOrEqual(c.x + c.width + 1);
    expect(t.y).toBeGreaterThanOrEqual(c.y - 1);
    expect(t.y + t.height).toBeLessThanOrEqual(c.y + c.height + 1);
    expect(t.width).toBeGreaterThan(0.8 * c.width);
    expect(t.height).toBeGreaterThan(hauteur * c.height);
  }

  it('pose le texte dans le cœur depuis la barre : il en prend la silhouette, la taille se calcule, et c est dit', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await avecTexte(page);
    const avant = await modifications(page);
    await deformer(page, 300, 140);
    await attend(() => dit(page)).toBe('Texte déformé dans tracé courbe 2 : il en prend la silhouette. « Plus d’options » le remplit en lignes ; Ctrl+Z annule.');
    expect(await modifications(page)).toBe(avant + 1);
    await remplitLaForme(page, 'f3', 'f2');
    expect(await disposition(page, 'Dans la forme').getAttribute('aria-pressed')).toBe('true');
    // La taille se calcule d'apres la forme : le champ est inactif et dit pourquoi.
    const taille = barre(page).getByRole('group', { name: 'Taille' }).getByLabel('Taille');
    expect(await taille.isDisabled()).toBe(true);
    expect(await barre(page).getByRole('group', { name: 'Taille' }).locator('label').getAttribute('title')).toMatch(/^La forme donne la taille du texte déformé/);
    expect(await page.locator('.guide-disposition .guide-forme').count()).toBe(1);
    expect(await page.getByRole('slider', { name: 'Départ du texte sur la forme' }).count()).toBe(0);
    await capture(page, 'barre-coeur-1280-clair');
  });

  it('se retape sur la toile : la deformation suit, le curseur est dans le cœur', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await avecTexte(page, 'AMOUR');
    await deformer(page, 300, 140);
    const t0 = await boite(page, 'f3');
    await page.keyboard.press('Enter');
    const champ = page.locator('textarea.saisie-champ');
    await attend(() => aLeFocus(champ)).toBe(true);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('TOUJOURS');
    // Deux lignes : le texte se redeforme et remplit toujours le cœur.
    await attend(async () => Math.abs((await boite(page, 'f3')).height - t0.height) > 0.5 || (await boite(page, 'f3')).width !== t0.width).toBe(true);
    await remplitLaForme(page, 'f3', 'f2');
    const c = await boite(page, 'f2'), curseur = await page.locator('.saisie-calque .curseur-saisie').boundingBox();
    if (!curseur) throw new Error('curseur');
    expect(curseur.x).toBeGreaterThan(c.x);
    expect(curseur.x).toBeLessThan(c.x + c.width + 8);
    expect(curseur.y).toBeGreaterThan(c.y);
    await capture(page, 'saisie-coeur-1280-clair');
    await page.keyboard.press('Escape');
    await attend(() => dit(page)).toMatch(/^Texte modifié : « AMOUR \/ TOUJOURS »/);
  });

  it('suit sa forme : deplacer le cœur redeforme le texte, le supprimer le rend libre', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await avecTexte(page, 'COEUR');
    await deformer(page, 300, 140);
    const t0 = await boite(page, 'f3');
    // Un clic pres de la pointe prend le cœur (le texte se prend par ses lettres), on le tire de 40 unites vers la gauche.
    const m = await surPlan(page, 300, 192), arrivee = await surPlan(page, 260, 192);
    await page.mouse.move(m.x, m.y);
    await page.mouse.down();
    await page.mouse.move(arrivee.x, arrivee.y, { steps: 6 });
    await page.mouse.up();
    await attend(async () => (await boite(page, 'f3')).x).toBeLessThan(t0.x - 20);
    await remplitLaForme(page, 'f3', 'f2');
    await page.keyboard.press('Delete');
    await attend(() => page.locator('.editeur-svg-toile path[data-id="f2"]').count()).toBe(0);
    await attend(() => dit(page)).toMatch(/n’existe plus : il redevient un texte libre/);
    await page.keyboard.press('Control+z');
    await attend(() => page.locator('.editeur-svg-toile path[data-id="f2"]').count()).toBe(1);
    await remplitLaForme(page, 'f3', 'f2');
  });

  it('remplit en lignes depuis le panneau, et revient a la deformation ; un texte en lignes le reste', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await avecTexte(page, 'Avec tout mon amour pour toi');
    await deformer(page, 300, 140);
    const deforme = await boite(page, 'f3');
    await page.getByRole('button', { name: 'Plus d’options' }).click();
    const groupe = remplir(page);
    await groupe.waitFor();
    expect(await groupe.getByRole('button', { name: 'En déformant les lettres' }).getAttribute('aria-pressed')).toBe('true');
    expect(await page.locator('.editeur-inspecteur .disposition-texte').getByLabel('Ajuster la taille pour remplir la forme').count()).toBe(0);
    await groupe.getByRole('button', { name: 'En lignes' }).click();
    await attend(() => dit(page)).toMatch(/^Le texte remplit la forme en lignes, ses lettres droites\./);
    await attend(() => groupe.getByRole('button', { name: 'En lignes' }).getAttribute('aria-pressed')).toBe('true');
    // En lignes, les lettres sont droites et plus petites : la boite du texte se resserre dans le cœur.
    const lignes = await boite(page, 'f3');
    expect(lignes.height).toBeLessThan(deforme.height);
    expect(await page.locator('.editeur-inspecteur .disposition-texte').getByLabel('Ajuster la taille pour remplir la forme').count()).toBe(1);
    // « Dans la forme » de la barre garde l'etat d'un texte deja en lignes : il ne change pas.
    expect(await disposition(page, 'Dans la forme').getAttribute('aria-pressed')).toBe('true');
    const avant = await modifications(page);
    await disposition(page, 'Dans la forme').click();
    expect(await modifications(page)).toBe(avant);
    await groupe.getByRole('button', { name: 'En déformant les lettres' }).click();
    await attend(() => dit(page)).toMatch(/^Le texte se déforme pour prendre la silhouette de la forme\./);
    await remplitLaForme(page, 'f3', 'f2', 0.6);
    expect(Math.abs((await boite(page, 'f3')).height - deforme.height)).toBeLessThan(1);
    // La marge eloigne le texte du bord.
    const marge = page.locator('.editeur-inspecteur .disposition-texte').getByLabel('Marge');
    const t0 = await boite(page, 'f3');
    const valeur = Number((await marge.inputValue()).replace(',', '.'));
    await marge.fill(String(Math.round(valeur * 4 * 100) / 100));
    await marge.press('Enter');
    await attend(async () => (await boite(page, 'f3')).width).toBeLessThan(t0.width - 4);
  });

  it('passe en trace Median, et le fichier ne porte que des contours et sa disposition', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await avecTexte(page, 'MERCI');
    await deformer(page, 300, 140);
    await barre(page).getByRole('button', { name: 'Médian' }).click();
    await attend(() => page.locator('.editeur-svg-toile path[data-id="f3"]').getAttribute('fill')).toBe('none');
    const t = await boite(page, 'f3'), c = await boite(page, 'f2');
    expect(t.width).toBeGreaterThan(0.7 * c.width);
    const [d]: [Download, void] = await Promise.all([page.waitForEvent('download'), telechargerParFichier(page)]);
    const svg = readFileSync(await d.path(), 'utf8');
    expect(svg).not.toMatch(/<text|textPath|font-family/);
    expect(svg).toMatch(/<path d="M[^"]+" fill="none" stroke="[^"]+" stroke-width="[^"]+"[^>]* data-ed-trace="median"[^>]* data-ed-disposition="enveloppe"[^>]* data-ed-forme="2"/);
    expect(svg).not.toMatch(/data-ed-(?:ajuster|justifier|depart)/);
  });

  it('se pose aussi depuis le menu de la selection, deforme', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await avecTexte(page, 'MENU');
    const c = await surPlan(page, 120, 160);
    await page.keyboard.down('Shift');
    await page.mouse.click(c.x, c.y);
    await page.keyboard.up('Shift');
    await page.getByRole('button', { name: /^Texte et forme/ }).click();
    await page.getByRole('menuitem', { name: 'Poser le texte dans la forme' }).click();
    await attend(() => dit(page)).toMatch(/^Texte déformé dans cercle 1/);
    await remplitLaForme(page, 'f3', 'f1');
  });

  for (const schema of ['light', 'dark'] as const) {
    it('passe axe-core en ' + (schema === 'light' ? 'clair' : 'sombre') + ' : barre et panneau d un texte deforme', async () => {
      const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800, schema });
      await avecTexte(page, 'AXE');
      await deformer(page, 300, 140);
      await page.getByRole('button', { name: 'Plus d’options' }).click();
      await remplir(page).waitFor();
      expect(await auditAxe(page)).toEqual([]);
      await remplir(page).scrollIntoViewIfNeeded();
      await capture(page, 'panneau-coeur-1280-' + (schema === 'light' ? 'clair' : 'sombre'));
    });
  }

  for (const schema of ['light', 'dark'] as const) {
    it('tient a 390 px au doigt (' + (schema === 'light' ? 'clair' : 'sombre') + ') : « Dans la forme » dans le menu, aucun defilement, axe-core passe', async () => {
      const { page } = await navigateur.ouvrir({ largeur: 390, hauteur: 844, tactile: true, schema });
      await avecTexte(page, 'DOIGT', true);
      await barre(page).getByRole('button', { name: /^Plus de réglages du texte/ }).tap();
      await page.getByRole('menuitemradio', { name: 'Dans la forme' }).tap();
      await attend(() => message(page)).toMatch(/^Touchez la forme dans laquelle poser le texte/);
      const p = await surPlan(page, 300, 140);
      await page.touchscreen.tap(p.x, p.y);
      await attend(() => dit(page)).toMatch(/^Texte déformé dans tracé courbe 2/);
      await remplitLaForme(page, 'f3', 'f2');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await barre(page).evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
      expect(await auditAxe(page)).toEqual([]);
    });
  }

  // Les captures du rapport : un texte deforme dans un cercle, un cœur et une etoile, a 1280 et 390 px, en clair et en sombre.
  for (const [largeur, hauteur, tactile] of [[1280, 800, false], [390, 844, true]] as const) {
    for (const schema of ['light', 'dark'] as const) {
      it.runIf(!!CAPTURES)('capture le cercle, le cœur et l etoile a ' + largeur + ' px (' + schema + ')', async () => {
        const { page } = await navigateur.ouvrir({ largeur, hauteur, schema, tactile });
        await ouvrirCode(page, TROIS, tactile);
        const poses: Array<[string, string, number, number]> = [['JOIE', 'f4', 68, 180], ['Je t’aime', 'f5', 200, 175], ['ÉTOILE', 'f6', 332, 185]];
        for (const [texte, id, x, y] of poses) {
          await taper(page, texte, id, tactile);
          if (tactile) {
            await barre(page).getByRole('button', { name: /^Plus de réglages du texte/ }).tap();
            await page.getByRole('menuitemradio', { name: 'Dans la forme' }).tap();
            const p = await surPlan(page, x, y);
            await page.touchscreen.tap(p.x, p.y);
          } else await deformer(page, x, y);
          await attend(() => dit(page)).toMatch(/^Texte déformé dans/);
        }
        await page.keyboard.press('Escape');
        await capture(page, 'trois-formes-' + largeur + '-' + (schema === 'light' ? 'clair' : 'sombre'));
      });
    }
  }
});

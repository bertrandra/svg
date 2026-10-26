// Le tapis fixe et la feuille en contexte Cricut (ADR-0039), dans le navigateur : decocher « Recalage automatique » garde la place des
// formes a l'export (cadre de reperage, coordonnees inchangees), le laisser coche rend l'export d'avant ; « Dupliquer sur la feuille »
// remplit la feuille et Ctrl+Z retire toutes les copies d'un coup, pose une quantite, range tout dans une feuille partielle decalee,
// et l'optimisation avancee emboite des etoiles sans chevauchement, plus que la simple.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Download, Page } from 'playwright';
import { attend, attendreAnimations, formesVisibles, ouvrirCode, ouvrirMenu, pilote, RACINE_DEPOT } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
interface ResultatAxe { violations: { id: string; nodes: { target: unknown[] }[] }[]; incomplete: { id: string; nodes: { target: unknown[] }[] }[] }

/** Un tapis de 12 po en plan (96 unites par pouce) et un rectangle pose au milieu. */
const MILIEU = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1152 1152"><path d="M480 528L672 528L672 624L480 624Z" fill="#c81e28"/></svg>';
/** Le meme, ouvert deja en Cricut sans recalage, avec une feuille de 4 x 3 po a 6 po et 5 po du coin du tapis. */
const FIXE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1152 1152" data-ed-contexte="cricut" data-ed-machine="maker" data-ed-tapis="12x12" data-ed-materiau="papier-cartonne" data-ed-procede="decoupe" data-ed-unite="mm" data-ed-recalage="non" data-ed-feuille="57600-48000-38400-28800">'
  + '<path d="M40 40L136 40L136 112L40 112Z" fill="#c81e28"/></svg>';
const etoile = (cx: number, cy: number, R: number, r: number) => {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r : R; p.push((cx + k * Math.cos(a)).toFixed(3) + ' ' + (cy + k * Math.sin(a)).toFixed(3)); }
  return 'M' + p.join('L') + 'Z';
};
/** Une etoile, en Cricut sans recalage, avec une feuille de 6 x 6 po au coin du tapis. */
const ETOILES = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1152 1152" data-ed-contexte="cricut" data-ed-machine="maker" data-ed-tapis="12x12" data-ed-materiau="papier-cartonne" data-ed-procede="decoupe" data-ed-unite="mm" data-ed-recalage="non" data-ed-feuille="2400-2400-57600-57600">'
  + '<path d="' + etoile(100, 100, 60, 24) + '" fill="#1428a0"/></svg>';

interface Boite { x: number; y: number; l: number; h: number }

describe('le tapis fixe et la feuille, en Cricut', () => {
  const navigateur = pilote();

  async function editeur(svg: string): Promise<Page> {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, svg);
    return page;
  }
  const panneau = (page: Page) => page.locator('.panneau-cricut');
  const dit = (page: Page) => page.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim());
  async function choisirCricut(page: Page) {
    await page.locator('.selecteur-contexte .menu-bouton').click();
    await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
    await panneau(page).locator('.constat, .pret').first().waitFor();
  }
  async function exporter(page: Page): Promise<string> {
    const [t]: [Download, void] = await Promise.all([page.waitForEvent('download'), panneau(page).getByRole('button', { name: /^Exporter/ }).click()]);
    return readFileSync(await t.path(), 'utf8');
  }
  /** Les boites des formes sur la toile, en unites du plan (le trace de chaque chemin). */
  const boites = (page: Page): Promise<Boite[]> => page.locator('.editeur-svg-toile path[data-id]').evaluateAll(l => l.map(e => {
    const n = (e.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
    return { x: Math.min(...xs), y: Math.min(...ys), l: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }));
  async function toutChoisir(page: Page) {
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('ControlOrMeta+a');
  }
  async function dupliquer(page: Page, reglages: (p: Page) => Promise<void>) {
    await ouvrirMenu(page, 'Édition');
    await page.getByRole('menuitem', { name: 'Dupliquer sur la feuille…' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Dupliquer sur la feuille' });
    await dialogue.waitFor();
    await reglages(page);
    await dialogue.getByRole('button', { name: 'Dupliquer', exact: true }).click();
    await dialogue.waitFor({ state: 'detached', timeout: 20_000 });
  }

  it('recalage desactive : la forme posee au milieu du tapis garde sa place a l export, avec un cadre de reperage', async () => {
    const page = await editeur(MILIEU);
    await choisirCricut(page);
    const recalage = panneau(page).getByRole('checkbox', { name: 'Recalage automatique' });
    expect(await recalage.isChecked()).toBe(true);
    // Coche (le defaut) : l'export d'avant, sans cadre.
    const avant = await exporter(page);
    expect(avant).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1152 1152" width="304.8mm" height="304.8mm" data-ed-contexte="cricut" data-ed-machine="maker" data-ed-tapis="12x12" data-ed-materiau="papier-cartonne" data-ed-procede="decoupe" data-ed-unite="mm"><path d="M480 528L672 528L672 624L480 624Z" fill="#c81e28"/></svg>');
    await recalage.uncheck();
    await attend(() => dit(page)).toMatch(/^Recalage automatique désactivé/);
    expect(await page.locator('.gabarit').getAttribute('data-recalage')).toBe('non');
    const apres = await exporter(page);
    // Le plan est le tapis tel que la toile le montrait ; un cadre de reperage (la zone utile) sous la forme, qui ne bouge pas.
    expect(apres).toMatch(/viewBox="456 504 1152 1152" width="304.8mm" height="304.8mm"/);
    const chemins = [...apres.matchAll(/<path d="([^"]*)"/g)].map(m => m[1]);
    expect(chemins).toEqual(['M480 528L1584 528L1584 1632L480 1632ZM482 530L482 1630L1582 1630L1582 530Z', 'M480 528L672 528L672 624L480 624Z']);
    expect(apres).not.toContain('data-ed-recalage');
    // Recoche : l'export redevient celui d'un plan ordinaire, sans cadre.
    await recalage.check();
    expect([...(await exporter(page)).matchAll(/<path /g)].length).toBe(1);
  });

  it('un dessin rouvert sans recalage garde au milieu du tapis la forme qu on y a posee', async () => {
    const page = await editeur(MILIEU.replace('viewBox="0 0 1152 1152"', 'viewBox="0 0 1152 1152" data-ed-contexte="cricut" data-ed-machine="maker" data-ed-tapis="12x12" data-ed-materiau="papier-cartonne" data-ed-procede="decoupe" data-ed-unite="mm" data-ed-recalage="non"'));
    await panneau(page).locator('.constat, .pret').first().waitFor();
    expect(await panneau(page).getByRole('checkbox', { name: 'Recalage automatique' }).isChecked()).toBe(false);
    const f = await exporter(page);
    expect(f).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1152 1152" width="304.8mm" height="304.8mm" data-ed-contexte="cricut" data-ed-machine="maker" data-ed-tapis="12x12" data-ed-materiau="papier-cartonne" data-ed-procede="decoupe" data-ed-unite="mm">'
      + '<path d="M24 24L1128 24L1128 1128L24 1128ZM26 26L26 1126L1126 1126L1126 26Z" fill="#c81e28"/><path d="M480 528L672 528L672 624L480 624Z" fill="#c81e28"/></svg>');
    // La carte « Dans Design Space » dit ou verifier la place : 480 et 528 unites du coin du tapis.
    await attend(() => panneau(page).locator('.carte-design-space').textContent()).toContain('le dessin commence à 127 mm du bord gauche et 139,7 mm du bord haut du tapis');
  });

  it('remplit la feuille, et Ctrl+Z retire toutes les copies d un coup', async () => {
    const page = await editeur(MILIEU);
    await choisirCricut(page);
    await toutChoisir(page);
    await dupliquer(page, async p => { await p.getByRole('radio', { name: 'Remplir la feuille' }).check(); });
    const n = await formesVisibles(page);
    expect(n).toBeGreaterThan(30);
    await attend(() => dit(page)).toMatch(/copies posées : la feuille est pleine\. Ctrl\+Z les retire\.$/);
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await attend(() => formesVisibles(page)).toBe(1);
  });

  it('pose une quantite : cinq copies en plus de l original', async () => {
    const page = await editeur(MILIEU);
    await choisirCricut(page);
    await toutChoisir(page);
    await dupliquer(page, async p => { await p.getByLabel('Copies à ajouter').fill('5'); });
    await attend(() => formesVisibles(page)).toBe(6);
    await attend(() => dit(page)).toBe('5 copies posées sur la feuille. Ctrl+Z les retire.');
  });

  it('range toutes les copies dans une feuille partielle decalee, que la toile montre', async () => {
    const page = await editeur(FIXE);
    await panneau(page).locator('.constat, .pret').first().waitFor();
    expect(await page.locator('.gabarit-feuille').count()).toBe(1);
    expect(await panneau(page).getByLabel('Largeur').inputValue()).toBe('101.6');
    await toutChoisir(page);
    await dupliquer(page, async p => { await p.getByRole('radio', { name: 'Remplir la feuille' }).check(); });
    const toutes = await boites(page);
    expect(toutes.length).toBeGreaterThan(4);
    // La feuille : 4 x 3 po a 6 po et 5 po du coin du tapis (le plan), moins la marge de 2 mm.
    for (const b of toutes.slice(1)) {
      expect(b.x).toBeGreaterThanOrEqual(576 + 7.5);
      expect(b.y).toBeGreaterThanOrEqual(480 + 7.5);
      expect(b.x + b.l).toBeLessThanOrEqual(576 + 384 - 7.5);
      expect(b.y + b.h).toBeLessThanOrEqual(480 + 288 - 7.5);
    }
  });

  it('passe axe-core sans violation ni doute : le panneau sans recalage, avec sa feuille, et le panneau de duplication ouvert', async () => {
    const page = await editeur(FIXE);
    await panneau(page).locator('.constat, .pret').first().waitFor();
    const axe = async () => {
      // L'inspecteur et le panneau flottant defilent : la fenetre prend la hauteur de leur contenu, pour que l'audit juge chaque texte entier.
      const hauteur = await page.evaluate(() => Math.max(...['.editeur-inspecteur', '.panneau-flottant'].map(s => { const i = document.querySelector(s); return i ? Math.ceil(i.scrollHeight - i.clientHeight + innerHeight) : innerHeight; })));
      await page.setViewportSize({ width: 1280, height: Math.min(4000, Math.max(800, hauteur + 40)) });
      await attendreAnimations(page);
      if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: AXE });
      const r = await page.evaluate(async () => (await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<ResultatAxe> } }).axe.run(document, { resultTypes: ['violations', 'incomplete'] })));
      expect(r.violations.map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)))).toEqual([]);
      expect(r.incomplete.map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)))).toEqual([]);
    };
    await axe();
    await toutChoisir(page);
    // Le panneau flottant se pose sur la toile, en haut a droite. Quand le bord de la feuille (un rectangle peint du gabarit) passe
    // sous un paragraphe du panneau, axe doute du fond de ce texte (« partially overlaps »), bien que le panneau soit opaque : un doute
    // de mesure, qu'on n'admet pas. Il est apparu quand la barre a tenu sur une ligne a 1 280 px (Fichier et le geste de fin devenus
    // des icones) : la toile plus haute, la vue ajustee grossit, et le bord de la feuille tombait sous un texte. La vue se dezoome d'un
    // cran (-) : le bord de la feuille ne coupe plus les textes du panneau, et l'audit juge le panneau entier.
    await page.keyboard.press('-');
    await ouvrirMenu(page, 'Édition');
    await page.getByRole('menuitem', { name: 'Dupliquer sur la feuille…' }).click();
    await page.getByRole('dialog', { name: 'Dupliquer sur la feuille' }).waitFor();
    await axe();
  });

  it('emboite des etoiles en optimisation avancee : plus qu en simple, toutes sur la feuille', async () => {
    const page = await editeur(ETOILES);
    await panneau(page).locator('.constat, .pret').first().waitFor();
    await toutChoisir(page);
    await dupliquer(page, async p => { await p.getByRole('radio', { name: 'Remplir la feuille' }).check(); });
    const simple = await formesVisibles(page);
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await attend(() => formesVisibles(page)).toBe(1);
    await toutChoisir(page);
    await dupliquer(page, async p => { await p.getByRole('radio', { name: 'Remplir la feuille' }).check(); await p.getByRole('radio', { name: 'Avancée' }).check(); });
    const avancee = await formesVisibles(page);
    expect(avancee).toBeGreaterThan(simple);
    for (const b of (await boites(page)).slice(1)) {
      expect(b.x).toBeGreaterThanOrEqual(24 + 7.5);
      expect(b.y).toBeGreaterThanOrEqual(24 + 7.5);
      expect(b.x + b.l).toBeLessThanOrEqual(24 + 576 - 7.5);
      expect(b.y + b.h).toBeLessThanOrEqual(24 + 576 - 7.5);
    }
  });
});

// Le tapis fixe et la feuille en contexte Cricut (ADR-0039), dans le navigateur : la case « Recalage automatique », decochee par
// defaut depuis la revision du 26 octobre 2026, garde la place des formes a l'export (le plan est le tapis des le depart, cadre de
// reperage, coordonnees inchangees) ; la cocher rend l'export d'avant ; « Dupliquer sur la feuille »
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
/** Le meme, ouvert deja en Cricut (le tapis fixe, le defaut), avec une feuille de 4 x 3 po a 6 po et 5 po du coin du tapis. */
const FIXE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1152 1152" data-ed-contexte="cricut" data-ed-machine="maker" data-ed-tapis="12x12" data-ed-materiau="papier-cartonne" data-ed-procede="decoupe" data-ed-unite="mm" data-ed-feuille="57600-48000-38400-28800">'
  + '<path d="M40 40L136 40L136 112L40 112Z" fill="#c81e28"/></svg>';
const etoile = (cx: number, cy: number, R: number, r: number) => {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r : R; p.push((cx + k * Math.cos(a)).toFixed(3) + ' ' + (cy + k * Math.sin(a)).toFixed(3)); }
  return 'M' + p.join('L') + 'Z';
};
/** Une etoile, en Cricut (le tapis fixe), avec une feuille de 6 x 6 po au coin du tapis. */
const ETOILES = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1152 1152" data-ed-contexte="cricut" data-ed-machine="maker" data-ed-tapis="12x12" data-ed-materiau="papier-cartonne" data-ed-procede="decoupe" data-ed-unite="mm" data-ed-feuille="2400-2400-57600-57600">'
  + '<path d="' + etoile(100, 100, 60, 24) + '" fill="#1428a0"/></svg>';
/** Un dessin marque Cricut, sans recalage ecrit, dont le plan n'est pas le tapis : un rectangle a (100, 50) dans un plan de 5 x 3 po. */
const MARQUE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 288" data-ed-contexte="cricut" data-ed-machine="maker" data-ed-tapis="12x12" data-ed-materiau="papier-cartonne" data-ed-procede="decoupe" data-ed-unite="mm">'
  + '<path d="M100 50L300 50L300 150L100 150Z" fill="#c81e28"/></svg>';
/** L'export d'avant la revision (recalage coche) du rectangle pose au milieu du tapis : le plan tel quel, sans cadre. */
const EXPORT_RECALE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1152 1152" width="304.8mm" height="304.8mm" data-ed-contexte="cricut" data-ed-machine="maker" data-ed-tapis="12x12" data-ed-materiau="papier-cartonne" data-ed-procede="decoupe" data-ed-unite="mm"><path d="M480 528L672 528L672 624L480 624Z" fill="#c81e28"/></svg>';

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

  /** Le plan de travail sur la toile, en unites du plan. */
  const plan = (page: Page): Promise<number[]> => page.locator('.plan-travail').evaluate(e => ['x', 'y', 'width', 'height'].map(a => Number(e.getAttribute(a))));

  it('par defaut, le tapis est fixe : la forme posee au milieu du tapis garde sa place a l export, avec un cadre ; cochee, l export d avant', async () => {
    const page = await editeur(MILIEU);
    await choisirCricut(page);
    const recalage = panneau(page).getByRole('checkbox', { name: 'Recalage automatique' });
    expect(await recalage.isChecked()).toBe(false);
    expect(await page.locator('.gabarit').getAttribute('data-recalage')).toBe('non');
    // Le plan est le tapis des le depart (ici il en avait deja la taille : rien ne bouge).
    expect(await plan(page)).toEqual([0, 0, 1152, 1152]);
    const fixe = await exporter(page);
    expect(fixe).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1152 1152" width="304.8mm" height="304.8mm" data-ed-contexte="cricut" data-ed-machine="maker" data-ed-tapis="12x12" data-ed-materiau="papier-cartonne" data-ed-procede="decoupe" data-ed-unite="mm">'
      + '<path d="M24 24L1128 24L1128 1128L24 1128ZM26 26L26 1126L1126 1126L1126 26Z" fill="#c81e28"/><path d="M480 528L672 528L672 624L480 624Z" fill="#c81e28"/></svg>');
    // La carte dit comment revenir au recalage d'avant.
    await attend(() => panneau(page).locator('.carte-design-space').textContent()).toContain('cochez « Recalage automatique »');
    // Cochee : l'export d'avant la revision, a l'octet, sans cadre.
    await recalage.check();
    await attend(() => dit(page)).toMatch(/^Recalage automatique activé/);
    expect(await page.locator('.gabarit').getAttribute('data-recalage')).toBeNull();
    expect(await exporter(page)).toBe(EXPORT_RECALE);
    // Decochee de nouveau : le plan deja pose garde son coin, le cadre revient.
    await recalage.uncheck();
    await attend(() => dit(page)).toMatch(/^Recalage automatique désactivé/);
    expect(await exporter(page)).toBe(fixe);
  });

  it('ouvre un fichier marque Cricut avec le plan du tapis dans son etat initial : pas une modification, Ctrl+Z n y touche pas', async () => {
    const page = await editeur(MARQUE);
    await panneau(page).locator('.constat, .pret').first().waitFor();
    expect(await panneau(page).getByRole('checkbox', { name: 'Recalage automatique' }).isChecked()).toBe(false);
    // La zone utile a 2 mm du coin du dessin (100, 50), le tapis d'un quart de pouce autour : les formes ne bougent pas.
    expect(await plan(page)).toEqual([68.441, 18.441, 1152, 1152]);
    expect(await boites(page)).toEqual([{ x: 100, y: 50, l: 200, h: 100 }]);
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await attendreAnimations(page);
    expect(await plan(page)).toEqual([68.441, 18.441, 1152, 1152]);
    const f = await exporter(page);
    expect(f).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="68.441 18.441 1152 1152" width="304.8mm" height="304.8mm"/);
    expect([...f.matchAll(/<path d="([^"]*)"/g)].map(m => m[1])).toEqual(['M92.441 42.441L1196.441 42.441L1196.441 1146.441L92.441 1146.441ZM94.441 44.441L94.441 1144.441L1194.441 1144.441L1194.441 44.441Z', 'M100 50L300 50L300 150L100 150Z']);
  });

  it('pose le plan du tapis quand on choisit Cricut, en une entree d historique', async () => {
    const page = await editeur(MARQUE.replace(/ data-ed-[a-z]+="[^"]*"/g, ''));
    expect(await plan(page)).toEqual([0, 0, 480, 288]);
    await choisirCricut(page);
    expect(await plan(page)).toEqual([68.441, 18.441, 1152, 1152]);
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await attend(() => plan(page)).toEqual([0, 0, 480, 288]);
  });

  it('un dessin d avant la revision, marque « non », se rouvre decoche et garde au milieu du tapis la forme qu on y a posee', async () => {
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
    // Le panneau flottant se pose sur la toile, en haut a droite. Quand une forme de la toile (le bord de la feuille, un gabarit) passe
    // en partie sous un texte du panneau, axe doute du fond de ce texte (« partially overlaps »), bien que le panneau soit opaque : un
    // doute de mesure, qu'on n'admet pas. Le cadrage de la vue depend de la mise en page (la barre, le tapis fixe) : plutot qu'un nombre
    // de crans, on mesure la place du panneau, puis la vue se dezoome (-) jusqu'a ce qu'aucune forme de la toile ne passe dessous.
    const ouvrirDuplication = async () => {
      await ouvrirMenu(page, 'Édition');
      await page.getByRole('menuitem', { name: 'Dupliquer sur la feuille…' }).click();
      await page.getByRole('dialog', { name: 'Dupliquer sur la feuille' }).waitFor();
    };
    await ouvrirDuplication();
    const place = await page.locator('.panneau-flottant').boundingBox();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Dupliquer sur la feuille' }).waitFor({ state: 'detached' });
    const sousLePanneau = () => page.evaluate(p => p ? [...document.querySelectorAll('.editeur-svg-toile *:not(g):not(defs):not(.fond-prise)')].filter(e => {
      const b = e.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && b.left < p.x + p.width && b.right > p.x && b.top < p.y + p.height && b.bottom > p.y;
    }).length : 0, place);
    for (let i = 0; i < 12 && (await sousLePanneau()) > 0; i++) {
      await page.locator('.editeur-svg-toile').focus();
      await page.keyboard.press('-');
      await attendreAnimations(page);
    }
    expect(await sousLePanneau()).toBe(0);
    await ouvrirDuplication();
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

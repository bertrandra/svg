// La palette des formes de base (ADR-0033), par la vraie page : ouvrir la palette, choisir le cœur et le tracer (la forme posee,
// nommee, dite) ; regler un polygone a 8 cotes dans le panneau ; tout au clavier (F, fleches, Entree, puis le trace a deux coins) ;
// la derniere forme reprise par le bouton de la barre ; 390 px au doigt ; axe-core en clair et en sombre. Les captures du rapport
// (1280 et 390 px, clair et sombre : la palette, un dessin d'une forme de chaque sorte) quand CAPTURES le demande.

import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Locator, Page } from 'playwright';
import { aLeFocus, attend, attendreAnimations, formesVisibles, ouvrirCode, pilote, RACINE_DEPOT } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const CAPTURES = process.env['CAPTURES'] ?? '';
// Un plan de 400 x 300 et une seule forme dans un coin : la forme tracee est la deuxieme (f2).
const PLAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect x="10" y="10" width="40" height="30" fill="#2e7d32"/></svg>';
// Une forme de chaque sorte, et quelques reglages : la reference d'ecriture des formes de base (ecriture-stable).
const TOUTES = readFileSync(resolve(RACINE_DEPOT, 'tests/fixtures/svg/formes-de-base.attendu.svg'), 'utf8');

describe('la palette des formes de base', () => {
  const navigateur = pilote();
  const cadre = (page: Page) => page.locator('.editeur-cadre');
  const toile = (page: Page) => page.locator('.editeur-svg-toile');
  const formes = (page: Page) => page.getByRole('button', { name: 'Formes (F)' });
  const palette = (page: Page) => page.getByRole('menu', { name: 'Formes' });
  const tuile = (page: Page, nom: string | RegExp) => palette(page).getByRole('menuitemradio', { name: typeof nom === 'string' ? new RegExp('^' + nom + '( ?[A-Z])?$') : nom });
  const dit = (page: Page) => page.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim());
  const outil = (page: Page, id: string) => cadre(page).evaluate((e, c) => e.classList.contains('outil-' + c), id);
  const calque = (page: Page, id: string) => page.locator('.editeur-calques .calque-nom[data-forme="' + id + '"]');

  /** Un point du plan de travail a l'ecran, en unites du plan (400 x 300). */
  async function surPlan(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
    const r = await page.locator('.editeur-svg-toile .plan-travail').boundingBox();
    if (!r) throw new Error('plan de travail introuvable');
    return { x: r.x + (r.width * x) / 400, y: r.y + (r.height * y) / 300 };
  }

  /** Un glisser a la souris sur le plan, d'un coin a l'autre. */
  async function tracer(page: Page, x0: number, y0: number, x1: number, y1: number): Promise<void> {
    const a = await surPlan(page, x0, y0), b = await surPlan(page, x1, y1);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
  }

  async function capture(page: Page, nom: string): Promise<void> {
    if (!CAPTURES) return;
    mkdirSync(CAPTURES, { recursive: true });
    await attendreAnimations(page);
    await page.screenshot({ path: resolve(CAPTURES, nom + '.png') });
  }

  async function auditAxe(page: Page): Promise<string[]> {
    await attendreAnimations(page);
    await page.addScriptTag({ content: AXE });
    return page.evaluate(async () => {
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: unknown[] }> }> }> } };
      return (await w.axe.run(document, { resultTypes: ['violations'] })).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)));
    });
  }

  /** Les hauteurs des tuiles de la palette, a l'ecran. */
  const hauteurs = (l: Locator) => l.evaluateAll(t => t.map(e => e.getBoundingClientRect().height));

  it('ouvre la palette en cinq rubriques, choisit le cœur et le trace : la forme posée, nommée et dite', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, PLAN);
    await formes(page).click();
    await palette(page).waitFor();
    for (const groupe of ['Basiques', 'Polygones', 'Symboles', 'Étiquettes', 'Traits']) expect(await palette(page).getByRole('group', { name: groupe }).count()).toBe(1);
    expect(await palette(page).getByRole('menuitemradio').count()).toBe(26);
    // La forme du bouton (le rectangle, au depart) est cochee ; la lettre des formes d'avant se lit dans la tuile.
    expect(await tuile(page, 'Rectangle').getAttribute('aria-checked')).toBe('true');
    expect(await tuile(page, 'Cœur').getAttribute('aria-checked')).toBe('false');
    expect(Math.min(...await hauteurs(palette(page).getByRole('menuitemradio')))).toBeGreaterThanOrEqual(24);

    await tuile(page, 'Cœur').click();
    await attend(() => palette(page).count()).toBe(0);
    await attend(() => outil(page, 'coeur')).toBe(true);
    await attend(() => dit(page)).toMatch(/^Outil cœur : flèches déplacent le réticule/);
    expect(await page.locator('.message-etat').innerText()).toMatch(/^Cœur : glissez sur la toile/);

    await tracer(page, 150, 100, 270, 210);
    await attend(() => formesVisibles(page)).toBe(2);
    await attend(() => dit(page)).toMatch(/^Forme 2 ajoutée et sélectionnée : cœur, fond \S+ #[0-9a-f]{6}, 1[12]\d(,\d+)? × 1[01]\d(,\d+)? à /);
    expect((await calque(page, 'f2').innerText()).replace(/\s+/g, ' ')).toMatch(/^Cœur 2/);
    expect(await calque(page, 'f2').getAttribute('aria-label')).toMatch(/^Cœur 2, fond /);
    // Une forme posee est un chemin ordinaire : des cubiques fermees, rien de plus dans le DOM.
    expect(await toile(page).locator('path[data-id="f2"]').getAttribute('d')).toMatch(/^M[\d. ]+(C[\d. ]+){6}Z$/);
    expect(await outil(page, 'selection')).toBe(true);
  });

  it('regle un polygone a 8 cotes dans le panneau, puis le trace en octogone', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, PLAN);
    await formes(page).click();
    await tuile(page, 'Polygone').click();
    const section = page.locator('.editeur-inspecteur details.section', { hasText: 'Forme à tracer' });
    await section.waitFor();
    expect(await section.evaluate(e => (e as HTMLDetailsElement).open)).toBe(true);
    const cotes = section.getByLabel('Côtés');
    expect(await cotes.inputValue()).toBe('6');
    expect(await cotes.locator('option').count()).toBe(10);
    await cotes.selectOption('8');
    await tracer(page, 120, 60, 260, 200);
    await attend(() => formesVisibles(page)).toBe(2);
    await attend(() => dit(page)).toMatch(/^Forme 2 ajoutée et sélectionnée : octogone, /);
    expect(await toile(page).locator('path[data-id="f2"]').getAttribute('d')).toMatch(/^M[\d. ]+(L[\d. ]+){7}Z$/);
    expect((await calque(page, 'f2').innerText()).replace(/\s+/g, ' ')).toMatch(/^Octogone 2/);
    // Le reglage reste pour la forme suivante (une donnee de la session), la forme posee ne le garde pas.
    await formes(page).click();
    await tuile(page, 'Polygone').click();
    expect(await page.locator('.editeur-inspecteur').getByLabel('Côtés').inputValue()).toBe('8');
  });

  it('se pilote tout au clavier : F ouvre la palette, les fleches la parcourent, Entree choisit, puis le trace a deux coins', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, PLAN);
    await attend(() => aLeFocus(toile(page))).toBe(true);
    await page.keyboard.press('f');
    await palette(page).waitFor();
    await attend(() => aLeFocus(tuile(page, 'Rectangle'))).toBe(true);
    // Trois colonnes : le rectangle, puis l'ellipse dessous, puis le triangle (la rubrique suivante), puis a droite le losange.
    await page.keyboard.press('ArrowDown');
    await attend(() => aLeFocus(tuile(page, 'Ellipse'))).toBe(true);
    await page.keyboard.press('ArrowDown');
    await attend(() => aLeFocus(tuile(page, 'Triangle'))).toBe(true);
    await page.keyboard.press('ArrowRight');
    await attend(() => aLeFocus(tuile(page, 'Losange'))).toBe(true);
    await page.keyboard.press('ArrowUp');
    await attend(() => aLeFocus(tuile(page, 'Cercle'))).toBe(true);
    await page.keyboard.press('End');
    await attend(() => aLeFocus(tuile(page, 'Vague'))).toBe(true);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await attend(() => outil(page, 'losange')).toBe(true);
    await attend(() => aLeFocus(formes(page))).toBe(true);
    await attend(() => dit(page)).toMatch(/^Outil losange : /);

    // Le trace a deux coins au reticule, sur la toile.
    await toile(page).focus();
    await page.keyboard.press('Space');
    await attend(() => dit(page)).toMatch(/^Premier coin posé/);
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowDown');
    await attend(() => page.locator('.editeur-svg-toile path.trace-en-cours').count()).toBe(1);
    await page.keyboard.press('Space');
    await attend(() => formesVisibles(page)).toBe(2);
    await attend(() => dit(page)).toMatch(/^Forme 2 ajoutée et sélectionnée : losange, /);
    expect(await aLeFocus(toile(page))).toBe(true);

    // F rouvre la palette sur la forme du moment ; Echap la ferme et rend le focus au bouton.
    await page.keyboard.press('f');
    await attend(() => aLeFocus(tuile(page, 'Losange'))).toBe(true);
    await page.keyboard.press('Escape');
    await attend(() => palette(page).count()).toBe(0);
    await attend(() => aLeFocus(formes(page))).toBe(true);
  });

  it('pose au clavier chaque forme a sa taille par defaut, au reticule', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, PLAN);
    let n = 1;
    for (const [nom, genre] of [['Anneau', 'anneau'], ['Flèche', 'flèche'], ['Spirale', 'spirale'], ['Bulle de dialogue', 'bulle de dialogue'], ['Carré', 'carré']] as const) {
      await formes(page).click();
      await tuile(page, nom).click();
      await toile(page).focus();
      await page.keyboard.press('Enter');
      await attend(() => formesVisibles(page)).toBe(++n);
      await attend(() => dit(page)).toMatch(new RegExp('^Forme ' + n + ' ajoutée et sélectionnée : ' + genre + ', '));
    }
    // Une spirale est un trait : sans fond, a la couleur du contour.
    expect(await toile(page).locator('path[data-id="f4"]').getAttribute('fill')).toBe('none');
    expect(await toile(page).locator('path[data-id="f2"]').getAttribute('fill-rule')).toBe('evenodd');
  });

  it('reprend la derniere forme choisie dans le bouton de la barre', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, PLAN);
    await formes(page).click();
    await tuile(page, 'Nuage').click();
    await attend(() => outil(page, 'nuage')).toBe(true);
    await page.keyboard.press('v');
    await attend(() => outil(page, 'selection')).toBe(true);
    const bouton = page.locator('.outil-formes .icone-bouton').first();
    expect(await bouton.getAttribute('aria-label')).toBe('Nuage · Maj : proportions');
    expect(await bouton.getAttribute('aria-pressed')).toBe('false');
    await bouton.click();
    await attend(() => outil(page, 'nuage')).toBe(true);
    expect(await bouton.getAttribute('aria-pressed')).toBe('true');
    // Le raccourci d'une forme d'avant la reprend aussi, et la palette coche la forme du bouton.
    await page.keyboard.press('e');
    await attend(() => bouton.getAttribute('aria-label')).toMatch(/^Ellipse \(E\)/);
    await formes(page).click();
    expect(await tuile(page, 'Ellipse').getAttribute('aria-checked')).toBe('true');
    expect(await tuile(page, 'Nuage').getAttribute('aria-checked')).toBe('false');
  });

  for (const schema of ['light', 'dark'] as const) {
    const theme = schema === 'light' ? 'clair' : 'sombre';
    it('passe axe-core en ' + theme + ' : la palette ouverte, puis le panneau « Forme à tracer »', async () => {
      const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800, schema });
      await ouvrirCode(page, PLAN);
      await formes(page).click();
      await palette(page).waitFor();
      await tuile(page, 'Rectangle').hover();
      expect(await auditAxe(page)).toEqual([]);
      await capture(page, 'palette-1280-' + theme);
      await tuile(page, 'Étoile').click();
      await page.locator('.editeur-inspecteur details.section', { hasText: 'Forme à tracer' }).waitFor();
      expect(await auditAxe(page)).toEqual([]);
      await capture(page, 'panneau-etoile-1280-' + theme);
    });

    it('tient a 390 px au doigt (' + theme + ') : la palette dans l ecran, des cibles de 40 px, axe-core passe', async () => {
      const { page } = await navigateur.ouvrir({ largeur: 390, hauteur: 844, tactile: true, schema });
      await ouvrirCode(page, PLAN, true);
      await formes(page).tap();
      await palette(page).waitFor();
      await attendreAnimations(page);
      const r = await page.locator('.menu-panneau').boundingBox();
      expect(r && r.x >= 0 && r.x + r.width <= 390 && r.y >= 0 && r.y + r.height <= 844).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const tuiles = palette(page).getByRole('menuitemradio');
      expect(Math.min(...await hauteurs(tuiles))).toBeGreaterThanOrEqual(40);
      expect(Math.min(...await tuiles.evaluateAll(t => t.map(e => e.getBoundingClientRect().width)))).toBeGreaterThanOrEqual(40);
      // Deux colonnes : un nom long tient dans sa tuile sans deborder.
      expect(await tuiles.evaluateAll(t => t.every(e => e.scrollWidth <= e.clientWidth + 1))).toBe(true);
      expect(await auditAxe(page)).toEqual([]);
      await capture(page, 'palette-390-' + theme);
      await tuile(page, 'Cœur').tap();
      await attend(() => outil(page, 'coeur')).toBe(true);
    });

    it('montre un dessin d une forme de chaque sorte (' + theme + ', 1280 et 390 px)', async () => {
      for (const [largeur, hauteur, tactile] of [[1280, 800, false], [390, 844, true]] as const) {
        const { page } = await navigateur.ouvrir({ largeur, hauteur, tactile, schema });
        await ouvrirCode(page, TOUTES, tactile);
        await attend(() => formesVisibles(page)).toBe(37);
        const noms = await page.locator('.editeur-calques .calque-nom').evaluateAll(l => l.map(e => e.getAttribute('aria-label') ?? ''));
        for (const genre of ['Cœur', 'Hexagone', 'Octogone', 'Flèche double', 'Anneau', 'Nuage', 'Spirale', 'Vague', 'Badge festonné', 'Bulle de dialogue', 'Étoile à 8 branches']) {
          expect(noms.some(n => n.startsWith(genre + ' ')), genre).toBe(true);
        }
        await capture(page, 'dessin-' + largeur + '-' + theme);
      }
    });
  }
});

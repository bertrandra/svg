// Le modele riche sur la toile (ADR-0012, etape 2, paquets 2-0 et 2-A). Le reglage du menu Edition, garde dans le stockage ; un SVG
// a groupes et a degrade ouvert en riche se dessine par noeud (un <g> par groupe, le degrade par ses definitions) ; un clic prend le
// groupe entier, un double-clic y entre (le reste s'estompe, le groupe montre sa boite), un enfant s'y deplace seul, Echap vide la
// selection puis sort du groupe ; « Terminer » rend un SVG qui garde ses <g>. Et a plat (le defaut), rien de tout cela.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, attendreAnimations, ouvrirCode, ouvrirMenu, pilote, RACINE_DEPOT, terminer, URL_PAGE } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

/** Un groupe « Nuage » de deux formes (la premiere en degrade), et une forme seule dessous. */
const GROUPES = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<defs><linearGradient id="a"><stop offset="0" stop-color="#c81e28"/><stop offset="1" stop-color="#1428a0"/></linearGradient></defs>'
  + '<g data-ed-nom="Nuage"><rect x="40" y="40" width="80" height="60" fill="url(#a)"/><rect x="160" y="40" width="80" height="60" fill="#1f4e8c"/></g>'
  + '<rect x="40" y="180" width="80" height="60" fill="#e0b84a"/>'
  + '</svg>';

describe('le modele riche sur la toile', () => {
  const navigateur = pilote();

  /** Une page dont le stockage porte deja le reglage voulu (pose seulement s'il manque, pour qu'un choix fait dans le test survive). */
  async function page(modele: 'plat' | 'riche' | null): Promise<Page> {
    const s = await navigateur.ouvrir({ naviguer: false });
    if (modele) await s.contexte.addInitScript(m => { try { if (localStorage.getItem('svg.modele') === null) localStorage.setItem('svg.modele', JSON.stringify({ modele: m })); } catch { /* sans stockage */ } }, modele);
    await s.page.goto(URL_PAGE);
    return s.page;
  }

  /** Ouvre un SVG et attend que la vue ait fini de se cadrer. */
  async function ouvrir(p: Page, svg: string): Promise<void> {
    await ouvrirCode(p, svg);
    const ctm = () => p.evaluate(() => { const m = document.querySelector<SVGGElement>('.editeur-svg-toile > g')?.getScreenCTM(); return m ? [m.a, m.e, m.f].join(' ') : ''; });
    let avant = '';
    await attend(async () => { const v = await ctm(); const stable = v !== '' && v === avant; avant = v; await p.waitForTimeout(100); return stable; }).toBe(true);
  }

  /** Le point d'ecran d'un point du plan. */
  const versEcran = (p: Page, x: number, y: number) => p.evaluate(([px, py]) => {
    const m = document.querySelector<SVGGElement>('.editeur-svg-toile > g')?.getScreenCTM();
    if (!m) throw new Error('toile absente');
    return { x: m.a * px + m.c * py + m.e, y: m.b * px + m.d * py + m.f };
  }, [x, y] as const);

  const traces = (p: Page) => p.locator('.editeur-svg-toile .trace-choisi').count();
  const chemin = (p: Page, id: string) => p.locator('.editeur-svg-toile path[data-id="' + id + '"]').getAttribute('d');
  const annonce = (p: Page) => p.locator('.editeur-svg .annonces').textContent();

  async function auditAxe(p: Page): Promise<string[]> {
    await attendreAnimations(p);
    await p.addScriptTag({ content: AXE });
    return p.evaluate(async () => {
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: unknown[] }> }> }> } };
      return (await w.axe.run(document, { resultTypes: ['violations'] })).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)));
    });
  }

  it('a plat, par defaut : le degrade est refuse, les groupes se fondent ; le reglage du menu Edition se garde', async () => {
    const p = await page(null);
    await p.locator('section[aria-label="Ouvrir un SVG ou un PDF"] textarea').fill(GROUPES);
    await p.getByRole('button', { name: 'Ouvrir ce code' }).click();
    await attend(() => p.locator('.message').first().textContent()).toMatch(/un dégradé ou un motif/);
    await ouvrir(p, GROUPES.replace(' fill="url(#a)"', ' fill="#c81e28"'));
    expect(await p.locator('.editeur-svg-toile g[data-groupe]').count()).toBe(0);
    expect(await p.locator('.editeur-svg-toile path[data-id]').count()).toBe(3);
    await ouvrirMenu(p, 'Édition');
    const reglage = p.getByRole('menuitemcheckbox', { name: 'Groupes, dégradés, effets (bêta)' });
    expect(await reglage.getAttribute('aria-checked')).toBe('false');
    await reglage.click();
    await attend(() => p.evaluate(() => localStorage.getItem('svg.modele'))).toBe(JSON.stringify({ modele: 'riche' }));
    await attend(() => annonce(p)).toMatch(/Groupes, dégradés et effets activés \(bêta\)/);
    // Le dessin ouvert reste tel qu'il a ete lu : le reglage vaut pour les prochains fichiers.
    expect(await p.locator('.editeur-svg-toile g[data-groupe]').count()).toBe(0);
  });

  it('en riche : un clic prend le groupe, un double-clic y entre, un enfant s y deplace seul, Echap en sort, les <g> restent', async () => {
    const p = await page('riche');
    await ouvrir(p, GROUPES);
    // Le rendu par noeud : un <g> par groupe avec son nom, le degrade par ses definitions.
    expect(await p.locator('.editeur-svg-toile g[data-groupe][data-ed-nom="Nuage"] path[data-id]').count()).toBe(2);
    expect(await p.locator('.editeur-svg-toile defs linearGradient').count()).toBe(1);
    expect(await p.locator('.editeur-svg-toile path[data-id="f1"]').getAttribute('fill')).toMatch(/^url\(#ed-d-[0-9a-f]{14}\)$/);

    // Un clic sur une forme du groupe prend le groupe entier : les deux traces de selection.
    const centre = await versEcran(p, 80, 70);
    await p.mouse.click(centre.x, centre.y);
    await attend(() => traces(p)).toBe(2);

    // Le double-clic y entre : le reste s'estompe, le groupe montre sa boite, la forme sous le pointeur est choisie.
    await p.mouse.dblclick(centre.x, centre.y);
    await attend(() => p.locator('.editeur-svg-toile .hors-contexte').count()).toBe(1);
    expect(await p.locator('.editeur-svg-toile .contour-groupe').count()).toBe(1);
    await attend(() => traces(p)).toBe(1);
    await attend(() => annonce(p)).toMatch(/Dans le groupe « Nuage », 2 éléments\.|Forme 1/);
    expect(await auditAxe(p)).toEqual([]);

    // La forme seule, hors du groupe, ne se prend plus.
    const dehors = await versEcran(p, 80, 210);
    await p.mouse.click(dehors.x, dehors.y);
    await attend(() => traces(p)).toBe(0);

    // Un enfant se deplace seul : sa voisine du groupe ne bouge pas.
    const avant1 = await chemin(p, 'f1'), avant2 = await chemin(p, 'f2');
    await p.mouse.move(centre.x, centre.y);
    await p.mouse.down();
    for (let k = 1; k <= 5; k++) await p.mouse.move(centre.x + k * 8, centre.y + k * 4);
    await p.mouse.up();
    await attend(() => chemin(p, 'f1')).not.toBe(avant1);
    expect(await chemin(p, 'f2')).toBe(avant2);
    expect(await traces(p)).toBe(1);

    // Echap vide la selection, puis sort du groupe (qui reste choisi) ; plus rien n'est estompe.
    await p.keyboard.press('Escape');
    await attend(() => traces(p)).toBe(0);
    await p.keyboard.press('Escape');
    await attend(() => p.locator('.editeur-svg-toile .hors-contexte').count()).toBe(0);
    await attend(() => traces(p)).toBe(2);
    await attend(() => annonce(p)).toBe('Retour à la racine.');
    expect(await auditAxe(p)).toEqual([]);

    // « Terminer » rend le dessin : le brouillon garde ses groupes, son degrade et le marqueur du modele.
    await terminer(p);
    const svg = await p.evaluate(() => (JSON.parse(localStorage.getItem('svg.brouillon') ?? '{}') as { svg?: string }).svg ?? '');
    expect(svg).toContain('data-ed-modele="2"');
    expect(svg).toMatch(/<g data-ed-nom="Nuage"><path [^>]*fill="url\(#ed-d-[0-9a-f]{14}\)"\/><path [^>]*\/><\/g>/);
    expect(svg).toContain('<linearGradient');
  });

  it('un brouillon ecrit en riche ne se reprend pas a plat : la page le dit, et propose le modele riche', async () => {
    const p = await page('riche');
    await ouvrir(p, GROUPES);
    const centre = await versEcran(p, 80, 70);
    await p.mouse.click(centre.x, centre.y);
    await p.keyboard.press('ArrowRight');
    await terminer(p);
    // Le reglage repasse a plat ; le brouillon reste.
    await p.evaluate(() => { localStorage.setItem('svg.modele', JSON.stringify({ modele: 'plat' })); });
    await p.reload();
    const reprise = p.locator('section.reprise');
    await reprise.waitFor();
    expect(await reprise.textContent()).toMatch(/Ce brouillon emploie des groupes, des dégradés ou des effets/);
    await reprise.getByRole('button', { name: 'Activer le modèle riche et reprendre' }).click();
    await p.locator('.editeur-cadre').waitFor();
    await attend(() => p.locator('.editeur-svg-toile g[data-groupe]').count()).toBe(1);
    expect(await p.evaluate(() => localStorage.getItem('svg.modele'))).toBe(JSON.stringify({ modele: 'riche' }));
  });
});

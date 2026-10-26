// L'interface des degrades (ADR-0012, etape 4) et le brouillon des effets (etape 7-B), dans la page construite. Sans souris : poser
// un degrade lineaire sur une forme, ajouter un arret, le deplacer par le panneau puis par sa poignee sur la toile, le retirer par la
// poignee puis par le panneau, enregistrer et retrouver le <linearGradient>. A plat (le defaut), aucun choix de degrade. Pendant un
// glisser sur un dessin a plus de vingt noeuds a effet, `data-brouillon` retire les filtres ; il part au relacher. Et axe-core sur
// l'editeur de degrade, lineaire et radial, en clair, en sombre et au doigt.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { aLeFocus, attend, attendreAnimations, ouvrirCode, pilote, RACINE_DEPOT, terminer, URL_PAGE } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const UN_RECTANGLE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><rect x="20" y="20" width="160" height="80" fill="#c81e28"/></svg>';
const UN_RADIAL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><radialGradient id="s" gradientUnits="userSpaceOnUse" cx="60" cy="60" r="50">'
  + '<stop offset="0" stop-color="#fff1a8"/><stop offset="1" stop-color="#6a2c91"/></radialGradient><circle cx="60" cy="60" r="50" fill="url(#s)"/></svg>';
/** Vingt-cinq ronds floutes : au-dela des vingt noeuds a effet qu'un geste rend en direct. */
const FLOUS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><defs><filter id="f"><feGaussianBlur stdDeviation="3"/></filter></defs>'
  + Array.from({ length: 25 }, (_, i) => `<circle cx="${50 + (i % 5) * 100}" cy="${50 + Math.floor(i / 5) * 100}" r="30" fill="#1f5fb0" filter="url(#f)"/>`).join('') + '</svg>';

describe('les degrades dans l editeur', () => {
  const navigateur = pilote();

  /** Une page dont le stockage porte deja le reglage du modele voulu. */
  async function page(modele: 'plat' | 'riche', options: Parameters<typeof navigateur.ouvrir>[0] = {}): Promise<Page> {
    const s = await navigateur.ouvrir({ ...options, naviguer: false });
    await s.contexte.addInitScript(m => { try { localStorage.setItem('svg.modele', JSON.stringify({ modele: m })); } catch { /* sans stockage */ } }, modele);
    await s.page.goto(URL_PAGE);
    return s.page;
  }

  const toile = (p: Page) => p.locator('.editeur-svg-toile');
  const dit = (p: Page) => p.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim());
  const remplissage = (p: Page) => p.locator('fieldset.choix-genre-peinture').filter({ hasText: 'Remplissage' });
  const liste = (p: Page) => p.getByRole('listbox', { name: 'Arrêts du remplissage' });
  const options = (p: Page) => liste(p).getByRole('option').evaluateAll(l => l.map(o => (o.textContent ?? '').trim()));
  const poignee = (p: Page, i: number) => p.locator(`.editeur-svg-toile [data-poignee-degrade][data-arret="${i}"]`);

  /** Ouvre un SVG et choisit sa premiere forme au clavier (la toile a le focus a l'ouverture). */
  async function ouvrirEtChoisir(p: Page, svg: string, tactile = false): Promise<void> {
    await ouvrirCode(p, svg, tactile);
    await attend(() => aLeFocus(toile(p))).toBe(true);
    await p.keyboard.press('PageDown');
    await attend(() => dit(p)).toMatch(/^Forme 1 sélectionnée/);
  }

  async function auditAxe(p: Page): Promise<string[]> {
    await attendreAnimations(p);
    await p.addScriptTag({ content: AXE });
    return p.evaluate(async () => {
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: unknown[] }> }>; incomplete: Array<{ id: string; nodes: unknown[] }> }> } };
      const r = await w.axe.run(document, { resultTypes: ['violations', 'incomplete'] });
      return [
        ...r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target))),
        ...r.incomplete.map(v => 'à relire : ' + v.id + ' ×' + v.nodes.length)
      ];
    });
  }

  it('a plat : l inspecteur garde le selecteur de couleur d avant, sans choix de degrade', async () => {
    const p = await page('plat');
    await ouvrirEtChoisir(p, UN_RECTANGLE);
    await p.getByRole('textbox', { name: 'Remplissage (code)' }).waitFor();
    expect(await p.locator('fieldset.choix-genre-peinture').count()).toBe(0);
    expect(await p.locator('.peinture-titre', { hasText: 'Remplissage' }).count()).toBe(1);
  });

  it('sans souris : poser un lineaire, ajouter, deplacer et retirer un arret (panneau et poignees), enregistrer', async () => {
    const p = await page('riche');
    await ouvrirEtChoisir(p, UN_RECTANGLE);

    // Poser un degrade lineaire : le bouton radio, au clavier.
    const lineaire = remplissage(p).getByRole('radio', { name: 'Dégradé linéaire' });
    await lineaire.focus();
    await p.keyboard.press('Space');
    await attend(() => lineaire.isChecked()).toBe(true);
    await attend(() => dit(p)).toBe('Remplissage : dégradé linéaire.');
    await attend(() => toile(p).locator('defs linearGradient').count()).toBe(1);
    expect(await toile(p).locator('path[data-id="f1"]').getAttribute('fill')).toMatch(/^url\(#ed-d-[0-9a-f]{14}\)$/);
    expect(await options(p)).toEqual(['Arrêt 1 sur 2, rouge #c81e28, à 0 %', 'Arrêt 2 sur 2, blanc #ffffff, à 100 %']);

    // Ajouter un arret (a mi-chemin du suivant), au clavier.
    const ajouter = p.getByRole('button', { name: 'Ajouter un arrêt' });
    await ajouter.focus();
    await p.keyboard.press('Enter');
    await attend(() => dit(p)).toBe('Arrêt ajouté : 2 sur 3.');
    await attend(() => options(p)).toHaveLength(3);
    expect((await options(p))[1]).toMatch(/^Arrêt 2 sur 3, .* à 50 %$/);

    // Le deplacer par le panneau : le curseur de position, cinq crans.
    const position = p.getByRole('slider', { name: /^Position/ });
    await position.focus();
    for (let k = 0; k < 5; k++) await p.keyboard.press('ArrowRight');
    await attend(() => options(p).then(o => o[1])).toMatch(/à 55 %$/);

    // La liste se parcourt aux fleches sans deplacer la forme derriere elle.
    const avant = await toile(p).locator('path[data-id="f1"]').getAttribute('d');
    await liste(p).focus();
    await p.keyboard.press('ArrowDown');
    await attend(() => liste(p).getByRole('option', { selected: true }).textContent()).toMatch(/^Arrêt 3 sur 3/);
    await p.keyboard.press('ArrowUp');
    expect(await toile(p).locator('path[data-id="f1"]').getAttribute('d')).toBe(avant);
    expect(await auditAxe(p)).toEqual([]);

    // La poignee de la toile : Tab depuis la toile entre dans les poignees (debut, arret 1, arret 2…).
    await toile(p).focus();
    await p.keyboard.press('Tab');
    await attend(() => aLeFocus(p.locator('.editeur-svg-toile [data-poignee-degrade][data-extremite="debut"]'))).toBe(true);
    await p.keyboard.press('Tab');
    await p.keyboard.press('Tab');
    await attend(() => aLeFocus(poignee(p, 1))).toBe(true);
    expect(await poignee(p, 1).getAttribute('role')).toBe('slider');
    expect(await poignee(p, 1).getAttribute('aria-valuenow')).toBe('55');
    await p.keyboard.press('ArrowRight');
    await attend(() => dit(p)).toBe('Arrêt 2 : 56 %.');
    await p.keyboard.press('Shift+ArrowRight');
    await attend(() => poignee(p, 1).getAttribute('aria-valuenow')).toBe('66');
    await attend(() => dit(p)).toBe('Arrêt 2 : 66 %.');
    expect(await poignee(p, 1).getAttribute('aria-valuetext')).toMatch(/^Arrêt 2 sur 3, .*, à 66 %$/);
    expect(await auditAxe(p)).toEqual([]);

    // Suppr retire l'arret ; le focus passe a la poignee precedente.
    await p.keyboard.press('Delete');
    await attend(() => dit(p)).toBe('Arrêt retiré : 2 arrêts restent.');
    await attend(() => options(p)).toHaveLength(2);
    await attend(() => aLeFocus(poignee(p, 0))).toBe(true);
    // La forme est toujours la : Suppr sur une poignee ne retire pas la forme.
    expect(await toile(p).locator('path[data-id="f1"]').count()).toBe(1);

    // Echap rend la toile ; le panneau ajoute puis retire un arret.
    await p.keyboard.press('Escape');
    await attend(() => aLeFocus(toile(p))).toBe(true);
    await ajouter.focus();
    await p.keyboard.press('Enter');
    await attend(() => options(p)).toHaveLength(3);
    const retirer = p.getByRole('button', { name: 'Retirer l’arrêt' });
    await retirer.focus();
    await p.keyboard.press('Enter');
    await attend(() => options(p)).toHaveLength(2);
    expect(await retirer.isDisabled()).toBe(true);

    // Enregistrer : le brouillon garde le degrade, ecrit par empreinte, et le marqueur du modele.
    await terminer(p);
    const svg = await p.evaluate(() => (JSON.parse(localStorage.getItem('svg.brouillon') ?? '{}') as { svg?: string }).svg ?? '');
    expect(svg).toContain('data-ed-modele="2"');
    expect(svg).toMatch(/<linearGradient id="ed-d-[0-9a-f]{14}" gradientUnits="userSpaceOnUse" x1="20" y1="60" x2="180" y2="60"><stop offset="0" stop-color="#c81e28"\/><stop offset="1" stop-color="#ffffff"\/><\/linearGradient>/);
    expect(svg).toMatch(/fill="url\(#ed-d-[0-9a-f]{14}\)"/);
  });

  it('a la souris : une poignee d arret glisse le long de l axe, une extremite suit le pointeur', async () => {
    const p = await page('riche');
    await ouvrirEtChoisir(p, UN_RECTANGLE);
    await remplissage(p).getByRole('radio', { name: 'Dégradé linéaire' }).check();
    await poignee(p, 1).waitFor();
    const b = await poignee(p, 1).locator('.rond-arret').boundingBox();
    if (!b) throw new Error('poignee invisible');
    const fin = await p.locator('.editeur-svg-toile [data-poignee-degrade][data-extremite="fin"] .losange-extremite').boundingBox();
    const debut = await p.locator('.editeur-svg-toile [data-poignee-degrade][data-extremite="debut"] .losange-extremite').boundingBox();
    if (!fin || !debut) throw new Error('extremites invisibles');
    // L'arret 2 (a 100 %) ramene a mi-chemin de l'axe.
    const milieu = (debut.x + fin.x) / 2 + fin.width / 2;
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await p.mouse.down();
    for (let k = 1; k <= 5; k++) await p.mouse.move(b.x + b.width / 2 + (milieu - b.x - b.width / 2) * k / 5, b.y + b.height / 2 + 30);
    await p.mouse.up();
    await attend(() => poignee(p, 1).getAttribute('aria-valuenow').then(Number)).toBeGreaterThan(40);
    expect(Number(await poignee(p, 1).getAttribute('aria-valuenow'))).toBeLessThan(60);
    // Un geste fondu : Ctrl+Z rend l'arret a 100 % d'un coup.
    await toile(p).focus();
    await p.keyboard.press('Control+z');
    await attend(() => poignee(p, 1).getAttribute('aria-valuenow')).toBe('100');
    // La fin de l'axe suit le pointeur : le degrade de la toile change d'extremite.
    const y2 = () => toile(p).locator('defs linearGradient').getAttribute('y2');
    expect(await y2()).toBe('60');
    await p.mouse.move(fin.x + fin.width / 2, fin.y + fin.height / 2);
    await p.mouse.down();
    for (let k = 1; k <= 4; k++) await p.mouse.move(fin.x + fin.width / 2, fin.y + fin.height / 2 - 10 * k);
    await p.mouse.up();
    await attend(() => y2().then(Number)).toBeLessThan(60);
  });

  it('en contraste force, l axe et les poignees prennent les couleurs du systeme', async () => {
    const p = await page('riche');
    await p.emulateMedia({ forcedColors: 'active' });
    await ouvrirEtChoisir(p, UN_RADIAL);
    await poignee(p, 0).waitFor();
    const systeme = (mot: string) => p.evaluate(m => { const s = document.createElement('span'); s.style.color = m; document.body.appendChild(s); const v = getComputedStyle(s).color; s.remove(); return v; }, mot);
    const trait = (sel: string) => p.locator(sel).first().evaluate(e => getComputedStyle(e).stroke);
    const highlight = await systeme('Highlight');
    expect(await trait('.editeur-svg-toile .axe-degrade')).toBe(highlight);
    expect(await trait('.editeur-svg-toile .rond-arret')).toBe(highlight);
    expect(await trait('.editeur-svg-toile .losange-extremite')).toBe(highlight);
  });

  it('pendant un glisser sur plus de vingt noeuds a effet, data-brouillon retire les filtres ; il part au relacher', async () => {
    const p = await page('riche');
    await ouvrirCode(p, FLOUS);
    const noeuds = p.locator('.editeur-svg-toile .noeuds-toile');
    await noeuds.waitFor();
    expect(await noeuds.getAttribute('data-brouillon')).toBeNull();
    const rond = p.locator('.editeur-svg-toile path[data-id="f1"]');
    expect(await rond.evaluate(e => getComputedStyle(e).filter)).toMatch(/^url\(/);
    const b = await rond.boundingBox();
    if (!b) throw new Error('rond invisible');
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await p.mouse.down();
    await p.mouse.move(b.x + b.width / 2 + 10, b.y + b.height / 2 + 5);
    await p.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2 + 10);
    await attend(() => noeuds.getAttribute('data-brouillon')).toBe('');
    expect(await rond.evaluate(e => getComputedStyle(e).filter)).toBe('none');
    await attend(() => p.locator('.editeur-etat').textContent()).toMatch(/Effets affichés au repos/);
    await p.mouse.up();
    await attend(() => noeuds.getAttribute('data-brouillon')).toBeNull();
    expect(await rond.evaluate(e => getComputedStyle(e).filter)).toMatch(/^url\(/);
  });

  for (const [nom, options] of [['clair', { schema: 'light' }], ['sombre', { schema: 'dark' }], ['au doigt', { tactile: true, largeur: 1280, hauteur: 1000 }]] as const) {
    it('axe : l editeur de degrade lineaire et radial, ' + nom, async () => {
      const p = await page('riche', options);
      await ouvrirEtChoisir(p, UN_RADIAL, 'tactile' in options);
      await liste(p).waitFor();
      expect(await remplissage(p).getByRole('radio', { name: 'Dégradé radial' }).isChecked()).toBe(true);
      expect(await p.locator('.editeur-svg-toile [data-poignee-degrade]').count()).toBe(4);
      expect(await auditAxe(p)).toEqual([]);
      await remplissage(p).getByRole('radio', { name: 'Dégradé linéaire' }).check();
      await attend(() => p.getByRole('slider', { name: /^Angle/ }).count()).toBe(1);
      expect(await auditAxe(p)).toEqual([]);
    });
  }
});

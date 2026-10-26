// L'interface des decoupes, des masques, des effets et des images (ADR-0012, etape 8), dans la page construite. A plat (le defaut), rien
// de nouveau : ni commande, ni section Effets, ni « Insérer une image… », et une image deposee sur la toile n'y fait rien. En modele
// riche : creer une decoupe au clavier (le menu Edition), la voir dans les calques (pastille et nom de la ligne), la liberer ; creer et
// inverser un masque, le retrouver a l'enregistrement ; poser un flou et une ombre depuis l'inspecteur, sans souris, et les retrouver a
// l'enregistrement ; inserer une image par le menu Fichier (un PNG fabrique en memoire) et par un depot sur la toile. Et axe-core sur
// un groupe decoupe a effets (section Effets, pastilles, menu ouvert), en clair, en sombre et au doigt.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { aLeFocus, attend, attendreAnimations, encoderPng, ouvrirCode, ouvrirMenu, pilote, RACINE_DEPOT, terminer, URL_PAGE } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

/** Un rectangle rouge, un rectangle bleu, un rond blanc par-dessus. */
const TROIS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">'
  + '<rect x="20" y="20" width="80" height="60" fill="#c81e28"/><rect x="60" y="40" width="80" height="60" fill="#1f4e8c"/>'
  + '<circle cx="90" cy="60" r="35" fill="#ffffff"/></svg>';
const UN_RECTANGLE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><rect x="20" y="20" width="160" height="80" fill="#c81e28"/></svg>';
/** Un groupe « Cartes » decoupe par un rond, floute, a demi transparent. */
const DECOUPE_EFFETS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">'
  + '<defs><clipPath id="c"><circle cx="100" cy="60" r="50"/></clipPath>'
  + '<filter id="f" filterUnits="userSpaceOnUse" x="0" y="0" width="200" height="120"><feGaussianBlur stdDeviation="2"/></filter></defs>'
  + '<g data-ed-nom="Cartes" clip-path="url(#c)" filter="url(#f)" opacity="0.5"><rect x="20" y="20" width="80" height="60" fill="#c81e28"/>'
  + '<rect x="90" y="40" width="80" height="60" fill="#1f4e8c"/></g></svg>';

describe('decoupes, masques, effets et images dans l editeur', () => {
  const navigateur = pilote();

  async function page(modele: 'plat' | 'riche', options: Parameters<typeof navigateur.ouvrir>[0] = {}): Promise<Page> {
    const s = await navigateur.ouvrir({ ...options, naviguer: false });
    await s.contexte.addInitScript(m => { try { localStorage.setItem('svg.modele', JSON.stringify({ modele: m })); } catch { /* sans stockage */ } }, modele);
    await s.page.goto(URL_PAGE);
    return s.page;
  }

  const toile = (p: Page) => p.locator('.editeur-svg-toile');
  const dit = (p: Page) => p.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim());
  const brouillon = (p: Page) => p.evaluate(() => (JSON.parse(localStorage.getItem('svg.brouillon') ?? '{}') as { svg?: string }).svg ?? '');
  const effets = (p: Page) => p.locator('.editeur-svg details.section', { has: p.locator('summary', { hasText: /^Effets/ }) });

  /** Ouvre un SVG, la toile a le focus. */
  async function ouvrir(p: Page, svg: string, tactile = false): Promise<void> {
    await ouvrirCode(p, svg, tactile);
    await attend(() => aLeFocus(toile(p))).toBe(true);
  }

  /** Choisit un element du menu Edition au clavier : le bouton du menu, Entree, puis l'element, Entree. */
  async function commandeAuClavier(p: Page, nom: string): Promise<void> {
    const bouton = p.locator('.editeur-svg .menu-bouton', { hasText: 'Édition' });
    await bouton.focus();
    await p.keyboard.press('Enter');
    const element = p.getByRole('menuitem', { name: nom, exact: true });
    await element.waitFor();
    await element.focus();
    await p.keyboard.press('Enter');
    await attend(() => element.count()).toBe(0);
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

  /** Un PNG de 40 x 30 pixels, un rond rouge sur blanc. */
  const png = () => encoderPng(40, 30, (x, y) => ((x - 20) ** 2 + (y - 15) ** 2 < 100 ? [0xc8, 0x1e, 0x28] : null));

  /** Depose un fichier sur la toile de l'editeur (un `drop` synthetique qui le porte). */
  const deposerSurLaToile = (p: Page, octets: Buffer, nom: string, type: string) => p.evaluate(({ b64, n, t }) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([u], n, { type: t }));
    const zone = document.querySelector('.editeur-toile');
    if (!zone) throw new Error('pas de toile');
    zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { b64: octets.toString('base64'), n: nom, t: type });

  it('a plat : ni commande de decoupe ou de masque, ni section Effets, ni insertion d image ; un depot d image ne fait rien', async () => {
    const p = await page('plat');
    await ouvrir(p, TROIS);
    await p.keyboard.press('PageDown');
    await attend(() => dit(p)).toMatch(/^Forme 1 sélectionnée/);
    await p.getByRole('textbox', { name: 'Remplissage (code)' }).waitFor();
    expect(await effets(p).count()).toBe(0);
    await ouvrirMenu(p, 'Édition');
    await p.getByRole('menuitem', { name: /^Combiner/ }).waitFor();
    expect(await p.getByRole('menuitem', { name: /découpe|masque/i }).count()).toBe(0);
    await p.keyboard.press('Escape');
    await ouvrirMenu(p, 'Fichier');
    await p.getByRole('menuitem', { name: /^À propos/ }).waitFor();
    expect(await p.getByRole('menuitem', { name: 'Insérer une image…' }).count()).toBe(0);
    await p.keyboard.press('Escape');
    await deposerSurLaToile(p, png(), 'rond.png', 'image/png');
    await p.waitForTimeout(300);
    expect(await toile(p).locator('image').count()).toBe(0);
    expect(await toile(p).locator('path[data-id]').count()).toBe(3);
  });

  it('au clavier : creer une decoupe, la voir dans les calques, la liberer', async () => {
    const p = await page('riche');
    await ouvrir(p, TROIS);
    await p.keyboard.press('PageDown');
    await p.keyboard.press('Shift+PageDown');
    await p.keyboard.press('Shift+PageDown');
    await attend(() => dit(p)).toBe('Forme 3 ajoutée : 3 formes sélectionnées.');
    await commandeAuClavier(p, 'Créer une découpe');
    await attend(() => dit(p)).toBe('Découpe créée : la forme du dessus découpe 2 formes.');
    await attend(() => toile(p).locator('defs clipPath').count()).toBe(1);
    expect(await toile(p).locator('g[data-groupe]').getAttribute('clip-path')).toMatch(/^url\(#ed-c-[0-9a-f]{14}\)$/);
    // La ligne du groupe dans les calques : la pastille « découpe » (icone et mot), et le nom accessible qui le dit.
    const ligne = p.locator('.calque-ligne[aria-level="1"]').filter({ has: p.locator('.calque-pastilles') });
    await attend(() => ligne.locator('.calque-pastilles').textContent()).toBe('découpe');
    expect(await ligne.getAttribute('aria-label')).toMatch(/^Groupe 1, 2 éléments, découpé$/);
    expect(await auditAxe(p)).toEqual([]);

    // Liberer : la forme revient, choisie, au premier plan du groupe, qui devient le contexte (le fil d'Ariane le montre).
    await commandeAuClavier(p, 'Libérer la découpe');
    await attend(() => dit(p)).toBe('Découpe libérée : la forme revient au premier plan du groupe, sans fond, d’un trait noir.');
    await attend(() => toile(p).locator('defs clipPath').count()).toBe(0);
    await attend(() => p.getByRole('navigation', { name: 'Contexte d’édition' }).textContent()).toBe('Racine›Groupe 1');
    expect(await toile(p).locator('path[data-id="f3"]').getAttribute('stroke')).toBe('#000000');
    expect(await toile(p).locator('path[data-id="f3"]').getAttribute('fill')).toBe('none');
  });

  it('au clavier : creer et inverser un masque, le retrouver a l enregistrement', async () => {
    const p = await page('riche');
    await ouvrir(p, TROIS);
    await p.keyboard.press('Control+a');
    await attend(() => dit(p)).toBe('3 formes sélectionnées.');
    await commandeAuClavier(p, 'Créer un masque');
    await attend(() => dit(p)).toBe('Masque créé : l’élément du dessus masque 2 formes ; le clair laisse voir, le sombre cache.');
    await attend(() => toile(p).locator('defs mask').count()).toBe(1);
    expect(await toile(p).locator('g[data-groupe]').getAttribute('mask')).toMatch(/^url\(#ed-m-[0-9a-f]{14}\)$/);
    await attend(() => p.locator('.calque-ligne .calque-pastilles').textContent()).toBe('masque');
    await commandeAuClavier(p, 'Inverser le masque');
    await attend(() => dit(p)).toBe('Masque inversé : ce qui était caché se voit, ce qui se voyait est caché.');
    await attend(() => toile(p).locator('defs mask path').first().getAttribute('fill')).toBe('#ffffff');
    await terminer(p);
    const svg = await brouillon(p);
    expect(svg).toMatch(/<mask id="ed-m-[0-9a-f]{14}" maskUnits="userSpaceOnUse"[^>]*><path d="[^"]+" fill="#ffffff"\/><path d="[^"]+" fill="#000000"\/><\/mask>/);
    expect(svg).toMatch(/<g mask="url\(#ed-m-[0-9a-f]{14}\)">/);
  });

  it('sans souris : poser un flou et une ombre depuis l inspecteur, les retrouver a l enregistrement', async () => {
    const p = await page('riche');
    await ouvrir(p, UN_RECTANGLE);
    await p.keyboard.press('PageDown');
    await attend(() => dit(p)).toMatch(/^Forme 1 sélectionnée/);
    // La section se deplie au clavier ; la case « Flou » se coche a l'espace.
    const resume = effets(p).locator('> summary');
    await resume.focus();
    await p.keyboard.press('Enter');
    await attend(() => effets(p).evaluate(e => (e as HTMLDetailsElement).open)).toBe(true);
    const flou = p.getByRole('checkbox', { name: 'Flou' });
    await flou.focus();
    await p.keyboard.press('Space');
    await attend(() => dit(p)).toBe('Flou : écart 2.');
    await attend(() => toile(p).locator('path[data-id="f1"]').getAttribute('filter')).toMatch(/^url\(#ed-f-/);
    // L'ecart au champ chiffre : 3 ; au-dela du quart du plan, ramene et dit.
    const ecart = p.getByRole('textbox', { name: 'Écart du flou' });
    await ecart.fill('3');
    await ecart.press('Enter');
    await attend(() => dit(p)).toBe('Flou : écart 3.');
    await ecart.fill('500');
    await ecart.press('Enter');
    await attend(() => dit(p)).toBe('Flou : écart 50. Écart au plus 50.');
    await ecart.fill('3');
    await ecart.press('Enter');
    // L'ombre : la case, puis le decalage horizontal et l'opacite au curseur.
    const ombre = p.getByRole('checkbox', { name: 'Ombre portée' });
    await ombre.focus();
    await p.keyboard.press('Space');
    await attend(() => dit(p)).toBe('Ombre portée posée : elle ne tourne pas avec la forme.');
    const dx = p.getByRole('textbox', { name: 'Décalage X' });
    await dx.fill('5');
    await dx.press('Enter');
    await attend(() => dit(p)).toBe('Décalage horizontal de l’ombre : 5.');
    const opacite = p.getByRole('group', { name: 'Réglages de l’ombre portée' }).getByRole('slider', { name: /^Opacité/ });
    await opacite.focus();
    for (let k = 0; k < 10; k++) await p.keyboard.press('ArrowLeft');
    await attend(() => opacite.getAttribute('aria-valuetext')).toBe('40 %');
    expect(await auditAxe(p)).toEqual([]);
    await terminer(p);
    const svg = await brouillon(p);
    expect(svg).toContain('<feGaussianBlur in="SourceGraphic" stdDeviation="3" result="e"/>');
    expect(svg).toContain('<feOffset in="a" dx="5" dy="4" result="b"/>');
    expect(svg).toContain('flood-opacity="0.4"');
    expect(svg).toMatch(/<path d="[^"]+" fill="#c81e28" filter="url\(#ed-f-[0-9a-f]{14}\)"\/>/);
  });

  it('inserer une image par le menu Fichier, puis par un depot sur la toile, et la retrouver a l enregistrement', async () => {
    const p = await page('riche');
    await ouvrir(p, UN_RECTANGLE);
    await ouvrirMenu(p, 'Fichier');
    const [choix] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('menuitem', { name: 'Insérer une image…' }).click()]);
    await choix.setFiles({ name: 'rond.png', mimeType: 'image/png', buffer: png() });
    await attend(() => dit(p)).toBe('Image insérée : 40 × 30 pixels, au centre de la vue. Déplacez-la, tournez-la ou redimensionnez-la.');
    await attend(() => toile(p).locator('image').count()).toBe(1);
    expect(await toile(p).locator('image').getAttribute('width')).toBe('40');
    // Un fichier qui n'est pas une image est refuse en le nommant.
    await ouvrirMenu(p, 'Fichier');
    const [autre] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('menuitem', { name: 'Insérer une image…' }).click()]);
    await autre.setFiles({ name: 'faux.png', mimeType: 'image/png', buffer: Buffer.from('ceci n’est pas une image') });
    await attend(() => dit(p)).toBe('Cette image n’est pas insérée : une image dont le contenu n’est ni un PNG, ni un JPEG, ni un GIF, ni un WebP.');
    // Le depot sur la toile insere de meme.
    await deposerSurLaToile(p, png(), 'rond.png', 'image/png');
    await attend(() => toile(p).locator('image').count()).toBe(2);
    await terminer(p);
    const svg = await brouillon(p);
    expect(svg.match(/<image xlink:href="data:image\/png;base64,/g)).toHaveLength(2);
    expect(svg).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
  });

  for (const [nom, options] of [['clair', { schema: 'light' }], ['sombre', { schema: 'dark' }], ['au doigt', { tactile: true, largeur: 1280, hauteur: 1000 }]] as const) {
    it('axe : un groupe decoupe a effets, sa section Effets, ses pastilles, le menu Edition ouvert, ' + nom, async () => {
      const p = await page('riche', options);
      await ouvrir(p, DECOUPE_EFFETS, 'tactile' in options);
      await p.keyboard.press('PageDown');
      await attend(() => dit(p)).toMatch(/^Groupe « Cartes » sélectionné/);
      await attend(() => effets(p).evaluate(e => (e as HTMLDetailsElement).open)).toBe(true);
      expect(await p.getByRole('checkbox', { name: 'Flou' }).isChecked()).toBe(true);
      expect(await p.locator('.calque-ligne .calque-pastilles').getAttribute('title')).toBe('découpe, flou, opacité 50 %');
      expect(await auditAxe(p)).toEqual([]);
      await ouvrirMenu(p, 'Édition');
      await p.getByRole('menuitem', { name: 'Libérer la découpe' }).waitFor();
      expect(await p.getByRole('menuitem', { name: 'Libérer la découpe' }).isDisabled()).toBe(false);
      expect(await p.getByRole('menuitem', { name: 'Inverser le masque' }).isDisabled()).toBe(true);
      expect(await auditAxe(p)).toEqual([]);
    });
  }
});

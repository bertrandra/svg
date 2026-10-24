// Les outils de trace dans le navigateur : contour en forme, decalage, angles arrondis, types de nœuds
// (poignees liees en glissant, Alt pour rompre), casser, joindre, inverser, et leur accessibilite (phrases dites,
// menu Edition au clavier, cibles de 40 px au doigt).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { aLeFocus, attend, formesVisibles, modifications, ouvrirCode, ouvrirMenu, pilote, RACINE_DEPOT } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
interface ResultatAxe { violations: { id: string; nodes: { target: unknown[] }[] }[]; incomplete: { id: string; nodes: { target: unknown[] }[] }[] }


const svg = (corps: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${corps}</svg>`;
const LIGNE = svg('<path d="M30 100H170" stroke="#1428a0" stroke-width="20" stroke-linecap="round" fill="none"/>');
const CARRE = svg('<path d="M50 50H150V150H50Z" fill="#c81e28"/>');
const ARC = svg('<path d="M20 100C20 40 80 40 100 100C120 160 180 160 180 100" stroke="#1428a0" stroke-width="3" fill="none"/>');
const POLYLIGNE = svg('<path d="M20 100L60 100L100 60L140 100L180 100" stroke="#1428a0" stroke-width="3" fill="none"/>');

describe('outils de trace', () => {
  const navigateur = pilote();

  async function editeur(contenu: string, options: Parameters<typeof navigateur.ouvrir>[0] = {}) {
    const { page } = await navigateur.ouvrir(options);
    await ouvrirCode(page, contenu, options.tactile);
    await page.locator('.editeur-svg-toile').focus();
    await attend(() => aLeFocus(page.locator('.editeur-svg-toile'))).toBe(true);
    return page;
  }

  const dit = (page: Page) => page.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim());
  const forme = (page: Page, id: string) => page.locator(`.editeur-svg-toile path[data-id="${id}"]`);
  const trace = async (page: Page, id: string) => (await forme(page, id).getAttribute('d')) ?? '';
  const nombres = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const inspecteur = (page: Page) => page.locator('.editeur-inspecteur');

  /** Choisit toutes les formes (le dessin n'en a qu'une ou deux) et ouvre la section « Transformer » de l'inspecteur. */
  async function choisirEtOuvrir(page: Page) {
    await page.keyboard.press('Control+a');
    await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
    const resume = inspecteur(page).locator('details.section > summary', { hasText: 'Transformer' });
    if (!(await resume.evaluate(e => (e.parentElement as HTMLDetailsElement).open))) await resume.click();
  }
  const bouton = (page: Page, nom: string) => inspecteur(page).getByRole('button', { name: nom, exact: true });
  const champ = (page: Page, cle: 'decalage' | 'rayon') => inspecteur(page).locator(`input[data-champ-trace="${cle}"]`);

  /** Entre dans l'edition des points de l'unique forme (Entree) et choisit le point d'indice `i` a la souris. */
  async function pointActif(page: Page, i: number) {
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Enter');
    await attend(() => page.locator('.editeur-svg-toile rect[data-ancre]').count()).toBeGreaterThan(2);
    await page.locator(`.editeur-svg-toile rect[data-ancre="${i}"]`).click();
    await attend(() => inspecteur(page).locator('summary', { hasText: 'Point' }).count()).toBeGreaterThan(0);
  }

  async function centre(page: Page, selecteur: string) {
    const b = await page.locator(selecteur).boundingBox();
    if (!b) throw new Error('pas de boite pour ' + selecteur);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  describe('contour en forme', () => {
    it('remplace le contour par une forme pleine de la couleur du trait, dit la phrase, et s\'annule', async () => {
      const page = await editeur(LIGNE);
      await choisirEtOuvrir(page);
      const avant = await modifications(page);
      await bouton(page, 'Contour en forme').click();
      await attend(() => forme(page, 'f1').getAttribute('fill')).toBe('#1428a0');
      expect(['none', null]).toContain(await forme(page, 'f1').getAttribute('stroke'));
      // Une capsule : 140 de long + 20 de bouts ronds, 20 de large.
      const boite = await forme(page, 'f1').evaluate(e => { const b = (e as unknown as SVGGraphicsElement).getBBox(); return [b.x, b.y, b.width, b.height].map(v => Math.round(v)); });
      expect(boite).toEqual([20, 90, 160, 20]);
      await attend(() => dit(page)).toBe('Contour transformé en forme.');
      expect(await modifications(page)).toBe(avant + 1);
      await page.keyboard.press('Control+z');
      await attend(() => forme(page, 'f1').getAttribute('stroke')).toBe('#1428a0');
    });

    it('est dans le menu Édition, au clavier, et grisé sans contour', async () => {
      const page = await editeur(CARRE);
      await page.keyboard.press('Control+a');
      await ouvrirMenu(page, 'Édition');
      expect(await page.getByRole('menuitem', { name: /Contour en forme/ }).isDisabled()).toBe(false);
      await page.keyboard.press('Escape');
      await choisirEtOuvrir(page);
      expect(await bouton(page, 'Contour en forme').isDisabled()).toBe(true);
    });
  });

  describe('décaler le contour', () => {
    it('agrandit le carré vers l\'extérieur et le rétrécit vers l\'intérieur, par le champ et par Entrée', async () => {
      const page = await editeur(CARRE);
      await choisirEtOuvrir(page);
      await champ(page, 'decalage').fill('10');
      await champ(page, 'decalage').press('Enter');
      await attend(() => dit(page)).toBe('Contour décalé de 10 vers l’extérieur.');
      expect(nombres(await trace(page, 'f1')).length).toBeGreaterThan(8);
      let boite = await forme(page, 'f1').evaluate(e => { const b = (e as unknown as SVGGraphicsElement).getBBox(); return [b.x, b.y, b.width, b.height].map(v => Math.round(v)); });
      expect(boite).toEqual([40, 40, 120, 120]);
      await champ(page, 'decalage').fill('-25');
      await bouton(page, 'Décaler').click();
      await attend(() => dit(page)).toBe('Contour décalé de 25 vers l’intérieur.');
      boite = await forme(page, 'f1').evaluate(e => { const b = (e as unknown as SVGGraphicsElement).getBBox(); return [b.x, b.y, b.width, b.height].map(v => Math.round(v)); });
      expect(boite).toEqual([65, 65, 70, 70]);
    });

    it('dit qu\'une forme a disparu quand le décalage la dépasse, et Ctrl+Z la rend', async () => {
      const page = await editeur(CARRE);
      await choisirEtOuvrir(page);
      await champ(page, 'decalage').fill('-80');
      await bouton(page, 'Décaler').click();
      await attend(() => dit(page)).toContain('a disparu');
      await attend(() => formesVisibles(page)).toBe(0);
      await page.keyboard.press('Control+z');
      await attend(() => formesVisibles(page)).toBe(1);
    });

    it('le menu Édition mène au champ du panneau, focus compris', async () => {
      const page = await editeur(CARRE);
      await page.keyboard.press('Control+a');
      await ouvrirMenu(page, 'Édition');
      await page.getByRole('menuitem', { name: /Décaler le contour/ }).click();
      await attend(() => aLeFocus(champ(page, 'decalage'))).toBe(true);
      await page.keyboard.type('4');
      await page.keyboard.press('Enter');
      await attend(() => dit(page)).toMatch(/Contour décalé de/);
    });
  });

  describe('arrondir les angles', () => {
    it('arrondit les quatre coins du carré, et dit quand le rayon a dû baisser', async () => {
      const page = await editeur(CARRE);
      await choisirEtOuvrir(page);
      await champ(page, 'rayon').fill('10');
      await bouton(page, 'Arrondir les angles').click();
      await attend(() => dit(page)).toBe('4 angles arrondis au rayon 10.');
      expect((await trace(page, 'f1')).match(/C/g)?.length).toBe(4);
      await page.keyboard.press('Control+z');
      await champ(page, 'rayon').fill('80');
      await bouton(page, 'Arrondir les angles').click();
      await attend(() => dit(page)).toMatch(/ramenés à un rayon plus petit, 50 au minimum/);
    });

    it('ne fait rien d\'un angle lisse et le dit', async () => {
      const page = await editeur(svg('<circle cx="100" cy="100" r="50" fill="#c81e28"/>'));
      await choisirEtOuvrir(page);
      await bouton(page, 'Arrondir les angles').click();
      await attend(() => dit(page)).toMatch(/Aucun angle à arrondir/);
    });
  });

  describe('types de nœuds et poignées liées', () => {
    it('lit le type du point (symétrique) et le change en lisse puis en angle', async () => {
      const page = await editeur(ARC);
      await pointActif(page, 1);
      await attend(() => inspecteur(page).getByText(/Type : symétrique/).count()).toBe(1);
      expect(await bouton(page, 'Symétrique').getAttribute('aria-pressed')).toBe('true');
      await bouton(page, 'Angle').click();
      await attend(() => dit(page)).toBe('Point converti en angle : poignées rentrées, à tirer une à une.');
      await attend(() => inspecteur(page).getByText(/Type : angle/).count()).toBe(1);
      const d = nombres(await trace(page, 'f1'));
      // Les deux poignées du point sont sur l'ancre (100, 100).
      expect(d.slice(4, 6)).toEqual([100, 100]);
      expect(d.slice(8, 10)).toEqual([100, 100]);
      await page.locator('.editeur-svg-toile').focus();
      await page.keyboard.press('Control+z');
      await attend(() => trace(page, 'f1').then(t => nombres(t).slice(4, 6))).toEqual([80, 40]);
    });

    it('tirer une poignée d\'un point symétrique entraîne l\'autre, à longueur égale et en face', async () => {
      const page = await editeur(ARC);
      await pointActif(page, 1);
      const h = await centre(page, 'circle[data-poignee="1:1"]');
      await page.mouse.move(h.x, h.y);
      await page.mouse.down();
      await page.mouse.move(h.x + 40, h.y - 10, { steps: 6 });
      await page.mouse.up();
      const d = nombres(await trace(page, 'f1'));
      // M20 100 C c1 c2 (100,100) C c1' c2' (180,100) : c2 en 4..5, l'ancre en 6..7, c1' en 8..9.
      const [ex = 0, ey = 0] = [d[4], d[5]], [sx = 0, sy = 0] = [d[8], d[9]];
      expect(Math.hypot(sx - 100, sy - 100)).toBeCloseTo(Math.hypot(ex - 100, ey - 100), 0);
      // Alignées et opposées : leur somme, ramenée à l'ancre, est nulle.
      expect(ex + sx - 200).toBeCloseTo(0, 0);
      expect(ey + sy - 200).toBeCloseTo(0, 0);
      expect(ex).not.toBe(80);
    });

    it('Alt rompt le lien : seule la poignée tirée bouge', async () => {
      const page = await editeur(ARC);
      await pointActif(page, 1);
      const h = await centre(page, 'circle[data-poignee="1:1"]');
      await page.keyboard.down('Alt');
      await page.mouse.move(h.x, h.y);
      await page.mouse.down();
      await page.mouse.move(h.x + 40, h.y - 10, { steps: 6 });
      await page.mouse.up();
      await page.keyboard.up('Alt');
      const d = nombres(await trace(page, 'f1'));
      expect([d[8], d[9]]).toEqual([120, 160]);
      expect([d[4], d[5]]).not.toEqual([80, 40]);
      // Le point est maintenant un angle : tirer sans Alt ne lie plus rien.
      await attend(() => inspecteur(page).getByText(/Type : angle/).count()).toBe(1);
    });

    it('un point d\'angle garde le glisser simple', async () => {
      const page = await editeur(svg('<path d="M20 100C20 40 80 40 100 100C140 120 180 160 180 100" stroke="#000" stroke-width="3" fill="none"/>'));
      await pointActif(page, 1);
      await attend(() => inspecteur(page).getByText(/Type : angle/).count()).toBe(1);
      const h = await centre(page, 'circle[data-poignee="1:1"]');
      await page.mouse.move(h.x, h.y);
      await page.mouse.down();
      await page.mouse.move(h.x - 20, h.y + 10, { steps: 4 });
      await page.mouse.up();
      const d = nombres(await trace(page, 'f1'));
      expect([d[8], d[9]]).toEqual([140, 120]);
    });
  });

  describe('casser, joindre, inverser', () => {
    it('casse un tracé ouvert en deux au point choisi, joint les deux par le menu, et inverse le sens', async () => {
      const page = await editeur(POLYLIGNE);
      await pointActif(page, 2);
      await bouton(page, 'Casser le tracé ici').click();
      await attend(() => dit(page)).toBe('Tracé cassé en deux au point choisi.');
      await attend(() => formesVisibles(page)).toBe(2);
      await page.keyboard.press('Control+a');
      await ouvrirMenu(page, 'Édition');
      await page.getByRole('menuitem', { name: /Joindre ou fermer/ }).click();
      await attend(() => dit(page)).toBe('Deux tracés joints en un seul.');
      await attend(() => formesVisibles(page)).toBe(1);
      const avant = await trace(page, 'f2');
      await ouvrirMenu(page, 'Édition');
      await page.getByRole('menuitem', { name: /Inverser le sens/ }).click();
      await attend(() => dit(page)).toBe('Sens du tracé inversé.');
      await attend(() => trace(page, 'f2')).not.toBe(avant);
      expect(nombres(await trace(page, 'f2')).slice(0, 2)).toEqual([180, 100]);
    });

    it('ferme un tracé ouvert, et refuse de casser un bout en le disant', async () => {
      const page = await editeur(POLYLIGNE);
      await page.keyboard.press('Control+a');
      await ouvrirMenu(page, 'Édition');
      await page.getByRole('menuitem', { name: /Joindre ou fermer/ }).click();
      await attend(() => dit(page)).toBe('Tracé fermé.');
      expect((await trace(page, 'f1')).endsWith('Z')).toBe(true);
      await pointActif(page, 0);
      await bouton(page, 'Casser le tracé ici').click();
      await attend(() => dit(page)).toBe('Tracé ouvert au point choisi : ses deux bouts s’y superposent.');
    });

    it('retire un point en gardant la courbe, ou refuse un angle en le disant', async () => {
      const page = await editeur(svg('<path d="M20 100L100 100L180 100L180 20L20 20Z" fill="#c81e28"/>'));
      await pointActif(page, 1);
      await bouton(page, 'Supprimer en gardant la courbe').click();
      await attend(() => dit(page)).toBe('Point retiré, courbe conservée.');
      expect(nombres(await trace(page, 'f1')).length).toBe(8);
      await page.locator('.editeur-svg-toile rect[data-ancre="2"]').click();
      await bouton(page, 'Supprimer en gardant la courbe').click();
      await attend(() => dit(page)).toMatch(/porte la courbe/);
    });
  });

  describe('accessibilité', () => {
    it('axe ne trouve rien (ni violation, ni doute) sur l\'inspecteur ouvert aux outils de trace et au panneau d\'un point', async () => {
      const page = await editeur(ARC);
      await pointActif(page, 1);
      const resume = inspecteur(page).locator('details.section > summary', { hasText: 'Transformer' });
      if (!(await resume.evaluate(e => (e.parentElement as HTMLDetailsElement).open))) await resume.click();
      await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))).then(() => undefined));
      await page.addScriptTag({ content: AXE });
      const r = await page.evaluate(async () => (await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<ResultatAxe> } }).axe.run(document, { resultTypes: ['violations', 'incomplete'] })));
      expect(r.violations.map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)))).toEqual([]);
      expect(r.incomplete.map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)))).toEqual([]);
    });
  });

  describe('au doigt, sur un téléphone de 420 px', () => {
    it('donne 40 px au moins à chaque commande des outils de trace', async () => {
      const page = await editeur(ARC, { largeur: 420, hauteur: 860, tactile: true });
      await page.keyboard.press('Control+a');
      await page.locator('.editeur-etat button[aria-label="Inspecteur"]').tap();
      await attend(() => inspecteur(page).evaluate(e => getComputedStyle(e).visibility)).toBe('visible');
      const resume = inspecteur(page).locator('details.section > summary', { hasText: 'Transformer' });
      if (!(await resume.evaluate(e => (e.parentElement as HTMLDetailsElement).open))) await resume.tap();
      const cibles = await inspecteur(page).locator('.outils-trace button:visible, .outils-trace select:visible, .outils-trace input:visible').evaluateAll(
        l => l.map(e => { const r = e.getBoundingClientRect(); return { nom: (e.getAttribute('aria-label') ?? (e as HTMLElement).innerText ?? e.className).slice(0, 30), l: Math.round(r.width), h: Math.round(r.height) }; })
      );
      expect(cibles.length).toBeGreaterThanOrEqual(7);
      expect(cibles.filter(c => c.h < 40)).toEqual([]);
    });
  });
});

// « Conserver les proportions » (section Position et taille) : coupe par defaut, le coin etire librement et Maj garde les
// proportions, comme avant ; pose, le coin les garde et Maj libere le temps du geste, la hauteur suit la largeur tapee (et
// l'inverse), Alt et fleches les gardent. Plusieurs formes, un groupe du modele riche et le contexte Cricut se comportent de meme ;
// une ligne droite n'a pas de proportion, et rien ne leve. Le basculement est dit dans la region vocale ; au doigt, 40 px.
//
// Le dessin : f1 rectangle 100 × 50, f2 carre 60 × 60, f3 ligne horizontale de 260 (hauteur nulle).

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, modifications, ouvrirCode, pilote } from './aide.js';

const DESSIN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">'
  + '<path d="M40 40h100v50H40z" fill="#c81e28"/><path d="M200 40h60v60h-60z" fill="#1428a0"/><path d="M40 160H300" stroke="#000000" stroke-width="2" fill="none"/></svg>';

describe('conserver les proportions', () => {
  const navigateur = pilote();

  async function editeur(options: Parameters<typeof navigateur.ouvrir>[0] = {}): Promise<Page> {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 860, ...options });
    await ouvrirCode(page, DESSIN, options.tactile);
    await vueStable(page);
    return page;
  }

  /** La vue a fini de se cadrer : la matrice de la toile ne bouge plus d'une lecture a l'autre. */
  async function vueStable(page: Page): Promise<void> {
    const ctm = () => page.evaluate(() => { const m = document.querySelector<SVGGElement>('.editeur-svg-toile > g')?.getScreenCTM(); return m ? [m.a, m.e, m.f].join(' ') : ''; });
    let avant = '';
    await attend(async () => { const v = await ctm(); const stable = v !== '' && v === avant; avant = v; await page.waitForTimeout(80); return stable; }).toBe(true);
  }

  const forme = (page: Page, id: string) => page.locator(`.editeur-svg-toile path[data-id="${id}"]`);
  const verrou = (page: Page) => page.getByRole('button', { name: 'Conserver les proportions' });
  const dit = (page: Page) => page.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim());
  const champ = (page: Page, libelle: string) => page.locator('.editeur-inspecteur .grille-2 label', { hasText: new RegExp('^' + libelle + '$') }).locator('input');
  const valeur = async (page: Page, libelle: string) => Number((await champ(page, libelle).inputValue()).replace(',', '.'));
  const rapportChamps = async (page: Page) => (await valeur(page, 'L')) / (await valeur(page, 'H'));

  async function poserVerrou(page: Page): Promise<void> {
    await verrou(page).click();
    await attend(() => verrou(page).getAttribute('aria-pressed')).toBe('true');
    await attend(() => dit(page)).toBe('Proportions conservées.');
  }

  /** Taper une valeur dans un champ de l'inspecteur et la valider (Entree). */
  async function taper(page: Page, libelle: string, v: string): Promise<void> {
    await champ(page, libelle).fill(v);
    await champ(page, libelle).press('Enter');
  }

  /** La boite a l'ecran des formes nommees, reunies : de quoi mesurer une selection ou un groupe sans l'inspecteur. */
  async function boite(page: Page, ids: readonly string[]): Promise<{ l: number; h: number }> {
    const bs = await Promise.all(ids.map(async id => { const b = await forme(page, id).boundingBox(); if (!b) throw new Error(id + ' sans boite'); return b; }));
    const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y));
    return { l: Math.max(...bs.map(b => b.x + b.width)) - x0, h: Math.max(...bs.map(b => b.y + b.height)) - y0 };
  }

  /** Cliquer une ligne droite : sa boite n'a pas de hauteur, Playwright la croirait invisible ; on vise son milieu a l'ecran. */
  async function cliquerLigne(page: Page, id: string): Promise<void> {
    const b = await forme(page, id).evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(b.x, b.y);
  }

  /** Tirer le coin bas droit de la selection de (dx, dy) pixels d'ecran ; Maj tenue pendant tout le geste si demande. */
  async function tirerCoin(page: Page, dx: number, dy: number, maj = false): Promise<void> {
    const coin = await page.locator('.editeur-svg-toile [data-coin="se"]').boundingBox();
    if (!coin) throw new Error('pas de coin bas droit');
    const x = coin.x + coin.width / 2, y = coin.y + coin.height / 2;
    if (maj) await page.keyboard.down('Shift');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    await page.mouse.up();
    if (maj) await page.keyboard.up('Shift');
  }

  it('coupe par defaut : le coin etire librement, et Maj garde les proportions, comme avant', async () => {
    const page = await editeur();
    await forme(page, 'f1').click();
    expect(await verrou(page).getAttribute('aria-pressed')).toBe('false');
    expect(await verrou(page).getAttribute('title')).toMatch(/^Conserver les proportions : /);

    await tirerCoin(page, 150, 0);
    await attend(() => rapportChamps(page)).toBeGreaterThan(2.5);
    expect(await valeur(page, 'H')).toBeCloseTo(50, 0);

    const avant = await rapportChamps(page);
    await tirerCoin(page, 40, 60, true);
    await attend(async () => Math.abs((await rapportChamps(page)) - avant)).toBeLessThan(0.02);
    expect(await valeur(page, 'H')).toBeGreaterThan(55);
  });

  it('pose : le coin garde les proportions, et Maj redimensionne librement le temps du geste', async () => {
    const page = await editeur();
    await forme(page, 'f1').click();
    await poserVerrou(page);
    // Le basculement n'a pas change le dessin.
    expect(await modifications(page)).toBe(0);

    await tirerCoin(page, 90, 10);
    await attend(async () => (await valeur(page, 'L')) > 120).toBe(true);
    expect(await rapportChamps(page)).toBeCloseTo(2, 2);

    await tirerCoin(page, 0, 70, true);
    await attend(async () => Math.abs((await rapportChamps(page)) - 2)).toBeGreaterThan(0.3);
    // Maj relachee, le verrou est toujours pose : il n'etait inverse que le temps du geste.
    expect(await verrou(page).getAttribute('aria-pressed')).toBe('true');
    const libre = await rapportChamps(page);
    await tirerCoin(page, 50, 0);
    await attend(async () => (await valeur(page, 'L')) > 0).toBe(true);
    await attend(async () => Math.abs((await rapportChamps(page)) - libre)).toBeLessThan(0.02);

    // Coupe, il le dit, et le coin etire de nouveau librement.
    await verrou(page).click();
    await attend(() => dit(page)).toBe('Proportions libres.');
    expect(await verrou(page).getAttribute('aria-pressed')).toBe('false');
  });

  it('aux champs : la hauteur suit la largeur et l inverse, en une seule modification, la taille entiere dite', async () => {
    const page = await editeur();
    await forme(page, 'f1').click();
    await poserVerrou(page);

    await taper(page, 'L', '150');
    await attend(() => champ(page, 'H').inputValue()).toBe('75');
    expect(await modifications(page)).toBe(1);
    await attend(() => dit(page)).toBe('150 × 75.');

    await taper(page, 'H', '30');
    await attend(() => champ(page, 'L').inputValue()).toBe('60');
    expect(await modifications(page)).toBe(2);

    // Une suite de frappes ne derive pas : la proportion reste celle du moment ou le verrou a ete pose.
    for (const l of ['33.3', '71.1', '12.7', '100']) await taper(page, 'L', l);
    await attend(() => champ(page, 'H').inputValue()).toBe('50');

    // Verrou coupe : seul le champ tape change, comme avant.
    await verrou(page).click();
    await taper(page, 'L', '120');
    await attend(() => champ(page, 'L').inputValue()).toBe('120');
    expect(await champ(page, 'H').inputValue()).toBe('50');
  });

  it('au clavier : Alt et fleches gardent les proportions quand le verrou est pose, et seulement alors', async () => {
    const page = await editeur();
    await forme(page, 'f1').click();
    await page.keyboard.press('Alt+ArrowRight');
    await attend(() => dit(page)).toBe('100,4 × 50.');

    await poserVerrou(page);
    await forme(page, 'f1').click();
    await page.keyboard.press('Alt+ArrowRight');
    // La reference est la boite du moment du verrou (100,4 × 50) : la largeur avance d'un pas, la hauteur suit.
    await attend(() => dit(page)).toBe('100,8 × 50,2.');
    await page.keyboard.press('Alt+Shift+ArrowDown');
    await attend(async () => (await valeur(page, 'H')) > 54).toBe(true);
    expect(await rapportChamps(page)).toBeCloseTo(100.4 / 50, 2);
  });

  it('plusieurs formes, puis un groupe du modele riche : la boite commune garde ses proportions', async () => {
    const page = await editeur({ modele: 'riche' });
    await forme(page, 'f1').click();
    await poserVerrou(page);
    await forme(page, 'f1').click();
    await forme(page, 'f2').click({ modifiers: ['Shift'] });
    const avant = await boite(page, ['f1', 'f2']);
    await tirerCoin(page, 60, 0);
    await attend(async () => (await boite(page, ['f1', 'f2'])).l > avant.l + 30).toBe(true);
    const apres = await boite(page, ['f1', 'f2']);
    expect(apres.l / apres.h).toBeCloseTo(avant.l / avant.h, 1);

    // Groupees (Ctrl+G), elles restent une boite qui garde sa proportion : le verrou est de la session, pas de la selection.
    await page.keyboard.press('Control+g');
    await attend(() => dit(page)).toMatch(/^Groupe créé/);
    await tirerCoin(page, -50, -20);
    await attend(async () => (await boite(page, ['f1', 'f2'])).l < apres.l - 20).toBe(true);
    const groupe = await boite(page, ['f1', 'f2']);
    expect(groupe.l / groupe.h).toBeCloseTo(avant.l / avant.h, 1);
  });

  it('en contexte Cricut, meme comportement', async () => {
    const page = await editeur();
    await page.locator('.selecteur-contexte .menu-bouton').click();
    await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
    await page.locator('.panneau-cricut .constat, .panneau-cricut .pret').first().waitFor();
    await vueStable(page);
    await forme(page, 'f1').click();
    const r = await rapportChamps(page);
    await poserVerrou(page);
    await taper(page, 'L', String((await valeur(page, 'L')) * 2));
    await attend(async () => Math.abs((await rapportChamps(page)) - r)).toBeLessThan(0.01);
    await forme(page, 'f1').click();
    const largeur = await valeur(page, 'L');
    await page.keyboard.press('Alt+Shift+ArrowRight');
    await attend(async () => (await valeur(page, 'L')) > largeur).toBe(true);
    expect(await rapportChamps(page)).toBeCloseTo(r, 1);
    await tirerCoin(page, 30, -10);
    await attend(async () => Math.abs((await rapportChamps(page)) - r)).toBeLessThan(0.02);
  });

  it('une ligne droite n a pas de proportion : le verrou ne s y applique pas, et rien ne leve', async () => {
    const page = await editeur();
    await cliquerLigne(page, 'f3');
    await attend(() => champ(page, 'H').inputValue()).toBe('0');
    await poserVerrou(page);
    await taper(page, 'L', '130');
    await attend(() => champ(page, 'L').inputValue()).toBe('130');
    expect(await champ(page, 'H').inputValue()).toBe('0');
    // Au coin, la ligne s'allonge librement : elle reste plate, sans rien lever.
    await tirerCoin(page, 60, 0);
    await attend(async () => (await valeur(page, 'L')) > 140).toBe(true);
    expect(await champ(page, 'H').inputValue()).toBe('0');
  });

  it('au doigt : le bouton fait 40 px et se bascule d un toucher', async () => {
    const page = await editeur({ largeur: 390, hauteur: 800, tactile: true });
    await forme(page, 'f1').tap();
    await page.locator('.editeur-etat').getByRole('button', { name: 'Inspecteur', exact: true }).tap();
    await attend(() => page.locator('.editeur-inspecteur').evaluate(e => getComputedStyle(e).transform)).toBe('none');
    const b = await verrou(page).boundingBox();
    if (!b) throw new Error('le verrou n’est pas visible');
    expect(Math.round(b.width)).toBeGreaterThanOrEqual(40);
    expect(Math.round(b.height)).toBeGreaterThanOrEqual(40);
    await verrou(page).tap();
    await attend(() => verrou(page).getAttribute('aria-pressed')).toBe('true');
  });
});

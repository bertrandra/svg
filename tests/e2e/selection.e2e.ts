// Les outils de selection (ADR-0035), par la vraie page. Mesure d'abord, sur le code d'avant : le cadre prenait par la boite
// englobante (le trou d'un anneau, le coin vide d'une diagonale, le dessus d'une courbe qui frole prenaient la forme), il ne
// commencait que sur le vide (commencer pres d'une forme la tirait), et aucun outil ne le nommait. Desormais : le cadre « touche »
// suit le trace reel, la regle « dedans » se choisit au menu de l'outil (trait plein), l'outil Cadre commence meme sur une forme,
// le lasso, Maj ajoute et Alt retire, l'apercu pendant le geste, la region vocale au relachement, les commandes du menu Edition et
// leurs raccourcis, le cadre et le lasso au clavier, au doigt (390 px), axe-core en clair et en sombre.

import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, attendreAnimations, modifications, ouvrirCode, ouvrirMenu, pilote, RACINE_DEPOT, texteDe } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
/** Les captures du rapport (1280 et 390 px, clair et sombre), quand CAPTURES le demande. */
const CAPTURES = process.env['CAPTURES'] ?? '';

/** Un anneau plein (trou de 80 a 160), une diagonale, un rectangle plein, une courbe fine. */
const DESSIN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<path d="M60 60H180V180H60Z M80 80V160H160V80Z" fill="#1428a0" fill-rule="evenodd"/>'
  + '<path d="M220 40L380 200" fill="none" stroke="#000000" stroke-width="2"/>'
  + '<rect x="220" y="220" width="80" height="60" fill="#c81e28"/>'
  + '<path d="M20 200C60 190 100 190 140 200" fill="none" stroke="#000000" stroke-width="1"/>'
  + '</svg>';

/** Un grand fond qui couvre le plan, et deux petites formes posees dessus. */
const FOND = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<rect x="0" y="0" width="400" height="300" fill="#dddddd"/>'
  + '<rect x="100" y="100" width="40" height="40" fill="#c81e28"/>'
  + '<rect x="260" y="160" width="40" height="40" fill="#1428a0"/>'
  + '</svg>';

/** Des couleurs et des types : fond rouge et contour noir, fond rouge, trait noir, fond vert et contour bleu. */
const COULEURS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<rect x="20" y="20" width="60" height="60" fill="#c81e28" stroke="#000000" stroke-width="4"/>'
  + '<rect x="120" y="20" width="60" height="60" fill="#c81e28"/>'
  + '<path d="M20 150L380 150" fill="none" stroke="#000000" stroke-width="4"/>'
  + '<rect x="220" y="20" width="60" height="60" fill="#2a7f3f" stroke="#1428a0" stroke-width="4"/>'
  + '</svg>';

/** Deux petits carres, l'un en haut a gauche du centre du plan, l'autre en bas a droite : de quoi viser au reticule. */
const CLAVIER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<rect x="90" y="90" width="40" height="40" fill="#c81e28"/>'
  + '<rect x="290" y="190" width="40" height="40" fill="#1428a0"/>'
  + '</svg>';

describe('les outils de selection', () => {
  const navigateur = pilote();

  /** Le point d'ecran d'un point du plan. */
  const versEcran = (page: Page, x: number, y: number) => page.evaluate(([px, py]) => {
    const m = document.querySelector<SVGGElement>('.editeur-svg-toile > g')?.getScreenCTM();
    if (!m) throw new Error('toile absente');
    return { x: m.a * px + m.c * py + m.e, y: m.b * px + m.d * py + m.f };
  }, [x, y] as const);

  /**
   * Attend que la toile ne bouge plus a l'ecran : la rangee de la selection, qui vient avec la premiere forme choisie et part avec
   * la derniere, deplace la toile ; un geste vise apres, jamais pendant.
   */
  async function vueStable(page: Page): Promise<void> {
    const ctm = () => page.evaluate(() => { const m = document.querySelector<SVGGElement>('.editeur-svg-toile > g')?.getScreenCTM(); return m ? [m.a, m.e, m.f].join(' ') : ''; });
    let avant = '';
    await attend(async () => { const v = await ctm(); const stable = v !== '' && v === avant; avant = v; await page.waitForTimeout(80); return stable; }).toBe(true);
  }

  /** Ouvre un dessin et attend que la vue ait fini de se cadrer. */
  async function ouvrir(page: Page, svg: string, tactile = false): Promise<void> {
    await ouvrirCode(page, svg, tactile);
    await vueStable(page);
  }

  async function editeur(svg = DESSIN, options: Parameters<typeof navigateur.ouvrir>[0] = {}): Promise<Page> {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800, ...options });
    await ouvrir(page, svg, options.tactile);
    return page;
  }

  /** Les formes choisies : celles dont le trace de selection reprend le chemin, dans l'ordre du dessin. */
  const choisies = (page: Page) => page.evaluate(() => {
    const traces = [...document.querySelectorAll('.editeur-svg-toile .trace-choisi')].map(p => p.getAttribute('d'));
    return [...document.querySelectorAll('.editeur-svg-toile path[data-id]')].filter(p => traces.includes(p.getAttribute('d'))).map(p => p.getAttribute('data-id'));
  });
  const dit = (page: Page) => texteDe(page.locator('.editeur-svg .annonces[aria-live="polite"]'));
  const zone = (page: Page) => page.locator('.editeur-toile .zone-selection');
  /** Ce que l'apercu montre : les formes dont le chemin est dans celui du lisere. */
  const apercu = (page: Page) => page.evaluate(() => {
    const d = document.querySelector('.editeur-toile .calque-zone.apercu-zone path.lisere-survol')?.getAttribute('d') ?? '';
    return [...document.querySelectorAll('.editeur-svg-toile path[data-id]')].filter(p => d.includes(p.getAttribute('d') ?? '\u0000')).map(p => p.getAttribute('data-id'));
  });

  /** Vide la selection par Echap (seulement s'il y en a une : sans elle, Echap propose de quitter). */
  async function vider(page: Page): Promise<void> {
    if ((await choisies(page)).length) await page.keyboard.press('Escape');
    await attend(() => choisies(page)).toEqual([]);
  }

  /** Commence un glisser du point (x0, y0) du plan vers (x1, y1), sans relacher ; `touches` maintenues pendant tout le geste. */
  async function tirer(page: Page, x0: number, y0: number, x1: number, y1: number, touches: string[] = []): Promise<void> {
    await vueStable(page);
    const a = await versEcran(page, x0, y0), b = await versEcran(page, x1, y1);
    for (const t of touches) await page.keyboard.down(t);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
  }
  async function relacher(page: Page, touches: string[] = []): Promise<void> {
    await page.mouse.up();
    for (const t of touches) await page.keyboard.up(t);
  }
  /** Un cadre complet ; rend ce qui est choisi apres. */
  async function cadre(page: Page, x0: number, y0: number, x1: number, y1: number, touches: string[] = []): Promise<(string | null)[]> {
    await tirer(page, x0, y0, x1, y1, touches);
    await relacher(page, touches);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))));
    return choisies(page);
  }
  /** Un lasso a la souris par les points du plan donnes. */
  async function lasso(page: Page, points: [number, number][], touches: string[] = []): Promise<void> {
    const [premier, ...suite] = points;
    if (!premier) return;
    await vueStable(page);
    const a = await versEcran(page, premier[0], premier[1]);
    for (const t of touches) await page.keyboard.down(t);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (const [x, y] of suite) { const p = await versEcran(page, x, y); await page.mouse.move(p.x, p.y, { steps: 6 }); }
  }

  const outilSelection = (page: Page) => page.locator('.editeur-barre .outil-selection-groupe > .icone-bouton');
  async function choisirAuMenuOutil(page: Page, nom: string | RegExp, tactile = false): Promise<void> {
    const chevron = page.getByRole('button', { name: 'Choisir un outil de sélection' });
    if (tactile) await chevron.tap(); else await chevron.click();
    const element = page.getByRole('menuitemradio', { name: nom });
    if (tactile) await element.tap(); else await element.click();
  }

  async function auditAxe(page: Page): Promise<string[]> {
    // Un menu qui s'ouvre fait passer les autres actions pleines en secondaires, en transition : on juge l'etat d'arrivee.
    await attendreAnimations(page);
    await page.addScriptTag({ content: AXE });
    return page.evaluate(async () => {
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: unknown[] }> }> }> } };
      return (await w.axe.run(document, { resultTypes: ['violations'] })).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)));
    });
  }
  async function capture(page: Page, nom: string): Promise<void> {
    if (!CAPTURES) return;
    mkdirSync(CAPTURES, { recursive: true });
    await page.screenshot({ path: resolve(CAPTURES, nom + '.png') });
  }

  it('ne prend que ce que le cadre touche vraiment : ni le trou d un anneau, ni le coin vide d une diagonale, ni le dessus d une courbe', async () => {
    const page = await editeur();
    // Les trois cas que le cadre d'avant prenait a tort, par leur boite (mesure : ["f1"], ["f2"], ["f4"]).
    expect(await cadre(page, 95, 95, 145, 145)).toEqual([]);
    expect(await cadre(page, 330, 50, 370, 90)).toEqual([]);
    expect(await cadre(page, 20, 186, 30, 196)).toEqual([]);
    // La couronne de l'anneau, le trait de la diagonale, la courbe elle-meme : pris.
    expect(await cadre(page, 50, 95, 70, 145)).toEqual(['f1']);
    expect(await cadre(page, 290, 100, 310, 120)).toEqual(['f2']);
    expect(await cadre(page, 100, 185, 120, 205)).toEqual(['f4']);
    // Chaque cadre a commence sur le vide : rien n'a bouge.
    expect(await modifications(page)).toBe(0);
  });

  it('prend une forme a moitie couverte, montre pendant le geste ce qu il prendra, et le dit au relachement', async () => {
    const page = await editeur();
    await tirer(page, 330, 295, 260, 230);
    // L'apercu : le lisere de survol sur le rectangle, le cadre en tirets (la regle « touchee »).
    await attend(() => apercu(page)).toEqual(['f3']);
    expect(await zone(page).getAttribute('data-regle')).toBe('touche');
    expect(await zone(page).locator('rect.cadre-selection').evaluate(e => getComputedStyle(e).strokeDasharray)).not.toBe('none');
    // Les calques de la zone et de l'apercu ne prennent aucun pointeur, et se taisent pour les lecteurs d'ecran.
    for (const c of await page.locator('.editeur-toile .calque-zone').all()) expect(await c.evaluate(e => [getComputedStyle(e).pointerEvents, e.getAttribute('aria-hidden')].join(' '))).toBe('none true');
    await relacher(page);
    await attend(() => choisies(page)).toEqual(['f3']);
    await attend(() => dit(page)).toBe('1 forme choisie.');
    expect(await zone(page).count()).toBe(0);
    // Choisir n'est pas modifier.
    expect(await modifications(page)).toBe(0);
    // Un cadre qui ne touche rien le dit aussi.
    expect(await cadre(page, 95, 95, 145, 145)).toEqual([]);
    await attend(() => dit(page)).toBe('Aucune forme dans le cadre.');
  });

  it('ne prend, avec la regle « entierement dedans » du menu de l outil, que ce que le cadre contient, en trait plein', async () => {
    const page = await editeur();
    await choisirAuMenuOutil(page, 'Les formes entièrement dedans');
    await attend(() => texteDe(page.locator('.message-etat'))).toBe('Le cadre et le lasso ne prennent que les formes entièrement dedans.');
    await tirer(page, 330, 295, 260, 230);
    await attend(() => zone(page).getAttribute('data-regle')).toBe('dedans');
    expect(await zone(page).locator('rect.cadre-selection').evaluate(e => getComputedStyle(e).strokeDasharray)).toBe('none');
    expect(await apercu(page)).toEqual([]);
    await relacher(page);
    await attend(() => dit(page)).toBe('Aucune forme dans le cadre.');
    expect(await choisies(page)).toEqual([]);
    expect(await cadre(page, 210, 210, 310, 290)).toEqual(['f3']);
    // Le menu coche la regle choisie.
    await page.getByRole('button', { name: 'Choisir un outil de sélection' }).click();
    expect(await page.getByRole('menuitemradio', { name: 'Les formes entièrement dedans' }).getAttribute('aria-checked')).toBe('true');
    await page.getByRole('menuitemradio', { name: 'Les formes touchées, même en partie' }).click();
    await vider(page);
    expect(await cadre(page, 330, 295, 260, 230)).toEqual(['f3']);
  });

  it('avec l outil Selection, commencer sur une forme ou tout pres la deplace toujours ; l outil Cadre commence meme sur un grand fond', async () => {
    const page = await editeur(FOND);
    // Selection : le fond se tire (inchange).
    await cadre(page, 50, 50, 150, 150);
    await attend(() => modifications(page)).toBe(1);
    await page.keyboard.press('Control+z');
    await attend(() => modifications(page)).toBe(0);
    await vider(page);
    // Le Cadre (F), commence sur le fond : rien ne bouge ; il prend ce qu'il touche, le fond compris (la zone est dans sa surface).
    await page.keyboard.press('f');
    await attend(() => outilSelection(page).getAttribute('aria-label')).toMatch(/^Cadre de sélection \(F\)/);
    expect(await outilSelection(page).getAttribute('aria-pressed')).toBe('true');
    expect(await page.locator('.editeur-cadre').getAttribute('class')).toContain('outil-cadre');
    expect(await cadre(page, 90, 90, 120, 120)).toEqual(['f1', 'f2']);
    expect(await modifications(page)).toBe(0);
    // Pour ne prendre que les formes posees dessus : Alt retire le fond, ou la regle « dedans ».
    expect(await cadre(page, 10, 10, 20, 20, ['Alt'])).toEqual(['f2']);
    await choisirAuMenuOutil(page, 'Les formes entièrement dedans');
    expect(await cadre(page, 90, 90, 310, 210)).toEqual(['f2', 'f3']);
    expect(await modifications(page)).toBe(0);
    // L'outil reste pris ; V rend la selection.
    expect(await page.locator('.editeur-cadre').getAttribute('class')).toContain('outil-cadre');
    await page.keyboard.press('v');
    await attend(() => outilSelection(page).getAttribute('aria-label')).toBe('Sélection (V)');
  });

  it('ajoute avec Maj, retire avec Alt', async () => {
    const page = await editeur();
    expect(await cadre(page, 330, 295, 260, 230)).toEqual(['f3']);
    expect(await cadre(page, 290, 100, 310, 120, ['Shift'])).toEqual(['f2', 'f3']);
    await attend(() => dit(page)).toBe('1 forme ajoutée : 2 formes choisies.');
    expect(await cadre(page, 330, 295, 260, 230, ['Alt'])).toEqual(['f2']);
    await attend(() => dit(page)).toBe('1 forme retirée : 1 forme choisie.');
    // Un appui sans etendue avec Maj ou Alt ne vide rien.
    expect(await cadre(page, 100, 290, 100, 290, ['Alt'])).toEqual(['f2']);
    expect(await cadre(page, 100, 290, 100, 290)).toEqual([]);
  });

  it('entoure au lasso : il prend ce que son trace touche, pas ce que sa boite couvre', async () => {
    const page = await editeur();
    await choisirAuMenuOutil(page, 'Lasso');
    await attend(() => outilSelection(page).getAttribute('aria-label')).toMatch(/^Lasso \(Q\)/);
    // Dans le trou de l'anneau : rien.
    await lasso(page, [[95, 95], [145, 100], [140, 145], [100, 140]]);
    await attend(() => zone(page).locator('polygon.cadre-selection').count()).toBe(1);
    expect(await apercu(page)).toEqual([]);
    await relacher(page);
    await attend(() => dit(page)).toBe('Aucune forme dans le lasso.');
    // Un triangle dont la boite couvre la diagonale et le rectangle, mais dont le trace ne touche que le rectangle.
    await lasso(page, [[250, 290], [390, 290], [250, 230]]);
    await attend(() => apercu(page)).toEqual(['f3']);
    await relacher(page);
    await attend(() => choisies(page)).toEqual(['f3']);
    await attend(() => dit(page)).toBe('1 forme choisie.');
    // Maj ajoute au lasso aussi.
    await lasso(page, [[60, 100], [75, 100], [75, 140], [60, 140]], ['Shift']);
    await relacher(page, ['Shift']);
    await attend(() => choisies(page)).toEqual(['f1', 'f3']);
  });

  it('range au menu Edition tout, rien, inverser, la meme couleur de fond ou de contour et le meme type, avec leurs raccourcis', async () => {
    const page = await editeur(COULEURS);
    await ouvrirMenu(page, 'Édition');
    const textes = await page.getByRole('menu', { name: 'Édition' }).getByRole('menuitem').evaluateAll(l => l.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
    for (const attendu of ['Tout sélectionnerCtrl+A', 'DésélectionnerÉchap', 'Inverser la sélectionI', 'Sélectionner la même couleur de fondC', 'Sélectionner la même couleur de contourAlt+C', 'Sélectionner le même typeY']) {
      expect(textes).toContain(attendu);
    }
    await page.getByRole('menuitem', { name: /^Tout sélectionner/ }).click();
    await attend(() => choisies(page)).toEqual(['f1', 'f2', 'f3', 'f4']);
    await page.keyboard.press('Escape');
    await attend(() => choisies(page)).toEqual([]);

    // Inverser (I) : tout ce qui n'etait pas choisi.
    await cadre(page, 10, 10, 30, 30);
    await attend(() => choisies(page)).toEqual(['f1']);
    await page.keyboard.press('i');
    await attend(() => choisies(page)).toEqual(['f2', 'f3', 'f4']);
    await attend(() => dit(page)).toBe('Sélection inversée : 3 formes choisies.');
    await ouvrirMenu(page, 'Édition');
    await page.getByRole('menuitem', { name: /^Inverser la sélection/ }).click();
    await attend(() => choisies(page)).toEqual(['f1']);

    // La meme couleur de fond (C), de contour (Alt+C), le meme type (Y).
    await page.keyboard.press('c');
    await attend(() => choisies(page)).toEqual(['f1', 'f2']);
    await cadre(page, 10, 10, 30, 30);
    await page.keyboard.press('Alt+c');
    await attend(() => choisies(page)).toEqual(['f1', 'f3']);
    await attend(() => dit(page)).toBe('2 formes de même contour noir #000000 choisies.');
    await cadre(page, 200, 130, 210, 155);
    await attend(() => choisies(page)).toEqual(['f3']);
    await page.keyboard.press('y');
    await attend(() => dit(page)).toBe('1 trait choisi.');
    await cadre(page, 110, 10, 130, 30);
    await ouvrirMenu(page, 'Édition');
    await page.getByRole('menuitem', { name: /^Sélectionner le même type/ }).click();
    await attend(() => choisies(page)).toEqual(['f1', 'f2', 'f4']);
    await attend(() => dit(page)).toBe('3 formes pleines choisies.');
    expect(await modifications(page)).toBe(0);
  });

  it('en contexte Cricut, choisit tout ce qui est a couper ou a ecrire (ADR-0028)', async () => {
    const page = await editeur(COULEURS);
    await page.locator('.selecteur-contexte .menu-bouton').click();
    await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
    await attend(() => page.locator('.editeur-calques .groupe-operation').count()).toBe(2);
    await ouvrirMenu(page, 'Édition');
    await page.getByRole('menuitem', { name: /^Sélectionner tout ce qui est à couper/ }).click();
    await attend(() => choisies(page)).toEqual(['f1', 'f2', 'f4']);
    await attend(() => dit(page)).toBe('3 formes à couper choisies.');
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('Alt+Shift+E');
    await attend(() => choisies(page)).toEqual(['f3']);
    await attend(() => dit(page)).toBe('1 forme à écrire choisie.');
    // Hors de Cricut, ces commandes n'existent pas.
    const generique = await editeur(COULEURS);
    await ouvrirMenu(generique, 'Édition');
    expect(await generique.getByRole('menuitem', { name: /^Sélectionner tout ce qui est à/ }).count()).toBe(0);
  });

  it('trace le cadre et le lasso au clavier, par le reticule', async () => {
    const page = await editeur(CLAVIER);
    const toile = page.locator('.editeur-svg-toile');
    await toile.focus();
    await page.keyboard.press('f');
    await attend(() => dit(page)).toMatch(/^Outil cadre de sélection/);
    // Le premier coin au reticule (au centre du plan visible), l'autre deux grands pas a gauche et en haut : le carre du haut.
    await page.keyboard.press('Space');
    await attend(() => dit(page)).toMatch(/^Premier coin du cadre posé à /);
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Shift+ArrowUp');
    await attend(() => dit(page)).toMatch(/ 1 forme à prendre\.$/);
    // L'apercu montre le cadre et la forme qu'Entree prendra.
    await attend(() => apercu(page)).toEqual(['f1']);
    await page.keyboard.press('Enter');
    await attend(() => choisies(page)).toEqual(['f1']);
    await attend(() => dit(page)).toBe('1 forme choisie.');
    // Maj et Entree ajoutent : un second cadre jusqu'au carre du bas.
    await page.keyboard.press('Space');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+Enter');
    await attend(() => choisies(page)).toEqual(['f1', 'f2']);
    await attend(() => dit(page)).toBe('1 forme ajoutée : 2 formes choisies.');
    // Echap annule un premier coin sans quitter l'outil.
    await page.keyboard.press('Space');
    await page.keyboard.press('Escape');
    await attend(() => dit(page)).toBe('Premier coin annulé : l’outil reste pris.');
    expect(await page.locator('.editeur-cadre').getAttribute('class')).toContain('outil-cadre');

    // Le lasso (Q) : Espace pose les points, Entree ferme et prend.
    await page.keyboard.press('Escape');
    await attend(() => choisies(page)).toEqual([]);
    await page.keyboard.press('q');
    await attend(() => dit(page)).toMatch(/^Outil lasso/);
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await attend(() => dit(page)).toBe('Posez au moins trois points (Espace) avant de fermer le lasso.');
    for (const touche of ['Shift+ArrowLeft', 'Shift+ArrowLeft', 'Shift+ArrowLeft']) await page.keyboard.press(touche);
    await page.keyboard.press('Space');
    for (const touche of ['Shift+ArrowUp', 'Shift+ArrowUp']) await page.keyboard.press(touche);
    await page.keyboard.press('Enter');
    await attend(() => choisies(page)).toEqual(['f1']);
    await attend(() => dit(page)).toBe('1 forme choisie.');
  });

  it('se tient au doigt a 390 px : l outil Cadre dans la barre, des cibles de 40 px, un cadre commence sur une forme', async () => {
    const page = await editeur(DESSIN, { largeur: 390, hauteur: 844, tactile: true });
    const chevron = page.getByRole('button', { name: 'Choisir un outil de sélection' });
    const tailles = [await chevron.boundingBox(), await outilSelection(page).boundingBox()];
    for (const t of tailles) { expect(t?.width).toBeGreaterThanOrEqual(40); expect(t?.height).toBeGreaterThanOrEqual(40); }
    await choisirAuMenuOutil(page, 'Cadre de sélection', true);
    await attend(() => texteDe(page.locator('.message-etat'))).toMatch(/^Cadre : glissez, même sur une forme/);
    // Un doigt qui part du rectangle et va vers le haut a gauche : il ne le deplace pas, il le prend avec ce qu'il touche.
    await vueStable(page);
    const a = await versEcran(page, 280, 260), b = await versEcran(page, 200, 150);
    const avant = await page.locator('path[data-id="f3"]').getAttribute('d');
    await page.evaluate(([ax, ay, bx, by]) => {
      const el = document.querySelector('.editeur-svg-toile');
      if (!el) throw new Error('toile absente');
      const ev = (t: string, x: number, y: number) => el.dispatchEvent(new PointerEvent(t, { pointerId: 5, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true, button: 0, buttons: t === 'pointerup' ? 0 : 1 }));
      ev('pointerdown', ax, ay);
      for (let i = 1; i <= 8; i++) ev('pointermove', ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8);
      ev('pointerup', bx, by);
    }, [a.x, a.y, b.x, b.y] as const);
    await attend(() => choisies(page)).toEqual(['f3']);
    expect(await page.locator('path[data-id="f3"]').getAttribute('d')).toBe(avant);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  it('suit un cadre et un lasso sur 5 000 formes, apercu compris, en moins d une image par mouvement', async () => {
    const { page } = await navigateur.ouvrir();
    // 5 000 formes : des carres pleins, des traits fins et des contours sans remplissage, en grille serree (le dessin de prise.e2e.ts).
    let formes = '';
    for (let i = 0; i < 5000; i++) {
      const x = (i % 100) * 10, y = Math.floor(i / 100) * 10, k = i % 3;
      formes += k === 0 ? `<rect x="${x}" y="${y}" width="8" height="8" fill="#${(i * 2654435761 % 0xffffff).toString(16).padStart(6, '0')}"/>`
        : k === 1 ? `<path d="M${x} ${y + 4}C${x + 3} ${y} ${x + 6} ${y + 8} ${x + 9} ${y + 4}" fill="none" stroke="#000000" stroke-width="0.5"/>`
        : `<circle cx="${x + 4}" cy="${y + 4}" r="3" fill="none" stroke="#c81e28" stroke-width="0.5"/>`;
    }
    await ouvrirCode(page, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500">${formes}</svg>`);
    await attend(() => page.locator('.editeur-svg-toile path[data-id]').count(), 30_000).toBe(5000);
    await page.locator('.editeur-svg-toile').focus();
    /** Un geste : appui au coin haut gauche, puis des mouvements qui agrandissent la zone (un cadre) ou en font le tour (un lasso). */
    const mesurer = (forme: 'cadre' | 'lasso') => page.evaluate(async (f) => {
      const svg = document.querySelector<SVGSVGElement>('.editeur-svg-toile');
      if (!svg) throw new Error('toile absente');
      const r = svg.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const ev = (t: string, x: number, y: number) => svg.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerType: 'mouse', isPrimary: true, pointerId: 1, button: 0, buttons: t === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
      const point = (i: number): [number, number] => f === 'cadre'
        ? [r.left + 20 + (i % 200) * (r.width - 40) / 200, r.top + 20 + (i % 200) * (r.height - 40) / 200]
        : [cx + Math.cos(i / 40) * (r.width / 3) * (i / 300), cy + Math.sin(i / 40) * (r.height / 3) * (i / 300)];
      ev('pointerdown', ...(f === 'cadre' ? [r.left + 20, r.top + 20] as [number, number] : point(0)));
      const calcul: number[] = [], rendu: number[] = [], images: number[] = [];
      for (let i = 1; i < 200; i++) {
        const t0 = performance.now();
        ev('pointermove', ...point(i));
        const t1 = performance.now();
        await new Promise(fini => setTimeout(fini, 0));
        calcul.push(t1 - t0);
        rendu.push(performance.now() - t0);
      }
      let avant = await new Promise<number>(fini => requestAnimationFrame(fini));
      for (let i = 200; i < 260; i++) {
        ev('pointermove', ...point(i));
        const t = await new Promise<number>(fini => requestAnimationFrame(fini));
        images.push(t - avant);
        avant = t;
      }
      const prises = document.querySelector('.calque-zone.apercu-zone path.lisere-survol')?.getAttribute('d')?.split('M').length ?? 0;
      ev('pointerup', ...point(260));
      const mediane = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? NaN;
      const centile = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length * 0.95)] ?? NaN;
      const moyenne = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
      return { calcul: mediane(calcul), calcul95: centile(calcul), rendu: mediane(rendu), rendu95: centile(rendu), image: moyenne(images), prises };
    }, forme);
    const dire = (m: Awaited<ReturnType<typeof mesurer>>) => `calcul ${m.calcul.toFixed(2)} ms (95 % : ${m.calcul95.toFixed(2)}), jusqu'au rendu ${m.rendu.toFixed(2)} ms (95 % : ${m.rendu95.toFixed(2)}), une image ${m.image.toFixed(1)} ms en moyenne, ~${m.prises} sous-chemins dans l'apercu`;
    await page.keyboard.press('f');
    const c = await mesurer('cadre');
    await page.keyboard.press('q');
    const l = await mesurer('lasso');
    console.log(`Cadre, 5 000 formes : ${dire(c)}\nLasso, 5 000 formes : ${dire(l)}`);
    // Le calcul de ce que la zone prend tient dans une fraction d'image ; le rendu de l'apercu, dans une image.
    expect(c.calcul).toBeLessThan(16);
    expect(l.calcul).toBeLessThan(16);
    expect(c.rendu).toBeLessThan(50);
  });

  for (const schema of ['light', 'dark'] as const) {
    const nom = schema === 'light' ? 'clair' : 'sombre';
    it('passe axe-core en ' + nom + ' : le menu des outils, un cadre en cours avec son apercu, un lasso', async () => {
      const page = await editeur(DESSIN, { schema });
      await page.getByRole('button', { name: 'Choisir un outil de sélection' }).click();
      await page.getByRole('menu', { name: 'Outil de sélection' }).waitFor();
      expect(await auditAxe(page)).toEqual([]);
      await capture(page, 'menu-1280-' + nom);
      await page.keyboard.press('Escape');
      await tirer(page, 330, 295, 200, 100);
      await attend(() => apercu(page)).toEqual(['f2', 'f3']);
      expect(await auditAxe(page)).toEqual([]);
      await capture(page, 'cadre-1280-' + nom);
      await relacher(page);
      await vider(page);
      await page.keyboard.press('q');
      await lasso(page, [[40, 120], [120, 40], [200, 60], [210, 150], [140, 230], [60, 220]]);
      await attend(() => apercu(page)).toEqual(['f1', 'f4']);
      expect(await auditAxe(page)).toEqual([]);
      await capture(page, 'lasso-1280-' + nom);
      await relacher(page);
    });

    it('passe axe-core au doigt a 390 px en ' + nom + ', le menu des outils ouvert puis le cadre en cours', async () => {
      const page = await editeur(DESSIN, { largeur: 390, hauteur: 844, tactile: true, schema });
      await page.getByRole('button', { name: 'Choisir un outil de sélection' }).tap();
      await page.getByRole('menu', { name: 'Outil de sélection' }).waitFor();
      expect(await auditAxe(page)).toEqual([]);
      await capture(page, 'menu-390-' + nom);
      await page.getByRole('menuitemradio', { name: 'Cadre de sélection' }).tap();
      // Le cadre en cours au doigt (sans relacher) et son apercu.
      await vueStable(page);
      const a = await versEcran(page, 330, 295), b = await versEcran(page, 200, 100);
      await page.evaluate(([ax, ay, bx, by]) => {
        const el = document.querySelector('.editeur-svg-toile');
        const ev = (t: string, x: number, y: number) => el?.dispatchEvent(new PointerEvent(t, { pointerId: 6, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true, button: 0, buttons: 1 }));
        ev('pointerdown', ax, ay);
        for (let i = 1; i <= 6; i++) ev('pointermove', ax + (bx - ax) * i / 6, ay + (by - ay) * i / 6);
      }, [a.x, a.y, b.x, b.y] as const);
      await attend(() => apercu(page)).toEqual(['f2', 'f3']);
      expect(await auditAxe(page)).toEqual([]);
      await capture(page, 'cadre-390-' + nom);
      // Le lasso au doigt, pour la capture.
      await page.evaluate(([bx, by]) => {
        document.querySelector('.editeur-svg-toile')?.dispatchEvent(new PointerEvent('pointerup', { pointerId: 6, pointerType: 'touch', clientX: bx, clientY: by, bubbles: true, isPrimary: true, button: 0, buttons: 0 }));
      }, [b.x, b.y] as const);
      await page.getByRole('button', { name: 'Choisir un outil de sélection' }).tap();
      await page.getByRole('menuitemradio', { name: 'Lasso' }).tap();
      await vueStable(page);
      const pts = await Promise.all(([[40, 120], [120, 40], [200, 60], [210, 150], [140, 230], [60, 220]] as const).map(([x, y]) => versEcran(page, x, y)));
      await page.evaluate(points => {
        const el = document.querySelector('.editeur-svg-toile');
        const ev = (t: string, x: number, y: number) => el?.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true, button: 0, buttons: 1 }));
        const [p0, ...suite] = points;
        if (!p0) return;
        ev('pointerdown', p0.x, p0.y);
        let avant = p0;
        for (const p of suite) { for (let i = 1; i <= 6; i++) ev('pointermove', avant.x + (p.x - avant.x) * i / 6, avant.y + (p.y - avant.y) * i / 6); avant = p; }
      }, pts);
      await attend(() => apercu(page)).toEqual(['f1', 'f4']);
      expect(await auditAxe(page)).toEqual([]);
      await capture(page, 'lasso-390-' + nom);
    });
  }
});

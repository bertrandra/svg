// Un dessin de deux mille couleurs (une vectorisation de photo en compte autant, ADR-0008) : la liste « Par
// couleur » se fenetre. Ces tests gardent ce qu'on ne doit pas perdre en la fenetrant : peu de lignes dans la
// page, mais toutes atteignables (defilement, clavier, doigt), et chaque geste d'une ligne qui marche loin dans
// la liste.
//
// Le dessin est fabrique ici, en memoire : deux mille carres de 10 sur 10, chacun d'une couleur qui n'est qu'a
// lui. Toutes les couleurs ont une forme, donc la liste les range par code croissant : la ligne i est la
// couleur i, celle de la forme f(i+1).

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, formesVisibles, ouvrirCode, pilote, texteDe } from './aide.js';

const N = 2000;
/** Distinctes, de six chiffres, et croissantes : l'ordre de la liste est celui de `i`. */
const couleur = (i: number) => '#' + (0x101010 + i * 0x407).toString(16).padStart(6, '0');
const NOM = (i: number) => couleur(i).toUpperCase();
const DESSIN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800">'
  + Array.from({ length: N }, (_, i) => `<path d="M${(i % 50) * 20} ${Math.floor(i / 50) * 20}h10v10h-10z" fill="${couleur(i)}"/>`).join('')
  + '</svg>';

/** Au-dela de cette taille, la liste n'est plus fenetree : une quarantaine de lignes au plus, pas des milliers. */
const LIGNES_MAX = 60;

describe('calques par couleur, deux mille couleurs', () => {
  const navigateur = pilote();

  async function editeur(options: { tactile?: boolean; largeur?: number; hauteur?: number } = {}) {
    const { page } = await navigateur.ouvrir(options);
    await ouvrirCode(page, DESSIN, options.tactile);
    return page;
  }

  const liste = (page: Page) => page.locator('ul.par-couleur');
  /** Les vraies lignes : les cales qui tiennent la place des autres ne comptent pas. */
  const lignes = (page: Page) => page.locator('ul.par-couleur > li:not([data-cale])');
  const defilement = (page: Page) => liste(page).evaluate(u => u.scrollTop);
  const defilerA = (page: Page, haut: number) => liste(page).evaluate((u, h) => { u.scrollTop = h; }, haut);
  /**
   * Fait defiler la liste, puis attend que les lignes dessinees recouvrent la zone visible : la fenetre se
   * refait apres l'evenement de defilement, et sur une machine lente le DOM lu tout de suite est celui d'avant
   * (on y choisirait une ligne qui disparait avant le clic).
   */
  const defilerEtAttendre = async (page: Page, haut: number) => {
    await defilerA(page, haut);
    await attend(() => liste(page).evaluate(u => {
      const z = u.getBoundingClientRect();
      return Array.from(u.querySelectorAll(':scope > li:not([data-cale])')).some(e => { const r = e.getBoundingClientRect(); return r.bottom > z.top && r.top < z.bottom; });
    })).toBe(true);
  };
  const rang = (page: Page, i: number) => page.locator(`ul.par-couleur > li[aria-posinset="${i + 1}"]`);
  /** Les rangs des lignes dessinees (de 1 a N). */
  const rangsDessines = (page: Page) => lignes(page).evaluateAll(l => l.map(e => Number(e.getAttribute('aria-posinset'))));

  /** Ou est le focus : le rang de la ligne qui le porte (0 s'il est ailleurs), et si le controle focalise tient dans la liste. */
  const foyer = (page: Page) => page.evaluate(() => {
    const e = document.activeElement, li = e?.closest('ul.par-couleur > li'), u = document.querySelector('ul.par-couleur');
    if (!e || !li || !u) return { rang: 0, dedans: false, haut: 0 };
    const a = e.getBoundingClientRect(), z = u.getBoundingClientRect();
    return { rang: Number(li.getAttribute('aria-posinset')), dedans: a.top >= z.top - 1 && a.bottom <= z.bottom + 1, haut: u.scrollTop };
  });

  it('ne dessine qu’une poignée de lignes, et dit leur place aux lecteurs d’ecran', async () => {
    const page = await editeur();
    expect(await formesVisibles(page)).toBe(N);
    expect(await texteDe(page.locator('details.section', { hasText: 'Par couleur' }).locator('summary').first())).toContain(String(N));
    const n = await lignes(page).count();
    expect(n).toBeGreaterThan(8);
    expect(n).toBeLessThan(LIGNES_MAX);
    expect(await lignes(page).first().getAttribute('aria-setsize')).toBe(String(N));
    expect(await rangsDessines(page)).toEqual(Array.from({ length: n }, (_, k) => k + 1));
    expect(await texteDe(lignes(page).first())).toContain(NOM(0));
    // La liste garde sa hauteur de 260 px au plus et defile : elle ne s'etire pas pour deux mille lignes.
    expect(await liste(page).evaluate(u => u.clientHeight)).toBeLessThanOrEqual(260);
    expect(await liste(page).evaluate(u => u.scrollHeight)).toBeGreaterThan(N * 20);
  });

  it('atteint la derniere couleur au defilement, et revient a la premiere', async () => {
    const page = await editeur();
    await liste(page).evaluate(u => { u.scrollTop = u.scrollHeight; });
    await attend(() => rang(page, N - 1).count()).toBe(1);
    expect(await texteDe(rang(page, N - 1))).toContain(NOM(N - 1));
    expect(await lignes(page).count()).toBeLessThan(LIGNES_MAX);
    // La derniere ligne est entierement visible, collee au bas de la liste : pas de vide sous elle.
    const [bas, fond] = await Promise.all([rang(page, N - 1).evaluate(e => e.getBoundingClientRect().bottom), liste(page).evaluate(u => u.getBoundingClientRect().bottom)]);
    expect(Math.abs(bas - fond)).toBeLessThan(3);

    await defilerA(page, 0);
    await attend(() => rang(page, 0).count()).toBe(1);
    expect(await texteDe(rang(page, 0))).toContain(NOM(0));
  });

  it('defile pas a pas sans trou : chaque position montre des lignes contigues qui couvrent la zone', async () => {
    const page = await editeur();
    for (const haut of [0, 333, 1234, 20000, 31337, 52000]) {
      await defilerA(page, haut);
      await attend(async () => {
        const [rangs, zone] = await Promise.all([rangsDessines(page), liste(page).evaluate(u => ({ h: u.clientHeight, d: u.scrollTop }))]);
        const contigus = rangs.every((r, k) => k === 0 || r === (rangs[k - 1] ?? 0) + 1);
        // Les lignes dessinees recouvrent la zone visible (pas de 27 px, 26 de haut).
        const premiere = (rangs[0] ?? 1) - 1, derniere = rangs[rangs.length - 1] ?? 0;
        return contigus && rangs.length < LIGNES_MAX && premiere * 27 <= zone.d && derniere * 27 >= Math.min(zone.d + zone.h, N * 27 - 1);
      }).toBe(true);
    }
  });

  it('se parcourt au clavier : Tab traverse la marge de la fenetre sans perdre le focus ni faire reculer la liste', async () => {
    const page = await editeur();
    await lignes(page).first().locator('.couleur-choix').focus();
    expect(await foyer(page)).toMatchObject({ rang: 1, dedans: true });
    const depart = await rangsDessines(page);
    let precedent = 0, atteint = 0;
    for (let k = 0; k < 400 && atteint < 40; k++) {
      await page.keyboard.press('Tab');
      const f = await foyer(page);
      expect(f.rang, `apres ${k + 1} Tab, le focus est sorti de la liste`).toBeGreaterThan(0);
      expect(f.dedans, `apres ${k + 1} Tab, le controle focalise est hors de la zone visible`).toBe(true);
      expect(f.haut, `apres ${k + 1} Tab, la liste est revenue en arriere`).toBeGreaterThanOrEqual(precedent);
      precedent = f.haut; atteint = f.rang;
    }
    // Il a franchi la derniere ligne dessinee au depart : la fenetre a suivi le focus.
    expect(atteint).toBeGreaterThanOrEqual(40);
    expect(Math.max(...depart)).toBeLessThan(40);
    expect(await lignes(page).count()).toBeLessThan(LIGNES_MAX);

    // Et au retour, Maj+Tab remonte jusqu'a la premiere ligne.
    for (let k = 0; k < 400 && atteint > 1; k++) {
      await page.keyboard.press('Shift+Tab');
      const f = await foyer(page);
      expect(f.rang, `apres ${k + 1} Maj+Tab, le focus est sorti de la liste`).toBeGreaterThan(0);
      expect(f.dedans).toBe(true);
      atteint = f.rang;
    }
    expect(atteint).toBe(1);
    expect(await defilement(page)).toBe(0);
  });

  it('ne ramene pas la liste en arriere quand la molette retire la ligne qui a le focus', async () => {
    const page = await editeur();
    await lignes(page).first().locator('.couleur-choix').focus();
    const zone = await liste(page).boundingBox();
    if (!zone) throw new Error('pas de liste');
    await page.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2);
    let but = 0;
    for (let k = 0; k < 12; k++) {
      await page.mouse.wheel(0, 300);
      but += 300;
      await attend(() => defilement(page)).toBeGreaterThanOrEqual(Math.min(but, 1000) - 2);
    }
    // La premiere ligne est partie du DOM, avec son focus : la liste est la ou la molette l'a menee.
    await attend(() => rang(page, 0).count()).toBe(0);
    expect(await defilement(page)).toBeGreaterThanOrEqual(3598);
    expect(await lignes(page).count()).toBeLessThan(LIGNES_MAX);
  });

  it('ne ramene pas la liste en arriere non plus quand la molette remonte depuis le bas, ligne focalisee retiree', async () => {
    const page = await editeur();
    await liste(page).evaluate(u => { u.scrollTop = u.scrollHeight; });
    await attend(() => rang(page, N - 1).count()).toBe(1);
    await rang(page, N - 1).locator('.couleur-choix').focus();
    const [zone, fin] = await Promise.all([liste(page).boundingBox(), defilement(page)]);
    if (!zone) throw new Error('pas de liste');
    await page.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2);
    for (let k = 1; k <= 10; k++) {
      await page.mouse.wheel(0, -200);
      await attend(() => defilement(page)).toBeLessThanOrEqual(fin - 200 * k + 2);
      expect(await defilement(page), 'la liste a saute en arriere').toBeGreaterThanOrEqual(fin - 200 * k - 2);
    }
    await attend(() => rang(page, N - 1).count()).toBe(0);
  });

  it('garde le focus sur la ligne quand on masque une couleur tout en bas de la liste', async () => {
    const page = await editeur();
    await liste(page).evaluate(u => { u.scrollTop = u.scrollHeight; });
    await attend(() => rang(page, N - 1).count()).toBe(1);
    const dernier = rang(page, N - 1);
    await dernier.getByRole('button', { name: `Masquer les formes ${NOM(N - 1)}` }).focus();
    await page.keyboard.press('Enter');
    await attend(() => dernier.getByRole('button', { name: `Afficher les formes ${NOM(N - 1)}` }).count()).toBe(1);
    expect(await formesVisibles(page)).toBe(N - 1);
    expect(await foyer(page)).toMatchObject({ rang: N, dedans: true });
  });

  it('masque, verrouille et choisit une couleur loin dans la liste, sans que la liste bouge', async () => {
    const page = await editeur();
    await defilerEtAttendre(page, 25000);
    // Une ligne entierement visible vers le milieu de la zone.
    const cible = await liste(page).evaluate(u => {
      const z = u.getBoundingClientRect();
      const l = Array.from(u.querySelectorAll(':scope > li:not([data-cale])')).find(e => { const r = e.getBoundingClientRect(); return r.top > z.top + 100 && r.bottom < z.bottom - 10; });
      return l ? Number(l.getAttribute('aria-posinset')) - 1 : -1;
    });
    expect(cible).toBeGreaterThan(500);
    const haut = await defilement(page), ligne = rang(page, cible), nom = NOM(cible);

    await ligne.getByRole('button', { name: `Masquer les formes ${nom}` }).click();
    await attend(() => ligne.getByRole('button', { name: `Afficher les formes ${nom}` }).count()).toBe(1);
    expect(await formesVisibles(page)).toBe(N - 1);
    expect(await ligne.getAttribute('class')).toContain('attenue');
    expect(await texteDe(ligne)).toContain('1 · 1 masquée');

    await ligne.getByRole('button', { name: `Verrouiller les formes ${nom}` }).click();
    await attend(() => ligne.getByRole('button', { name: `Déverrouiller les formes ${nom}` }).getAttribute('aria-pressed')).toBe('true');

    await ligne.getByRole('button', { name: `Afficher les formes ${nom}` }).click();
    await attend(() => formesVisibles(page)).toBe(N);

    // Choisir la couleur d'une ligne voisine (libre) : ses formes se choisissent, la ligne devient « choisi ».
    const voisine = rang(page, cible + 1);
    await voisine.locator('.couleur-choix').click();
    await attend(() => voisine.getAttribute('class')).toContain('choisi');
    expect(await page.locator('ul.par-couleur > li.choisi').count()).toBe(1);
    await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
    // La forme choisie est celle de cette couleur (f(i+1)), et seulement elle.
    expect(await page.locator('.editeur-calques ol > li.choisi').count()).toBe(1);
    expect(await page.locator('.editeur-svg-toile path[data-id="f' + (cible + 2) + '"]').count()).toBe(1);

    // Tout ce qui precede a pu faire defiler la liste d'une ligne ou deux au plus : jamais revenir au debut.
    expect(Math.abs((await defilement(page)) - haut)).toBeLessThan(60);
  });

  it('ouvre le menu d’une ligne lointaine, et Echap rend le focus a son bouton', async () => {
    const page = await editeur();
    await defilerEtAttendre(page, 40000);
    const rangs = await rangsDessines(page);
    const i = (rangs[Math.floor(rangs.length / 2)] ?? 1) - 1, nom = NOM(i);
    // Des selecteurs CSS : une requete par role parcourt tout l'arbre d'accessibilite, long avec deux mille formes.
    const bouton = page.locator(`[aria-label="Autres actions sur ${nom}"]`);
    await bouton.click();
    const menu = page.locator(`.menu-panneau[aria-label="Autres actions sur ${nom}"]`);
    await menu.waitFor();
    expect(await menu.locator('[role="menuitem"]', { hasText: 'Supprimer ces formes (1)' }).count()).toBe(1);
    expect(await menu.evaluate(e => getComputedStyle(e).position)).toBe('fixed');
    await page.keyboard.press('Escape');
    await attend(() => menu.count()).toBe(0);
    expect(await bouton.evaluate(e => e === document.activeElement)).toBe(true);
  });

  it('suit « Fond » et « Trait » : sans contour la liste est vide, au retour elle est fenetree de nouveau', async () => {
    const page = await editeur();
    const mode = (nom: string) => page.locator('.mini-onglets button', { hasText: new RegExp('^' + nom + '$') });
    await mode('Trait').click();
    await attend(() => liste(page).count()).toBe(0);
    await mode('Fond').click();
    await attend(() => lignes(page).count()).toBeGreaterThan(8);
    expect(await lignes(page).count()).toBeLessThan(LIGNES_MAX);
    expect(await lignes(page).first().getAttribute('aria-setsize')).toBe(String(N));
  });

  it('au doigt : lignes de 40 px au moins, fenetre juste malgre le pas plus grand, derniere ligne atteignable', async () => {
    const page = await editeur({ tactile: true, largeur: 420, hauteur: 860 });
    await page.locator('button[aria-label="Calques"]').tap();
    await attend(() => page.locator('.editeur-calques').evaluate(e => getComputedStyle(e).visibility)).toBe('visible');
    await attend(() => lignes(page).count()).toBeGreaterThan(5);
    expect(await lignes(page).count()).toBeLessThan(LIGNES_MAX);

    const petites = () => page.locator('ul.par-couleur > li:not([data-cale]) button:visible, ul.par-couleur > li:not([data-cale]) input:visible').evaluateAll(
      l => l.map(e => { const r = e.getBoundingClientRect(); return { nom: (e.getAttribute('aria-label') ?? (e as HTMLElement).innerText).slice(0, 30), l: Math.round(r.width), h: Math.round(r.height) }; }).filter(c => c.l < 40 || c.h < 40)
    );
    expect(await petites()).toEqual([]);
    expect(await lignes(page).first().evaluate(e => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(40);

    // Le pas est de 41 px, non de 27 : la fenetre se cale sur le pas mesure, sans trou au milieu de la liste.
    await defilerA(page, 30000);
    await attend(async () => {
      const [rangs, zone] = await Promise.all([rangsDessines(page), liste(page).evaluate(u => ({ h: u.clientHeight, d: u.scrollTop }))]);
      return rangs.length > 5 && rangs.length < LIGNES_MAX && ((rangs[0] ?? 1) - 1) * 41 <= zone.d && (rangs[rangs.length - 1] ?? 0) * 41 >= zone.d + zone.h;
    }).toBe(true);
    expect(await petites()).toEqual([]);

    await liste(page).evaluate(u => { u.scrollTop = u.scrollHeight; });
    await attend(() => rang(page, N - 1).count()).toBe(1);
    await rang(page, N - 1).getByRole('button', { name: `Masquer les formes ${NOM(N - 1)}` }).tap();
    await attend(() => formesVisibles(page)).toBe(N - 1);
  });
});

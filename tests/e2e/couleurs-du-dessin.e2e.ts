// La section « Couleurs du dessin » de l'inspecteur sur un dessin de deux mille couleurs (une vectorisation de photo en
// compte autant, ADR-0008) : la liste se fenetre comme « Par couleur ». Ces tests gardent ce qu'on ne doit pas perdre
// en la fenetrant : peu de lignes dans la page, mais toutes atteignables (defilement, clavier, doigt), chaque geste d'une
// ligne qui marche loin dans la liste, et le DOM d'avant sous le seuil.
//
// Le dessin est fabrique ici, en memoire : deux mille carres de 10 sur 10, chacun d'une couleur qui n'est qu'a lui.
// Toutes les couleurs ont une forme, donc la liste les range par code croissant : la ligne i est la couleur i, celle de
// la forme f(i+1).

import { describe, expect, it } from 'vitest';
import type { Locator, Page } from 'playwright';
import { attend, formesVisibles, modifications, ouvrirCode, pilote, texteDe } from './aide.js';

const N = 2000;
/** Distinctes, de six chiffres, et croissantes : l'ordre de la liste est celui de `i`. */
const couleur = (i: number) => '#' + (0x101010 + i * 0x407).toString(16).padStart(6, '0');
const dessinDe = (n: number) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800">'
  + Array.from({ length: n }, (_, i) => `<path d="M${(i % 50) * 20} ${Math.floor(i / 50) * 20}h10v10h-10z" fill="${couleur(i)}"/>`).join('')
  + '</svg>';
const DESSIN = dessinDe(N);

/** Au-dela de cette taille, la liste n'est plus fenetree : une quarantaine de lignes au plus, pas des milliers. */
const LIGNES_MAX = 60;
/** Plus clair que toute couleur du dessin : une ligne recoloree ainsi passe en derniere position. */
const TRES_CLAIR = '#fffffe';

describe('couleurs du dessin, deux mille couleurs', () => {
  const navigateur = pilote();

  async function editeur(svg = DESSIN, options: { tactile?: boolean; largeur?: number; hauteur?: number } = {}) {
    const { page } = await navigateur.ouvrir(options);
    await ouvrirCode(page, svg, options.tactile);
    if (options.tactile) {
      await page.getByRole('button', { name: 'Inspecteur' }).tap();
      await attend(() => page.locator('.editeur-inspecteur').evaluate(e => getComputedStyle(e).transform)).toBe('none');
    }
    return page;
  }

  const liste = (page: Page) => page.locator('ul.couleurs-dessin');
  /** Les vraies lignes : les cales qui tiennent la place des autres ne comptent pas. */
  const lignes = (page: Page) => page.locator('ul.couleurs-dessin > li:not([data-cale])');
  const defilement = (page: Page) => liste(page).evaluate(u => u.scrollTop);
  const defilerA = (page: Page, haut: number) => liste(page).evaluate((u, h) => { u.scrollTop = h; }, haut);
  const rang = (page: Page, i: number) => page.locator(`ul.couleurs-dessin > li[aria-posinset="${i + 1}"]`);
  /** Les rangs des lignes dessinees (de 1 a N). */
  const rangsDessines = (page: Page) => lignes(page).evaluateAll(l => l.map(e => Number(e.getAttribute('aria-posinset'))));
  /** Fait defiler la liste, puis attend que les lignes dessinees recouvrent la zone visible. */
  const defilerEtAttendre = async (page: Page, haut: number) => {
    await defilerA(page, haut);
    await attend(() => liste(page).evaluate(u => {
      const z = u.getBoundingClientRect();
      return Array.from(u.querySelectorAll(':scope > li:not([data-cale])')).some(e => { const r = e.getBoundingClientRect(); return r.bottom > z.top && r.top < z.bottom; });
    })).toBe(true);
  };
  /** Une ligne entierement visible vers le milieu de la zone : son index (de 0). */
  const ligneVisible = (page: Page) => liste(page).evaluate(u => {
    const z = u.getBoundingClientRect();
    const l = Array.from(u.querySelectorAll(':scope > li:not([data-cale])')).find(e => { const r = e.getBoundingClientRect(); return r.top > z.top + 60 && r.bottom < z.bottom - 10; });
    return l ? Number(l.getAttribute('aria-posinset')) - 1 : -1;
  });
  const peinture = (page: Page, id: string) => page.locator(`.editeur-svg-toile path[data-id="${id}"]`).getAttribute('fill');
  /** Ou est le focus : le rang de la ligne qui le porte (0 s'il est ailleurs), et si le controle focalise tient dans la liste. */
  const foyer = (page: Page) => page.evaluate(() => {
    const e = document.activeElement, li = e?.closest('ul.couleurs-dessin > li'), u = document.querySelector('ul.couleurs-dessin');
    if (!e || !li || !u) return { rang: 0, dedans: false, haut: 0 };
    const a = e.getBoundingClientRect(), z = u.getBoundingClientRect();
    return { rang: Number(li.getAttribute('aria-posinset')), dedans: a.top >= z.top - 1 && a.bottom <= z.bottom + 1, haut: u.scrollTop };
  });
  const champ = (ligne: Locator) => ligne.locator('input[type=color]');

  it('ne dessine qu’une poignee de lignes, et dit leur place aux lecteurs d’ecran', async () => {
    const page = await editeur();
    expect(await formesVisibles(page)).toBe(N);
    expect(await texteDe(page.locator('details.section:not(.section-nuancier)', { hasText: 'Couleurs du dessin' }).locator('summary').first())).toContain(String(N));
    const n = await lignes(page).count();
    expect(n).toBeGreaterThan(8);
    expect(n).toBeLessThan(LIGNES_MAX);
    expect(await lignes(page).first().getAttribute('aria-setsize')).toBe(String(N));
    expect(await rangsDessines(page)).toEqual(Array.from({ length: n }, (_, k) => k + 1));
    // Les noms accessibles sont ceux d'avant.
    await page.locator(`ul.couleurs-dessin input[aria-label="Remplacer ${couleur(0)}"]`).waitFor();
    await page.locator(`ul.couleurs-dessin button[aria-haspopup=menu][aria-label="Remplacer ${couleur(0)} par une couleur du nuancier"]`).waitFor();
    expect(await texteDe(lignes(page).first().locator('button.discret'))).toBe(`${couleur(0).toUpperCase()} · 1`);
    // La liste garde sa hauteur de 260 px au plus et defile : elle ne s'etire pas pour deux mille lignes.
    expect(await liste(page).evaluate(u => u.clientHeight)).toBeLessThanOrEqual(260);
    expect(await liste(page).evaluate(u => u.scrollHeight)).toBeGreaterThan(N * 26);
    // Peu de noeuds : la page entiere reste loin des quatorze mille noeuds de la liste complete.
    expect(await page.evaluate(() => document.querySelectorAll('.editeur-inspecteur *').length)).toBeLessThan(2500);
  });

  it('atteint la derniere couleur au defilement, et revient a la premiere', async () => {
    const page = await editeur();
    await liste(page).evaluate(u => { u.scrollTop = u.scrollHeight; });
    await attend(() => rang(page, N - 1).count()).toBe(1);
    expect(await texteDe(rang(page, N - 1).locator('button.discret'))).toBe(`${couleur(N - 1).toUpperCase()} · 1`);
    expect(await lignes(page).count()).toBeLessThan(LIGNES_MAX);
    // La derniere ligne est entierement visible, collee au bas de la liste : pas de vide sous elle.
    const [bas, fond] = await Promise.all([rang(page, N - 1).evaluate(e => e.getBoundingClientRect().bottom), liste(page).evaluate(u => u.getBoundingClientRect().bottom)]);
    expect(Math.abs(bas - fond)).toBeLessThan(3);

    await defilerA(page, 0);
    await attend(() => rang(page, 0).count()).toBe(1);
    expect(await texteDe(rang(page, 0).locator('button.discret'))).toContain(couleur(0).toUpperCase());
  });

  it('defile sans trou : chaque position montre des lignes contigues qui couvrent la zone', async () => {
    const page = await editeur();
    for (const haut of [0, 333, 1234, 20000, 31337, 60000]) {
      await defilerA(page, haut);
      await attend(async () => {
        const [rangs, zone] = await Promise.all([rangsDessines(page), liste(page).evaluate(u => ({ h: u.clientHeight, d: u.scrollTop, total: u.scrollHeight }))]);
        const contigus = rangs.every((r, k) => k === 0 || r === (rangs[k - 1] ?? 0) + 1);
        // Le pas se lit sur la liste : sa hauteur totale sur le nombre de lignes.
        const pas = zone.total / N;
        const premiere = (rangs[0] ?? 1) - 1, derniere = rangs[rangs.length - 1] ?? 0;
        return contigus && rangs.length < LIGNES_MAX && premiere * pas <= zone.d + 1 && derniere * pas >= Math.min(zone.d + zone.h, zone.total) - pas;
      }).toBe(true);
    }
  });

  it('remplace une couleur loin dans la liste : tout un geste de selecteur est une seule entree d’historique', async () => {
    const page = await editeur();
    await defilerEtAttendre(page, 30000);
    const i = await ligneVisible(page);
    expect(i).toBeGreaterThan(500);
    const haut = await defilement(page);
    // Le selecteur natif envoie une valeur a chaque mouvement du curseur ; on en envoie trois, assez proches pour que la
    // ligne garde son rang (`fill` ramene le champ a l'ecran, ce que le doigt n'a pas a faire).
    const entree = await champ(rang(page, i)).elementHandle();
    if (!entree) throw new Error('pas de selecteur');
    const voisine = (k: number) => '#' + (0x101010 + i * 0x407 + k).toString(16);
    for (const k of [1, 2, 3]) await entree.fill(voisine(k));
    await attend(() => peinture(page, 'f' + (i + 1))).toBe(voisine(3));
    expect(await modifications(page)).toBe(1);
    // Rien d'autre n'a bouge, et la liste est restee ou elle etait.
    expect(await peinture(page, 'f' + i)).toBe(couleur(i - 1));
    expect(await peinture(page, 'f' + (i + 2))).toBe(couleur(i + 1));
    expect(Math.abs((await defilement(page)) - haut)).toBeLessThan(60);

    await entree.evaluate(e => (e as HTMLInputElement).blur());
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('Control+z');
    await attend(() => peinture(page, 'f' + (i + 1))).toBe(couleur(i));
    await attend(() => modifications(page)).toBe(0);
  });

  it('garde montree la ligne qu’on recolore quand son rang la ferait sortir de la fenetre', async () => {
    const page = await editeur();
    // La premiere couleur devient la plus claire : elle passe de la premiere place a la derniere, a deux mille lignes de la fenetre.
    const entree = await champ(rang(page, 0)).elementHandle();
    if (!entree) throw new Error('pas de selecteur');
    await entree.evaluate(e => { e.dataset['marque'] = 'oui'; });
    // `fill` focalise le champ puis y met la valeur ; le focus y reste, comme sous un selecteur natif ouvert.
    await entree.fill('#aaaaaa');
    await entree.fill(TRES_CLAIR);
    await attend(() => peinture(page, 'f1')).toBe(TRES_CLAIR);
    await attend(() => rang(page, N - 1).count()).toBe(1);
    // C'est le meme selecteur, toujours dans la page, toujours focalise : un selecteur natif ouvert ne se ferme pas.
    expect(await entree.evaluate(e => e.isConnected && e === document.activeElement)).toBe(true);
    expect(await page.locator('ul.couleurs-dessin input[data-marque]').count()).toBe(1);
    expect(await rang(page, N - 1).locator('input[data-marque]').count()).toBe(1);
    // Epinglee, pas ajoutee : la fenetre garde sa taille, plus une ligne.
    expect(await lignes(page).count()).toBeLessThan(LIGNES_MAX + 1);
    expect(await modifications(page)).toBe(1);
    // La ligne epinglee est a sa place, tout en bas : la liste garde sa hauteur de deux mille lignes.
    expect(await liste(page).evaluate(u => u.scrollHeight)).toBeGreaterThan(N * 26);

    // Le geste fini, la ligne rejoint son rang : plus rien ne la retient hors de la fenetre.
    await entree.evaluate(e => (e as HTMLInputElement).blur());
    await attend(() => rang(page, N - 1).count()).toBe(0);
    expect(await page.locator('ul.couleurs-dessin input[data-marque]').count()).toBe(0);
    expect(await modifications(page)).toBe(1);
    // Et on la retrouve au bout de la liste.
    await liste(page).evaluate(u => { u.scrollTop = u.scrollHeight; });
    await attend(() => rang(page, N - 1).count()).toBe(1);
    expect(await texteDe(rang(page, N - 1).locator('button.discret'))).toBe(`${TRES_CLAIR.toUpperCase()} · 1`);
  });

  it('choisit les formes d’une couleur loin dans la liste', async () => {
    const page = await editeur();
    await defilerEtAttendre(page, 45000);
    const i = await ligneVisible(page);
    expect(i).toBeGreaterThan(800);
    await rang(page, i).locator('button.discret').click();
    await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
    expect(await page.locator('.editeur-calques ol > li.choisi').count()).toBe(1);
    expect(await page.locator(`.editeur-svg-toile path[data-id="f${i + 1}"]`).count()).toBe(1);
    // Echap deselectionne : le panneau revient, avec sa liste fenetree.
    await page.keyboard.press('Escape');
    await attend(() => lignes(page).count()).toBeGreaterThan(8);
    expect(await lignes(page).count()).toBeLessThan(LIGNES_MAX);
  });

  it('remplace une couleur loin dans la liste par une teinte du nuancier, en une entree d’historique', async () => {
    const page = await editeur();
    await defilerEtAttendre(page, 52000);
    const i = await ligneVisible(page);
    expect(i).toBeGreaterThan(900);
    const choix = rang(page, i).locator('button[aria-haspopup=menu]');
    await choix.click();
    // Le menu montre chaque teinte par une pastille et son nom ; on prend la premiere.
    const premiere = page.getByRole('menu').getByRole('menuitem').first();
    const teinte = /#[0-9a-f]{6}/i.exec(await premiere.innerText())?.[0].toLowerCase();
    if (!teinte) throw new Error('le nuancier de la page est vide');
    expect(await premiere.locator('.menu-pastille').count()).toBe(1);
    await premiere.click();
    await attend(async () => (await peinture(page, 'f' + (i + 1)))?.toLowerCase()).toBe(teinte);
    expect(await modifications(page)).toBe(1);
    expect(await peinture(page, 'f' + i)).toBe(couleur(i - 1));
    // Un menu d'actions, pas un etat : il se referme une fois la teinte posee.
    await attend(() => page.getByRole('menu').count()).toBe(0);
  });

  it('se parcourt au clavier : Tab traverse la marge de la fenetre sans perdre le focus ni faire reculer la liste', async () => {
    const page = await editeur();
    await champ(lignes(page).first()).focus();
    expect(await foyer(page)).toMatchObject({ rang: 1, dedans: true });
    const depart = await rangsDessines(page);
    let precedent = 0, atteint = 0;
    // Trois arrets par ligne (selecteur, bouton, menu du nuancier) : cent trente Tab franchissent la marge de douze lignes.
    for (let k = 0; k < 400 && atteint < 45; k++) {
      await page.keyboard.press('Tab');
      const f = await foyer(page);
      expect(f.rang, `apres ${k + 1} Tab, le focus est sorti de la liste`).toBeGreaterThan(0);
      expect(f.dedans, `apres ${k + 1} Tab, le controle focalise est hors de la zone visible`).toBe(true);
      expect(f.haut, `apres ${k + 1} Tab, la liste est revenue en arriere`).toBeGreaterThanOrEqual(precedent);
      precedent = f.haut; atteint = f.rang;
    }
    expect(atteint).toBeGreaterThanOrEqual(45);
    expect(Math.max(...depart)).toBeLessThan(45);
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

  it('au doigt : lignes de 40 px au moins, fenetre juste malgre le pas plus grand, derniere ligne atteignable', async () => {
    const page = await editeur(DESSIN, { tactile: true, largeur: 420, hauteur: 860 });
    await attend(() => lignes(page).count()).toBeGreaterThan(5);
    expect(await lignes(page).count()).toBeLessThan(LIGNES_MAX);

    const petites = () => page.locator('ul.couleurs-dessin > li:not([data-cale]) button:visible, ul.couleurs-dessin > li:not([data-cale]) input:visible').evaluateAll(
      l => l.map(e => { const r = e.getBoundingClientRect(); return { nom: (e.getAttribute('aria-label') ?? (e as HTMLElement).innerText).slice(0, 30), l: Math.round(r.width), h: Math.round(r.height) }; }).filter(c => c.l < 40 || c.h < 40)
    );
    expect(await petites()).toEqual([]);
    expect(await lignes(page).first().evaluate(e => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(40);

    // Le pas depasse 44 px : la fenetre se cale sur le pas mesure, sans trou au milieu de la liste.
    await defilerA(page, 30000);
    await attend(async () => {
      const [rangs, zone] = await Promise.all([rangsDessines(page), liste(page).evaluate(u => ({ h: u.clientHeight, d: u.scrollTop, total: u.scrollHeight }))]);
      const pas = zone.total / N;
      return rangs.length > 5 && rangs.length < LIGNES_MAX && ((rangs[0] ?? 1) - 1) * pas <= zone.d + 1 && (rangs[rangs.length - 1] ?? 0) * pas >= zone.d + zone.h - pas;
    }).toBe(true);
    expect(await petites()).toEqual([]);

    await liste(page).evaluate(u => { u.scrollTop = u.scrollHeight; });
    await attend(() => rang(page, N - 1).count()).toBe(1);
    await rang(page, N - 1).locator('button.discret').tap();
    await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
    expect(await page.locator(`.editeur-svg-toile path[data-id="f${N}"]`).count()).toBe(1);
  });

  describe('sous le seuil, la liste est celle d’avant', () => {
    for (const n of [30, 100]) {
      it(`${n} couleurs : toutes les lignes, sans cale ni rang annonce, sans hauteur maximale`, async () => {
        const page = await editeur(dessinDe(n));
        await attend(() => lignes(page).count()).toBe(n);
        expect(await page.locator('ul.couleurs-dessin > li').count()).toBe(n);
        expect(await page.locator('ul.couleurs-dessin > li[aria-posinset], ul.couleurs-dessin > li[aria-setsize], ul.couleurs-dessin > li[style]').count()).toBe(0);
        expect(await liste(page).getAttribute('class')).toBe('couleurs-dessin');
        expect(await liste(page).evaluate(u => getComputedStyle(u).overflowY)).toBe('visible');
        await page.locator(`ul.couleurs-dessin input[aria-label="Remplacer ${couleur(n - 1)}"]`).waitFor();
        expect(await texteDe(lignes(page).last().locator('button.discret'))).toBe(`${couleur(n - 1).toUpperCase()} · 1`);
      });
    }

    it('101 couleurs : la liste se fenetre', async () => {
      const page = await editeur(dessinDe(101));
      await attend(() => lignes(page).first().getAttribute('aria-setsize')).toBe('101');
      expect(await lignes(page).count()).toBeLessThan(101);
    });
  });
});

// La recherche de la bibliotheque (ADR-0003, model/recherche.ts) dans la page : ce que trouvent les mots qu'on tape
// (« sapin », « anniversaire », « Noël »), l'ordre des formes, l'etat vide qui propose quoi faire, les pastilles
// d'evenements au clavier et au doigt, des vignettes de hauteur reguliere, et axe-core sans rien a redire.

import { describe, expect, it } from 'vitest';
import type { Locator, Page } from 'playwright';
import { aLeFocus, attend, attendreAnimations, choisirEvenement, pilote, RACINE_DEPOT, surToutLaHauteur, texteDe } from './aide.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CHARGEMENT = 60_000;
const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

/** « 4134 formes » ou « 76 formes sur 4134 » : [affichees, total]. */
async function decompte(page: Page): Promise<[number, number]> {
  const t = await texteDe(page.locator('.bibliotheque .aide[aria-live]'));
  const m = /^(\d+) formes?(?: sur (\d+))?/.exec(t);
  if (!m) throw new Error('décompte illisible : ' + t);
  return [Number(m[1]), m[2] ? Number(m[2]) : Number(m[1])];
}

/** Les noms des premieres vignettes, dans l'ordre. */
const premiers = (page: Page, n: number) => page.locator('.bibliotheque .vignette > span').evaluateAll((l, k) => l.slice(0, k).map(e => (e as HTMLElement).textContent ?? ''), n);

/** axe-core sur la page : aucune violation, de quelque gravite que ce soit, et aucun doute laisse « a relire ». */
async function auditer(page: Page): Promise<string[]> {
  return surToutLaHauteur(page, async () => {
    await attendreAnimations(page);
    await page.addScriptTag({ content: AXE });
    return page.evaluate(async () => {
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: unknown[] }> }>; incomplete: Array<{ id: string; nodes: Array<{ target: unknown[] }> }> }> } };
      const r = await w.axe.run(document, { resultTypes: ['violations', 'incomplete'] });
      const dire = (genre: string) => (v: { id: string; nodes: Array<{ target: unknown[] }> }) => genre + ' ' + v.id + ' ' + JSON.stringify(v.nodes.slice(0, 3).map(n => n.target));
      return [...r.violations.map(dire('violation')), ...r.incomplete.map(dire('à relire'))];
    });
  });
}

describe('recherche dans la bibliotheque', () => {
  const navigateur = pilote();

  async function bibliotheque(options: Parameters<typeof navigateur.ouvrir>[0] = {}) {
    const { page } = await navigateur.ouvrir(options);
    const tap = options.tactile === true;
    const onglet = page.getByRole('tab', { name: /^Bibliothèque/ }), charger = page.getByRole('button', { name: /Charger la bibliothèque/ });
    if (tap) { await onglet.tap(); await charger.tap(); } else { await onglet.click(); await charger.click(); }
    await page.locator('.bibliotheque .vignette').first().waitFor({ timeout: CHARGEMENT });
    return page;
  }
  const champ = (page: Page) => page.locator('.bibliotheque input[type=search]');
  async function chercher(page: Page, texte: string, avant?: [number, number]) {
    await champ(page).fill(texte);
    if (avant) await attend(() => decompte(page)).not.toEqual(avant);
  }

  it('trouve « sapin », « anniversaire » et « Noël », et sans accent', async () => {
    const page = await bibliotheque();
    const [tout, total] = await decompte(page);
    expect(tout).toBe(total);

    await chercher(page, 'sapin', [tout, total]);
    expect((await decompte(page))[0]).toBeGreaterThanOrEqual(10);
    expect((await premiers(page, 1))[0]).toBe('pin');
    // Le synonyme renvoie a l'evenement : un clic y mene, le texte efface.
    await page.getByRole('button', { name: /^Voir l’événement Noël \(\d+\)$/ }).click();
    await attend(() => champ(page).inputValue()).toBe('');
    expect(await page.locator('.bibliotheque').getByRole('button', { name: 'Noël', exact: true }).getAttribute('aria-pressed')).toBe('true');
    expect((await premiers(page, 3))).toEqual(['bonnet de père noël', 'bonhomme de neige', 'pin']);
    await choisirEvenement(page.locator('.bibliotheque'), 'Tous');

    await chercher(page, 'anniversaire', await decompte(page));
    expect((await decompte(page))[0]).toBeGreaterThanOrEqual(90);
    expect(await premiers(page, 3)).toEqual(expect.arrayContaining(['part de gâteau', 'pièce montée']));

    await chercher(page, 'Noël', await decompte(page));
    const noel = (await decompte(page))[0];
    expect(noel).toBeGreaterThanOrEqual(40);
    expect((await premiers(page, 1))[0]).toBe('bonnet de père noël');
    await chercher(page, 'noel');
    await attend(async () => (await decompte(page))[0]).toBe(noel);
    await chercher(page, 'chats', await decompte(page));
    expect((await premiers(page, 1))[0]).toBe('chat');
  });

  it('chaque exemple du champ trouve au moins trois formes', async () => {
    const page = await bibliotheque();
    const indication = (await champ(page).getAttribute('placeholder')) ?? '';
    const exemples = indication.replace(/^Chercher : /, '').replace(/…$/, '').split(', ').filter(Boolean);
    expect(exemples.length).toBeGreaterThanOrEqual(3);
    for (const ex of exemples) {
      await chercher(page, ex);
      await attend(async () => (await decompte(page))[0], 5_000).toBeGreaterThanOrEqual(3);
    }
  });

  it('dit qu il n y a rien, propose ce qui trouvera, et efface la recherche', async () => {
    const page = await bibliotheque();
    const total = (await decompte(page))[1];
    await chercher(page, 'xyzzy');
    const vide = page.locator('.bibliotheque .aucun-resultat');
    await vide.waitFor();
    expect(await texteDe(vide.locator('.aucun-resultat-titre'))).toBe('Aucune forme ne correspond à « xyzzy ».');
    expect(await vide.getByRole('button', { name: /^Essayez l’événement .+ \(\d+\)$/ }).count()).toBeGreaterThanOrEqual(2);
    expect(await auditer(page)).toEqual([]);

    // Une faute de frappe se corrige d'un clic ; le focus revient au champ.
    await chercher(page, 'guitarre');
    await vide.getByRole('button', { name: 'Chercher « guitare » (2)' }).click();
    await attend(() => decompte(page)).toEqual([2, total]);
    expect(await aLeFocus(champ(page))).toBe(true);

    // Dans un evenement : la meme recherche partout, puis un evenement propose.
    await choisirEvenement(page.locator('.bibliotheque'), 'Noël');
    await chercher(page, 'lapin');
    await vide.getByRole('button', { name: /^Chercher dans tous les événements \(\d+\)$/ }).click();
    await attend(async () => (await decompte(page))[0]).toBeGreaterThan(0);
    expect(await page.locator('.bibliotheque').getByRole('button', { name: 'Tous', exact: true }).getAttribute('aria-pressed')).toBe('true');

    await chercher(page, 'xyzzy');
    await vide.getByRole('button', { name: 'Effacer la recherche' }).click();
    await attend(() => decompte(page)).toEqual([total, total]);
    expect(await aLeFocus(champ(page))).toBe(true);
  });

  it('se filtre par pastilles au clavier : fleches, Entree, « Plus d evenements »', async () => {
    const page = await bibliotheque();
    const groupe = page.locator('.bibliotheque').getByRole('group', { name: 'Événement' });
    const tous = groupe.getByRole('button', { name: 'Tous', exact: true });
    expect(await tous.getAttribute('aria-pressed')).toBe('true');
    // Repliees, peu de pastilles : « Tous », les evenements qui arrivent, et de quoi deplier.
    expect(await groupe.locator('button.pastille-evenement').count()).toBeLessThanOrEqual(8);

    // Entre le champ et les evenements, les pastilles de source et de nature (une dizaine) : Tab les traverse dans l'ordre.
    await champ(page).focus();
    for (let i = 0; i < 12 && !(await aLeFocus(tous)); i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('.bibliotheque'))).toBe(true);
    }
    expect(await aLeFocus(tous)).toBe(true);
    await page.keyboard.press('ArrowRight');
    const seconde = groupe.locator('button.pastille-evenement').nth(1);
    expect(await aLeFocus(seconde)).toBe(true);
    const nom = await seconde.innerText();
    await page.keyboard.press('Enter');
    await attend(() => seconde.getAttribute('aria-pressed')).toBe('true');
    expect(await tous.getAttribute('aria-pressed')).toBe('false');
    expect((await decompte(page))[0]).toBeGreaterThanOrEqual(10);
    await page.keyboard.press('Home');
    expect(await aLeFocus(tous)).toBe(true);
    await page.keyboard.press('Space');
    await attend(() => tous.getAttribute('aria-pressed')).toBe('true');

    const plus = groupe.getByRole('button', { name: /^Plus d’événements \(45\)$/ });
    await plus.focus();
    await page.keyboard.press('Enter');
    const moins = groupe.getByRole('button', { name: 'Moins d’événements' });
    await attend(() => moins.getAttribute('aria-expanded')).toBe('true');
    expect(await groupe.locator('button.pastille-evenement').count()).toBe(46);
    for (const famille of ['Calendrier', 'Événements de la vie', 'Catégories']) expect(await groupe.getByRole('group', { name: famille }).count()).toBe(1);
    expect(nom.length).toBeGreaterThan(0);
    await choisirEvenement(page.locator('.bibliotheque'), 'Anniversaire');
    expect((await premiers(page, 2))).toEqual(['part de gâteau', 'pièce montée']);
    expect(await auditer(page)).toEqual([]);
  });

  it('donne a chaque vignette la meme hauteur, le nom complet et sa source en nom accessible et en infobulle', async () => {
    const page = await bibliotheque({ largeur: 1280, hauteur: 800 });
    await chercher(page, 'arbre');
    await attend(async () => (await decompte(page))[0]).toBeGreaterThan(8);
    const mesures = await page.locator('.bibliotheque .vignette').evaluateAll(l => l.map(e => ({ h: Math.round(e.getBoundingClientRect().height), titre: e.getAttribute('title'), texte: (e.textContent ?? '').trim() })));
    expect(new Set(mesures.map(m => m.h)).size).toBe(1);
    for (const m of mesures) expect(m.titre).toBe(m.texte + ' (game-icons)');
    // Un nom long reste entier dans le nom accessible, meme coupe a l'ecran, suivi de sa source.
    const long = page.locator('.bibliotheque').getByRole('button', { name: 'cabane dans un arbre (game-icons)', exact: true });
    expect(await long.count()).toBe(1);
  });

  it('au doigt (390 px) : une ligne de pastilles qui defile, des cibles de 40 px, rien ne deborde, axe sans remarque', async () => {
    const page = await bibliotheque({ largeur: 390, hauteur: 800, tactile: true });
    const rangee = page.locator('.bibliotheque .pastilles-evenements > .pastilles');
    const forme = await rangee.evaluate(e => ({ h: e.getBoundingClientRect().height, defile: e.scrollWidth > e.clientWidth }));
    expect(forme.defile).toBe(true);
    expect(forme.h).toBeLessThan(60);
    const petites = await page.locator('.bibliotheque button.pastille-evenement, .bibliotheque .pastilles-plus').evaluateAll(l => l.map(e => e.getBoundingClientRect().height).filter(h => h < 40));
    expect(petites).toEqual([]);
    await page.locator('.bibliotheque').getByRole('button', { name: /^Plus d’événements/ }).tap();
    await choisirEvenement(page.locator('.bibliotheque'), 'Mariage');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(await auditer(page)).toEqual([]);
    await chercher(page, 'xyzzy');
    await page.locator('.bibliotheque .aucun-resultat').waitFor();
    const cibles: Locator = page.locator('.bibliotheque .aucun-resultat button');
    expect(await cibles.evaluateAll(l => l.map(e => e.getBoundingClientRect().height).filter(h => h < 40))).toEqual([]);
    expect(await auditer(page)).toEqual([]);
  });
});

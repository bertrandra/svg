// Le texte pose sur ou dans une forme (ADR-0031), par la vraie page : depuis la barre de texte (« Sur la forme » puis un clic sur
// le cercle, « Dans la forme » puis un clic sur le cœur, puis « En lignes » dans le panneau, ADR-0032) et depuis le menu de la selection ; la poignee de depart glissee a la souris
// et reglee au clavier ; la forme deplacee ou agrandie, le texte qui suit ; la forme supprimee, le texte libre ; la saisie sur la
// toile d'un texte pose ; le trace Median ; le fichier (des contours seulement) ; tout au clavier ; axe-core en clair et en sombre ;
// 390 px au doigt.

import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Download, Page } from 'playwright';
import { aLeFocus, attend, boutonTelecharger, modifications, ouvrirCode, pilote, RACINE_DEPOT, texteDe } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
/** Les captures du rapport (1280 et 390 px, clair et sombre), quand CAPTURES le demande. */
const CAPTURES = process.env['CAPTURES'] ?? '';

// Un cercle (f1) et un cœur (f2), loin du coin haut gauche ou l'on tape le texte (f3).
const COEUR = 'M300 110C300 80 255 60 240 95C225 130 270 170 300 200C330 170 375 130 360 95C345 60 300 80 300 110Z';
const PLAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<circle cx="120" cy="160" r="70" fill="#f2c94c"/><path d="' + COEUR + '" fill="#eb5757"/></svg>';

describe('le texte sur et dans une forme', () => {
  const navigateur = pilote();
  const barre = (page: Page) => page.getByRole('toolbar', { name: 'Texte' });
  const dit = (page: Page) => page.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim());
  const message = (page: Page) => texteDe(page.locator('.message-etat'));
  const disposition = (page: Page, nom: 'Libre' | 'Sur la forme' | 'Dans la forme') => barre(page).getByRole('group', { name: 'Disposition' }).locator('button[aria-label^="' + nom + '"]');

  async function boite(page: Page, id: string) {
    const r = await page.locator('.editeur-svg-toile path[data-id="' + id + '"]').boundingBox();
    if (!r) throw new Error('forme ' + id + ' introuvable');
    return r;
  }
  const centre = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

  /** Un point du plan de travail a l'ecran, en unites du plan (400 x 300). */
  async function surPlan(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
    const r = await page.locator('.editeur-svg-toile .plan-travail').boundingBox();
    if (!r) throw new Error('plan de travail introuvable');
    return { x: r.x + (r.width * x) / 400, y: r.y + (r.height * y) / 300 };
  }

  /** L'editeur sur le cercle et le cœur, un texte tape en haut a gauche et choisi (f3). */
  async function avecTexte(page: Page, texte = 'BONNE FÊTE', tactile = false): Promise<void> {
    await ouvrirCode(page, PLAN, tactile);
    if (tactile) await page.locator('.editeur-barre button[title^="Texte (T)"]').tap(); else await page.keyboard.press('t');
    const p = await surPlan(page, 20, 30);
    if (tactile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    await attend(() => aLeFocus(page.locator('textarea.saisie-champ'))).toBe(true);
    await page.keyboard.type(texte);
    await attend(() => page.locator('.editeur-svg-toile path[data-id="f3"]').count()).toBe(1);
    await page.keyboard.press('Escape');
    await attend(() => page.locator('textarea.saisie-champ').count()).toBe(0);
    await attend(() => disposition(page, 'Libre').count()).toBe(tactile ? 0 : 1);
  }

  /** « Sur la forme » (ou « Dans la forme ») dans la barre, puis un clic sur la forme : rend ce que dit l'editeur. */
  async function poser(page: Page, nom: 'Sur la forme' | 'Dans la forme', x: number, y: number): Promise<void> {
    await disposition(page, nom).click();
    await attend(() => message(page)).toMatch(/^Cliquez la forme/);
    await attend(() => page.locator('.editeur-toile[data-choix-forme]').count()).toBe(1);
    const p = await surPlan(page, x, y);
    await page.mouse.click(p.x, p.y);
    await attend(() => page.locator('.editeur-toile[data-choix-forme]').count()).toBe(0);
  }

  async function capture(page: Page, nom: string): Promise<void> {
    if (!CAPTURES) return;
    mkdirSync(CAPTURES, { recursive: true });
    await page.screenshot({ path: resolve(CAPTURES, nom + '.png') });
  }

  async function auditAxe(page: Page): Promise<string[]> {
    await page.addScriptTag({ content: AXE });
    return page.evaluate(async () => {
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: unknown[] }> }> }> } };
      return (await w.axe.run(document, { resultTypes: ['violations'] })).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)));
    });
  }

  it('pose un texte sur le cercle depuis la barre : il en suit le contour, centre en haut, et c est dit', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await avecTexte(page);
    const avant = await modifications(page);
    await poser(page, 'Sur la forme', 120, 160);
    await attend(() => dit(page)).toMatch(/^Texte posé sur cercle 1 : il suit son tracé\./);
    expect(await modifications(page)).toBe(avant + 1);
    // Les lettres entourent le haut du cercle : la boite du texte est centree sur lui et monte au-dessus.
    const t = await boite(page, 'f3'), c = await boite(page, 'f1');
    expect(Math.abs(centre(t).x - centre(c).x)).toBeLessThan(6);
    expect(t.y).toBeLessThan(c.y);
    expect(t.y + t.height).toBeGreaterThan(c.y + 10);
    expect(await disposition(page, 'Sur la forme').getAttribute('aria-pressed')).toBe('true');
    // Le guide de la forme et la poignee de depart.
    expect(await page.locator('.guide-disposition .guide-forme').count()).toBe(1);
    expect(await page.getByRole('slider', { name: 'Départ du texte sur la forme' }).count()).toBe(1);
    expect(await page.locator('.editeur-svg-toile text, .editeur-svg-toile textPath').count()).toBe(0);
    await capture(page, 'sur-cercle-1280-clair');
  });

  it('remplit le cœur en lignes (« Dans la forme », puis « Remplir : En lignes » dans le panneau) : coupe sur ses bords ; ce qui ne tient pas se dit', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await avecTexte(page, 'Avec tout mon amour pour toi');
    await poser(page, 'Dans la forme', 300, 140);
    // « Dans la forme » deforme le texte (ADR-0032) ; le remplissage en lignes est un choix du panneau.
    await attend(() => dit(page)).toMatch(/^Texte déformé dans tracé courbe 2 : il en prend la silhouette\./);
    await page.getByRole('button', { name: 'Plus d’options' }).click();
    await page.locator('.editeur-inspecteur .disposition-texte').getByRole('group', { name: 'Remplir' }).getByRole('button', { name: 'En lignes' }).click();
    // A la taille du texte deforme (toute la hauteur du cœur), aucun mot ne tient : la taille s'ajuste d'elle-meme, et c'est dit.
    await attend(() => dit(page)).toMatch(/^Le texte remplit la forme en lignes, ses lettres droites\. Ctrl\+Z annule\. Aucun mot ne tenait à cette taille/);
    const t = await boite(page, 'f3'), c = await boite(page, 'f2');
    expect(t.x).toBeGreaterThanOrEqual(c.x - 1);
    expect(t.x + t.width).toBeLessThanOrEqual(c.x + c.width + 1);
    expect(t.y).toBeGreaterThanOrEqual(c.y - 1);
    expect(t.y + t.height).toBeLessThanOrEqual(c.y + c.height + 1);
    await capture(page, 'dans-coeur-1280-clair');
    // Sans « Ajuster la taille », une taille plus grande ne tient plus : le panneau et la region vocale le disent.
    const panneau = page.locator('.editeur-inspecteur .disposition-texte');
    await panneau.waitFor();
    const ajuster = panneau.getByLabel('Ajuster la taille pour remplir la forme');
    expect(await ajuster.isChecked()).toBe(true);
    expect(await barre(page).getByRole('group', { name: 'Taille' }).getByLabel('Taille').isDisabled()).toBe(true);
    await ajuster.uncheck();
    const taille = barre(page).getByRole('group', { name: 'Taille' }).getByLabel('Taille');
    await attend(() => taille.isDisabled()).toBe(false);
    await taille.fill('21');
    await taille.press('Enter');
    await attend(() => panneau.locator('.message').count()).toBe(1);
    expect(await texteDe(panneau.locator('.message'))).toMatch(/^\d+ mots? ne tien(nen)?t pas dans la forme\.$/);
    await ajuster.check();
    await attend(() => panneau.locator('.message').count()).toBe(0);
    await attend(() => dit(page)).toBe('Tout le texte tient dans la forme.');
  });

  it('deplace le point de depart a la souris et au clavier, en une modification par geste', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await avecTexte(page, 'SOLEIL');
    await poser(page, 'Sur la forme', 120, 160);
    const poignee = page.getByRole('slider', { name: 'Départ du texte sur la forme' });
    const avant = await modifications(page), t0 = await boite(page, 'f3');
    const debut = await poignee.boundingBox(), droite = await surPlan(page, 190, 160);
    if (!debut) throw new Error('poignee');
    await page.mouse.move(debut.x + debut.width / 2, debut.y + debut.height / 2);
    await page.mouse.down();
    await page.mouse.move(droite.x - 20, droite.y - 40, { steps: 4 });
    await page.mouse.move(droite.x, droite.y, { steps: 4 });
    await page.mouse.up();
    await attend(async () => centre(await boite(page, 'f3')).x).toBeGreaterThan(centre(t0).x + 40);
    expect(Number(await poignee.getAttribute('aria-valuenow'))).toBeCloseTo(25, -1);
    expect(await modifications(page)).toBe(avant + 1);
    await attend(() => dit(page)).toMatch(/^Départ à \d+(,\d)? % du tracé\./);
    // Au clavier : la poignee prend le focus, chaque fleche avance d'un centieme, Debut la ramene a zero.
    await poignee.focus();
    await page.keyboard.press('Home');
    await attend(() => poignee.getAttribute('aria-valuenow')).toBe('0');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await attend(() => poignee.getAttribute('aria-valuenow')).toBe('2');
    await attend(() => dit(page)).toBe('Départ à 2 % du tracé.');
  });

  it('suit sa forme : deplacer ou agrandir le cercle recompose le texte, le supprimer le rend libre', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await avecTexte(page, 'BADGE');
    await poser(page, 'Sur la forme', 120, 160);
    const t0 = await boite(page, 'f3');
    // Un clic au milieu du cercle prend le cercle (le texte se prend par ses lettres), on le tire de 40 unites.
    const m = await surPlan(page, 120, 170), arrivee = await surPlan(page, 160, 170);
    const avant = await modifications(page);
    await page.mouse.move(m.x, m.y);
    await page.mouse.down();
    await page.mouse.move(arrivee.x, arrivee.y, { steps: 6 });
    await page.mouse.up();
    const t1 = await boite(page, 'f3');
    expect(t1.x - t0.x).toBeCloseTo(arrivee.x - m.x, -1);
    expect(await modifications(page)).toBe(avant + 1);
    await capture(page, 'forme-deplacee-1280-clair');
    // Supprimer le cercle (choisi) : le texte redevient libre, en ligne droite, et c'est dit.
    await page.keyboard.press('Delete');
    await attend(() => page.locator('.editeur-svg-toile path[data-id="f1"]').count()).toBe(0);
    await attend(() => dit(page)).toMatch(/n’existe plus : il redevient un texte libre/);
    const t2 = await boite(page, 'f3');
    expect(t2.height).toBeLessThan(t1.height / 2);
    // Ctrl+Z rend la forme et le texte pose.
    await page.keyboard.press('Control+z');
    await attend(() => page.locator('.editeur-svg-toile path[data-id="f1"]').count()).toBe(1);
    await attend(async () => (await boite(page, 'f3')).height).toBeCloseTo(t1.height, 0);
  });

  it('se tape sur la toile : le curseur suit les lettres posees, le texte reste sur le cercle', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await avecTexte(page, 'AMI');
    await poser(page, 'Sur la forme', 120, 160);
    await page.keyboard.press('Enter');
    const champ = page.locator('textarea.saisie-champ');
    await attend(() => aLeFocus(champ)).toBe(true);
    await page.keyboard.type('TIÉ');
    await attend(() => page.locator('.editeur-inspecteur textarea[aria-label="Texte"]').count()).toBeGreaterThanOrEqual(0);
    const c = await boite(page, 'f1'), curseur = await page.locator('.saisie-calque .curseur-saisie').boundingBox();
    if (!curseur) throw new Error('curseur');
    // Le curseur est sur le pourtour du cercle (a droite du sommet : apres AMITIÉ centre), pas sur une ligne droite.
    expect(curseur.x).toBeGreaterThan(centre(c).x);
    expect(curseur.y).toBeLessThan(c.y + c.height / 2);
    const t = await boite(page, 'f3');
    expect(Math.abs(centre(t).x - centre(c).x)).toBeLessThan(16);
    await capture(page, 'saisie-sur-cercle-1280-clair');
    await page.keyboard.press('Escape');
    await attend(() => dit(page)).toMatch(/^Texte modifié : « AMITIÉ »/);
  });

  it('passe en trace Median sur la forme, et le fichier ne porte que des contours et ses donnees d edition', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await avecTexte(page, 'MERCI');
    await poser(page, 'Sur la forme', 120, 160);
    const t0 = await boite(page, 'f3');
    await barre(page).getByRole('button', { name: 'Médian' }).click();
    await attend(() => page.locator('.editeur-svg-toile path[data-id="f3"]').getAttribute('fill')).toBe('none');
    const t1 = await boite(page, 'f3');
    expect(Math.abs(centre(t1).x - centre(t0).x)).toBeLessThan(6);
    const [t]: [Download, void] = await Promise.all([page.waitForEvent('download'), boutonTelecharger(page).click()]);
    const svg = readFileSync(await t.path(), 'utf8');
    expect(svg).not.toMatch(/<text|textPath|font-family/);
    expect(svg).toMatch(/<path d="M[^"]+" fill="none" stroke="[^"]+" stroke-width="[^"]+"[^>]* data-ed-trace="median"[^>]* data-ed-disposition="sur"[^>]* data-ed-forme="1"/);
  });

  it('masque la forme de base : elle ne s ecrit pas, son guide reste, le texte garde son lien dans le fichier', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await avecTexte(page, 'CACHÉ');
    await poser(page, 'Sur la forme', 120, 160);
    await page.getByRole('button', { name: 'Plus d’options' }).click();
    await page.locator('.editeur-inspecteur .disposition-texte').getByLabel('Montrer la forme de base').uncheck();
    await attend(() => dit(page)).toMatch(/^La forme de base est masquée/);
    // Masquee, la forme ne se dessine plus ; son trace se voit en tirets tant que le texte est choisi.
    await attend(() => page.locator('.editeur-svg-toile path[data-id="f1"]').count()).toBe(0);
    expect(await page.locator('.guide-disposition .guide-forme').count()).toBe(1);
    const [t]: [Download, void] = await Promise.all([page.waitForEvent('download'), boutonTelecharger(page).click()]);
    const svg = readFileSync(await t.path(), 'utf8');
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg).toMatch(/data-ed-disposition="sur"[^>]* data-ed-forme-d="M/);
    expect(svg).not.toContain('data-ed-forme="');
  });

  it('se fait tout au clavier : la barre, Tab parmi les formes candidates, Entree ; Echap abandonne', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await avecTexte(page, 'CLAVIER');
    await disposition(page, 'Dans la forme').focus();
    await page.keyboard.press('Enter');
    await attend(() => message(page)).toMatch(/^Cliquez la forme dans laquelle poser le texte/);
    await page.keyboard.press('Escape');
    await attend(() => message(page)).toBe('Choix de la forme annulé : le texte reste tel qu’il était.');
    await disposition(page, 'Sur la forme').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await attend(() => dit(page)).toBe('Forme 1 sur 2 : cercle 1. Entrée pose le texte, Échap annule.');
    expect(await page.locator('.editeur-svg-toile .lisere-choix').count()).toBe(1);
    await page.keyboard.press('Tab');
    await attend(() => dit(page)).toMatch(/^Forme 2 sur 2 : tracé courbe 2\./);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await attend(() => message(page)).toMatch(/^Texte posé sur cercle 1/);
    // Apres le choix, le focus est sur la toile ; le panneau regle le depart au clavier.
    await attend(() => aLeFocus(page.locator('.editeur-svg-toile'))).toBe(true);
    await page.getByRole('button', { name: 'Plus d’options' }).click();
    const champ = page.locator('.editeur-inspecteur .disposition-texte').getByLabel('Départ (%)');
    await champ.fill('50');
    await champ.press('Enter');
    await attend(() => page.getByRole('slider', { name: 'Départ du texte sur la forme' }).getAttribute('aria-valuenow')).toBe('50');
    // A 50 %, le texte est en bas du cercle.
    const t = await boite(page, 'f3'), c = await boite(page, 'f1');
    expect(centre(t).y).toBeGreaterThan(centre(c).y);
  });

  it('se pose aussi depuis le menu de la selection, un texte et une forme choisis ensemble', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await avecTexte(page, 'MENU');
    const c = await surPlan(page, 120, 160);
    await page.keyboard.down('Shift');
    await page.mouse.click(c.x, c.y);
    await page.keyboard.up('Shift');
    const menu = page.getByRole('button', { name: /^Texte et forme/ });
    await menu.click();
    await page.getByRole('menuitem', { name: 'Poser le texte dans la forme' }).click();
    await attend(() => dit(page)).toMatch(/^Texte déformé dans cercle 1/);
  });

  for (const schema of ['light', 'dark'] as const) {
    it('passe axe-core en ' + (schema === 'light' ? 'clair' : 'sombre') + ' : barre, panneau, poignee, et pendant le choix de la forme', async () => {
      const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800, schema });
      await avecTexte(page, 'AXE');
      await poser(page, 'Sur la forme', 120, 160);
      await page.getByRole('button', { name: 'Plus d’options' }).click();
      await page.locator('.editeur-inspecteur .disposition-texte').waitFor();
      expect(await auditAxe(page)).toEqual([]);
      await capture(page, 'panneau-1280-' + (schema === 'light' ? 'clair' : 'sombre'));
      await disposition(page, 'Dans la forme').click();
      expect(await auditAxe(page)).toEqual([]);
    });
  }

  for (const schema of ['light', 'dark'] as const) {
    it('tient a 390 px au doigt (' + (schema === 'light' ? 'clair' : 'sombre') + ') : la disposition dans le menu, aucun defilement, axe-core passe', async () => {
      const { page } = await navigateur.ouvrir({ largeur: 390, hauteur: 844, tactile: true, schema });
      await avecTexte(page, 'DOIGT', true);
      const plus = barre(page).getByRole('button', { name: /^Plus de réglages du texte/ });
      await plus.tap();
      await page.getByRole('menuitemradio', { name: 'Sur la forme' }).tap();
      await attend(() => message(page)).toMatch(/^Touchez la forme/);
      const p = await surPlan(page, 120, 160);
      await page.touchscreen.tap(p.x, p.y);
      await attend(() => dit(page)).toMatch(/^Texte posé sur cercle 1/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const largeurBarre = await barre(page).evaluate(e => e.scrollWidth <= e.clientWidth + 1);
      expect(largeurBarre).toBe(true);
      expect(await auditAxe(page)).toEqual([]);
      await capture(page, 'sur-cercle-390-' + (schema === 'light' ? 'clair' : 'sombre'));
    });
  }
});

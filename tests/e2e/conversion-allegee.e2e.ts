// La voie « Convertir une image » au premier resultat (ADR-0005, ADR-0006) : l'essentiel visible (le resultat, le
// fond, le mode, le grain, « Ouvrir dans l'editeur »), le reste replie (reglages fins, pretraitement) ou range sous
// « Plus de vues » ; le resume dit une seule fois ; des libelles en mots simples ; le tout au clavier, au doigt a
// 390 px, et sans remarque d'axe-core.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import { aLeFocus, attend, attendreAnimations, imageDeTest, pilote, RACINE_DEPOT, texteDe } from './aide.js';

const TRACE = 60_000;
const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

/** axe-core sur la page : aucune violation, de quelque gravite que ce soit, et aucun doute laisse « a relire ». */
async function auditer(page: Page): Promise<string[]> {
  await attendreAnimations(page);
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: unknown[] }> }>; incomplete: Array<{ id: string; nodes: Array<{ target: unknown[] }> }> }> } };
    const r = await w.axe.run(document, { resultTypes: ['violations', 'incomplete'] });
    const dire = (genre: string) => (v: { id: string; nodes: Array<{ target: unknown[] }> }) => genre + ' ' + v.id + ' ' + JSON.stringify(v.nodes.slice(0, 3).map(n => n.target));
    return [...r.violations.map(dire('violation')), ...r.incomplete.map(dire('à relire'))];
  });
}

describe('convertir une image : le premier resultat, allege', () => {
  const navigateur = pilote();

  async function atelier(options: Parameters<typeof navigateur.ouvrir>[0] = {}) {
    const { page } = await navigateur.ouvrir(options);
    const onglet = page.getByRole('tab', { name: /^Convertir une image/ });
    if (options.tactile) await onglet.tap(); else await onglet.click();
    await page.locator('.vectoriser input[type=file]').setInputFiles(imageDeTest());
    await page.locator('.fiche-resultat').waitFor({ timeout: TRACE });
    return page;
  }
  const section = (page: Page, titre: string) => page.locator('.reglages-vecto details.section', { has: page.locator('summary', { hasText: titre }) });

  it('montre l essentiel, replie le reste, et dit le resume une seule fois', async () => {
    const page = await atelier({ largeur: 1280, hauteur: 800 });
    for (const visible of ['Détourer le fond', 'Mode', 'Grain']) expect(await page.getByLabel(visible).first().isVisible(), visible).toBe(true);
    expect(await page.getByRole('button', { name: 'Ouvrir dans l’éditeur' }).isVisible()).toBe(true);
    expect(await page.locator('main button.primaire:visible').count()).toBe(1);
    // Deux vues en boutons, les autres dans le menu.
    expect(await page.locator('.barre-visionneuse .mini-onglets button').allInnerTexts()).toEqual(['Comparer', 'Contours']);
    expect(await page.locator('.barre-visionneuse select, .barre-visionneuse .icone-bouton').count()).toBe(0);
    // Reglages fins et pretraitement replies : aucun curseur visible au premier resultat.
    for (const titre of ['Réglages fins', 'Prétraitement']) expect(await section(page, titre).getAttribute('open'), titre).toBeNull();
    expect(await page.locator('.reglages-vecto input[type=range]:visible').count()).toBe(0);
    expect(await page.getByLabel('Rejouer à chaque changement').isVisible()).toBe(false);
    expect(await page.getByRole('button', { name: 'Rejouer', exact: true }).count()).toBe(0);
    // Le resume, une fois, lu par les lecteurs d'ecran.
    const resume = await texteDe(page.locator('.fiche-resultat [role=status]').first());
    expect(resume).toMatch(/\d+ tracés? vectoriels?/);
    expect((await texteDe(page.locator('.vectoriser'))).split(resume.slice(0, 30)).length - 1).toBe(1);
    // Des mots simples, le choix de forme compris sans jargon.
    expect(await page.getByRole('button', { name: 'Garder l’image telle quelle (dans un SVG)' }).count()).toBe(1);
    expect(await texteDe(page.locator('.vectoriser'))).not.toMatch(/Image enveloppée|Poussières/);
    expect(await auditer(page)).toEqual([]);
  });

  it('se pilote au clavier : le menu « Plus de vues », une section, un curseur', async () => {
    const page = await atelier({ largeur: 1280, hauteur: 800 });
    const menu = page.locator('.barre-visionneuse .vue-plus .menu-bouton');
    await menu.focus();
    await page.keyboard.press('ArrowDown');
    const premier = page.getByRole('menuitemradio', { name: 'Rendu', exact: true });
    await attend(() => aLeFocus(premier)).toBe(true);
    for (const rubrique of ['Vue', 'Zoom', 'Fond du plan']) expect(await page.getByRole('menu', { name: rubrique }).count()).toBe(1);
    expect(await auditer(page)).toEqual([]);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    // La vue choisie (Prétraitée) donne son nom au bouton, et le focus lui revient.
    await attend(() => texteDe(menu)).toBe('Prétraitée');
    expect(await aLeFocus(menu)).toBe(true);
    expect(await page.locator('.visionneuse .calque.base').getAttribute('alt')).toBe('Image prétraitée');

    // La section des reglages fins s'ouvre au clavier ; ses libelles disent l'effet, l'infobulle garde le nom technique.
    const fins = section(page, 'Réglages fins');
    await fins.locator('summary').focus();
    await page.keyboard.press('Enter');
    await attend(() => fins.getAttribute('open')).not.toBeNull();
    const taches = page.locator('.reglages-fins input[aria-label="Ignorer les taches de moins de"]');
    expect(await page.locator('.reglages-fins label.fin', { has: page.locator('input[aria-label="Ignorer les taches de moins de"]') }).getAttribute('title')).toContain('filter_speckle');
    for (const libelle of ['Nombre de couleurs', 'Alléger les courbes', 'Arrondir les coins', 'Nuances distinguées', 'Regrouper les couleurs proches']) expect(await page.getByLabel(libelle, { exact: true }).count(), libelle).toBe(1);
    const resume = await texteDe(page.locator('.fiche-resultat [role=status]').first());
    await taches.focus();
    await page.keyboard.press('ArrowRight');
    await attend(() => texteDe(fins.locator('summary'))).toBe('Réglages fins 1 modifié');
    await attend(() => texteDe(page.locator('.fiche-resultat [role=status]').first()), TRACE).not.toBe(resume);
    expect(await texteDe(page.locator('.fiche-resultat [role=status]').first())).toContain('taches 5');
  });

  it('retient une section ouverte quand elle disparait puis revient', async () => {
    const page = await atelier({ largeur: 1280, hauteur: 800 });
    await section(page, 'Réglages fins').locator('summary').click();
    await attend(() => section(page, 'Réglages fins').getAttribute('open')).not.toBeNull();
    // L'image gardee telle quelle n'a pas de reglages fins ; revenir aux vecteurs les rend, ouverts comme on les avait laisses.
    await page.getByRole('button', { name: 'Garder l’image telle quelle (dans un SVG)' }).click();
    await attend(() => section(page, 'Réglages fins').count()).toBe(0);
    await page.getByRole('button', { name: 'Vecteurs (SVG)' }).click();
    await attend(() => section(page, 'Réglages fins').count()).toBe(1);
    expect(await section(page, 'Réglages fins').getAttribute('open')).not.toBeNull();
  });

  it('au doigt (390 px) : des cibles de 40 px, rien ne deborde, axe sans remarque, sections ouvertes comprises', async () => {
    // Une fenetre haute : axe laisse « a relire » le contraste d'un texte que le bord de la fenetre coupe (il ne fait pas
    // defiler) ; tout l'atelier a l'ecran, l'audit ne depend plus de la place d'un libelle. La largeur, elle, est celle du telephone.
    const page = await atelier({ largeur: 390, hauteur: 2400, tactile: true });
    const petites = () => page.locator('.vectoriser button:visible, .vectoriser select:visible, .vectoriser summary:visible').evaluateAll(l => l
      .map(e => ({ nom: (e.getAttribute('aria-label') ?? (e as HTMLElement).innerText).slice(0, 30), h: Math.round(e.getBoundingClientRect().height) }))
      .filter(c => c.h < 40));
    expect(await petites()).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(await auditer(page)).toEqual([]);
    for (const titre of ['Réglages fins', 'Prétraitement']) await section(page, titre).locator('summary').tap();
    await attend(() => page.locator('.reglages-vecto details.section[open]').count()).toBe(2);
    expect(await petites()).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(await auditer(page)).toEqual([]);
    await page.locator('.barre-visionneuse .vue-plus .menu-bouton').tap();
    await page.getByRole('menu', { name: 'Vue' }).waitFor();
    expect(await page.locator('.menu-panneau [role=menuitemradio]').evaluateAll(l => l.map(e => e.getBoundingClientRect().height).filter(h => h < 40))).toEqual([]);
    expect(await auditer(page)).toEqual([]);
  });
});

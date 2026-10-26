// Les documentations du menu Aide (zones/documentation.ts, scripts/documentation.mjs), dans le navigateur : dans la page, l'icone Aide
// ouvre le guide et le mode Cricut dans un nouvel onglet, chacun d'un seul tenant (aucune requete hors du fichier : images et fontes
// sont dedans) et sans violation pour axe-core ; un hote qui embarque l'editeur n'a pas ces fichiers, son menu Aide ne les propose pas.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { ouvrirExemple, ouvrirMenu, pilote, RACINE_DEPOT, textesDe, URL_INTEGRATION } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
interface ResultatAxe { violations: { id: string; nodes: { target: unknown[] }[] }[] }

describe('les documentations du menu Aide', () => {
  const navigateur = pilote();

  /** Ouvre une documentation par le menu Aide et rend son onglet, une fois chargee, avec les adresses qu'il a demandees. */
  async function ouvrirDocumentation(page: Page, nom: string): Promise<{ onglet: Page; demandes: string[] }> {
    await ouvrirMenu(page, 'Aide');
    const demandes: string[] = [];
    page.context().on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) demandes.push(r.url()); });
    const [onglet] = await Promise.all([page.context().waitForEvent('page'), page.getByRole('menuitem', { name: nom }).click()]);
    await onglet.waitForLoadState('load');
    return { onglet, demandes };
  }

  it('ouvre le guide dans un nouvel onglet, sans aucune requete, l editeur reste ouvert', async () => {
    const { page } = await navigateur.ouvrir();
    await ouvrirExemple(page);
    const { onglet, demandes } = await ouvrirDocumentation(page, 'Guide de l’éditeur');
    expect(onglet.url()).toMatch(/\/dist\/aide\/guide\.html$/);
    expect(await onglet.title()).toBe('Guide de l’Éditeur SVG');
    // Les captures sont dans le fichier : chaque image s'est decodee.
    expect(await onglet.locator('img').evaluateAll(l => l.filter(i => !(i as HTMLImageElement).complete || (i as HTMLImageElement).naturalWidth === 0).length)).toBe(0);
    expect(demandes).toEqual([]);
    expect(await page.locator('.editeur-cadre').count()).toBe(1);
  });

  it('ouvre « La Cricut, c’est simple », et les deux pages passent axe-core sans violation', async () => {
    const { page } = await navigateur.ouvrir();
    await ouvrirExemple(page);
    for (const [nom, fichier] of [['La Cricut, c’est simple', 'cricut'], ['Guide de l’éditeur', 'guide']] as const) {
      const { onglet, demandes } = await ouvrirDocumentation(page, nom);
      expect(onglet.url()).toMatch(new RegExp('/dist/aide/' + fichier + '\\.html$'));
      expect(demandes).toEqual([]);
      await onglet.addScriptTag({ content: AXE });
      const r = await onglet.evaluate(async () => (await (window as unknown as { axe: { run: (c: unknown) => Promise<ResultatAxe> } }).axe.run(document)));
      expect(r.violations.map(v => v.id + ' ' + JSON.stringify(v.nodes.slice(0, 3).map(n => n.target))), nom).toEqual([]);
      await onglet.close();
    }
  });

  it('chez un hote qui embarque l editeur, le menu Aide ne propose pas les documentations', async () => {
    const { page } = await navigateur.ouvrir({ naviguer: false });
    await page.goto(URL_INTEGRATION);
    await page.evaluate(() => {
      const w = window as unknown as { EditeurSvg: { ouvrir(o: object): unknown } };
      w.EditeurSvg.ouvrir({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1H9V9H1Z" fill="#c81e28"/></svg>', onEnregistrer: () => undefined });
    });
    await page.locator('.editeur-svg .editeur-cadre').waitFor();
    await ouvrirMenu(page, 'Aide');
    expect(await textesDe(page.getByRole('menu', { name: 'Aide' }).getByRole('menuitem'))).toEqual(['Raccourcis clavier']);
  });
});

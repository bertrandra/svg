// Les liens des ilots en contexte Cricut (ADR-0040), dans le navigateur : un « O » tape sur la toile fait dire au panneau que son
// centre tombera a la decoupe ; « Ajouter des liens » pose 3 liens de 2 mm (le contour se coupe en trois morceaux), Ctrl+Z les retire
// d'un coup ; « Régler les liens… » ouvre le panneau, 2 liens de 3 mm ; le panneau et la boite passent axe-core sans violation.

import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { aLeFocus, attend, attendreAnimations, ouvrirCode, ouvrirMenu, pilote, RACINE_DEPOT } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
interface ResultatAxe { violations: { id: string; nodes: { target: unknown[] }[] }[]; incomplete: { id: string; nodes: { target: unknown[] }[] }[] }

/** Un plan de 6 po et un petit carre dans un coin (un dessin vide ne s'ouvre pas) : le « O » se tape au reticule. */
const VIDE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 576"><path d="M24 24H72V72H24Z" fill="#1428a0"/></svg>';
/** Les captures avant et apres, pour le compte rendu : seulement quand ce dossier est donne. */
const CAPTURES = process.env.CAPTURES_LIENS;

describe('les liens des ilots, en Cricut', () => {
  const navigateur = pilote();
  const panneau = (page: Page) => page.locator('.panneau-cricut');
  const dit = (page: Page) => page.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim());
  const constatIlot = (page: Page) => panneau(page).locator('.constat', { hasText: 'tombera à la découpe' });
  /** Le nombre de sous-chemins du trace du « O » (la derniere forme) : 2 entier, un par morceau quand les liens le coupent. */
  const morceaux = (page: Page) => page.locator('.editeur-svg-toile path[data-id]').last().evaluate(e => (e.getAttribute('d') ?? '').split('M').length - 1);

  async function editeurAvecO(): Promise<Page> {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, VIDE);
    await page.locator('.selecteur-contexte .menu-bouton').click();
    await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
    await panneau(page).locator('.constat, .pret').first().waitFor();
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('t');
    await page.keyboard.press('Enter');
    await attend(() => aLeFocus(page.locator('textarea.saisie-champ'))).toBe(true);
    await page.keyboard.type('O');
    // Les fontes se chargent au premier besoin : le texte se compose des qu'elles sont la.
    await attend(() => page.locator('.editeur-svg-toile path[data-id]').count()).toBe(2);
    await page.keyboard.press('Escape');
    await attend(() => aLeFocus(page.locator('.editeur-svg-toile'))).toBe(true);
    await constatIlot(page).waitFor();
    return page;
  }

  it('le constat apparait sur un « O », « Ajouter des liens » en pose 3, Ctrl+Z les retire d un coup', async () => {
    const page = await editeurAvecO();
    expect(await constatIlot(page).locator('p').innerText()).toMatch(/^Le centre de cette forme tombera à la découpe \(1 îlot\) : pour un pochoir/);
    expect(await constatIlot(page).getAttribute('class')).toContain('constat-a-corriger');
    expect(await morceaux(page)).toBe(2);
    if (CAPTURES) { mkdirSync(CAPTURES, { recursive: true }); await page.locator('.editeur-svg-toile').screenshot({ path: resolve(CAPTURES, 'liens-avant.png') }); }
    await constatIlot(page).getByRole('button', { name: 'Ajouter des liens', exact: true }).click();
    await attend(() => dit(page)).toBe('3 liens posés sur 1 îlot. Ctrl+Z les retire.');
    await attend(() => morceaux(page)).toBe(3);
    await attend(() => constatIlot(page).count()).toBe(0);
    if (CAPTURES) {
      await page.locator('.editeur-svg-toile').screenshot({ path: resolve(CAPTURES, 'liens-apres.png') });
      // L'apercu de la machine montre les liens : les bandes de feuille laissees en travers de la zone hachuree.
      await page.locator('.editeur-svg-toile').focus();
      await page.keyboard.press('Shift+O');
      await page.locator('.editeur-svg-toile').screenshot({ path: resolve(CAPTURES, 'liens-apres-contours.png') });
      await page.keyboard.press('Shift+O');
    }
    // Une seule entree d'historique : Ctrl+Z rend le « O » entier, et le constat revient.
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await attend(() => morceaux(page)).toBe(2);
    await constatIlot(page).waitFor();
  });

  it('« Régler les liens… » ouvre le panneau : 2 liens de 3 mm, retenus pour la session', async () => {
    const page = await editeurAvecO();
    await constatIlot(page).getByRole('button', { name: 'Régler les liens…' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Ajouter des liens' });
    await dialogue.waitFor();
    const largeur = dialogue.getByRole('textbox', { name: 'Largeur' }), nombre = dialogue.getByRole('textbox', { name: 'Liens par îlot' });
    expect(await largeur.inputValue()).toBe('2');
    expect(await nombre.inputValue()).toBe('3');
    await attend(() => dialogue.getByRole('status').innerText()).toBe('1 îlot dans 1 forme : chaque îlot recevra ses liens.');
    // Hors des bornes : la boite le dit, rien n'est pose.
    await largeur.fill('20');
    await dialogue.getByRole('button', { name: 'Ajouter les liens' }).click();
    await attend(() => dialogue.getByRole('alert').innerText()).toBe('Donnez une largeur entre 0,5 et 10 mm.');
    await largeur.fill('3');
    await nombre.fill('2');
    await dialogue.getByRole('button', { name: 'Ajouter les liens' }).click();
    await dialogue.waitFor({ state: 'detached' });
    await attend(() => dit(page)).toBe('2 liens posés sur 1 îlot. Ctrl+Z les retire.');
    await attend(() => morceaux(page)).toBe(2);
    await attend(() => constatIlot(page).count()).toBe(0);
    // Les reglages restent ceux de la session : le menu Edition rouvre la boite sur 3 mm et 2 liens.
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await constatIlot(page).waitFor();
    await page.keyboard.press('ControlOrMeta+a');
    await ouvrirMenu(page, 'Édition');
    await page.getByRole('menuitem', { name: 'Ajouter des liens…' }).click();
    await dialogue.waitFor();
    expect(await largeur.inputValue()).toBe('3');
    expect(await nombre.inputValue()).toBe('2');
    await page.keyboard.press('Escape');
    await dialogue.waitFor({ state: 'detached' });
  });

  it('passe axe-core sans violation ni doute : le panneau et son constat, puis la boite des liens', async () => {
    const page = await editeurAvecO();
    const axe = async () => {
      const hauteur = await page.evaluate(() => Math.max(...['.editeur-inspecteur', '.panneau-flottant'].map(s => { const i = document.querySelector(s); return i ? Math.ceil(i.scrollHeight - i.clientHeight + innerHeight) : innerHeight; })));
      await page.setViewportSize({ width: 1280, height: Math.min(4000, Math.max(800, hauteur + 40)) });
      await attendreAnimations(page);
      if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: AXE });
      const r = await page.evaluate(async () => (await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<ResultatAxe> } }).axe.run(document, { resultTypes: ['violations', 'incomplete'] })));
      expect(r.violations.map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)))).toEqual([]);
      expect(r.incomplete.map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)))).toEqual([]);
    };
    await axe();
    await constatIlot(page).getByRole('button', { name: 'Régler les liens…' }).click();
    await page.getByRole('dialog', { name: 'Ajouter des liens' }).waitFor();
    await axe();
  });
});

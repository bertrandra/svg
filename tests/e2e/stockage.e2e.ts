// Ce que l'editeur garde, et ou : le stockage est un confort que l'hote choisit (option `stockage`), et la
// memoire des sections ouvertes est celle d'un editeur, pas de la page. Pilote le bundle d'embarquement
// (file://), comme l'hote le recoit.

import { existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, BUNDLE_EMBARQUE, pilote, URL_INTEGRATION } from './aide.js';

const PETIT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10L60 10L60 60L10 60Z" fill="#c81e28"/></svg>';

interface Poignee { fermer(): void }
interface Fenetre {
  EditeurSvg: { ouvrir(o: Record<string, unknown>): Poignee };
  __poignee: Poignee | undefined;
  __appels: string[];
}

describe('stockage et memoire des sections', () => {
  const navigateur = pilote();

  beforeAll(() => {
    if (!existsSync(BUNDLE_EMBARQUE)) throw new Error('dist/editeur-svg-embarque.js manque : lancer `npm run construire` avant `npm run e2e`.');
  });

  async function hote() {
    const session = await navigateur.ouvrir({ naviguer: false });
    await session.page.goto(URL_INTEGRATION);
    return session.page;
  }

  /** Ouvre l'editeur par l'API ; `stockage` est une expression JavaScript evaluee dans la page de l'hote. */
  async function ouvrir(page: Page, stockage: string | null) {
    await page.evaluate(([svg, expression]) => {
      const w = window as unknown as Fenetre;
      w.__appels = [];
      const options: Record<string, unknown> = { svg: String(svg), onEnregistrer: () => undefined };
      if (expression !== null) options['stockage'] = new Function('w', 'return ' + String(expression))(w) as unknown;
      w.__poignee = w.EditeurSvg.ouvrir(options);
    }, [PETIT, stockage] as const);
    await page.locator('.editeur-svg .editeur-cadre').waitFor();
  }

  const fermer = async (page: Page) => {
    await page.evaluate(() => (window as unknown as Fenetre).__poignee?.fermer());
    await attend(() => page.locator('.editeur-svg').count()).toBe(0);
  };

  const section = (page: Page, titre: string) => page.locator('.editeur-svg details.section', { has: page.locator('summary', { hasText: titre }) });

  /** Garde une version nommee depuis le panneau du dessin (rien n'est choisi). */
  async function garderVersion(page: Page, nom: string) {
    const versions = section(page, 'Versions nommées');
    if (!(await versions.evaluate(e => (e as HTMLDetailsElement).open))) await versions.locator('summary').click();
    await page.getByRole('textbox', { name: 'Nom de la version' }).fill(nom);
    await page.getByRole('button', { name: 'Garder', exact: true }).click();
    await attend(() => versions.locator('.versions li').count()).toBe(1);
  }

  const lu = (page: Page) => page.evaluate(() => localStorage.getItem('svg.versions'));

  it('garde les versions dans le localStorage de l\'hote quand l\'option manque (comme avant l\'option)', async () => {
    const page = await hote();
    await page.evaluate(() => localStorage.removeItem('svg.versions'));
    await ouvrir(page, null);
    await garderVersion(page, 'avant');
    expect(JSON.parse((await lu(page)) ?? 'null')).toMatchObject([{ nom: 'avant' }]);
  });

  it('ne garde rien avec stockage: false, et l\'editeur marche quand meme', async () => {
    const page = await hote();
    await page.evaluate(() => localStorage.removeItem('svg.versions'));
    await ouvrir(page, 'false');
    await garderVersion(page, 'ephemere');
    expect(await lu(page)).toBeNull();
    // La version vit le temps de l'editeur : elle est dans la liste.
    await expect(page.locator('.versions li').first().innerText()).resolves.toContain('ephemere');
  });

  it('confie les versions au stockage de l\'hote, sous la cle svg.versions, sans toucher au localStorage', async () => {
    const page = await hote();
    await page.evaluate(() => localStorage.removeItem('svg.versions'));
    await ouvrir(page, `{
      lire: k => { w.__appels.push('lire ' + k); return null; },
      ecrire: (k, v) => { w.__appels.push('ecrire ' + k + ' ' + v.length); return true; },
      retirer: k => { w.__appels.push('retirer ' + k); }
    }`);
    await garderVersion(page, 'chez l hote');
    expect(await lu(page)).toBeNull();
    const appels = await page.evaluate(() => (window as unknown as Fenetre).__appels);
    expect(appels).toContain('lire svg.versions');
    expect(appels).toContain('ecrire svg.versions 1');
  });

  it('tient pour refuse un stockage d\'hote qui leve : l\'editeur ne casse pas', async () => {
    const page = await hote();
    await ouvrir(page, `{ lire: () => { throw new Error('boum'); }, ecrire: () => { throw new Error('boum'); }, retirer: () => { throw new Error('boum'); } }`);
    await garderVersion(page, 'malgre tout');
  });

  it('refuse une option stockage qui n\'en est pas une', async () => {
    const page = await hote();
    const message = await page.evaluate(() => {
      try { (window as unknown as Fenetre).EditeurSvg.ouvrir({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0L1 0L1 1Z"/></svg>', onEnregistrer: () => undefined, stockage: 'local' }); return ''; } catch (e) { return String(e); }
    });
    expect(message).toMatch(/TypeError/);
    expect(message).toMatch(/« stockage »/);
  });

  it('ne passe pas les sections ouvertes d\'un editeur au suivant', async () => {
    const page = await hote();
    await ouvrir(page, 'false');
    const nettoyer = section(page, 'Nettoyer le tracé');
    expect(await nettoyer.evaluate(e => (e as HTMLDetailsElement).open)).toBe(false);
    await nettoyer.locator('summary').click();
    expect(await nettoyer.evaluate(e => (e as HTMLDetailsElement).open)).toBe(true);
    await fermer(page);
    await ouvrir(page, 'false');
    // Un second editeur repart des valeurs par defaut : la memoire n'est plus celle du module.
    expect(await section(page, 'Nettoyer le tracé').evaluate(e => (e as HTMLDetailsElement).open)).toBe(false);
  });

  it('retient les sections ouvertes d\'un panneau a l\'autre dans un meme editeur', async () => {
    const page = await hote();
    await ouvrir(page, 'false');
    await section(page, 'Nettoyer le tracé').locator('summary').click();
    // Choisir une forme change de panneau (l'inspecteur remplace le panneau du dessin), puis tout deselectionner le ramene.
    await page.locator('.editeur-svg-toile path[data-id]').first().click();
    await page.locator('.editeur-inspecteur').getByText('Apparence').waitFor();
    await page.keyboard.press('Escape');
    await section(page, 'Nettoyer le tracé').waitFor();
    expect(await section(page, 'Nettoyer le tracé').evaluate(e => (e as HTMLDetailsElement).open)).toBe(true);
  });
});

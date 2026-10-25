// Le nuancier tire du dessin (ADR-0037) : a l'ouverture d'un SVG, « Couleurs du dessin » range ses couleurs par surface ; le
// nuancier de la page reste a cote ; une pastille pose sa couleur (clic : remplissage, Maj+clic : contour) ; « Créer le nuancier
// depuis la sélection » remplace ou complete le groupe, et Ctrl+Z le defait ; une image convertie montre son nuancier ; tout se
// fait au clavier, tient dans 390 px, et passe axe en clair et en sombre.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Locator, Page } from 'playwright';
import { aLeFocus, attend, attendreAnimations, imageDeTest, ouvrirCode, pilote, RACINE_DEPOT, texteDe } from './aide.js';

/** Un fond beige (la plus grande surface), un disque rouge et son double presque identique, un bleu a demi transparent, un filet noir, un petit carre vert. */
const DESSIN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<rect x="0" y="0" width="400" height="300" fill="#f4e9d8"/>'
  + '<circle cx="120" cy="150" r="80" fill="#c81e28"/>'
  + '<circle cx="125" cy="150" r="10" fill="#c91f27"/>'
  + '<rect x="230" y="60" width="120" height="160" fill="#1428a0" fill-opacity="0.5"/>'
  + '<path d="M20 280 L380 280" stroke="#15181d" stroke-width="3" fill="none"/>'
  + '<rect x="300" y="20" width="20" height="20" fill="#2e8b57"/>'
  + '</svg>';
const ORDRE = ['Beige #F4E9D8', 'Rouge #C81E28', 'Bleu foncé #1428A0, opacité 50 %', 'Noir #15181D', 'Vert #2E8B57'];
const PAGE = ['Rouge #C81E28', 'Bleu #1428A0', 'Encre #15181D', 'Blanc #FFFFFF'];

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const TRACE = 60_000;

describe('le nuancier tire du dessin', () => {
  const navigateur = pilote();

  async function editeur(options: { largeur?: number; hauteur?: number; tactile?: boolean; schema?: 'light' | 'dark' } = {}) {
    const { page } = await navigateur.ouvrir(options);
    await ouvrirCode(page, DESSIN, options.tactile);
    if (options.tactile) {
      await page.getByRole('button', { name: 'Inspecteur' }).tap();
      await attend(() => page.locator('.editeur-inspecteur').evaluate(e => getComputedStyle(e).transform)).toBe('none');
    }
    return page;
  }

  const section = (page: Page) => page.locator('details.section-nuancier');
  const groupe = (page: Page, nom: string) => section(page).getByRole('group', { name: new RegExp('^' + nom) });
  const pastilles = (g: Locator) => g.locator('button.echantillon');
  const noms = (g: Locator) => pastilles(g).evaluateAll(l => l.map(e => (e.getAttribute('aria-label') ?? '').replace(/\u00a0/g, ' ')));
  const peinture = (page: Page, id: string, attribut: 'fill' | 'stroke') => page.locator(`.editeur-svg-toile path[data-id="${id}"]`).getAttribute(attribut);
  const choisir = (page: Page, id: string) => page.locator(`.editeur-calques button.calque-nom[data-forme="${id}"]`).click();

  it('ouvre un SVG avec « Couleurs du dessin » rangees par surface, et garde le nuancier de la page', async () => {
    const page = await editeur();
    expect(await section(page).evaluate(d => (d as HTMLDetailsElement).open)).toBe(true);
    expect(await noms(groupe(page, 'Couleurs du dessin'))).toEqual(ORDRE);
    expect(await texteDe(groupe(page, 'Couleurs du dessin').locator('.nuancier-titre'))).toBe('Couleurs du dessin 5 · tirées du dessin');
    expect(await noms(groupe(page, 'Nuancier proposé'))).toEqual(PAGE);
    // Ouvrir n'est pas modifier : rien a annuler, rien a enregistrer de plus.
    expect(await texteDe(page.locator('.editeur-etat'))).toContain('0 modification');
  });

  it('pose une couleur : un clic au remplissage, Maj+clic au contour, « Appliquer au » inverse', async () => {
    const page = await editeur();
    await choisir(page, 'f6');
    const dessin = groupe(page, 'Couleurs du dessin');
    await dessin.getByRole('button', { name: 'Rouge #C81E28' }).click();
    await attend(() => peinture(page, 'f6', 'fill')).toBe('#c81e28');
    expect(await dessin.getByRole('button', { name: 'Rouge #C81E28' }).getAttribute('aria-pressed')).toBe('true');
    await dessin.getByRole('button', { name: 'Noir #15181D' }).click({ modifiers: ['Shift'] });
    await attend(() => peinture(page, 'f6', 'stroke')).toBe('#15181d');
    await section(page).getByRole('button', { name: 'Contour', exact: true }).click();
    await groupe(page, 'Nuancier proposé').getByRole('button', { name: 'Bleu #1428A0' }).click();
    await attend(() => peinture(page, 'f6', 'stroke')).toBe('#1428a0');
    expect(await peinture(page, 'f6', 'fill')).toBe('#c81e28');
    // Le nuancier du dessin ne suit pas les couleurs : c'est une palette, pas un releve.
    expect(await noms(dessin)).toEqual(ORDRE);
  });

  it('cree le nuancier depuis la selection : remplacer, ajouter, et Ctrl+Z le rend', async () => {
    const page = await editeur();
    await choisir(page, 'f6');
    await page.locator('.editeur-barre .menu-bouton', { hasText: 'Édition' }).click();
    await page.getByRole('menuitem', { name: /remplacer/ }).click();
    await attend(() => noms(groupe(page, 'Couleurs du dessin'))).toEqual(['Vert #2E8B57']);
    expect(await texteDe(groupe(page, 'Couleurs du dessin').locator('.nuancier-titre'))).toBe('Couleurs du dessin 1 · de la sélection');
    expect(await texteDe(page.locator('.editeur-etat'))).toContain('1 modification');

    // Ajouter, par le petit menu de la section : les couleurs nouvelles de la selection viennent a la suite.
    await choisir(page, 'f4');
    await section(page).getByRole('button', { name: 'Depuis la sélection' }).click();
    await page.getByRole('menuitem', { name: 'Ajouter' }).click();
    await attend(() => noms(groupe(page, 'Couleurs du dessin'))).toEqual(['Vert #2E8B57', 'Bleu foncé #1428A0, opacité 50 %']);
    expect(await texteDe(groupe(page, 'Couleurs du dessin').locator('.nuancier-titre'))).toBe('Couleurs du dessin 2 · de la sélection');

    await page.keyboard.press('Control+z');
    await attend(() => noms(groupe(page, 'Couleurs du dessin'))).toEqual(['Vert #2E8B57']);
    await page.keyboard.press('Control+z');
    await attend(() => noms(groupe(page, 'Couleurs du dessin'))).toEqual(ORDRE);
    // Le nuancier de la page n'a jamais bouge.
    expect(await noms(groupe(page, 'Nuancier proposé'))).toEqual(PAGE);
  });

  it('porte la commande dans la rangee de la selection, et dans son menu « Plus » au doigt', async () => {
    const page = await editeur();
    await choisir(page, 'f4');
    await page.locator('.editeur-barre-selection').getByRole('button', { name: 'Créer le nuancier depuis la sélection' }).click();
    await page.getByRole('menuitem', { name: 'Remplacer le nuancier du dessin' }).click();
    await attend(() => noms(groupe(page, 'Couleurs du dessin'))).toEqual(['Bleu foncé #1428A0, opacité 50 %']);

    // Au doigt sur un telephone, la rangee resserree range la commande dans son menu « Plus », rubrique a part.
    const { page: doigt } = await navigateur.ouvrir({ largeur: 390, hauteur: 844, tactile: true });
    await ouvrirCode(doigt, DESSIN, true);
    // La forme se choisit dans les calques (un tiroir ferme) : le clic du DOM suffit, le geste etudie est celui du menu.
    await doigt.locator('.editeur-calques button.calque-nom[data-forme="f6"]').evaluate(b => (b as HTMLButtonElement).click());
    await doigt.locator('.editeur-barre-selection .menu-bouton[aria-label^="Plus de gestes"]').tap();
    await doigt.getByRole('menu', { name: 'Créer le nuancier depuis la sélection' }).getByRole('menuitem', { name: 'Ajouter' }).tap();
    await attend(() => texteDe(doigt.locator('.editeur-etat'))).toContain('déjà ces couleurs');
  });

  it('se pilote au clavier : Maj+N, Alt+Maj+N, Tab et fleches entre les pastilles, Entree et Maj+Entree', async () => {
    const page = await editeur();
    await choisir(page, 'f2');
    await page.keyboard.press('Shift+N');
    await attend(() => noms(groupe(page, 'Couleurs du dessin'))).toEqual(['Rouge #C81E28']);
    await choisir(page, 'f6');
    await page.keyboard.press('Alt+Shift+N');
    await attend(() => noms(groupe(page, 'Couleurs du dessin'))).toEqual(['Rouge #C81E28', 'Vert #2E8B57']);

    const proposes = pastilles(groupe(page, 'Nuancier proposé'));
    await proposes.first().focus();
    await page.keyboard.press('ArrowRight');
    expect(await aLeFocus(proposes.nth(1))).toBe(true);
    await page.keyboard.press('End');
    expect(await aLeFocus(proposes.nth(3))).toBe(true);
    await page.keyboard.press('ArrowRight');
    expect(await aLeFocus(proposes.first())).toBe(true);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await attend(() => peinture(page, 'f6', 'fill')).toBe('#1428a0');
    await page.keyboard.press('Shift+Enter');
    await attend(() => peinture(page, 'f6', 'stroke')).toBe('#1428a0');
    // Tab sort du groupe sans piege : le prochain arret n'est plus une pastille de ce groupe.
    await proposes.last().focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('.nuancier-groupe')?.getAttribute('aria-labelledby') ?? null)).not.toBe(await groupe(page, 'Nuancier proposé').getAttribute('aria-labelledby'));
  });

  it('montre le nuancier d’une image convertie, puis celui du dessin trace dans l’editeur', async () => {
    const { page } = await navigateur.ouvrir();
    await page.getByRole('tab').nth(1).click();
    await page.locator('.vectoriser input[type=file]').setInputFiles(imageDeTest());
    await page.locator('.fiche-resultat').waitFor({ timeout: TRACE });
    const image = page.getByRole('list', { name: 'Nuancier de l’image' });
    await image.waitFor();
    const teintes = await image.locator('[role="img"]').evaluateAll(l => l.map(e => e.getAttribute('aria-label') ?? ''));
    expect(teintes.slice(0, 2)).toEqual(['Rouge #C81E28', 'Bleu foncé #1428A0']);
    const trace = await page.getByRole('list', { name: 'Couleurs du tracé' }).locator('[role="img"]').evaluateAll(l => l.map(e => e.getAttribute('aria-label') ?? ''));
    expect(trace).toContain('Rouge #C81E28');
    await page.getByRole('button', { name: 'Ouvrir dans l’éditeur' }).click();
    await page.locator('.editeur-cadre').waitFor();
    expect(await noms(groupe(page, 'Couleurs du dessin'))).toEqual(trace);
  });

  it('tient dans 390 px au doigt : pastilles de 40 px, aucun defilement de cote', async () => {
    const page = await editeur({ largeur: 390, hauteur: 844, tactile: true });
    await section(page).scrollIntoViewIfNeeded();
    const tailles = await pastilles(groupe(page, 'Couleurs du dessin')).evaluateAll(l => l.map(e => Math.round(e.getBoundingClientRect().width)));
    expect(tailles.every(t => t >= 40)).toBe(true);
    const debord = await page.locator('.editeur-inspecteur').evaluate(e => e.scrollWidth - e.clientWidth);
    expect(debord).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await groupe(page, 'Couleurs du dessin').getByRole('button', { name: 'Vert #2E8B57' }).tap();
    expect(await texteDe(page.locator('.editeur-etat'))).toContain('formes nouvelles');
  });

  for (const schema of ['light', 'dark'] as const) {
    it('passe axe sans violation grave, en ' + (schema === 'light' ? 'clair' : 'sombre'), async () => {
      const page = await editeur({ schema, hauteur: 1400 });
      await choisir(page, 'f2');
      await section(page).scrollIntoViewIfNeeded();
      await attendreAnimations(page);
      await page.addScriptTag({ content: AXE });
      const graves = await page.evaluate(async () => {
        const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: unknown[] }[] }[] }> } };
        const r = await w.axe.run(document, { resultTypes: ['violations'] });
        return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' ' + JSON.stringify(v.nodes.slice(0, 3).map(n => n.target)));
      });
      expect(graves).toEqual([]);
    });
  }
});

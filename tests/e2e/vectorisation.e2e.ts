// L'atelier de vectorisation (ADR-0002, ADR-0005) : une image deposee, vectorisee dans le navigateur
// par vtracer, rejouee a chaque changement de reglage, comparee aux essais precedents.
// L'image est fabriquee en memoire (aide.ts) : un disque rouge, un rectangle bleu perce, des poussieres.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, choisirVue, encoderPng, imageDeTest, pilote, texteDe } from './aide.js';

// Le premier trace charge le WASM : on laisse a la machine le temps de le faire sans en faire une regle.
const TRACE = 60_000;

describe('atelier de vectorisation', () => {
  const navigateur = pilote();

  /** La page d'accueil sur la voie « image », l'image de test deposee et le premier resultat arrive. */
  async function atelier(image = imageDeTest()) {
    const session = await navigateur.ouvrir();
    const { page } = session;
    await page.getByRole('tab').nth(1).click();
    await page.locator('.vectoriser input[type=file]').setInputFiles(image);
    await page.locator('.fiche-resultat').waitFor({ timeout: TRACE });
    return page;
  }

  const resume = (page: Page) => texteDe(page.locator('.fiche-resultat .aide').first());
  const essais = (page: Page) => page.locator('.essais li').count();
  /** La section repliee des reglages fins : son titre dit combien sont touches. */
  const sectionFins = (page: Page) => page.locator('.reglages-vecto details.section', { has: page.locator('summary', { hasText: 'Réglages fins' }) });
  const legende = (page: Page) => texteDe(sectionFins(page).locator('summary'));
  const ouvrirFins = async (page: Page) => { if ((await sectionFins(page).getAttribute('open')) === null) await sectionFins(page).locator('summary').click(); };
  const poussieres = (page: Page) => page.locator('.reglages-fins input[aria-label="Ignorer les taches de moins de"]');
  /** Attend que le resume du resultat change de `avant` : le traceur a rejoue. */
  const attendreRejeu = (page: Page, avant: string) => attend(() => resume(page), TRACE).not.toBe(avant);

  it('montre la miniature deposee, puis vectorise tout seul', async () => {
    const session = await navigateur.ouvrir();
    const { page } = session;
    await page.getByRole('tab').nth(1).click();
    await page.locator('.vectoriser input[type=file]').setInputFiles(imageDeTest());

    await attend(() => page.locator('.depot .miniature').getAttribute('alt')).toBe('Image déposée : essai');
    await page.locator('.fiche-resultat').waitFor({ timeout: TRACE });
    expect(await resume(page)).toMatch(/fond #FFFFFF retiré depuis le bord \(\d+ %\) · \d+ tracés? vectoriels?/);

    // La vue par defaut compare l'image detouree et les vecteurs, avec un rideau.
    expect(await texteDe(page.locator('.barre-visionneuse button[aria-pressed="true"]').first())).toBe('Comparer');
    expect(await page.locator('.visionneuse .ligne-rideau').count()).toBe(1);
    // Une seule action pleine dans la voie : ouvrir le resultat dans l'editeur.
    expect(await page.locator('main button.primaire:visible').count()).toBe(1);
    // Au premier resultat, les reglages fins et le pretraitement sont replies ; deux vues seulement sont des boutons.
    expect(await page.locator('.reglages-vecto details.section[open]').count()).toBe(0);
    expect(await page.locator('.barre-visionneuse .mini-onglets button').allInnerTexts()).toEqual(['Comparer', 'Contours']);
    // Le resume se lit une seule fois.
    const texte = await texteDe(page.locator('.vectoriser'));
    expect(texte.split('tracés vectoriels').length - 1).toBe(1);
  });

  it('rejoue seul quand un curseur bouge, et garde chaque essai', async () => {
    const page = await atelier();
    expect(await legende(page)).toBe('Réglages fins');
    await ouvrirFins(page);
    const premier = await resume(page);
    expect(await essais(page)).toBe(0); // un seul essai ne fait pas une liste

    // Les poussieres a 16 pixels : les cinq grains de 9 pixels disparaissent, le trace change.
    await poussieres(page).fill('16');
    await attendreRejeu(page, premier);
    expect(await legende(page)).toBe('Réglages fins 1 modifié');
    await attend(() => essais(page)).toBe(2);

    await page.locator('.reglages-fins select').first().selectOption('polygon');
    await attend(() => resume(page), TRACE).toContain('segments droits');
    await attend(() => essais(page)).toBe(3);
    expect(await legende(page)).toBe('Réglages fins 2 modifiés');
  });

  it('reprend un essai d\'un clic : les curseurs reviennent aux reglages de cet essai', async () => {
    const page = await atelier();
    await ouvrirFins(page);
    const premier = await resume(page);
    const avant = await poussieres(page).inputValue();
    await poussieres(page).fill('16');
    await attendreRejeu(page, premier);
    await attend(() => essais(page)).toBe(2);

    // Le plus ancien est le dernier de la liste.
    const ancien = page.locator('.essais li').last().locator('button');
    await ancien.click();
    await attend(() => poussieres(page).inputValue()).toBe(avant);
    await attend(() => legende(page)).toBe('Réglages fins');
    await attend(() => ancien.getAttribute('aria-pressed')).toBe('true');
    // Le resultat deja connu n'est pas recalcule : la liste garde ses deux essais.
    await attend(() => resume(page)).toBe(premier);
    expect(await essais(page)).toBe(2);
  });

  it('change de vue, de zoom, de fond et de position du rideau', async () => {
    const page = await atelier();
    const base = page.locator('.visionneuse .calque.base');
    const haut = page.locator('.visionneuse .calque.haut');

    await choisirVue(page, 'Rendu');
    await attend(() => base.getAttribute('class')).toContain('cache');
    // Une vue du menu donne son nom au bouton : on voit toujours ce qu'on regarde.
    expect(await texteDe(page.locator('.barre-visionneuse .vue-plus .menu-bouton'))).toBe('Rendu');
    await choisirVue(page, 'Contours');
    await attend(() => haut.count()).toBe(1);
    await choisirVue(page, 'Détourée');
    await attend(() => haut.count()).toBe(0);
    expect(await base.getAttribute('alt')).toBe('Image détourée');
    await choisirVue(page, 'Originale');
    await attend(() => base.getAttribute('alt')).toBe('Image déposée');

    await choisirVue(page, 'Comparer');
    expect(await texteDe(page.locator('.barre-visionneuse .vue-plus .menu-bouton'))).toBe('Plus de vues');
    await choisirVue(page, '200 %');
    // Image de 240 px de large, a 200 % : 480 px a l'ecran.
    await attend(() => base.evaluate(e => (e as HTMLImageElement).width)).toBe(480);
    await choisirVue(page, 'Sombre');
    await attend(() => page.locator('.visionneuse').getAttribute('class')).toContain('fond-sombre');

    await page.locator('.rideau input').fill('20');
    await attend(() => haut.getAttribute('style')).toMatch(/inset\(0(px)? 0(px)? 0(px)? 20%\)/);
  });

  it('remet les reglages fins a zero quand le mode change, et ne rejoue plus sans la case', async () => {
    const page = await atelier();
    await ouvrirFins(page);
    const premier = await resume(page);
    await poussieres(page).fill('16');
    await attendreRejeu(page, premier);
    expect(await legende(page)).toBe('Réglages fins 1 modifié');

    // « Trait noir » : autre mode, autres curseurs, et plus rien de « modifie ».
    await page.locator('.reglages-vecto select').first().selectOption('trait');
    await attend(() => legende(page)).toBe('Réglages fins');
    await attend(() => resume(page), TRACE).toContain('Trait');

    const dernier = await resume(page);
    // Le bouton « Rejouer » n'a pas de raison d'etre tant que tout se rejoue seul ; il revient sans la case.
    expect(await page.getByRole('button', { name: 'Rejouer', exact: true }).count()).toBe(0);
    await page.getByLabel('Rejouer à chaque changement').uncheck();
    await poussieres(page).fill('1');
    // Un refus ne s'attend pas : on laisse passer plus de deux fois la pause de rejeu (400 ms) et on
    // verifie que rien n'a bouge. C'est la seule pause fixe de la suite, faute d'evenement a attendre.
    await page.waitForTimeout(900);
    expect(await resume(page)).toBe(dernier);

    await page.getByRole('button', { name: 'Rejouer', exact: true }).click();
    await attendreRejeu(page, dernier);
  });

  it('ouvre le resultat dans l\'editeur, une forme par trace', async () => {
    const page = await atelier();
    const traces = Number(/(\d+) tracés?/.exec(await resume(page))?.[1]);
    expect(traces).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Ouvrir dans l’éditeur' }).click();
    await page.locator('.editeur-cadre').waitFor();
    await attend(() => page.locator('.editeur-calques ol > li').count()).toBe(traces);
  });

  it('ne garde que le fond relie au bord, sauf si on demande « sur toute l\'image »', async () => {
    // Un anneau rouge sur fond blanc : le blanc du centre n'est pas relie au bord.
    const anneau = encoderPng(200, 200, (x, y) => {
      const d2 = (x - 100) ** 2 + (y - 100) ** 2;
      return d2 < 70 ** 2 && d2 >= 35 ** 2 ? [0xc8, 0x1e, 0x28] : null;
    });
    const page = await atelier({ name: 'anneau.png', mimeType: 'image/png', buffer: anneau });
    const depuisLeBord = await resume(page);
    expect(depuisLeBord).toContain('depuis le bord');

    await page.getByLabel(/Sur toute l’image/).check();
    await attendreRejeu(page, depuisLeBord);
    expect(await resume(page)).not.toContain('depuis le bord');
  });
});

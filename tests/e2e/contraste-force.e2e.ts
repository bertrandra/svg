// Le contraste forcé (mode « contraste élevé » de Windows, `forced-colors: active`) : le navigateur remplace
// les couleurs de l'interface par celles du système et efface fonds d'état et ombres. Ce qui ne se disait
// que par une teinte (bouton enfoncé, ligne choisie, poignée, anneau de focus) doit rester visible.
//
// Les trois moteurs savent émuler le mode (`emulateMedia({ forcedColors })`, vérifié sous Chromium 141, Firefox 142 et
// WebKit 26) : on lit les couleurs calculées, et on vérifie que l'état « actif » diffère de l'état « repos » sans passer
// par une teinte de l'éditeur.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { aLeFocus, attend, ouvrirExemple, pilote, URL_INTEGRATION } from './aide.js';

describe('contraste forcé', () => {
  const navigateur = pilote();

  async function editeur(actif = true) {
    const { page } = await navigateur.ouvrir();
    await page.emulateMedia({ forcedColors: actif ? 'active' : 'none' });
    await ouvrirExemple(page);
    return page;
  }

  /** Ce que vaut un mot-cle de couleur du systeme (Highlight, Canvas…) dans le mode : lu sur un element-sonde. */
  const systeme = (page: Page, mot: string) => page.evaluate(m => {
    const sonde = document.createElement('span');
    sonde.style.color = m;
    document.body.appendChild(sonde);
    const v = getComputedStyle(sonde).color;
    sonde.remove();
    return v;
  }, mot);
  const style = (page: Page, sel: string, prop: string) => page.locator(sel).first().evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop);

  it('est bien actif dans le navigateur de test', async () => {
    const page = await editeur();
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  });

  it('distingue l outil enfonce de ceux au repos, par les couleurs du systeme', async () => {
    const page = await editeur();
    const actif = '.editeur-barre .icone-bouton[aria-pressed="true"]', repos = '.editeur-barre .icone-bouton[aria-pressed="false"]';
    expect(await page.locator(actif).count()).toBe(1);
    expect(await style(page, actif, 'background-color')).not.toBe(await style(page, repos, 'background-color'));
    // Le fond est Highlight et l'icone HighlightText : deux couleurs du systeme, faites pour se lire l'une sur l'autre.
    await attend(() => style(page, actif, 'background-color')).toBe(await systeme(page, 'Highlight'));
    await attend(() => style(page, actif, 'color')).toBe(await systeme(page, 'HighlightText'));
  });

  it('garde un anneau de focus de 3 px sur la toile et de 2 px sur un bouton', async () => {
    const page = await editeur();
    // Le focus arrive par le clavier : un focus par script, puis Tab et Maj+Tab qui y reviennent. Une touche Maj seule puis un
    // focus par script ne fait :focus-visible que sous Chromium (Firefox et WebKit ont une autre heuristique, voir edition.e2e.ts).
    const auClavier = async (sel: string) => {
      const el = page.locator(sel).first();
      await el.focus();
      await page.keyboard.press('Tab');
      await attend(() => aLeFocus(el)).toBe(false);
      await page.keyboard.press('Shift+Tab');
      await attend(() => aLeFocus(el)).toBe(true);
    };
    await auClavier('.editeur-svg-toile');
    await attend(() => style(page, '.editeur-svg-toile', 'outline-width')).toBe('3px');
    expect(await style(page, '.editeur-svg-toile', 'outline-style')).toBe('solid');
    expect(await style(page, '.editeur-svg-toile', 'outline-color')).toBe(await systeme(page, 'Highlight'));
    await auClavier('.editeur-barre .icone-bouton');
    await attend(() => style(page, '.editeur-barre .icone-bouton', 'outline-width')).toBe('2px');
  });

  it('garde les couleurs du dessin et dessine la selection avec les couleurs du systeme', async () => {
    const page = await editeur();
    await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
    await attend(() => page.locator('.editeur-svg-toile .coin').count()).toBe(4);
    // Le dessin : le rouge de l'exemple n'est pas remplace par une couleur du systeme.
    expect(await style(page, '.editeur-svg-toile path[data-id="f2"]', 'fill')).toBe('rgb(200, 30, 40)');
    // La selection : contour de la boite et des coins de la meme couleur, differente du rouge du dessin et de son plan.
    const boite = await style(page, '.editeur-svg-toile .boite-choisie', 'stroke');
    expect(boite).toBe(await systeme(page, 'Highlight'));
    expect(await style(page, '.editeur-svg-toile .coin', 'stroke')).toBe(boite);
    expect(await style(page, '.editeur-svg-toile .trace-choisi', 'stroke')).toBe(boite);
    expect(boite).not.toBe('rgb(200, 30, 40)');
    expect(boite).not.toBe(await style(page, '.editeur-svg-toile .plan-travail', 'stroke'));
    // Les coins sont pleins du fond du systeme : on les voit sur le dessin.
    expect(await style(page, '.editeur-svg-toile .coin', 'fill')).toBe(await systeme(page, 'Canvas'));
    expect(await style(page, '.editeur-svg-toile .coin', 'stroke-width')).toBe('2px');
  });

  it('montre la ligne choisie des calques autrement que par une teinte legere', async () => {
    const page = await editeur();
    await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
    await attend(() => page.locator('.editeur-calques ol > li.choisi').count()).toBe(1);
    const choisie = '.editeur-calques ol > li.choisi', autre = '.editeur-calques ol > li:not(.choisi)';
    // Les boutons ont 120 ms de transition de couleur : on attend l'etat final, on ne lit pas en route.
    await attend(() => style(page, choisie, 'background-color')).toBe(await systeme(page, 'Highlight'));
    await attend(() => style(page, choisie + ' .calque-nom', 'color')).toBe(await systeme(page, 'HighlightText'));
    expect(await style(page, autre, 'background-color')).not.toBe(await systeme(page, 'Highlight'));
  });

  it('montre l element de menu survole ou au focus avec un fond et une couleur du systeme', async () => {
    const page = await editeur();
    await page.locator('.menu-bouton', { hasText: 'Vue' }).click();
    const elements = page.locator('.menu-panneau [role^=menuitem]:not([disabled])');
    // Le clavier fait le focus : :focus-visible ne s'applique pas a un focus donne par script apres un clic.
    await page.keyboard.press('ArrowDown');
    await attend(() => elements.first().evaluate(e => getComputedStyle(e).outlineStyle)).toBe('solid');
    const fond = (i: number) => elements.nth(i).evaluate(e => getComputedStyle(e).backgroundColor);
    await attend(() => fond(0)).toBe(await systeme(page, 'Highlight'));
    expect(await fond(1)).not.toBe(await systeme(page, 'Highlight'));
  });

  it('ne change rien hors du mode : les memes boutons gardent leur couleur d outil', async () => {
    const page = await editeur(false);
    // Hors contraste force, l'outil enfonce porte la couleur d'outil (jeton --cyan), pas un mot-cle du systeme.
    const fond = await style(page, '.editeur-barre .icone-bouton[aria-pressed="true"]', 'background-color');
    expect(fond).toBe('rgb(0, 113, 156)');
  });

  it('vaut aussi pour l editeur embarque, dont la feuille est cantonnee a sa racine', async () => {
    const { page } = await navigateur.ouvrir({ naviguer: false });
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto(URL_INTEGRATION);
    await page.locator('#editer').click();
    await page.locator('.editeur-svg .editeur-cadre').waitFor();
    const actif = '.editeur-svg .editeur-barre .icone-bouton[aria-pressed="true"]';
    await attend(() => style(page, actif, 'background-color')).toBe(await systeme(page, 'Highlight'));
  });

  it('redit le lisere de survol d une forme en Highlight sur un halo Canvas (ADR-0029)', async () => {
    const page = await editeur();
    const centre = await page.locator('.editeur-svg-toile path[data-id="f2"]').evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(centre.x, centre.y);
    await attend(() => page.locator('.editeur-svg-toile .lisere-survol').count()).toBe(1);
    expect(await style(page, '.editeur-svg-toile .lisere-survol', 'stroke')).toBe(await systeme(page, 'Highlight'));
    expect(await style(page, '.editeur-svg-toile .lisere-survol-fond', 'stroke')).toBe(await systeme(page, 'Canvas'));
  });
});

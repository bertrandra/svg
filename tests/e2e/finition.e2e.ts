// La finition transversale (DESIGN.md) mesuree dans la page construite : ce que le navigateur dessine seul porte les jetons
// (couleur d'accent, texte d'exemple, texte choisi, curseur de saisie, barres de defilement, anneau de focus des liens), les
// chiffres qui changent sont tabulaires, la chasse fixe reste en 400/500, une seule action pleine se voit a la fois, « aucun »
// n'est pas rouge, un succes n'est pas ambre, et les cibles du tiroir font 40 px au doigt. Chaque mesure se lit dans les deux themes.

import { describe, expect, it } from 'vitest';
import type { Locator, Page } from 'playwright';
import { attend, attendreAnimations, ouvrirExemple, pilote, texteDe } from './aide.js';

type Schema = 'light' | 'dark';
const SCHEMAS: readonly Schema[] = ['light', 'dark'];

/** La valeur calculee d'un jeton (« --cyan »), en rgb(), comme getComputedStyle la rend pour une couleur. */
function jeton(page: Page, nom: string): Promise<string> {
  return page.evaluate(n => {
    const sonde = document.createElement('i');
    sonde.style.color = 'var(' + n + ')';
    document.body.appendChild(sonde);
    const c = getComputedStyle(sonde).color;
    sonde.remove();
    return c;
  }, nom);
}

/** Le contraste WCAG entre deux couleurs rgb()/rgba() opaques. */
function contraste(a: string, b: string): number {
  const lin = (c: string) => {
    const [r = 0, v = 0, bl = 0] = (c.match(/[\d.]+/g) ?? []).map(Number);
    const l = [r, v, bl].map(x => x / 255).map(x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (l[0] ?? 0) + 0.7152 * (l[1] ?? 0) + 0.0722 * (l[2] ?? 0);
  };
  const [h, s] = [lin(a), lin(b)].sort((x, y) => y - x);
  return ((h ?? 0) + 0.05) / ((s ?? 0) + 0.05);
}

/** Le texte d'exemple d'un champ : sa couleur, son fond (celui du champ), sa famille. */
function exemple(l: Locator) {
  return l.evaluate(e => {
    const p = getComputedStyle(e, '::placeholder');
    return { couleur: p.color, fond: getComputedStyle(e).backgroundColor, famille: p.fontFamily, opacite: p.opacity };
  });
}

/** Les boutons visibles dont le fond est la couleur d'outil : les actions « pleines » qu'on voit, avec leur zone. */
async function pleins(page: Page): Promise<Array<{ texte: string; zone: string }>> {
  // Un bouton passe d'un fond a l'autre en 120 ms : on lit l'etat d'arrivee.
  await attendreAnimations(page);
  const cyan = await jeton(page, '--cyan');
  // checkVisibility : un bouton dans une section repliee garde une boite (content-visibility), il ne se voit pas pour autant.
  return page.evaluate(c => Array.from(document.querySelectorAll('button')).filter(b => {
    const r = b.getBoundingClientRect(), s = getComputedStyle(b);
    return r.width > 0 && r.height > 0 && b.checkVisibility({ visibilityProperty: true }) && s.backgroundColor === c && b.closest('[aria-hidden="true"]') === null
      && !b.matches('.icone-bouton, .mini-onglets button, .echantillon, .aucun') && r.right > 0 && r.left < window.innerWidth;
  }).map(b => {
    const zone = b.closest('.menu-panneau') ? 'menu' : b.closest('.editeur-confirmer') ? 'confirmation' : b.closest('.editeur-barre') ? 'barre'
      : b.closest('.editeur-etat') ? 'etat' : b.closest('.editeur-calques') ? 'calques' : b.closest('.panneau-cricut') ? 'cricut'
      : b.closest('.editeur-inspecteur details.section') ? 'section:' + (b.closest('details.section')?.querySelector('summary')?.textContent ?? '') : 'autre';
    return { texte: (b.textContent ?? '').trim(), zone };
  }), cyan);
}

/** Une action pleine au plus par panneau. */
function unParPanneau(liste: ReadonlyArray<{ zone: string }>): Record<string, number> {
  const n: Record<string, number> = {};
  for (const { zone } of liste) n[zone] = (n[zone] ?? 0) + 1;
  return Object.fromEntries(Object.entries(n).filter(([, k]) => k > 1));
}

describe('la finition transversale', () => {
  const navigateur = pilote();

  async function editeur(schema: Schema, options: { largeur?: number; tactile?: boolean } = {}) {
    const { page } = await navigateur.ouvrir({ schema, largeur: options.largeur ?? 1280, hauteur: 800, ...(options.tactile ? { tactile: true } : {}) });
    await ouvrirExemple(page, options.tactile);
    return page;
  }

  for (const schema of SCHEMAS) {
    describe(`thème ${schema === 'light' ? 'clair' : 'sombre'}`, () => {
      it('pose la couleur d outil sur les curseurs, les cases et le curseur de saisie ; le texte choisi et les barres de défilement sur leurs jetons', async () => {
        const page = await editeur(schema);
        const cyan = await jeton(page, '--cyan');
        await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
        const curseur = page.locator('.editeur-inspecteur input[type=range]').first();
        expect(await curseur.evaluate(e => getComputedStyle(e).accentColor)).toBe(cyan);
        const surfaces = await page.evaluate(() => ({
          caret: getComputedStyle(document.body).caretColor,
          selection: getComputedStyle(document.body, '::selection').backgroundColor,
          defilement: getComputedStyle(document.querySelector('.editeur-inspecteur') ?? document.body).scrollbarColor
        }));
        expect(surfaces.caret).toBe(cyan);
        expect(surfaces.selection).toBe(await jeton(page, '--selection'));
        expect(surfaces.defilement.startsWith(await jeton(page, '--filet-fort'))).toBe(true);
        // Les cases a cocher du menu d'export (options) : la meme couleur, plus « auto ».
        await page.locator('.menu-bouton', { hasText: 'Fichier' }).click();
        await page.locator('.menu-panneau details.section > summary', { hasText: 'Options d’export' }).click();
        const caseExport = page.locator('.menu-panneau input[type=checkbox]').first();
        expect(await caseExport.evaluate(e => getComputedStyle(e).accentColor)).toBe(cyan);
      });

      it('donne au texte d exemple 4,5:1 sur le fond de son champ, et la grotesque quand ce sont des mots', async () => {
        const { page } = await navigateur.ouvrir({ schema, largeur: 1280, hauteur: 800 });
        const accueil = await exemple(page.locator('section[aria-label="Ouvrir un SVG"] textarea'));
        expect(contraste(accueil.couleur, accueil.fond), JSON.stringify(accueil)).toBeGreaterThanOrEqual(4.5);
        expect(accueil.opacite).toBe('1');
        await ouvrirExemple(page);
        await page.locator('.editeur-calques button.calque-nom[data-forme="f4"]').click();
        const code = page.locator('.editeur-inspecteur input[aria-label="Remplissage (code)"]');
        const aucun = await exemple(code);
        expect(contraste(aucun.couleur, aucun.fond), JSON.stringify(aucun)).toBeGreaterThanOrEqual(4.5);
        expect(aucun.famille).toMatch(/^"?Instrument Sans/);
        await page.locator('.menu-bouton', { hasText: 'Fichier' }).click();
        await page.locator('.menu-panneau details.section > summary', { hasText: 'Options d’export' }).click();
        const largeur = await exemple(page.locator('.menu-panneau input[aria-label="Largeur du dessin exporté"]'));
        expect(contraste(largeur.couleur, largeur.fond), JSON.stringify(largeur)).toBeGreaterThanOrEqual(4.5);
        expect(largeur.famille).toMatch(/^"?Instrument Sans/);
      });

      it('ne pose jamais plus d une action pleine par panneau, et seulement celle du menu ou de la confirmation quand ils sont ouverts', async () => {
        const page = await editeur(schema);
        expect(unParPanneau(await pleins(page))).toEqual({});
        // Une modification, puis le menu Fichier : « Enregistrer » de la barre se retire, le menu n'a pas d'action pleine a lui.
        await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
        await page.keyboard.press('Delete');
        expect((await pleins(page)).map(p => p.texte)).toEqual(['Enregistrer']);
        await page.locator('.menu-bouton', { hasText: 'Fichier' }).click();
        await page.getByRole('menu', { name: 'Fichier' }).waitFor();
        expect(await pleins(page)).toEqual([]);
        await page.keyboard.press('Escape');
        // La confirmation d'abandon : l'action sure est la seule pleine.
        await page.keyboard.press('Escape');
        await page.getByRole('alertdialog').waitFor();
        expect(await pleins(page)).toEqual([{ texte: 'Continuer l’édition', zone: 'confirmation' }]);
        await page.keyboard.press('Escape');
        await attend(async () => (await pleins(page)).map(p => p.texte)).toEqual(['Enregistrer']);
      });

      it('en contexte Cricut : l export du panneau est la seule action pleine, celle du menu Fichier la remplace quand il s ouvre', async () => {
        const page = await editeur(schema);
        await page.locator('.selecteur-contexte .menu-bouton').click();
        await page.getByRole('menuitemradio', { name: 'Cricut' }).click();
        await page.locator('.panneau-cricut .constat, .panneau-cricut .pret').first().waitFor();
        await attendreAnimations(page);
        expect(await pleins(page)).toEqual([{ texte: 'Exporter pour Cricut', zone: 'cricut' }]);
        await page.locator('.menu-bouton', { hasText: 'Fichier' }).click();
        await page.getByRole('menu', { name: 'Fichier' }).waitFor();
        expect(await pleins(page)).toEqual([{ texte: 'Exporter pour Cricut', zone: 'menu' }]);
      });

      it('rend « aucun » par la couleur d outil et une barre oblique, jamais par le rouge d échec, à la souris comme au doigt', async () => {
        for (const tactile of [false, true]) {
          const page = await editeur(schema, tactile ? { largeur: 390, tactile } : {});
          const bouton = page.locator('.pastille-style button.aucun').first();
          if (tactile) await bouton.tap(); else await bouton.click();
          await attend(() => bouton.getAttribute('aria-pressed')).toBe('true');
          const [cyan, echec] = [await jeton(page, '--cyan'), await jeton(page, '--echec')];
          // Les couleurs d'un bouton passent en 120 ms : on attend la fin de la transition avant de les lire.
          await attend(() => bouton.evaluate(e => getComputedStyle(e).color)).toBe(cyan);
          const s = await bouton.evaluate(e => { const c = getComputedStyle(e); return { fond: c.backgroundColor, texte: c.color, filet: c.boxShadow + ' ' + c.borderColor }; });
          expect(s.fond, JSON.stringify(s)).not.toBe(echec);
          expect(s.texte).toBe(cyan);
          expect(s.filet).toContain(cyan);
          expect(await bouton.locator('svg path').count()).toBe(1);
        }
      });

      it('dit un succès en neutre (role status), garde l ambre aux avertissements', async () => {
        const page = await editeur(schema);
        await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
        await page.keyboard.press('Delete');
        await page.keyboard.press('Control+s');
        const message = page.locator('main.accueil > p.message');
        await message.waitFor();
        expect(await message.getAttribute('role')).toBe('status');
        const s = await message.evaluate(e => ({ fond: getComputedStyle(e).backgroundColor, texte: getComputedStyle(e).color }));
        expect(s.fond).toBe(await jeton(page, '--panneau'));
        expect(s.texte).toBe(await jeton(page, '--encre'));
        expect(s.fond).not.toBe(await jeton(page, '--alerte-fond'));
      });

      it('écrit les chiffres qui changent en tabulaires, et la valeur du curseur ne change pas de largeur', async () => {
        const page = await editeur(schema);
        await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
        for (const sel of ['.compte-modifications', '.editeur-barre .zoom', '.editeur-barre-selection > .aide', '.editeur-calques h3 .aide', '.editeur-inspecteur .champ-ligne > .aide']) {
          expect(await page.locator(sel).first().evaluate(e => getComputedStyle(e).fontVariantNumeric), sel).toContain('tabular-nums');
        }
        const valeur = page.locator('.editeur-inspecteur .champ-ligne > .aide').first();
        const avant = (await valeur.boundingBox())?.width;
        await page.locator('.editeur-inspecteur input[type=range]').first().focus();
        await page.keyboard.press('Home');
        await attend(() => texteDe(valeur)).toBe('0 %');
        expect((await valeur.boundingBox())?.width).toBe(avant);
      });

      it('garde la chasse fixe en 400 ou 500, et écrit les codes de couleur à l encre, le nom du nuancier devant', async () => {
        const page = await editeur(schema);
        const graisses = await page.evaluate(() => Array.from(document.querySelectorAll('.editeur-svg *')).filter(e => getComputedStyle(e).fontFamily.startsWith('"IBM Plex Mono"') && (e.textContent ?? '').trim())
          .map(e => Number(getComputedStyle(e).fontWeight)));
        expect(graisses.length).toBeGreaterThan(3);
        expect(graisses.filter(g => g > 500)).toEqual([]);
        const rouge = page.locator('.couleurs-dessin button.couleur-code', { hasText: '#C81E28' });
        expect(await texteDe(rouge)).toBe('Rouge #C81E28 · 1');
        expect(await rouge.evaluate(e => getComputedStyle(e).color)).toBe(await jeton(page, '--encre'));
        expect(await rouge.evaluate(e => getComputedStyle(e).color)).not.toBe(await jeton(page, '--cyan'));
      });

      it('nomme les calques par leur genre, pose une pastille à filet même sans fond, et détache la pastille d encre du panneau', async () => {
        const page = await editeur(schema);
        const noms = await page.locator('.editeur-calques ol > li .calque-nom').evaluateAll(l => l.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
        expect(noms).toEqual(['Courbe 4', 'Triangle 3', 'Cercle 2', 'Tracé courbe 1']);
        // Le nom accessible commence par le libelle visible (WCAG 2.5.3), puis dit la peinture.
        expect(await page.locator('.editeur-calques ol > li .calque-nom').first().getAttribute('aria-label')).toMatch(/^Courbe 4, sans fond, contour/);
        // La courbe n'a pas de fond : sa pastille est vide, bordee du filet fort, son contour (#15181d) en anneau interieur.
        const vide = await page.locator('.editeur-calques ol > li .echantillon').first().evaluate(e => { const c = getComputedStyle(e); return { largeur: c.borderTopWidth, couleur: c.borderTopColor, style: c.borderTopStyle, fond: c.backgroundColor, anneau: c.boxShadow }; });
        expect(vide.largeur).toBe('1px');
        expect(vide.style).toBe('solid');
        expect(vide.couleur).toBe(await jeton(page, '--filet-fort'));
        expect(vide.fond).toBe('rgba(0, 0, 0, 0)');
        expect(vide.anneau).toContain('rgb(21, 24, 29)');
        await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
        const encre = page.locator('.editeur-inspecteur .nuancier button.echantillon[aria-label="Encre"]').first();
        expect(await encre.evaluate(e => getComputedStyle(e).borderTopColor)).toBe(await jeton(page, '--filet-fort'));
      });

      it('donne aux liens l anneau de focus cyan de 2 px et un soulignement détaché', async () => {
        const { page } = await navigateur.ouvrir({ schema, largeur: 1280, hauteur: 800 });
        const lien = page.locator('.pied a', { hasText: 'game-icons.net' });
        await lien.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        const s = await lien.evaluate(e => ({ actif: e === document.activeElement, contour: getComputedStyle(e).outlineStyle + ' ' + getComputedStyle(e).outlineWidth, couleur: getComputedStyle(e).outlineColor, decalage: getComputedStyle(e).textUnderlineOffset }));
        expect(s.actif).toBe(true);
        expect(s.contour).toBe('solid 2px');
        expect(s.couleur).toBe(await jeton(page, '--cyan'));
        expect(s.decalage).not.toBe('auto');
      });
    });
  }

  it('borne la mesure des paragraphes de l accueil sous 76 caractères par ligne, et aligne « À propos et crédits » sur le texte', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    const parLigne = (l: Locator) => l.evaluate(e => {
      const hauteur = parseFloat(getComputedStyle(e).lineHeight), lignes = Math.round(e.getBoundingClientRect().height / hauteur);
      return Math.round((e.textContent ?? '').length / lignes);
    });
    expect(await parLigne(page.locator('.pied p').first())).toBeLessThanOrEqual(76);
    expect(await parLigne(page.locator('.tete p'))).toBeLessThanOrEqual(76);
    await page.getByRole('tab', { name: /Bibliothèque/ }).click();
    expect(await parLigne(page.locator('.bibliotheque > p.aide'))).toBeLessThanOrEqual(76);
    const texte = await page.locator('.pied p').first().evaluate(e => e.getBoundingClientRect().left);
    const libelle = await page.getByRole('button', { name: 'À propos et crédits' }).evaluate(e => {
      const r = document.createRange();
      r.selectNodeContents(e);
      return r.getBoundingClientRect().left;
    });
    expect(Math.abs(libelle - texte)).toBeLessThanOrEqual(1);
  });

  it('au doigt, dans le tiroir de l inspecteur : pastilles du nuancier et curseur d opacité de 40 px, raccourcis masqués, rangée de sélection sans défilement', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 390, hauteur: 800, tactile: true });
    await ouvrirExemple(page, true);
    await page.locator('.editeur-svg-toile path[data-id="f2"]').tap();
    const rangee = page.locator('.editeur-barre-selection');
    expect(await rangee.evaluate(e => e.scrollWidth - e.clientWidth)).toBe(0);
    await page.locator('.editeur-etat button[aria-label="Inspecteur"]').tap();
    await attend(() => page.locator('.editeur-inspecteur').evaluate(e => getComputedStyle(e).transform)).toBe('none');
    const tailles = await page.locator('.editeur-inspecteur .nuancier button.echantillon, .editeur-inspecteur input[type=range]').evaluateAll(l => l.map(e => {
      const r = e.getBoundingClientRect();
      return { l: Math.round(r.width), h: Math.round(r.height) };
    }));
    expect(tailles.length).toBeGreaterThan(8);
    expect(tailles.filter(t => t.l < 40 || t.h < 40)).toEqual([]);
    // Les menus : pas de raccourci clavier au doigt, et « Plus » commence par Édition, le zoom en dernier de la vue.
    await page.locator('.voile').tap({ position: { x: 20, y: 300 } });
    await page.getByRole('button', { name: /^Plus d’actions/ }).tap();
    await page.getByRole('menu', { name: 'Vue' }).waitFor();
    expect(await page.locator('.menu-panneau .menu-raccourci').evaluateAll(l => l.filter(e => e.getBoundingClientRect().width > 0).length)).toBe(0);
    expect(await page.locator('.menu-panneau .menu-rubrique > .menu-titre').allTextContents()).toEqual(expect.arrayContaining(['Édition', 'Fichier', 'Vue']));
    expect((await page.locator('.menu-panneau .menu-rubrique > .menu-titre').allTextContents()).slice(0, 3)).toEqual(['Édition', 'Fichier', 'Vue']);
    expect((await page.getByRole('menu', { name: 'Vue' }).getByRole('menuitem').allInnerTexts()).map(t => t.trim()).slice(-2)).toEqual(['Zoomer', 'Dézoomer']);
  });

  it('au doigt, dit « Touchez » là où la souris dit « Cliquez »', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 390, hauteur: 800, tactile: true });
    await ouvrirExemple(page, true);
    expect(await texteDe(page.locator('.message-etat'))).toMatch(/^Touchez une forme/);
    const bureau = (await navigateur.ouvrir({ largeur: 1280, hauteur: 800 })).page;
    await ouvrirExemple(bureau);
    expect(await texteDe(bureau.locator('.message-etat'))).toMatch(/^Cliquez une forme/);
  });

  it('dit ce que fait le niveau de zoom, et distingue « 0 (zéro) » de « O » dans le menu Vue', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirExemple(page);
    const zoom = page.locator('.editeur-barre .zoom');
    expect(await zoom.getAttribute('aria-label')).toMatch(/^\d+ % : ajuster à l’écran$/);
    await page.locator('.menu-bouton', { hasText: 'Vue' }).click();
    expect(await texteDe(page.getByRole('menuitem', { name: /Ajuster à l’écran/ }).locator('kbd'))).toBe('0 (zéro)');
    expect(await texteDe(page.getByRole('menuitemcheckbox', { name: /Vue contours/ }).locator('kbd'))).toBe('O');
  });

  it('ne laisse pas la note de « Transformer » passer sur deux lignes', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirExemple(page);
    await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
    const resume = page.locator('.editeur-inspecteur details.section > summary', { hasText: 'Transformer' });
    const { hauteur, ligne } = await resume.locator('.aide').evaluate(e => ({ hauteur: e.getBoundingClientRect().height, ligne: parseFloat(getComputedStyle(e).lineHeight) }));
    expect(hauteur).toBeLessThan(ligne * 1.5);
  });
});

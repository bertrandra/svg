// L'editeur au clavier seul et au lecteur d'ecran : passer d'une forme a l'autre, redimensionner, tourner,
// parcourir les points, dessiner au reticule, le focus a l'ouverture et a la fermeture (editeur, confirmation,
// tiroirs, menus), l'absence de piege au clavier (WCAG 2.1.2) et la region vocale unique.
//
// Les phrases sont celles que dit la region « polite » (.annonces) : ce que le lecteur d'ecran entend est
// ce que le test lit. Le dessin d'exemple : f1 rectangle arrondi, f2 cercle rouge, f3 triangle bleu, f4 courbe.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { aLeFocus, attend, formesVisibles, ouvrirExemple, pilote, URL_INTEGRATION } from './aide.js';

describe('clavier et lecteur d ecran', () => {
  const navigateur = pilote();

  async function editeur(options: Parameters<typeof navigateur.ouvrir>[0] = {}) {
    const { page } = await navigateur.ouvrir(options);
    await ouvrirExemple(page);
    await attend(() => aLeFocus(toile(page))).toBe(true);
    return page;
  }

  const toile = (page: Page) => page.locator('.editeur-svg-toile');
  const forme = (page: Page, id: string) => page.locator(`.editeur-svg-toile path[data-id="${id}"]`);
  const annonces = (page: Page) => page.locator('.editeur-cadre > .annonces');
  const dit = (page: Page) => annonces(page).evaluate(e => (e.textContent ?? '').trim());
  const choisies = (page: Page) => page.locator('.editeur-calques ol > li.choisi .calque-nom').evaluateAll(l => l.map(e => (e as HTMLElement).innerText.trim()));
  /** Le focus est-il sur la toile ? */
  const surLaToile = (page: Page) => aLeFocus(toile(page));
  async function choisirForme(page: Page, numero: number) {
    for (let i = 0; i < numero; i++) await page.keyboard.press('PageDown');
    await attend(() => dit(page)).toMatch(new RegExp('^Forme ' + numero + ' sélectionnée'));
  }

  describe('choisir une forme', () => {
    it('prend le focus a l ouverture, et le rend a l hote a la fermeture', async () => {
      const { page } = await navigateur.ouvrir();
      const bouton = page.getByRole('button', { name: 'Ouvrir l’exemple' });
      await bouton.focus();
      await bouton.press('Enter');
      await page.locator('.editeur-cadre').waitFor();
      await attend(() => surLaToile(page)).toBe(true);

      // Sans modification, Echap (rien de choisi, outil selection) ferme l'editeur : le bouton de l'hote retrouve le focus.
      await page.keyboard.press('Escape');
      await attend(() => page.locator('.editeur-cadre').count()).toBe(0);
      await attend(() => aLeFocus(bouton)).toBe(true);
    });

    it('parcourt les formes du fond au premier plan avec Tab, et dit chacune', async () => {
      const page = await editeur();
      // Rien de choisi : Tab n'est pas pris, le focus quitte la toile.
      await page.keyboard.press('Tab');
      await attend(() => surLaToile(page)).toBe(false);
      await page.keyboard.press('Shift+Tab');
      await attend(() => surLaToile(page)).toBe(true);

      await page.keyboard.press('PageDown');
      await attend(() => dit(page)).toBe('Forme 1 sélectionnée : tracé courbe, fond blanc #e9ecef, 208 × 128 à 16, 16.');
      await page.keyboard.press('Tab');
      await attend(() => dit(page)).toBe('Forme 2 sélectionnée : cercle, fond rouge #c81e28, 80 × 80 à 40, 40.');
      await page.keyboard.press('Tab');
      await attend(() => dit(page)).toBe('Forme 3 sélectionnée : triangle, fond bleu #1428a0, 80 × 80 à 130, 40.');
      expect(await surLaToile(page)).toBe(true);
      await page.keyboard.press('Shift+Tab');
      await attend(() => dit(page)).toMatch(/^Forme 2 sélectionnée/);
      expect(await choisies(page)).toEqual(['Forme 2']);
      expect(await page.locator('.editeur-svg-toile .trace-choisi').count()).toBe(1);
    });

    it('laisse Tab quitter la toile apres la derniere forme et avant la premiere : pas de piege', async () => {
      const page = await editeur();
      await choisirForme(page, 4);
      await page.keyboard.press('Tab');
      await attend(() => surLaToile(page)).toBe(false);
      // La selection est gardee : Maj+Tab revient sur la toile, puis recule d'une forme.
      expect(await choisies(page)).toEqual(['Forme 4']);
      await page.keyboard.press('Shift+Tab');
      await attend(() => surLaToile(page)).toBe(true);
      await page.keyboard.press('Shift+Tab');
      await attend(() => dit(page)).toMatch(/^Forme 3 sélectionnée/);

      // Avant la premiere : Maj+Tab sort par l'autre bout.
      await page.keyboard.press('Escape');
      await choisirForme(page, 1);
      await page.keyboard.press('Shift+Tab');
      await attend(() => surLaToile(page)).toBe(false);
    });

    it('sort de la toile par Echap puis Tab, meme au milieu des formes', async () => {
      const page = await editeur();
      await choisirForme(page, 2);
      await page.keyboard.press('Escape');
      await attend(() => dit(page)).toBe('Sélection vidée.');
      expect(await choisies(page)).toEqual([]);
      await page.keyboard.press('Tab');
      await attend(() => surLaToile(page)).toBe(false);
    });

    it('boucle avec Page suivante et Page precedente, meme sans selection', async () => {
      const page = await editeur();
      await page.keyboard.press('PageUp');
      await attend(() => dit(page)).toMatch(/^Forme 4 sélectionnée/);
      await page.keyboard.press('PageDown');
      await attend(() => dit(page)).toMatch(/^Forme 1 sélectionnée/);
      await page.keyboard.press('PageUp');
      await attend(() => dit(page)).toMatch(/^Forme 4 sélectionnée/);
    });

    it('saute les formes verrouillees', async () => {
      const page = await editeur();
      await page.getByRole('button', { name: 'Verrouiller la forme 2' }).click();
      await toile(page).focus();
      await choisirForme(page, 1);
      await page.keyboard.press('Tab');
      await attend(() => dit(page)).toMatch(/^Forme 3 sélectionnée/);
    });

    it('nomme chaque calque avec sa couleur, et garde le nombre de formes dans le nom de la toile', async () => {
      const page = await editeur();
      await page.getByRole('button', { name: 'Forme 2, cercle, fond rouge #c81e28', exact: true }).waitFor();
      expect(await page.getByRole('button', { name: /^Forme \d, .*(fond|sans fond)/ }).count()).toBe(4);
      expect(await toile(page).getAttribute('aria-label')).toBe('Plan de travail de exemple.svg : 4 formes');
      // Le calque dit s'il est choisi.
      await choisirForme(page, 2);
      await attend(() => page.getByRole('button', { name: /^Forme 2,/, pressed: true }).count()).toBe(1);
    });

    it('decrit la sortie de la toile a qui y arrive', async () => {
      const page = await editeur();
      const idAide = await toile(page).getAttribute('aria-describedby');
      expect(idAide).toBeTruthy();
      expect(await page.locator(`[id="${idAide}"]`).textContent()).toContain('Échap puis Tab : quitter la toile');
    });
  });

  describe('redimensionner et tourner', () => {
    it('agrandit et reduit avec Alt et les fleches, le coin haut gauche fixe, Maj par dix', async () => {
      const page = await editeur();
      await choisirForme(page, 2);
      const avant = await forme(page, 'f2').boundingBox();
      if (!avant) throw new Error('f2 sans boite');
      await page.keyboard.press('Alt+ArrowRight');
      await attend(() => dit(page)).toBe('80,2 × 80.');
      await page.keyboard.press('Alt+Shift+ArrowDown');
      await attend(() => dit(page)).toBe('80,2 × 82,4.');
      await page.keyboard.press('Alt+Shift+ArrowRight');
      await page.keyboard.press('Alt+Shift+ArrowRight');
      await attend(() => dit(page)).toBe('85 × 82,4.');
      const apres = await forme(page, 'f2').boundingBox();
      if (!apres) throw new Error('f2 sans boite apres');
      expect(apres.width).toBeGreaterThan(avant.width + 3);
      expect(apres.height).toBeGreaterThan(avant.height + 1);
      // Le coin haut gauche n'a pas bouge.
      expect(Math.abs(apres.x - avant.x)).toBeLessThan(0.6);
      expect(Math.abs(apres.y - avant.y)).toBeLessThan(0.6);

      await page.keyboard.press('Alt+Shift+ArrowLeft');
      await page.keyboard.press('Alt+ArrowUp');
      await attend(() => dit(page)).toBe('82,6 × 82,2.');
    });

    it('ne deplace pas la selection quand Alt redimensionne, et la deplace avec les fleches seules', async () => {
      const page = await editeur();
      await choisirForme(page, 2);
      await page.keyboard.press('Alt+ArrowRight');
      await page.keyboard.press('ArrowRight');
      await attend(() => dit(page)).toBe('À 40,2, 40.');
      await page.keyboard.press('Shift+ArrowDown');
      await attend(() => dit(page)).toBe('À 40,2, 42,4.');
    });

    it('tourne de 15 degres avec Ctrl et les fleches gauche et droite, de 1 degre avec Maj', async () => {
      const page = await editeur();
      await choisirForme(page, 3);
      const avant = await forme(page, 'f3').boundingBox();
      if (!avant) throw new Error('f3 sans boite');
      await page.keyboard.press('Control+ArrowRight');
      await attend(() => dit(page)).toBe('Tournée de 15° vers la droite.');
      const apres = await forme(page, 'f3').boundingBox();
      expect(apres && Math.abs(apres.width - avant.width) + Math.abs(apres.height - avant.height)).toBeGreaterThan(1);
      await page.keyboard.press('Control+Shift+ArrowLeft');
      await attend(() => dit(page)).toBe('Tournée de 1° vers la gauche.');
      // Deux gestes, deux annulations : on revient a la boite d'origine.
      await page.keyboard.press('Control+z');
      await page.keyboard.press('Control+z');
      await attend(async () => Math.round(((await forme(page, 'f3').boundingBox())?.width ?? 0) * 10)).toBe(Math.round(avant.width * 10));
    });
  });

  describe('les points au clavier', () => {
    it('entre dans les points par Entree, les parcourt avec Tab, les deplace aux fleches, et sort apres le dernier', async () => {
      const page = await editeur();
      await choisirForme(page, 3);
      await page.keyboard.press('Enter');
      await attend(() => dit(page)).toMatch(/^Outil points/);
      expect(await page.getByRole('button', { name: /^Points et poignées/ }).getAttribute('aria-pressed')).toBe('true');

      await page.keyboard.press('Tab');
      await attend(() => dit(page)).toBe('Point 1 sur 3 : départ, à 130, 120.');
      await page.keyboard.press('Tab');
      await attend(() => dit(page)).toBe('Point 2 sur 3 : angle, à 170, 40.');
      await page.keyboard.press('ArrowRight');
      await attend(() => dit(page)).toBe('Point 2 sur 3 : angle, à 170,2, 40.');
      await page.keyboard.press('Shift+ArrowUp');
      await attend(() => dit(page)).toBe('Point 2 sur 3 : angle, à 170,2, 37,6.');
      await page.keyboard.press('Shift+Tab');
      await attend(() => dit(page)).toBe('Point 1 sur 3 : départ, à 130, 120.');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await attend(() => dit(page)).toMatch(/^Point 3 sur 3/);
      expect(await surLaToile(page)).toBe(true);
      await page.keyboard.press('Tab');
      await attend(() => surLaToile(page)).toBe(false);
    });

    it('revient du point a la forme par Echap, et PageSuiv change de forme sans quitter les points', async () => {
      const page = await editeur();
      await choisirForme(page, 3);
      await page.keyboard.press('a');
      await page.keyboard.press('Tab');
      await attend(() => dit(page)).toMatch(/^Point 1 sur 3/);
      await page.keyboard.press('Escape');
      expect(await choisies(page)).toEqual(['Forme 3']);
      await page.keyboard.press('PageDown');
      await attend(() => dit(page)).toMatch(/^Forme 4 sélectionnée/);
      expect(await page.getByRole('button', { name: /^Points et poignées/ }).getAttribute('aria-pressed')).toBe('true');
      await page.keyboard.press('Tab');
      await attend(() => dit(page)).toMatch(/^Point 1 sur 2/);
    });
  });

  describe('dessiner au reticule', () => {
    it('pose un rectangle centre sur le reticule, choisi et pret a redimensionner', async () => {
      const page = await editeur();
      await page.keyboard.press('r');
      await attend(() => dit(page)).toMatch(/^Outil rectangle : flèches déplacent le réticule/);
      expect(await page.locator('.reticule').count()).toBe(0);
      await page.keyboard.press('ArrowRight');
      await attend(() => dit(page)).toMatch(/^Réticule à /);
      await attend(() => page.locator('.editeur-svg-toile .reticule').count()).toBe(1);
      const avantY = await page.locator('.reticule circle').getAttribute('cy');
      await page.keyboard.press('Shift+ArrowDown');
      await attend(() => page.locator('.reticule circle').getAttribute('cy')).not.toBe(avantY);
      const cx = Number(await page.locator('.reticule circle').getAttribute('cx')), cy = Number(await page.locator('.reticule circle').getAttribute('cy'));

      await page.keyboard.press('Enter');
      await attend(() => formesVisibles(page)).toBe(5);
      await attend(() => dit(page)).toMatch(/^Forme 5 ajoutée et sélectionnée : carré, fond \w+ #[0-9a-f]{6}, 40 × 40 à .*Alt et flèches la redimensionnent/);
      // Centree sur le reticule, en coordonnees du plan (la rangee de selection decale la toile a l'ecran).
      const dire = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
      expect(await dit(page)).toContain(' à ' + dire(cx - 20) + ', ' + dire(cy - 20) + '.');
      // L'outil est revenu a la selection, le reticule a disparu, la toile a toujours le focus.
      expect(await page.locator('.reticule').count()).toBe(0);
      expect(await surLaToile(page)).toBe(true);
      expect(await choisies(page)).toEqual(['Forme 5']);
      expect(await toile(page).getAttribute('aria-label')).toBe('Plan de travail de exemple.svg : 5 formes');
      await page.keyboard.press('Alt+ArrowRight');
      await attend(() => dit(page)).toBe('40,2 × 40.');
    });

    it('pose une ellipse, une etoile et une ligne de la meme facon', async () => {
      const page = await editeur();
      for (const [touche, attendu, n] of [['e', 'cercle', 5], ['s', 'étoile', 6], ['l', 'ligne', 7]] as const) {
        await page.keyboard.press(touche);
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('Enter');
        await attend(() => formesVisibles(page)).toBe(n);
        await attend(() => dit(page)).toMatch(new RegExp('^Forme ' + n + ' ajoutée et sélectionnée : ' + attendu));
        await toile(page).focus();
      }
    });

    it('place les points de la plume au reticule, et Maj+Entree termine le trace', async () => {
      const page = await editeur();
      await page.keyboard.press('p');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Enter');
      await attend(() => dit(page)).toMatch(/^Point 1 posé\. Réticule à /);
      await page.keyboard.press('Shift+ArrowRight');
      await page.keyboard.press('Enter');
      await attend(() => dit(page)).toMatch(/^Point 2 posé/);
      await page.keyboard.press('Shift+ArrowDown');
      await page.keyboard.press('Enter');
      await attend(() => dit(page)).toMatch(/^Point 3 posé/);
      expect(await page.locator('.trace-en-cours').count()).toBe(1);

      await page.keyboard.press('Shift+Enter');
      await attend(() => formesVisibles(page)).toBe(5);
      await attend(() => dit(page)).toBe('Tracé ajouté : 3 points.');
      expect(await page.locator('.reticule').count()).toBe(0);
      expect(await choisies(page)).toEqual(['Forme 5']);
    });

    it('garde le sens d Entree pour qui trace a la souris : Entree ferme le trace', async () => {
      const page = await editeur();
      await page.keyboard.press('p');
      const b = await toile(page).boundingBox();
      if (!b) throw new Error('toile sans boite');
      for (const [x, y] of [[0.3, 0.3], [0.6, 0.3], [0.45, 0.6]] as const) await page.mouse.click(b.x + b.width * x, b.y + b.height * y);
      await attend(() => page.locator('.trace-en-cours').count()).toBe(1);
      await page.keyboard.press('Enter');
      await attend(() => formesVisibles(page)).toBe(5);
    });

    it('dit quand Maj+Entree n a pas assez de points, et Echap quitte le reticule', async () => {
      const page = await editeur();
      await page.keyboard.press('p');
      await page.keyboard.press('Shift+Enter');
      await attend(() => dit(page)).toBe('Il faut au moins deux points pour terminer le tracé.');
      await page.keyboard.press('ArrowUp');
      await attend(() => page.locator('.reticule').count()).toBe(1);
      await page.keyboard.press('Escape');
      await attend(() => page.locator('.reticule').count()).toBe(0);
      await attend(() => dit(page)).toMatch(/^Outil sélection/);
    });

    it('laisse Tab quitter la toile avec un outil de trace', async () => {
      const page = await editeur();
      await page.keyboard.press('r');
      await page.keyboard.press('Tab');
      await attend(() => surLaToile(page)).toBe(false);
    });
  });

  describe('le focus', () => {
    it('met la confirmation au focus, et le rend a la toile quand Echap la referme', async () => {
      const page = await editeur();
      await choisirForme(page, 2);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      const dialogue = page.getByRole('alertdialog', { name: 'Abandonner les modifications' });
      await dialogue.waitFor();
      await attend(() => aLeFocus(dialogue.getByRole('button', { name: 'Continuer l’édition' }))).toBe(true);
      expect(await dialogue.getAttribute('aria-describedby')).toBeTruthy();

      await page.keyboard.press('Escape');
      await attend(() => dialogue.count()).toBe(0);
      await attend(() => surLaToile(page)).toBe(true);
    });

    it('rend le focus au bouton de la barre qui avait ouvert la confirmation', async () => {
      const page = await editeur();
      await choisirForme(page, 2);
      await page.keyboard.press('ArrowRight');
      const fichier = page.locator('.menu-bouton', { hasText: 'Fichier' });
      await fichier.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('menuitem', { name: /Fermer/ }).press('Enter');
      const dialogue = page.getByRole('alertdialog');
      await dialogue.waitFor();
      await attend(() => aLeFocus(dialogue.getByRole('button', { name: 'Continuer l’édition' }))).toBe(true);
      await dialogue.getByRole('button', { name: 'Continuer l’édition' }).click();
      await attend(() => dialogue.count()).toBe(0);
      await attend(() => aLeFocus(fichier)).toBe(true);
    });

    it('rend le focus a l hote quand on abandonne', async () => {
      const { page } = await navigateur.ouvrir();
      const bouton = page.getByRole('button', { name: 'Ouvrir l’exemple' });
      await bouton.focus();
      await bouton.press('Enter');
      await page.locator('.editeur-cadre').waitFor();
      await page.keyboard.press('PageDown');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Abandonner', exact: true }).click();
      await attend(() => page.locator('.editeur-cadre').count()).toBe(0);
      await attend(() => aLeFocus(bouton)).toBe(true);
    });

    it('met le reste de la page hors d atteinte tant que l editeur est ouvert, sans piege', async () => {
      const { page } = await navigateur.ouvrir();
      await page.getByRole('button', { name: 'Ouvrir l’exemple' }).click();
      await page.locator('.editeur-cadre').waitFor();
      expect(await page.locator('main.accueil').evaluate(e => (e.parentElement as HTMLElement).inert)).toBe(true);
      // Cent Tab : le focus reste dans l'editeur (ou sort vers le navigateur), il ne va jamais derriere.
      const hors: string[] = [];
      for (let i = 0; i < 100; i++) {
        await page.keyboard.press('Tab');
        const d = await page.evaluate(() => { const a = document.activeElement; return a && a !== document.body && !a.closest('.editeur-svg') ? a.tagName + '.' + a.className : ''; });
        if (d) hors.push(d);
      }
      expect(hors).toEqual([]);
      await toile(page).focus();
      await page.keyboard.press('Escape');
      await attend(() => page.locator('.editeur-cadre').count()).toBe(0);
      expect(await page.locator('#editeur').evaluate(e => (e as HTMLElement).inert)).toBe(false);
    });

    it('offre « Aller a la toile » comme premier arret, visible au focus', async () => {
      const page = await editeur();
      const saut = page.getByRole('button', { name: 'Aller à la toile' });
      // Hors focus il est au-dessus de l'ecran ; au focus il y entre tout entier.
      const dansLEcran = async () => { const b = await saut.boundingBox(); return !!b && b.y >= 0 && b.y + b.height <= 900 && b.x >= 0; };
      expect(await dansLEcran()).toBe(false);
      await saut.focus();
      await attend(dansLEcran).toBe(true);
      await page.keyboard.press('Enter');
      await attend(() => surLaToile(page)).toBe(true);
    });

    it('redonne le focus au bouton du menu apres Echap et apres un choix', async () => {
      const page = await editeur();
      const edition = page.locator('.menu-bouton', { hasText: 'Édition' });
      await edition.focus();
      await page.keyboard.press('Enter');
      await attend(() => page.locator('.menu-panneau [role^=menuitem]:focus').count()).toBe(1);
      await page.keyboard.press('Escape');
      await attend(() => aLeFocus(edition)).toBe(true);
      expect(await page.locator('.editeur-cadre').count()).toBe(1);

      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await attend(() => edition.getAttribute('aria-expanded')).toBe('false');
      await attend(() => aLeFocus(edition)).toBe(true);
    });

    it('ne deplace pas la selection quand les fleches parcourent un menu', async () => {
      const page = await editeur();
      await choisirForme(page, 2);
      const avant = await forme(page, 'f2').boundingBox();
      await page.locator('.menu-bouton', { hasText: 'Vue' }).focus();
      await page.keyboard.press('ArrowDown');
      await attend(() => page.locator('.menu-panneau [role^=menuitem]:focus').count()).toBe(1);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Escape');
      expect(await forme(page, 'f2').boundingBox()).toEqual(avant);
    });
  });

  describe('les tiroirs d un petit ecran', () => {
    const ETROIT = { largeur: 420, hauteur: 860 } as const;
    const bascule = (page: Page, nom: 'Calques' | 'Inspecteur') => page.locator(`.editeur-etat button[aria-label="${nom}"]`);

    for (const [nom, classe] of [['Calques', '.editeur-calques'], ['Inspecteur', '.editeur-inspecteur']] as const) {
      it(`${nom} : prend le focus en s ouvrant, le rend a son bouton sur Echap`, async () => {
        const page = await editeur(ETROIT);
        const tiroir = page.locator(classe);
        expect(await tiroir.evaluate(e => getComputedStyle(e).visibility)).toBe('hidden');
        await bascule(page, nom).focus();
        await page.keyboard.press('Enter');
        await attend(() => tiroir.evaluate(e => e === document.activeElement)).toBe(true);
        expect(await bascule(page, nom).getAttribute('aria-pressed')).toBe('true');

        await page.keyboard.press('Escape');
        await attend(() => bascule(page, nom).getAttribute('aria-pressed')).toBe('false');
        await attend(() => aLeFocus(bascule(page, nom))).toBe(true);
        // Echap ferme le tiroir et rien d'autre.
        expect(await page.locator('.editeur-cadre').count()).toBe(1);
      });

      it(`${nom} : ferme, aucun de ses controles ne se tabule`, async () => {
        const page = await editeur(ETROIT);
        await attend(() => page.locator(classe).evaluate(e => getComputedStyle(e).visibility)).toBe('hidden');
        // Le focus direct est refuse...
        const prend = await page.locator(classe).evaluate(e => { const b = e.querySelector<HTMLElement>('button, input, select, summary'); b?.focus(); return !!b && document.activeElement === b; });
        expect(prend).toBe(false);
        // ... et Tab ne s'y arrete jamais.
        await page.locator('.saut').focus();
        const dedans: string[] = [];
        for (let i = 0; i < 90; i++) {
          await page.keyboard.press('Tab');
          const d = await page.evaluate(sel => { const a = document.activeElement; return a?.closest(sel) ? a.tagName + '.' + a.className : ''; }, classe);
          if (d) dedans.push(d);
        }
        expect(dedans).toEqual([]);
      });
    }

    it('rend le focus a son bouton quand le voile ferme le tiroir', async () => {
      const page = await editeur(ETROIT);
      await bascule(page, 'Calques').click();
      await attend(() => page.locator('.voile').count()).toBe(1);
      await page.locator('.voile').click({ position: { x: 380, y: 300 } });
      await attend(() => page.locator('.voile').count()).toBe(0);
      await attend(() => aLeFocus(bascule(page, 'Calques'))).toBe(true);
    });
  });

  describe('la region vocale', () => {
    it('est la seule region vivante de l editeur hors panneaux : ni la barre d etat ni le zoom n en sont', async () => {
      const page = await editeur();
      const region = annonces(page);
      expect(await region.getAttribute('role')).toBe('status');
      expect(await region.getAttribute('aria-live')).toBe('polite');
      expect(await region.getAttribute('aria-atomic')).toBe('true');
      expect(await page.locator('.editeur-etat').getAttribute('role')).toBeNull();
      expect(await page.locator('.editeur-etat [aria-live], .editeur-barre [aria-live], .editeur-barre-selection [aria-live]').count()).toBe(0);
      // Visuellement cachee, mais lue.
      expect(await region.evaluate(e => e.classList.contains('sr-only'))).toBe(true);
    });

    it('redit une phrase identique : annuler deux fois dit deux fois « Annulé. »', async () => {
      const page = await editeur();
      await choisirForme(page, 2);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await annonces(page).evaluate(e => {
        const w = window as unknown as { __dit: string[] };
        w.__dit = [];
        new MutationObserver(() => w.__dit.push((e.textContent ?? '').trim())).observe(e, { childList: true, characterData: true, subtree: true });
      });
      await page.keyboard.press('Control+z');
      await attend(() => dit(page)).toBe('Annulé.');
      await page.keyboard.press('Control+z');
      await attend(async () => (await page.evaluate(() => (window as unknown as { __dit: string[] }).__dit)).filter(t => t === 'Annulé.').length).toBe(2);
      // Entre les deux, la region a ete videe : c'est ce qui force la relecture.
      const lu = await page.evaluate(() => (window as unknown as { __dit: string[] }).__dit);
      expect(lu).toContain('');
      expect(lu.indexOf('Annulé.')).toBeLessThan(lu.lastIndexOf(''));
    });

    it('dit annuler, retablir, et le vide de l historique', async () => {
      const page = await editeur();
      await page.keyboard.press('Control+z');
      await attend(() => dit(page)).toBe('Rien à annuler.');
      await choisirForme(page, 2);
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Control+z');
      await attend(() => dit(page)).toBe('Annulé.');
      await page.keyboard.press('Control+Shift+z');
      await attend(() => dit(page)).toBe('Rétabli.');
      await page.keyboard.press('Control+y');
      await attend(() => dit(page)).toBe('Rien à rétablir.');
    });

    it('dit la selection multiple, l outil, la suppression et l erreur', async () => {
      const page = await editeur();
      await page.keyboard.press('Control+a');
      await attend(() => dit(page)).toBe('4 formes sélectionnées.');
      await page.keyboard.press('v');
      await page.keyboard.press('h');
      await attend(() => dit(page)).toMatch(/^Outil main/);
      await page.keyboard.press('v');
      await attend(() => dit(page)).toMatch(/^Outil sélection/);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+g');
      await attend(() => dit(page)).toBe('Choisissez au moins deux formes déverrouillées à combiner.');
      await choisirForme(page, 3);
      await page.keyboard.press('Delete');
      await attend(() => dit(page)).toBe('1 forme supprimée.');
      expect(await formesVisibles(page)).toBe(3);
      expect(await toile(page).getAttribute('aria-label')).toBe('Plan de travail de exemple.svg : 3 formes');
    });

    it('dit la selection faite a la souris comme celle faite au clavier', async () => {
      const page = await editeur();
      await forme(page, 'f3').click();
      await attend(() => dit(page)).toMatch(/^Forme 3 sélectionnée : triangle/);
    });

    it('dit le zoom au clavier seulement', async () => {
      const page = await editeur();
      await page.keyboard.press('+');
      await attend(() => dit(page)).toMatch(/^Zoom \d+ %\.$/);
    });
  });
});

describe('clavier : l editeur embarque dans la page d un hote', () => {
  const navigateur = pilote();

  it('met la page de l hote hors d atteinte, prend le focus sur la toile, et rend le focus au bouton « Éditer »', async () => {
    const session = await navigateur.ouvrir({ naviguer: false });
    const { page } = session;
    await page.goto(URL_INTEGRATION);
    const editer = page.locator('#editer');
    await editer.focus();
    await page.keyboard.press('Enter');
    await page.locator('.editeur-svg .editeur-cadre').waitFor();
    await attend(() => aLeFocus(page.locator('.editeur-svg-toile'))).toBe(true);
    expect(await page.locator('main').evaluate(e => (e as HTMLElement).inert)).toBe(true);
    expect(await page.locator('main').evaluate(e => !!e.closest('.editeur-svg'))).toBe(false);

    await page.keyboard.press('Escape');
    await attend(() => page.locator('.editeur-svg').count()).toBe(0);
    await attend(() => aLeFocus(editer)).toBe(true);
    expect(await page.locator('main').evaluate(e => (e as HTMLElement).inert)).toBe(false);
  });
});

// La suite de l'accessibilite au clavier (ADR-0011) : ce qui restait en limite. Les boutons de la rangee de la
// selection parlent ; les boutons des calques sont de vraies icones ; une forme se trace par deux coins ; la
// selection s'additionne (Maj+Page suivante, Espace) ; l'outil texte mene au champ du panneau ; le lien
// d'evitement est un lien ; la page de l'hote est cachee derriere l'editeur.
//
// Les phrases sont celles de la region « polite » (.annonces). Le dessin d'exemple : f1 rectangle arrondi (208 × 128),
// f2 cercle rouge, f3 triangle bleu, f4 courbe ; plan de 240 × 160 (un pas de reticule : 2,4 ; Maj : 24).

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { aLeFocus, attend, formesVisibles, ouvrirExemple, pilote, URL_INTEGRATION } from './aide.js';

describe('clavier et lecteur d ecran : la suite', () => {
  const navigateur = pilote();

  async function editeur(options: Parameters<typeof navigateur.ouvrir>[0] = {}) {
    const { page } = await navigateur.ouvrir(options);
    await ouvrirExemple(page, options.tactile);
    await attend(() => aLeFocus(toile(page))).toBe(true);
    return page;
  }

  const toile = (page: Page) => page.locator('.editeur-svg-toile');
  const dit = (page: Page) => page.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim());
  // textContent, pas innerText : une ligne des calques hors de l'ecran (`content-visibility: auto`) n'est pas rendue, et Firefox
  // et WebKit lui donnent alors un innerText vide.
  // Le nom d'une ligne est le genre et le numero (« Triangle 3 ») : l'identite de la forme se lit dans `data-forme`.
  const choisies = (page: Page) => page.locator('.editeur-calques ol > li.choisi .calque-nom').evaluateAll(l => l.map(e => 'Forme ' + (e.getAttribute('data-forme') ?? '').slice(1)));
  const barre = (page: Page, nom: string) => page.locator('.editeur-barre-selection').getByRole('button', { name: nom, exact: true });
  async function pages(page: Page, n: number) {
    for (let i = 0; i < n; i++) await page.keyboard.press('PageDown');
  }
  /** Clique un bouton de la rangee de la selection et lit ce que la region vocale en dit. */
  async function cliquerEtLire(page: Page, nom: string, attendu: string | RegExp) {
    await barre(page, nom).click();
    if (typeof attendu === 'string') await attend(() => dit(page)).toBe(attendu);
    else await attend(() => dit(page)).toMatch(attendu);
  }

  describe('les boutons de la rangee de la selection parlent', () => {
    it('dit l alignement, le miroir et la rotation', async () => {
      const page = await editeur();
      await pages(page, 2);
      await attend(() => dit(page)).toMatch(/^Forme 2 sélectionnée/);
      for (const [nom, phrase] of [
        ['Aligner à gauche (sur le plan)', 'Alignée à gauche sur le plan.'],
        ['Centrer horizontalement (sur le plan)', 'Centrée horizontalement sur le plan.'],
        ['Aligner à droite (sur le plan)', 'Alignée à droite sur le plan.'],
        ['Aligner en haut (sur le plan)', 'Alignée en haut sur le plan.'],
        ['Centrer verticalement (sur le plan)', 'Centrée verticalement sur le plan.'],
        ['Aligner en bas (sur le plan)', 'Alignée en bas sur le plan.'],
        ['Miroir horizontal', 'Miroir horizontal.'],
        ['Miroir vertical', 'Miroir vertical.'],
        ['Tourner de 90° vers la gauche', 'Tournée de 90° vers la gauche.'],
        ['Tourner de 90° vers la droite', 'Tournée de 90° vers la droite.']
      ] as const) await cliquerEtLire(page, nom, phrase);
    });

    it('dit l alignement de plusieurs formes sans parler du plan', async () => {
      const page = await editeur();
      await page.keyboard.press('Control+a');
      await cliquerEtLire(page, 'Aligner en haut', '4 formes alignées en haut.');
      await cliquerEtLire(page, 'Centrer verticalement', '4 formes centrées verticalement.');
    });

    it('dit le changement de plan, et quand le bord est deja atteint', async () => {
      const page = await editeur();
      await pages(page, 2);
      await cliquerEtLire(page, 'Avancer (Ctrl+])', 'Avancée d’un plan.');
      await cliquerEtLire(page, 'Reculer (Ctrl+[)', 'Reculée d’un plan.');
      await cliquerEtLire(page, 'Premier plan (Ctrl+Maj+])', 'Placée au premier plan.');
      await cliquerEtLire(page, 'Premier plan (Ctrl+Maj+])', 'Déjà au premier plan.');
      await cliquerEtLire(page, 'Avancer (Ctrl+])', 'Déjà au premier plan.');
      await cliquerEtLire(page, 'Arrière-plan (Ctrl+Maj+[)', 'Placée à l’arrière-plan.');
      await cliquerEtLire(page, 'Arrière-plan (Ctrl+Maj+[)', 'Déjà à l’arrière-plan.');
    });

    it('dit la meme chose au clavier : Ctrl+] et Ctrl+[', async () => {
      const page = await editeur();
      await pages(page, 2);
      await page.keyboard.press('Control+]');
      await attend(() => dit(page)).toBe('Avancée d’un plan.');
      await page.keyboard.press('Control+[');
      await attend(() => dit(page)).toBe('Reculée d’un plan.');
    });

    it('dit la duplication (bouton et Ctrl+D), le masquage, le verrouillage et la suppression', async () => {
      const page = await editeur();
      await pages(page, 3);
      await cliquerEtLire(page, 'Dupliquer (Ctrl+D)', 'Forme 5 dupliquée.');
      await toile(page).focus();
      await page.keyboard.press('Control+d');
      await attend(() => dit(page)).toBe('Forme 6 dupliquée.');
      await cliquerEtLire(page, 'Masquer', 'Masquée : affichez-la dans les calques.');
      await toile(page).focus();
      await page.keyboard.press('Control+a');
      await cliquerEtLire(page, 'Verrouiller', '5 formes verrouillées : déverrouillez-les dans les calques.');
    });

    it('dit la suppression d une forme choisie', async () => {
      const page = await editeur();
      await pages(page, 4);
      await cliquerEtLire(page, 'Supprimer (Suppr)', '1 forme supprimée.');
    });

    it('dit la combinaison puis la separation', async () => {
      const page = await editeur();
      await page.keyboard.press('Control+a');
      await cliquerEtLire(page, 'Combiner en une forme (Ctrl+G)', /^4 formes combinées en une\. /);
      await cliquerEtLire(page, 'Séparer les tracés (Ctrl+Maj+G)', /^Forme séparée en \d+ tracés\.$/);
    });

    for (const [nom, phrase] of [
      ['Union : réunir les formes en une seule', /^Union faite : 2 formes, \d+ points/],
      ['Soustraction : la plus basse moins les autres', /^Soustraction faite : 2 formes, \d+ points/],
      ['Intersection : ce que les formes ont en commun', /^Intersection faite : 2 formes, \d+ points/],
      ['Exclusion : tout sauf les recouvrements', /^Exclusion faite : 2 formes, \d+ points/]
    ] as const) {
      it(`dit l operation booleenne « ${nom.split(' :')[0]} » sur deux formes choisies au clavier`, async () => {
        const page = await editeur();
        // La forme 1 et la forme 2 se recouvrent ; la seconde s'ajoute a la selection par Maj+Page suivante.
        await pages(page, 1);
        await page.keyboard.press('Shift+PageDown');
        await attend(() => dit(page)).toBe('Forme 2 ajoutée : 2 formes sélectionnées.');
        await cliquerEtLire(page, nom, phrase);
      });
    }
  });

  describe('les boutons des calques sont de vraies icones', () => {
    it('n ont plus de caractere pour texte, gardent leur nom et leur etat', async () => {
      const page = await editeur();
      const textes = await page.locator('.editeur-calques .calque-bascule').evaluateAll(l => l.map(e => ({ texte: (e.textContent ?? '').trim(), icone: !!e.querySelector('svg.icone[aria-hidden="true"]') })));
      expect(textes).toHaveLength(8);
      expect(textes.every(t => t.texte === '' && t.icone)).toBe(true);

      const masquer = page.getByRole('button', { name: 'Masquer la forme 2', exact: true });
      expect(await masquer.getAttribute('aria-pressed')).toBe('false');
      await masquer.click();
      const afficher = page.getByRole('button', { name: 'Afficher la forme 2', exact: true });
      await attend(() => afficher.getAttribute('aria-pressed')).toBe('true');
      await attend(() => formesVisibles(page)).toBe(3);
      await afficher.click();
      await attend(() => formesVisibles(page)).toBe(4);
    });

    it('se manient au clavier : Entree verrouille, et la forme verrouillee quitte la selection', async () => {
      const page = await editeur();
      await pages(page, 2);
      const verrou = page.getByRole('button', { name: 'Verrouiller la forme 2', exact: true });
      await verrou.focus();
      await page.keyboard.press('Enter');
      const deverrou = page.getByRole('button', { name: 'Déverrouiller la forme 2', exact: true });
      await attend(() => deverrou.getAttribute('aria-pressed')).toBe('true');
      expect(await choisies(page)).toEqual([]);
      // L'icone change avec l'etat : un cadenas ferme, puis ouvert, et jamais le meme dessin pour les deux.
      const ferme = await deverrou.locator('path').evaluateAll(l => l.map(e => e.getAttribute('d')).join('|'));
      await deverrou.press('Space');
      await attend(() => page.getByRole('button', { name: 'Verrouiller la forme 2', exact: true }).count()).toBe(1);
      const ouvert = await page.getByRole('button', { name: 'Verrouiller la forme 2', exact: true }).locator('path').evaluateAll(l => l.map(e => e.getAttribute('d')).join('|'));
      expect(ouvert).not.toBe(ferme);
    });
  });

  describe('une forme a deux coins, au clavier', () => {
    it('pose le premier coin, montre un apercu, pose le second : la forme mesure l ecart', async () => {
      const page = await editeur();
      await page.keyboard.press('r');
      await page.keyboard.press('Space');
      await attend(() => dit(page)).toMatch(/^Premier coin posé à [\d,]+, [\d,]+\. Flèches : déplacer l’autre coin\. Espace ou Entrée : le poser\. Échap : annuler\.$/);
      expect(await page.locator('.editeur-svg-toile .ancre-choisie').count()).toBe(1);

      for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
      for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
      await attend(() => dit(page)).toMatch(/^Coin opposé à [\d,]+, [\d,]+ : 12 × 7,2\.$/);
      await attend(() => page.locator('.editeur-svg-toile path.trace-en-cours').count()).toBe(1);
      expect(await formesVisibles(page)).toBe(4);

      await page.keyboard.press('Space');
      await attend(() => formesVisibles(page)).toBe(5);
      await attend(() => dit(page)).toMatch(/^Forme 5 ajoutée et sélectionnée : rectangle, fond \w+ #[0-9a-f]{6}, 12 × 7,2 à .*Alt et flèches la redimensionnent/);
      expect(await choisies(page)).toEqual(['Forme 5']);
      expect(await page.locator('.editeur-svg-toile .trace-en-cours').count()).toBe(0);
      expect(await page.locator('.reticule').count()).toBe(0);
      expect(await aLeFocus(toile(page))).toBe(true);
    });

    it('accepte Maj+Entree pour le premier coin, et Entree pour le second', async () => {
      const page = await editeur();
      await page.keyboard.press('r');
      await page.keyboard.press('Shift+Enter');
      await attend(() => dit(page)).toMatch(/^Premier coin posé/);
      for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
      for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowUp');
      // Vers le haut et la droite : les mesures restent positives, la forme se pose quand meme.
      await attend(() => dit(page)).toMatch(/ : 7,2 × 4,8\.$/);
      await page.keyboard.press('Enter');
      await attend(() => formesVisibles(page)).toBe(5);
      await attend(() => dit(page)).toMatch(/^Forme 5 ajoutée et sélectionnée : rectangle, .*7,2 × 4,8 à /);
    });

    it('garde Entree seule pour la forme de taille par defaut', async () => {
      const page = await editeur();
      await page.keyboard.press('r');
      await page.keyboard.press('Enter');
      await attend(() => dit(page)).toMatch(/^Forme 5 ajoutée et sélectionnée : carré, .*40 × 40 à /);
    });

    it('refuse deux coins trop proches, et laisse le premier en place', async () => {
      const page = await editeur();
      await page.keyboard.press('r');
      await page.keyboard.press('Space');
      await page.keyboard.press('Space');
      await attend(() => dit(page)).toBe('Les deux coins sont trop proches : déplacez l’autre coin, ou Échap annule.');
      expect(await formesVisibles(page)).toBe(4);
      // Aligne sur un seul axe, un rectangle n'a pas de surface : toujours refuse.
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Space');
      await attend(() => dit(page)).toBe('Les deux coins sont trop proches : déplacez l’autre coin, ou Échap annule.');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Space');
      await attend(() => formesVisibles(page)).toBe(5);
    });

    it('Echap annule le premier coin sans quitter l outil, un second Echap quitte l outil', async () => {
      const page = await editeur();
      await page.keyboard.press('r');
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowRight');
      await attend(() => page.locator('.editeur-svg-toile path.trace-en-cours').count()).toBe(1);
      await page.keyboard.press('Escape');
      await attend(() => dit(page)).toBe('Premier coin annulé : l’outil reste pris.');
      expect(await page.locator('.editeur-svg-toile .trace-en-cours').count()).toBe(0);
      expect(await page.locator('.editeur-svg-toile .ancre-choisie').count()).toBe(0);
      expect(await page.locator('.editeur-cadre.outil-rectangle').count()).toBe(1);
      expect(await formesVisibles(page)).toBe(4);
      // Sans premier coin, une fleche redonne le reticule ordinaire.
      await page.keyboard.press('ArrowRight');
      await attend(() => dit(page)).toMatch(/^Réticule à /);
      await page.keyboard.press('Escape');
      await attend(() => dit(page)).toMatch(/^Outil sélection/);
    });

    it('trace une ellipse, une etoile et une ligne de la meme facon', async () => {
      const page = await editeur();
      for (const [touche, attendu, n, pas] of [['e', 'ellipse', 5, 4], ['s', 'étoile', 6, 6], ['l', 'ligne', 7, 0]] as const) {
        await page.keyboard.press(touche);
        await page.keyboard.press('Space');
        for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
        for (let i = 0; i < pas; i++) await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Space');
        await attend(() => formesVisibles(page)).toBe(n);
        await attend(() => dit(page)).toMatch(new RegExp('^Forme ' + n + ' ajoutée et sélectionnée : ' + attendu));
        await toile(page).focus();
      }
    });
  });

  describe('la selection additive, au clavier', () => {
    it('Maj+Page suivante ajoute la forme voisine, Espace la retire : une selection qui saute une forme', async () => {
      const page = await editeur();
      await pages(page, 1);
      await page.keyboard.press('Shift+PageDown');
      await attend(() => dit(page)).toBe('Forme 2 ajoutée : 2 formes sélectionnées.');
      await page.keyboard.press('Shift+PageDown');
      await attend(() => dit(page)).toBe('Forme 3 ajoutée : 3 formes sélectionnées.');
      // Les calques vont du premier plan au fond : la derniere forme est en haut de la liste.
      expect(await choisies(page)).toEqual(['Forme 3', 'Forme 2', 'Forme 1']);
      expect(await page.locator('.editeur-svg-toile path.focale').count()).toBe(1);

      await page.keyboard.press('Space');
      await attend(() => dit(page)).toBe('Forme 3 retirée : 2 formes sélectionnées.');
      expect(await choisies(page)).toEqual(['Forme 2', 'Forme 1']);
      // Le curseur reste sur la forme 3 retiree : la suivante est la 4, et la 3 est sautee.
      await page.keyboard.press('Shift+PageDown');
      await attend(() => dit(page)).toBe('Forme 4 ajoutée : 3 formes sélectionnées.');
      expect(await choisies(page)).toEqual(['Forme 4', 'Forme 2', 'Forme 1']);
      await page.keyboard.press('Space');
      await attend(() => dit(page)).toBe('Forme 4 retirée : 2 formes sélectionnées.');
      await page.keyboard.press('Space');
      await attend(() => dit(page)).toBe('Forme 4 ajoutée : 3 formes sélectionnées.');
    });

    it('Maj+Page precedente remonte, et la selection additive se deplace d un seul bloc', async () => {
      const page = await editeur();
      await pages(page, 4);
      await page.keyboard.press('Shift+PageUp');
      await attend(() => dit(page)).toBe('Forme 3 ajoutée : 2 formes sélectionnées.');
      await page.keyboard.press('ArrowRight');
      await attend(() => dit(page)).toMatch(/^À /);
      expect(await choisies(page)).toEqual(['Forme 4', 'Forme 3']);
    });

    it('boucle, et dit qu une forme deja choisie l est deja', async () => {
      const page = await editeur();
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Shift+PageDown');
      await attend(() => dit(page)).toBe('Forme 1 déjà sélectionnée : 4 formes sélectionnées.');
      expect(await choisies(page)).toHaveLength(4);
    });

    it('dit comment avoir un curseur quand Espace n a rien a basculer', async () => {
      const page = await editeur();
      await page.keyboard.press('Space');
      await attend(() => dit(page)).toBe('Aucune forme au curseur : Page suivante en choisit une, Maj et Page suivante en ajoute une.');
    });

    it('Espace retire la derniere forme choisie quand le curseur n est pas pose, et le dit', async () => {
      const page = await editeur();
      await pages(page, 2);
      await page.keyboard.press('Space');
      await attend(() => dit(page)).toBe('Forme 2 retirée : plus aucune forme sélectionnée.');
      expect(await choisies(page)).toEqual([]);
    });

    it('oublie le curseur quand la selection change autrement : un clic, Echap', async () => {
      const page = await editeur();
      await pages(page, 1);
      await page.keyboard.press('Shift+PageDown');
      expect(await page.locator('.editeur-svg-toile path.focale').count()).toBe(1);
      await page.locator('.editeur-calques button.calque-nom[data-forme="f3"]').click();
      await attend(() => page.locator('.editeur-svg-toile path.focale').count()).toBe(0);
      await toile(page).focus();
      // Le curseur est de nouveau la derniere forme choisie : la 3.
      await page.keyboard.press('Space');
      await attend(() => dit(page)).toBe('Forme 3 retirée : plus aucune forme sélectionnée.');
    });

    it('laisse Page suivante seule et Tab remplacer la selection, comme avant', async () => {
      const page = await editeur();
      await pages(page, 1);
      await page.keyboard.press('Shift+PageDown');
      await page.keyboard.press('PageDown');
      await attend(() => dit(page)).toMatch(/^Forme 3 sélectionnée/);
      expect(await choisies(page)).toEqual(['Forme 3']);
      await page.keyboard.press('Tab');
      await attend(() => dit(page)).toMatch(/^Forme 4 sélectionnée/);
      expect(await choisies(page)).toEqual(['Forme 4']);
    });
  });

  describe('l outil texte, au clavier', () => {
    // Depuis l'ADR-0027, on tape sur la toile : Entree ouvre la saisie au reticule (le centre de la vue), le panneau reste a Tab.
    it('Entree ouvre la saisie sur la toile, et la region vocale le dit une fois', async () => {
      const page = await editeur();
      await page.keyboard.press('t');
      await attend(() => dit(page)).toBe('Outil texte : flèches déplacent le point d’insertion, Entrée ouvre la saisie sur la toile ; à la souris, cliquez où écrire.');
      await page.keyboard.press('Enter');
      await attend(() => aLeFocus(page.locator('textarea.saisie-champ'))).toBe(true);
      await attend(() => dit(page)).toBe('Saisie du texte sur la toile : tapez votre texte. Entrée va à la ligne, Échap termine, Alt+F10 mène à la barre de texte.');
      await page.keyboard.press('Escape');
      await attend(() => aLeFocus(page.locator('.editeur-svg-toile'))).toBe(true);
      await attend(() => dit(page)).toBe('Texte vide : rien n’est ajouté.');
    });

    it('sur un petit ecran, Entree ouvre aussi la saisie sur la toile, sans tiroir ; Tab en sort vers la suite', async () => {
      const page = await editeur({ largeur: 420, hauteur: 860, tactile: true });
      await page.keyboard.press('t');
      await page.keyboard.press('Enter');
      await attend(() => aLeFocus(page.locator('textarea.saisie-champ'))).toBe(true);
      expect(await page.locator('.voile').count()).toBe(0);
      const avant = await page.locator('.editeur-svg-toile path[data-id]').count();
      await page.keyboard.type('Oui');
      // Les fontes se chargent au premier besoin : le texte se compose des qu'elles sont la.
      await attend(() => page.locator('.editeur-svg-toile path[data-id]').count()).toBe(avant + 1);
      await page.keyboard.press('Tab');
      await attend(() => page.locator('textarea.saisie-champ').count()).toBe(0);
      await attend(() => dit(page)).toMatch(/^Texte ajouté en Inter : « Oui »/);
    });
  });

  describe('le lien d evitement, les menus et la page de l hote', () => {
    it('« Aller a la toile » est un lien : il ne change pas l adresse, et il mene a la toile', async () => {
      const page = await editeur();
      const avant = page.url();
      const lien = page.getByRole('link', { name: 'Aller à la toile' });
      expect(await lien.getAttribute('href')).toBe('#' + (await toile(page).getAttribute('id')));
      await lien.focus();
      await page.keyboard.press('Enter');
      await attend(() => aLeFocus(toile(page))).toBe(true);
      expect(page.url()).toBe(avant);
    });

    it('un menu-bouton ne renvoie pas a un panneau par aria-controls', async () => {
      const page = await editeur();
      const bouton = page.locator('.menu-bouton', { hasText: 'Vue' });
      await bouton.click();
      await page.getByRole('menu', { name: 'Vue' }).waitFor();
      expect(await bouton.getAttribute('aria-expanded')).toBe('true');
      expect(await bouton.getAttribute('aria-controls')).toBeNull();
    });

    it('cache la page de l hote derriere l editeur et la rend telle quelle a la fermeture', async () => {
      const { page } = await navigateur.ouvrir({ naviguer: false });
      await page.goto(URL_INTEGRATION);
      // Un style en ligne de l'hote doit revenir tel quel, pas etre efface.
      await page.locator('#editer').evaluate(e => { let n: Element = e; while (n.parentElement && n.parentElement !== document.body) n = n.parentElement; n.id = 'racine-hote'; (n as HTMLElement).style.visibility = 'visible'; });
      await page.locator('#editer').click();
      await page.locator('.editeur-svg .editeur-cadre').waitFor();
      expect(await page.locator('#racine-hote').evaluate(e => getComputedStyle(e).visibility)).toBe('hidden');
      expect(await page.locator('#racine-hote').evaluate(e => (e as HTMLElement).inert)).toBe(true);
      await page.keyboard.press('Escape');
      await attend(() => page.locator('.editeur-svg .editeur-cadre').count()).toBe(0);
      expect(await page.locator('#racine-hote').evaluate(e => e.style.visibility)).toBe('visible');
      expect(await page.locator('#racine-hote').evaluate(e => (e as HTMLElement).inert)).toBe(false);
    });
  });
});

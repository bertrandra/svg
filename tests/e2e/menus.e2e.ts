// Les menus de la barre de l'editeur (ADR-0006) : un vrai menu, au clavier comme a la souris.

import { describe, expect, it } from 'vitest';
import { aLeFocus, attend, ouvrirExemple, ouvrirMenu, pilote, texteDe } from './aide.js';

describe('menus de la barre', () => {
  const navigateur = pilote();

  /** L'editeur ouvert sur l'exemple, pret a recevoir clics et touches. */
  async function editeur() {
    const session = await navigateur.ouvrir();
    await ouvrirExemple(session.page);
    return session.page;
  }

  // Six menus depuis l'ADR-0019 : « Aide » (visite guidee, raccourcis) a rejoint Vue et Edition, pour qu'un debutant trouve
  // l'aide par son nom en haut de l'editeur. Sept avec la fin du parcours : « Autres formats », le chevron accole a « Télécharger le
  // SVG », range les formats que le menu Fichier portait. La liste reste exacte : un menu de plus ou de moins se decide, il ne se glisse pas.
  it('annonce ses sept menus comme des menus, dont la machine (ADR-0013), l aide (ADR-0019) et les autres formats', async () => {
    const page = await editeur();
    const noms = await page.locator('.editeur-barre [aria-haspopup=menu]').evaluateAll(
      l => l.map(e => (e.getAttribute('aria-label') ?? e.textContent ?? '').trim())
    );
    expect(noms).toEqual(['Formes (F)', 'Vue', 'Édition', 'Aide', 'Machine : Générique', 'Autres formats', 'Fichier']);
  });

  it('s\'ouvre et se ferme a la souris, et rend le focus au bouton', async () => {
    const page = await editeur();
    const vue = await ouvrirMenu(page, 'Vue');
    await attend(() => vue.getAttribute('aria-expanded')).toBe('true');
    const panneau = page.getByRole('menu', { name: 'Vue' });
    await attend(() => panneau.isVisible()).toBe(true);
    expect(await page.locator('.menu-panneau [role^=menuitem]').count()).toBeGreaterThanOrEqual(9);

    await page.keyboard.press('Escape');
    await attend(() => vue.getAttribute('aria-expanded')).toBe('false');
    await attend(() => panneau.count()).toBe(0);
    await attend(() => aLeFocus(vue)).toBe(true);
    // Echap ferme le menu, pas l'editeur (c'est aussi le raccourci de « Fermer l'editeur »).
    expect(await page.locator('.editeur-cadre').count()).toBe(1);
  });

  it('se ferme sur un clic au-dehors', async () => {
    const page = await editeur();
    const vue = await ouvrirMenu(page, 'Vue');
    await attend(() => vue.getAttribute('aria-expanded')).toBe('true');
    await page.locator('.editeur-etat').click();
    await attend(() => vue.getAttribute('aria-expanded')).toBe('false');
  });

  it('se parcourt aux fleches, debut, fin, et se ferme sur Tab', async () => {
    const page = await editeur();
    const vue = page.locator('.menu-bouton', { hasText: 'Vue' });
    await vue.focus();

    // Fleche bas sur le bouton : le menu s'ouvre et le focus va au premier element.
    await page.keyboard.press('ArrowDown');
    const elements = page.locator('.menu-panneau [role^=menuitem]');
    await attend(() => elements.count()).toBeGreaterThanOrEqual(9);
    await attend(() => aLeFocus(elements.nth(0))).toBe(true);

    await page.keyboard.press('ArrowDown');
    // Le troisieme element (« Zoomer sur la selection ») est inactif : la fleche le saute.
    await attend(() => aLeFocus(elements.nth(1))).toBe(true);
    await page.keyboard.press('ArrowDown');
    await attend(() => aLeFocus(elements.nth(3))).toBe(true);

    await page.keyboard.press('End');
    await attend(() => aLeFocus(elements.last())).toBe(true);
    await page.keyboard.press('Home');
    await attend(() => aLeFocus(elements.first())).toBe(true);

    await page.keyboard.press('Tab');
    await attend(() => vue.getAttribute('aria-expanded')).toBe('false');
  });

  it('montre l element atteint aux fleches dans un menu ouvert a la souris', async () => {
    // Le cas que WebKit manquait : le panneau prend le focus au clic (sans anneau, c'est la souris), puis la fleche, dont le geste
    // par defaut est empeche, pose le focus par script ; sans `focusVisible`, l'element atteint n'y avait ni fond ni filet.
    const page = await editeur();
    await ouvrirMenu(page, 'Vue');
    const elements = page.locator('.menu-panneau [role^=menuitem]');
    await page.keyboard.press('ArrowDown');
    await attend(() => aLeFocus(elements.nth(0))).toBe(true);
    expect(await elements.nth(0).evaluate(e => e.matches(':focus-visible'))).toBe(true);
    await page.keyboard.press('ArrowDown');
    await attend(() => aLeFocus(elements.nth(1))).toBe(true);
    const anneau = await elements.nth(1).evaluate(e => ({ visible: e.matches(':focus-visible'), filet: getComputedStyle(e).boxShadow }));
    expect(anneau.visible).toBe(true);
    expect(anneau.filet).toContain('inset');
  });

  it('ouvre par Fleche haut sur le dernier element', async () => {
    const page = await editeur();
    await page.locator('.menu-bouton', { hasText: 'Vue' }).focus();
    await page.keyboard.press('ArrowUp');
    const elements = page.locator('.menu-panneau [role^=menuitem]');
    await attend(() => aLeFocus(elements.last())).toBe(true);
  });

  it('dit l\'etat des elements a deux etats, et le suit', async () => {
    const page = await editeur();
    const vue = await ouvrirMenu(page, 'Vue');
    const grille = page.getByRole('menuitemcheckbox', { name: /Grille magnétique/ });
    const aimants = page.getByRole('menuitemcheckbox', { name: /Aimants/ });
    expect(await grille.getAttribute('aria-checked')).toBe('false');
    expect(await aimants.getAttribute('aria-checked')).toBe('true');

    await grille.click();
    // Un clic sur un element ferme le menu et lui rend le focus.
    await attend(() => vue.getAttribute('aria-expanded')).toBe('false');
    await vue.click();
    await attend(() => grille.getAttribute('aria-checked')).toBe('true');
    await page.keyboard.press('Escape');

    // Le raccourci G dit la meme chose que le menu.
    await page.keyboard.press('g');
    await vue.click();
    await attend(() => grille.getAttribute('aria-checked')).toBe('false');
  });

  it('range les formes derriere un seul outil dont le bouton retient la derniere', async () => {
    const page = await editeur();
    const cadre = page.locator('.editeur-cadre');
    await page.locator('.outil-formes .chevron-seul button').click();
    await page.getByRole('menuitemradio', { name: /Étoile/ }).click();
    await attend(() => cadre.evaluate(e => e.classList.contains('outil-etoile'))).toBe(true);

    // Retour a la selection au clavier, puis le bouton reprend l'etoile sans rouvrir le menu.
    await page.keyboard.press('v');
    await attend(() => cadre.evaluate(e => e.classList.contains('outil-selection'))).toBe(true);
    const bouton = page.locator('.outil-formes .icone-bouton').first();
    expect(await bouton.getAttribute('aria-label')).toMatch(/^Étoile/);
    await bouton.click();
    await attend(() => cadre.evaluate(e => e.classList.contains('outil-etoile'))).toBe(true);
  });

  it('range l\'edition derriere son menu, avec ses raccourcis et ses elements inactifs', async () => {
    const page = await editeur();
    await ouvrirMenu(page, 'Édition');
    const annuler = page.getByRole('menuitem', { name: /Annuler/ });
    expect(await annuler.isDisabled()).toBe(true);
    expect(await texteDe(annuler)).toContain('Ctrl+Z');
    expect(await page.getByRole('menuitem', { name: /Tout sélectionner/ }).isDisabled()).toBe(false);
    expect(await page.getByRole('menuitem', { name: /Supprimer/ }).isDisabled()).toBe(true);

    await page.getByRole('menuitem', { name: /Tout sélectionner/ }).click();
    await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
    await ouvrirMenu(page, 'Édition');
    await attend(() => page.getByRole('menuitem', { name: /Supprimer/ }).isDisabled()).toBe(false);
  });

  it('porte les autres formats sous « Autres formats », chacun dit par son usage, sans que le choix d\'une largeur ne le ferme', async () => {
    const page = await editeur();
    const fichier = await ouvrirMenu(page, 'Autres formats');
    const boutons = page.locator('.menu-panneau .contenu-export button');
    // Huit : le SVG a son bouton dans la barre, et le second « Copier le code SVG » du menu Fichier n'existe plus.
    expect(await boutons.allInnerTexts()).toEqual(['PDF vectoriel', 'PNG', 'JPEG', 'WebP', 'EPS', 'DXF', 'SVG de découpe', 'Copier le code SVG']);
    for (const b of await boutons.all()) expect(await b.getAttribute('aria-describedby'), await b.innerText()).toBeTruthy();
    expect(await page.locator('.menu-panneau .ligne-export .aide').first().innerText()).toBe('un document à imprimer ou à envoyer, net à toute taille');
    // Le menu Fichier ne porte plus ni telechargement, ni code a copier, ni formats.
    await page.keyboard.press('Escape');
    await ouvrirMenu(page, 'Fichier');
    expect(await page.getByRole('menu', { name: 'Fichier' }).locator('.menu-libelle').allInnerTexts()).toEqual(['Terminer', 'Garder un brouillon', 'Insérer depuis une adresse…', 'À propos et crédits', 'Fermer l’éditeur']);
    expect(await page.locator('.menu-panneau .contenu-export').count()).toBe(0);
    await page.keyboard.press('Escape');
    await ouvrirMenu(page, 'Autres formats');
    const largeur = page.locator('.menu-panneau select[aria-label="Largeur du PNG"]');
    await largeur.selectOption('2048');
    expect(await fichier.getAttribute('aria-expanded')).toBe('true');
    expect(await largeur.inputValue()).toBe('2048');
  });
});

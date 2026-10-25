// Un accueil par public (ADR-0024) : la question « Pour quoi dessinez-vous ? » en tete d'une premiere visite, la suite adaptee a
// chacun des trois publics (le circuit, l'ordre des voies, le contexte de l'editeur, le panneau des integrateurs), « Passer », la
// memoire (stockage, rechargement, sans stockage), « Changer de public », le clavier seul et le doigt a 390 px.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { aLeFocus, attend, NAVIGATEUR, ouvrirExemple, permettrePressePapiers, pilote, textePressePapiers, texteDe, URL_PAGE } from './aide.js';

const memoire = (page: Page) => page.evaluate(() => localStorage.getItem('svg.accueil'));
const question = (page: Page) => page.locator('.public-question');
const rappel = (page: Page) => page.locator('.public-rappel');
const titreSuite = (page: Page) => page.locator('#titre-suite');
const ordreDesOnglets = (page: Page) => page.getByRole('tab').evaluateAll(l => l.map(e => e.id));
/** Une reponse : son nom est son titre suivi de sa phrase (toute la ligne est le bouton). */
const option = (page: Page, titre: string) => question(page).getByRole('button', { name: new RegExp('^' + titre) });
const selecteur = (page: Page) => page.locator('.selecteur-contexte .menu-bouton');
/** Les textes portent des espaces insecables (typographie francaise) : on les lit a espaces ordinaires. */
const lu = async (page: Page, selecteurCss: string) => (await texteDe(page.locator(selecteurCss))).replace(/\u00a0/g, ' ');

describe('un accueil par public', () => {
  const navigateur = pilote();

  it('pose la question a la premiere visite, sans rien imposer : trois reponses, « Passer », les trois voies et le circuit general', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await question(page).waitFor();
    expect(await lu(page, '.public-question h2')).toBe('Pour quoi dessinez-vous ?');
    expect(await question(page).locator('.public-titre').allInnerTexts()).toEqual(['Découper ou dessiner avec une machine', 'Retoucher un dessin ou une image', 'Intégrer l’éditeur à mon produit']);
    // Chaque reponse dit ce qu'on obtient, dans son nom meme : le titre puis la phrase, tels qu'on les voit.
    expect((await texteDe(option(page, 'Découper ou dessiner avec une machine'))).replace(/\u00a0/g, ' ')).toBe('Découper ou dessiner avec une machine Pour une Cricut : un fichier prêt pour Design Space, à la taille réelle, en découpe, au stylo ou en Print Then Cut.');
    // D'egale dignite : aucune n'est une action pleine, et la page n'en garde qu'une, celle de la voie.
    expect(await question(page).locator('button.primaire').count()).toBe(0);
    expect(await page.locator('main button.primaire:visible').count()).toBe(1);
    expect(await question(page).getByRole('button', { name: /^Passer/ }).isVisible()).toBe(true);
    // Les voies sont la, dans l'ordre d'avant, et l'exemple s'ouvre sans repondre.
    expect(await ordreDesOnglets(page)).toEqual(['voie-svg', 'voie-image', 'voie-formes']);
    expect(await lu(page, '#titre-suite')).toBe('De l’image au fichier prêt');
    expect(await page.locator('.circuit .etape').count()).toBe(3);
    expect(await memoire(page)).toBeNull();
    await ouvrirExemple(page);
    expect(await selecteur(page).textContent()).toBe('Machine : Générique');
  });

  it('machine : le circuit jusqu a Design Space, la bibliotheque d abord, et l editeur s ouvre en contexte Cricut, en millimetres', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await option(page, 'Découper ou dessiner avec une machine').click();
    await attend(() => question(page).count()).toBe(0);
    expect(await lu(page, '.public-rappel')).toBe('Accueil adapté : Découper ou dessiner avec une machine Changer de public');
    expect(await lu(page, '#titre-suite')).toBe('De la forme au fichier prêt pour Design Space');
    expect(await page.locator('.circuit .etape-titre').evaluateAll(l => l.map(e => (e.textContent ?? '').trim()))).toEqual(['1Une forme ou une image', '2Préparée pour la machine', '3Fichier prêt pour Design Space']);
    expect(await lu(page, '.circuit-public > p.aide')).toBe('L’éditeur s’ouvre réglé pour : Cricut Maker · 12 × 12, découpe, en millimètres. La machine se change dans la barre, à tout moment.');
    // Le focus suit : le titre de ce qui a change.
    await attend(() => aLeFocus(titreSuite(page))).toBe(true);
    expect(await ordreDesOnglets(page)).toEqual(['voie-formes', 'voie-image', 'voie-svg']);
    expect(await page.locator('#voie-formes').getAttribute('aria-selected')).toBe('true');
    expect(JSON.parse(await memoire(page) ?? 'null') as unknown).toEqual({ public: 'machine' });
    // Toute voie ouvre l'editeur en contexte Cricut : Maker, tapis 12 x 12, decoupe, millimetres, le tapis cadre.
    await page.locator('#voie-svg').click();
    await ouvrirExemple(page);
    await attend(() => selecteur(page).textContent()).toBe('Cricut Maker · 12 × 12');
    await page.locator('.panneau-cricut').waitFor();
    await attend(() => page.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim())).toBe('Contexte Cricut : Maker (Maker / Maker 3), tapis 12 × 12 po, papier cartonné, en millimètres.');
    await selecteur(page).click();
    for (const nom of ['Cricut Maker (Maker / Maker 3)', 'Tapis 12 × 12 po', 'Papier cartonné', 'Découpe', 'Millimètres']) {
      expect(await page.getByRole('menuitemradio', { name: nom, exact: true }).getAttribute('aria-checked'), nom).toBe('true');
    }
    await page.keyboard.press('Escape');
    // Un depart n'est pas une modification : « Terminer » ramene a la fiche sans rien reecrire.
    await page.locator('.editeur-barre .groupe.fin').getByRole('button', { name: 'Terminer', exact: true }).click();
    await page.locator('.resultat').waitFor();
    expect(await page.locator('.editeur-cadre').count()).toBe(0);
  });

  it('machine : la visite guidee reste proposee, et ouvre l exemple en contexte generique (elle enseigne la premiere retouche)', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800, publicAccueil: 'machine' });
    await page.locator('#voie-svg').click();
    await page.getByRole('button', { name: 'Essayer avec la visite guidée' }).click();
    await page.locator('.bulle-visite').waitFor();
    expect(await selecteur(page).textContent()).toBe('Machine : Générique');
  });

  it('retouche : l ordre d avant, et l invitation a la visite en evidence sous le circuit, en bouton discret', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await option(page, 'Retoucher un dessin ou une image').click();
    await attend(() => aLeFocus(titreSuite(page))).toBe(true);
    expect(await lu(page, '#titre-suite')).toBe('De votre dessin au fichier prêt');
    expect(await ordreDesOnglets(page)).toEqual(['voie-svg', 'voie-image', 'voie-formes']);
    expect(await lu(page, '.circuit-public .invitation')).toBe('Première fois ? Essayez avec notre exemple : changez une couleur en une minute. Essayer avec la visite guidée');
    // Une seule invitation sur la page (plus dans la zone de depot), et toujours une seule action pleine.
    expect(await page.locator('.invitation').count()).toBe(1);
    expect(await page.locator('.circuit-public .invitation button').getAttribute('class')).toBe('discret');
    expect(await page.locator('main button.primaire:visible').count()).toBe(1);
    await page.getByRole('button', { name: 'Essayer avec la visite guidée' }).click();
    await page.locator('.bulle-visite').waitFor();
    expect(await selecteur(page).textContent()).toBe('Machine : Générique');
  });

  it('integration : ce que fait l embarquement, ses options, un extrait copiable, le guide, et l editeur ouvert comme un hote', async () => {
    const { page, contexte } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await permettrePressePapiers(page, contexte);
    await option(page, 'Intégrer l’éditeur à mon produit').click();
    await attend(() => aLeFocus(titreSuite(page))).toBe(true);
    const panneau = page.locator('section.integration');
    expect(await lu(page, '#titre-suite')).toBe('Intégrer l’éditeur à votre produit');
    expect(await panneau.locator('dt').allInnerTexts()).toEqual(['svg', 'onEnregistrer', 'libelleEnregistrer', 'visite', 'stockage', 'baseAnnexes']);
    const code = panneau.locator('pre.code-integration');
    expect(await code.textContent()).toContain('libelleEnregistrer: \'Mettre à jour le logo\'');
    // L'extrait est en chasse fixe, nomme, et atteignable au clavier (il defile en largeur sur un petit ecran).
    expect(await code.evaluate(e => getComputedStyle(e.querySelector('code') ?? e).fontFamily)).toContain('IBM Plex Mono');
    expect(await code.getAttribute('tabindex')).toBe('0');
    expect(await code.getAttribute('aria-labelledby')).toBe('code-integration');
    expect(await code.getAttribute('role')).toBe('region');
    // Le guide : le fichier du depot declare par package.json, jamais une adresse inventee.
    expect(await panneau.getByRole('link', { name: 'docs/integration.md' }).getAttribute('href')).toBe('https://github.com/bertrandra/svg/blob/main/docs/integration.md');
    await panneau.getByRole('button', { name: 'Copier le code' }).click();
    await attend(() => panneau.locator('p[role=status]').first().textContent()).toBe('Code copié.');
    expect(await textePressePapiers(page)).toContain('EditeurSvg.ouvrir({');
    if (NAVIGATEUR === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('EditeurSvg.ouvrir({');
    // Aucune promesse : ni client, ni chiffre d'usage.
    expect(await panneau.textContent()).not.toMatch(/clients?\b|utilisateurs satisfaits|\d+\s?%/i);
    expect(await ordreDesOnglets(page)).toEqual(['voie-svg', 'voie-image', 'voie-formes']);

    // La demonstration : le libelle de l'hote, grise tant que rien n'a change (le defaut d'un hote), puis le SVG rendu a la page.
    const essayer = panneau.getByRole('button', { name: 'Essayer l’éditeur embarqué' });
    await essayer.click();
    await page.locator('.editeur-cadre').waitFor();
    const fin = page.locator('.editeur-barre .groupe.fin').getByRole('button', { name: 'Mettre à jour le logo', exact: true });
    expect(await texteDe(fin)).toBe('Mettre à jour le logo');
    expect(await fin.getAttribute('aria-disabled')).toBe('true');
    expect(await page.locator('.bulle-visite').count()).toBe(0);
    await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
    await page.keyboard.press('Delete');
    await attend(() => fin.getAttribute('aria-disabled')).not.toBe('true');
    await fin.click();
    await attend(() => page.locator('.editeur-cadre').count()).toBe(0);
    expect((await texteDe(panneau.locator('.message.neutre'))).replace(/\u00a0/g, ' ')).toMatch(/^Votre page a reçu le SVG retouché par onEnregistrer : \d[\d ]* caractères, déjà nettoyé\.$/);
    // La page n'a rien pris pour elle : ni fiche, ni brouillon ; le focus revient au bouton de la demonstration.
    expect(await page.locator('.resultat').count()).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('svg.brouillon'))).toBeNull();
    await attend(() => aLeFocus(essayer)).toBe(true);
  });

  it('« Passer » garde l accueil general, se retient, et laisse choisir plus tard', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await question(page).getByRole('button', { name: 'Passer la question et garder les trois voies' }).click();
    await attend(() => question(page).count()).toBe(0);
    expect(await lu(page, '.public-rappel')).toBe('Accueil général, pour tous les usages. Choisir un public');
    expect(await lu(page, '#titre-suite')).toBe('De l’image au fichier prêt');
    expect(await ordreDesOnglets(page)).toEqual(['voie-svg', 'voie-image', 'voie-formes']);
    expect(JSON.parse(await memoire(page) ?? 'null') as unknown).toEqual({ public: 'aucun' });
    await page.reload();
    await rappel(page).waitFor();
    expect(await question(page).count()).toBe(0);
    await rappel(page).getByRole('button', { name: 'Choisir un public' }).click();
    await question(page).waitFor();
  });

  it('retient le public au rechargement, et le change a tout moment (« Changer de public »)', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await option(page, 'Intégrer l’éditeur à mon produit').click();
    await page.reload();
    await page.locator('section.integration').waitFor();
    expect(await question(page).count()).toBe(0);
    await rappel(page).getByRole('button', { name: 'Changer de public' }).click();
    await question(page).waitFor();
    // La question rouverte montre le choix du moment, et y met le focus.
    const actuel = option(page, 'Intégrer l’éditeur à mon produit');
    expect(await actuel.getAttribute('aria-current')).toBe('true');
    await attend(() => aLeFocus(actuel)).toBe(true);
    await option(page, 'Découper ou dessiner avec une machine').click();
    await attend(() => ordreDesOnglets(page)).toEqual(['voie-formes', 'voie-image', 'voie-svg']);
    expect(await page.locator('section.integration').count()).toBe(0);
    await page.reload();
    await attend(() => lu(page, '#titre-suite')).toBe('De la forme au fichier prêt pour Design Space');
  });

  it('un stockage abime ou etranger se lit comme jamais repondu : la question revient, sans erreur', async () => {
    const { page, contexte } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800, naviguer: false });
    await contexte.addInitScript(() => { localStorage.setItem('svg.accueil', '{"public":"laser"}'); });
    await page.goto(URL_PAGE);
    await question(page).waitFor();
    expect(await ordreDesOnglets(page)).toEqual(['voie-svg', 'voie-image', 'voie-formes']);
  });

  it('sans stockage, le choix tient le temps de la page : un rechargement repose la question', async () => {
    const { page, contexte } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800, naviguer: false });
    await contexte.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Stockage refusé', 'SecurityError'); } }); });
    await page.goto(URL_PAGE);
    await option(page, 'Découper ou dessiner avec une machine').click();
    await attend(() => ordreDesOnglets(page)).toEqual(['voie-formes', 'voie-image', 'voie-svg']);
    // L'editeur s'ouvre quand meme en contexte Cricut, dans l'unite par defaut.
    await page.locator('#voie-svg').click();
    await ouvrirExemple(page);
    await attend(() => selecteur(page).textContent()).toBe('Cricut Maker · 12 × 12');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await attend(() => page.locator('.editeur-cadre').count()).toBe(0);
    expect(await rappel(page).count()).toBe(1);
    await page.reload();
    await question(page).waitFor();
  });

  it('se fait au clavier seul : Tab jusqu a une reponse, Entree, le focus suit, puis « Changer de public » et « Passer »', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    const machine = option(page, 'Découper ou dessiner avec une machine');
    for (let i = 0; i < 10 && !(await aLeFocus(machine)); i++) await page.keyboard.press('Tab');
    expect(await aLeFocus(machine)).toBe(true);
    // Les trois reponses puis « Passer » se suivent dans l'ordre de Tab.
    await page.keyboard.press('Tab');
    expect(await aLeFocus(option(page, 'Retoucher un dessin ou une image'))).toBe(true);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await attend(() => aLeFocus(titreSuite(page))).toBe(true);
    expect(await ordreDesOnglets(page)).toEqual(['voie-formes', 'voie-image', 'voie-svg']);
    // Maj+Tab remonte au rappel, Entree rouvre la question sur le choix du moment.
    await page.keyboard.press('Shift+Tab');
    expect(await aLeFocus(rappel(page).getByRole('button', { name: 'Changer de public' }))).toBe(true);
    await page.keyboard.press('Enter');
    await attend(() => aLeFocus(machine)).toBe(true);
    const passer = question(page).getByRole('button', { name: /^Passer/ });
    for (let i = 0; i < 5 && !(await aLeFocus(passer)); i++) await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await attend(() => aLeFocus(titreSuite(page))).toBe(true);
    expect(await ordreDesOnglets(page)).toEqual(['voie-svg', 'voie-image', 'voie-formes']);
  });

  it('au doigt a 390 px : des reponses de 40 px au moins, rien ne deborde, et la suite s adapte', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 390, hauteur: 800, tactile: true });
    const mesures = await question(page).locator('button').evaluateAll(l => l.map(b => { const r = b.getBoundingClientRect(); return { h: r.height, d: r.right }; }));
    expect(mesures.length).toBe(4);
    for (const m of mesures) { expect(m.h).toBeGreaterThanOrEqual(40); expect(m.d).toBeLessThanOrEqual(390); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await option(page, 'Intégrer l’éditeur à mon produit').tap();
    await page.locator('section.integration').waitFor();
    // L'extrait de code defile dans son cadre plutot que d'elargir la page.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await rappel(page).getByRole('button', { name: 'Changer de public' }).tap();
    await option(page, 'Découper ou dessiner avec une machine').tap();
    await attend(() => ordreDesOnglets(page)).toEqual(['voie-formes', 'voie-image', 'voie-svg']);
    // Le circuit passe en colonne : les trois etapes l'une sous l'autre.
    const hauts = await page.locator('.circuit .etape').evaluateAll(l => l.map(e => Math.round(e.getBoundingClientRect().top)));
    expect(hauts[0]).toBeLessThan(hauts[1] ?? 0);
    expect(hauts[1]).toBeLessThan(hauts[2] ?? 0);
  });
});

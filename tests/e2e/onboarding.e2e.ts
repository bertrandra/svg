// L'accueil guide (ADR-0019) sur la page construite : la visite de l'editeur jusqu'au fichier recupere, a la souris, au clavier
// seul et au doigt ; « Passer », Echap, F6 ; la visite rejouee du menu Aide ; la memoire (stockage injecte, puis session sans
// stockage) ; l'embarquement (rien sans option, la visite avec `visite: true`) ; les reperes de premiere rencontre et chaque etat vide.
//
// La visite ne s'ouvre jamais seule sur « Ouvrir l'exemple » : les autres tests de navigateur ouvrent l'exemple dans un navigateur
// neuf et n'en voient rien. Ici, on la demande (« Essayer avec la visite guidée »), ou on la rejoue.

import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Download, Page } from 'playwright';
import { aLeFocus, attend, boutonFichier, BUNDLE_EMBARQUE, imageDeTest, ouvrirCode, ouvrirExemple, ouvrirMenu, pilote, texteDe, textesDe, URL_INTEGRATION, URL_PAGE } from './aide.js';

const VERT = '#1f8a3a';
const bulle = (page: Page) => page.locator('.bulle-visite');
const toile = (page: Page) => page.locator('.editeur-svg-toile');
/** Le texte d'une bulle ou d'une note, espaces insecables ramenees a des espaces ordinaires. */
const lu = async (page: Page, l = bulle(page)) => (await texteDe(l)).replace(/\u00a0/g, ' ');
const etape = async (page: Page) => (/Étape (\d) sur 5/.exec(await lu(page))?.[1] ?? '0');
const repere = (page: Page, id: string) => page.locator(`.repere[data-repere="${id}"]`);

/** Garde chaque phrase que la region vocale de l'editeur a dite (elle se vide et se remplit) : on lit l'historique, pas l'instant. */
async function ecouterAnnonces(page: Page): Promise<() => Promise<string[]>> {
  await page.locator('.editeur-cadre > .annonces').evaluate(e => {
    const w = window as unknown as { __dit: string[] };
    w.__dit = [];
    new MutationObserver(() => { const t = (e.textContent ?? '').trim(); if (t) w.__dit.push(t.replace(/\u00a0/g, ' ')); }).observe(e, { childList: true, characterData: true, subtree: true });
  });
  return () => page.evaluate(() => (window as unknown as { __dit: string[] }).__dit.slice());
}

async function telecharger(page: Page, action: () => Promise<void>): Promise<{ nom: string; texte: string }> {
  const [t]: [Download, void] = await Promise.all([page.waitForEvent('download'), action()]);
  return { nom: t.suggestedFilename(), texte: readFileSync(await t.path(), 'utf8') };
}

/** « Essayer avec la visite guidée » : l'exemple s'ouvre, la bulle est a l'etape 1. */
async function essayer(page: Page, tactile = false): Promise<void> {
  const b = page.getByRole('button', { name: 'Essayer avec la visite guidée' });
  if (tactile) await b.tap(); else await b.click();
  await page.locator('.editeur-cadre').waitFor();
  await attend(() => etape(page)).toBe('1');
}

describe('la visite guidee', () => {
  const navigateur = pilote();

  it('ne s ouvre pas sur « Ouvrir l exemple » ; l accueil la propose sans seconde action pleine', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    const panneau = page.locator('#panneau-svg');
    expect(await lu(page, panneau.locator('.invitation'))).toBe('Première fois ? Essayez avec notre exemple : changez une couleur en une minute. Essayer avec la visite guidée');
    expect(await panneau.locator('button.primaire').count()).toBe(1);
    expect(await panneau.getByRole('button', { name: 'Essayer avec la visite guidée' }).getAttribute('class')).toBe('discret');
    await ouvrirExemple(page);
    expect(await bulle(page).count()).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('svg.guide'))).toBeNull();
  });

  it('mene a la souris jusqu au SVG telecharge, recolore ; chaque etape avance sur le geste et se dit', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await essayer(page);
    const annonces = await ecouterAnnonces(page);
    expect(await lu(page)).toContain('Choisissez une forme');
    expect(await page.locator('.visite-cible').count()).toBe(1);
    // La toile garde le focus : la bulle ne le prend pas.
    expect(await aLeFocus(toile(page))).toBe(true);
    // Rien ne bloque le reste de l'editeur : on clique la forme a travers le filet de la cible.
    // Chaque etape se dit dans la region vocale, apres la phrase du geste qui l'a amenee : on l'attend avant le geste suivant.
    const dite = (n: number) => attend(async () => (await annonces()).some(t => t.startsWith('Visite guidée, étape ' + n + ' sur 5'))).toBe(true);
    await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
    await attend(() => etape(page)).toBe('2');
    expect(await lu(page)).toContain('Changez sa couleur');
    await dite(2);
    await page.locator('.editeur-barre input[type=color][aria-label="Remplissage"]').fill(VERT);
    await attend(() => etape(page)).toBe('3');
    expect(await lu(page)).toContain('Vous pouvez toujours revenir en arrière');
    await dite(3);
    await bulle(page).getByRole('button', { name: 'Suivant' }).click();
    await attend(() => etape(page)).toBe('4');
    expect(await lu(page)).toContain('Cliquez « Fichier », l’icône de feuille en haut à droite, puis « Télécharger le SVG ».');
    await dite(4);
    // Le filet de l'etape entoure le bouton du menu Fichier, qui porte « Télécharger le SVG » en tete.
    await attend(() => page.locator('.visite-cible').count()).toBe(1);
    const cible = await page.locator('.visite-cible').boundingBox(), bouton = await boutonFichier(page).boundingBox();
    expect(cible && bouton && cible.x <= bouton.x && cible.y <= bouton.y && cible.x + cible.width >= bouton.x + bouton.width).toBe(true);
    await boutonFichier(page).click();
    const fichier = await telecharger(page, () => page.locator('.menu-panneau').getByRole('menuitem', { name: 'Télécharger le SVG', exact: true }).click());
    expect(fichier.nom).toBe('exemple.svg');
    expect(fichier.texte).toContain('fill="' + VERT + '"');
    expect(fichier.texte).not.toContain('#c81e28');
    await attend(() => etape(page)).toBe('5');
    expect(await lu(page)).toContain('Votre première retouche est faite');
    for (const suite of ['Convertir une image en SVG', 'Prendre une forme dans la bibliothèque', 'Préparer pour une Cricut']) await bulle(page).getByRole('button', { name: suite }).waitFor();
    await dite(5);
    expect((await annonces()).filter(t => /^Visite guidée, étape [2-5] sur 5/.test(t)).map(t => t.slice(0, 33))).toEqual(
      ['Visite guidée, étape 2 sur 5 : Ch', 'Visite guidée, étape 3 sur 5 : Vo', 'Visite guidée, étape 4 sur 5 : Ré', 'Visite guidée, étape 5 sur 5 : Vo']
    );
    await bulle(page).getByRole('button', { name: 'Terminer' }).click();
    expect(await bulle(page).count()).toBe(0);
    await attend(async () => (await annonces()).at(-1)).toBe('Visite guidée terminée. Elle se rejoue depuis le menu Aide.');
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('svg.guide') ?? 'null')) as unknown).toMatchObject({ visite: true });
  });

  it('se fait au clavier seul : Tab, Entree, Page suivante, F6, les fleches d un menu', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    for (let i = 0; i < 20 && !(await aLeFocus(page.getByRole('button', { name: 'Essayer avec la visite guidée' }))); i++) await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await attend(() => etape(page)).toBe('1');
    expect(await aLeFocus(toile(page))).toBe(true);
    const annonces = await ecouterAnnonces(page);
    // L'etape 1 dit comment atteindre la bulle au clavier.
    await page.keyboard.press('F6');
    await attend(() => aLeFocus(bulle(page))).toBe(true);
    await page.keyboard.press('F6');
    await attend(() => aLeFocus(toile(page))).toBe(true);
    await page.keyboard.press('PageDown');
    await attend(() => etape(page)).toBe('2');
    // De la toile, Tab passe les formes puis entre dans l'inspecteur : le code du remplissage s'ecrit au clavier.
    const code = page.locator('.editeur-inspecteur input[aria-label="Remplissage (code)"]');
    for (let i = 0; i < 30 && !(await aLeFocus(code)); i++) await page.keyboard.press('Tab');
    await page.keyboard.press('Control+a');
    await page.keyboard.type(VERT);
    await page.keyboard.press('Enter');
    await attend(() => etape(page)).toBe('3');
    // F6, puis Tab jusqu'a « Suivant » (Echap y quitterait la visite).
    await page.keyboard.press('F6');
    await attend(() => aLeFocus(bulle(page))).toBe(true);
    const suivant = bulle(page).getByRole('button', { name: 'Suivant' });
    for (let i = 0; i < 6 && !(await aLeFocus(suivant)); i++) await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await attend(() => etape(page)).toBe('4');
    // Le focus est reste dans la bulle. F6 rend la toile ; Echap y defait la selection (la visite reste), et Maj+Tab
    // remonte de la toile, par les calques, jusqu'au bouton Fichier de la barre ; Entree ouvre son menu, les fleches vont a
    // « Télécharger le SVG ».
    expect(await page.evaluate(() => !!document.activeElement?.closest('.bulle-visite'))).toBe(true);
    await page.keyboard.press('F6');
    await attend(() => aLeFocus(toile(page))).toBe(true);
    await page.keyboard.press('Escape');
    await attend(() => page.locator('.editeur-barre-selection').count()).toBe(0);
    expect(await etape(page)).toBe('4');
    const fichier = boutonFichier(page);
    for (let i = 0; i < 60 && !(await aLeFocus(fichier)); i++) await page.keyboard.press('Shift+Tab');
    expect(await aLeFocus(fichier)).toBe(true);
    await page.keyboard.press('Enter');
    const svg = page.locator('.menu-panneau').getByRole('menuitem', { name: 'Télécharger le SVG', exact: true });
    for (let i = 0; i < 4 && !(await aLeFocus(svg)); i++) await page.keyboard.press('ArrowDown');
    expect(await aLeFocus(svg)).toBe(true);
    const f = await telecharger(page, () => page.keyboard.press('Enter'));
    expect(f.texte).toContain('fill="' + VERT + '"');
    await attend(() => etape(page)).toBe('5');
    // L'etape se dit apres la phrase du telechargement ; on l'attend avant d'aller dans la bulle.
    await attend(async () => (await annonces()).some(t => t.startsWith('Visite guidée, étape 5 sur 5'))).toBe(true);
    await page.keyboard.press('F6');
    await attend(() => aLeFocus(bulle(page))).toBe(true);
    const terminer = bulle(page).getByRole('button', { name: 'Terminer' });
    for (let i = 0; i < 8 && !(await aLeFocus(terminer)); i++) await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await attend(() => bulle(page).count()).toBe(0);
    // Le focus etait dans la bulle : il revient a la toile, il ne tombe pas sur le corps de la page.
    await attend(() => aLeFocus(toile(page))).toBe(true);
    await attend(async () => (await annonces()).at(-1)).toBe('Visite guidée terminée. Elle se rejoue depuis le menu Aide.');
  });

  it('se passe par « Passer la visite », par Echap dans la bulle, et par Echap quand rien d autre n est a refermer', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await essayer(page);
    const annonces = await ecouterAnnonces(page);
    await bulle(page).getByRole('button', { name: 'Passer la visite' }).click();
    expect(await bulle(page).count()).toBe(0);
    await attend(async () => (await annonces()).at(-1)).toBe('Visite guidée quittée. Elle se rejoue depuis le menu Aide.');

    // Rejouee du menu Aide : Echap dans la bulle la quitte et rend le focus a la toile ; l'editeur reste ouvert.
    await ouvrirMenu(page, 'Aide');
    await page.getByRole('menuitem', { name: 'Visite guidée' }).click();
    await attend(() => etape(page)).toBe('1');
    await page.keyboard.press('F6');
    await attend(() => aLeFocus(bulle(page))).toBe(true);
    await page.keyboard.press('Escape');
    await attend(() => bulle(page).count()).toBe(0);
    await attend(() => aLeFocus(toile(page))).toBe(true);
    expect(await page.locator('.editeur-cadre').count()).toBe(1);

    // Sur la toile, Echap defait d'abord la selection (Echap puis Tab quittent toujours la toile), puis quitte la visite.
    await ouvrirMenu(page, 'Aide');
    await page.getByRole('menuitem', { name: 'Visite guidée' }).click();
    await attend(() => etape(page)).toBe('1');
    await toile(page).focus();
    await page.keyboard.press('PageDown');
    await attend(() => etape(page)).toBe('2');
    await page.keyboard.press('Escape');
    await attend(() => page.locator('.editeur-barre-selection').count()).toBe(0);
    expect(await bulle(page).count()).toBe(1);
    expect(await lu(page)).toContain('Choisissez d’abord une forme');
    await page.keyboard.press('Escape');
    await attend(() => bulle(page).count()).toBe(0);
    expect(await page.locator('.editeur-cadre').count()).toBe(1);
    // Et un Echap de plus ferme l'editeur, comme avant (rien n'a change).
    await page.keyboard.press('Escape');
    await attend(() => page.locator('.editeur-cadre').count()).toBe(0);
  });

  it('offre « Aller à la visite guidée » juste apres « Aller à la toile », pendant la visite seulement', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await essayer(page);
    await page.getByRole('link', { name: 'Aller à la toile' }).focus();
    await page.keyboard.press('Tab');
    const lien = page.getByRole('link', { name: 'Aller à la visite guidée' });
    await attend(() => aLeFocus(lien)).toBe(true);
    await page.keyboard.press('Enter');
    await attend(() => aLeFocus(bulle(page))).toBe(true);
    await bulle(page).getByRole('button', { name: 'Passer la visite' }).click();
    expect(await lien.count()).toBe(0);
  });

  it('se rejoue du menu Aide et se retient : elle ne se repropose plus, meme apres rechargement', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await essayer(page);
    await bulle(page).getByRole('button', { name: 'Passer la visite' }).click();
    await page.keyboard.press('Escape');
    await attend(() => page.locator('.editeur-cadre').count()).toBe(0);
    // Vue une fois : l'accueil ne la propose plus, ni maintenant ni apres rechargement.
    expect(await page.locator('.invitation').count()).toBe(0);
    await page.reload();
    await page.getByRole('heading', { name: 'Éditeur SVG' }).waitFor();
    expect(await page.locator('.invitation').count()).toBe(0);
    await ouvrirExemple(page);
    expect(await bulle(page).count()).toBe(0);
    // Le menu Aide la rejoue toujours, a la premiere etape ; il donne aussi les raccourcis.
    // Dans la page, il ouvre aussi les deux documentations livrees dans aide/, et propose l'autre langue en dernier (ADR-0042).
    await ouvrirMenu(page, 'Aide');
    expect(await textesDe(page.getByRole('menu', { name: 'Aide' }).getByRole('menuitem'))).toEqual(['Visite guidée', 'Raccourcis clavier', 'Guide de l’éditeur', 'La Cricut, c’est simple', 'Language: English']);
    await page.getByRole('menuitem', { name: 'Raccourcis clavier' }).click();
    const boite = page.getByRole('dialog', { name: 'Raccourcis clavier' });
    await boite.waitFor();
    expect(await texteDe(boite)).toContain('F6 va à sa bulle');
    await page.keyboard.press('Escape');
    await attend(() => boite.count()).toBe(0);
    expect(await page.locator('.editeur-cadre').count()).toBe(1);
    await ouvrirMenu(page, 'Aide');
    await page.getByRole('menuitem', { name: 'Visite guidée' }).click();
    await attend(() => etape(page)).toBe('1');
  });

  it('sans stockage, se propose une fois par session : apres la visite l accueil se tait, un rechargement la repropose', async () => {
    const { page, contexte } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800, naviguer: false });
    await contexte.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Stockage refusé', 'SecurityError'); } }); });
    await page.goto(URL_PAGE);
    await essayer(page);
    await bulle(page).getByRole('button', { name: 'Passer la visite' }).click();
    await page.keyboard.press('Escape');
    await attend(() => page.locator('.editeur-cadre').count()).toBe(0);
    expect(await page.locator('.invitation').count()).toBe(0);
    await page.reload();
    await page.locator('.invitation').waitFor();
    await essayer(page);
  });

  it('au doigt a 390 px : une bulle lisible dans l ecran, des cibles de 40 px, « Plus » pour le fichier, un tiroir pour la suite', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 390, hauteur: 800, tactile: true });
    await essayer(page, true);
    const mesure = async () => bulle(page).evaluate(b => {
      const r = b.getBoundingClientRect();
      const boutons = Array.from(b.querySelectorAll('button')).map(x => x.getBoundingClientRect().height);
      return { gauche: r.left, droite: r.right, haut: r.top, bas: r.bottom, petits: boutons.filter(h => h < 40 - 0.01).length, taille: parseFloat(getComputedStyle(b).fontSize) };
    });
    const m = await mesure();
    expect(m.gauche).toBeGreaterThanOrEqual(0);
    expect(m.droite).toBeLessThanOrEqual(390);
    expect(m.bas).toBeLessThanOrEqual(800);
    expect(m.petits).toBe(0);
    expect(m.taille).toBeGreaterThanOrEqual(14);
    expect(await lu(page)).toContain('Touchez une des formes');
    await page.locator('.editeur-svg-toile path[data-id="f2"]').tap();
    await attend(() => etape(page)).toBe('2');
    await page.locator('.editeur-barre input[type=color][aria-label="Remplissage"]').fill(VERT);
    await attend(() => etape(page)).toBe('3');
    await bulle(page).getByRole('button', { name: 'Suivant' }).tap();
    await attend(() => etape(page)).toBe('4');
    expect(await lu(page)).toContain('Touchez « Plus » (les trois points)');
    expect((await mesure()).petits).toBe(0);
    await page.getByRole('button', { name: /^Plus d’actions/ }).tap();
    const f = await telecharger(page, () => page.getByRole('menuitem', { name: 'Télécharger le SVG', exact: true }).tap());
    expect(f.texte).toContain('fill="' + VERT + '"');
    await attend(() => etape(page)).toBe('5');
    // La suite « bibliotheque » ouvre le tiroir de l'inspecteur sur la section de la bibliotheque.
    await bulle(page).getByRole('button', { name: 'Prendre une forme dans la bibliothèque' }).tap();
    await attend(() => page.locator('.voile').count()).toBe(1);
    await attend(() => page.locator('.editeur-inspecteur details.section', { hasText: 'Bibliothèque de formes' }).evaluate(d => (d as HTMLDetailsElement).open)).toBe(true);
    expect(await bulle(page).count()).toBe(0);
  });

  it('se rejoue au doigt depuis « Plus », rubrique Aide, placee en tete', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 390, hauteur: 800, tactile: true });
    await ouvrirExemple(page, true);
    await page.getByRole('button', { name: /^Plus d’actions/ }).tap();
    expect(await page.locator('.menu-panneau .menu-rubrique .menu-titre').first().innerText()).toBe('Aide');
    await page.getByRole('menuitem', { name: 'Visite guidée' }).tap();
    await attend(() => etape(page)).toBe('1');
  });

  it('suite « Convertir une image » : l editeur s enregistre et la voie de conversion prend la main', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await essayer(page);
    await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
    await page.locator('.editeur-barre input[type=color][aria-label="Remplissage"]').fill(VERT);
    for (let i = 0; i < 2; i++) await bulle(page).getByRole('button', { name: 'Suivant' }).click();
    await attend(() => etape(page)).toBe('5');
    await bulle(page).getByRole('button', { name: 'Convertir une image en SVG' }).click();
    await attend(() => page.locator('.editeur-cadre').count()).toBe(0);
    expect(await page.getByRole('tab', { name: /^Convertir une image/ }).getAttribute('aria-selected')).toBe('true');
    expect(await texteDe(page.locator('.resultat'))).toContain('exemple.svg');
  });
});

describe('la visite dans l editeur embarque', () => {
  const navigateur = pilote();
  const PETIT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10L60 10L60 60L10 60Z" fill="#c81e28"/><path d="M50 50L90 50L90 90L50 90Z" fill="#1428a0"/></svg>';

  beforeAll(() => {
    if (!existsSync(BUNDLE_EMBARQUE)) throw new Error('dist/editeur-svg-embarque.js manque : lancer `npm run construire` avant `npm run e2e`.');
  });

  async function ouvrir(page: Page, options: Record<string, unknown>) {
    await page.evaluate(([svg, o]) => {
      const w = window as unknown as { EditeurSvg: { ouvrir(x: Record<string, unknown>): { fermer(): void } }; __recu: string; __poignee: { fermer(): void } };
      w.__poignee = w.EditeurSvg.ouvrir({ svg: String(svg), ...(o as Record<string, unknown>), onEnregistrer: (s: string) => { w.__recu = s; } });
    }, [PETIT, options] as const);
    await page.locator('.editeur-svg .editeur-cadre').waitFor();
  }

  it('ne propose ni visite ni repere sans l option : le menu Aide n a que les raccourcis', async () => {
    const { page } = await navigateur.ouvrir({ naviguer: false });
    await page.goto(URL_INTEGRATION);
    await ouvrir(page, {});
    expect(await bulle(page).count()).toBe(0);
    await ouvrirMenu(page, 'Aide');
    expect(await textesDe(page.getByRole('menu', { name: 'Aide' }).getByRole('menuitem'))).toEqual(['Raccourcis clavier']);
    await page.keyboard.press('Escape');
    // Un double-clic sur une forme (ses points) : pas de repere chez un hote qui n'a rien demande.
    await page.locator('.editeur-svg-toile path[data-id="f1"]').dblclick();
    await attend(() => page.locator('.editeur-inspecteur').innerText()).toContain('Point');
    expect(await page.locator('.repere').count()).toBe(0);
  });

  it('s ouvre avec visite: true, dit « Enregistrer », s acheve sur l enregistrement, et ne revient pas a la reouverture', async () => {
    const { page } = await navigateur.ouvrir({ naviguer: false });
    await page.goto(URL_INTEGRATION);
    await ouvrir(page, { visite: true, fermerApresEnregistrer: false });
    await attend(() => etape(page)).toBe('1');
    await page.locator('.editeur-svg-toile path[data-id="f1"]').click();
    await attend(() => etape(page)).toBe('2');
    await page.locator('.editeur-barre input[type=color][aria-label="Remplissage"]').fill(VERT);
    await attend(() => etape(page)).toBe('3');
    await bulle(page).getByRole('button', { name: 'Suivant' }).click();
    await attend(() => etape(page)).toBe('4');
    expect(await lu(page)).toContain('Cliquez « Enregistrer », le bouton plein en haut à droite : votre dessin retouché revient dans la page qui a ouvert l’éditeur.');
    await page.locator('.editeur-barre .groupe.fin button.primaire').click();
    await attend(() => etape(page)).toBe('5');
    expect(await page.evaluate(() => (window as unknown as { __recu: string }).__recu)).toContain(VERT);
    // Pas de suite « Convertir une image » chez un hote (la page seule l'a), ni de bibliotheque sans l'option.
    expect(await bulle(page).getByRole('button', { name: 'Convertir une image en SVG' }).count()).toBe(0);
    expect(await bulle(page).getByRole('button', { name: 'Préparer pour une Cricut' }).count()).toBe(1);
    await page.evaluate(() => (window as unknown as { __poignee: { fermer(): void } }).__poignee.fermer());
    await ouvrir(page, { visite: true });
    expect(await bulle(page).count()).toBe(0);
    await ouvrirMenu(page, 'Aide');
    expect(await textesDe(page.getByRole('menu', { name: 'Aide' }).getByRole('menuitem'))).toEqual(['Visite guidée', 'Raccourcis clavier']);
  });

  it('refuse une option « visite » qui n est pas vraie ou fausse, en francais', async () => {
    const { page } = await navigateur.ouvrir({ naviguer: false });
    await page.goto(URL_INTEGRATION);
    const erreur = await page.evaluate(() => {
      const w = window as unknown as { EditeurSvg: { ouvrir(x: Record<string, unknown>): unknown } };
      try { w.EditeurSvg.ouvrir({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><path d="M0 0H9V9Z"/></svg>', onEnregistrer: () => undefined, visite: 'oui' }); return ''; } catch (e) { return (e as Error).name + ' : ' + (e as Error).message; }
    });
    expect(erreur).toBe('TypeError : EditeurSvg.ouvrir : L’option « visite » doit être vraie ou fausse.');
  });
});

describe('les reperes de premiere rencontre', () => {
  const navigateur = pilote();

  it('points : au premier double-clic, refermable par « Compris », jamais redit (meme apres rechargement)', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirExemple(page);
    await page.locator('.editeur-svg-toile path[data-id="f3"]').dblclick();
    await repere(page, 'points').waitFor();
    expect(await lu(page, repere(page, 'points'))).toContain('Les petits carrés sont les points du contour');
    expect(await repere(page, 'points').getAttribute('role')).toBe('note');
    // La note ne prend pas le focus ; refermee au clavier, le focus passe a ce qui la suit.
    await repere(page, 'points').getByRole('button', { name: 'Compris' }).focus();
    await page.keyboard.press('Enter');
    await attend(() => repere(page, 'points').count()).toBe(0);
    expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('svg.guide') ?? 'null')) as unknown).toEqual({ visite: false, reperes: ['points'] });
    await page.reload();
    await ouvrirExemple(page);
    await page.locator('.editeur-svg-toile path[data-id="f3"]').dblclick();
    await attend(() => page.locator('.editeur-inspecteur').innerText()).toContain('Point');
    expect(await repere(page, 'points').count()).toBe(0);
  });

  it('booleen : apres le premier assemblage de formes, dans l inspecteur du resultat', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10H60V60H10Z" fill="#c81e28"/><path d="M40 40H90V90H40Z" fill="#1428a0"/></svg>');
    await toile(page).focus();
    await page.keyboard.press('Control+a');
    await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
    expect(await repere(page, 'booleen').count()).toBe(0);
    await page.getByRole('button', { name: /^Union/ }).click();
    await repere(page, 'booleen').waitFor();
    expect(await lu(page, repere(page, 'booleen'))).toContain('à la couleur de celle du dessous');
  });

  it('cricut : au premier choix du contexte, en tete du panneau « Prêt pour Cricut »', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirExemple(page);
    await page.locator('.selecteur-contexte .menu-bouton').click();
    await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
    await repere(page, 'cricut').waitFor();
    expect(await page.locator('.panneau-cricut .repere').count()).toBe(1);
    await repere(page, 'cricut').getByRole('button', { name: 'Compris' }).click();
    await attend(() => repere(page, 'cricut').count()).toBe(0);
  });

  it('conversion : au premier resultat d une image vectorisee', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await page.getByRole('tab', { name: /^Convertir une image/ }).click();
    await page.locator('.vectoriser input[type=file]').setInputFiles(imageDeTest());
    await page.locator('.fiche-resultat').waitFor({ timeout: 60_000 });
    await repere(page, 'conversion').waitFor();
    expect(await lu(page, repere(page, 'conversion'))).toContain('Passez le grain à « Lisse »');
  });
});

describe('les etats vides', () => {
  const navigateur = pilote();

  it('l editeur sans selection : ce que regle le panneau, et une forme a choisir d un clic', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirExemple(page);
    const etat = page.locator('.editeur-inspecteur > [data-vide="premiere-fois"]');
    expect(await lu(page, etat)).toContain('Aucune forme choisie.');
    await etat.getByRole('button', { name: 'Choisir la forme 1' }).click();
    await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
    // Les versions nommees, vides : ce qu'est une version et comment en garder une.
    await page.keyboard.press('Escape');
    await page.locator('.editeur-inspecteur details.section', { hasText: 'Versions nommées' }).locator('> summary').click();
    expect(await lu(page, page.locator('.editeur-inspecteur details.section', { hasText: 'Versions nommées' }))).toContain('Aucune version gardée.');
  });

  it('un dessin vide par la personne : calques, inspecteur et toile disent que rien n est perdu, et le retour est a un clic', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirExemple(page);
    await toile(page).focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await attend(() => page.locator('.editeur-svg-toile path[data-id]').count()).toBe(0);
    expect(await lu(page, page.locator('.editeur-calques [data-vide="vide"]'))).toContain('Toutes les formes ont été retirées.');
    expect(await page.locator('.toile-vide[data-vide="vide"]').count()).toBe(1);
    expect(await lu(page, page.locator('.editeur-inspecteur details.section:not(.section-nuancier)', { hasText: 'Recolorer le dessin' }))).toContain('Aucune couleur pour l’instant.');
    await page.locator('.editeur-inspecteur [data-vide="vide"]').getByRole('button', { name: 'Faire revenir les formes' }).click();
    await attend(() => page.locator('.editeur-svg-toile path[data-id]').count()).toBe(4);
    expect(await page.locator('.toile-vide').count()).toBe(0);
  });

  it('« Par couleur » sans contour, et la bibliotheque sans resultat, disent quoi changer', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10H40V40H10Z" fill="#c81e28"/><path d="M50 50H90V90H50Z" fill="#1428a0"/></svg>');
    const section = page.locator('.editeur-calques details.section', { hasText: 'Par couleur' });
    await section.locator('> summary').click();
    await section.getByRole('button', { name: 'Trait', exact: true }).click();
    const etat = section.locator('[data-vide="aucun-resultat"]');
    expect(await lu(page, etat)).toBe('Aucune forme n’a de contour. Lire le fond et le trait');
    await etat.getByRole('button', { name: 'Lire le fond et le trait' }).click();
    await attend(() => section.getByRole('button', { name: 'Les deux', exact: true }).getAttribute('aria-pressed')).toBe('true');
    // La bibliotheque du panneau : un panier vide qui dit a quoi il sert, puis une recherche sans resultat.
    await page.locator('.editeur-inspecteur details.section', { hasText: 'Bibliothèque de formes' }).locator('> summary').click();
    await page.locator('.editeur-inspecteur .vignette').first().waitFor({ timeout: 60_000 });
    expect(await page.locator('.editeur-inspecteur').innerText()).toContain('Panier vide.');
    await page.locator('.editeur-inspecteur input[type=search]').fill('zzqxw');
    const rien = page.locator('.editeur-inspecteur [data-vide="aucun-resultat"]');
    expect(await lu(page, rien)).toContain('Aucune forme ne correspond à « zzqxw ».');
    await rien.getByRole('button', { name: 'Effacer la recherche' }).click();
    await attend(() => page.locator('.editeur-inspecteur .vignette').count()).toBeGreaterThan(0);
  });

  it('l accueil : un nuancier vide, un lot sans aucune image convertie', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await page.getByText('Nuancier proposé dans l’éditeur').click();
    await page.locator('.nuancier-page textarea').fill('');
    expect((await texteDe(page.locator('.nuancier-page'))).replace(/\u00a0/g, ' ')).toContain('Aucune teinte lue. Écrivez une teinte par ligne');
    await page.getByRole('tab', { name: /^Convertir une image/ }).click();
    const casse = { mimeType: 'image/png', buffer: Buffer.from('pas une image') };
    await page.locator('.vectoriser input[type=file]').setInputFiles([{ ...casse, name: 'a.png' }, { ...casse, name: 'b.png' }]);
    await page.locator('.lot [data-vide="aucun-resultat"]').waitFor({ timeout: 60_000 });
    expect(await lu(page, page.locator('.lot [data-vide="aucun-resultat"]'))).toContain('Aucune image n’a été convertie.');
  });

  it('le panneau Cricut sans constat dit que rien n est a corriger, et ce que fait l export', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path d="M20 20H120V120H20Z" fill="#c81e28"/></svg>');
    await page.locator('.selecteur-contexte .menu-bouton').click();
    await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
    await page.locator('.panneau-cricut .pret').waitFor();
    expect((await texteDe(page.locator('.panneau-cricut'))).replace(/\u00a0/g, ' ')).toContain('Rien à corriger. « Exporter pour Cricut » écrit le fichier à importer dans Design Space.');
  });
});

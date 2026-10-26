// La fin du parcours, sur la page construite : recuperer son fichier d'un geste, « Terminer » qui ramene a la fiche (dont le
// telechargement est l'action primaire), Ctrl+S qui garde sans fermer, les autres formats au clavier, et la fin du parcours Cricut
// (confirmation des points a corriger, vue cadree sur le tapis, millimetres, carte « Dans Design Space », nom de fichier francais),
// a la souris, au clavier et au doigt sur 390 px.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Download, Locator, Page } from 'playwright';
import { aLeFocus, attend, boutonFichier, elementFichier, ouvrirCode, ouvrirExemple, ouvrirMenu, pilote, telechargerParFichier, terminer, texteDe } from './aide.js';

const VERT = '#1f8a3a';
const CHARGEMENT = 60_000;
/** Un carre et un triangle ouvert a la pointe fine : deux constats « à corriger » (trace ouvert, partie fine), aucun bloquant. */
const OUVERT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 288"><path d="M48 48H240V240H48Z" fill="#c81e28"/><path d="M288 48L432 48L360 240" fill="#1428a0"/></svg>';
/** Deux rectangles : rien a corriger, le dessin est pret. */
const PROPRE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 288"><path d="M48 48H240V240H48Z" fill="#c81e28"/><path d="M288 48H432V240H288Z" fill="#1428a0"/></svg>';

async function telecharger(page: Page, action: () => Promise<void>): Promise<{ nom: string; texte: string }> {
  const [t]: [Download, void] = await Promise.all([page.waitForEvent('download'), action()]);
  return { nom: t.suggestedFilename(), texte: readFileSync(await t.path(), 'utf8') };
}

/** Compte les gestes d'un parcours : chaque appel est un clic, un toucher ou un choix de couleur de la personne. */
function compteur() {
  let n = 0;
  return { geste: async (f: () => Promise<unknown>) => { n++; await f(); }, total: () => n };
}

describe('recuperer son dessin', () => {
  const navigateur = pilote();

  it('change une couleur puis recupere le SVG en cinq gestes, par le menu Fichier, sans quitter l editeur', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    const g = compteur();
    await g.geste(() => ouvrirExemple(page));
    await g.geste(() => page.locator('.editeur-svg-toile path[data-id="f2"]').click());
    await g.geste(() => page.locator('.editeur-barre input[type=color][aria-label="Remplissage"]').fill(VERT));
    let fichier = { nom: '', texte: '' };
    await g.geste(() => boutonFichier(page).click());
    // « Télécharger le SVG » est le premier element de la rubrique « Récupérer le dessin ».
    const recuperer = page.getByRole('menu', { name: 'Récupérer le dessin' }).getByRole('menuitem');
    expect(await texteDe(recuperer.first())).toBe('Télécharger le SVG');
    await g.geste(async () => { fichier = await telecharger(page, () => recuperer.first().click()); });
    expect(fichier.nom).toBe('exemple.svg');
    expect(fichier.texte).toContain('fill="' + VERT + '"');
    // Avant : « Enregistrer », puis « Exporter » sur la fiche, puis « SVG » parmi neuf formats (six gestes). Puis un bouton dans la
    // barre (quatre) ; le proprietaire l'a range dans le menu Fichier (26 octobre 2026) : cinq, et l'editeur reste ouvert.
    expect(g.total()).toBe(5);
    expect(await page.locator('.editeur-cadre').count()).toBe(1);
  });

  it('« Terminer » ramene a la fiche, dont « Télécharger le SVG » est l action primaire et prend le focus ; le message est neutre', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    const g = compteur();
    await g.geste(() => ouvrirExemple(page));
    await g.geste(() => page.locator('.editeur-svg-toile path[data-id="f2"]').click());
    await g.geste(() => page.locator('.editeur-barre input[type=color][aria-label="Remplissage"]').fill(VERT));
    await g.geste(() => terminer(page));
    const message = page.locator('main.accueil > p.message');
    expect(await message.getAttribute('role')).toBe('status');
    expect(await message.getAttribute('class')).toBe('message neutre');
    expect(await texteDe(message)).toBe('Dessin prêt : téléchargez-le en SVG, ou choisissez un autre format.');
    const fiche = page.locator('.resultat');
    const primaire = fiche.locator('button.primaire');
    expect(await primaire.count()).toBe(1);
    expect(await texteDe(primaire)).toBe('Télécharger le SVG');
    expect(await fiche.getByRole('button', { name: 'Reprendre l’édition' }).getAttribute('class')).toBeNull();
    await fiche.locator('.menu-bouton', { hasText: 'Autres formats' }).waitFor();
    // Le focus est sur le telechargement : Entree suffit.
    expect(await aLeFocus(primaire)).toBe(true);
    let fichier = { nom: '', texte: '' };
    await g.geste(async () => { fichier = await telecharger(page, () => page.keyboard.press('Enter')); });
    expect(fichier.texte).toContain('fill="' + VERT + '"');
    expect(g.total()).toBe(5);
  });

  it('Ctrl+S garde le brouillon et l annonce, l editeur reste ouvert ; « Terminer » est dans la confirmation d abandon', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirExemple(page);
    await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+s');
    await attend(() => page.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim())).toBe('Brouillon gardé.');
    expect(await page.locator('.editeur-cadre').count()).toBe(1);
    // Le menu Fichier dit le raccourci de ce geste ; plus aucun « Enregistrer (Ctrl+S) » qui fermerait.
    await ouvrirMenu(page, 'Fichier');
    await page.getByRole('menuitem', { name: /Garder un brouillon/ }).waitFor();
    await page.keyboard.press('Escape');
    // Echap demande s'il faut abandonner : « Terminer » garde et ferme, a cote de « Continuer l'édition » (l'action sure, pleine).
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('Escape');
    const confirmation = page.getByRole('alertdialog', { name: 'Abandonner les modifications' });
    await confirmation.waitFor();
    expect(await confirmation.getByRole('button').allInnerTexts()).toEqual(['Abandonner', 'Terminer', 'Continuer l’édition']);
    await confirmation.getByRole('button', { name: 'Terminer' }).click();
    await page.locator('.resultat').waitFor();
    expect(await texteDe(page.locator('.resultat .fiche .aide'))).toMatch(/^3 formes/);
  });

  it('ouvre « Autres formats » du menu Fichier au clavier, parcourt les formats par Tab, et telecharge un PNG par Entree', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirExemple(page);
    const fichier = boutonFichier(page);
    await fichier.focus();
    expect(await fichier.getAttribute('aria-label')).toBe('Fichier');
    expect(await fichier.getAttribute('aria-haspopup')).toBe('menu');
    // Entree ouvre le menu sur son premier element ; les fleches vont jusqu'a « Télécharger le SVG ».
    await page.keyboard.press('Enter');
    const svg = page.locator('.menu-panneau').getByRole('menuitem', { name: 'Télécharger le SVG', exact: true });
    for (let i = 0; i < 4 && !(await aLeFocus(svg)); i++) await page.keyboard.press('ArrowDown');
    expect(await aLeFocus(svg)).toBe(true);
    // Tab, depuis un element, entre dans le contenu libre qui le suit : le titre replie « Autres formats ».
    await page.keyboard.press('Tab');
    const repli = page.locator('.menu-panneau details.autres-formats-repli > summary');
    expect(await aLeFocus(repli)).toBe(true);
    await page.keyboard.press('Enter');
    await page.locator('.menu-panneau .contenu-export').waitFor();
    // Tab va de format en format sans refermer le menu ; chaque bouton est decrit par son usage.
    const png = page.locator('.menu-panneau .contenu-export button', { hasText: /^PNG$/ });
    for (let i = 0; i < 6 && !(await aLeFocus(png)); i++) await page.keyboard.press('Tab');
    expect(await aLeFocus(png)).toBe(true);
    const description = await png.getAttribute('aria-describedby');
    expect(await page.locator('[id="' + (description ?? 'absent') + '"]').innerText()).toBe('une image pour un site ou un message, fond transparent');
    const f = await telecharger(page, () => page.keyboard.press('Enter'));
    expect(f.nom).toBe('exemple-1024.png');
    // Echap referme et rend le focus au bouton Fichier ; un Tab qui sort du menu le referme aussi.
    await page.keyboard.press('Escape');
    await attend(() => page.locator('.menu-panneau').count()).toBe(0);
    expect(await aLeFocus(fichier)).toBe(true);
  });

  it('au doigt a 390 px : « Plus » met « Télécharger le SVG » en tete, « Terminer » est dans la barre d etat, la fiche telecharge', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 390, hauteur: 800, tactile: true });
    await ouvrirExemple(page, true);
    await page.locator('.editeur-svg-toile path[data-id="f2"]').tap();
    await page.locator('.editeur-barre input[type=color][aria-label="Remplissage"]').fill(VERT);
    await page.getByRole('button', { name: /^Plus d’actions/ }).tap();
    const f = await telecharger(page, () => page.getByRole('menuitem', { name: 'Télécharger le SVG', exact: true }).tap());
    expect(f.texte).toContain(VERT);
    const fin = page.locator('.editeur-etat').getByRole('button', { name: 'Terminer' });
    const r = await fin.boundingBox();
    expect(r && r.height >= 40 - 0.01 && r.x + r.width <= 390).toBe(true);
    await fin.tap();
    await page.locator('.resultat').waitFor();
    const g = await page.locator('.resultat').getByRole('button', { name: 'Télécharger le SVG' }).boundingBox();
    expect(g && g.height >= 40 - 0.01 && g.x >= 0 && g.x + g.width <= 390).toBe(true);
    expect((await telecharger(page, () => page.locator('.resultat').getByRole('button', { name: 'Télécharger le SVG' }).tap())).texte).toContain(VERT);
  });
});

describe('la fin du parcours Cricut', () => {
  const navigateur = pilote();
  const panneau = (page: Page) => page.locator('.panneau-cricut');
  const selecteur = (page: Page) => page.locator('.selecteur-contexte .menu-bouton');

  async function choisirMaker(page: Page): Promise<void> {
    await selecteur(page).click();
    await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
    await panneau(page).locator('.constat, .pret').first().waitFor();
  }
  const boite = (l: Locator) => l.evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, d: r.right, b: r.bottom }; });

  it('demande une confirmation legere qui liste les points a corriger, puis exporte « quand même » et montre les etapes dans Design Space', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, OUVERT);
    await choisirMaker(page);
    const exporter = panneau(page).locator('.export-cricut button.primaire');
    await attend(() => texteDe(exporter)).toBe('Exporter quand même (2 points à corriger)');
    // Le premier clic ne telecharge rien : il demande, dans le panneau, sans fenetre qui piege.
    let telecharges = 0;
    page.on('download', () => { telecharges++; });
    await exporter.click();
    const confirmation = panneau(page).locator('.confirmation-export');
    await confirmation.waitFor();
    expect(await confirmation.getAttribute('role')).toBe('group');
    // Aucune fenetre de plus dans l'editeur (lui-meme est la fenetre modale de la page) : ni dialog, ni alertdialog.
    expect(await page.locator('.editeur-cadre [role="dialog"], .editeur-cadre [role="alertdialog"]').count()).toBe(0);
    expect(await texteDe(confirmation.locator('.titre-confirmation'))).toBe('Il reste 2 points à corriger :');
    const points = await confirmation.locator('li').allInnerTexts();
    expect(points).toHaveLength(2);
    expect(points.join(' ')).toContain('tracé ouvert');
    expect(points.join(' ')).toContain('la lame les déchirerait');
    // L'action sure, « Revoir », est la seule pleine et prend le focus ; la phrase est dite.
    const revoir = confirmation.getByRole('button', { name: 'Revoir' });
    await attend(() => aLeFocus(revoir)).toBe(true);
    expect(await confirmation.locator('button.primaire').allInnerTexts()).toEqual(['Revoir']);
    await attend(() => page.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim())).toMatch(/^Il reste 2 points à corriger : .* Exporter quand même, ou Revoir\.$/);
    expect(telecharges).toBe(0);
    // « Revoir » mene aux points a corriger.
    await revoir.click();
    await attend(() => aLeFocus(panneau(page).locator('.gravite-a-corriger .titre-gravite'))).toBe(true);
    expect(await confirmation.count()).toBe(0);
    // De nouveau, et cette fois « Exporter quand même ».
    await exporter.click();
    const f = await telecharger(page, () => confirmation.getByRole('button', { name: 'Exporter quand même' }).click());
    expect(f.nom).toBe('dessin-cricut.svg');
    // Le tapis fixe, par defaut (ADR-0039, revision du 26 octobre 2026) : le fichier a la taille du tapis, cadres de reperage compris.
    expect(/^<svg[^>]*>/.exec(f.texte)?.[0]).toContain('width="304.8mm" height="304.8mm"');
    const carte = panneau(page).locator('.carte-design-space');
    await carte.waitFor();
    expect(await texteDe(carte.getByRole('heading'))).toBe('Dans Design Space');
    const etapes = await carte.locator('li').allInnerTexts();
    expect(etapes.map(t => t.replace(/\s+/g, ' '))).toEqual([
      'Dans Design Space, « Nouveau projet », puis « Importer ».',
      'Choisissez le fichier dessin-cricut.svg, importez-le, puis ajoutez-le au projet.',
      'Vérifiez sa taille : 292,1 × 292,1 mm, cadre compris. Ne la changez pas. (à vérifier)',
      'Pour chaque couleur, sélectionnez le cadre de repérage de cette couleur et les formes de la même couleur, puis « Attacher ». (à vérifier)',
      'Passez chaque cadre en « Guide » (menu Opération) : il ne se découpe pas. (à vérifier)',
      'Sur l’aperçu du tapis, vérifiez la place : le dessin commence à 8,35 mm du bord gauche et 8,35 mm du bord haut du tapis ; sinon, faites-y glisser le dessin, puis posez la feuille à cet endroit. (à vérifier)',
      'Pour chaque couche, choisissez couper, dessiner ou rainer : le fichier ne le dit pas.'
    ]);
    expect(await texteDe(carte.locator('p.aide'))).toBe('Le tapis est fixe : l’export garde la place des formes. Pour que Design Space les pose dans le coin haut gauche du tapis, cochez « Recalage automatique » dans « Prêt pour Cricut », puis exportez à nouveau.');
    await carte.getByRole('button', { name: 'Fermer ces étapes' }).click();
    expect(await carte.count()).toBe(0);
  });

  it('un dessin pret s exporte d un clic, sans confirmation, et montre les etapes dans Design Space', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, PROPRE);
    await choisirMaker(page);
    await panneau(page).locator('.pret').waitFor();
    const f = await telecharger(page, () => panneau(page).getByRole('button', { name: 'Exporter pour Cricut' }).click());
    expect(f.nom).toBe('dessin-cricut.svg');
    expect(await panneau(page).locator('.confirmation-export').count()).toBe(0);
    await panneau(page).locator('.carte-design-space').waitFor();
  });

  it('cadre le tapis entier au choix de la machine et par « Ajuster » (0) ; « Ajuster au dessin » (D) garde l ancien cadrage', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, OUVERT);
    await choisirMaker(page);
    const toile = page.locator('.editeur-toile'), tapis = page.locator('.editeur-svg-toile .gabarit-tapis');
    const dedans = async () => { const t = await boite(toile), m = await boite(tapis); return m.x >= t.x - 0.5 && m.y >= t.y - 0.5 && m.d <= t.d + 0.5 && m.b <= t.b + 0.5; };
    await attend(dedans).toBe(true);
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('d');
    // Le dessin seul, cadre a 88 % : le tapis de 12 po deborde de la toile.
    await attend(dedans).toBe(false);
    await page.keyboard.press('0');
    await attend(dedans).toBe(true);
    // Le menu Vue nomme les deux gestes en contexte de decoupe.
    await ouvrirMenu(page, 'Vue');
    await page.getByRole('menuitem', { name: /Ajuster au tapis/ }).waitFor();
    await page.getByRole('menuitem', { name: /Ajuster au dessin/ }).click();
    await attend(dedans).toBe(false);
  });

  it('parle en millimetres par defaut et retient le pouce une fois choisi, d une ouverture a l autre', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, OUVERT);
    await choisirMaker(page);
    expect(await texteDe(panneau(page).locator('.resume-cricut dd').first())).toBe('101,6 × 50,8 mm');
    await selecteur(page).click();
    await page.getByRole('menuitemradio', { name: 'Pouces', exact: true }).click();
    await attend(() => texteDe(panneau(page).locator('.resume-cricut dd').first())).toBe('4 × 2 po');
    // Une autre ouverture, un autre dessin : la Cricut choisie y parle en pouces. Le choix de la machine a pose le plan du tapis (une
    // modification, ADR-0039) : fermer demande s'il faut l'abandonner.
    await ouvrirMenu(page, 'Fichier');
    await page.getByRole('menuitem', { name: /Fermer l’éditeur/ }).click();
    await page.getByRole('alertdialog', { name: 'Abandonner les modifications' }).getByRole('button', { name: 'Abandonner' }).click();
    await page.locator('.editeur-cadre').waitFor({ state: 'detached' });
    await ouvrirCode(page, OUVERT);
    await choisirMaker(page);
    expect(await texteDe(panneau(page).locator('.resume-cricut dd').first())).toBe('4 × 2 po');
    expect(await page.evaluate(() => localStorage.getItem('svg.unite'))).toBe('"in"');
  });

  it('nomme le fichier d une forme de la bibliotheque par son nom francais : bonhomme-de-neige.svg, bonhomme-de-neige-cricut.svg', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await page.getByRole('tab', { name: /Bibliothèque/ }).click();
    await page.locator('.bibliotheque input[type=search]').waitFor({ timeout: CHARGEMENT });
    await page.locator('.bibliotheque input[type=search]').fill('bonhomme de neige');
    const vignette = page.locator('.bibliotheque .vignette', { hasText: /^bonhomme de neige$/ });
    await vignette.waitFor({ timeout: CHARGEMENT });
    await vignette.click();
    await page.locator('.editeur-cadre').waitFor();
    expect(await texteDe(page.locator('.editeur-titre'))).toBe('bonhomme-de-neige.svg');
    expect((await telecharger(page, async () => { await telechargerParFichier(page); })).nom).toBe('bonhomme-de-neige.svg');
    await choisirMaker(page);
    // Le menu Fichier suit le contexte : l'export pour la machine suit « Télécharger le SVG » (et passe par la confirmation s'il reste un point).
    expect(await texteDe(await elementFichier(page, 'Exporter pour Cricut'))).toBe('Exporter pour Cricut');
    await page.keyboard.press('Escape');
    const exporter = panneau(page).locator('.export-cricut button.primaire');
    await attend(() => texteDe(exporter)).toMatch(/^Exporter (pour Cricut|quand même)/);
    const aCorriger = (await texteDe(exporter)).startsWith('Exporter quand même');
    const f = await telecharger(page, async () => {
      await telechargerParFichier(page, 'Exporter pour Cricut');
      if (aCorriger) await panneau(page).locator('.confirmation-export').getByRole('button', { name: 'Exporter quand même' }).click();
    });
    expect(f.nom).toBe('bonhomme-de-neige-cricut.svg');
  });

  it('au doigt a 390 px : la confirmation s ouvre dans le tiroir de l inspecteur, des cibles de 40 px, et la carte apres l export', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 390, hauteur: 800, tactile: true });
    await ouvrirCode(page, OUVERT, true);
    await page.getByRole('button', { name: /^Plus d’actions/ }).tap();
    const maker = page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' });
    await maker.scrollIntoViewIfNeeded();
    await maker.tap();
    // « Plus » met l'export pour la machine en tete de Fichier : il demande la confirmation et ouvre le tiroir pour la montrer.
    await page.getByRole('button', { name: /^Plus d’actions/ }).tap();
    await page.getByRole('menuitem', { name: 'Exporter pour Cricut' }).tap();
    const confirmation = panneau(page).locator('.confirmation-export');
    await confirmation.waitFor();
    await attend(() => page.locator('.voile').count()).toBe(1);
    await attend(() => aLeFocus(confirmation.getByRole('button', { name: 'Revoir' }))).toBe(true);
    const hauteurs = await confirmation.locator('button').evaluateAll(l => l.map(e => e.getBoundingClientRect().height));
    for (const h of hauteurs) expect(h).toBeGreaterThanOrEqual(40 - 0.01);
    const f = await telecharger(page, () => confirmation.getByRole('button', { name: 'Exporter quand même' }).tap());
    expect(f.nom).toBe('dessin-cricut.svg');
    await panneau(page).locator('.carte-design-space').waitFor();
    const fermer = await panneau(page).locator('.carte-design-space button').boundingBox();
    expect(fermer && fermer.height >= 40 - 0.01).toBe(true);
  });
});

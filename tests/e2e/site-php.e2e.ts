// Le site PHP (ADR-0030, ADR-0041), dans un vrai navigateur, contre `php -S` sur une copie de dist/php (tests/e2e/site.ts : la
// disposition livree, le routeur data/inc/serveur-local.php qui imite les .htaccess, une source simulee, le courrier en mode
// fichier) : l'administrateur cree a la premiere visite, connexion par adresse et mot de passe, ecran « Projets », creer, enregistrer,
// rouvrir a l'identique (un texte vivant, un projet Cricut a operations melees), renommer, dupliquer, supprimer, deconnexion, acces
// refuse sans session, police du catalogue servie par le site, axe sans violation sur la connexion et l'ecran Projets. La page ne
// contacte que le site. Les ecrans des comptes (profil, administration, reglages) sont dans site-comptes.e2e.ts.
//
//   npm run construire   (le test ouvre dist/php, il ne construit rien ; PHP 8.1 ou plus doit etre installe)

import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, ouvrirMenu, pilote, RACINE_DEPOT, texteDe, textesDe } from './aide.js';
import { champPolice, valeurPolice } from './polices.js';
import { ADMIN_EMAIL, ID_ESSAI, MOT, siteDesTests } from './site.js';

const s = siteDesTests();

const etat = (page: Page) => texteDe(page.locator('.editeur-etat .etat-enregistrement'));
const ligneProjet = (page: Page, nom: string) => page.locator('.liste-projets .projet', { has: page.getByRole('button', { name: nom, exact: true }) });

async function projets(page: Page): Promise<Array<{ id: string; nom: string; revision: number }>> {
  const r = await page.request.get(s.site + '/api.php?r=projets');
  return ((await r.json()) as { projets: Array<{ id: string; nom: string; revision: number }> }).projets;
}

async function idDe(page: Page, nom: string): Promise<string> {
  const p = (await projets(page)).find(x => x.nom === nom);
  if (!p) throw new Error('projet introuvable : ' + nom);
  return p.id;
}

const vignette = async (page: Page, id: string) => (await page.request.get(s.site + '/api.php?r=vignette&id=' + id)).text();
const projetJson = async (page: Page, id: string) => (await page.request.get(s.site + '/api.php?r=projet&id=' + id)).json() as Promise<{ dessin: unknown; production: unknown; nom: string }>;

async function fermerEditeur(page: Page): Promise<void> {
  await ouvrirMenu(page, 'Fichier');
  await page.getByRole('menuitem', { name: 'Fermer l’éditeur' }).click();
  await page.locator('.editeur-cadre').waitFor({ state: 'detached' });
}

async function enregistrerSous(page: Page, nom: string): Promise<void> {
  await ouvrirMenu(page, 'Fichier');
  await page.getByRole('menuitem', { name: 'Enregistrer sous…' }).click();
  const boite = page.getByRole('dialog', { name: 'Enregistrer sous…' });
  await boite.getByLabel('Nom du projet').fill(nom);
  await boite.getByRole('button', { name: 'Enregistrer' }).click();
  await attend(() => etat(page)).toBe('Enregistré');
  await attend(() => page.locator('.editeur-titre').innerText()).toBe(nom);
}

describe('le site PHP', () => {
  // Le site pose `Cross-Origin-Opener-Policy: same-origin` : sous Firefox, Playwright perd parfois le chargement qui change de
  // groupe de contextes (aide.ts, `coopIgnoreeParFirefox`).
  const navigateur = pilote({ coopIgnoreeParFirefox: true });

  it('sans compte, la page cree l administrateur et ouvre l application ; ensuite la route n existe plus, et data/ ne se lit pas', async () => {
    for (const f of s.comptes()) rmSync(s.donnees('comptes/' + f));
    const { page, requetes } = await s.ouvrirSite(navigateur, false);
    await page.getByRole('heading', { name: 'Créer le compte administrateur' }).waitFor();
    await s.sansViolationGrave(page, 'installation');
    await page.getByLabel('Adresse de courrier').fill(ADMIN_EMAIL);
    await page.getByLabel('Votre nom').fill('Admin');
    await page.getByLabel('Mot de passe', { exact: true }).fill(MOT);
    await page.getByLabel('Le même, de nouveau').fill(MOT + ' autre');
    await page.getByRole('button', { name: 'Créer le compte et entrer' }).click();
    await attend(() => texteDe(page.getByRole('alert'))).toBe('Les deux saisies du mot de passe diffèrent : rien n’est enregistré.');
    expect(s.comptes()).toEqual([]);
    await s.sansViolationGrave(page, 'installation en erreur');
    await page.getByLabel('Mot de passe', { exact: true }).fill(MOT);
    await page.getByLabel('Le même, de nouveau').fill(MOT);
    await page.getByRole('button', { name: 'Créer le compte et entrer' }).click();
    // La personne vient de creer son compte : l'application s'ouvre, sans connexion de plus.
    await page.getByRole('heading', { name: 'Mes projets' }).waitFor();
    expect(s.comptes()).toHaveLength(1);
    expect(await page.locator('.site-avertissement').count()).toBe(0);
    await s.seDeconnecter(page);
    expect(await page.getByRole('heading', { name: 'Créer le compte administrateur' }).count()).toBe(0);
    await s.connecter(page);
    // La route n'existe plus : un envoi direct est refuse, le compte reste.
    const html = await (await page.request.get(s.site + '/index.php?au-revoir')).text();
    expect(html).not.toContain('Créer le compte administrateur');
    const refus = await page.request.post(s.site + '/index.php', { form: { action: 'installer', csrf: /(?:name="csrf" value|data-csrf)="([a-f0-9]{64})"/.exec(html)?.[1] ?? '', email: 'pirate@exemple.org', nom: 'Pirate', mot_de_passe: 'le mot de passe pirate', confirmation: 'le mot de passe pirate', langue: 'fr' } });
    expect(refus.status()).toBe(403);
    expect(await refus.text()).toContain('Le site a déjà un administrateur');
    expect(s.comptes()).toHaveLength(1);
    // Ni le code, ni les reglages, ni les comptes ne se lisent par HTTP (le routeur, comme data/.htaccess, refuse data/).
    for (const f of ['data/config/config.json', 'data/comptes/' + s.comptes()[0], 'data/comptes/', 'data/.htaccess', 'data/sessions/', 'data/inc/amorce.php', 'data/inc/compte.php']) {
      const r = await page.request.get(s.site + '/' + f);
      expect([403, 404], f).toContain(r.status());
      expect(await r.text(), f).not.toMatch(/editeur-svg\/|\$argon2|\$2y\$|<\?php/);
    }
    expect(requetes.filter(u => !u.startsWith(s.site + '/'))).toEqual([]);
  });

  it('refuse l acces sans session ; la connexion dit une erreur claire ; connexion et Projets sans violation axe', async () => {
    const { page, requetes } = await s.ouvrirSite(navigateur);
    const refus = await page.request.get(s.site + '/api.php?r=projets');
    expect(refus.status()).toBe(401);
    expect(((await refus.json()) as { erreur: string }).erreur).toBe('session');
    await page.getByRole('heading', { name: 'Éditeur SVG' }).waitFor();
    await s.sansViolationGrave(page, 'connexion');
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#mot-de-passe').fill('pas le bon');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await attend(() => texteDe(page.getByRole('alert'))).toBe('Adresse ou mot de passe incorrect.');
    expect(await page.locator('#mot-de-passe').getAttribute('aria-describedby')).toBe('erreur-connexion');
    await s.sansViolationGrave(page, 'connexion en erreur');
    await s.connecter(page);
    await s.sansViolationGrave(page, 'projets (vide)');
    expect(requetes.filter(u => !u.startsWith(s.site + '/'))).toEqual([]);
  });

  it('le menu Aide de l editeur ouvre les documentations servies par le site (public/aide)', async () => {
    const { page } = await s.ouvrirSite(navigateur);
    await s.connecter(page);
    await page.getByRole('button', { name: 'Ouvrir l’exemple' }).click();
    await page.locator('.editeur-cadre').waitFor();
    await ouvrirMenu(page, 'Aide');
    expect(await textesDe(page.getByRole('menu', { name: 'Aide' }).getByRole('menuitem'))).toEqual(['Visite guidée', 'Raccourcis clavier', 'Guide de l’éditeur', 'La Cricut, c’est simple']);
    const [onglet] = await Promise.all([page.context().waitForEvent('page'), page.getByRole('menuitem', { name: 'La Cricut, c’est simple' }).click()]);
    await onglet.waitForLoadState('load');
    expect(onglet.url()).toBe(s.site + '/aide/cricut.html');
    expect(await onglet.title()).toBe('La Cricut, c’est simple');
    await onglet.close();
  });

  it('cree, enregistre (Ctrl+S), rouvre a l identique avec un texte vivant ; renomme, duplique, supprime ; se deconnecte', async () => {
    const { page, requetes } = await s.ouvrirSite(navigateur);
    await s.connecter(page);
    await page.getByRole('button', { name: 'Ouvrir l’exemple' }).click();
    await page.locator('.editeur-cadre').waitFor();
    await attend(() => etat(page)).toBe('Modifications non enregistrées');
    // Un texte vivant, dans une fonte livree servie par le site (data/font).
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('t');
    await champPolice(page.locator('.editeur-inspecteur')).waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Ajouter le texte' }).click();
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('Control+s');
    await attend(() => etat(page)).toBe('Enregistré');
    await attend(() => texteDe(page.locator('.message-etat'))).toBe('Projet « exemple » enregistré.');
    expect(await page.locator('.editeur-cadre').count()).toBe(1);
    const id = await idDe(page, 'exemple');
    const avant = await vignette(page, id);
    expect(avant).toContain('data-ed-texte=');
    // Une modification se voit, Ctrl+Z revient a l'etat enregistre.
    const quitterRetenu = () => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    expect(await quitterRetenu()).toBe(false);
    await page.keyboard.press('ArrowRight');
    await attend(() => etat(page)).toBe('Modifications non enregistrées');
    // Quitter la page avec des modifications : le navigateur demande confirmation. La garde se pose par un effet, apres
    // l'affichage de l'etat : on l'attend plutot que de la lire au meme instant (webkit peint avant de la poser).
    await attend(() => quitterRetenu()).toBe(true);
    await page.keyboard.press('Control+z');
    await attend(() => etat(page)).toBe('Enregistré');
    await attend(() => quitterRetenu()).toBe(false);
    await fermerEditeur(page);

    // Rouvert : le meme dessin, le texte toujours vivant ; « Enregistrer sous… » ecrit les memes octets.
    await ligneProjet(page, 'exemple').getByRole('button', { name: 'Ouvrir « exemple »' }).click();
    await page.locator('.editeur-cadre').waitFor();
    await attend(() => etat(page)).toBe('Enregistré');
    await enregistrerSous(page, 'Copie identique');
    expect(await vignette(page, await idDe(page, 'Copie identique'))).toBe(avant);
    const [a, b] = await Promise.all([projetJson(page, id), projetJson(page, await idDe(page, 'Copie identique'))]);
    expect(b.dessin).toEqual(a.dessin);
    await fermerEditeur(page);

    // Renommer, dans la ligne, au clavier comme a la souris.
    await ligneProjet(page, 'Copie identique').getByRole('button', { name: 'Renommer « Copie identique »' }).click();
    const champ = page.getByLabel('Nouveau nom de « Copie identique »');
    await champ.fill('Carte renommée');
    await champ.press('Enter');
    await ligneProjet(page, 'Carte renommée').waitFor();
    await s.sansViolationGrave(page, 'projets (liste)');
    // Dupliquer, puis supprimer la copie apres confirmation.
    await ligneProjet(page, 'Carte renommée').getByRole('button', { name: 'Dupliquer « Carte renommée »' }).click();
    await ligneProjet(page, 'Carte renommée (copie)').waitFor();
    await ligneProjet(page, 'Carte renommée (copie)').getByRole('button', { name: 'Supprimer « Carte renommée (copie) »' }).click();
    const confirmation = page.getByRole('group', { name: 'Supprimer « Carte renommée (copie) »' });
    await confirmation.getByRole('button', { name: 'Supprimer', exact: true }).click();
    await attend(() => ligneProjet(page, 'Carte renommée (copie)').count()).toBe(0);
    expect((await projets(page)).map(p => p.nom).sort()).toEqual(['Carte renommée', 'exemple']);
    expect(readdirSync(s.donnees('projets/' + s.idDuCompte(ADMIN_EMAIL) + '/corbeille')).some(f => f.endsWith('.meta.json'))).toBe(true);

    // Se deconnecter (le menu du compte) : retour a la connexion, l'API refuse.
    await s.seDeconnecter(page);
    expect((await page.request.get(s.site + '/api.php?r=projets')).status()).toBe(401);
    expect(requetes.filter(u => !u.startsWith(s.site + '/'))).toEqual([]);
  });

  it('un projet Cricut a operations melees se rouvre a l identique : contexte, operations, octets', async () => {
    const { page } = await s.ouvrirSite(navigateur);
    await s.connecter(page);
    const svg = readFileSync(resolve(RACINE_DEPOT, 'tests/fixtures/svg/cricut-operations.attendu.svg'), 'utf8');
    await page.locator('section[aria-label="Ouvrir un SVG ou un PDF"] textarea').fill(svg);
    await page.getByRole('button', { name: 'Ouvrir ce code' }).click();
    await page.locator('.editeur-cadre').waitFor();
    await attend(() => page.locator('.editeur-calques').innerText()).toMatch(/À couper[\s\S]*À écrire/);
    await page.locator('.editeur-barre .groupe.fin button.primaire').click();
    await attend(() => etat(page)).toBe('Enregistré');
    const id = await idDe(page, 'dessin');
    const avant = await projetJson(page, id);
    expect(avant.production).toMatchObject({ contexte: 'cricut' });
    expect(JSON.stringify(avant.dessin)).toContain('"operation":"');
    const vignetteAvant = await vignette(page, id);
    await fermerEditeur(page);

    await ligneProjet(page, 'dessin').getByRole('button', { name: 'Ouvrir « dessin »' }).click();
    await page.locator('.editeur-cadre').waitFor();
    await attend(() => texteDe(page.locator('.editeur-barre'))).toMatch(/Cricut/);
    await attend(() => page.locator('.editeur-calques').innerText()).toMatch(/À couper[\s\S]*À écrire/);
    await enregistrerSous(page, 'Cricut rouvert');
    const apres = await projetJson(page, await idDe(page, 'Cricut rouvert'));
    expect(apres.dessin).toEqual(avant.dessin);
    expect(apres.production).toEqual(avant.production);
    expect(await vignette(page, await idDe(page, 'Cricut rouvert'))).toBe(vignetteAvant);
    await fermerEditeur(page);
  });

  it('une police du catalogue est servie par le site, qui la telecharge et la verifie : le navigateur ne contacte que lui', async () => {
    const { page, requetes } = await s.ouvrirSite(navigateur);
    await s.connecter(page);
    await page.getByRole('button', { name: 'Nouveau projet' }).click();
    await page.locator('.editeur-cadre').waitFor();
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('t');
    const zone = page.locator('.editeur-inspecteur');
    await champPolice(zone).waitFor({ timeout: 30_000 });
    await page.locator('.editeur-inspecteur').getByRole('button', { name: 'Toutes les polices' }).click();
    const ligne = page.locator('.liste-polices .police-ligne', { hasText: 'Police Essai' });
    await ligne.waitFor();
    expect(s.demandesSource).toEqual([]);
    await ligne.click();
    await attend(() => valeurPolice(zone)).toBe(ID_ESSAI);
    expect(s.demandesSource).toEqual(['/npm/@fontsource/police-essai@1.0.0/files/police-essai-latin-400-normal.woff']);
    expect(readdirSync(s.donnees('font/catalogue')).length).toBe(1);
    expect(requetes.some(u => u.startsWith(s.site + '/api.php?r=police&sha='))).toBe(true);
    await page.getByRole('button', { name: 'Ajouter le texte' }).click();
    await page.locator('.editeur-barre .groupe.fin button.primaire').click();
    await attend(() => etat(page)).toBe('Enregistré');
    expect(await vignette(page, await idDe(page, 'Sans titre'))).toContain('data-ed-police="' + ID_ESSAI + '"');
    expect(requetes.filter(u => !u.startsWith(s.site + '/'))).toEqual([]);
    await fermerEditeur(page);
  });

  it('ouvrir depuis une adresse passe par le serveur du site : un SVG ouvre l editeur, une image le convertisseur, une adresse interne est refusee', async () => {
    const { page, requetes, erreurs } = await s.ouvrirSite(navigateur);
    await s.connecter(page);
    const avant = s.demandesSource.length;
    const champ = page.getByRole('textbox', { name: 'Ouvrir depuis une adresse' });
    expect(await texteDe(page.locator('.voie-panneau:not([hidden]) .adresse .aide').first())).toContain('Le site va chercher le fichier');
    await champ.fill('http://fichiers.essai:' + s.portSource + '/dessins/carte.svg?jeton=secret');
    await page.waitForTimeout(200);
    expect(s.demandesSource.length, 'rien ne part avant « Ouvrir »').toBe(avant);
    await page.locator('.voie-panneau:not([hidden]) .adresse').getByRole('button', { name: 'Ouvrir', exact: true }).click();
    await page.locator('.editeur-cadre').waitFor();
    expect(await page.locator('.editeur-svg-toile path[data-id]').count()).toBe(2);
    expect(s.demandesSource.slice(avant)).toEqual(['/dessins/carte.svg?jeton=secret']);
    // Un projet neuf, jamais enregistre : fermer demande confirmation, on abandonne.
    await ouvrirMenu(page, 'Fichier');
    await page.getByRole('menuitem', { name: 'Fermer l’éditeur' }).click();
    await page.getByRole('button', { name: 'Abandonner' }).click();
    await page.locator('.editeur-cadre').waitFor({ state: 'detached' });
    // Une adresse que le DNS mene a un reseau prive : refusee par le serveur, avant toute connexion, et c'est dit.
    await champ.fill('http://interne.essai:' + s.portSource + '/a.svg');
    await page.keyboard.press('Enter');
    await attend(() => texteDe(page.locator('main > .message'))).toBe('Cette adresse mène à un réseau privé, local ou réservé : le site ne la demande pas.');
    // Une « .svg » qui est une PNG : decidee sur ses octets, elle va au convertisseur.
    await champ.fill('http://fichiers.essai:' + s.portSource + '/photo.svg');
    await page.keyboard.press('Enter');
    await attend(() => page.locator('#voie-image').getAttribute('aria-selected')).toBe('true');
    await attend(() => texteDe(page.locator('.vectoriser .depot p'))).toBe('photo · 240 × 190 px');
    expect(s.demandesSource.slice(avant)).toEqual(['/dessins/carte.svg?jeton=secret', '/photo.svg']);
    expect(requetes.filter(u => !u.startsWith(s.site + '/'))).toEqual([]);
    expect(requetes.filter(u => u.startsWith(s.site + '/api.php?r=adresse')).length).toBe(3);
    const journal = readFileSync(s.donnees('journal/adresses.log'), 'utf8');
    expect(journal).toContain('hote=fichiers.essai');
    expect(journal).not.toContain('secret');
    // Le refus du serveur (403) s'ecrit dans la console du navigateur de lui-meme : ce n'est pas la page.
    const restent = erreurs.filter(e => !/Failed to load resource: the server responded with a status of 403/.test(e));
    erreurs.length = 0;
    erreurs.push(...restent);
  });
});

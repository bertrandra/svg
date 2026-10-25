// Le site PHP (ADR-0030), dans un vrai navigateur, contre `php -S` sur une copie de dist/php : connexion par mot de passe, ecran
// « Projets », creer, enregistrer, rouvrir a l'identique (un texte vivant, un projet Cricut a operations melees), renommer,
// dupliquer, supprimer, deconnexion, acces refuse sans session, police du catalogue servie par le site (sa source simulee par un
// petit serveur local, jamais le vrai reseau), axe sans violation sur la connexion et l'ecran Projets. La page ne contacte que le site.
//
//   npm run construire   (le test ouvre dist/php, il ne construit rien ; PHP 8.1 ou plus doit etre installe)

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createServer as serveurTcp } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, attendreAnimations, imageDeTest, ouvrirMenu, pilote, RACINE_DEPOT, texteDe } from './aide.js';
import { champPolice, valeurPolice } from './polices.js';
import { enWoff } from '../unit/io/woffFactice.js';
import { idVariante, type CataloguePolices, type FamilleCatalogue } from '../../src/model/cataloguePolices.js';

const MOT = 'un mot de passe assez long';
const DIST_PHP = resolve(RACINE_DEPOT, 'dist/php');
const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

// Une police du catalogue d'essai : Inter mise en WOFF, que la source simulee sert a l'adresse jsDelivr que l'index designe.
const WOFF = enWoff(new Uint8Array(readFileSync(resolve(RACINE_DEPOT, 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'))));
const SHA = createHash('sha256').update(WOFF).digest('base64');
const ESSAI: FamilleCatalogue = { id: 'police-essai', nom: 'Police Essai', depot: 'fontsource', source: 'google', categorie: 'lineale', licence: 'OFL-1.1', version: '1.0.0', ecritures: ['latin'], variantes: [[400, 0, SHA, null]] };
const INDEX: CataloguePolices = { format: 1, instantane: '2026-10-25', familles: [ESSAI], anciennes: [] };
const ID_ESSAI = idVariante(ESSAI, [400, 0, SHA, null]);

let racine = '', site = '', source: Server | null = null, php: ChildProcess | null = null, portSource = 0;
// Les fichiers qu'on ouvre depuis une adresse (ADR-0036) : le serveur du site les demande a la source simulee, sous un nom que sa
// resolution simulee (ADRESSE_RESOLUTION_ESSAI) mene a 127.0.0.1, seul reseau prive permis ici.
const DESSIN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><rect x="10" y="10" width="40" height="30" fill="#c81e28"/><circle cx="70" cy="50" r="20" fill="#1428a0"/></svg>';
const PHOTO = imageDeTest().buffer;
const demandesSource: string[] = [];

const portLibre = () => new Promise<number>((ok, ko) => {
  const s = serveurTcp().listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => (a && typeof a === 'object' ? ok(a.port) : ko(new Error('port')))); });
});

async function attendrePort(url: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try { await fetch(url + '/assets/site.css'); return; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('php -S ne repond pas sur ' + url);
}

beforeAll(async () => {
  if (!existsSync(join(DIST_PHP, 'public/index.php'))) throw new Error('dist/php manque : lancer `npm run construire` avant `npm run e2e`.');
  if (spawnSync('php', ['-v']).status !== 0) throw new Error('PHP est introuvable : le site se teste sous `php -S`.');
  racine = mkdtempSync(join(tmpdir(), 'site-php-e2e-'));
  cpSync(DIST_PHP, racine, { recursive: true });
  // La source des polices, simulee : elle sert le fichier d'essai et note chaque demande.
  portSource = await portLibre();
  source = createServer((req, res) => {
    demandesSource.push(req.url ?? '');
    if ((req.url ?? '').endsWith('/police-essai-latin-400-normal.woff')) { res.writeHead(200, { 'Content-Type': 'font/woff' }); res.end(Buffer.from(WOFF)); return; }
    // Aucun en-tete CORS : c'est le serveur du site qui lit, pas la page.
    if ((req.url ?? '').split('?')[0] === '/dessins/carte.svg') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(DESSIN); return; }
    if (req.url === '/photo.svg') { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(PHOTO); return; }
    res.writeHead(404); res.end();
  }).listen(portSource, '127.0.0.1');
  const s = 'http://127.0.0.1:' + portSource;
  writeFileSync(join(racine, 'public/config.local.php'), '<?php\ndefine(\'POLICES_SOURCES\', ' + JSON.stringify({ jsdelivr: s + '/npm/@fontsource/', bunny: s + '/bunny/', gitlab: s + '/gitlab/', fontshare: s + '/wf/' }).replace(/^\{/, '[').replace(/\}$/, ']').replace(/":/g, '" =>') + ');\n'
    + "define('ADRESSE_HTTP', true);\ndefine('ADRESSE_PORTS', [" + portSource + "]);\ndefine('ADRESSE_RESEAUX_PERMIS', ['127.0.0.1/32']);\n"
    + "define('ADRESSE_RESOLUTION_ESSAI', ['fichiers.essai' => [['127.0.0.1']], 'interne.essai' => [['10.0.0.8']]]);\n");
  writeFileSync(join(racine, 'data/json/polices-catalogue.json'), JSON.stringify(INDEX));
  const mot = spawnSync('php', [join(racine, 'outils/mot-de-passe.php'), '--stdin'], { input: MOT + '\n' });
  if (mot.status !== 0) throw new Error('mot-de-passe.php : ' + String(mot.stderr));
  const port = await portLibre();
  site = 'http://127.0.0.1:' + port;
  // Plusieurs travailleurs : sous Firefox, une connexion gardee ouverte par la page d'un test precedent occupait le seul
  // travailleur de `php -S`, et le chargement suivant attendait jusqu'a son delai (une fois sur deux en local, tous les tests).
  php = spawn('php', ['-S', '127.0.0.1:' + port, '-t', join(racine, 'public')], { stdio: 'ignore', env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' } });
  await attendrePort(site);
});

afterAll(() => {
  php?.kill();
  source?.close();
  if (racine) rmSync(racine, { recursive: true, force: true });
});

/** Audite la page par axe (injecte par evaluate : la politique de securite du site refuse un script en ligne, a raison). */
async function sansViolationGrave(page: Page, ecran: string): Promise<void> {
  await attendreAnimations(page);
  await page.evaluate(AXE);
  const r = await page.evaluate(async () => (window as unknown as { axe: { run: (d: Document) => Promise<{ violations: Array<{ id: string; impact: string; nodes: Array<{ target: unknown }> }> }> } }).axe.run(document));
  const graves = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  expect(graves.map(v => ecran + ' : ' + v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)))).toEqual([]);
}

/** Une session du navigateur qui note chaque requete : la page ne doit contacter que le site. */
async function ouvrirSite(navigateur: ReturnType<typeof pilote>): Promise<{ page: Page; requetes: string[]; erreurs: string[] }> {
  const s = await navigateur.ouvrir({ naviguer: false });
  const requetes: string[] = [];
  s.page.on('request', r => { if (!r.url().startsWith('data:') && !r.url().startsWith('blob:')) requetes.push(r.url()); });
  await s.page.goto(site + '/');
  return { page: s.page, requetes, erreurs: s.erreurs };
}

async function connecter(page: Page): Promise<void> {
  await page.locator('#mot-de-passe').fill(MOT);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('heading', { name: 'Mes projets' }).waitFor();
  await attend(() => page.locator('.projets [role="status"]').count()).toBe(0);
}

const etat = (page: Page) => texteDe(page.locator('.editeur-etat .etat-enregistrement'));
const ligneProjet = (page: Page, nom: string) => page.locator('.liste-projets .projet', { has: page.getByRole('button', { name: nom, exact: true }) });

async function projets(page: Page): Promise<Array<{ id: string; nom: string; revision: number }>> {
  const r = await page.request.get(site + '/api.php?r=projets');
  return ((await r.json()) as { projets: Array<{ id: string; nom: string; revision: number }> }).projets;
}

async function idDe(page: Page, nom: string): Promise<string> {
  const p = (await projets(page)).find(x => x.nom === nom);
  if (!p) throw new Error('projet introuvable : ' + nom);
  return p.id;
}

const vignette = async (page: Page, id: string) => (await page.request.get(site + '/api.php?r=vignette&id=' + id)).text();
const projetJson = async (page: Page, id: string) => (await page.request.get(site + '/api.php?r=projet&id=' + id)).json() as Promise<{ dessin: unknown; production: unknown; nom: string }>;

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
  const navigateur = pilote();

  it('refuse l acces sans session ; la connexion dit une erreur claire ; connexion et Projets sans violation axe', async () => {
    const { page, requetes } = await ouvrirSite(navigateur);
    const refus = await page.request.get(site + '/api.php?r=projets');
    expect(refus.status()).toBe(401);
    expect(((await refus.json()) as { erreur: string }).erreur).toBe('session');
    await page.getByRole('heading', { name: 'Éditeur SVG' }).waitFor();
    await sansViolationGrave(page, 'connexion');
    await page.locator('#mot-de-passe').fill('pas le bon');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await attend(() => texteDe(page.getByRole('alert'))).toBe('Mot de passe incorrect.');
    expect(await page.locator('#mot-de-passe').getAttribute('aria-describedby')).toBe('erreur-connexion');
    await sansViolationGrave(page, 'connexion en erreur');
    await connecter(page);
    await sansViolationGrave(page, 'projets (vide)');
    expect(requetes.filter(u => !u.startsWith(site + '/'))).toEqual([]);
  });

  it('cree, enregistre (Ctrl+S), rouvre a l identique avec un texte vivant ; renomme, duplique, supprime ; se deconnecte', async () => {
    const { page, requetes } = await ouvrirSite(navigateur);
    await connecter(page);
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
    await sansViolationGrave(page, 'projets (liste)');
    // Dupliquer, puis supprimer la copie apres confirmation.
    await ligneProjet(page, 'Carte renommée').getByRole('button', { name: 'Dupliquer « Carte renommée »' }).click();
    await ligneProjet(page, 'Carte renommée (copie)').waitFor();
    await ligneProjet(page, 'Carte renommée (copie)').getByRole('button', { name: 'Supprimer « Carte renommée (copie) »' }).click();
    const confirmation = page.getByRole('group', { name: 'Supprimer « Carte renommée (copie) »' });
    await confirmation.getByRole('button', { name: 'Supprimer', exact: true }).click();
    await attend(() => ligneProjet(page, 'Carte renommée (copie)').count()).toBe(0);
    expect((await projets(page)).map(p => p.nom).sort()).toEqual(['Carte renommée', 'exemple']);
    expect(readdirSync(join(racine, 'data/projets/corbeille')).some(f => f.endsWith('.meta.json'))).toBe(true);

    // Se deconnecter : retour a la connexion, l'API refuse.
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await attend(() => texteDe(page.locator('.message.neutre'))).toBe('Vous êtes déconnecté.');
    expect((await page.request.get(site + '/api.php?r=projets')).status()).toBe(401);
    expect(requetes.filter(u => !u.startsWith(site + '/'))).toEqual([]);
  });

  it('un projet Cricut a operations melees se rouvre a l identique : contexte, operations, octets', async () => {
    const { page } = await ouvrirSite(navigateur);
    await connecter(page);
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
    const { page, requetes } = await ouvrirSite(navigateur);
    await connecter(page);
    await page.getByRole('button', { name: 'Nouveau projet' }).click();
    await page.locator('.editeur-cadre').waitFor();
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('t');
    const zone = page.locator('.editeur-inspecteur');
    await champPolice(zone).waitFor({ timeout: 30_000 });
    await page.locator('.editeur-inspecteur').getByRole('button', { name: 'Toutes les polices' }).click();
    const ligne = page.locator('.liste-polices .police-ligne', { hasText: 'Police Essai' });
    await ligne.waitFor();
    expect(demandesSource).toEqual([]);
    await ligne.click();
    await attend(() => valeurPolice(zone)).toBe(ID_ESSAI);
    expect(demandesSource).toEqual(['/npm/@fontsource/police-essai@1.0.0/files/police-essai-latin-400-normal.woff']);
    expect(readdirSync(join(racine, 'data/font/catalogue')).length).toBe(1);
    expect(requetes.some(u => u.startsWith(site + '/api.php?r=police&sha='))).toBe(true);
    await page.getByRole('button', { name: 'Ajouter le texte' }).click();
    await page.locator('.editeur-barre .groupe.fin button.primaire').click();
    await attend(() => etat(page)).toBe('Enregistré');
    expect(await vignette(page, await idDe(page, 'Sans titre'))).toContain('data-ed-police="' + ID_ESSAI + '"');
    expect(requetes.filter(u => !u.startsWith(site + '/'))).toEqual([]);
    await fermerEditeur(page);
  });

  it('ouvrir depuis une adresse passe par le serveur du site : un SVG ouvre l editeur, une image le convertisseur, une adresse interne est refusee', async () => {
    const { page, requetes, erreurs } = await ouvrirSite(navigateur);
    await connecter(page);
    const avant = demandesSource.length;
    const champ = page.getByRole('textbox', { name: 'Ouvrir depuis une adresse' });
    expect(await texteDe(page.locator('.voie-panneau:not([hidden]) .adresse .aide').first())).toContain('Le site va chercher le fichier');
    await champ.fill('http://fichiers.essai:' + portSource + '/dessins/carte.svg?jeton=secret');
    await page.waitForTimeout(200);
    expect(demandesSource.length, 'rien ne part avant « Ouvrir »').toBe(avant);
    await page.locator('.voie-panneau:not([hidden]) .adresse').getByRole('button', { name: 'Ouvrir', exact: true }).click();
    await page.locator('.editeur-cadre').waitFor();
    expect(await page.locator('.editeur-svg-toile path[data-id]').count()).toBe(2);
    expect(demandesSource.slice(avant)).toEqual(['/dessins/carte.svg?jeton=secret']);
    // Un projet neuf, jamais enregistre : fermer demande confirmation, on abandonne.
    await ouvrirMenu(page, 'Fichier');
    await page.getByRole('menuitem', { name: 'Fermer l’éditeur' }).click();
    await page.getByRole('button', { name: 'Abandonner' }).click();
    await page.locator('.editeur-cadre').waitFor({ state: 'detached' });
    // Une adresse que le DNS mene a un reseau prive : refusee par le serveur, avant toute connexion, et c'est dit.
    await champ.fill('http://interne.essai:' + portSource + '/a.svg');
    await page.keyboard.press('Enter');
    await attend(() => texteDe(page.locator('main > .message'))).toBe('Cette adresse mène à un réseau privé, local ou réservé : le site ne la demande pas.');
    // Une « .svg » qui est une PNG : decidee sur ses octets, elle va au convertisseur.
    await champ.fill('http://fichiers.essai:' + portSource + '/photo.svg');
    await page.keyboard.press('Enter');
    await attend(() => page.locator('#voie-image').getAttribute('aria-selected')).toBe('true');
    await attend(() => texteDe(page.locator('.vectoriser .depot p'))).toBe('photo · 240 × 190 px');
    expect(demandesSource.slice(avant)).toEqual(['/dessins/carte.svg?jeton=secret', '/photo.svg']);
    expect(requetes.filter(u => !u.startsWith(site + '/'))).toEqual([]);
    expect(requetes.filter(u => u.startsWith(site + '/api.php?r=adresse')).length).toBe(3);
    const journal = readFileSync(join(racine, 'data/journal/adresses.log'), 'utf8');
    expect(journal).toContain('hote=fichiers.essai');
    expect(journal).not.toContain('secret');
    // Le refus du serveur (403) s'ecrit dans la console du navigateur de lui-meme : ce n'est pas la page.
    const restent = erreurs.filter(e => !/Failed to load resource: the server responded with a status of 403/.test(e));
    erreurs.length = 0;
    erreurs.push(...restent);
  });
});

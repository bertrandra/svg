// Le serveur du site PHP des tests de navigateur (site-php.e2e.ts, site-comptes.e2e.ts) : `php -S` sur une copie de dist/php (la
// disposition livree : le seul dossier public/, data/ dedans, sous le routeur data/inc/serveur-local.php qui imite les .htaccess),
// une source de polices et de fichiers simulee (jamais le vrai reseau), le courrier en mode fichier (chaque message dans
// data/journal/courrier, rien ne part), et les gestes communs : installer l'administrateur, ouvrir le site, se connecter, se
// deconnecter, lire les mails ecrits, auditer par axe. Rien ici ne construit : si dist/php manque, on le dit tout de suite.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createServer as serveurTcp } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';
import type { Page } from 'playwright';
import { attend, attendreAnimations, imageDeTest, pilote, RACINE_DEPOT, texteDe } from './aide.js';
import { enWoff } from '../unit/io/woffFactice.js';
import { idVariante, type CataloguePolices, type FamilleCatalogue } from '../../src/model/cataloguePolices.js';

export const MOT = 'un mot de passe assez long';
export const ADMIN_EMAIL = 'admin@exemple.org';
const DIST_PHP = resolve(RACINE_DEPOT, 'dist/php');
const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

// Une police du catalogue d'essai : Inter mise en WOFF, que la source simulee sert a l'adresse jsDelivr que l'index designe.
const WOFF = enWoff(new Uint8Array(readFileSync(resolve(RACINE_DEPOT, 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'))));
const SHA = createHash('sha256').update(WOFF).digest('base64');
const ESSAI: FamilleCatalogue = { id: 'police-essai', nom: 'Police Essai', depot: 'fontsource', source: 'google', categorie: 'lineale', licence: 'OFL-1.1', version: '1.0.0', ecritures: ['latin'], variantes: [[400, 0, SHA, null]] };
const INDEX: CataloguePolices = { format: 1, instantane: '2026-10-25', familles: [ESSAI], anciennes: [] };
/** L'identifiant de la variante de la police d'essai, tel que l'editeur l'ecrit. */
export const ID_ESSAI = idVariante(ESSAI, [400, 0, SHA, null]);

// Les fichiers qu'on ouvre depuis une adresse (ADR-0036) : le serveur du site les demande a la source simulee, sous un nom que sa
// resolution simulee (ADRESSE_RESOLUTION_ESSAI) mene a 127.0.0.1, seul reseau prive permis ici.
const DESSIN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><rect x="10" y="10" width="40" height="30" fill="#c81e28"/><circle cx="70" cy="50" r="20" fill="#1428a0"/></svg>';
const PHOTO = imageDeTest().buffer;

/** La configuration du site des tests : le courrier en mode fichier, les inscriptions ouvertes. */
export const CONFIG_ESSAI = { format: 'editeur-svg/config', version: 1, site: { nom: 'Éditeur SVG', langue: 'fr', adresse: '' }, inscriptions: { ouvertes: true }, courrier: { expediteur: 'no-reply@exemple.org', nom: 'Éditeur SVG', mode: 'fichier', smtp: { hote: '', port: 587, securite: 'starttls', utilisateur: '', motDePasse: '' } }, sessions: { inactivite: 7200 } };

/** Un mail ecrit en mode fichier (data/journal/courrier/*.eml), decode. */
export interface MailEcrit { fichier: string; entetes: Record<string, string>; corps: string; a: string; sujet: string }

const portLibre = () => new Promise<number>((ok, ko) => {
  const s = serveurTcp().listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => (a && typeof a === 'object' ? ok(a.port) : ko(new Error('port')))); });
});

async function attendrePort(url: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try { await fetch(url + '/assets/site.css'); return; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('php -S ne repond pas sur ' + url);
}

/** Un sujet de mail decode : `=?UTF-8?B?…?=` (entete_encode) ou le texte tel quel. */
const decoderSujet = (s: string): string => s.replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/gi, (_, b64: string) => Buffer.from(b64, 'base64').toString('utf8'));

/** Un corps en quoted-printable, decode (ce que PHP ecrit : des lignes pliees par `=`, des octets `=XX`). */
function decoderQuotedPrintable(texte: string): string {
  const sansPli = texte.replace(/=\r?\n/g, '');
  const octets: number[] = [];
  for (let i = 0; i < sansPli.length; i++) {
    const c = sansPli[i] ?? '';
    const hex = sansPli.slice(i + 1, i + 3);
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) { octets.push(parseInt(hex, 16)); i += 2; } else octets.push(c.charCodeAt(0));
  }
  return Buffer.from(octets).toString('utf8');
}

/** Le site des tests : son adresse, ses dossiers, et les gestes communs. Les champs se remplissent au `beforeAll`. */
export interface SiteDesTests {
  /** L'adresse du site (`http://127.0.0.1:<port>`). */
  readonly site: string;
  /** Le port de la source simulee (polices, fichiers a ouvrir depuis une adresse). */
  readonly portSource: number;
  /** Chaque chemin que la source simulee a recu. */
  readonly demandesSource: string[];
  /** Le dossier des donnees de la copie servie : sous la racine web, comme le build le livre. */
  donnees(chemin: string): string;
  /** Les fichiers de compte (data/comptes/<id>.json). */
  comptes(): string[];
  /** L'identifiant du compte qui porte cette adresse, ou ''. */
  idDuCompte(email: string): string;
  /** Cree l'administrateur en ligne de commande (data/inc/compte.php --admin --stdin), comme un script d'installation ; rien si un compte existe deja. */
  installer(): void;
  /** Oublie les essais comptes (connexions, demandes de mail) : un test ne doit pas attendre le delai qu'un autre a provoque. */
  oublierEssais(): void;
  /** Une session du navigateur qui note chaque requete : la page ne doit contacter que le site. Sans compte, l'administrateur est cree en ligne de commande. */
  ouvrirSite(navigateur: ReturnType<typeof pilote>, creerAdmin?: boolean): Promise<{ page: Page; requetes: string[]; erreurs: string[] }>;
  /** Se connecte sur la page de connexion et attend l'ecran « Mes projets » (sa liste chargee). */
  connecter(page: Page, email?: string, mot?: string): Promise<void>;
  /** La deconnexion : le menu du compte (icone en haut a droite), puis « Se deconnecter » (le formulaire index.php). */
  seDeconnecter(page: Page): Promise<void>;
  /** Audite la page par axe : aucune violation grave (serious, critical). */
  sansViolationGrave(page: Page, ecran: string): Promise<void>;
  /** Les mails ecrits en mode fichier, dans l'ordre d'ecriture. */
  mailsEcrits(): MailEcrit[];
  /** Le dernier mail ecrit pour cette adresse, ou null. */
  dernierMail(a: string): MailEcrit | null;
  /** Le jeton d'un lien (`?confirmer=` ou `?reinitialiser=`) dans le corps d'un mail, ou ''. */
  jetonDuMail(mail: MailEcrit | null, parametre: string): string;
}

/**
 * Lance le site PHP une fois par fichier de test (beforeAll / afterAll) et rend ses gestes. Le site pose
 * `Cross-Origin-Opener-Policy: same-origin` : la spec qui l'emploie lance son pilote avec `coopIgnoreeParFirefox`.
 */
export function siteDesTests(): SiteDesTests {
  let racine = '', site = '', source: Server | null = null, php: ChildProcess | null = null, portSource = 0;
  const demandesSource: string[] = [];
  const donnees = (chemin: string) => join(racine, 'public/data', chemin);
  const comptes = () => readdirSync(donnees('comptes')).filter(f => /^[a-f0-9]{16}\.json$/.test(f));

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
    writeFileSync(join(racine, 'public/data/config/config.local.php'), '<?php\ndefine(\'POLICES_SOURCES\', ' + JSON.stringify({ jsdelivr: s + '/npm/@fontsource/', bunny: s + '/bunny/', gitlab: s + '/gitlab/', fontshare: s + '/wf/' }).replace(/^\{/, '[').replace(/\}$/, ']').replace(/":/g, '" =>') + ');\n'
      + "define('ADRESSE_HTTP', true);\ndefine('ADRESSE_PORTS', [" + portSource + "]);\ndefine('ADRESSE_RESEAUX_PERMIS', ['127.0.0.1/32']);\n"
      + "define('ADRESSE_RESOLUTION_ESSAI', ['fichiers.essai' => [['127.0.0.1']], 'interne.essai' => [['10.0.0.8']]]);\n");
    writeFileSync(donnees('json/polices-catalogue.json'), JSON.stringify(INDEX));
    // Le courrier en mode fichier : rien ne part, chaque message s'ecrit dans data/journal/courrier.
    writeFileSync(donnees('config/config.json'), JSON.stringify(CONFIG_ESSAI));
    // Aucun compte : le premier test cree l'administrateur dans la page ; les autres le creent en ligne de commande s'il manque.
    const port = await portLibre();
    site = 'http://127.0.0.1:' + port;
    // Plusieurs travailleurs : pendant la page de l'application, le site se demande a lui-meme si data/ se lit (index.php,
    // http_lisible) ; sous un seul travailleur, `php -S` ne servirait cette requete qu'apres la page, qui attendrait les 3 s de son
    // delai et avertirait faute de reponse (mesure). Le routeur refuse data/ et inc/ comme le feraient les .htaccess, que `php -S`
    // ignore ; le site, qui se demande a lui-meme si data/ se lit, doit voir ce refus (sinon il avertit).
    php = spawn('php', ['-S', '127.0.0.1:' + port, '-t', join(racine, 'public'), join(racine, 'public/data/inc/serveur-local.php')], { stdio: 'ignore', env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' } });
    await attendrePort(site);
  });

  afterAll(() => {
    php?.kill();
    source?.close();
    if (racine) rmSync(racine, { recursive: true, force: true });
  });

  const installer = (): void => {
    if (comptes().length > 0) return;
    const r = spawnSync('php', [join(racine, 'public/data/inc/compte.php'), '--admin', '--stdin'], { input: ADMIN_EMAIL + '\nAdmin\n' + MOT + '\nfr\n', encoding: 'utf8' });
    if (r.status !== 0) throw new Error('compte.php --admin : ' + r.stdout + r.stderr);
  };

  const mailsEcrits = (): MailEcrit[] => {
    const d = donnees('journal/courrier');
    if (!existsSync(d)) return [];
    return readdirSync(d).filter(f => f.endsWith('.eml')).sort().map(fichier => {
      const texte = readFileSync(join(d, fichier), 'utf8');
      const fin = texte.indexOf('\r\n\r\n');
      const tete = fin >= 0 ? texte.slice(0, fin) : texte, corps = fin >= 0 ? texte.slice(fin + 4) : '';
      const entetes: Record<string, string> = {};
      for (const ligne of tete.split('\r\n')) {
        const i = ligne.indexOf(': ');
        if (i > 0) entetes[ligne.slice(0, i)] = ligne.slice(i + 2);
      }
      return { fichier, entetes, corps: decoderQuotedPrintable(corps), a: entetes['To'] ?? '', sujet: decoderSujet(entetes['Subject'] ?? '') };
    });
  };

  return {
    get site() { return site; },
    get portSource() { return portSource; },
    demandesSource,
    donnees,
    comptes,
    idDuCompte: email => comptes().find(f => (JSON.parse(readFileSync(donnees('comptes/' + f), 'utf8')) as { email: string }).email === email)?.replace('.json', '') ?? '',
    installer,
    oublierEssais: () => rmSync(donnees('essais.json'), { force: true }),
    async ouvrirSite(navigateur, creerAdmin = true) {
      if (creerAdmin) installer();
      const s = await navigateur.ouvrir({ naviguer: false });
      const requetes: string[] = [];
      s.page.on('request', r => { if (!r.url().startsWith('data:') && !r.url().startsWith('blob:')) requetes.push(r.url()); });
      // La politique d'ouverture est posee, meme si Firefox l'ignore ici (voir `coopIgnoreeParFirefox`).
      expect((await s.page.goto(site + '/'))?.headers()['cross-origin-opener-policy']).toBe('same-origin');
      return { page: s.page, requetes, erreurs: s.erreurs };
    },
    async connecter(page, email = ADMIN_EMAIL, mot = MOT) {
      await page.locator('#email').fill(email);
      await page.locator('#mot-de-passe').fill(mot);
      await page.locator('form.carte-connexion button.primaire').first().click();
      // L'ecran « Mes projets », par sa classe : son titre suit la langue du compte.
      await page.locator('main.site-projets h1').waitFor();
      await attend(() => page.locator('.projets [role="status"]').count()).toBe(0);
    },
    async seDeconnecter(page) {
      await page.getByRole('button', { name: /^Compte : / }).click();
      await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
      await attend(() => texteDe(page.locator('.message.neutre'))).toBe('Vous êtes déconnecté.');
    },
    async sansViolationGrave(page, ecran) {
      // Injecte par evaluate : la politique de securite du site refuse un script en ligne, a raison.
      await attendreAnimations(page);
      await page.evaluate(AXE);
      const r = await page.evaluate(async () => (window as unknown as { axe: { run: (d: Document) => Promise<{ violations: Array<{ id: string; impact: string; nodes: Array<{ target: unknown; failureSummary?: string }> }> }> } }).axe.run(document));
      const graves = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
      // Le resume de chaque noeud dit ce qu'axe a mesure (un contraste, un nom) : de quoi corriger sans rejouer.
      expect(graves.map(v => ecran + ' : ' + v.id + ' ' + JSON.stringify(v.nodes.map(n => [n.target, (n.failureSummary ?? '').replace(/\s+/g, ' ')])))).toEqual([]);
    },
    mailsEcrits,
    dernierMail: a => mailsEcrits().filter(m => m.a === a).pop() ?? null,
    jetonDuMail: (mail, parametre) => (mail ? new RegExp('index\\.php\\?' + parametre + '=([a-f0-9]{64})').exec(mail.corps)?.[1] ?? '' : '')
  };
}

// Aides communes aux tests de navigateur (tests/e2e). Ils pilotent la page AUTONOME construite par
// `npm run construire` (dist/editeur-svg.html), ouverte en file:// : c'est exactement ce qu'un
// utilisateur recoit, sans serveur. Rien ici ne construit : si dist/ manque, on le dit tout de suite.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { chromium, firefox, webkit, type Browser, type BrowserContext, type BrowserContextOptions, type BrowserType, type LaunchOptions, type Locator, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';

const RACINE = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const PAGE = resolve(RACINE, 'dist/editeur-svg.html');

/** L'adresse file:// de la page construite. */
export const URL_PAGE = pathToFileURL(PAGE).href;

/** Le bundle d'embarquement que `npm run construire` ecrit, et la page d'hote qui l'appelle (file://, sans serveur). */
export const BUNDLE_EMBARQUE = resolve(RACINE, 'dist/editeur-svg-embarque.js');
export const URL_INTEGRATION = pathToFileURL(resolve(RACINE, 'exemples/integration.html')).href;
/** La racine du depot : de quoi lire package.json depuis un test. */
export const RACINE_DEPOT = RACINE;

/** Les trois moteurs que la CI exerce (docs/navigateurs.md). */
export type NomNavigateur = 'chromium' | 'firefox' | 'webkit';

const MOTEURS: Readonly<Record<NomNavigateur, BrowserType>> = { chromium, firefox, webkit };

/**
 * Le moteur demande par `NAVIGATEUR` (defaut : chromium). Un nom inconnu echoue tout de suite : une faute de
 * frappe qui retomberait sur Chromium ferait croire que Firefox est vert sans l'avoir lance.
 */
export function nomNavigateur(brut: string | undefined = process.env['NAVIGATEUR']): NomNavigateur {
  const nom = (brut ?? '').trim().toLowerCase();
  if (nom === '') return 'chromium';
  if (nom === 'chromium' || nom === 'firefox' || nom === 'webkit') return nom;
  throw new Error('NAVIGATEUR=' + brut + ' : attendu chromium, firefox ou webkit.');
}

/** Le moteur de cette passe de tests. */
export const NAVIGATEUR: NomNavigateur = nomNavigateur();

/**
 * Pour `it.skipIf(sauteSauf([...], raison))` : vrai quand le moteur courant n'est pas de ceux qui savent faire
 * ce que le test demande. La raison est obligatoire et se lit dans docs/navigateurs.md (un test de depot confronte
 * les deux) : un saut ne se fait jamais en silence.
 */
export function sauteSauf(moteurs: readonly NomNavigateur[], raison: string): boolean {
  if (raison.trim() === '') throw new Error('un saut de test sans raison n’est pas admis');
  return !moteurs.includes(NAVIGATEUR);
}

/** Les options de lancement : `--no-sandbox` et `CHROMIUM_PATH` sont a Chromium seul, Firefox et WebKit refuseraient l'argument. */
function optionsLancement(nom: NomNavigateur): LaunchOptions {
  if (nom !== 'chromium') return {};
  const chemin = process.env['CHROMIUM_PATH'];
  return { ...(chemin ? { executablePath: chemin } : {}), args: ['--no-sandbox'] };
}

/** Une session de test : un contexte, une page, et ce que la page a mal dit. */
export interface Session {
  page: Page;
  contexte: BrowserContext;
  /** pageerror et console.error recueillis ; `pilote` echoue le test s'il en reste. */
  erreurs: string[];
}

export interface OptionsSession {
  largeur?: number;
  hauteur?: number;
  /** Un doigt plutot qu'une souris : pointeur grossier, evenements tactiles. */
  tactile?: boolean;
  mouvementReduit?: boolean;
  schema?: 'light' | 'dark';
  /** Ouvrir la page elle-meme (defaut : oui). */
  naviguer?: boolean;
  /** JavaScript coupe : ce que voit un navigateur qui n'execute rien. */
  sansJavaScript?: boolean;
}

/**
 * Lance le navigateur (`NAVIGATEUR` : chromium, firefox ou webkit) une fois par fichier de test et rend `ouvrir`. Les crochets sont poses ici pour que
 * chaque spec n'ait rien a se rappeler : fermeture des contextes, et echec si la page a ecrit une
 * erreur (pageerror ou console.error) pendant le test.
 *
 * Le navigateur : pour Chromium, `CHROMIUM_PATH` s'il est donne (le bac a sable n'a pas celui de Playwright),
 * sinon celui que `npx playwright install chromium` a pose ; Firefox et WebKit, ceux de `npx playwright install`.
 */
export function pilote() {
  let navigateur: Browser | undefined;
  const ouvertes: Session[] = [];

  beforeAll(async () => {
    if (!existsSync(PAGE)) throw new Error('dist/editeur-svg.html manque : lancer `npm run construire` avant `npm run e2e`.');
    navigateur = await MOTEURS[NAVIGATEUR].launch(optionsLancement(NAVIGATEUR));
  });

  afterAll(async () => {
    await navigateur?.close();
  });

  afterEach(async ({ task }) => {
    const erreurs = ouvertes.flatMap(s => s.erreurs);
    // Un test en echec laisse de quoi le comprendre sans le rejouer : une capture de chaque page encore ouverte et
    // ce que les pages ont ecrit. La CI les rend en artefact (`test-results/`) ; ailleurs, c'est sans cout.
    // (Pas pour un `it.fails` : son echec est attendu, une capture n'apprendrait rien et brouillerait l'artefact.)
    if (!task.fails && (task.result?.state === 'fail' || erreurs.length)) await laisserTraces(task.name, ouvertes);
    await Promise.all(ouvertes.map(s => s.contexte.close()));
    ouvertes.length = 0;
    // Le message dit ce que la page a ecrit : c'est tout le diagnostic dont on dispose apres coup.
    expect(erreurs, 'la page ne doit ecrire aucune erreur').toEqual([]);
  });

  return {
    async ouvrir(options: OptionsSession = {}): Promise<Session> {
      if (!navigateur) throw new Error('le navigateur n’est pas lancé');
      const contexteOptions: BrowserContextOptions = {
        viewport: { width: options.largeur ?? 1400, height: options.hauteur ?? 900 },
        acceptDownloads: true
      };
      // `isMobile` n'existe pas dans Firefox (Playwright le refuse) : un doigt s'y limite a `hasTouch`, sans meta viewport. Firefox
      // annonce pourtant `(pointer: coarse)` des que le tactile est emule (lu en CI : Firefox 142, contexte a `hasTouch` seul).
      if (options.tactile) { contexteOptions.hasTouch = true; if (NAVIGATEUR !== 'firefox') contexteOptions.isMobile = true; contexteOptions.deviceScaleFactor = 2; }
      if (options.mouvementReduit) contexteOptions.reducedMotion = 'reduce';
      if (options.schema) contexteOptions.colorScheme = options.schema;
      if (options.sansJavaScript) contexteOptions.javaScriptEnabled = false;
      const contexte = await navigateur.newContext(contexteOptions);
      contexte.setDefaultTimeout(DELAI);
      const page = await contexte.newPage();
      const erreurs: string[] = [];
      page.on('pageerror', e => erreurs.push('pageerror : ' + String(e)));
      page.on('console', m => { if (m.type() === 'error') erreurs.push('console.error : ' + m.text()); });
      const session = { page, contexte, erreurs };
      ouvertes.push(session);
      if (options.naviguer !== false) await page.goto(URL_PAGE);
      return session;
    }
  };
}

/** Le dossier des traces d'un test en echec (ignore par git). */
const DOSSIER_TRACES = resolve(RACINE, 'test-results/e2e');

/** Ecrit une capture par page et un fichier texte des erreurs, sous un nom tire du test. Ne fait jamais echouer un test de plus. */
async function laisserTraces(nomTest: string, sessions: readonly Session[]): Promise<void> {
  try {
    mkdirSync(DOSSIER_TRACES, { recursive: true });
    const base = nomTest.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'test';
    await Promise.all(sessions.map(async (s, i) => {
      await s.page.screenshot({ path: resolve(DOSSIER_TRACES, `${base}-${i}.png`) }).catch(() => undefined);
      writeFileSync(resolve(DOSSIER_TRACES, `${base}-${i}.txt`), `${s.page.url()}\n\n${s.erreurs.join('\n') || '(aucune erreur de page)'}\n`);
    }));
  } catch {
    // Les traces sont un confort : leur echec ne doit pas masquer l'echec du test.
  }
}

/** Delai d'attente d'une condition de l'interface : large pour un runner lent, sans effet quand tout va bien. */
const DELAI = 10_000;

/**
 * Une assertion qui reessaie jusqu'a ce que la page ait fini de bouger : `await attend(() => l.count()).toBe(3)`.
 * Playwright a ses propres `expect`, mais ils sont dans @playwright/test, un second paquet ; vitest
 * a `expect.poll`, qui fait la meme chose sans rien ajouter. Jamais de pause fixe : on attend l'etat.
 */
export function attend<T>(lire: () => Promise<T>, delai = DELAI) {
  return expect.poll(lire, { timeout: delai, interval: 40 });
}

/**
 * Laisse finir les animations d'ouverture (une section qui se deplie, un menu qui fond) avant une mesure : un texte a demi
 * transparent n'a pas son contraste. Bornee a deux secondes et sans les animations infinies : sous Firefox et WebKit, attendre
 * la fin de toutes les animations sans borne a bloque deux tests jusqu'a leur delai de 60 s (CI). Cause probable : le corps
 * d'une section repliee reste dans le DOM avec son animation d'entree, que Chromium fait avancer et que ces moteurs, qui ne
 * le rendent pas, laissent en suspens.
 */
export async function attendreAnimations(page: Page): Promise<void> {
  // Une animation peut repartir apres l'attente (un panneau recalcule 200 ms apres un geste remonte sa section) :
  // on sonde jusqu'a trois fois de suite sans animation en cours, dans la limite de 3 s pour les moteurs qui
  // laissent en suspens l'animation d'un element non rendu.
  await page.evaluate(async () => {
    const enCours = () => document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity);
    const limite = performance.now() + 3000;
    let calmes = 0;
    while (calmes < 3 && performance.now() < limite) {
      const actives = enCours();
      if (actives.length) { calmes = 0; await Promise.race([Promise.all(actives.map(a => a.finished.catch(() => undefined))), new Promise(fini => setTimeout(fini, 500))]); }
      else { calmes++; await new Promise(fini => setTimeout(fini, 120)); }
    }
  });
}

/** Vrai quand l'element a le focus clavier. */
export function aLeFocus(l: Locator): Promise<boolean> {
  return l.evaluate(e => e === document.activeElement);
}

/** Le texte visible d'un element, espaces ramenes a un seul. */
export async function texteDe(l: Locator): Promise<string> {
  return (await l.innerText()).replace(/\s+/g, ' ').trim();
}

/** Ouvre le dessin d'exemple de la page d'accueil et attend l'editeur. */
export async function ouvrirExemple(page: Page, tactile = false): Promise<void> {
  const bouton = page.getByRole('button', { name: 'Ouvrir l’exemple' });
  if (tactile) await bouton.tap(); else await bouton.click();
  await page.locator('.editeur-cadre').waitFor();
}

/**
 * Ouvre un dessin fabrique en memoire par la voie « coller le code » de la page d'accueil : pas de
 * fichier a ranger, et le dessin d'un test se lit dans le test. Attend l'editeur.
 */
export async function ouvrirCode(page: Page, svg: string, tactile = false): Promise<void> {
  await page.locator('section[aria-label="Ouvrir un SVG"] textarea').fill(svg);
  const bouton = page.getByRole('button', { name: 'Ouvrir ce code' });
  if (tactile) await bouton.tap(); else await bouton.click();
  await page.locator('.editeur-cadre').waitFor();
}

/** Le nombre de modifications que la barre d'etat annonce (la taille de la pile d'annulation). */
export async function modifications(page: Page): Promise<number> {
  return Number(/(\d+) modification/.exec(await texteDe(page.locator('.editeur-etat')))?.[1] ?? NaN);
}

/**
 * Deplie la section « Par couleur » des calques : elle est repliee d'office sur un petit dessin (moins de 5 formes ou de 3
 * couleurs, comme l'exemple), ouverte sur un grand. Sans effet si elle est deja ouverte.
 */
export async function ouvrirParCouleur(page: Page): Promise<void> {
  const section = page.locator('.editeur-calques details.section', { hasText: 'Par couleur' });
  if (!(await section.evaluate(e => (e as HTMLDetailsElement).open))) await section.locator('> summary').click();
  await attend(() => section.evaluate(e => (e as HTMLDetailsElement).open)).toBe(true);
}

/** Le nombre de formes dessinees sur la toile (les chemins portent leur id). */
export function formesVisibles(page: Page): Promise<number> {
  return page.locator('.editeur-svg-toile path[data-id]').count();
}

/** Le nombre de formes de la liste des calques (la liste « Formes », pas les lignes « Par couleur »). */
export function nombreDeCalques(page: Page): Promise<number> {
  return page.locator('.editeur-calques ol > li').count();
}

/**
 * Ouvre un menu de la barre (Fichier, Edition, Vue) par son nom visible. Sur un telephone (640 px et moins), ces trois
 * menus ne sont plus que des rubriques du menu « Plus » : c'est lui qu'on ouvre, et le menu demande (`role=menu` du meme nom) y est.
 */
export async function ouvrirMenu(page: Page, nom: string) {
  // L'editeur ouvert, on ne cherche que dans l'editeur : la fiche du dessin, dessous, a aussi son menu « Autres formats ».
  const racine = (await page.locator('.editeur-svg .editeur-cadre').count()) ? page.locator('.editeur-svg') : page;
  // « Autres formats » est, dans la barre de l'editeur, le chevron accole a « Télécharger le SVG » (nomme par aria-label).
  const direct = nom === 'Autres formats' && racine !== page
    ? racine.locator('.editeur-barre .autres-formats .menu-bouton')
    : racine.locator('.menu-bouton', { hasText: nom });
  const bouton = (await direct.count()) ? direct : racine.locator('.editeur-barre .menu-bouton[aria-label^="Plus d’actions"]');
  await bouton.click();
  // Sur un telephone, les autres formats sont repliees en fin de la rubrique Fichier de « Plus » : on les deplie.
  if (nom === 'Autres formats' && !(await direct.count())) {
    const repli = page.locator('.menu-panneau details.autres-formats-repli');
    if (!(await repli.evaluate(d => (d as HTMLDetailsElement).open))) await repli.locator('> summary').click();
  }
  return bouton;
}

/** Le bouton « Télécharger le SVG » de la barre de l'editeur (au bureau) : le geste unique pour recuperer le dessin. */
export function boutonTelecharger(page: Page): Locator {
  return page.locator('.editeur-barre .recuperer-principal');
}

/** « Terminer » : le geste de fin de la page, qui ramene a la fiche du dessin. Attend la fiche. */
export async function terminer(page: Page): Promise<void> {
  await page.locator('.editeur-barre .groupe.fin button.primaire, .editeur-etat button.primaire').first().click();
  await page.locator('.editeur-cadre').waitFor({ state: 'detached' });
  await page.locator('.resultat').waitFor();
}

// ---------------------------------------------------------------------------------------------
// Une image de test fabriquee en memoire : pas de fichier a ranger, pas de capture a refaire.
// ---------------------------------------------------------------------------------------------

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (const o of octets) c = (TABLE_CRC[(c ^ o) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloc(type: string, donnees: Uint8Array): Buffer {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length, 0);
  const corps = Buffer.concat([Buffer.from(type, 'latin1'), donnees]);
  const pied = Buffer.alloc(4);
  pied.writeUInt32BE(crc32(corps), 0);
  return Buffer.concat([longueur, corps, pied]);
}

/** Une couleur [r, v, b] pour un pixel, ou null pour laisser le fond. */
type Peintre = (x: number, y: number) => readonly [number, number, number] | null;

/** Encode un PNG RVB (sans alpha) de `largeur` x `hauteur`, fond blanc, peint par `peindre`. */
export function encoderPng(largeur: number, hauteur: number, peindre: Peintre): Buffer {
  const ligne = 1 + largeur * 3;
  const brut = Buffer.alloc(ligne * hauteur, 255);
  for (let y = 0; y < hauteur; y++) {
    brut[y * ligne] = 0; // filtre « aucun »
    for (let x = 0; x < largeur; x++) {
      const c = peindre(x, y);
      if (!c) continue;
      const i = y * ligne + 1 + x * 3;
      brut[i] = c[0]; brut[i + 1] = c[1]; brut[i + 2] = c[2];
    }
  }
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete[8] = 8; // profondeur
  entete[9] = 2; // RVB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', entete),
    bloc('IDAT', deflateSync(brut)),
    bloc('IEND', new Uint8Array(0))
  ]);
}

/**
 * Le motif des tests de vectorisation : un disque rouge, un rectangle bleu perce d'un disque blanc
 * (le blanc du trou n'est pas relie au bord), et cinq poussieres sombres sur fond blanc. Les
 * poussieres donnent au curseur « Poussieres » quelque chose a retirer.
 */
export function imageDeTest(): { name: string; mimeType: string; buffer: Buffer } {
  const poussieres: Array<readonly [number, number]> = [[12, 14], [220, 20], [30, 160], [210, 170], [120, 8]];
  const png = encoderPng(240, 190, (x, y) => {
    if (poussieres.some(([px, py]) => x >= px && x < px + 3 && y >= py && y < py + 3)) return [0x44, 0x44, 0x44];
    if ((x - 180) ** 2 + (y - 90) ** 2 < 18 ** 2) return null;
    if (x >= 140 && x < 220 && y >= 40 && y < 140) return [0x14, 0x28, 0xa0];
    if ((x - 75) ** 2 + (y - 95) ** 2 < 55 ** 2) return [0xc8, 0x1e, 0x28];
    return null;
  });
  return { name: 'essai.png', mimeType: 'image/png', buffer: png };
}

/**
 * Choisit une vue de la visionneuse de la voie « Convertir une image » : Comparer et Contours sont des boutons a etat, les autres
 * vues, le zoom et le fond du plan des elements du menu « Plus de vues » (ADR-0006 : le rare dans un menu). Attend que le choix soit pris.
 */
export async function choisirVue(page: Page, nom: string): Promise<void> {
  const bouton = page.locator('.barre-visionneuse .mini-onglets').getByRole('button', { name: nom, exact: true });
  if (await bouton.count()) { await bouton.click(); await attend(() => bouton.getAttribute('aria-pressed')).toBe('true'); return; }
  await page.locator('.barre-visionneuse .vue-plus .menu-bouton').click();
  const element = page.getByRole('menuitemradio', { name: nom, exact: true });
  await element.click();
  await attend(() => element.count()).toBe(0);
}

/**
 * Choisit un evenement parmi les pastilles de la bibliotheque de `zone` (« Tous » compris) ; deplie « Plus d'evenements » s'il
 * le faut, puisque les pastilles repliees ne montrent que les evenements proches de la date. Attend que la pastille soit choisie.
 */
export async function choisirEvenement(zone: Locator, nom: string): Promise<void> {
  const groupe = zone.getByRole('group', { name: 'Événement' });
  const pastille = groupe.getByRole('button', { name: nom, exact: true }).first();
  if (!(await pastille.count())) await groupe.getByRole('button', { name: /^Plus d’événements/ }).click();
  await pastille.click();
  await attend(() => pastille.getAttribute('aria-pressed')).toBe('true');
}

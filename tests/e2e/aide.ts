// Aides communes aux tests de navigateur (tests/e2e). Ils pilotent la page AUTONOME construite par
// `npm run construire` (dist/editeur-svg.html), ouverte en file:// : c'est exactement ce qu'un
// utilisateur recoit, sans serveur. Rien ici ne construit : si dist/ manque, on le dit tout de suite.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Locator, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';

const RACINE = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const PAGE = resolve(RACINE, 'dist/editeur-svg.html');

/** L'adresse file:// de la page construite. */
export const URL_PAGE = pathToFileURL(PAGE).href;

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
}

/**
 * Lance Chromium une fois par fichier de test et rend `ouvrir`. Les crochets sont poses ici pour que
 * chaque spec n'ait rien a se rappeler : fermeture des contextes, et echec si la page a ecrit une
 * erreur (pageerror ou console.error) pendant le test.
 *
 * Le navigateur : `CHROMIUM_PATH` s'il est donne (le bac a sable n'a pas celui de Playwright), sinon
 * celui que `npx playwright install chromium` a pose.
 */
export function pilote() {
  let navigateur: Browser | undefined;
  const ouvertes: Session[] = [];

  beforeAll(async () => {
    if (!existsSync(PAGE)) throw new Error('dist/editeur-svg.html manque : lancer `npm run construire` avant `npm run e2e`.');
    const chemin = process.env['CHROMIUM_PATH'];
    navigateur = await chromium.launch({
      ...(chemin ? { executablePath: chemin } : {}),
      args: ['--no-sandbox']
    });
  });

  afterAll(async () => {
    await navigateur?.close();
  });

  afterEach(async () => {
    const erreurs = ouvertes.flatMap(s => s.erreurs);
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
      if (options.tactile) { contexteOptions.hasTouch = true; contexteOptions.isMobile = true; contexteOptions.deviceScaleFactor = 2; }
      if (options.mouvementReduit) contexteOptions.reducedMotion = 'reduce';
      if (options.schema) contexteOptions.colorScheme = options.schema;
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

/** Le nombre de formes dessinees sur la toile (les chemins portent leur id). */
export function formesVisibles(page: Page): Promise<number> {
  return page.locator('.editeur-svg-toile path[data-id]').count();
}

/** Le nombre de formes de la liste des calques (la liste « Formes », pas les lignes « Par couleur »). */
export function nombreDeCalques(page: Page): Promise<number> {
  return page.locator('.editeur-calques ol > li').count();
}

/** Ouvre un menu de la barre (Fichier, Edition, Vue) par son nom visible. */
export async function ouvrirMenu(page: Page, nom: string) {
  const bouton = page.locator('.menu-bouton', { hasText: nom });
  await bouton.click();
  return bouton;
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

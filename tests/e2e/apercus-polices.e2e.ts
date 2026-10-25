// Les apercus des polices (ADR-0026), par la vraie page et les vraies annexes de dist/ : dans « Toutes les polices », le nom
// d'une fonte livree se dessine dans sa fonte, celui d'une famille du catalogue par l'apercu prepare (polices-apercus.js), et
// tout le reseau est coupe : aucune requete vers jsDelivr, Bunny, GitLab ou Fontshare, ni vers aucun hote. Sans l'annexe, la
// liste ecrit les noms dans la police de l'interface et le dit ; une police telechargee dans la session se dessine dans sa
// fonte ; au telephone, la liste ne deborde pas et ses lignes gardent 40 px. Une ligne par nom de famille : Bebas Neue livree,
// sauf quand on filtre une source.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, ouvrirCode, pilote, RACINE_DEPOT, URL_PAGE, type Session } from './aide.js';
import { enWoff } from '../unit/io/woffFactice.js';
import type { CataloguePolices, FamilleCatalogue } from '../../src/model/cataloguePolices.js';

const PLAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect x="0" y="0" width="40" height="40" fill="#1f4e8c"/></svg>';
const LOCAL = /^(?:file|data|blob|about):/i;

interface Reseau { requetes: string[]; avortees: string[] }

/** Coupe tout ce qui n'est pas local et consigne chaque tentative (vue par le navigateur, ou avortee par le routage). */
async function couperReseau(s: Session): Promise<Reseau> {
  const r: Reseau = { requetes: [], avortees: [] };
  await s.contexte.route(url => !LOCAL.test(url.protocol), route => { r.avortees.push(route.request().url()); return route.abort(); });
  s.page.on('request', req => { if (!LOCAL.test(req.url())) r.requetes.push(req.url()); });
  return r;
}
const aucuneRequete = (r: Reseau) => expect({ requetes: r.requetes, avortees: r.avortees }).toEqual({ requetes: [], avortees: [] });

const ligne = (page: Page, nom: RegExp | string) => page.locator('.liste-polices .police-ligne', { hasText: nom });
const recherche = (page: Page) => page.locator('.explorateur-polices input[type="search"]');

/** L'editeur sur un plan, l'outil Texte, puis « Toutes les polices » ouvert sur la liste chargee. */
async function explorer(page: Page, tactile = false): Promise<void> {
  await ouvrirCode(page, PLAN, tactile);
  if (tactile) {
    await page.locator('.editeur-barre button[title^="Texte (T)"]').tap();
    await page.locator('.editeur-etat button[aria-label="Inspecteur"]').tap();
  } else {
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('t');
  }
  const inspecteur = page.locator('.editeur-inspecteur');
  await inspecteur.locator('select[aria-label="Police"]').waitFor({ timeout: 30_000 });
  const bouton = inspecteur.getByRole('button', { name: 'Toutes les polices' });
  if (tactile) await bouton.tap(); else await bouton.click();
  await attend(() => page.locator('.explorateur-polices .polices-total').innerText()).toMatch(/polices$/);
}

/** Ce que la ligne montre : la source de son apercu (disponible, prepare) ou « nom », et le trace dessine. */
async function apercuDe(page: Page, nom: RegExp | string): Promise<{ source: string; d: string; cache: string | null; couleur: boolean }> {
  return ligne(page, nom).first().evaluate(b => {
    const n = b.querySelector('.police-nom'), svg = n?.querySelector('svg'), chemin = svg?.querySelector('path');
    return {
      source: n?.getAttribute('data-apercu') ?? 'nom',
      d: chemin?.getAttribute('d') ?? '',
      cache: svg?.getAttribute('aria-hidden') ?? null,
      // Le dessin est a la couleur du texte du bouton (jetons, deux themes, contraste force).
      couleur: chemin ? getComputedStyle(chemin).fill === getComputedStyle(b).color : false
    };
  });
}

describe('les apercus des polices', () => {
  const navigateur = pilote();

  it('dessine les fontes livrees et les familles du catalogue sans aucune requete', async () => {
    const s = await navigateur.ouvrir({ naviguer: false });
    const reseau = await couperReseau(s);
    await s.page.goto(URL_PAGE);
    const page = s.page;
    await explorer(page);
    // La longue liste reste fenetree, et chaque ligne dessinee porte son apercu.
    await attend(() => page.locator('.liste-polices .police-nom-apercu svg path').count()).toBeGreaterThan(10);
    expect(await page.locator('.liste-polices .police-ligne').count()).toBeLessThan(100);

    // Une fonte livree : son nom dessine par sa propre fonte, calcule sur place.
    await recherche(page).fill('lobster');
    const livree = await apercuDe(page, /Livrée/);
    expect(livree.source).toBe('disponible');
    expect(livree.d).toMatch(/^M-?\d/);
    expect(livree.cache).toBe('true');
    expect(livree.couleur).toBe(true);
    // Une ligne par nom de famille : la famille Lobster de Google Fonts ne double pas la livree…
    expect(await ligne(page, /^Lobster\s*(Livrée|Google Fonts)$/).count()).toBe(1);
    // … et se montre, avec l'apercu prepare de l'annexe, quand on filtre sa source.
    await page.locator('.explorateur-polices select').nth(2).selectOption('google');
    expect((await apercuDe(page, /^Lobster\s*Google Fonts$/)).source).toBe('prepare');
    await page.locator('.explorateur-polices select').nth(2).selectOption('');

    // Des familles de chaque depot : Fontsource, Velvetyne (GitLab), Fontshare.
    for (const [cherche, nom] of [['roboto slab', /^Roboto Slab\s*Google Fonts$/], ['basteleur', /Basteleur/], ['satoshi', /Satoshi/]] as const) {
      await recherche(page).fill(cherche);
      const a = await apercuDe(page, nom);
      expect(a.source, cherche).toBe('prepare');
      expect(a.d.length, cherche).toBeGreaterThan(50);
    }
    // Le nom accessible reste le nom de la famille, en texte : le dessin est cache aux lecteurs d'ecran.
    await recherche(page).fill('roboto slab');
    await page.getByRole('button', { name: /^Roboto Slab\s*Google Fonts$/ }).first().waitFor();
    aucuneRequete(reseau);
  });

  it('ne montre qu une ligne par nom de famille : Bebas Neue livree, et celle de Fontshare quand on filtre Fontshare', async () => {
    const s = await navigateur.ouvrir({ naviguer: false });
    const reseau = await couperReseau(s);
    await s.page.goto(URL_PAGE);
    const page = s.page;
    await explorer(page);
    const total = Number((await page.locator('.explorateur-polices .polices-total').innerText()).replace(/\D/g, ''));
    // 2 200 familles et neuf familles livrees (Inter gras se choisit dans « Style » d'Inter) : 35 familles doubles entre
    // Google Fonts et Fontshare, huit familles livrees aussi servies par Google Fonts ; le total compte les lignes montrees.
    expect(total).toBe(2200 + 9 - 35 - 8);
    await recherche(page).fill('bebas');
    await attend(() => page.locator('.liste-polices .police-ligne').count()).toBe(1);
    expect(await ligne(page, 'Bebas Neue').innerText()).toMatch(/Livrée/);
    expect(await page.locator('.explorateur-polices .polices-total').innerText()).toBe('1 police');
    await page.locator('.explorateur-polices select').nth(2).selectOption('fontshare');
    await attend(() => page.locator('.liste-polices .police-ligne').count()).toBe(1);
    expect(await ligne(page, 'Bebas Neue').innerText()).toMatch(/Fontshare/);
    expect((await apercuDe(page, 'Bebas Neue')).source).toBe('prepare');
    await page.locator('.explorateur-polices select').nth(2).selectOption('google');
    expect(await ligne(page, 'Bebas Neue').innerText()).toMatch(/Google Fonts/);
    aucuneRequete(reseau);
  });

  it('sans l annexe des apercus, ecrit les noms dans la police de l interface et le dit, sans casser la liste', async () => {
    const s = await navigateur.ouvrir({ naviguer: false });
    const reseau = await couperReseau(s);
    // Le script de l'annexe arrive mais sa valeur ne se pose pas : comme un fichier absent ou malforme.
    await s.contexte.addInitScript(() => { Object.defineProperty(window, '__apercusPolicesSvg', { get: () => undefined, set: () => { /* la valeur ne se pose jamais */ }, configurable: false }); });
    await s.page.goto(URL_PAGE);
    const page = s.page;
    await explorer(page);
    await attend(() => page.locator('.explorateur-polices p.aide', { hasText: 'Les noms s’écrivent sans aperçu.' }).count()).toBe(1);
    await recherche(page).fill('roboto slab');
    const a = await apercuDe(page, /^Roboto Slab\s*Google Fonts$/);
    expect(a.source).toBe('nom');
    expect(await ligne(page, /^Roboto Slab\s*Google Fonts$/).first().locator('.police-nom').innerText()).toBe('Roboto Slab');
    // Les fontes livrees, elles, se dessinent toujours : elles n'ont pas besoin de l'annexe.
    await recherche(page).fill('lobster');
    expect((await apercuDe(page, /Livrée/)).source).toBe('disponible');
    aucuneRequete(reseau);
  });

  it('dessine dans sa fonte une police telechargee dans la session', async () => {
    const s = await navigateur.ouvrir({ naviguer: false });
    const woff = enWoff(new Uint8Array(readFileSync(resolve(RACINE_DEPOT, 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'))));
    const famille: FamilleCatalogue = { id: 'police-essai', nom: 'Police Essai', depot: 'fontsource', source: 'google', categorie: 'lineale', licence: 'OFL-1.1', version: '1.0.0', ecritures: ['latin'], variantes: [[400, 0, createHash('sha256').update(woff).digest('base64'), null]] };
    const index: CataloguePolices = { format: 1, instantane: '2026-10-25', familles: [famille], anciennes: [] };
    await s.contexte.addInitScript(i => { (window as unknown as Record<string, unknown>)['__cataloguePolicesSvg'] = i; }, index);
    await s.contexte.route(url => url.hostname === 'cdn.jsdelivr.net', route => route.fulfill({ status: 200, body: Buffer.from(woff), headers: { 'access-control-allow-origin': '*', 'content-type': 'font/woff' } }));
    await s.page.goto(URL_PAGE);
    const page = s.page;
    await explorer(page);
    // Avant : une famille de l'index d'essai, sans apercu prepare (l'annexe ne la connait pas) : son nom ecrit.
    expect((await apercuDe(page, 'Police Essai')).source).toBe('nom');
    await ligne(page, 'Police Essai').click();
    await attend(() => apercuDe(page, 'Police Essai').then(a => a.source)).toBe('disponible');
  });

  it('au telephone de 390 px : aucun debordement, des lignes de 40 px ; a la souris, au moins 24 px', async () => {
    const t = await navigateur.ouvrir({ largeur: 390, hauteur: 800, tactile: true, naviguer: false });
    const reseau = await couperReseau(t);
    await t.page.goto(URL_PAGE);
    await explorer(t.page, true);
    await attend(() => t.page.locator('.liste-polices .police-nom-apercu svg').count()).toBeGreaterThan(5);
    const mesures = await t.page.evaluate(() => {
      const liste = document.querySelector('.liste-polices') as HTMLElement;
      const lignes = [...document.querySelectorAll<HTMLElement>('.liste-polices .police-ligne')];
      return {
        page: document.documentElement.scrollWidth, fenetre: window.innerWidth,
        liste: liste.scrollWidth - liste.clientWidth,
        hauteurMin: Math.min(...lignes.map(l => l.getBoundingClientRect().height)),
        dehors: lignes.filter(l => l.getBoundingClientRect().right > window.innerWidth + 0.5).length
      };
    });
    expect(mesures.page).toBeLessThanOrEqual(mesures.fenetre);
    expect(mesures.liste).toBeLessThanOrEqual(0);
    expect(mesures.dehors).toBe(0);
    expect(mesures.hauteurMin).toBeGreaterThanOrEqual(40);
    aucuneRequete(reseau);

    const s = await navigateur.ouvrir();
    await explorer(s.page);
    await attend(() => s.page.locator('.liste-polices .police-nom-apercu svg').count()).toBeGreaterThan(5);
    const hauteur = await s.page.locator('.liste-polices .police-ligne').evaluateAll(l => Math.min(...l.map(e => e.getBoundingClientRect().height)));
    expect(hauteur).toBeGreaterThanOrEqual(24);
  });
});

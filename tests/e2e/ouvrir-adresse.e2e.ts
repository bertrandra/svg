// Ouvrir depuis une adresse dans la page autonome (ADR-0036) : le champ des voies « Ouvrir un SVG ou un PDF » et « Convertir une
// image », le type decide sur les octets (une .png qui est un SVG ouvre l'editeur, une .svg qui est une PNG le convertisseur), rien
// ne part avant « Ouvrir », la requete sans cookie ni referent, le refus CORS dit, un fichier hostile refuse comme un fichier
// depose, l'annulation, le clavier, un lien glisse ou colle, l'insertion depuis le menu Fichier de l'editeur, et axe sans violation.
// Aucun vrai reseau : chaque adresse est servie par `route`.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BrowserContext, Page, Route } from 'playwright';
import { aLeFocus, attend, attendreAnimations, formesVisibles, imageDeTest, ouvrirExemple, ouvrirMenu, pilote, RACINE_DEPOT, surToutLaHauteur, texteDe, type Session } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const HOTE = 'https://fichiers.exemple';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><rect x="10" y="10" width="40" height="30" fill="#c81e28"/><circle cx="70" cy="50" r="20" fill="#1428a0"/></svg>';
const PDF = readFileSync(resolve(RACINE_DEPOT, 'tests/fixtures/pdf/minimal.pdf'));
const PNG = imageDeTest().buffer;
const HOSTILE = (nom: string) => readFileSync(resolve(RACINE_DEPOT, 'tests/fixtures/hostile-adresse', nom));
const CHAMP = 'Ouvrir depuis une adresse';

interface Reponse { corps: string | Buffer; statut?: number; cors?: boolean }

/**
 * Ce que le navigateur ecrit de lui-meme dans la console quand un serveur repond 404 ou qu'une demande echoue (« Failed to load
 * resource ») : ce n'est pas la page qui l'ecrit. Seules ces lignes-la sont retirees, le reste fait toujours echouer le test.
 */
const sansErreursReseau = (s: Session) => {
  const restent = s.erreurs.filter(e => !/Failed to load resource|net::ERR_FAILED|Fetch API cannot load|CORS/i.test(e));
  s.erreurs.length = 0;
  s.erreurs.push(...restent);
};
interface Demande { url: string; methode: string; entetes: Record<string, string> }

/** Sert les adresses de `fichiers.exemple` (et note chaque demande) ; une adresse inconnue repond 404. */
async function servir(contexte: BrowserContext, fichiers: Record<string, Reponse>): Promise<Demande[]> {
  const demandes: Demande[] = [];
  await contexte.route(u => u.href.startsWith(HOTE + '/') || u.hostname === 'espion.exemple', async (route: Route) => {
    const req = route.request();
    demandes.push({ url: req.url(), methode: req.method(), entetes: req.headers() });
    const f = fichiers[new URL(req.url()).pathname];
    if (!f) return route.fulfill({ status: 404, body: 'Not Found', headers: { 'access-control-allow-origin': '*' } });
    // Un refus CORS : une reponse que `route.fulfill` servirait serait lue quand meme (Playwright ne la soumet pas au controle
    // d'origine). On rend donc ce que la page en voit : la demande lisible echoue (TypeError), la demande opaque aboutit.
    if (f.cors === false) return req.method() === 'GET' ? route.abort('failed') : route.fulfill({ status: 200, body: '' });
    return route.fulfill({ status: f.statut ?? 200, body: f.corps, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/octet-stream' } });
  });
  return demandes;
}

const champ = (page: Page) => page.getByRole('textbox', { name: CHAMP });
const message = (page: Page) => texteDe(page.locator('main > .message'));

/** Tape une adresse dans le champ visible et choisit « Ouvrir ». */
async function ouvrirAdresse(page: Page, url: string): Promise<void> {
  await champ(page).fill(url);
  await page.locator('.voie-panneau:not([hidden]) .adresse').getByRole('button', { name: 'Ouvrir', exact: true }).click();
}

async function auditer(page: Page): Promise<void> {
  await attendreAnimations(page);
  await page.addScriptTag({ content: AXE });
  const r = await surToutLaHauteur(page, () => page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: unknown[] }>; incomplete: Array<{ id: string; nodes: unknown[] }> }> } };
    const x = await w.axe.run(document, { resultTypes: ['violations', 'incomplete'] });
    return { violations: x.violations.map(v => v.id + ' ×' + v.nodes.length), incomplete: x.incomplete.map(v => v.id + ' ×' + v.nodes.length) };
  }));
  expect(r).toEqual({ violations: [], incomplete: [] });
}

describe('ouvrir depuis une adresse', () => {
  const navigateur = pilote();

  it('le champ est dans les deux voies ; rien ne part avant « Ouvrir » ; un SVG s ouvre dans l editeur, sans cookie ni referent', async () => {
    const { page, contexte } = await navigateur.ouvrir();
    const demandes = await servir(contexte, { '/dessins/logo.svg': { corps: SVG } });
    await champ(page).fill(HOTE + '/dessins/logo.svg?jeton=abc');
    await page.waitForTimeout(300);
    expect(demandes, 'taper une adresse n envoie rien').toEqual([]);
    expect(await texteDe(page.locator('.voie-panneau:not([hidden]) .adresse .aide').first())).toContain('rien ne part avant');
    await page.locator('.voie-panneau:not([hidden]) .adresse').getByRole('button', { name: 'Ouvrir', exact: true }).click();
    await page.locator('.editeur-cadre').waitFor();
    expect(await formesVisibles(page)).toBe(2);
    expect(await page.locator('.editeur-svg').getAttribute('aria-label')).toBe('Éditer : logo.svg');
    expect(demandes).toHaveLength(1);
    expect(demandes[0]?.methode).toBe('GET');
    expect(demandes[0]?.entetes['cookie']).toBeUndefined();
    expect(demandes[0]?.entetes['referer']).toBeUndefined();
    // La voie « Convertir une image » a le meme champ.
    await page.keyboard.press('Escape');
    await page.locator('.editeur-cadre').waitFor({ state: 'detached' });
    await page.locator('#voie-image').click();
    expect(await page.locator('#panneau-image').getByRole('textbox', { name: CHAMP }).count()).toBe(1);
  });

  it('un PDF s ouvre dans l editeur ; une PNG va au convertisseur, depuis l une ou l autre voie', async () => {
    const { page, contexte } = await navigateur.ouvrir();
    await servir(contexte, { '/plan.pdf': { corps: PDF }, '/photo.png': { corps: PNG } });
    await ouvrirAdresse(page, HOTE + '/plan.pdf');
    await page.locator('.editeur-cadre').waitFor();
    expect(await formesVisibles(page)).toBe(4);
    expect(await page.locator('.editeur-svg').getAttribute('aria-label')).toBe('Éditer : plan.svg');
    await page.keyboard.press('Escape');
    await page.locator('.editeur-cadre').waitFor({ state: 'detached' });
    await ouvrirAdresse(page, HOTE + '/photo.png');
    await attend(() => page.locator('#voie-image').getAttribute('aria-selected')).toBe('true');
    await attend(() => texteDe(page.locator('.vectoriser .depot p'))).toBe('photo · 240 × 190 px');
  });

  it('le type se decide sur les octets : une .png qui est un SVG a script ouvre l editeur, sans script ; une .svg qui est une PNG va au convertisseur', async () => {
    const { page, contexte } = await navigateur.ouvrir();
    const demandes = await servir(contexte, { '/logo.png': { corps: HOSTILE('image-qui-est-un-svg-a-script.png') }, '/dessin.svg': { corps: PNG } });
    await page.locator('#voie-image').click();
    await ouvrirAdresse(page, HOTE + '/logo.png');
    await page.locator('.editeur-cadre').waitFor();
    expect(await formesVisibles(page)).toBe(1);
    expect(await page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)).toBeUndefined();
    expect(demandes.filter(d => d.url.includes('espion'))).toEqual([]);
    await page.keyboard.press('Escape');
    await page.locator('.editeur-cadre').waitFor({ state: 'detached' });
    await page.locator('#voie-svg').click();
    await ouvrirAdresse(page, HOTE + '/dessin.svg');
    await attend(() => page.locator('#voie-image').getAttribute('aria-selected')).toBe('true');
    await attend(() => texteDe(page.locator('.vectoriser .depot p'))).toBe('dessin · 240 × 190 px');
  });

  it('un site qui refuse la lecture entre origines (CORS) : c est dit simplement, sans mandataire', async () => {
    const s = await navigateur.ouvrir();
    const { page, contexte } = s;
    const demandes = await servir(contexte, { '/protege.svg': { corps: SVG, cors: false } });
    await ouvrirAdresse(page, HOTE + '/protege.svg');
    await attend(() => message(page)).toBe('Ce site ne permet pas à la page de lire le fichier. Téléchargez-le, puis ouvrez-le ou déposez-le ici.');
    expect(demandes.map(d => [d.methode, new URL(d.url).host])).toEqual([['GET', 'fichiers.exemple'], ['HEAD', 'fichiers.exemple']]);
    await auditer(page);
    sansErreursReseau(s);
  });

  it('un fichier hostile est refuse comme un fichier depose : page d erreur HTML, renvoi externe, texte brut, erreur du serveur', async () => {
    const s = await navigateur.ouvrir();
    const { page, contexte } = s;
    const demandes = await servir(contexte, {
      '/a.svg': { corps: HOSTILE('reponse-html-erreur.svg') }, '/b.jpg': { corps: HOSTILE('image-svg-use-externe.jpg') },
      '/c.png': { corps: HOSTILE('reponse-texte-brut.png') }, '/d.pdf': { corps: HOSTILE('pdf-tronque.pdf') }
    });
    await ouvrirAdresse(page, HOTE + '/a.svg');
    await attend(() => message(page)).toContain('Cette adresse renvoie une page web, pas un fichier');
    await ouvrirAdresse(page, HOTE + '/b.jpg');
    await attend(() => message(page)).toMatch(/use|externe/i);
    await ouvrirAdresse(page, HOTE + '/c.png');
    await attend(() => message(page)).toContain('ni un SVG, ni un PDF');
    await ouvrirAdresse(page, HOTE + '/absent.svg');
    await attend(() => message(page)).toBe('Le serveur a répondu par une erreur (statut 404) : aucun fichier à cette adresse.');
    await ouvrirAdresse(page, HOTE + '/d.pdf');
    await attend(() => message(page)).not.toMatch(/Lecture de/);
    expect(await page.locator('.editeur-cadre').count()).toBe(0);
    expect(demandes.filter(d => d.url.includes('espion'))).toEqual([]);
    sansErreursReseau(s);
  });

  it('http et les autres schemas sont refuses avant toute requete', async () => {
    const { page, contexte } = await navigateur.ouvrir();
    const demandes = await servir(contexte, {});
    await ouvrirAdresse(page, 'http://fichiers.exemple/logo.svg');
    await attend(() => message(page)).toContain('seules les adresses « https:// » s’ouvrent ici');
    await ouvrirAdresse(page, 'file:///etc/passwd');
    await attend(() => message(page)).toBe('Seules les adresses web « https:// » s’ouvrent ici (« file: » est refusé).');
    expect(demandes).toEqual([]);
  });

  it('« Annuler » arrete le telechargement, le dit, et rend le focus au champ ; au clavier de bout en bout', async () => {
    const { page, contexte } = await navigateur.ouvrir();
    let liberer: () => void = () => undefined;
    await contexte.route(HOTE + '/lent.svg', route => new Promise<void>(ok => { liberer = ok; }).then(() => route.fulfill({ status: 200, body: SVG, headers: { 'access-control-allow-origin': '*' } }).catch(() => undefined)));
    await champ(page).focus();
    await page.keyboard.type(HOTE + '/lent.svg');
    await page.keyboard.press('Enter');
    const etat = page.locator('.voie-panneau:not([hidden]) .adresse-etat');
    await attend(() => texteDe(etat)).toBe('Téléchargement depuis fichiers.exemple…');
    expect(await page.locator('.voie-panneau:not([hidden]) .adresse').getAttribute('aria-busy')).toBe('true');
    await page.keyboard.press('Tab');
    const annuler = page.locator('.voie-panneau:not([hidden]) .adresse').getByRole('button', { name: 'Annuler' });
    expect(await aLeFocus(annuler)).toBe(true);
    await page.keyboard.press('Enter');
    await attend(() => message(page)).toBe('Téléchargement annulé.');
    await attend(() => aLeFocus(champ(page))).toBe(true);
    expect(await texteDe(etat)).toBe('');
    liberer();
    await page.waitForTimeout(200);
    expect(await page.locator('.editeur-cadre').count()).toBe(0);
  });

  it('un lien glisse sur la zone de depot, ou une adresse collee seule dans la zone de code, l ouvre aussi', async () => {
    const { page, contexte } = await navigateur.ouvrir();
    await servir(contexte, { '/glisse.svg': { corps: SVG }, '/colle.svg': { corps: SVG } });
    await page.locator('.depot').first().waitFor();
    await page.evaluate(url => {
      const dt = new DataTransfer();
      dt.setData('text/uri-list', url);
      dt.setData('text/plain', url);
      document.querySelector('.depot')?.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, HOTE + '/glisse.svg');
    await page.locator('.editeur-cadre').waitFor();
    expect(await page.locator('.editeur-svg').getAttribute('aria-label')).toBe('Éditer : glisse.svg');
    await page.keyboard.press('Escape');
    await page.locator('.editeur-cadre').waitFor({ state: 'detached' });
    const zone = page.locator('section[aria-label="Ouvrir un SVG ou un PDF"] textarea');
    // Un collage synthetique : Firefox ne laisse pas lire le presse-papiers d'un ClipboardEvent fabrique (mode protege), on pose
    // donc `clipboardData` sur l'evenement, ce que React lit de la meme facon dans les trois moteurs.
    await zone.evaluate((el, url) => {
      const ev = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', { value: { getData: (t: string) => (t === 'text/plain' ? url : ''), types: ['text/plain'] } });
      el.dispatchEvent(ev);
    }, HOTE + '/colle.svg');
    await page.locator('.editeur-cadre').waitFor();
    expect(await page.locator('.editeur-svg').getAttribute('aria-label')).toBe('Éditer : colle.svg');
    expect(await zone.inputValue()).toBe('');
  });

  it('dans l editeur, Fichier → « Insérer depuis une adresse… » insere un SVG au centre ; une image est refusee en le disant', async () => {
    const { page, contexte } = await navigateur.ouvrir();
    await servir(contexte, { '/etoile.svg': { corps: SVG }, '/photo.png': { corps: PNG } });
    await ouvrirExemple(page);
    const avant = await formesVisibles(page);
    await ouvrirMenu(page, 'Fichier');
    await page.getByRole('menuitem', { name: 'Insérer depuis une adresse…' }).click();
    const boite = page.getByRole('dialog', { name: 'Insérer depuis une adresse' });
    await boite.waitFor();
    expect(await aLeFocus(boite.getByRole('textbox', { name: CHAMP }))).toBe(true);
    await auditer(page);
    await page.keyboard.type(HOTE + '/photo.png');
    await page.keyboard.press('Enter');
    await attend(() => texteDe(boite.locator('.message'))).toContain('C’est une image');
    await boite.getByRole('textbox', { name: CHAMP }).fill(HOTE + '/etoile.svg');
    await boite.getByRole('button', { name: 'Ouvrir', exact: true }).click();
    await boite.waitFor({ state: 'detached' });
    await attend(() => formesVisibles(page)).toBe(avant + 2);
    // Echap ferme la boite sans fermer l'editeur.
    await ouvrirMenu(page, 'Fichier');
    await page.getByRole('menuitem', { name: 'Insérer depuis une adresse…' }).click();
    await boite.waitFor();
    await page.keyboard.press('Escape');
    await boite.waitFor({ state: 'detached' });
    expect(await page.locator('.editeur-cadre').count()).toBe(1);
  });

  it('axe : l accueil avec le champ, pendant un telechargement et apres une erreur, sans violation ni doute', async () => {
    const { page, contexte } = await navigateur.ouvrir();
    await contexte.route(HOTE + '/lent.svg', () => new Promise<void>(() => undefined));
    await auditer(page);
    await champ(page).fill(HOTE + '/lent.svg');
    await page.keyboard.press('Enter');
    await attend(() => texteDe(page.locator('.voie-panneau:not([hidden]) .adresse-etat'))).toContain('Téléchargement');
    await auditer(page);
    await page.locator('#voie-image').click();
    await page.locator('#panneau-image').getByRole('textbox', { name: CHAMP }).fill('pas une adresse valide::');
    await page.keyboard.press('Enter');
    await attend(() => texteDe(page.locator('.vectoriser > p[role="status"]'))).toContain('n’est pas valide');
    await auditer(page);
  });
});

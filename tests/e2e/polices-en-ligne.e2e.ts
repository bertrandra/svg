// Les polices libres telechargeables (ADR-0025), par la vraie page, sans vrai reseau : l'index est pose avant la page (un
// petit index d'essai, a la place de l'annexe), et chaque requete vers un serveur de polices est interceptee (`route`) et servie
// d'un fichier d'essai (Inter, mise en WOFF). On verifie : rien ne part tant qu'on ne choisit pas (ouvrir, chercher, voir) ; le
// choix d'une police non livree la telecharge aussitot (plus de dialogue d'accord) ; le fichier est verifie par son empreinte puis
// compose ; la ligne dit le telechargement en cours ; une empreinte fausse est refusee en le disant ; un ancien accord reste dans
// le stockage est ignore et efface ; un hote ne voit le catalogue que s'il l'a demande.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Download, Page, Request } from 'playwright';
import { attend, boutonTelecharger, nombreDeCalques, ouvrirCode, pilote, RACINE_DEPOT, texteDe, URL_INTEGRATION, URL_PAGE, type Session } from './aide.js';
import { champPolice, choisirPolice, listePolices, ouvrirPolices, valeurPolice } from './polices.js';
import { enWoff } from '../unit/io/woffFactice.js';
import { idVariante, type CataloguePolices, type FamilleCatalogue } from '../../src/model/cataloguePolices.js';

const PLAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect x="0" y="0" width="40" height="40" fill="#1f4e8c"/></svg>';
const lire = (p: string): Uint8Array => new Uint8Array(readFileSync(resolve(RACINE_DEPOT, 'node_modules/@expo-google-fonts', p)));
const WOFF = enWoff(lire('inter/400Regular/Inter_400Regular.ttf'));
const AUTRE = enWoff(lire('oswald/500Medium/Oswald_500Medium.ttf'));
const sha = (o: Uint8Array): string => createHash('sha256').update(o).digest('base64');
const CHEMIN_ITF = 'A'.repeat(32) + '/' + 'B'.repeat(32) + '/' + 'C'.repeat(32) + '.woff';

const base = { depot: 'fontsource', source: 'google', categorie: 'lineale', licence: 'OFL-1.1', version: '1.0.0', ecritures: ['latin'] } as const;
const ESSAI: FamilleCatalogue = { ...base, id: 'police-essai', nom: 'Police Essai', variantes: [[400, 0, sha(WOFF), null]] };
const FAUX: FamilleCatalogue = { ...base, id: 'essai-faux', nom: 'Essai Faux', variantes: [[400, 0, sha(WOFF), null]] };
const ITF: FamilleCatalogue = { id: 'essai-itf', nom: 'Essai ITF', depot: 'fontshare', source: 'fontshare', categorie: 'affiche', licence: 'ITF-FFL', version: '1.0', ecritures: ['latin'], variantes: [[400, 0, sha(WOFF), null, CHEMIN_ITF]] };
const INDEX: CataloguePolices = { format: 1, instantane: '2026-10-25', familles: [ESSAI, FAUX, ITF], anciennes: [] };
const ID_ESSAI = idVariante(ESSAI, [400, 0, sha(WOFF), null]);
const URL_ESSAI = 'https://cdn.jsdelivr.net/npm/@fontsource/police-essai@1.0.0/files/police-essai-latin-400-normal.woff';

const SERVEURS = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.bunny\.net|gitlab\.com|cdn\.fontshare\.com)\//;

interface Reseau { requetes: Request[] }

/**
 * Une page dont l'index est celui d'essai et dont chaque requete vers un serveur de polices est servie ici, et notee. `retenir`
 * fait attendre la reponse jusqu'a ce que la promesse donnee se resolve (pour voir la ligne pendant le telechargement).
 */
async function preparer(s: Session, retenir?: Promise<void>): Promise<Reseau> {
  const r: Reseau = { requetes: [] };
  await s.contexte.addInitScript(index => { (window as unknown as Record<string, unknown>)['__cataloguePolicesSvg'] = index; }, INDEX);
  await s.contexte.route(url => SERVEURS.test(url.href), async route => {
    const req = route.request();
    r.requetes.push(req);
    if (retenir) await retenir;
    // Le faux et le fichier de Fontshare : un autre fichier que celui que l'index annonce.
    const corps = req.url().includes('essai-faux') ? AUTRE : WOFF;
    return route.fulfill({ status: 200, body: Buffer.from(corps), headers: { 'access-control-allow-origin': '*', 'content-type': 'font/woff' } });
  });
  return r;
}

const inspecteur = (page: Page) => page.locator('.editeur-inspecteur');


/** Ouvre un plan, l'outil Texte, puis « Toutes les polices » ; attend la liste. */
async function explorer(page: Page): Promise<void> {
  await ouvrirCode(page, PLAN);
  await page.keyboard.press('t');
  await champPolice(inspecteur(page)).waitFor({ timeout: 30_000 });
  await inspecteur(page).getByRole('button', { name: 'Toutes les polices' }).click();
  await page.locator('.liste-polices .police-ligne', { hasText: 'Police Essai' }).waitFor();
}

const ligne = (page: Page, nom: string) => page.locator('.liste-polices .police-ligne', { hasText: nom });

describe('les polices libres en ligne', () => {
  const navigateur = pilote();

  it('ne fait aucune requete sans choix ; choisir telecharge aussitot, verifie l empreinte et compose un texte qui garde sa police', async () => {
    const s = await navigateur.ouvrir({ naviguer: false });
    const reseau = await preparer(s);
    await s.page.goto(URL_PAGE);
    const page = s.page;
    // Ouvrir la liste, chercher, filtrer : aucune requete.
    await explorer(page);
    await page.locator('.explorateur-polices input[type="search"]').fill('essai');
    await attend(() => page.locator('.liste-polices .police-ligne').count()).toBe(3);
    await page.locator('.explorateur-polices input[type="search"]').fill('');
    expect(reseau.requetes).toEqual([]);
    expect(await page.getByRole('dialog', { name: /Télécharger la police/ }).count()).toBe(0);
    expect(await texteDe(page.locator('.explorateur-polices'))).toContain('Choisir une police qui n’est pas livrée la télécharge depuis sa source');

    // Le choix vaut demande : aucun dialogue, la police arrive, verifiee.
    await ligne(page, 'Police Essai').click();
    await attend(() => valeurPolice(inspecteur(page))).toBe(ID_ESSAI);
    expect(await page.getByRole('dialog', { name: /Télécharger la police/ }).count()).toBe(0);
    // Une seule requete, sans cookie ni page d'origine ; aucun accord ecrit dans le stockage.
    expect(reseau.requetes.map(r => r.url())).toEqual([URL_ESSAI]);
    const entetes = await reseau.requetes[0]?.allHeaders();
    expect(Object.keys(entetes ?? {}).filter(k => /^(cookie|referer)$/i.test(k))).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('svg.polices.consentement'))).toBeNull();

    await page.getByRole('button', { name: 'Ajouter le texte' }).click();
    await attend(() => nombreDeCalques(page)).toBe(2);
    const [telechargement]: [Download, void] = await Promise.all([page.waitForEvent('download'), boutonTelecharger(page).click()]);
    const svg = readFileSync(await telechargement.path(), 'utf8');
    expect(svg).toContain('data-ed-police="' + ID_ESSAI + '"');
    expect(svg).toContain('data-ed-famille="Police%20Essai"');
    expect(svg).not.toMatch(/<text\b|@font-face|woff/i);

    // Le texte ajoute est choisi : l'inspecteur montre sa section Texte, avec son propre « Toutes les polices ».
    await inspecteur(page).getByRole('button', { name: 'Toutes les polices' }).click();
    // Une police d'un autre serveur : l'ITF FFL a son badge, et la chercher ne la demande pas.
    await page.locator('.explorateur-polices input[type="search"]').fill('itf');
    expect(await texteDe(ligne(page, 'Essai ITF'))).toContain('ITF');
    expect(reseau.requetes).toHaveLength(1);
    await page.locator('.explorateur-polices input[type="search"]').fill('');

    // Un second texte, en Inter : « Remplacer partout » recompose en Inter le texte en Police Essai, en un seul geste.
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('t');
    await choisirPolice(inspecteur(page), 'inter');
    await page.getByRole('button', { name: 'Ajouter le texte' }).click();
    await attend(() => nombreDeCalques(page)).toBe(3);
    await inspecteur(page).getByRole('button', { name: 'Toutes les polices' }).click();
    const documentPolices = page.locator('.explorateur-polices section[aria-label="Polices du document"]');
    expect(await texteDe(documentPolices)).toContain('Police Essai 1 texte');
    await documentPolices.getByRole('button', { name: 'Remplacer partout par Inter' }).click();
    await attend(() => texteDe(documentPolices)).toContain('Inter 2 textes');

    // Les credits nomment la licence de la police employee (Ctrl+Z ramene le texte en Police Essai).
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('Control+z');
    await page.locator('.menu-bouton', { hasText: 'Fichier' }).click();
    await page.getByRole('menuitem', { name: 'À propos et crédits' }).click();
    const credits = await texteDe(page.getByRole('dialog', { name: 'À propos et crédits' }));
    expect(credits).toContain('Polices téléchargées employées dans ce dessin');
    expect(credits).toContain('Police Essai · Google Fonts · SIL Open Font License 1.1');
  });

  it('refuse un fichier a l empreinte fausse, en le disant, et ne lit rien', async () => {
    const s = await navigateur.ouvrir({ naviguer: false });
    const reseau = await preparer(s);
    await s.page.goto(URL_PAGE);
    const page = s.page;
    await explorer(page);
    const avant = await valeurPolice(inspecteur(page));
    await ligne(page, 'Essai Faux').click();
    const alerte = page.locator('.explorateur-polices [role="alert"]');
    await alerte.waitFor();
    expect(await texteDe(alerte)).toBe('Essai Faux : le fichier servi par cdn.jsdelivr.net n’a pas l’empreinte attendue : refusé ; le fichier servi par fonts.bunny.net n’a pas l’empreinte attendue : refusé.');
    expect(reseau.requetes.map(r => new URL(r.url()).hostname)).toEqual(['cdn.jsdelivr.net', 'fonts.bunny.net']);
    expect(await valeurPolice(inspecteur(page))).toBe(avant);
    // Rien n'est lu : dans la liste des polices, elle reste a telecharger.
    await ouvrirPolices(inspecteur(page));
    expect(await listePolices(inspecteur(page)).locator('[role="option"][aria-label^="Essai Faux"]').getAttribute('data-etat')).toBe('a-telecharger');
  });

  it('ignore et efface un ancien accord reste dans le stockage ; la ligne dit le telechargement en cours', async () => {
    const s = await navigateur.ouvrir({ naviguer: false });
    let liberer: () => void = () => undefined;
    const retenue = new Promise<void>(r => { liberer = r; });
    const reseau = await preparer(s, retenue);
    await s.page.addInitScript(() => { if (!sessionStorage.getItem('deja')) { sessionStorage.setItem('deja', '1'); localStorage.setItem('svg.polices.consentement', JSON.stringify({ serveurs: ['jsdelivr', 'bunny'] })); } });
    await s.page.goto(URL_PAGE);
    const page = s.page;
    await explorer(page);
    // L'ancienne cle ne decide plus de rien : elle s'efface, et rien n'est parti pour autant.
    await attend(() => page.evaluate(() => localStorage.getItem('svg.polices.consentement'))).toBeNull();
    expect(await page.getByRole('button', { name: /Retirer l’autorisation/ }).count()).toBe(0);
    expect(reseau.requetes).toEqual([]);
    // Pendant le telechargement : la ligne le dit (et se refuse a un second clic), la note aussi.
    await ligne(page, 'Police Essai').click();
    const enCours = ligne(page, 'Police Essai');
    await attend(() => texteDe(enCours)).toContain('Téléchargement…');
    expect(await enCours.getAttribute('aria-busy')).toBe('true');
    expect(await texteDe(page.locator('.explorateur-polices'))).toContain('Téléchargement de la police Police Essai…');
    liberer();
    await attend(() => valeurPolice(inspecteur(page))).toBe(ID_ESSAI);
    await attend(() => texteDe(ligne(page, 'Police Essai'))).not.toContain('Téléchargement…');
    expect(reseau.requetes.map(r => r.url())).toEqual([URL_ESSAI]);
  });

  it('chez un hote : rien du catalogue par defaut, « Toutes les polices » seulement avec policesEnLigne: true', async () => {
    const s = await navigateur.ouvrir({ naviguer: false });
    const reseau = await preparer(s);
    await s.page.goto(URL_INTEGRATION);
    const page = s.page;
    const ouvrir = (enLigne: boolean | undefined) => page.evaluate(([svg, e]) => {
      const api = (window as unknown as { EditeurSvg: { ouvrir: (o: Record<string, unknown>) => { fermer: () => void } } }).EditeurSvg;
      const p = api.ouvrir({ svg, baseAnnexes: '../dist', onEnregistrer: () => undefined, ...(e === undefined ? {} : { policesEnLigne: e }) });
      (window as unknown as { __p: { fermer: () => void } }).__p = p;
    }, [PLAN, enLigne] as const);
    await ouvrir(undefined);
    await page.locator('.editeur-svg .editeur-cadre').waitFor();
    await page.keyboard.press('t');
    await champPolice(inspecteur(page)).waitFor({ timeout: 30_000 });
    expect(await page.getByRole('button', { name: 'Toutes les polices' }).count()).toBe(0);
    // La barre de texte (ADR-0027) suit la meme regle que le panneau : sans polices en ligne, pas de « Toutes les polices ».
    expect(await page.getByRole('toolbar', { name: 'Texte' }).count()).toBe(1);
    // La liste deroulante (ADR-0034) n'a que les polices locales : ni catalogue, ni marque, ni lien vers les filtres.
    await ouvrirPolices(inspecteur(page));
    expect(await listePolices(inspecteur(page)).locator('[data-groupe="catalogue"]').count()).toBe(0);
    expect(await listePolices(inspecteur(page)).locator('[data-etat="a-telecharger"]').count()).toBe(0);
    expect(await inspecteur(page).getByRole('button', { name: /^Filtrer par genre/ }).count()).toBe(0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => (window as unknown as { __p: { fermer: () => void } }).__p.fermer());
    await ouvrir(true);
    await page.locator('.editeur-svg .editeur-cadre').waitFor();
    await page.keyboard.press('t');
    await champPolice(inspecteur(page)).waitFor({ timeout: 30_000 });
    // Un dans le panneau, un dans la barre de texte (ADR-0027).
    expect(await page.locator('.editeur-inspecteur').getByRole('button', { name: 'Toutes les polices' }).count()).toBe(1);
    expect(await page.getByRole('toolbar', { name: 'Texte' }).getByRole('button', { name: 'Toutes les polices' }).count()).toBe(1);
    // Avec l'option, la liste porte tout le catalogue, et la police d'essai y est marquee.
    await ouvrirPolices(inspecteur(page));
    await listePolices(inspecteur(page)).locator('[data-groupe="catalogue"]').waitFor();
    expect(await listePolices(inspecteur(page)).locator('[role="option"][data-police="' + ID_ESSAI + '"]').getAttribute('data-etat')).toBe('a-telecharger');
    expect(reseau.requetes).toEqual([]);
  });
});

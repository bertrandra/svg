// « Rien ne quitte votre navigateur », a la lettre (docs/securite.md, constat M6) : la page autonome ne contacte AUCUN hote.
// Avant, ses polices venaient de fonts.googleapis.com et fonts.gstatic.com ; elles sont maintenant dans le fichier (data: URI,
// scripts/fontes-interface.mjs). Ici tout le reseau est coupe (tout ce qui n'est pas file:, data: ou blob: est avorte), la page est
// parcourue (accueil, voie image avec une vectorisation, editeur avec l'exemple) et le test echoue pour toute requete, meme
// avortee, et si une police ne s'affiche pas. Le texte de la page, lui, est verifie par tests/unit/depot/page-hors-ligne.test.ts.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, imageDeTest, ouvrirExemple, pilote, type Session, URL_PAGE } from './aide.js';

/** Les familles et graisses que l'interface demande, telles que scripts/fontes-interface.mjs les declare. */
const POLICES: ReadonlyArray<readonly [string, number]> = [
  ['Instrument Sans', 400], ['Instrument Sans', 500], ['Instrument Sans', 600], ['Instrument Sans', 700], ['IBM Plex Mono', 400], ['IBM Plex Mono', 500]
];

const TRACE = 60_000;

/** Ce qui n'est pas une requete reseau : le fichier de la page et ses annexes, une data: URI, un blob. */
const LOCAL = /^(?:file|data|blob|about):/i;

interface Reseau {
  /** Chaque requete d'une page de la session qui n'est pas locale, vue par le navigateur (avortee ou non). */
  requetes: string[];
  /** Ce que le routage a du avorter : doit rester vide, c'est la meme preuve vue du cote de Playwright. */
  avortees: string[];
}

/** Coupe tout le reseau de la session et consigne chaque tentative, y compris sur les pages que le test ouvre ensuite. */
async function coupeReseau(s: Session): Promise<Reseau> {
  const r: Reseau = { requetes: [], avortees: [] };
  await s.contexte.route(url => !LOCAL.test(url.protocol), route => { r.avortees.push(route.request().url()); return route.abort(); });
  const surveiller = (page: Page) => {
    page.on('request', req => { if (!LOCAL.test(req.url())) r.requetes.push(req.url()); });
    // Un ping, une balise, un WebSocket : aucun ne passe par `request` partout, mais tous echouent ou sortent par ici.
    page.on('websocket', ws => r.requetes.push(ws.url()));
  };
  surveiller(s.page);
  s.contexte.on('page', surveiller);
  return r;
}

/** Les polices de l'interface : chacune est declaree, se charge, et sert bien a rendre du texte (pas une pile de repli). */
async function verifierPolices(page: Page): Promise<void> {
  const resultat = await page.evaluate(async polices => {
    const charges: string[] = [];
    for (const [famille, graisse] of polices) {
      const faces = await document.fonts.load(graisse + ' 16px "' + famille + '"');
      // `load` rend les @font-face qui correspondent : zero si la famille n'est declaree nulle part (check() mentirait : vrai pour une inconnue).
      charges.push(famille + ' ' + graisse + ' : ' + faces.length + ' ' + faces.map(f => f.status).join());
    }
    await document.fonts.ready;
    // Une fonte est vraiment utilisee quand ses chasses different de celles de la pile de repli.
    const largeur = (police: string) => {
      const c = document.createElement('canvas').getContext('2d');
      if (!c) return 0;
      c.font = police;
      return c.measureText('Éditeur SVG — Ouvrir l’exemple 0123456789 mmmmmWWWWiiii').width;
    };
    return {
      charges,
      dejaChargees: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight),
      sansDiffere: largeur('600 20px "Instrument Sans", monospace') !== largeur('600 20px monospace'),
      monoDiffere: largeur('400 20px "IBM Plex Mono", serif') !== largeur('400 20px serif'),
      corps: getComputedStyle(document.body).fontFamily
    };
  }, POLICES);
  expect(resultat.charges).toEqual(POLICES.map(([f, g]) => f + ' ' + g + ' : 1 loaded'));
  expect(resultat.sansDiffere, 'Instrument Sans ne rend pas le texte : la pile de repli a pris le relais').toBe(true);
  expect(resultat.monoDiffere, 'IBM Plex Mono ne rend pas le texte : la pile de repli a pris le relais').toBe(true);
  expect(resultat.corps.startsWith('"Instrument Sans"')).toBe(true);
}

describe('hors ligne : la page autonome ne contacte aucun hote', () => {
  const navigateur = pilote();

  async function session() {
    const s = await navigateur.ouvrir({ naviguer: false });
    const reseau = await coupeReseau(s);
    await s.page.goto(URL_PAGE);
    return { ...s, reseau };
  }

  /** Echoue s'il y a eu une requete vers un hote, ou si le routage a eu quelque chose a avorter. */
  const aucuneRequete = (r: Reseau) => expect({ requetes: r.requetes, avortees: r.avortees }).toEqual({ requetes: [], avortees: [] });

  it('l\'accueil s\'ouvre sans requete, avec ses polices', async () => {
    const { page, reseau } = await session();
    await page.getByRole('tab').first().waitFor();
    // Les polices servent deja, sans que le test les ait demandees : la page elle-meme les a utilisees pour se rendre.
    const tot = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight); });
    expect(tot).toContain('Instrument Sans 400');
    await verifierPolices(page);
    // Les fontes redistribuees sont creditees (SIL OFL 1.1 : le copyright accompagne la fonte), dans la boite « A propos et credits ».
    await page.getByRole('button', { name: 'À propos et crédits' }).click();
    const credits = await page.getByRole('dialog', { name: 'À propos et crédits' }).innerText();
    for (const nom of ['Instrument Sans', 'IBM Plex Mono', 'SIL Open Font License 1.1']) expect(credits, nom).toContain(nom);
    aucuneRequete(reseau);
  });

  it('la voie image et une vectorisation (vtracer.js est un fichier voisin) se passent de reseau', async () => {
    const { page, reseau } = await session();
    await page.getByRole('tab').nth(1).click();
    await page.locator('.vectoriser input[type=file]').setInputFiles(imageDeTest());
    await page.locator('.fiche-resultat').waitFor({ timeout: TRACE });
    await verifierPolices(page);
    aucuneRequete(reseau);
  });

  it('l\'editeur ouvert sur l\'exemple et ses menus se passent de reseau', async () => {
    const { page, reseau } = await session();
    await ouvrirExemple(page);
    await page.locator('.menu-bouton', { hasText: 'Fichier' }).click();
    await attend(() => page.locator('[role=menu]:visible').count()).toBeGreaterThan(0);
    await verifierPolices(page);
    // La police a chasse fixe sert dans l'editeur (le pourcentage de zoom, les codes de couleur).
    const mono = await page.locator('.editeur-barre .zoom').evaluate(e => getComputedStyle(e).fontFamily);
    expect(mono.startsWith('"IBM Plex Mono"')).toBe(true);
    aucuneRequete(reseau);
  });

  it('coupe vraiment le reseau : une requete vers un hote est vue et avortee (le test n\'est pas aveugle)', async () => {
    const { page, reseau, erreurs } = await session();
    await page.getByRole('tab').first().waitFor();
    const issue = await page.evaluate(() => fetch('https://fonts.gstatic.com/s/instrumentsans/v4/x.woff2').then(() => 'passe', () => 'avorte'));
    expect(issue).toBe('avorte');
    expect(reseau.avortees).toEqual(['https://fonts.gstatic.com/s/instrumentsans/v4/x.woff2']);
    expect(reseau.requetes).toEqual(['https://fonts.gstatic.com/s/instrumentsans/v4/x.woff2']);
    // Le navigateur ecrit « Failed to load resource » dans la console pour cette requete voulue : ce n'est pas une erreur de la page.
    erreurs.length = 0;
  });
});

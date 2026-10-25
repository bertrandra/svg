// La liste deroulante des polices (ADR-0034), par la vraie page : une seule liste, dans le panneau et dans la barre de texte, qui
// montre toutes les polices (livrees, deposees, telechargees, tout le catalogue) et marque celles qui ne sont pas encore la. Sans
// vrai reseau : un petit index d'essai est pose avant la page, chaque requete vers un serveur de polices est servie d'un fichier
// d'essai (Inter, mise en WOFF) et notee. On verifie : les groupes et leur ordre ; la marque « à télécharger » (une icone et un
// texte dans le nom accessible) sur une police du catalogue, aucune sur une livree ; taper filtre ; ouvrir, parcourir et chercher
// ne demandent rien ; choisir une police marquee la telecharge, la pose, et la marque disparait ; une erreur est dite ; tout au
// clavier (fleches, Page, Debut, Fin, Entree, Echap, Tab) ; au doigt sur 390 px, une feuille de toute la largeur, des lignes de 40 px.
// L'audit axe de la liste ouverte est dans accessibilite-axe.e2e.ts ; le vrai index, reseau coupe, dans hors-ligne.e2e.ts.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Locator, Page, Request } from 'playwright';
import { aLeFocus, attend, attendreAnimations, ouvrirCode, pilote, RACINE_DEPOT, texteDe, URL_PAGE, type Session } from './aide.js';
import { champPolice, listePolices, optionPolice, ouvrirPolices, valeurPolice } from './polices.js';
import { enWoff } from '../unit/io/woffFactice.js';
import { idVariante, type CataloguePolices, type FamilleCatalogue } from '../../src/model/cataloguePolices.js';

const PLAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect x="0" y="0" width="40" height="40" fill="#1f4e8c"/></svg>';
const WOFF = enWoff(new Uint8Array(readFileSync(resolve(RACINE_DEPOT, 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'))));
const sha = (o: Uint8Array): string => createHash('sha256').update(o).digest('base64');

const base = { depot: 'fontsource', source: 'google', categorie: 'lineale', licence: 'OFL-1.1', version: '1.0.0', ecritures: ['latin'] } as const;
const ESSAI: FamilleCatalogue = { ...base, id: 'police-essai', nom: 'Police Essai', variantes: [[400, 0, sha(WOFF), null]] };
// Une empreinte qui ne correspond a aucun fichier servi : le telechargement est refuse, et c'est dit.
const FAUX: FamilleCatalogue = { ...base, id: 'essai-faux', nom: 'Essai Faux', variantes: [[400, 0, sha(new Uint8Array([1, 2, 3])), null]] };
const ACCENT: FamilleCatalogue = { ...base, id: 'fete-essai', nom: 'Fête Essai', categorie: 'manuscrite', variantes: [[400, 0, sha(WOFF), null]] };
// Une famille livree aussi : elle ne doit pas avoir de seconde ligne (une ligne par nom de famille, ADR-0026).
const LOBSTER: FamilleCatalogue = { ...base, id: 'lobster', nom: 'Lobster', categorie: 'manuscrite', variantes: [[400, 0, sha(WOFF), null]] };
// De quoi depasser le seuil du fenetrage (150 lignes) : la liste n'en dessine qu'une partie.
const NOMBREUSES: FamilleCatalogue[] = Array.from({ length: 400 }, (_, i) => ({ ...base, id: 'serie-' + i, nom: 'Série ' + String(i).padStart(3, '0'), variantes: [[400, 0, sha(WOFF), null]] }));
const INDEX: CataloguePolices = { format: 1, instantane: '2026-10-25', familles: [ACCENT, FAUX, LOBSTER, ESSAI, ...NOMBREUSES], anciennes: [] };
const ID_ESSAI = idVariante(ESSAI, [400, 0, sha(WOFF), null]);

const SERVEURS = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.bunny\.net|gitlab\.com|cdn\.fontshare\.com)\//;

/** L'index d'essai avant la page ; chaque requete vers un serveur de polices servie ici, et notee. */
async function preparer(s: Session): Promise<Request[]> {
  const requetes: Request[] = [];
  await s.contexte.addInitScript(index => { (window as unknown as Record<string, unknown>)['__cataloguePolicesSvg'] = index; }, INDEX);
  await s.contexte.route(url => SERVEURS.test(url.href), async route => {
    requetes.push(route.request());
    return route.fulfill({ status: 200, body: Buffer.from(WOFF), headers: { 'access-control-allow-origin': '*', 'content-type': 'font/woff' } });
  });
  return requetes;
}

const inspecteur = (page: Page) => page.locator('.editeur-inspecteur');
const barre = (page: Page) => page.getByRole('toolbar', { name: 'Texte' });
const titresGroupes = (zone: Locator) => listePolices(zone).locator('[role="group"]').evaluateAll(gs => gs.map(g => g.getAttribute('aria-label') ?? document.getElementById(g.getAttribute('aria-labelledby') ?? '')?.textContent ?? ''));
const nomAccessible = async (l: Locator): Promise<string> => (await l.getAttribute('aria-label')) ?? '';
const options = (zone: Locator) => listePolices(zone).locator('[role="option"]');

async function editeurTexte(s: Session, tactile = false): Promise<Page> {
  const page = s.page;
  await page.goto(URL_PAGE);
  await ouvrirCode(page, PLAN, tactile);
  if (tactile) await page.locator('.editeur-barre button[title^="Texte (T)"]').tap();
  else await page.keyboard.press('t');
  return page;
}

describe('la liste deroulante des polices', () => {
  const navigateur = pilote();

  it('depuis le panneau : les groupes, la marque, la recherche ; choisir telecharge, et la marque disparait', async () => {
    const s = await navigateur.ouvrir({ naviguer: false, largeur: 1280, hauteur: 900 });
    const requetes = await preparer(s);
    const page = await editeurTexte(s);
    const zone = inspecteur(page);
    await ouvrirPolices(zone);
    // Le catalogue arrive (une annexe : ici l'index d'essai), puis les groupes dans leur ordre.
    await listePolices(zone).locator('[data-groupe="catalogue"]').waitFor();
    expect(await titresGroupes(zone)).toEqual(['Police actuelle', 'Livrées avec l’éditeur', 'Trait unique (stylo)', 'Toutes les polices']);
    expect(await champPolice(zone).getAttribute('aria-expanded')).toBe('true');

    // Une livree : sans marque ; une du catalogue : l'icone et « à télécharger » dans son nom accessible.
    const inter = listePolices(zone).locator('[data-groupe="livrees"] [data-police="inter"]');
    expect(await inter.getAttribute('data-etat')).toBe('locale');
    expect(await nomAccessible(inter)).not.toMatch(/télécharger/);
    const essai = optionPolice(zone, ID_ESSAI);
    await essai.scrollIntoViewIfNeeded();
    expect(await essai.getAttribute('data-etat')).toBe('a-telecharger');
    expect(await nomAccessible(essai)).toBe('Police Essai, Google Fonts, à télécharger');
    expect(await essai.locator('.police-dispo svg').count()).toBe(1);
    // Lobster est livree : le catalogue n'en a pas de seconde ligne.
    expect(await options(zone).filter({ hasText: 'Lobster' }).count()).toBe(1);
    // Plus de quatre cents familles : le catalogue se fenetre (ADR-0008).
    expect(await listePolices(zone).locator('[data-groupe="catalogue"] [role="option"]').count()).toBeLessThan(120);
    expect(await texteDe(page.locator('.liste-polices-pied'))).toContain('À télécharger quand vous la choisissez.');

    // Taper filtre : casse et accents ignores, un nom qui commence par le mot d'abord ; les raccourcis se retirent.
    await page.keyboard.type('fete');
    await attend(() => options(zone).count()).toBe(1);
    expect(await nomAccessible(options(zone).first())).toMatch(/^Fête Essai/);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('essai');
    await attend(() => options(zone).count()).toBe(3);
    expect(await options(zone).evaluateAll(os => os.map(o => (o.getAttribute('aria-label') ?? '').split(',')[0]))).toEqual(['Essai Faux', 'Fête Essai', 'Police Essai']);
    expect(await titresGroupes(zone)).toEqual(['Toutes les polices']);
    // Ouvrir, parcourir, chercher : aucune requete.
    await listePolices(zone).evaluate(l => { l.scrollTop = l.scrollHeight; });
    expect(requetes).toEqual([]);

    // Choisir la police marquee : elle se telecharge (une requete), se pose, et la marque disparait.
    await optionPolice(zone, ID_ESSAI).click();
    await attend(() => valeurPolice(zone)).toBe(ID_ESSAI);
    expect(requetes.map(r => new URL(r.url()).hostname)).toEqual(['cdn.jsdelivr.net']);
    expect(await champPolice(zone).inputValue()).toBe('Police Essai');
    await ouvrirPolices(zone);
    const choisie = listePolices(zone).locator('[data-groupe="courante"] [role="option"]');
    expect(await choisie.getAttribute('data-police')).toBe(ID_ESSAI);
    expect(await choisie.getAttribute('aria-selected')).toBe('true');
    expect(await choisie.getAttribute('data-etat')).toBe('locale');
    expect(await nomAccessible(choisie)).not.toMatch(/télécharger/);
    // Elle est aussi dans les recentes, sans marque.
    expect(await titresGroupes(zone)).toContain('Récentes');

    // Une empreinte fausse : refusee, et dite sous le champ.
    await page.keyboard.type('faux');
    await attend(() => options(zone).count()).toBe(1);
    await page.keyboard.press('Enter');
    const alerte = zone.locator('.liste-polices-etat[role="alert"]');
    await alerte.waitFor();
    expect(await alerte.innerText()).toMatch(/^Essai Faux : .*empreinte attendue/);
    expect(await valeurPolice(zone)).toBe(ID_ESSAI);
  });

  it('depuis la barre de texte, tout au clavier : fleches, Page, Debut, Fin, Entree, Echap, Tab', async () => {
    const s = await navigateur.ouvrir({ naviguer: false, largeur: 1280, hauteur: 900 });
    const requetes = await preparer(s);
    const page = await editeurTexte(s);
    const zone = barre(page);
    const champ = champPolice(zone);
    await champ.waitFor({ timeout: 30_000 });
    await champ.focus();
    // La fleche ouvre, sur la police actuelle.
    await page.keyboard.press('ArrowDown');
    await listePolices(zone).waitFor();
    const lireActif = async (attribut: string) => {
      const id = await champ.getAttribute('aria-activedescendant');
      return id ? page.evaluate(([i, a]) => document.getElementById(i)?.getAttribute(a) ?? '', [id, attribut] as const) : '';
    };
    const actif = () => lireActif('data-police'), nomActif = () => lireActif('aria-label');
    await attend(actif).toBe('inter');
    await listePolices(zone).locator('[data-groupe="catalogue"]').waitFor();
    await page.keyboard.press('ArrowDown');
    await attend(actif).toBe('inter');
    expect(await page.evaluate(() => document.querySelector('[aria-activedescendant]')?.getAttribute('aria-activedescendant'))).toMatch(/-o1$/);
    // Fin : la derniere famille du catalogue, dessinee meme loin dans la liste fenetree, et visible.
    await page.keyboard.press('End');
    await attend(nomActif).toMatch(/^Série 399/);
    // La ligne active est dessinee et visible dans la liste qui defile.
    expect(await page.evaluate(() => {
      const id = document.querySelector('[aria-activedescendant]')?.getAttribute('aria-activedescendant') ?? '';
      const l = document.getElementById(id), r = l?.closest('[role="listbox"]');
      if (!l || !r) return false;
      const a = l.getBoundingClientRect(), b = r.getBoundingClientRect();
      return a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
    })).toBe(true);
    // Page haut recule de plusieurs lignes ; Debut revient a la police actuelle.
    await page.keyboard.press('PageUp');
    await attend(nomActif).toMatch(/^Série 3[89]\d/);
    await page.keyboard.press('Home');
    await attend(actif).toBe('inter');
    await page.keyboard.press('PageDown');
    expect(await actif()).not.toBe('inter');
    // Echap ferme sans rien changer, le focus reste au champ.
    await page.keyboard.press('Escape');
    await attend(() => champ.getAttribute('aria-expanded')).toBe('false');
    expect(await valeurPolice(zone)).toBe('inter');
    expect(await aLeFocus(champ)).toBe(true);
    // Taper ouvre et filtre ; Entree choisit la premiere ligne ; le focus reste au champ.
    await page.keyboard.type('lob');
    await attend(() => options(zone).count()).toBe(1);
    await page.keyboard.press('Enter');
    await attend(() => valeurPolice(zone)).toBe('lobster');
    expect(await champ.getAttribute('aria-expanded')).toBe('false');
    expect(await aLeFocus(champ)).toBe(true);
    // Tab ne retient pas le focus : la liste ouverte se ferme ou passe la main au lien de son pied, puis plus loin.
    await page.keyboard.press('ArrowDown');
    await listePolices(zone).waitFor();
    await page.keyboard.press('Tab');
    await attend(() => page.evaluate(() => document.activeElement?.textContent ?? '')).toBe('Filtrer par genre, tracé ou source…');
    // Maj+Tab revient au champ, la liste reste ouverte ; Echap sur le lien ferme et rend le champ.
    await page.keyboard.press('Shift+Tab');
    await attend(() => aLeFocus(champ)).toBe(true);
    expect(await champ.getAttribute('aria-expanded')).toBe('true');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await attend(() => champ.getAttribute('aria-expanded')).toBe('false');
    expect(await aLeFocus(champ)).toBe(true);
    // Puis Tab depuis le lien va au controle qui suit le champ (Lobster n'a pas de style : « Toutes les polices »).
    await page.keyboard.press('ArrowDown');
    await listePolices(zone).waitFor();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await attend(() => champ.getAttribute('aria-expanded')).toBe('false');
    expect(await page.evaluate(() => document.activeElement?.textContent ?? '')).toBe('Toutes les polices');
    expect(requetes).toEqual([]);
  });

  it('dans la barre, la liste s ouvre plus large que le champ compact, sans deborder de l ecran', async () => {
    const s = await navigateur.ouvrir({ naviguer: false, largeur: 1000, hauteur: 800 });
    await preparer(s);
    const page = await editeurTexte(s);
    const zone = barre(page);
    await ouvrirPolices(zone);
    const champ = await champPolice(zone).boundingBox();
    const liste = await page.locator('.liste-polices-flottant').boundingBox();
    expect(champ && liste).toBeTruthy();
    if (!champ || !liste) return;
    expect(liste.width).toBeGreaterThan(champ.width);
    expect(liste.x).toBeGreaterThanOrEqual(0);
    expect(liste.x + liste.width).toBeLessThanOrEqual(1000);
    expect(liste.y).toBeGreaterThanOrEqual(champ.y + champ.height);
  });

  it('au doigt sur 390 px : une feuille de toute la largeur, des lignes de 40 px, choisir au toucher', async () => {
    const s = await navigateur.ouvrir({ naviguer: false, largeur: 390, hauteur: 844, tactile: true });
    const requetes = await preparer(s);
    const page = await editeurTexte(s, true);
    const zone = barre(page);
    await ouvrirPolices(zone, true);
    const feuille = page.locator('.liste-polices-flottant');
    await attendreAnimations(page);
    expect(await feuille.getAttribute('class')).toContain('feuille');
    const r = await feuille.boundingBox();
    expect(r?.x).toBe(0);
    expect(r?.width).toBe(390);
    await listePolices(zone).locator('[data-groupe="catalogue"]').waitFor();
    const hauteurs = await options(zone).evaluateAll(os => os.slice(0, 12).map(o => o.getBoundingClientRect().height));
    expect(Math.min(...hauteurs)).toBeGreaterThanOrEqual(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(requetes).toEqual([]);
    await optionPolice(zone, 'caveat').tap();
    await attend(() => valeurPolice(zone)).toBe('caveat');
    expect(await feuille.count()).toBe(0);
  });

  it('s ouvre vite sur le vrai catalogue (plus de deux mille polices) et ne dessine qu une poignee de lignes', async () => {
    const s = await navigateur.ouvrir({ largeur: 1280, hauteur: 900 });
    const page = s.page;
    await ouvrirCode(page, PLAN);
    await page.keyboard.press('t');
    const zone = inspecteur(page);
    await champPolice(zone).waitFor({ timeout: 30_000 });
    // Une premiere ouverture charge l'index et les apercus (des annexes voisines) ; on mesure les suivantes.
    await ouvrirPolices(zone);
    await attend(() => texteDe(page.locator('.liste-polices-pied p').first())).toMatch(/^2\s?\d{3} polices$/);
    await page.keyboard.press('Escape');
    const mesures: number[] = [];
    for (let i = 0; i < 5; i++) {
      const ms = await page.evaluate(async () => {
        const champ = document.querySelector<HTMLInputElement>('.editeur-inspecteur [role="combobox"]');
        if (!champ) return -1;
        const t0 = performance.now();
        champ.click();
        // Le temps jusqu'a la premiere image ou la liste est dessinee, lignes du catalogue comprises.
        await new Promise<void>(r => { const voir = () => (document.querySelector('[role="listbox"] [data-groupe="catalogue"] [role="option"]') ? r() : requestAnimationFrame(voir)); voir(); });
        const t = performance.now() - t0;
        champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return t;
      });
      await attend(() => champPolice(zone).getAttribute('aria-expanded')).toBe('false');
      mesures.push(ms);
    }
    const triees = [...mesures].sort((a, b) => a - b), mediane = triees[2] ?? 0;
    console.log('ouverture de la liste des polices (ms) : ' + mesures.map(m => m.toFixed(1)).join(', ') + ' ; mediane ' + mediane.toFixed(1));
    expect(mediane).toBeGreaterThan(0);
    expect(mediane).toBeLessThan(400);
    await ouvrirPolices(zone);
    expect(await options(zone).count()).toBeLessThan(100);
  });
});

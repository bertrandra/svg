// La preuve en navigateur (docs/securite.md) : chaque fichier du corpus hostile (tests/fixtures/hostile) entre par les vraies
// portes de la page (code colle, fichier depose, option `svg` de l'embarquement, bibliotheque d'un hote), dans le pire cas
// (aucune CSP), avec un fil de detente : `window.__pwn`, alert / prompt / confirm / fetch / XMLHttpRequest / sendBeacon /
// WebSocket / EventSource / window.open / Image sont surveilles, et toute requete autre que les annexes de la page echoue.
// Ce qui ressort (SVG, PNG, PDF) est ensuite rouvert de trois facons : comme <img>, en ligne dans une page HTML, et comme
// document de premier niveau, la seule ou un script d'un SVG s'execute pour de bon.

import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Download, Page } from 'playwright';
import { attend, BUNDLE_EMBARQUE, deposerFichier, ouvrirMenu, pilote, RACINE_DEPOT, type Session, terminer, URL_INTEGRATION } from './aide.js';
import { violationsEcriture, violationsNettoyage } from '../unit/securite/invariants.js';
import { passer } from '../unit/securite/passage.js';

const DOSSIER = resolve(RACINE_DEPOT, 'tests/fixtures/hostile');
/**
 * `attendu` est l'issue de la lecture pure a plat (et de l'embarquement sans polices, qui lit a plat) ; `attenduRiche`, quand il
 * differe, celle de la lecture riche, le defaut de la page depuis la bascule (ADR-0012, etape 14) ; `attenduPage`, quand il differe,
 * celle de la page, qui met le texte en lettres avec ses fontes (ADR-0020) : un fichier hostile qui porte du texte s'y ouvre, et ses
 * invariants (aucun script, aucune requete, exports inertes) sont alors verifies comme pour tout fichier ouvert.
 */
interface Ligne { fichier: string; famille: string; vecteur: string; attendu: 'ouvre' | 'refus'; attenduRiche?: 'ouvre' | 'refus'; attenduPage?: 'ouvre' | 'refus' }
/** L'issue attendue d'un fichier dans la page, qui lit en riche. */
const attenduDansLaPage = (l: Ligne): 'ouvre' | 'refus' => l.attenduPage ?? l.attenduRiche ?? l.attendu;
const index = JSON.parse(readFileSync(resolve(DOSSIER, 'index.json'), 'utf8')) as { fichiers: Ligne[] };
const octetsDe = (nom: string): Buffer => readFileSync(resolve(DOSSIER, nom));
/** Le texte comme la page le lit : `File.text()` decode en UTF-8 et retire la marque d'ordre des octets. */
const texteDe = (nom: string): string => new TextDecoder('utf-8').decode(octetsDe(nom));

/**
 * Les fichiers dont le texte depend du decodage : Chromium lit un fichier UTF-16 a BOM par `File.text()` la ou Node (et la
 * spec, « UTF-8 decode ») en fait du texte entrecoupe de zeros. L'issue peut donc differer ; les invariants, eux, restent verifies.
 */
const DECODAGE_DU_NAVIGATEUR = new Set(['encodage-utf16.svg']);

/** Les adresses que la page a le droit de demander : ses propres fichiers (la page, ses annexes, le bundle) et rien d'autre. */
const AUTORISEES = [pathToFileURL(resolve(RACINE_DEPOT, 'dist')).href + '/', pathToFileURL(resolve(RACINE_DEPOT, 'exemples')).href + '/'];

/** Pose les crochets avant tout script de la page : un appel dangereux est consigne dans `window.__appels`, il ne part pas. */
const CROCHETS = `(() => {
  const appels = [];
  Object.defineProperty(window, '__appels', { value: appels });
  let pwn;
  Object.defineProperty(window, '__pwn', { configurable: true, get: () => pwn, set: v => { pwn = v; appels.push('__pwn=' + String(v)); } });
  for (const n of ['alert', 'prompt', 'confirm']) window[n] = () => { appels.push(n); return n === 'confirm' ? true : null; };
  window.fetch = (...a) => { appels.push('fetch ' + String(a[0])); return Promise.reject(new TypeError('bloque par le test')); };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { appels.push('xhr ' + String(u)); return open.apply(this, arguments); };
  navigator.sendBeacon = u => { appels.push('sendBeacon ' + String(u)); return false; };
  for (const n of ['WebSocket', 'EventSource']) { if (window[n]) window[n] = function (u) { appels.push(n + ' ' + String(u)); throw new Error('bloque par le test'); }; }
  window.open = u => { appels.push('open ' + String(u)); return null; };
  const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (d && d.set) Object.defineProperty(HTMLImageElement.prototype, 'src', { ...d, set(v) { if (!/^(data|blob):/i.test(String(v))) appels.push('Image.src ' + String(v)); d.set.call(this, v); } });
})();`;

interface Surveillance {
  requetes: string[];
  dialogues: string[];
  /** Ce que les crochets ont consigne dans la page. */
  appels(): Promise<string[]>;
  /** Autorise une adresse de plus (un fichier ecrit par le test). */
  autoriser(url: string): void;
  /** Echoue s'il y a eu un appel, une requete ou un dialogue. */
  verifier(quand: string): Promise<void>;
  surveiller(page: Page): void;
}

/** Surveille toutes les pages d'une session (y compris celles que le test ouvre ensuite). */
async function surveiller(s: Session): Promise<Surveillance> {
  await s.contexte.addInitScript(CROCHETS);
  // Aucun reseau : la page embarque ses polices (data:), elle n'a rien a demander a un hote. Tout http(s) est coupe, et la requete
  // est consignee ci-dessous : la preuve est « aucune requete du tout », sans l'exception que les polices de Google exigeaient.
  await s.contexte.route(url => !/^(?:file|data|blob|about):$/.test(url.protocol), route => route.abort());
  const autorisees = [...AUTORISEES];
  const pages = new Set<Page>();
  const r: Surveillance = {
    requetes: [], dialogues: [],
    appels: async () => (await Promise.all([...pages].map(p => p.evaluate(() => (window as unknown as { __appels?: string[] }).__appels ?? []).catch(() => [] as string[])))).flat(),
    autoriser: url => { autorisees.push(url); },
    surveiller: page => {
      if (pages.has(page)) return;
      pages.add(page);
      page.on('request', req => {
        const u = req.url();
        if (/^(data|blob|about):/i.test(u) || u === page.url()) return;
        if (!autorisees.some(a => u === a.replace(/\/$/, '') || u.startsWith(a))) r.requetes.push(u);
      });
      page.on('dialog', d => { r.dialogues.push(d.type() + ' ' + d.message().slice(0, 80)); void d.dismiss(); });
    },
    verifier: async quand => {
      const appels = await r.appels();
      expect({ quand, appels, requetes: r.requetes, dialogues: r.dialogues }).toEqual({ quand, appels: [], requetes: [], dialogues: [] });
    }
  };
  r.surveiller(s.page);
  s.contexte.on('page', p => r.surveiller(p));
  return r;
}

/** Vrai quand `recu` est `texte` prive de quelques caracteres de controle C0 (ni tabulation, ni fin de ligne), et de rien d'autre. */
function sansQueDesControles(texte: string, recu: string): boolean {
  let j = 0;
  for (const c of texte) {
    if (recu.startsWith(c, j)) j += c.length;
    else if (!(c.charCodeAt(0) < 0x20 && c !== '\t' && c !== '\n' && c !== '\r')) return false;
  }
  return j === recu.length;
}

/** Les defauts d'un PDF produit par la page : aucune action, aucun script, aucun lien, aucun fichier joint. */
function defautsPdf(octets: Buffer): string[] {
  const texte = octets.toString('latin1');
  const d = ['/JavaScript', '/JS', '/OpenAction', '/AA', '/Launch', '/URI', '/EmbeddedFile', '/SubmitForm', '/RichMedia', '/GoToR', '/ImportData'].filter(m => new RegExp(m.replace('/', '\\/') + '(?![A-Za-z])').test(texte));
  return texte.startsWith('%PDF-') ? d : ['pas un PDF'];
}

/** Les dimensions d'un PNG (bloc IHDR), ou null si ce n'en est pas un. */
function dimensionsPng(octets: Buffer): [number, number] | null {
  return octets.length > 24 && octets.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? [octets.readUInt32BE(16), octets.readUInt32BE(20)] : null;
}

describe('securite : le corpus hostile entre par la page', () => {
  const navigateur = pilote();
  const dossier = mkdtempSync(resolve(tmpdir(), 'svg-securite-'));
  let compteur = 0;

  async function session() {
    const s = await navigateur.ouvrir({ naviguer: false });
    const garde = await surveiller(s);
    await s.page.goto(pathToFileURL(resolve(RACINE_DEPOT, 'dist/editeur-svg.html')).href);
    return { ...s, garde };
  }

  /** Attend que la page ait ouvert l'editeur ou dise pourquoi elle ne l'ouvre pas ; rend ce qu'elle a fait. */
  async function issue(page: Page): Promise<'ouvre' | 'refus'> {
    const editeur = page.locator('.editeur-cadre'), message = page.locator('p.message[role=alert]');
    await Promise.race([editeur.waitFor({ timeout: 30_000 }), message.waitFor({ timeout: 30_000 })]);
    return (await editeur.count()) > 0 ? 'ouvre' : 'refus';
  }

  /**
   * Colle le texte et rend ce que la page en a fait, avec le texte que la zone de saisie lui a vraiment remis : Firefox retire
   * des caracteres de controle (au moins U+0000) de ce qu'on tape dans un <textarea> (lu en CI : les deux fichiers du corpus
   * qui en portent s'y ouvraient au lieu d'etre refuses), si bien que ces octets-la ne peuvent pas entrer par cette porte.
   */
  async function coller(page: Page, texte: string): Promise<{ issue: 'ouvre' | 'refus'; recu: string }> {
    const zone = page.locator('section[aria-label="Ouvrir un SVG ou un PDF"] textarea');
    await zone.fill(texte);
    const recu = await zone.inputValue();
    await page.getByRole('button', { name: 'Ouvrir ce code' }).click();
    return { issue: await issue(page), recu };
  }

  async function deposer(page: Page, octets: Buffer, nom: string): Promise<'ouvre' | 'refus'> {
    await deposerFichier(page, octets, nom, 'image/svg+xml');
    return issue(page);
  }

  async function telecharger(page: Page, action: () => Promise<void>): Promise<Buffer> {
    const [t]: [Download, void] = await Promise.all([page.waitForEvent('download'), action()]);
    return readFileSync(await t.path());
  }

  /** Rouvre un SVG exporte de trois facons, sur des pages surveillees, et verifie que rien ne s'est execute ni demande. */
  async function rouvrir(s: Session & { garde: Surveillance }, svg: Buffer, nom: string): Promise<void> {
    const texte = new TextDecoder('utf-8').decode(svg);
    // 1. comme <img> (data:) : jamais de script, jamais de requete.
    const img = await s.contexte.newPage();
    await img.setContent('<!doctype html><body></body>');
    const charge = await img.evaluate(async src => new Promise<boolean>(ok => { const i = new Image(); i.onload = () => ok(true); i.onerror = () => ok(false); i.src = src; document.body.append(i); }), 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(texte));
    expect(typeof charge).toBe('boolean');
    // 2. en ligne, par le HTML (le pire pour un SVG mal assaini : mutation, elements qui sortent de l'espace SVG) et par un analyseur XML.
    const analyse = await img.evaluate(t => {
      document.body.innerHTML = t;
      const doc = new DOMParser().parseFromString(t, 'image/svg+xml');
      const erreur = doc.querySelector('parsererror');
      if (!erreur) document.body.append(document.importNode(doc.documentElement, true));
      return { erreurXml: erreur ? (erreur.textContent ?? '').slice(0, 120) : null, scripts: document.querySelectorAll('script, iframe, object, embed, foreignObject').length };
    }, texte);
    expect(analyse.scripts, nom + ' : un element actif en ligne').toBe(0);
    expect(analyse.erreurXml, nom + ' : un analyseur XML refuse la sortie').toBeNull();
    await img.waitForTimeout(150);
    await img.close();
    // 3. comme document de premier niveau : la seule voie ou un <script> d'un SVG tourne vraiment.
    const fichier = resolve(dossier, 'sortie-' + ++compteur + '.svg');
    writeFileSync(fichier, svg);
    s.garde.autoriser(pathToFileURL(fichier).href);
    const haut = await s.contexte.newPage();
    await haut.goto(pathToFileURL(fichier).href);
    await haut.waitForTimeout(150);
    expect(await haut.evaluate(() => document.documentElement.localName), nom + ' : le document de premier niveau').toBe('svg');
    await haut.close();
  }

  /** Ce qui sort de l'accueil apres l'ouverture : le SVG tel qu'on le telecharge sans rien editer, puis apres « Enregistrer ». */
  async function sorties(s: Session & { garde: Surveillance }, nom: string, complet: boolean): Promise<void> {
    const { page } = s;
    // Sans rien editer : l'editeur se ferme, l'accueil montre le dessin nettoye et ses exports.
    await ouvrirMenu(page, 'Fichier');
    await page.getByRole('menuitem', { name: /Fermer l’éditeur/ }).click();
    await page.locator('.resultat').waitFor();
    // « Télécharger le SVG » de la fiche : le bouton « SVG » d'hier, devenu l'action primaire (memes octets).
    const brut = await telecharger(page, () => page.locator('.resultat').getByRole('button', { name: 'Télécharger le SVG' }).click());
    expect(violationsNettoyage(brut.toString('utf8')), nom + ' : SVG telecharge sans edition').toEqual([]);
    await rouvrir(s, brut, nom);
    if (!complet) return;
    // Apres « Terminer » : l'ecriture, regeneree depuis le modele (riche, celui de la page), et ses trois formats. Sans modification, « Terminer » ne
    // reecrit rien (la fiche garde le fichier tel qu'il est venu ; Ctrl+S ne garde qu'un brouillon) : un changement de machine, qui ne
    // touche pas au dessin, suffit a ce que le dessin soit rendu, reecrit et nettoye, comme le faisait Ctrl+S.
    await page.getByRole('button', { name: 'Reprendre l’édition' }).click();
    await page.locator('.editeur-cadre').waitFor();
    await page.locator('.selecteur-contexte .menu-bouton').click();
    await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
    await terminer(page);
    const svg = await telecharger(page, () => page.locator('.resultat').getByRole('button', { name: 'Télécharger le SVG' }).click());
    expect(violationsEcriture(svg.toString('utf8')), nom + ' : SVG enregistre').toEqual([]);
    await rouvrir(s, svg, nom);
    await ouvrirMenu(page, 'Autres formats');
    const png = await telecharger(page, () => page.locator('.menu-panneau .contenu-export button', { hasText: /^PNG$/ }).click());
    const dims = dimensionsPng(png);
    expect(dims, nom + ' : PNG').not.toBeNull();
    expect(Math.max(...(dims ?? [0]))).toBeLessThan(20_000);
    const pdf = await telecharger(page, () => page.locator('.menu-panneau .contenu-export button', { hasText: 'PDF vectoriel' }).click());
    expect(defautsPdf(pdf), nom + ' : PDF').toEqual([]);
  }

  // L'export sans edition (le SVG nettoye, seul chemin ou le texte d'origine ressort) est rouvert pour chaque fichier qui s'ouvre ; l'ecriture apres
  // « Enregistrer » et les exports PNG et PDF le sont pour le premier fichier de chaque famille et un sur cinq (une seconde chacun).
  const familles = new Set<string>();
  const complets = new Set(index.fichiers.filter((f, i) => { const premier = !familles.has(f.famille); familles.add(f.famille); return premier || i % 5 === 0; }).map(f => f.fichier));

  for (const l of index.fichiers) {
    it(l.fichier + ' : code colle, puis exports rouverts', async () => {
      const s = await session();
      const texte = texteDe(l.fichier);
      const { issue: issueCode, recu } = await coller(s.page, texte);
      // HTML ramene les fins de ligne d'un <textarea> a LF ; Chromium garde pourtant CR dans la valeur lue (constate). Ni l'un ni
      // l'autre n'est un changement du texte.
      const ramene = texte.replace(/\r\n?/g, '\n');
      if (recu === texte || recu === ramene) expect(issueCode, l.vecteur).toBe(attenduDansLaPage(l));
      else {
        // Le navigateur a change le texte avant la page : seul le retrait de caracteres de controle est admis, et la page doit
        // faire du texte recu exactement ce qu'en fait le moteur, sans rompre un invariant. Le vecteur d'origine, octets exacts,
        // passe toujours par le fichier depose (test suivant), qui garde son issue attendue dans tous les moteurs.
        expect(sansQueDesControles(recu.includes('\r') ? texte : ramene, recu), l.fichier + ' : la zone de texte a change autre chose que des caracteres de controle').toBe(true);
        const moteur = passer(recu, undefined, false, 'riche');
        expect(moteur.defauts, l.fichier + ' : texte recu par la zone de saisie').toEqual([]);
        expect(issueCode, l.vecteur + ' (texte recu par la zone de saisie)').toBe(moteur.ouvre ? 'ouvre' : 'refus');
      }
      await s.garde.verifier('apres ouverture');
      if (issueCode === 'ouvre') { await sorties(s, l.fichier, complets.has(l.fichier)); await s.garde.verifier('apres exports'); }
    }, 120_000);

    it(l.fichier + ' : fichier depose', async () => {
      const s = await session();
      const issueDepot = await deposer(s.page, octetsDe(l.fichier), l.fichier);
      if (!DECODAGE_DU_NAVIGATEUR.has(l.fichier)) expect(issueDepot, l.vecteur).toBe(attenduDansLaPage(l));
      await s.garde.verifier('apres depot');
    }, 120_000);
  }

  it('un fichier choisi par le selecteur de fichiers passe par la meme porte (octets exacts, UTF-16 compris)', async () => {
    for (const nom of ['encodage-utf16.svg', 'encodage-utf8-invalide.svg', 'script-balise.svg']) {
      const s = await session();
      await s.page.locator('section[aria-label="Ouvrir un SVG ou un PDF"] input[type=file]').setInputFiles({ name: nom, mimeType: 'image/svg+xml', buffer: octetsDe(nom) });
      const sortie = await issue(s.page);
      const ligne = index.fichiers.find(f => f.fichier === nom);
      if (!DECODAGE_DU_NAVIGATEUR.has(nom) && ligne) expect(sortie, nom).toBe(attenduDansLaPage(ligne));
      await s.garde.verifier(nom);
    }
  });

  it('l\'exemple et le corpus ne laissent rien dans le stockage au-dela du brouillon', async () => {
    const s = await session();
    await coller(s.page, texteDe('script-balise.svg'));
    const cles = await s.page.evaluate(() => Object.keys(localStorage));
    expect(cles.filter(c => !['svg.brouillon', 'svg.versions', 'svg.corrections'].includes(c))).toEqual([]);
    const brouillon = await s.page.evaluate(() => localStorage.getItem('svg.brouillon'));
    if (brouillon) expect(violationsNettoyage((JSON.parse(brouillon) as { svg: string }).svg)).toEqual([]);
  });
});

describe('securite : l\'option svg de l\'embarquement', () => {
  const navigateur = pilote();

  beforeAll(() => {
    if (!existsSync(BUNDLE_EMBARQUE)) throw new Error('dist/editeur-svg-embarque.js manque : lancer `npm run construire` avant `npm run e2e`.');
  });

  async function hote() {
    const s = await navigateur.ouvrir({ naviguer: false });
    const garde = await surveiller(s);
    await s.page.goto(URL_INTEGRATION);
    return { ...s, garde };
  }

  for (const l of index.fichiers) {
    it(l.fichier + ' : ouvrir({ svg }) puis Enregistrer rend un SVG inerte', async () => {
      const s = await hote();
      const texte = texteDe(l.fichier);
      const issue = await s.page.evaluate(async svg => {
        interface Hote { EditeurSvg: { ouvrir(o: Record<string, unknown>): unknown; estEditable(v: unknown): boolean }; __recu?: string[] }
        const w = window as unknown as Hote;
        w.__recu = [];
        let erreur = '';
        try { w.EditeurSvg.ouvrir({ svg, onEnregistrer: (s: string) => { w.__recu?.push(s); } }); } catch (e) { erreur = String(e); }
        if (erreur) return 'leve ' + erreur;
        for (let i = 0; i < 600; i++) {
          if (document.querySelector('.editeur-svg .editeur-cadre')) return 'ouvre';
          if (document.querySelector('.editeur-svg .editeur-erreur')) return 'refus';
          await new Promise(r => setTimeout(r, 50));
        }
        return 'rien';
      }, texte);
      // Un refus de l'embarquement lit le texte brut (sans le nettoyage de la page) : il peut refuser ce que la page ouvre, jamais l'inverse en danger.
      expect(['ouvre', 'refus'], l.vecteur).toContain(issue);
      if (issue === 'ouvre') {
        // « Enregistrer » ne rend qu'un dessin qui a change (Ctrl+S ne garde qu'un brouillon) : un changement de machine, qui ne touche
        // pas au dessin, le permet ; le SVG rendu porte alors la marque du contexte, admise par les invariants sur la racine seule.
        await s.page.locator('.selecteur-contexte .menu-bouton').click();
        await s.page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
        await s.page.locator('.editeur-barre .groupe.fin button.primaire').click();
        await attend(() => s.page.evaluate(() => (window as unknown as { __recu: string[] }).__recu.length)).toBe(1);
        const recu = await s.page.evaluate(() => (window as unknown as { __recu: string[] }).__recu[0] ?? '');
        expect(violationsEcriture(recu), l.fichier).toEqual([]);
      }
      await s.garde.verifier(l.fichier);
    }, 120_000);
  }

  it('une bibliotheque d\'hote pleine de SVG hostiles : vignettes inertes, insertion lue par le moteur a plat', async () => {
    const s = await hote();
    const entrees = index.fichiers.filter(f => f.attendu === 'ouvre').slice(0, 24).map((f, i) => ({ id: 'hostile-' + i, nom: f.fichier.replace(/\.svg$/, ''), evenements: ['x'], svg: texteDe(f.fichier) }));
    await s.page.evaluate(async ([svg, lib]) => {
      const w = window as unknown as { EditeurSvg: { ouvrir(o: Record<string, unknown>): unknown } };
      w.EditeurSvg.ouvrir({ svg: String(svg), onEnregistrer: () => undefined, baseAnnexes: '../dist', bibliotheque: { source: 'test', licence: 'test', url: 'https://exemple.invalid', evenements: [{ id: 'x', nom: 'X', famille: 'categorie', mots: ['x'] }], entrees: lib } });
    }, [index.fichiers.find(f => f.fichier === 'xml-doctype-svg-legitime.svg') ? texteDe('xml-doctype-svg-legitime.svg') : '<svg/>', entrees] as const);
    await s.page.locator('.editeur-cadre').waitFor();
    await s.page.locator('.editeur-inspecteur .section > summary', { hasText: 'Bibliothèque de formes' }).click();
    await s.page.locator('.editeur-inspecteur .vignette').first().waitFor();
    expect(await s.page.locator('.editeur-inspecteur .vignette').count()).toBeGreaterThan(0);
    expect(await s.page.locator('.editeur-inspecteur .vignette img[src^="data:"]').count()).toBeGreaterThan(0);
    // Des vignettes sont des <img> en data: ; en inserer une passe par le moteur a plat, jamais par le DOM.
    const avant = await s.page.locator('.editeur-svg-toile path[data-id]').count();
    await s.page.locator('.editeur-inspecteur .vignette').first().click();
    await attend(() => s.page.locator('.editeur-svg-toile path[data-id]').count()).toBeGreaterThan(avant);
    expect(await s.page.locator('.editeur-svg-toile script, .editeur-svg-toile foreignObject, .editeur-svg-toile [onclick], .editeur-svg-toile [onload]').count()).toBe(0);
    await s.garde.verifier('bibliotheque');
  });

  it('refuse des options qui ne conviennent pas, en francais, sans rien ouvrir', async () => {
    const s = await hote();
    const erreurs = await s.page.evaluate(() => {
      const w = window as unknown as { EditeurSvg: { ouvrir(o: Record<string, unknown>): unknown } };
      const essai = (o: Record<string, unknown>): string => { try { w.EditeurSvg.ouvrir(o); return 'ouvert'; } catch (e) { return String(e); } };
      const ok = (): void => undefined;
      return [
        essai({ svg: '<svg/>', onEnregistrer: ok, baseAnnexes: 'javascript:window.__pwn=1//' }),
        essai({ svg: '<svg/>', onEnregistrer: ok, baseAnnexes: 'data:text/javascript,window.__pwn=1//' }),
        essai({ svg: '<svg/>', onEnregistrer: ok, bibliotheque: { entrees: 'x' } }),
        essai({ svg: '<svg/>', onEnregistrer: ok, titre: 'x'.repeat(600) })
      ];
    });
    for (const e of erreurs) expect(e).toMatch(/TypeError: EditeurSvg\.ouvrir : L’option/);
    expect(await s.page.locator('.editeur-svg').count()).toBe(0);
    await s.garde.verifier('options');
  });
});

describe('securite : un stockage empoisonne ne plante rien et ne pollue rien', () => {
  const navigateur = pilote();

  const POISONS: ReadonlyArray<readonly [string, Record<string, string>]> = [
    ['types faux', { 'svg.brouillon': '{"nom":{"a":1},"svg":5,"quand":"hier"}', 'svg.versions': '{"length":3}', 'svg.corrections': '[1,2,3]' }],
    ['liste a la place d\'un objet', { 'svg.brouillon': '[]', 'svg.versions': '"texte"', 'svg.corrections': '5' }],
    ['cles de prototype', { 'svg.brouillon': '{"__proto__":{"pollue":1},"nom":"a","svg":"<svg/>","quand":1}', 'svg.versions': '[{"__proto__":{"pollue":2},"id":"v1","nom":"a","svg":"<svg/>","quand":1,"constructor":{"prototype":{"pollue":3}}}]', 'svg.corrections': '{"__proto__":{"nom":"x","pollue":4},"constructor":{"nom":"y"}}' }],
    ['versions mal formees', { 'svg.versions': '[null,5,{"id":1},{"id":"a","nom":["x"],"svg":{},"quand":1},{"id":"a","nom":"n","svg":"<svg/>","quand":1}]' }],
    ['brouillon hostile', { 'svg.brouillon': JSON.stringify({ nom: '<img src=x onerror=window.__pwn=1>', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="window.__pwn=1"><script>window.__pwn=1</script><rect width="5" height="5"/></svg>', quand: 1 }) }],
    ['JSON illisible', { 'svg.brouillon': '{"nom":', 'svg.versions': '[[[[[[[[[[[[[[[[[[[[[[', 'svg.corrections': '\u0000\u0001' }],
    ['valeurs enormes', { 'svg.brouillon': JSON.stringify({ nom: 'n'.repeat(300_000), svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>', quand: 1 }), 'svg.versions': JSON.stringify(Array.from({ length: 400 }, (_, i) => ({ id: 'v' + i, nom: 'x'.repeat(2000), svg: '<svg/>', quand: i }))) }]
  ];

  for (const [nom, valeurs] of POISONS) {
    it('stockage empoisonne (' + nom + ') : l\'accueil et l\'editeur s\'ouvrent', async () => {
      const s = await navigateur.ouvrir({ naviguer: false });
      const garde = await surveiller(s);
      await s.contexte.addInitScript(v => { for (const [k, x] of Object.entries(v)) localStorage.setItem(k, x); }, valeurs);
      await s.page.goto(pathToFileURL(resolve(RACINE_DEPOT, 'dist/editeur-svg.html')).href);
      await s.page.getByRole('heading', { name: 'Éditeur SVG' }).waitFor();
      // Un brouillon lisible se propose ; il passe par le meme nettoyage que tout SVG.
      const reprise = s.page.getByRole('button', { name: 'Reprendre', exact: true });
      if (await reprise.count()) { await reprise.click(); await issue(s.page); } else {
        await s.page.getByRole('button', { name: 'Ouvrir l’exemple' }).click();
        await s.page.locator('.editeur-cadre').waitFor();
      }
      if (await s.page.locator('.editeur-cadre').count()) {
        // Le panneau des versions lit le stockage : il doit s'afficher sans lever.
        const versions = s.page.locator('.editeur-inspecteur .section > summary', { hasText: 'Versions nommées' });
        if (await versions.count()) await versions.click();
      }
      expect(await s.page.evaluate(() => (({}) as Record<string, unknown>)['pollue'])).toBeUndefined();
      expect(await s.page.evaluate(() => Object.keys(Object.prototype))).toEqual([]);
      await garde.verifier(nom);
    }, 60_000);
  }

  async function issue(page: Page): Promise<void> {
    await Promise.race([page.locator('.editeur-cadre').waitFor(), page.locator('p.message[role=alert]').waitFor()]);
  }

  it('la liste de fichiers du corpus n\'a pas change sans que l\'index le dise', () => {
    expect(readdirSync(DOSSIER).filter(f => f.endsWith('.svg')).length).toBe(index.fichiers.length);
  });
});

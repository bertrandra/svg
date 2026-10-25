// L'embarquement (docs/integration.md) : exemples/integration.html et dist/editeur-svg-embarque.js, ouverts
// depuis le disque (file://), comme un hote les recevrait. On pilote la page d'hote par ses vrais boutons et on
// lit ce qu'elle a recu dans son journal ; l'API (`window.EditeurSvg`) est appelee directement pour ce que la
// demo ne montre pas (poignee, options rares).
//
// Rien ici ne construit : `npm run construire` ecrit le bundle, et sans lui on le dit tout de suite.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, BUNDLE_EMBARQUE, formesVisibles, modifications, ouvrirMenu, pilote, RACINE_DEPOT, texteDe, URL_INTEGRATION } from './aide.js';

/** Ce que la page d'hote voit de l'API : le contrat de docs/integration.md. */
interface PoigneeEditeur { fermer(): void }
interface OptionsOuvrir {
  svg: string; titre?: string; nom?: string; bibliotheque?: 'a-charger'; baseAnnexes?: string; fermerApresEnregistrer?: boolean; libelleEnregistrer?: string;
  onEnregistrer: (svg: string) => void; onFermer?: () => void; onBrouillon?: (svg: string) => void;
}
interface ApiEditeur { version: string; ouvrir(o: OptionsOuvrir): PoigneeEditeur; estEditable(svg: unknown): boolean }
/** Ce que les tests posent sur `window` de l'hote pour garder la trace des rappels. */
interface FenetreHote { EditeurSvg: ApiEditeur; __trace: string[]; __dernier: string; __poignee: PoigneeEditeur | undefined }

const PETIT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10L60 10L60 60L10 60Z" fill="#c81e28"/><path d="M50 50L90 50L90 90L50 90Z" fill="#1428a0"/></svg>';

describe('embarquement : exemples/integration.html', () => {
  const navigateur = pilote();

  beforeAll(() => {
    if (!existsSync(BUNDLE_EMBARQUE)) throw new Error('dist/editeur-svg-embarque.js manque : lancer `npm run construire` avant `npm run e2e`.');
  });

  /**
   * La page d'hote, avec la liste des adresses qu'elle a demandees (pour savoir ce qui se charge, et quand). Deux temoins : les
   * requetes que Playwright voit, et chaque <script src> que la page pose, releve dans la page avant tout script. Sous Firefox,
   * Playwright ne signale aucune requete file:// (lu en CI : la liste y restait vide, bundle compris) ; les annexes se chargent
   * justement par une balise <script> (io/annexes.ts), que le second temoin voit dans les trois moteurs. Chromium et WebKit
   * gardent le premier, qui verrait aussi un fetch.
   */
  async function hote(options: Parameters<typeof navigateur.ouvrir>[0] = {}) {
    const session = await navigateur.ouvrir({ ...options, naviguer: false });
    const vues: string[] = [];
    session.page.on('request', r => vues.push(r.url()));
    await session.page.addInitScript(() => {
      const scripts: string[] = [];
      Object.defineProperty(window, '__scriptsPoses', { value: scripts });
      new MutationObserver(lot => {
        for (const m of lot) for (const n of Array.from(m.addedNodes)) if (n instanceof HTMLScriptElement && n.src) scripts.push(n.src);
      }).observe(document, { childList: true, subtree: true });
    });
    await session.page.goto(URL_INTEGRATION);
    const page = session.page;
    /** Chaque adresse demandee une fois, quel que soit le temoin qui l'a vue. */
    const requetes = async (): Promise<string[]> => {
      const posees = await page.evaluate(() => (window as unknown as { __scriptsPoses: string[] }).__scriptsPoses.slice());
      return [...new Set([...vues, ...posees])];
    };
    return { page, requetes };
  }

  const journal = (page: Page) => page.locator('#journal').evaluate(e => (e.textContent ?? '').split('\n'));
  const compte = async (page: Page, rappel: string) => (await journal(page)).filter(l => l.startsWith(rappel)).length;
  const racines = (page: Page) => page.locator('.editeur-svg').count();
  const forme = (page: Page, id: string) => page.locator(`.editeur-svg-toile path[data-id="${id}"]`);
  const calque = (page: Page, numero: number) => page.locator('.editeur-calques ol > li button.calque-nom[data-forme="f' + numero + '"]');

  /** Clique « Éditer » et attend l'editeur. */
  async function editer(page: Page) {
    await page.locator('#editer').click();
    await page.locator('.editeur-svg .editeur-cadre').waitFor();
  }

  /** Ouvre l'editeur directement par l'API, avec des rappels qui laissent leur trace dans `window.__trace`. */
  async function ouvrirParApi(page: Page, options: Partial<Pick<OptionsOuvrir, 'fermerApresEnregistrer' | 'nom' | 'titre' | 'libelleEnregistrer'>> = {}) {
    await page.evaluate(([svg, opts]) => {
      const w = window as unknown as FenetreHote;
      w.__trace = [];
      w.__poignee = w.EditeurSvg.ouvrir({
        svg: String(svg), ...(opts as Partial<OptionsOuvrir>),
        onEnregistrer: s => { w.__trace.push('enregistre'); w.__dernier = s; },
        onBrouillon: () => w.__trace.push('brouillon'),
        onFermer: () => w.__trace.push('ferme')
      });
    }, [PETIT, options] as const);
    await page.locator('.editeur-svg .editeur-cadre').waitFor();
  }
  const trace = (page: Page) => page.evaluate(() => (window as unknown as FenetreHote).__trace);

  /** Deplace la forme `id` de (dx, dy) pixels a la souris. Rend le deplacement obtenu en x et en y. */
  async function glisser(page: Page, id: string, dx: number, dy: number) {
    const avant = await forme(page, id).boundingBox();
    if (!avant) throw new Error('la forme ' + id + ' n’a pas de boite');
    await page.mouse.move(avant.x + avant.width / 2, avant.y + avant.height / 3);
    await page.mouse.down();
    await page.mouse.move(avant.x + avant.width / 2 + dx, avant.y + avant.height / 3 + dy, { steps: 8 });
    await page.mouse.up();
    await attend(async () => (await forme(page, id).boundingBox())?.x ?? 0).not.toBe(avant.x);
    const apres = await forme(page, id).boundingBox();
    return { dx: (apres?.x ?? 0) - avant.x, dy: (apres?.y ?? 0) - avant.y };
  }

  // ---------------------------------------------------------------------------------------------

  it('expose une API gelee : ouvrir, estEditable et version', async () => {
    const { page } = await hote();
    const api = await page.evaluate(() => {
      const E = (window as unknown as FenetreHote).EditeurSvg;
      return { cles: Object.keys(E).sort(), version: E.version, gelee: Object.isFrozen(E), types: [typeof E.ouvrir, typeof E.estEditable, typeof E.version] };
    });
    expect(api.cles).toEqual(['estEditable', 'ouvrir', 'version']);
    expect(api.types).toEqual(['function', 'function', 'string']);
    expect(api.gelee).toBe(true);
    // La version est celle du paquet qui a construit le bundle.
    const paquet = JSON.parse(readFileSync(resolve(RACINE_DEPOT, 'package.json'), 'utf8')) as { version: string };
    expect(api.version).toBe(paquet.version);
  });

  it('sait dire quels SVG s\'ouvrent', async () => {
    const { page } = await hote();
    const reponses = await page.evaluate(() => {
      const E = (window as unknown as FenetreHote).EditeurSvg;
      const ns = 'xmlns="http://www.w3.org/2000/svg"';
      return {
        chemin: E.estEditable(`<svg ${ns} viewBox="0 0 10 10"><path d="M0 0L9 0L9 9Z"/></svg>`),
        image: E.estEditable(`<svg ${ns} viewBox="0 0 4 4"><image href="data:image/png;base64,AAAA" width="4" height="4"/></svg>`),
        texte: E.estEditable(`<svg ${ns} viewBox="0 0 40 10"><text x="0" y="8">Bonjour</text></svg>`),
        degrade: E.estEditable(`<svg ${ns} viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs><path d="M0 0L9 0L9 9Z" fill="url(#g)"/></svg>`),
        vide: E.estEditable(''), rien: E.estEditable(null), nombre: E.estEditable(42), objet: E.estEditable({})
      };
    });
    expect(reponses).toEqual({ chemin: true, image: false, texte: false, degrade: false, vide: false, rien: false, nombre: false, objet: false });
  });

  it('refuse de mauvaises options par un TypeError en francais, sans rien ouvrir', async () => {
    const { page } = await hote();
    const erreurs = await page.evaluate(() => {
      const E = (window as unknown as FenetreHote).EditeurSvg;
      const essayer = (o: unknown) => { try { E.ouvrir(o as OptionsOuvrir); return 'aucune erreur'; } catch (e) { return (e as Error).name + ' : ' + (e as Error).message; } };
      return [essayer(undefined), essayer({ svg: '<svg/>' }), essayer({ onEnregistrer() { /* rien */ } }), essayer({ svg: 12, onEnregistrer() { /* rien */ } }),
        essayer({ svg: '<svg/>', onEnregistrer() { /* rien */ }, fermerApresEnregistrer: 'oui' })];
    });
    expect(erreurs).toEqual([
      'TypeError : EditeurSvg.ouvrir : ouvrir attend un objet d’options { svg, onEnregistrer, … }.',
      'TypeError : EditeurSvg.ouvrir : L’option « onEnregistrer » est obligatoire : c’est une fonction qui reçoit le SVG retouché.',
      'TypeError : EditeurSvg.ouvrir : L’option « svg » doit être le texte du SVG à retoucher.',
      'TypeError : EditeurSvg.ouvrir : L’option « svg » doit être le texte du SVG à retoucher.',
      'TypeError : EditeurSvg.ouvrir : L’option « fermerApresEnregistrer » doit être vraie ou fausse.'
    ]);
    expect(await racines(page)).toBe(0);
    expect(await page.evaluate(() => document.getElementById('editeur-svg-embarque-style') === null)).toBe(true);
  });

  it('ne pose rien dans la page de l\'hote, et ne charge aucune annexe, avant le premier ouvrir', async () => {
    const { page, requetes } = await hote();
    const etat = await page.evaluate(() => ({
      style: document.getElementById('editeur-svg-embarque-style') !== null, racines: document.querySelectorAll('.editeur-svg').length,
      enfants: document.body.children.length, defile: document.body.style.overflow
    }));
    expect(etat.style).toBe(false);
    expect(etat.racines).toBe(0);
    expect(etat.defile).toBe('');
    // Le bundle est la seule chose chargee : ni bibliotheque, ni polices, ni traceur.
    const demandees = await requetes();
    expect(demandees.filter(u => /bibliotheque\.js|polices\.js|vtracer\.js/.test(u))).toEqual([]);
    expect(demandees.some(u => u.endsWith('/dist/editeur-svg-embarque.js'))).toBe(true);
    expect(await page.locator('#journal').textContent()).toMatch(/^Éditeur SVG \d+\.\d+\.\d+ chargé\.$/);
  });

  it('ouvre l\'editeur en plein ecran par-dessus l\'hote, une seule fois, avec le titre demande', async () => {
    const { page } = await hote();
    const enfantsAvant = await page.evaluate(() => document.body.children.length);
    await editer(page);
    const ouvert = await page.evaluate(() => {
      const r = document.querySelector('.editeur-svg') as HTMLElement;
      return {
        racines: document.querySelectorAll('.editeur-svg').length, styles: document.querySelectorAll('#editeur-svg-embarque-style').length,
        titre: document.querySelector('.editeur-titre')?.textContent, calques: document.querySelectorAll('.editeur-calques ol > li').length,
        defile: document.body.style.overflow, enfants: document.body.children.length, surLeBody: r.parentElement === document.body,
        boite: { x: r.getBoundingClientRect().x, y: r.getBoundingClientRect().y, l: r.getBoundingClientRect().width, h: r.getBoundingClientRect().height, fenetre: [innerWidth, innerHeight] },
        role: r.getAttribute('role'), modal: r.getAttribute('aria-modal'), position: getComputedStyle(r).position
      };
    });
    expect(ouvert.racines).toBe(1);
    expect(ouvert.styles).toBe(1);
    expect(ouvert.titre).toBe('drapeau.svg');
    expect(ouvert.calques).toBe(4);
    // L'editeur est un portail sur <body> : il y est, et l'hote n'a rien perdu.
    expect(ouvert.surLeBody).toBe(true);
    expect(ouvert.enfants).toBeGreaterThan(enfantsAvant);
    expect(ouvert.defile).toBe('hidden');
    expect(ouvert.position).toBe('fixed');
    expect(ouvert.boite).toEqual({ x: 0, y: 0, l: 1400, h: 900, fenetre: [1400, 900] });
    expect([ouvert.role, ouvert.modal]).toEqual(['dialog', 'true']);
    expect(await page.locator('#editer').isDisabled()).toBe(true);
  });

  it('laisse la page de l\'hote telle qu\'elle est : ses styles n\'entrent pas, les siens ne sortent pas', async () => {
    const { page } = await hote();
    const hoteVu = () => page.evaluate(() => {
      const b = getComputedStyle(document.getElementById('editer') as HTMLElement), c = getComputedStyle(document.body);
      return {
        bouton: [b.backgroundColor, b.textTransform, b.borderRadius, b.letterSpacing], corps: [c.fontFamily, c.textAlign, c.letterSpacing, c.lineHeight, c.backgroundColor],
        titre: document.querySelector('h1')?.textContent, langue: document.documentElement.lang, theme: document.documentElement.getAttribute('data-theme'),
        taille: document.documentElement.style.cssText
      };
    });
    const avant = await hoteVu();
    await editer(page);
    expect(await hoteVu()).toEqual(avant);
    expect(avant.bouton.slice(0, 3)).toEqual(['rgb(106, 63, 181)', 'uppercase', '999px']);

    // Dedans, ni la casse, ni l'espacement, ni l'alignement, ni la police de l'hote.
    const dedans = await page.evaluate(() => {
      const bouton = getComputedStyle(document.querySelector('.editeur-barre button.primaire.texte') as HTMLElement);
      const titre = getComputedStyle(document.querySelector('.editeur-titre') as HTMLElement);
      return {
        casse: bouton.textTransform, espacement: bouton.letterSpacing, boutonFond: bouton.backgroundColor,
        alignement: getComputedStyle(document.querySelector('.editeur-inspecteur') as HTMLElement).textAlign, police: titre.fontFamily
      };
    });
    expect(dedans.casse).toBe('none');
    expect(dedans.espacement).toBe('normal');
    expect(dedans.alignement).toBe('start');
    expect(dedans.police).not.toContain('Georgia');
    expect(dedans.boutonFond).not.toBe('rgb(106, 63, 181)');
  });

  it('rend le defilement et la page a l\'hote une fois l\'editeur ferme', async () => {
    const { page } = await hote();
    const enfantsAvant = await page.evaluate(() => document.body.children.length);
    await editer(page);
    await ouvrirMenu(page, 'Fichier');
    await page.getByRole('menuitem', { name: /Fermer l’éditeur/ }).click();
    await attend(() => racines(page)).toBe(0);
    const apres = await page.evaluate(() => ({ enfants: document.body.children.length, defile: document.body.style.overflow, style: document.getElementById('editeur-svg-embarque-style') !== null }));
    expect(apres.enfants).toBe(enfantsAvant);
    expect(apres.defile).not.toBe('hidden');
    // La feuille reste : une seconde ouverture ne la repose pas.
    expect(apres.style).toBe(true);
    await editer(page);
    expect(await page.locator('#editeur-svg-embarque-style').count()).toBe(1);
  });

  it('previent l\'hote par onBrouillon, une fois, apres une seconde de repos', async () => {
    const { page } = await hote();
    await editer(page);
    expect(await compte(page, 'onBrouillon')).toBe(0);

    await calque(page, 3).click();
    const bouge = await glisser(page, 'f3', 80, -50);
    // Les aimants peuvent retenir le geste en route : le deplacement est horizontal, et vers le haut.
    expect(Math.abs(bouge.dx - 80)).toBeLessThan(2);
    expect(bouge.dy).toBeLessThan(-5);
    await page.locator('.editeur-inspecteur [aria-label="Remplissage : nuancier"] button[aria-label="Or"]').click();
    await attend(() => forme(page, 'f3').getAttribute('fill')).toBe('#ffd23f');
    // Deux modifications d'affilee, un seul brouillon : il part une seconde apres la derniere.
    await attend(() => modifications(page)).toBe(2);
    await attend(() => compte(page, 'onBrouillon')).toBe(1);
    expect(await page.locator('#journal').textContent()).toMatch(/onBrouillon : \d+ octets/);
  });

  it('rend a l\'hote un SVG nettoye en cliquant Enregistrer, qui l\'affiche, puis l\'editeur se ferme une fois', async () => {
    const { page } = await hote();
    await editer(page);
    // Rien a enregistrer tant que rien n'a change.
    const enregistrer = page.locator('.editeur-barre button.primaire.texte');
    expect(await texteDe(enregistrer)).toBe('Enregistrer');
    expect(await enregistrer.isDisabled()).toBe(true);

    await calque(page, 3).click();
    await page.locator('.editeur-inspecteur [aria-label="Remplissage : nuancier"] button[aria-label="Or"]').click();
    await attend(() => forme(page, 'f3').getAttribute('fill')).toBe('#ffd23f');
    await attend(() => enregistrer.isDisabled()).toBe(false);
    const apercuAvant = await page.locator('#apercu').getAttribute('src');
    await enregistrer.click();
    await attend(() => racines(page)).toBe(0);

    const recu = await page.evaluate(() => ({
      etat: document.getElementById('etat')?.textContent ?? '', code: document.getElementById('code')?.textContent ?? '', src: document.getElementById('apercu')?.getAttribute('src') ?? '',
      affiche: (document.getElementById('apercu') as HTMLImageElement).complete && (document.getElementById('apercu') as HTMLImageElement).naturalWidth > 0
    }));
    expect(recu.code).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(recu.code).toContain('viewBox=');
    expect(recu.code).toContain('#ffd23f');
    expect(recu.code).not.toMatch(/<script|onload=|foreignObject|javascript:/i);
    // L'hote affiche exactement ce qu'il a recu, dans un <img> : le navigateur l'a trouve valide.
    expect(recu.src).not.toBe(apercuAvant);
    expect(decodeURIComponent(recu.src.replace('data:image/svg+xml;charset=utf-8,', ''))).toBe(recu.code);
    expect(recu.affiche).toBe(true);
    expect(recu.etat).toMatch(/^Dessin enregistré : \d+ octets\.$/);
    // Dans cet ordre, et onFermer une seule fois.
    const lignes = await journal(page);
    const rappels = lignes.map(l => l.split(' ')[0]).filter(m => m === 'onEnregistrer' || m === 'onFermer');
    expect(rappels).toEqual(['onEnregistrer', 'onFermer']);
    expect(await page.locator('#editer').isDisabled()).toBe(false);

    // Rouvrir part du SVG enregistre, pas de l'original.
    await editer(page);
    expect(await page.locator('.editeur-svg-toile').innerHTML()).toContain('#ffd23f');
  });

  it('ferme par Fichier > Fermer sans rien rendre quand rien n\'a change', async () => {
    const { page } = await hote();
    const avant = await page.locator('#code').textContent();
    await editer(page);
    await ouvrirMenu(page, 'Fichier');
    await page.getByRole('menuitem', { name: /Fermer l’éditeur/ }).click();
    await attend(() => racines(page)).toBe(0);
    expect(await compte(page, 'onFermer')).toBe(1);
    expect(await compte(page, 'onEnregistrer')).toBe(0);
    expect(await page.locator('#code').textContent()).toBe(avant);
    // Le bouton de l'hote est de nouveau actif, et le focus lui est rendu par onFermer.
    await attend(() => page.locator('#editer').isDisabled()).toBe(false);
    await attend(() => page.evaluate(() => document.activeElement?.id)).toBe('editer');
  });

  it('demande confirmation pour fermer avec des modifications, et « Abandonner » ne rend rien', async () => {
    const { page } = await hote();
    const avant = await page.locator('#code').textContent();
    await editer(page);
    await calque(page, 1).click();
    await page.keyboard.press('Delete');
    await attend(() => formesVisibles(page)).toBe(3);

    await ouvrirMenu(page, 'Fichier');
    await page.getByRole('menuitem', { name: /Fermer l’éditeur/ }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Abandonner les modifications' });
    await attend(() => confirmation.count()).toBe(1);
    expect(await texteDe(confirmation)).toContain('Abandonner la modification non enregistrée ?');
    expect(await racines(page)).toBe(1);

    // « Continuer l'edition » referme la question et garde le travail.
    await confirmation.getByRole('button', { name: 'Continuer l’édition' }).click();
    await attend(() => confirmation.count()).toBe(0);
    expect(await formesVisibles(page)).toBe(3);
    expect(await compte(page, 'onFermer')).toBe(0);

    await ouvrirMenu(page, 'Fichier');
    await page.getByRole('menuitem', { name: /Fermer l’éditeur/ }).click();
    await confirmation.getByRole('button', { name: 'Abandonner', exact: true }).click();
    await attend(() => racines(page)).toBe(0);
    expect(await compte(page, 'onFermer')).toBe(1);
    expect(await compte(page, 'onEnregistrer')).toBe(0);
    expect(await page.locator('#code').textContent()).toBe(avant);
  });

  it('ferme par la poignee sans confirmation, et un second fermer() n\'a aucun effet', async () => {
    const { page } = await hote();
    const poignee = await page.evaluate(() => {
      const w = window as unknown as FenetreHote;
      w.__trace = [];
      const p = w.EditeurSvg.ouvrir({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L9 0L9 9Z" fill="#c81e28"/></svg>', onEnregistrer() { /* rien */ }, onFermer: () => w.__trace.push('ferme') });
      w.__poignee = p;
      return { cles: Object.keys(p), type: typeof p.fermer };
    });
    expect(poignee).toEqual({ cles: ['fermer'], type: 'function' });
    await page.locator('.editeur-svg .editeur-cadre').waitFor();
    // Une modification non enregistree : la poignee ne demande rien.
    await calque(page, 1).click();
    await page.keyboard.press('Delete');
    await attend(() => formesVisibles(page)).toBe(0);

    await page.evaluate(() => { const w = window as unknown as FenetreHote; w.__poignee?.fermer(); w.__poignee?.fermer(); });
    await attend(() => racines(page)).toBe(0);
    expect(await page.locator('.editeur-confirmer').count()).toBe(0);
    expect(await trace(page)).toEqual(['ferme']);
  });

  it('refuse un second ouvrir tant qu\'un editeur est ouvert, puis en accepte un apres la fermeture', async () => {
    const { page } = await hote();
    await ouvrirParApi(page, { nom: 'premier' });
    const refus = await page.evaluate(() => {
      const w = window as unknown as FenetreHote;
      try { w.EditeurSvg.ouvrir({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0L1 0L1 1Z"/></svg>', onEnregistrer() { /* rien */ } }); return 'aucune erreur'; } catch (e) { return (e as Error).message; }
    });
    expect(refus).toBe('EditeurSvg.ouvrir : un éditeur est déjà ouvert ; fermez-le d’abord (poignée.fermer()).');
    // Le premier n'a pas bouge, et aucun second n'a ete monte.
    expect(await racines(page)).toBe(1);
    expect(await texteDe(page.locator('.editeur-titre'))).toBe('premier.svg');

    await page.evaluate(() => (window as unknown as FenetreHote).__poignee?.fermer());
    await attend(() => racines(page)).toBe(0);
    await ouvrirParApi(page, { nom: 'second' });
    expect(await texteDe(page.locator('.editeur-titre'))).toBe('second.svg');
    expect(await racines(page)).toBe(1);
  });

  it('prend le titre donne, et « <nom>.svg » a defaut', async () => {
    const { page } = await hote();
    await ouvrirParApi(page, { titre: 'Mon beau titre', nom: 'beau' });
    expect(await texteDe(page.locator('.editeur-titre'))).toBe('Mon beau titre');
    await page.evaluate(() => (window as unknown as FenetreHote).__poignee?.fermer());
    await attend(() => racines(page)).toBe(0);
    await ouvrirParApi(page, {});
    expect(await texteDe(page.locator('.editeur-titre'))).toBe('dessin.svg');
  });

  it('garde l\'editeur ouvert apres Enregistrer avec fermerApresEnregistrer: false, et la poignee le ferme', async () => {
    const { page } = await hote();
    await ouvrirParApi(page, { fermerApresEnregistrer: false });
    await calque(page, 1).click();
    await page.keyboard.press('Delete');
    await attend(() => formesVisibles(page)).toBe(1);

    // « Enregistrer » rend le dessin (Ctrl+S, lui, ne garde qu'un brouillon : voir plus bas).
    const enregistrer = page.locator('.editeur-barre .groupe.fin button.primaire');
    await enregistrer.click();
    await attend(async () => (await trace(page)).filter(t => t !== 'brouillon')).toEqual(['enregistre']);
    expect(await racines(page)).toBe(1);
    // On peut enregistrer plusieurs fois, et le SVG rendu est celui du moment.
    await enregistrer.click();
    await attend(async () => (await trace(page)).filter(t => t !== 'brouillon')).toEqual(['enregistre', 'enregistre']);
    expect((await page.evaluate(() => (window as unknown as FenetreHote).__dernier)).match(/<path /g)?.length).toBe(1);

    // Le fermer par l'editeur redemande confirmation (il ne sait pas que le dessin est garde) ; la poignee, non.
    await ouvrirMenu(page, 'Fichier');
    await page.getByRole('menuitem', { name: /Fermer l’éditeur/ }).click();
    await attend(() => page.locator('.editeur-confirmer').count()).toBe(1);
    await page.getByRole('button', { name: 'Continuer l’édition' }).click();
    await page.evaluate(() => (window as unknown as FenetreHote).__poignee?.fermer());
    await attend(() => racines(page)).toBe(0);
    expect((await trace(page)).filter(t => t !== 'brouillon')).toEqual(['enregistre', 'enregistre', 'ferme']);
  });

  it('Ctrl+S garde un brouillon par onBrouillon et le dit, sans jamais rendre le dessin ni fermer l editeur', async () => {
    const { page } = await hote();
    await ouvrirParApi(page);
    await calque(page, 1).click();
    await page.keyboard.press('Delete');
    await attend(() => formesVisibles(page)).toBe(1);
    await page.evaluate(() => { (window as unknown as FenetreHote).__trace = []; });
    await page.keyboard.press('Control+s');
    await attend(() => trace(page)).toContain('brouillon');
    await attend(() => texteDe(page.locator('.message-etat'))).toBe('Brouillon gardé.');
    expect(await trace(page)).not.toContain('enregistre');
    expect(await trace(page)).not.toContain('ferme');
    expect(await racines(page)).toBe(1);
    // Une seconde fois : toujours ouvert, toujours rien de rendu.
    await page.keyboard.press('Control+s');
    expect(await racines(page)).toBe(1);
    expect(await trace(page)).not.toContain('enregistre');
  });

  it('prend le libelle demande par l hote (libelleEnregistrer) : le bouton, la confirmation d abandon, puis rend le dessin', async () => {
    const { page } = await hote();
    await ouvrirParApi(page, { libelleEnregistrer: '  Mettre à jour le logo ', fermerApresEnregistrer: false });
    const bouton = page.locator('.editeur-barre .groupe.fin button.primaire');
    expect(await texteDe(bouton)).toBe('Mettre à jour le logo');
    await calque(page, 1).click();
    await page.keyboard.press('Delete');
    await attend(() => formesVisibles(page)).toBe(1);
    // La confirmation d'abandon propose le meme geste, qui rend le dessin puis ferme.
    await ouvrirMenu(page, 'Fichier');
    expect(await page.getByRole('menuitem', { name: 'Mettre à jour le logo' }).count()).toBe(1);
    await page.getByRole('menuitem', { name: /Fermer l’éditeur/ }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Abandonner les modifications' });
    await confirmation.getByRole('button', { name: 'Mettre à jour le logo' }).click();
    await attend(() => racines(page)).toBe(0);
    expect((await trace(page)).filter(t => t !== 'brouillon')).toEqual(['enregistre', 'ferme']);
    expect((await page.evaluate(() => (window as unknown as FenetreHote).__dernier)).match(/<path /g)?.length).toBe(1);
  });

  // Un dessin sans forme visible ne s'enregistre pas (docs/integration.md) : nettoyerSvg rendrait un <svg> vide,
  // que l'ancienne garde de enregistrerTout (src/zones/actions.ts) ne reconnaissait pas ; l'hote le recevait.
  it('refuse d\'enregistrer un dessin sans forme visible, et le dit', async () => {
    const { page } = await hote();
    await ouvrirParApi(page, { fermerApresEnregistrer: false });
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await attend(() => formesVisibles(page)).toBe(0);
    await page.locator('.editeur-barre .groupe.fin button.primaire').click();
    // Delai court : tant que le bug est la, l'attente echoue, et il ne faut pas lui laisser dix secondes.
    await attend(() => texteDe(page.locator('.message-etat')), 2000).toBe('Le dessin n’a plus de forme visible : rien à enregistrer.');
    expect(await trace(page)).toEqual([]);
  });

  it('ouvre sur un message qui nomme le refus quand le SVG ne se reecrit pas, et « Fermer » appelle onFermer', async () => {
    const { page } = await hote();
    await page.evaluate(() => {
      const w = window as unknown as FenetreHote;
      w.__trace = [];
      w.EditeurSvg.ouvrir({
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"><text x="0" y="8">Bonjour</text></svg>',
        onEnregistrer: () => w.__trace.push('enregistre'), onFermer: () => w.__trace.push('ferme')
      });
    });
    const refus = page.locator('.editeur-svg .editeur-erreur');
    await attend(() => refus.count()).toBe(1);
    expect((await texteDe(refus.locator('p'))).toLowerCase()).toContain('texte');
    expect(await page.locator('.editeur-svg .editeur-cadre').count()).toBe(0);
    await refus.getByRole('button', { name: 'Fermer' }).click();
    await attend(() => racines(page)).toBe(0);
    expect(await trace(page)).toEqual(['ferme']);
  });

  it('charge la bibliotheque et les polices depuis baseAnnexes, au premier besoin seulement', async () => {
    const { page, requetes } = await hote();
    await editer(page);
    const annexes = async () => (await requetes()).filter(u => /\/(bibliotheque|polices)\.js$/.test(u));
    // Ouvrir l'editeur ne charge rien : ni les 7 Mo de formes, ni les fontes.
    expect(await annexes()).toEqual([]);

    const section = page.locator('.editeur-inspecteur details.section', { has: page.locator('summary', { hasText: 'Bibliothèque de formes' }) });
    if (!(await section.evaluate(e => (e as HTMLDetailsElement).open))) await section.locator('summary').click();
    await page.getByRole('button', { name: /Charger la bibliothèque/ }).click();
    await attend(() => page.locator('.editeur-inspecteur .vignette').count()).toBeGreaterThan(0);
    expect((await annexes()).map(u => u.slice(u.lastIndexOf('/dist/')))).toEqual(['/dist/bibliotheque.js']);
    expect(await page.evaluate(() => (window as unknown as { __bibliothequeSvg?: unknown }).__bibliothequeSvg !== undefined)).toBe(true);
    // Une forme de la bibliotheque s'insere dans le dessin de l'hote.
    const avant = await formesVisibles(page);
    await page.locator('.editeur-inspecteur .vignette').first().click();
    await attend(() => formesVisibles(page)).toBeGreaterThan(avant);

    await page.locator('.editeur-barre button[title^="Texte en formes"]').click();
    await attend(() => page.evaluate(() => ((window as unknown as { __policesSvg?: unknown[] }).__policesSvg ?? []).length)).toBeGreaterThan(0);
    expect((await annexes()).map(u => u.slice(u.lastIndexOf('/dist/'))).sort()).toEqual(['/dist/bibliotheque.js', '/dist/polices.js']);
    await attend(() => page.locator('.editeur-inspecteur legend', { hasText: 'Texte en formes' }).isVisible()).toBe(true);
  });

  // ----- Le theme : l'hote decide par data-theme, sinon le systeme -----

  /** La luminance (0 a 1) du fond de l'editeur, pour dire « clair » ou « sombre » sans figer une teinte. */
  const luminanceDuFond = (page: Page) => page.evaluate(() => {
    const m = /rgba?\((\d+), (\d+), (\d+)/.exec(getComputedStyle(document.querySelector('.editeur-svg') as HTMLElement).backgroundColor);
    return m ? (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255 : NaN;
  });

  it('suit le theme du systeme, clair ou sombre', async () => {
    const { page } = await hote({ schema: 'light' });
    await editer(page);
    expect(await luminanceDuFond(page)).toBeGreaterThan(0.7);
    await page.emulateMedia({ colorScheme: 'dark' });
    await attend(() => luminanceDuFond(page)).toBeLessThan(0.2);
    await page.emulateMedia({ colorScheme: 'light' });
    await attend(() => luminanceDuFond(page)).toBeGreaterThan(0.7);
  });

  it('obeit au data-theme de l\'hote avant le theme du systeme, dans les deux sens', async () => {
    const { page } = await hote({ schema: 'dark' });
    await editer(page);
    await attend(() => luminanceDuFond(page)).toBeLessThan(0.2);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await attend(() => luminanceDuFond(page)).toBeGreaterThan(0.7);

    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await attend(() => luminanceDuFond(page)).toBeLessThan(0.2);
    // Sans data-theme, le systeme reprend la main.
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await attend(() => luminanceDuFond(page)).toBeGreaterThan(0.7);
  });
});

describe('embarquement : sur un telephone de 390 px', () => {
  const navigateur = pilote();
  const CIBLE_MIN = 40;

  async function telephone() {
    const session = await navigateur.ouvrir({ largeur: 390, hauteur: 800, tactile: true, naviguer: false });
    await session.page.goto(URL_INTEGRATION);
    await session.page.locator('#editer').tap();
    await session.page.locator('.editeur-svg .editeur-cadre').waitFor();
    return session.page;
  }

  it('couvre l\'ecran sans faire defiler la page horizontalement', async () => {
    const page = await telephone();
    const mesure = await page.evaluate(() => {
      const r = (document.querySelector('.editeur-svg') as HTMLElement).getBoundingClientRect();
      // `clientWidth`, pas `innerWidth` : sous `isMobile`, Chromium elargit la fenetre jusqu'au contenu qui deborde, et
      // `scrollWidth - innerWidth` y restait nul pour une page trop large (constate sur l'atelier a 420 px).
      return { largeur: r.width, hauteur: r.height, defile: document.documentElement.scrollWidth - document.documentElement.clientWidth, grossier: matchMedia('(pointer: coarse)').matches };
    });
    // Les trois moteurs annoncent un pointeur grossier, Firefox par `hasTouch` seul (aide.ts).
    expect(mesure).toEqual({ largeur: 390, hauteur: 800, defile: 0, grossier: true });
  });

  it('donne 40 px au moins aux boutons de la barre', async () => {
    const page = await telephone();
    const cibles = await page.locator('.editeur-cadre button:visible, .editeur-cadre select:visible').evaluateAll(
      l => l.filter(e => !e.closest('.editeur-calques, .editeur-inspecteur')).map(e => {
        const r = e.getBoundingClientRect();
        return { nom: (e.getAttribute('aria-label') ?? (e as HTMLElement).innerText ?? e.className).slice(0, 30), l: Math.round(r.width), h: Math.round(r.height) };
      })
    );
    expect(cibles.length).toBeGreaterThan(10);
    expect(cibles.filter(c => c.l < CIBLE_MIN || c.h < CIBLE_MIN)).toEqual([]);
  });

  it('range l\'inspecteur dans un tiroir que le voile referme', async () => {
    const page = await telephone();
    const inspecteur = page.locator('.editeur-inspecteur');
    expect(await inspecteur.evaluate(e => getComputedStyle(e).visibility)).toBe('hidden');
    await page.getByRole('button', { name: 'Inspecteur' }).tap();
    await attend(() => page.locator('.voile').count()).toBe(1);
    await attend(() => inspecteur.evaluate(e => getComputedStyle(e).visibility)).toBe('visible');
    await page.locator('.voile').tap({ position: { x: 20, y: 200 } });
    await attend(() => page.locator('.voile').count()).toBe(0);
    await attend(() => inspecteur.evaluate(e => getComputedStyle(e).visibility)).toBe('hidden');
  });
});

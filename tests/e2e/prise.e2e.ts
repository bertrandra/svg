// Prendre une forme sur la toile (ADR-0029) : ce qui rendait la selection difficile, mesure d'abord, puis ce qui passe
// desormais. Un trait fin, un contour sans remplissage, un clic juste a cote du bord, une petite forme, une forme sous une
// autre, un texte entre deux lettres, un zoom faible ; le curseur « deplacer » et le lisere de survol ; Alt+clic qui passe
// dessous ; au doigt, une tolerance plus large ; et le temps d'un survol sur un dessin de plusieurs milliers de formes.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, nombreDeCalques, ouvrirCode, pilote, texteDe } from './aide.js';
import { champPolice, choisirPolice } from './polices.js';

/** Trait fin, contour sans remplissage, forme remplie, chacun seul sur le plan. */
const SEULES = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<path d="M40 40L360 40" fill="none" stroke="#000000" stroke-width="1"/>'
  + '<rect x="40" y="90" width="120" height="80" fill="none" stroke="#c81e28" stroke-width="1"/>'
  + '<rect x="220" y="90" width="120" height="80" fill="#1428a0"/>'
  + '<rect x="300" y="240" width="2" height="2" fill="#000000"/>'
  + '</svg>';

/** Deux formes l'une sur l'autre (la seconde couvre presque toute la premiere) ; un fond rempli sous un trait fin et sous une toute petite forme. */
const EMPILEES = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<rect x="60" y="30" width="200" height="120" fill="#1428a0"/>'
  + '<rect x="60" y="30" width="200" height="119" fill="#c81e28"/>'
  + '<rect x="20" y="180" width="360" height="100" fill="#dddddd"/>'
  + '<path d="M40 220L360 220" fill="none" stroke="#000000" stroke-width="1"/>'
  + '<rect x="300" y="250" width="2" height="2" fill="#000000"/>'
  + '</svg>';

const PLAN_TEXTE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect x="0" y="0" width="20" height="20" fill="#1f4e8c"/></svg>';

describe('prendre une forme sur la toile', () => {
  const navigateur = pilote();

  /** Le point d'ecran d'un point du plan, decale de (dx, dy) pixels d'ecran. */
  const versEcran = (page: Page, x: number, y: number, dx = 0, dy = 0) => page.evaluate(([px, py, ex, ey]) => {
    const g = document.querySelector<SVGGElement>('.editeur-svg-toile > g');
    const m = g?.getScreenCTM();
    if (!m) throw new Error('toile absente');
    return { x: m.a * px + m.c * py + m.e + ex, y: m.b * px + m.d * py + m.f + ey };
  }, [x, y, dx, dy] as const);

  /** Ouvre un dessin et attend que la vue ait fini de se cadrer (la toile prend sa taille apres l'ouverture). */
  async function ouvrir(page: Page, svg: string, tactile = false): Promise<void> {
    await ouvrirCode(page, svg, tactile);
    const ctm = () => page.evaluate(() => { const m = document.querySelector<SVGGElement>('.editeur-svg-toile > g')?.getScreenCTM(); return m ? [m.a, m.e, m.f].join(' ') : ''; });
    let avant = '';
    await attend(async () => { const v = await ctm(); const stable = v !== '' && v === avant; avant = v; await page.waitForTimeout(100); return stable; }).toBe(true);
  }

  /** Les formes choisies : celles dont le trace de selection reprend le chemin. */
  const choisies = (page: Page) => page.evaluate(() => {
    const traces = [...document.querySelectorAll('.editeur-svg-toile .trace-choisi')].map(p => p.getAttribute('d'));
    return [...document.querySelectorAll('.editeur-svg-toile path[data-id]')].filter(p => traces.includes(p.getAttribute('d'))).map(p => p.getAttribute('data-id'));
  });

  const cliquer = async (page: Page, x: number, y: number, dx = 0, dy = 0, alt = false) => {
    const p = await versEcran(page, x, y, dx, dy);
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.click(p.x, p.y);
    if (alt) await page.keyboard.up('Alt');
  };

  /** Vide la selection : Echap, seulement s'il y a une selection (sans elle, Echap propose de quitter l'editeur). */
  async function vider(page: Page): Promise<void> {
    if ((await choisies(page)).length) await page.keyboard.press('Escape');
    await attend(() => choisies(page)).toEqual([]);
  }

  /** Vide la selection, clique au point voulu, et rend ce qui est choisi. */
  async function prendre(page: Page, x: number, y: number, dx = 0, dy = 0): Promise<(string | null)[]> {
    await vider(page);
    await cliquer(page, x, y, dx, dy);
    // Un clic est traite avant le suivant : la selection est posee quand la page a rendu la main.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))));
    return choisies(page);
  }

  /** Le curseur que montre le navigateur au point : celui de l'element que le pointeur y touche. */
  const curseur = (page: Page, p: { x: number; y: number }) => page.evaluate(([x, y]) => {
    const e = document.elementFromPoint(x, y);
    return e ? getComputedStyle(e).cursor : null;
  }, [p.x, p.y] as const);
  /** Pendant un glisser, la toile capture le pointeur et c'est son curseur qui se voit. */
  const curseurToile = (page: Page) => page.locator('.editeur-svg-toile').evaluate(e => getComputedStyle(e).cursor);
  const lisere = (page: Page) => page.locator('.editeur-svg-toile .lisere-survol');
  const zoom = async (page: Page) => Number((await texteDe(page.locator('.editeur-barre .zoom'))).replace(/\D/g, '')) / 100;

  it('prend un trait fin, un contour sans remplissage et une forme remplie a quelques pixels de leur bord', async () => {
    const { page } = await navigateur.ouvrir();
    await ouvrir(page, SEULES);
    // Trait de 1 : a 4 px au-dessus ou au-dessous, il se prend ; a 9 px, non (la tolerance est de 6 px a la souris).
    expect(await prendre(page, 200, 40, 0, -4)).toEqual(['f1']);
    expect(await prendre(page, 200, 40, 0, 4)).toEqual(['f1']);
    expect(await prendre(page, 200, 40, 0, 9)).toEqual([]);
    // Contour sans remplissage : sur son trait (a 3 px dedans ou dehors), pas en son milieu, qui est vide.
    expect(await prendre(page, 40, 130, 3, 0)).toEqual(['f2']);
    expect(await prendre(page, 40, 130, -3, 0)).toEqual(['f2']);
    expect(await prendre(page, 100, 130)).toEqual([]);
    // Forme remplie : dans sa surface, et juste a cote de son bord.
    expect(await prendre(page, 280, 130)).toEqual(['f3']);
    expect(await prendre(page, 220, 130, -5, 0)).toEqual(['f3']);
    // Petite forme de 2 unites (quelques pixels) : a 5 px de son centre.
    expect(await prendre(page, 301, 241, 5, 5)).toEqual(['f4']);
  });

  it('prend au zoom faible avec la meme tolerance a l ecran', async () => {
    const { page } = await navigateur.ouvrir();
    await ouvrir(page, SEULES);
    await page.locator('.editeur-svg-toile').focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press('-');
    await attend(() => zoom(page)).toBeLessThan(0.7);
    expect(await prendre(page, 200, 40, 0, 4)).toEqual(['f1']);
    expect(await prendre(page, 220, 130, -4, 0)).toEqual(['f3']);
    expect(await prendre(page, 200, 40, 0, 9)).toEqual([]);
  });

  it('prend le trait fin et la petite forme poses sur un fond, et passe dessous par Alt+clic', async () => {
    const { page } = await navigateur.ouvrir();
    await ouvrir(page, EMPILEES);
    // Sur le fond, a 3 px du trait fin : le trait, qui est au-dessus.
    expect(await prendre(page, 200, 220, 0, 3)).toEqual(['f4']);
    // A 4 px de la petite forme : elle, pas le fond.
    expect(await prendre(page, 301, 251, 4, -3)).toEqual(['f5']);
    // Loin des deux : le fond.
    expect(await prendre(page, 100, 260)).toEqual(['f3']);

    // Deux formes confondues : le clic prend celle du dessus, Alt+clic celle du dessous, puis revient, en boucle.
    expect(await prendre(page, 160, 90)).toEqual(['f2']);
    await cliquer(page, 160, 90, 0, 0, true);
    await attend(() => choisies(page)).toEqual(['f1']);
    await attend(() => texteDe(page.locator('.editeur-svg .annonces[aria-live="polite"]'))).toMatch(/Forme du dessous, 2 sur 2/);
    // Au meme endroit, un clic reprendrait la forme du dessous, deja choisie : pas de lisere sur celle du dessus.
    const ici = await versEcran(page, 160, 90, 1, 0);
    await page.mouse.move(ici.x, ici.y);
    await attend(() => lisere(page).count()).toBe(0);
    await cliquer(page, 160, 90, 0, 0, true);
    await attend(() => choisies(page)).toEqual(['f2']);
    // La forme prise par Alt+clic se deplace comme une autre.
    await cliquer(page, 160, 90, 0, 0, true);
    await attend(() => choisies(page)).toEqual(['f1']);
    const depart = await versEcran(page, 160, 90);
    const avant = await page.locator('path[data-id="f1"]').getAttribute('d');
    await page.mouse.move(depart.x, depart.y);
    await page.mouse.down();
    await page.mouse.move(depart.x + 30, depart.y + 10, { steps: 4 });
    await page.mouse.up();
    await attend(() => page.locator('path[data-id="f1"]').getAttribute('d')).not.toBe(avant);
    expect(await page.locator('path[data-id="f2"]').getAttribute('d')).toBe('M60 30L260 30L260 149L60 149Z');
  });

  it('prend un texte vivant sur sa boite, entre ses lettres aussi', async () => {
    const { page } = await navigateur.ouvrir();
    await ouvrir(page, PLAN_TEXTE);
    await page.keyboard.press('t');
    const inspecteur = page.locator('.editeur-inspecteur');
    await champPolice(inspecteur).waitFor({ timeout: 30_000 });
    await inspecteur.locator('textarea[aria-label="Texte"]').fill('I      I');
    await choisirPolice(inspecteur, 'inter');
    await page.getByRole('button', { name: 'Ajouter le texte' }).click();
    await attend(() => nombreDeCalques(page)).toBe(2);
    // Sans selection d'abord : la rangee de la selection, en partant, deplace la toile a l'ecran.
    await vider(page);
    // Le milieu de la boite du texte est un blanc entre les deux lettres, loin de toute encre (plus de 6 px).
    const milieu = await page.evaluate(() => {
      const p = document.querySelector<SVGPathElement>('.editeur-svg-toile path[data-id="f2"]');
      const r = p?.getBoundingClientRect();
      if (!p || !r) return null;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      for (let a = 0; a < 16; a++) for (const d of [0, 4, 8]) {
        const e = document.elementFromPoint(x + d * Math.cos(a * Math.PI / 8), y + d * Math.sin(a * Math.PI / 8));
        if (e === p) return null;
      }
      return { x, y };
    });
    expect(milieu, 'le milieu du texte doit etre un blanc').not.toBeNull();
    if (!milieu) return;
    await page.mouse.click(milieu.x, milieu.y);
    await attend(() => choisies(page)).toEqual(['f2']);
    // Le lisere de survol d'un texte est sa boite : ce qu'un clic prendra (la selection videe au clavier, la toile ne bouge pas
    // de nouveau : la rangee de la selection part, on remesure).
    await vider(page);
    const encore = await page.locator('.editeur-svg-toile path[data-id="f2"]').evaluate(p => { const r = p.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(encore.x + 1, encore.y);
    await attend(() => lisere(page).count()).toBe(1);
    expect(await lisere(page).evaluate(e => e.tagName.toLowerCase())).toBe('rect');
  });

  it('montre le curseur deplacer et le lisere au survol d une forme, pas ailleurs, jamais sur une forme verrouillee', async () => {
    const { page } = await navigateur.ouvrir();
    await ouvrir(page, SEULES);
    const dedans = await versEcran(page, 280, 130), pres = await versEcran(page, 200, 40, 0, 4), vide = await versEcran(page, 100, 130);
    await page.mouse.move(vide.x, vide.y);
    await attend(() => curseur(page, vide)).toBe('auto');
    expect(await lisere(page).count()).toBe(0);
    await page.mouse.move(dedans.x, dedans.y);
    await attend(() => curseur(page, dedans)).toBe('move');
    await attend(() => lisere(page).count()).toBe(1);
    expect(await lisere(page).getAttribute('d')).toBe(await page.locator('path[data-id="f3"]').getAttribute('d'));
    // Le lisere n'attrape rien : il ne change pas la forme sous le pointeur.
    expect(await lisere(page).evaluate(e => getComputedStyle(e).pointerEvents)).toBe('none');
    // Pres du trait fin, dans la tolerance : le meme calcul que le clic.
    await page.mouse.move(pres.x, pres.y);
    await attend(() => lisere(page).getAttribute('d')).toBe(await page.locator('path[data-id="f1"]').getAttribute('d'));
    expect(await curseur(page, pres)).toBe('move');
    // Pendant le glisser, le curseur reste « deplacer » ; au repos, la toile n'en porte aucun.
    expect(await curseurToile(page)).toBe('auto');
    await page.mouse.move(dedans.x, dedans.y);
    await page.mouse.down();
    await page.mouse.move(dedans.x + 20, dedans.y + 5, { steps: 3 });
    expect(await curseurToile(page)).toBe('move');
    await page.mouse.up();
    await attend(() => curseurToile(page)).toBe('auto');
    // Hors de la toile, plus de lisere.
    await page.mouse.move(5, 5);
    await attend(() => lisere(page).count()).toBe(0);

    // Une forme verrouillee ne se prend pas : ni « deplacer » ni lisere.
    await page.getByRole('button', { name: 'Verrouiller la forme 3', exact: true }).click();
    const verrouillee = await versEcran(page, 300, 150);
    await page.mouse.move(verrouillee.x, verrouillee.y);
    await page.mouse.move(verrouillee.x + 1, verrouillee.y);
    await attend(() => curseur(page, verrouillee)).toBe('auto');
    expect(await lisere(page).count()).toBe(0);
    // Un autre outil que la selection garde son curseur et n'a pas de lisere.
    await vider(page);
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('r');
    await page.mouse.move(pres.x, pres.y);
    await attend(() => curseur(page, pres)).toBe('crosshair');
    await attend(() => curseur(page, dedans)).toBe('crosshair');
    expect(await lisere(page).count()).toBe(0);
  });

  it('pose le lisere sans mouvement, aux couleurs des jetons, mouvement reduit ou non', async () => {
    for (const mouvementReduit of [false, true]) {
      const { page } = await navigateur.ouvrir({ mouvementReduit });
      await ouvrir(page, SEULES);
      // La vue se cadre encore juste apres l'ouverture : le point se relit a chaque essai, et le pointeur bouge d'un pixel.
      let k = 0;
      await attend(async () => {
        const dedans = await versEcran(page, 280, 130, k++ % 2);
        await page.mouse.move(dedans.x, dedans.y);
        return lisere(page).count();
      }).toBe(1);
      const style = await lisere(page).evaluate(e => {
        const s = getComputedStyle(e), fond = e.parentElement?.querySelector('.lisere-survol-fond');
        const jeton = (n: string) => { const sonde = document.createElement('span'); sonde.style.color = `var(${n})`; document.body.appendChild(sonde); const c = getComputedStyle(sonde).color; sonde.remove(); return c; };
        return { trait: s.stroke, cyan: jeton('--cyan'), halo: fond ? getComputedStyle(fond).stroke : null, panneau: jeton('--panneau'), transition: s.transitionDuration, animation: s.animationName };
      });
      expect(style.trait).toBe(style.cyan);
      expect(style.halo).toBe(style.panneau);
      // Rien ne bouge : ni transition ni animation, donc rien a couper pour prefers-reduced-motion.
      expect(parseFloat(style.transition)).toBeLessThan(0.001);
      expect(style.animation).toBe('none');
    }
  });

  it('au doigt, prend un trait fin avec une tolerance plus large et montre le lisere au toucher', async () => {
    const { page } = await navigateur.ouvrir({ tactile: true, largeur: 1000, hauteur: 800 });
    await ouvrir(page, SEULES, true);
    // A 9 px du trait : hors de portee d'une souris (6 px), a portee d'un doigt (12 px).
    const pres = await versEcran(page, 200, 40, 0, 9);
    await page.touchscreen.tap(pres.x, pres.y);
    await attend(() => choisies(page)).toEqual(['f1']);
    // Le lisere vient au toucher, pendant que le doigt est pose (il n'y a pas de survol) ; un appui tactile synthetique le tient
    // pose aussi longtemps qu'il faut pour le lire, dans les trois moteurs.
    const point = await versEcran(page, 280, 130);
    const toucher = (type: 'pointerdown' | 'pointerup') => page.evaluate(([t, x, y]) => {
      document.querySelector('.editeur-svg-toile')?.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: 7, button: 0, buttons: t === 'pointerdown' ? 1 : 0, clientX: x, clientY: y }));
    }, [type, point.x, point.y] as const);
    await toucher('pointerdown');
    await attend(() => lisere(page).count()).toBe(1);
    expect(await lisere(page).getAttribute('d')).toBe(await page.locator('path[data-id="f3"]').getAttribute('d'));
    // Au doigt, le lisere reste sur la forme touchee meme une fois choisie : c'est lui qui dit ce que le doigt tient.
    await attend(() => choisies(page)).toEqual(['f3']);
    expect(await lisere(page).count()).toBe(1);
    await toucher('pointerup');
    await attend(() => lisere(page).count()).toBe(0);
  });

  it('survole un dessin de 5 000 formes sans ralentir', async () => {
    const { page } = await navigateur.ouvrir();
    // 5 000 formes : des carres pleins, des traits fins et des contours sans remplissage, en grille serree.
    let formes = '';
    for (let i = 0; i < 5000; i++) {
      const x = (i % 100) * 10, y = Math.floor(i / 100) * 10, k = i % 3;
      formes += k === 0 ? `<rect x="${x}" y="${y}" width="8" height="8" fill="#${(i * 2654435761 % 0xffffff).toString(16).padStart(6, '0')}"/>`
        : k === 1 ? `<path d="M${x} ${y + 4}C${x + 3} ${y} ${x + 6} ${y + 8} ${x + 9} ${y + 4}" fill="none" stroke="#000000" stroke-width="0.5"/>`
        : `<circle cx="${x + 4}" cy="${y + 4}" r="3" fill="none" stroke="#c81e28" stroke-width="0.5"/>`;
    }
    await ouvrirCode(page, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500">${formes}</svg>`);
    await attend(() => page.locator('.editeur-svg-toile path[data-id]').count(), 30_000).toBe(5000);
    /**
     * Les memes mouvements, de trois facons : leur calcul seul, jusqu'au rendu de React, et une image par mouvement (l'intervalle
     * entre deux images, peinture comprise). `temoin` change un filet de la barre d'etat a chaque image : de quoi comparer le
     * lisere a la plus petite chose qui se voit, et non a une page immobile.
     */
    const mesurer = (temoin: boolean) => page.evaluate(async (avecTemoin) => {
      const svg = document.querySelector<SVGSVGElement>('.editeur-svg-toile'), etat = document.querySelector<HTMLElement>('.editeur-etat');
      if (!svg || !etat) throw new Error('toile absente');
      const r = svg.getBoundingClientRect();
      const bouger = (i: number) => {
        if (avecTemoin) etat.style.outlineWidth = (i % 2) + 'px';
        svg.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, pointerType: 'mouse', isPrimary: true, clientX: r.left + 20 + (i * 37) % (r.width - 40), clientY: r.top + 20 + (i * 53) % (r.height - 40)
        }));
      };
      // Un premier passage remplit les memoires (boites et traces par forme), comme le premier survol d'un dessin ouvert.
      for (let i = 0; i < 20; i++) bouger(i);
      const calcul: number[] = [], rendu: number[] = [], images: number[] = [];
      for (let i = 20; i < 220; i++) {
        const t0 = performance.now();
        bouger(i);
        const t1 = performance.now();
        await new Promise(fini => setTimeout(fini, 0));
        calcul.push(t1 - t0);
        rendu.push(performance.now() - t0);
      }
      let avant = await new Promise<number>(fini => requestAnimationFrame(fini));
      for (let i = 220; i < 300; i++) {
        bouger(i);
        const t = await new Promise<number>(fini => requestAnimationFrame(fini));
        images.push(t - avant);
        avant = t;
      }
      etat.style.outlineWidth = '';
      const mediane = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? NaN;
      const centile = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length * 0.95)] ?? NaN;
      const moyenne = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
      return { calcul: mediane(calcul), calcul95: centile(calcul), rendu: mediane(rendu), rendu95: centile(rendu), image: moyenne(images) };
    }, temoin);
    const dire = (m: Awaited<ReturnType<typeof mesurer>>) => `calcul ${m.calcul.toFixed(2)} ms (95 % : ${m.calcul95.toFixed(2)}), jusqu'au rendu ${m.rendu.toFixed(2)} ms (95 % : ${m.rendu95.toFixed(2)}), une image ${m.image.toFixed(1)} ms en moyenne`;
    const survol = await mesurer(false);
    // Les references : l'outil main ne survole rien ; sans rien d'autre, rien ne change a l'ecran ; avec le temoin, un filet change.
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('h');
    const immobile = await mesurer(false), temoin = await mesurer(true);
    console.log(`Survol, 5 000 formes : ${dire(survol)}\nOutil main, page immobile : ${dire(immobile)}\nOutil main, un filet de la barre d'etat change : ${dire(temoin)}`);
    // Le calcul tient dans une fraction d'image (16 ms a 60 Hz) ; l'image d'un lisere qui change ne coute pas plus que celle de
    // n'importe quel filet qui change ailleurs dans la page (sur 5 000 formes, toute image repeinte coute, survol ou non).
    expect(survol.calcul).toBeLessThan(4);
    expect(survol.rendu).toBeLessThan(16);
    expect(survol.image).toBeLessThan(temoin.image * 1.25 + 8);
  });
});

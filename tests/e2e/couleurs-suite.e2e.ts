// Les calques par couleur, seconde partie : recolorer depuis la ligne, choisir la meme couleur, les nuances
// proches, quitter l'isolement, et le telephone. La premiere partie (choisir, masquer, verrouiller, combiner,
// supprimer) est dans couleurs.e2e.ts.
//
// Le dessin est fabrique ici, en memoire, et colle dans la page : un test se lit avec son dessin sous les yeux.
//
//   f1, f2   fond #c81e28            f6   fond #1428a0 (nuance de f5 et f7, la moins employee)
//   f3       fond #c91f27 (a 0,003 de #c81e28 : on ne la devine pas)
//   f4       fond #d0343a (a 0,034 : on la devine a peine, elle se fond des 4 et pas a 3)
//   f5       fond #1529a1, contour #c81e28 (une forme qui a deux couleurs)
//   f7       fond #1529a1             f8   fond #ffd23f (seule de son espece)
//   f9, f10  contour #15181d, sans fond (de quoi lire « Trait » et partir d'un contour)
//   f11      fond #15181d, sans contour

import { describe, expect, it } from 'vitest';
import type { ElementHandle, Locator, Page } from 'playwright';
import { attend, formesVisibles, modifications, ouvrirCode, ouvrirMenu, pilote, texteDe } from './aide.js';

const carre = (x: number, y: number) => `M${x} ${y}L${x + 30} ${y}L${x + 30} ${y + 30}L${x} ${y + 30}Z`;
const chemin = (x: number, y: number, peinture: string) => `<path d="${carre(x, y)}" ${peinture}/>`;
const DESSIN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">'
  + chemin(10, 10, 'fill="#c81e28"')
  + chemin(50, 10, 'fill="#c81e28"')
  + chemin(90, 10, 'fill="#c91f27"')
  + chemin(130, 10, 'fill="#d0343a"')
  + chemin(10, 60, 'fill="#1529a1" stroke="#c81e28" stroke-width="4"')
  + chemin(60, 60, 'fill="#1428a0"')
  + chemin(110, 60, 'fill="#1529a1"')
  + chemin(160, 60, 'fill="#ffd23f"')
  + chemin(10, 120, 'fill="none" stroke="#15181d" stroke-width="3"')
  + chemin(60, 120, 'fill="none" stroke="#15181d" stroke-width="3"')
  + chemin(110, 120, 'fill="#15181d"')
  + '</svg>';

const ROUGE = '#C81E28', ROUGE_PROCHE = '#C91F27', ROUGE_LOIN = '#D0343A';
const BLEU = '#1529A1', BLEU_RARE = '#1428A0', ENCRE = '#15181D', OR = '#FFD23F';

describe('calques par couleur, suite', () => {
  const navigateur = pilote();

  async function editeur() {
    const { page } = await navigateur.ouvrir();
    await ouvrirCode(page, DESSIN);
    return page;
  }

  const ligneDe = (page: Page, couleur: string) => page.locator('.par-couleur li', { hasText: couleur });
  const lignes = (page: Page) => page.locator('.par-couleur li').evaluateAll(l => l.map(e => (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
  const mode = (page: Page, nom: 'Fond' | 'Trait' | 'Les deux') => page.getByRole('button', { name: nom, exact: true }).click();
  const surToile = (page: Page, id: string) => page.locator(`.editeur-svg-toile path[data-id="${id}"]`);
  const peinture = async (page: Page, id: string) => {
    const f = surToile(page, id);
    return { fond: await f.getAttribute('fill'), trait: await f.getAttribute('stroke') };
  };
  const calque = (page: Page, id: string) => page.locator('.editeur-calques ol > li button.calque-nom[data-forme="' + id + '"]');
  // textContent, pas innerText : une ligne des calques hors de l'ecran (`content-visibility: auto`) n'est pas rendue, et Firefox
  // et WebKit lui donnent alors un innerText vide.
  const choisies = (page: Page) => page.locator('.editeur-calques ol > li.choisi').evaluateAll(l => l.map(e => 'Forme ' + (e.querySelector('.calque-nom')?.getAttribute('data-forme') ?? '').slice(1)));
  const message = (page: Page) => texteDe(page.locator('.message-etat'));
  const autresActions = (page: Page, couleur: string) => page.locator(`[aria-label="Autres actions sur ${couleur}"]`);
  const apercu = (page: Page) => texteDe(page.locator('.nuances-proches [role=status]'));
  const tolerance = (page: Page) => page.locator('.nuances-proches input[type=range]');
  const fusionner = (page: Page) => page.getByRole('button', { name: 'Fusionner les nuances proches' });
  const selectionnerProches = (page: Page) => page.getByRole('button', { name: 'Sélectionner les nuances proches' });

  /** Le selecteur de couleur de la ligne : une poignee, car la ligne change de nom quand sa couleur change. */
  async function selecteur(page: Page, couleur: string): Promise<ElementHandle<HTMLInputElement>> {
    const poignee = await ligneDe(page, couleur).locator('input[type=color]').elementHandle();
    if (!poignee) throw new Error('pas de selecteur de couleur pour ' + couleur);
    return poignee as ElementHandle<HTMLInputElement>;
  }

  it('liste les sept couleurs du dessin construit, de la plus employee a la moins employee', async () => {
    const page = await editeur();
    expect(await formesVisibles(page)).toBe(11);
    expect(await lignes(page)).toEqual([`${ENCRE} 3`, `${ROUGE} 3`, `${BLEU} 2`, `${BLEU_RARE} 1`, `${ROUGE_PROCHE} 1`, `${ROUGE_LOIN} 1`, `${OR} 1`]);
  });

  describe('recolorer depuis la ligne', () => {
    it('change la couleur de toutes les formes qui la portent, fond et contour', async () => {
      const page = await editeur();
      const champ = await selecteur(page, ROUGE);
      await champ.fill('#00aa55');
      await attend(() => peinture(page, 'f1')).toEqual({ fond: '#00aa55', trait: null });
      expect(await peinture(page, 'f2')).toEqual({ fond: '#00aa55', trait: null });
      // f5 a le rouge en contour : « Les deux » le change aussi, et laisse son fond bleu.
      expect(await peinture(page, 'f5')).toEqual({ fond: '#1529a1', trait: '#00aa55' });
      // Les nuances voisines sont d'autres couleurs : on ne les touche pas.
      expect((await peinture(page, 'f3')).fond).toBe('#c91f27');
      expect((await lignes(page)).sort()).toContain('#00AA55 3');
      expect(await lignes(page)).toHaveLength(7);
      await attend(() => message(page)).toBe(`${ROUGE} remplacée par #00AA55 : 3 formes.`);
      expect(await modifications(page)).toBe(1);
    });

    it('fond trois valeurs d\'un meme geste en UNE entree d\'historique, qu\'un seul Ctrl+Z annule', async () => {
      const page = await editeur();
      const champ = await selecteur(page, ROUGE);
      // Un geste de selecteur envoie une valeur a chaque mouvement du curseur ; on en envoie trois.
      for (const v of ['#102030', '#405060', '#708090']) await champ.fill(v);
      await attend(() => peinture(page, 'f1')).toEqual({ fond: '#708090', trait: null });
      expect(await modifications(page)).toBe(1);

      await page.keyboard.press('Control+z');
      await attend(() => peinture(page, 'f1')).toEqual({ fond: '#c81e28', trait: null });
      expect(await peinture(page, 'f5')).toEqual({ fond: '#1529a1', trait: '#c81e28' });
      await attend(() => modifications(page)).toBe(0);
      await attend(() => lignes(page)).toContain(`${ROUGE} 3`);

      // Ctrl+Y rend le geste entier, pas une valeur intermediaire.
      await page.keyboard.press('Control+y');
      await attend(() => peinture(page, 'f1')).toEqual({ fond: '#708090', trait: null });
      expect(await modifications(page)).toBe(1);
    });

    it('compte une entree de plus quand le selecteur se referme puis se rouvre', async () => {
      const page = await editeur();
      const champ = await selecteur(page, ROUGE);
      await champ.fill('#102030');
      await champ.fill('#405060');
      await attend(() => modifications(page)).toBe(1);
      // Le selecteur perd le focus : le geste est fini.
      await champ.evaluate(e => e.blur());

      const suite = await selecteur(page, '#405060'.toUpperCase());
      await suite.fill('#708090');
      await attend(() => peinture(page, 'f1')).toEqual({ fond: '#708090', trait: null });
      await attend(() => modifications(page)).toBe(2);
      await page.keyboard.press('Control+z');
      await attend(() => peinture(page, 'f1')).toEqual({ fond: '#405060', trait: null });
    });

    // Les trois lectures de la liste : ce que le selecteur change suit ce que la ligne lit.
    const lectures = [
      { nom: 'Fond', cible: 'le fond', f1: '#00aa55', f5: { fond: '#1529a1', trait: '#c81e28' }, precision: ' (fond) : 2 formes.' },
      { nom: 'Trait', cible: 'le trait', f1: '#c81e28', f5: { fond: '#1529a1', trait: '#00aa55' }, precision: ' (trait) : 1 forme.' },
      { nom: 'Les deux', cible: 'le fond et le trait', f1: '#00aa55', f5: { fond: '#1529a1', trait: '#00aa55' }, precision: ' : 3 formes.' }
    ] as const;
    for (const l of lectures) {
      it(`en lecture « ${l.nom} », ne change que ${l.cible}`, async () => {
        const page = await editeur();
        await mode(page, l.nom);
        await attend(() => page.getByRole('button', { name: l.nom, exact: true }).getAttribute('aria-pressed')).toBe('true');
        expect(await ligneDe(page, ROUGE).locator('input[type=color]').getAttribute('title')).toContain(l.cible);
        const champ = await selecteur(page, ROUGE);
        await champ.fill('#00aa55');
        await attend(() => peinture(page, 'f1')).toEqual({ fond: l.f1, trait: null });
        expect(await peinture(page, 'f5')).toEqual(l.f5);
        await attend(() => message(page)).toBe(`${ROUGE} remplacée par #00AA55${l.precision}`);
        expect(await modifications(page)).toBe(1);
      });
    }
  });

  describe('selectionner la meme couleur', () => {
    it('est grise sans selection, et la touche C n\'y fait rien', async () => {
      const page = await editeur();
      await ouvrirMenu(page, 'Édition');
      const entree = page.getByRole('menuitem', { name: /Sélectionner la même couleur/ });
      await attend(() => entree.isDisabled()).toBe(true);
      await page.keyboard.press('Escape');
      await attend(() => page.getByRole('menu', { name: 'Édition' }).count()).toBe(0);

      const avant = await message(page);
      await page.keyboard.press('c');
      expect(await choisies(page)).toEqual([]);
      expect(await message(page)).toBe(avant);
    });

    it('prend, par le menu Edition, les formes de meme fond que la forme choisie', async () => {
      const page = await editeur();
      await calque(page, 'f1').click();
      await attend(() => choisies(page)).toEqual(['Forme 1']);
      await ouvrirMenu(page, 'Édition');
      const entree = page.getByRole('menuitem', { name: /Sélectionner la même couleur/ });
      await attend(() => entree.isDisabled()).toBe(false);
      expect(await entree.textContent()).toContain('C');
      await entree.click();
      // f5 porte le rouge en contour seulement : le modele est un fond, f5 n'est pas de la meme couleur.
      await attend(() => choisies(page)).toEqual(['Forme 2', 'Forme 1']);
      await attend(() => message(page)).toBe(`2 formes de même couleur ${ROUGE} choisies.`);
      // Choisir n'est pas modifier.
      expect(await modifications(page)).toBe(0);
    });

    it('s\'obtient aussi par la touche C, majuscule comprise, et dit quand la forme est seule de sa couleur', async () => {
      const page = await editeur();
      await calque(page, 'f6').click();
      await page.keyboard.press('c');
      await attend(() => choisies(page)).toEqual(['Forme 6']);
      await attend(() => message(page)).toBe(`Aucune autre forme n’a la couleur ${BLEU_RARE}.`);

      await calque(page, 'f7').click();
      await page.keyboard.press('Shift+C');
      await attend(() => choisies(page)).toEqual(['Forme 7', 'Forme 5']);
      await attend(() => message(page)).toBe(`2 formes de même couleur ${BLEU} choisies.`);
    });

    it('part du contour quand la forme n\'a pas de fond, sans prendre le fond d\'une autre', async () => {
      const page = await editeur();
      await calque(page, 'f9').click();
      await page.keyboard.press('c');
      // f11 a le meme code en fond : ce n'est pas un contour, on ne la prend pas.
      await attend(() => choisies(page)).toEqual(['Forme 10', 'Forme 9']);
      await attend(() => message(page)).toBe(`2 formes de même couleur ${ENCRE} choisies.`);
    });

    it('ignore les formes verrouillees', async () => {
      const page = await editeur();
      // f2 est verrouillee depuis la rangee de selection (une seule forme, pas toute sa couleur).
      await calque(page, 'f2').click();
      await page.getByRole('button', { name: 'Verrouiller', exact: true }).click();
      await attend(() => calque(page, 'f2').isDisabled()).toBe(true);

      await calque(page, 'f1').click();
      await page.keyboard.press('c');
      await attend(() => message(page)).toBe(`Aucune autre forme n’a la couleur ${ROUGE}.`);
      expect(await choisies(page)).toEqual(['Forme 1']);
    });
  });

  describe('nuances proches', () => {
    it('previent combien de nuances se fondraient, et suit le curseur de tolerance', async () => {
      const page = await editeur();
      const curseur = tolerance(page);
      expect(await curseur.inputValue()).toBe('4');
      expect(await curseur.getAttribute('aria-valuetext')).toBe('Tolérance 4 sur 15');
      // A 4 : #c91f27 et #d0343a se fondent dans #c81e28, #1428a0 dans #1529a1.
      await attend(() => apercu(page)).toBe('3 nuances se fondraient dans 2 couleurs.');

      await curseur.fill('1');
      await attend(() => curseur.getAttribute('aria-valuetext')).toBe('Tolérance 1 sur 15');
      expect(await texteDe(page.locator('.nuances-proches output'))).toBe('1');
      // A 1, #d0343a (0,034) reste seule.
      await attend(() => apercu(page)).toBe('2 nuances se fondraient dans 2 couleurs.');

      await curseur.fill('4');
      await attend(() => apercu(page)).toBe('3 nuances se fondraient dans 2 couleurs.');
      // Un apercu n'est pas une modification.
      expect(await modifications(page)).toBe(0);
    });

    it('lit l\'apercu sur la lecture choisie : aucun contour n\'a de nuance proche', async () => {
      const page = await editeur();
      await mode(page, 'Trait');
      await attend(() => lignes(page)).toEqual([`${ENCRE} 2`, `${ROUGE} 1`]);
      await attend(() => apercu(page)).toBe('Aucune nuance proche à cette tolérance.');
      await attend(() => fusionner(page).isDisabled()).toBe(true);

      await mode(page, 'Fond');
      await attend(() => apercu(page)).toBe('3 nuances se fondraient dans 2 couleurs.');
      await attend(() => fusionner(page).isDisabled()).toBe(false);
    });

    it('grise « Sélectionner les nuances proches » tant qu\'aucune couleur n\'est choisie', async () => {
      const page = await editeur();
      const bouton = selectionnerProches(page);
      expect(await bouton.isDisabled()).toBe(true);
      expect(await bouton.getAttribute('title')).toBe('Choisissez d’abord une couleur');

      await ligneDe(page, ROUGE).locator('.couleur-choix').click();
      await attend(() => bouton.isDisabled()).toBe(false);
      expect(await bouton.getAttribute('title')).toBe(`Choisir les formes proches de ${ROUGE}`);
    });

    it('choisit les formes de la couleur et de ses nuances, selon la tolerance', async () => {
      const page = await editeur();
      await ligneDe(page, ROUGE).locator('.couleur-choix').click();
      await attend(() => choisies(page)).toEqual(['Forme 5', 'Forme 2', 'Forme 1']);

      await selectionnerProches(page).click();
      // f1, f2, f3, f4 par leur fond, f5 par son contour.
      await attend(() => choisies(page)).toEqual(['Forme 5', 'Forme 4', 'Forme 3', 'Forme 2', 'Forme 1']);
      await attend(() => message(page)).toBe(`5 formes de nuance proche de ${ROUGE} (tolérance 4) choisies.`);

      await tolerance(page).fill('1');
      await selectionnerProches(page).click();
      await attend(() => choisies(page)).toEqual(['Forme 5', 'Forme 3', 'Forme 2', 'Forme 1']);
      await attend(() => message(page)).toBe(`4 formes de nuance proche de ${ROUGE} (tolérance 1) choisies.`);
      expect(await modifications(page)).toBe(0);
    });

    it('se fait aussi depuis le menu de la ligne, et laisse de cote une forme verrouillee', async () => {
      const page = await editeur();
      await page.getByRole('button', { name: `Verrouiller les formes ${ROUGE_LOIN}` }).click();
      await autresActions(page, ROUGE).click();
      await page.getByRole('menuitem', { name: 'Sélectionner les nuances proches' }).click();
      await attend(() => choisies(page)).toEqual(['Forme 5', 'Forme 3', 'Forme 2', 'Forme 1']);
      await attend(() => message(page)).toBe(`4 formes de nuance proche de ${ROUGE} (tolérance 4) choisies.`);
    });

    it('fusionne les nuances dans la couleur la plus employee, en une entree d\'historique', async () => {
      const page = await editeur();
      await fusionner(page).click();
      await attend(() => message(page)).toBe('3 couleurs fusionnées : 3 formes recolorées.');
      // #c91f27 et #d0343a vont au rouge (3 formes) ; #1428a0 (1 forme) va a #1529a1 (2 formes), bien que
      // son code soit le plus petit : on suit l'usage, pas l'ordre alphabetique.
      await attend(() => lignes(page)).toEqual([`${ROUGE} 5`, `${ENCRE} 3`, `${BLEU} 3`, `${OR} 1`]);
      expect(await peinture(page, 'f3')).toEqual({ fond: '#c81e28', trait: null });
      expect(await peinture(page, 'f4')).toEqual({ fond: '#c81e28', trait: null });
      expect(await peinture(page, 'f6')).toEqual({ fond: '#1529a1', trait: null });
      expect(await modifications(page)).toBe(1);
      // Plus rien a fusionner.
      await attend(() => apercu(page)).toBe('Aucune nuance proche à cette tolérance.');
      await attend(() => fusionner(page).isDisabled()).toBe(true);

      await page.keyboard.press('Control+z');
      await attend(() => lignes(page)).toHaveLength(7);
      expect((await peinture(page, 'f4')).fond).toBe('#d0343a');
      await attend(() => modifications(page)).toBe(0);
    });

    it('fusionne moins quand la tolerance est basse', async () => {
      const page = await editeur();
      await tolerance(page).fill('1');
      await fusionner(page).click();
      await attend(() => message(page)).toBe('2 couleurs fusionnées : 2 formes recolorées.');
      expect(await lignes(page)).toEqual([`${ROUGE} 4`, `${ENCRE} 3`, `${BLEU} 3`, `${ROUGE_LOIN} 1`, `${OR} 1`]);
    });

    it('ne recolore pas une forme verrouillee, et le dit dans le message', async () => {
      const page = await editeur();
      await page.getByRole('button', { name: `Verrouiller les formes ${ROUGE_LOIN}` }).click();
      await fusionner(page).click();
      await attend(() => message(page)).toBe('2 couleurs fusionnées : 2 formes recolorées, 1 couleur gardée par des formes verrouillées.');
      // f4 est verrouillee : elle garde sa nuance, qui reste donc dans la liste.
      expect((await peinture(page, 'f4')).fond).toBe('#d0343a');
      expect(await lignes(page)).toContain(`${ROUGE_LOIN} 1`);
      expect((await peinture(page, 'f3')).fond).toBe('#c81e28');
    });

    it('refuse, en le disant, quand toutes les nuances sont sur des formes verrouillees', async () => {
      const page = await editeur();
      for (const c of [ROUGE_PROCHE, ROUGE_LOIN, BLEU_RARE]) await page.getByRole('button', { name: `Verrouiller les formes ${c}` }).click();
      const avant = await modifications(page);
      await fusionner(page).click();
      await attend(() => message(page)).toBe('Ces nuances sont sur des formes verrouillées : déverrouillez-les pour les fusionner.');
      expect(await modifications(page)).toBe(avant);
    });
  });

  describe('quitter l\'isolement', () => {
    /** Isole la couleur `couleur` par le menu de sa ligne. */
    async function isoler(page: Page, couleur: string) {
      await autresActions(page, couleur).click();
      await page.getByRole('menuitem', { name: /N’afficher que cette couleur/ }).click();
    }
    const quitter = (page: Page) => page.getByRole('button', { name: 'Quitter l’isolement' });
    const visibilites = (page: Page) => page.locator('.editeur-svg-toile path[data-id]').evaluateAll(l => l.map(e => e.getAttribute('data-id')).sort());

    /** Le dessin dont l'or est masque a la main avant d'isoler. */
    async function orMasque() {
      const page = await editeur();
      await page.getByRole('button', { name: `Masquer les formes ${OR}` }).click();
      await attend(() => formesVisibles(page)).toBe(10);
      return page;
    }

    it('n\'offre le bouton qu\'une fois une couleur isolee', async () => {
      const page = await editeur();
      expect(await quitter(page).count()).toBe(0);
      await isoler(page, ENCRE);
      await attend(() => formesVisibles(page)).toBe(3);
      await attend(() => quitter(page).count()).toBe(1);
      await attend(() => texteDe(page.locator('.isolement'))).toContain('Une seule couleur est affichée.');
    });

    it('rend a chaque forme sa visibilite d\'avant, une forme masquee a la main restant masquee', async () => {
      const page = await orMasque();
      await isoler(page, ENCRE);
      await attend(() => formesVisibles(page)).toBe(3);

      await quitter(page).click();
      // Dix formes et non onze : l'or, masque a dessein avant l'isolement, ne revient pas.
      await attend(() => formesVisibles(page)).toBe(10);
      expect(await visibilites(page)).not.toContain('f8');
      expect(await ligneDe(page, OR).getAttribute('class')).toContain('attenue');
      await attend(() => quitter(page).count()).toBe(0);
      await attend(() => message(page)).toBe('Affichage d’avant l’isolement rétabli.');
    });

    it('garde l\'etat d\'avant le premier isolement quand on en enchaine un second', async () => {
      const page = await orMasque();
      await isoler(page, ENCRE);
      await attend(() => formesVisibles(page)).toBe(3);
      await isoler(page, ROUGE);
      // Le rouge : f1, f2 par le fond, f5 par le contour.
      await attend(() => visibilites(page)).toEqual(['f1', 'f2', 'f5']);

      await quitter(page).click();
      await attend(() => formesVisibles(page)).toBe(10);
      expect(await visibilites(page)).not.toContain('f8');
    });

    it('se defait par Ctrl+Z et se refait par Ctrl+Y, le bouton suivant l\'etat reel', async () => {
      const page = await orMasque();
      await isoler(page, ENCRE);
      await attend(() => quitter(page).count()).toBe(1);

      // Annuler l'isolement : les dix formes reviennent, plus rien a quitter.
      await page.keyboard.press('Control+z');
      await attend(() => formesVisibles(page)).toBe(10);
      await attend(() => quitter(page).count()).toBe(0);

      // Le retablir : l'isolement revient avec son bouton.
      await page.keyboard.press('Control+y');
      await attend(() => formesVisibles(page)).toBe(3);
      await attend(() => quitter(page).count()).toBe(1);

      // Quitter, puis annuler « Quitter » : on est de nouveau isole, et le bouton reparait.
      await quitter(page).click();
      await attend(() => formesVisibles(page)).toBe(10);
      await attend(() => quitter(page).count()).toBe(0);
      await page.keyboard.press('Control+z');
      await attend(() => formesVisibles(page)).toBe(3);
      await attend(() => quitter(page).count()).toBe(1);

      await quitter(page).click();
      await attend(() => formesVisibles(page)).toBe(10);
      expect(await visibilites(page)).not.toContain('f8');
    });

    it('oublie l\'isolement des qu\'on change la visibilite a la main', async () => {
      const page = await orMasque();
      await isoler(page, ENCRE);
      await attend(() => quitter(page).count()).toBe(1);

      // Reafficher l'or a la main : la visibilite n'est plus celle que l'isolement a produite.
      await page.getByRole('button', { name: `Afficher les formes ${OR}` }).click();
      await attend(() => formesVisibles(page)).toBe(4);
      await attend(() => quitter(page).count()).toBe(0);

      // Annuler ce geste ramene le dessin isole, mais l'isolement est oublie : pas de bouton qui ferait
      // revenir une visibilite que la personne a choisie depuis.
      await page.keyboard.press('Control+z');
      await attend(() => formesVisibles(page)).toBe(3);
      expect(await quitter(page).count()).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Le telephone : 420 px, au doigt. Les lignes de couleur y sont dans le tiroir des calques.
// ---------------------------------------------------------------------------------------------

describe('calques par couleur au doigt (420 px)', () => {
  const navigateur = pilote();
  const CIBLE_MIN = 40;

  async function telephone() {
    const { page } = await navigateur.ouvrir({ largeur: 420, hauteur: 860, tactile: true });
    await ouvrirCode(page, DESSIN, true);
    await page.getByRole('button', { name: 'Calques' }).tap();
    await attend(() => page.locator('.editeur-calques').evaluate(e => getComputedStyle(e).visibility)).toBe('visible');
    // Le tiroir glisse (0,22 s) puis se pose : on mesure une fois qu'il est en place.
    await attend(() => page.locator('.editeur-calques').evaluate(e => getComputedStyle(e).transform)).toBe('none');
    return page;
  }

  /** Les controles visibles de `racine` dont un cote est sous 40 px (une piste de curseur ne compte que par sa hauteur). */
  const petitesCibles = (racine: Locator) => racine.locator('button:visible, input:visible, select:visible').evaluateAll(
    (l, min) => l
      .map(e => { const r = e.getBoundingClientRect(); return { nom: (e.getAttribute('aria-label') ?? (e as HTMLElement).innerText ?? e.className).slice(0, 40), l: Math.round(r.width), h: Math.round(r.height), type: (e as HTMLInputElement).type }; })
      .filter(c => c.h < min || (c.type !== 'range' && c.l < min)),
    CIBLE_MIN
  );

  it('donne 40 px au moins aux boutons de chaque ligne et au selecteur de couleur', async () => {
    const page = await telephone();
    const lignes = page.locator('.par-couleur li');
    await attend(() => lignes.count()).toBe(7);
    // Par ligne : le selecteur, le nom, l'oeil, le verrou et le menu.
    expect(await lignes.first().locator('button, input').count()).toBe(5);
    expect(await petitesCibles(page.locator('.par-couleur'))).toEqual([]);
  });

  it('donne 40 px au moins aux commandes des nuances proches', async () => {
    const page = await telephone();
    expect(await petitesCibles(page.locator('.nuances-proches'))).toEqual([]);
    expect(await petitesCibles(page.locator('.editeur-calques .mini-onglets'))).toEqual([]);
    // La piste du curseur est assez haute pour un doigt.
    const piste = await page.locator('.nuances-proches input[type=range]').boundingBox();
    expect(piste?.height ?? 0).toBeGreaterThanOrEqual(CIBLE_MIN);
  });

  it('ne deborde pas du panneau, meme avec le message le plus long', async () => {
    const page = await telephone();
    const debordements = () => page.evaluate(() => {
      const calques = document.querySelector('.editeur-calques') as HTMLElement;
      const cadre = calques.getBoundingClientRect();
      const dehors = [...calques.querySelectorAll('.par-couleur, .par-couleur li, .nuances-proches, .nuances-proches button, .mini-onglets')]
        .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > cadre.right + 0.5 || r.left < cadre.left - 0.5); })
        .map(e => e.className || e.tagName);
      // La page : `clientWidth`, que Chromium n'elargit pas sous `isMobile` comme il elargit `innerWidth`.
      return { dehors, panneau: calques.scrollWidth - calques.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(await debordements()).toEqual({ dehors: [], panneau: 0, page: 0 });

    // Le message le plus long de la section : une fusion avec une forme verrouillee.
    await page.getByRole('button', { name: `Verrouiller les formes ${ROUGE_LOIN}` }).tap();
    await page.getByRole('button', { name: 'Fusionner les nuances proches' }).tap();
    await attend(() => page.locator('.message-etat').innerText()).toContain('gardée par des formes verrouillées');
    expect(await debordements()).toEqual({ dehors: [], panneau: 0, page: 0 });
  });

  it('ouvre le menu d\'une ligne tout entier dans l\'ecran, avec des entrees de 40 px', async () => {
    const page = await telephone();
    await page.locator(`[aria-label="Autres actions sur ${ROUGE}"]`).tap();
    const panneau = page.locator('.menu-panneau');
    await attend(() => panneau.isVisible()).toBe(true);
    const boite = await panneau.boundingBox();
    expect(boite).not.toBeNull();
    expect(boite?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((boite?.x ?? 0) + (boite?.width ?? 0)).toBeLessThanOrEqual(420);
    const hauteurs = await panneau.locator('[role^=menuitem]').evaluateAll(l => l.map(e => Math.round(e.getBoundingClientRect().height)));
    expect(hauteurs.length).toBeGreaterThan(3);
    expect(hauteurs.filter(h => h < CIBLE_MIN)).toEqual([]);
  });
});

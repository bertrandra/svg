import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  annexePosee, definirBaseAnnexes, definirSourceDonnees, fabriquerChargeurAnnexe, memoiserSucces, messageVide, navigateur, nomDonnees, normaliserBase, urlAnnexe,
  type Amenees, type Annexe
} from '../../../src/io/annexes.js';

afterEach(() => {
  definirBaseAnnexes('');
  definirSourceDonnees(null);
  vi.unstubAllGlobals();
});

describe('normaliserBase', () => {
  it('ajoute la barre finale, sauf pour une base vide ou deja terminee', () => {
    expect(normaliserBase('')).toBe('');
    expect(normaliserBase('  ')).toBe('');
    expect(normaliserBase('../dist')).toBe('../dist/');
    expect(normaliserBase('/static/svg/')).toBe('/static/svg/');
    expect(normaliserBase('https://cdn.exemple.fr/svg')).toBe('https://cdn.exemple.fr/svg/');
  });
});

describe('urlAnnexe', () => {
  it('rend le nom nu par defaut : a cote de la page, comme avant', () => {
    expect(urlAnnexe('bibliotheque.js')).toBe('bibliotheque.js');
  });

  it('range les annexes sous la base donnee, et revient au defaut', () => {
    definirBaseAnnexes('../dist');
    expect(urlAnnexe('polices.js')).toBe('../dist/polices.js');
    definirBaseAnnexes('');
    expect(urlAnnexe('polices.js')).toBe('polices.js');
  });
});

// Le chargeur commun des trois annexes : un navigateur simule, sans page, comme pour le traceur.
interface Charge { n: number }
const annexe: Annexe<Charge> = {
  fichier: 'essai.js',
  globale: '__essaiSvg',
  contenu: 'l essai',
  consigne: 'lancez « npm run essai »',
  valider: v => (typeof v === 'object' && v !== null && 'n' in v && typeof v.n === 'number' ? v as Charge : undefined)
};

/** `arrive` : le script s'injecte ; `pose` : ce qu'il met sur la fenetre quand il arrive. */
function navigateurSimule(arrive: boolean, pose: unknown = { n: 1 }) {
  const fenetre: Record<string, unknown> = {};
  const injecter = vi.fn(async () => { if (arrive) fenetre[annexe.globale] = pose; return arrive; });
  const amenees: Amenees = { injecter, lire: g => fenetre[g] };
  return { amenees, injecter, fenetre };
}

describe('le chargeur d une annexe', () => {
  it('n injecte le script qu une fois, meme demande de front puis plus tard, et garde le succes', async () => {
    const { amenees, injecter } = navigateurSimule(true);
    const c = fabriquerChargeurAnnexe(annexe, amenees);
    expect(c.pret()).toBe(false);
    const [a, b] = await Promise.all([c.charger(), c.charger()]);
    expect(a).toBe(b);
    expect(await c.charger()).toBe(a);
    expect(injecter).toHaveBeenCalledTimes(1);
    expect(injecter).toHaveBeenCalledWith('essai.js');
    expect(c.pret()).toBe(true);
  });

  it('ne rajoute rien quand le script a deja pose sa valeur', async () => {
    const { amenees, injecter, fenetre } = navigateurSimule(true);
    fenetre['__essaiSvg'] = { n: 7 };
    expect(await fabriquerChargeurAnnexe(annexe, amenees).charger()).toEqual({ n: 7 });
    expect(injecter).not.toHaveBeenCalled();
  });

  it('dit que le fichier manque a cote de la page, et repart de rien quand il est pose entre-temps', async () => {
    let present = false;
    const fenetre: Record<string, unknown> = {};
    const injecter = vi.fn(async () => { if (present) fenetre['__essaiSvg'] = { n: 2 }; return present; });
    const c = fabriquerChargeurAnnexe(annexe, { injecter, lire: g => fenetre[g] });
    await expect(c.charger()).rejects.toThrow('Le fichier essai.js est introuvable à côté de la page : lancez « npm run essai ».');
    expect(c.pret()).toBe(false);
    present = true;
    expect(await c.charger()).toEqual({ n: 2 });
    expect(injecter).toHaveBeenCalledTimes(2);
  });

  it('refuse un script arrive sans rien, ou avec une valeur de mauvaise forme, puis reessaie', async () => {
    // Le script « arrive » mais ce qu'il pose change d'un essai a l'autre : rien, puis du faux, puis du bon.
    const poses: unknown[] = [undefined, 'pas la bonne forme', { n: 3 }];
    const fenetre: Record<string, unknown> = {};
    const c = fabriquerChargeurAnnexe(annexe, { injecter: async () => { fenetre['__essaiSvg'] = poses.shift(); return true; }, lire: g => fenetre[g] });
    await expect(c.charger()).rejects.toThrow('Le fichier essai.js ne contient pas l essai.');
    await expect(c.charger()).rejects.toThrow(messageVide(annexe));
    expect(await c.charger()).toEqual({ n: 3 });
  });

  it('cherche le fichier sous la base donnee', async () => {
    const { amenees, injecter } = navigateurSimule(true);
    definirBaseAnnexes('/static/svg');
    await fabriquerChargeurAnnexe(annexe, amenees).charger();
    expect(injecter).toHaveBeenCalledWith('/static/svg/essai.js');
  });
});

describe('memoiserSucces', () => {
  it('garde un succes, oublie un echec et ne rend que des Error', async () => {
    let essais = 0;
    const m = memoiserSucces(async () => { essais++; if (essais === 1) throw 'chaine brute'; return essais; });
    await expect(m.charger()).rejects.toThrow('chaine brute');
    expect(m.pret()).toBe(false);
    expect(await m.charger()).toBe(2);
    expect(await m.charger()).toBe(2);
    expect(m.pret()).toBe(true);
  });
});

describe('annexePosee', () => {
  it('lit la globale sans rien demander, et n accepte que la bonne forme', () => {
    const { amenees, fenetre } = navigateurSimule(true);
    expect(annexePosee(annexe, amenees)).toBe(false);
    fenetre['__essaiSvg'] = { n: 'x' };
    expect(annexePosee(annexe, amenees)).toBe(false);
    fenetre['__essaiSvg'] = { n: 1 };
    expect(annexePosee(annexe, amenees)).toBe(true);
  });
});

describe('le navigateur reel', () => {
  it('ajoute la balise, la retire a l arrivee comme a l echec, et lit la globale de la fenetre', async () => {
    const balises: Array<{ src: string; onload: () => void; onerror: () => void; remove: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal('window', { __essaiSvg: { n: 9 } });
    vi.stubGlobal('document', {
      createElement: () => {
        const s = { src: '', onload: () => undefined, onerror: () => undefined, remove: vi.fn() };
        balises.push(s);
        return s;
      },
      head: { appendChild: (s: { onload: () => void; onerror: () => void }) => queueMicrotask(() => (balises.length === 1 ? s.onload() : s.onerror())) }
    });
    expect(navigateur.lire('__essaiSvg')).toEqual({ n: 9 });
    expect(await navigateur.injecter('a.js')).toBe(true);
    expect(await navigateur.injecter('b.js')).toBe(false);
    expect(balises.map(b => b.src)).toEqual(['a.js', 'b.js']);
    expect(balises.every(b => b.remove.mock.calls.length === 1)).toBe(true);
  });
});

describe('les annexes de donnees servies en JSON (le site PHP, ADR-0030)', () => {
  const donnees: Annexe<Charge> = {
    fichier: 'essai-donnees.js', globale: '__essaiDonnees', contenu: 'l essai', consigne: 'construisez', donnees: true,
    valider: v => (typeof v === 'object' && v !== null && typeof (v as Charge).n === 'number' ? v as Charge : undefined)
  };
  const sansScript: Amenees = { injecter: () => Promise.reject(new Error('aucune balise script ne doit etre posee')), lire: () => undefined };

  it('se lisent de la source posee, par leur nom sans « .js », et se valident comme une globale', async () => {
    const demandes: string[] = [];
    definirSourceDonnees(nom => { demandes.push(nom); return Promise.resolve({ n: 7 }); });
    expect(nomDonnees(donnees)).toBe('essai-donnees');
    expect(await fabriquerChargeurAnnexe(donnees, sansScript).charger()).toEqual({ n: 7 });
    expect(demandes).toEqual(['essai-donnees']);
    expect(annexePosee(donnees, sansScript)).toBe(true);
  });

  it('refusent une valeur malformee ou absente en le disant, sans lever ailleurs que dans la promesse', async () => {
    definirSourceDonnees(() => Promise.resolve({ n: 'pas un nombre' }));
    await expect(fabriquerChargeurAnnexe(donnees, sansScript).charger()).rejects.toThrow(messageVide(donnees));
    definirSourceDonnees(() => Promise.resolve(undefined));
    await expect(fabriquerChargeurAnnexe(donnees, sansScript).charger()).rejects.toThrow(/introuvables sur le serveur/);
  });

  it('laissent le code (le traceur) et les pages sans source aux balises <script>', async () => {
    definirSourceDonnees(() => Promise.reject(new Error('le code ne passe pas par la source de donnees')));
    const code: Annexe<Charge> = { ...donnees, donnees: false, fichier: 'code.js', globale: '__code' };
    const pose: Record<string, unknown> = {};
    const amenees: Amenees = { injecter: () => { pose['__code'] = { n: 1 }; return Promise.resolve(true); }, lire: g => pose[g] };
    expect(await fabriquerChargeurAnnexe(code, amenees).charger()).toEqual({ n: 1 });
  });
});

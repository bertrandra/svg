import { describe, it, expect } from 'vitest';
import { ajouterForme, ellipse, etoile, lireDessin, polygone, rectangle, STYLE_DEFAUT, type DessinSvg, type Forme } from '../../../src/engine/editionSvg.js';
import { couleurDite, genreDeForme, mesuresDites, nomDeCouleur, nomDeForme, nombreFr, peintureDite } from '../../../src/engine/description.js';
import { au } from '../../../src/util/tableaux.js';

const lire = (corps: string): DessinSvg => {
  const r = lireDessin(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">${corps}</svg>`);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const VIDE: DessinSvg = { vb: [0, 0, 240, 160], formes: [] };
const premiere = (corps: string): Forme => au(lire(corps).formes, 0);
/** Une forme dessinee par les outils de l'editeur, comme au clavier ou a la souris. */
const tracee = (d: ReturnType<typeof rectangle>): Forme => au(ajouterForme(VIDE, d, STYLE_DEFAUT).dessin.formes, 0);

describe('nombreFr', () => {
  it('garde assez de decimales pour qu un pas du clavier s entende, avec une virgule et sans zero de fin', () => {
    expect(nombreFr(120.44)).toBe('120,4');
    expect(nombreFr(170.24)).toBe('170,2');
    expect(nombreFr(12.46)).toBe('12,5');
    expect(nombreFr(3.456)).toBe('3,46');
    expect(nombreFr(40)).toBe('40');
    expect(nombreFr(2400.4)).toBe('2400');
    expect(nombreFr(0.024)).toBe('0,02');
  });

  it('ne dit jamais « -0 »', () => {
    expect(nombreFr(-0.001)).toBe('0');
    expect(nombreFr(-12.34)).toBe('-12,3');
  });
});

describe('genreDeForme', () => {
  it('reconnait ce que tracent les outils', () => {
    expect(genreDeForme(tracee(rectangle(0, 0, 40, 20)))).toBe('rectangle');
    expect(genreDeForme(tracee(rectangle(0, 0, 30, 30)))).toBe('carré');
    expect(genreDeForme(tracee(ellipse(0, 0, 40, 20)))).toBe('ellipse');
    expect(genreDeForme(tracee(ellipse(0, 0, 30, 30)))).toBe('cercle');
    expect(genreDeForme(tracee(etoile(0, 0, 40, 40)))).toBe('étoile');
    expect(genreDeForme(tracee(polygone([[0, 0], [30, 0]], false)))).toBe('ligne');
    expect(genreDeForme(tracee(polygone([[0, 0], [30, 0], [30, 20]], false)))).toBe('ligne brisée');
    expect(genreDeForme(tracee(polygone([[0, 0], [30, 0], [15, 20]], true)))).toBe('triangle');
    expect(genreDeForme(tracee(polygone([[0, 0], [30, 0], [30, 20], [10, 25], [0, 10]], true)))).toBe('polygone à 5 sommets');
  });

  it('reconnait ce qu un SVG ecrit : rect, circle, et un rectangle fait de segments', () => {
    expect(genreDeForme(premiere('<rect x="10" y="10" width="80" height="40"/>'))).toBe('rectangle');
    expect(genreDeForme(premiere('<circle cx="50" cy="50" r="20"/>'))).toBe('cercle');
    expect(genreDeForme(premiere('<ellipse cx="50" cy="50" rx="30" ry="10"/>'))).toBe('ellipse');
    expect(genreDeForme(premiere('<path d="M10 10L90 10L90 50L10 50Z"/>'))).toBe('rectangle');
  });

  // Depuis les formes de base (ADR-0033), un losange et un rectangle aux coins ronds se disent par leur nom.
  it('ne prend pas un losange pour un rectangle, ni une courbe pour un polygone', () => {
    expect(genreDeForme(premiere('<path d="M50 0L100 50L50 100L0 50Z"/>'))).toBe('losange');
    expect(genreDeForme(premiere('<path d="M50 0L100 40L60 100L0 50Z"/>'))).toBe('polygone à 4 sommets');
    expect(genreDeForme(premiere('<path d="M0 0Q50 50 100 0"/>'))).toBe('courbe');
    expect(genreDeForme(premiere('<path d="M0 0Q50 50 100 0L50 80Z"/>'))).toBe('tracé courbe');
    expect(genreDeForme(premiere('<rect x="0" y="0" width="80" height="40" rx="10"/>'))).toBe('rectangle arrondi');
  });
});

describe('les couleurs dites', () => {
  it('nomme les teintes du nuancier de l exemple', () => {
    expect(nomDeCouleur('#c81e28')).toBe('rouge');
    expect(nomDeCouleur('#1428a0')).toBe('bleu');
    expect(nomDeCouleur('#15181d')).toBe('noir');
    expect(nomDeCouleur('#ffffff')).toBe('blanc');
    expect(nomDeCouleur('#e9ecef')).toBe('blanc');
  });

  it('nomme gris, vert, jaune, orange, violet, rose, marron, turquoise et leurs nuances', () => {
    expect(nomDeCouleur('#808080')).toBe('gris');
    expect(nomDeCouleur('#404040')).toBe('gris foncé');
    expect(nomDeCouleur('#c0c0c0')).toBe('gris clair');
    expect(nomDeCouleur('#00a000')).toBe('vert');
    expect(nomDeCouleur('#ffd23f')).toBe('jaune');
    expect(nomDeCouleur('#ff8000')).toBe('orange');
    expect(nomDeCouleur('#8000c0')).toBe('violet');
    expect(nomDeCouleur('#ff40a0')).toBe('rose');
    expect(nomDeCouleur('#8b4513')).toBe('marron');
    expect(nomDeCouleur('#00c0c0')).toBe('turquoise');
    expect(nomDeCouleur('#ff9999')).toBe('rouge clair');
  });

  it('ne devine rien d un texte qui n est pas un code', () => {
    expect(nomDeCouleur('rouge')).toBeNull();
    expect(couleurDite('#C81E28')).toBe('rouge #c81e28');
    expect(couleurDite('currentColor')).toBe('currentcolor');
  });
});

describe('la description d une forme', () => {
  const f = premiere('<rect x="40" y="60" width="120" height="80" fill="#c81e28"/>');

  it('dit la peinture, les mesures et le nom accessible', () => {
    expect(peintureDite(f)).toBe('fond rouge #c81e28');
    expect(mesuresDites(f)).toBe('120 × 80 à 40, 60');
    expect(nomDeForme(f)).toBe('Rectangle 1, fond rouge #c81e28');
  });

  it('dit un contour, l absence de fond, une forme verrouillee ou masquee', () => {
    const trait = premiere('<path d="M0 0L50 0" fill="none" stroke="#15181d" stroke-width="4"/>');
    expect(peintureDite(trait)).toBe('sans fond, contour noir #15181d');
    expect(nomDeForme({ ...f, verrouille: true, visible: false })).toBe('Rectangle 1, fond rouge #c81e28, verrouillée, masquée');
  });
});

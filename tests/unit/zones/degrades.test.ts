// L'interface des degrades et le brouillon des effets (ADR-0012, etapes 4 et 7-B) : les phrases d'un arret, d'une extremite, du genre
// (la couleur nommee avant son code, ADR-0011), le cote dont la toile montre les poignees, et le compte des noeuds a effet qui decide
// du brouillon (au-dela de vingt, les effets ne se rendent qu'au repos).

import { describe, expect, it } from 'vitest';
import type { Degrade, DessinSvg, Forme } from '../../../src/engine/editionSvg.js';
import { nomExtremite, phraseArret, phraseArretAjoute, phraseArretRetire, phraseExtremite, phraseGenre, phrasePositionArret, pourCent } from '../../../src/zones/phrasesDegrades.js';
import { coteAPoignees } from '../../../src/zones/PoigneesDegrade.js';
import { effetsAuRepos, noeudsAEffet, SEUIL_EFFETS_AU_REPOS } from '../../../src/zones/brouillon.js';
import { morceauxDefinitions } from '../../../src/zones/ToileNoeuds.js';
import { lireDessin, renduDe } from '../../../src/engine/editionSvg.js';

const G: Degrade = { genre: 'lineaire', x1: 0, y1: 0, x2: 10, y2: 0, arrets: [{ position: 0, couleur: '#c81e28' }, { position: 0.4, couleur: '#1f5fb0', opacite: 0.5 }, { position: 1, couleur: '#000000' }] };
const forme = (id: string, champs: Partial<Forme> = {}): Forme => ({ id, d: [{ c: 'M', p: [0, 0] }, { c: 'L', p: [1, 1] }], remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...champs });

describe('les phrases des degrades', () => {
  it('un arret : son rang, sa couleur nommee avant son code, sa position, son opacite si elle n est pas pleine', () => {
    expect(phraseArret(G, 0)).toBe('Arrêt 1 sur 3, rouge #c81e28, à 0 %');
    expect(phraseArret(G, 1)).toBe('Arrêt 2 sur 3, bleu #1f5fb0, à 40 %, opacité 50 %');
    expect(phrasePositionArret(1, 0.555)).toBe('Arrêt 2 : 55,5 %.');
    expect(pourCent(1 / 3)).toBe('33,3');
  });

  it('les extremites, le genre, un arret ajoute ou retire', () => {
    expect(nomExtremite('lineaire', 'debut')).toBe('Début du dégradé');
    expect(nomExtremite('radial', 'fin')).toBe('Bord du dégradé');
    expect(phraseExtremite('radial', 'debut', [30, 100.5])).toBe('Centre du dégradé : 30, 100,5.');
    expect(phraseGenre('remplissage', 'lineaire')).toBe('Remplissage : dégradé linéaire.');
    expect(phraseGenre('contour', 'uni')).toBe('Contour : couleur unie.');
    expect(phraseArretAjoute(2, 4)).toBe('Arrêt ajouté : 3 sur 4.');
    expect(phraseArretRetire(1)).toBe('Arrêt retiré : 1 arrêt reste.');
    expect(phraseArretRetire(3)).toBe('Arrêt retiré : 3 arrêts restent.');
  });
});

describe('les poignees de la toile', () => {
  it('le remplissage en degrade a les poignees, sinon le contour ; une forme masquee ou unie n en a pas', () => {
    expect(coteAPoignees(forme('f1', { peintureRemplissage: G, peintureContour: G }))).toBe('remplissage');
    expect(coteAPoignees(forme('f1', { peintureContour: G, contour: '#000000' }))).toBe('contour');
    expect(coteAPoignees(forme('f1'))).toBeNull();
    expect(coteAPoignees(forme('f1', { peintureRemplissage: G, visible: false }))).toBeNull();
    expect(coteAPoignees(null)).toBeNull();
  });
});

describe('le brouillon des effets', () => {
  const dessin = (n: number, groupes = 0): DessinSvg => ({
    vb: [0, 0, 100, 100],
    formes: Array.from({ length: n + 2 }, (_, i) => forme('f' + (i + 1), i < n ? { effets: { flou: { ecart: 2 } } } : {})),
    ...(groupes ? { groupes: Object.fromEntries(Array.from({ length: groupes }, (_, i) => ['g' + (i + 1), { id: 'g' + (i + 1), visible: true, verrouille: false, effets: { ombre: { dx: 1, dy: 1, ecart: 1, couleur: '#000000', opacite: 0.5 } } }])) } : {})
  } as DessinSvg);

  it('compte les feuilles et les groupes visibles a effet, memorise par dessin', () => {
    const d = dessin(3, 2);
    expect(noeudsAEffet(d)).toBe(5);
    expect(noeudsAEffet(d)).toBe(5);
    expect(noeudsAEffet({ ...d, formes: d.formes.map(f => ({ ...f, visible: false })) })).toBe(2);
  });

  it('au-dela de vingt noeuds a effet, les effets ne se rendent qu au repos', () => {
    expect(SEUIL_EFFETS_AU_REPOS).toBe(20);
    expect(effetsAuRepos(dessin(20))).toBe(false);
    expect(effetsAuRepos(dessin(21))).toBe(true);
    expect(effetsAuRepos(dessin(19, 2))).toBe(true);
  });
});

describe('les definitions de la toile, une par element', () => {
  it('se decoupent a chaque identifiant du recueil, dans l ordre, sans rien perdre ni dedoubler', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="a"><stop offset="0" stop-color="#c81e28"/><stop offset="1" stop-color="#1f5fb0"/></linearGradient>'
      + '<filter id="f"><feGaussianBlur stdDeviation="2"/></filter></defs><rect width="40" height="40" fill="url(#a)" filter="url(#f)"/><rect x="50" width="40" height="40" fill="url(#a)"/></svg>';
    const r = lireDessin(svg, { modele: 'riche' });
    if ('erreur' in r) throw new Error(r.erreur);
    const defs = renduDe(r.dessin).definitions, morceaux = morceauxDefinitions(defs);
    expect(morceaux.map(m => m.id.replace(/[0-9a-f]{14}$/, ''))).toEqual(['ed-d-', 'ed-f-', 'ed-d-']);
    expect(morceaux.map(m => m.balisage).join('')).toBe(defs);
    expect(new Set(morceaux.map(m => m.id)).size).toBe(morceaux.length);
    expect(morceauxDefinitions('')).toEqual([]);
  });
});

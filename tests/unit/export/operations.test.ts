// L'export Cricut d'un dessin qui mele couper et ecrire (ADR-0028) : un seul SVG quand une seule operation compte (les octets
// d'avant), trois fichiers sinon (a couper : des fonds pleins ; a ecrire : des traits sans fond ; combine : deux groupes), au meme
// cadre et a la meme taille physique, dans une archive avec son mode d'emploi. Reproductible, et sans `data-ed-operation`.

import { describe, expect, it } from 'vitest';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { constatsPreparation, partagerOperations, poserOperation, resoudreProfil, type ProfilProduction } from '../../../src/engine/preparation.js';
import { modeDEmploiOperations, nomsOperations, operationsPeintes, svgCombine, type ExportParOperation } from '../../../src/export/operations.js';
import { CHOIX_CRICUT_DEFAUT, DESIGN_SPACE_OPERATIONS, type Procede } from '../../../src/model/contextes.js';
import { archiveOperations, exportParOperation, svgCricut, svgPourStylo } from './plats.js';

const lire = (corps: string): DessinSvg => { const r = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 288">' + corps + '</svg>'); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const profil = (procede: Procede): ProfilProduction => {
  const p = resoudreProfil({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, unite: 'in', procede });
  if (!p) throw new Error('profil');
  return p;
};
const MAKER = profil('decoupe'), STYLO = profil('dessin-stylo');
const PLEIN = '<path d="M48 48H240V240H48Z" fill="#c81e28"/><circle cx="360" cy="96" r="48" fill="#1f4e8c"/>';
const LIGNES = '<path d="M288 192L432 192" fill="none" stroke="#15181d" stroke-width="2"/><path d="M288 240C330 210 390 270 432 240" fill="none" stroke="#2a7f3f" stroke-width="2"/>';
const MELE = lire(PLEIN + LIGNES);
const mixte = (r: ExportParOperation) => { if ('erreur' in r || r.genre !== 'mixte') throw new Error('erreur' in r ? r.erreur : 'attendu : mixte'); return r; };
const racine = (s: string) => /^<svg[^>]*>/.exec(s)?.[0] ?? '';
const remplissages = (s: string) => [...s.matchAll(/ fill="([^"]*)"/g)].map(m => m[1]);

describe('l export selon les operations', () => {
  it('un dessin tout entier pour la lame s exporte comme avant : le meme SVG de decoupe, octet pour octet', () => {
    const d = lire(PLEIN);
    const r = exportParOperation(d, MAKER);
    const avant = svgCricut(d, MAKER);
    if ('erreur' in r || 'erreur' in avant) throw new Error('refus');
    expect(r).toEqual({ genre: 'decoupe', svg: avant.svg, couches: 2 });
  });

  it('un dessin tout entier pour le stylo s exporte comme avant : le meme SVG du stylo', () => {
    const d = lire(LIGNES);
    const r = exportParOperation(d, MAKER), avant = svgPourStylo(d, MAKER);
    if ('erreur' in r || avant.erreur !== undefined) throw new Error('refus');
    expect(r.genre).toBe('ecriture');
    expect('svg' in r && r.svg).toBe(avant.svg);
    expect(exportParOperation(lire(PLEIN), STYLO)).toMatchObject({ genre: 'ecriture' });
  });

  it('un dessin mele : un fichier de fonds pleins, un fichier de traits sans fond, au meme cadre et a la meme taille', () => {
    const r = mixte(exportParOperation(MELE, MAKER));
    expect(r.formes).toEqual({ decoupe: 2, ecriture: 2 });
    expect(r.couches).toBe(2);
    expect(r.stylos).toBe(2);
    expect(r.aCouper.match(/<path /g)).toHaveLength(2);
    expect(r.aCouper).not.toMatch(/stroke/);
    expect(remplissages(r.aCouper).every(v => /^#[0-9a-f]{6}$/.test(v ?? ''))).toBe(true);
    expect(r.aEcrire.match(/<path /g)).toHaveLength(2);
    expect(remplissages(r.aEcrire).every(v => v === 'none')).toBe(true);
    for (const s of [r.aCouper, r.aEcrire, r.combine]) expect(racine(s)).toContain('viewBox="0 0 480 288" width="5in" height="3in"');
    expect(racine(r.aCouper)).toContain('data-ed-procede="decoupe"');
    expect(racine(r.aEcrire)).toContain('data-ed-procede="dessin-stylo"');
  });

  it('le fichier combine : les formes a couper puis les formes a ecrire, en deux groupes nommes, et la marque de la decoupe', () => {
    const r = mixte(exportParOperation(MELE, MAKER));
    const groupes = [...r.combine.matchAll(/<g id="([a-z-]+)">(.*?)<\/g>/g)].map(m => [m[1], (m[2] ?? '').match(/<path /g)?.length]);
    expect(groupes).toEqual([['a-couper', 2], ['a-ecrire', 2]]);
    expect(racine(r.combine)).toContain('data-ed-procede="decoupe"');
    expect(svgCombine(MELE, MAKER)).toBe(r.combine);
    // Rouvert, il se partage de lui-meme : les fonds se coupent, les lignes s'ecrivent, sans rien porter sur les formes.
    const relu = lireDessin(r.combine);
    if ('erreur' in relu) throw new Error(relu.erreur);
    const p = partagerOperations(relu.dessin, 'decoupe');
    expect([p.decoupe.formes.length, p.ecriture.formes.length]).toEqual([2, 2]);
    expect(constatsPreparation(relu.dessin, MAKER)).toEqual([]);
  });

  it('suit le choix de la personne : au stylo, une forme dite « à couper » part dans le fichier de la lame', () => {
    const d = poserOperation(MELE, ['f1'], 'decoupe', 'dessin-stylo').dessin;
    const r = mixte(exportParOperation(d, STYLO));
    expect(r.formes).toEqual({ decoupe: 1, ecriture: 3 });
    expect(r.aCouper.match(/<path /g)).toHaveLength(1);
    expect(r.aEcrire.match(/<path /g)).toHaveLength(3);
    expect(operationsPeintes(d, STYLO)).toEqual({ decoupe: 1, ecriture: 3 });
  });

  it('n ecrit jamais l operation dans un export : chaque fichier le dit par ce qu il porte', () => {
    const d = poserOperation(MELE, ['f2'], 'ecriture', 'decoupe').dessin;
    const r = mixte(exportParOperation(d, MAKER));
    for (const s of [r.aCouper, r.aEcrire, r.combine]) expect(s).not.toContain('data-ed-operation');
  });

  it('refuse un dessin mele a constat bloquant, en le nommant', () => {
    const d = lire('<path d="M48 48H240V240H48Z" fill="#c81e28" opacity="0.5"/>' + LIGNES);
    const r = exportParOperation(d, MAKER);
    expect('erreur' in r && r.erreur).toMatch(/^Corrigez d’abord.*transparente/);
  });

  it('ecrit les memes octets deux fois, archive comprise', () => {
    const a = mixte(exportParOperation(MELE, MAKER)), b = mixte(exportParOperation(MELE, MAKER));
    expect(a).toEqual(b);
    expect(archiveOperations('carte', MELE, MAKER, a)).toEqual(archiveOperations('carte', MELE, MAKER, b));
  });

  it('range dans l archive le mode d emploi et les trois fichiers, et dit ce qui reste a verifier dans Design Space', () => {
    const r = mixte(exportParOperation(MELE, MAKER));
    // Un nom sur dans l'archive : sans separateur de dossier (le nom de la page est deja sans accent ni espace, nomDeFichier).
    expect(nomsOperations('carte/noel')).toEqual({ archive: 'carte_noel-cricut.zip', aCouper: 'carte_noel-a-couper.svg', aEcrire: 'carte_noel-a-ecrire.svg', combine: 'carte_noel-cricut.svg' });
    const zip = new TextDecoder().decode(archiveOperations('carte', MELE, MAKER, r));
    for (const nom of ['LISEZMOI.txt', 'carte-a-couper.svg', 'carte-a-ecrire.svg', 'carte-cricut.svg']) expect(zip).toContain(nom);
    const lisezmoi = modeDEmploiOperations('carte', MELE, MAKER, r);
    expect(lisezmoi).toContain('À VÉRIFIER');
    expect(lisezmoi).toContain('« Dessiner »');
    expect(lisezmoi).toContain('5 × 3 po');
    for (const c of DESIGN_SPACE_OPERATIONS) expect(lisezmoi).toContain(c.texte);
  });
});

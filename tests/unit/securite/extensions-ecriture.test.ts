// Les extensions de l'ecriture permise (extensionsEcriture.ts, ADR-0012) : sans extension, la specification de base, intacte ; une
// extension ne relache que ce qu'elle nomme, et peut aussi refuser.

import { describe, expect, it } from 'vitest';
import { violationsEcriture } from './invariants.js';
import { EXTENSIONS_ECRITURE, type ExtensionEcriture } from './extensionsEcriture.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10" data-ed-modele="2"><g data-ed-nom="Nuage"><path d="M0 0L5 0Z" fill="#000000"/></g></svg>';

const groupes: ExtensionEcriture = {
  nom: 'essai : groupes',
  element: e => (e.nom === 'g' && e.profondeur >= 1 ? true : undefined),
  attribut: (e, nom, valeur) => (e.nom === 'g' && nom === 'data-ed-nom' ? /^(?:[A-Za-z0-9]|%[0-9A-F]{2})+$/.test(valeur)
    : e.profondeur === 0 && nom === 'data-ed-modele' ? valeur === '2' : undefined)
};

describe('les extensions de l ecriture permise', () => {
  it('sans extension, un groupe est refuse comme avant', () => {
    expect(violationsEcriture(SVG, [])).toEqual(['attribut ecrit inattendu data-ed-modele', 'element ecrit inattendu <g>', 'attribut ecrit inattendu data-ed-nom']);
  });

  it('une extension permet ce qu elle nomme, avec sa forme exacte, et rien d autre', () => {
    expect(violationsEcriture(SVG, [groupes])).toEqual([]);
    expect(violationsEcriture(SVG.replace('Nuage', 'Nu age'), [groupes])).toEqual(['data-ed-nom refuse par le modele v2 : Nu age']);
    expect(violationsEcriture(SVG.replace('<g ', '<mask ').replace('</g>', '</mask>'), [groupes])).toEqual(['element ecrit inattendu <mask>', 'attribut ecrit inattendu data-ed-nom']);
    expect(violationsEcriture(SVG.replace('data-ed-modele="2"', 'data-ed-modele="3"'), [groupes])).toEqual(['data-ed-modele refuse par le modele v2 : 3']);
  });

  it('un prefixe employe sans etre declare sur l element ou un ancetre est une violation, quelles que soient les extensions', () => {
    const image = (racine: string, defs: string) => '<svg xmlns="http://www.w3.org/2000/svg"' + racine + ' viewBox="0 0 10 10"><defs' + defs + '><mask id="ed-m-1"><image xlink:href="data:image/png;base64,AAAA" width="1" height="1"/></mask></defs></svg>';
    const toutPermis: ExtensionEcriture = { nom: 'essai : tout', element: () => true, attribut: () => true };
    expect(violationsEcriture(image('', ''), [toutPermis])).toEqual(['prefixe non declare xlink:href sur <image>']);
    expect(violationsEcriture(image(' xmlns:xlink="http://www.w3.org/1999/xlink"', ''), [toutPermis])).toEqual([]);
    expect(violationsEcriture(image('', ' xmlns:xlink="http://www.w3.org/1999/xlink"'), [toutPermis])).toEqual([]);
    expect(violationsEcriture(image('', '').replace('<defs>', '<defs><g xmlns:xlink="http://www.w3.org/1999/xlink"/>'), [toutPermis])).toEqual(['prefixe non declare xlink:href sur <image>']);
    expect(violationsEcriture(image('', '').replace('<image', '<svg:image').replace('xlink:href', 'href'), [toutPermis])).toEqual(['prefixe non declare <svg:image>']);
  });

  it('les extensions inscrites ont des noms uniques', () => {
    expect(new Set(EXTENSIONS_ECRITURE.map(x => x.nom)).size).toBe(EXTENSIONS_ECRITURE.length);
  });
});

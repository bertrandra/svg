// Le reglage de la langue (ADR-0042 §1) : garde par le stockage injecte sous `svg.langue`, valide comme tout ce qui en vient
// (ADR-0014), `fr` sans lui ; le libelle du menu Aide ecrit dans l'autre langue ; le geste de changement pose par l'hote seulement.

import { afterEach, describe, expect, it } from 'vitest';
import { stockageMemoire } from '../../../src/io/stockage.js';
import {
  autreLangue, changementLangue, CLE_LANGUE, definirChangementLangue, garderLangue, langueRetenue, libelleChangementLangue, lireLangue, NOMS_LANGUES
} from '../../../src/zones/langue.js';

afterEach(() => definirChangementLangue(null));

describe('le reglage de la langue, garde par le stockage', () => {
  it('se lit seulement sous la forme ecrite ; tout le reste vaut fr', () => {
    expect(lireLangue({ langue: 'en' })).toBe('en');
    expect(lireLangue({ langue: 'fr' })).toBe('fr');
    for (const v of [null, undefined, 'en', ['en'], {}, { langue: 'EN' }, { langue: 'de' }, { langue: 2 }, 42]) expect(lireLangue(v), JSON.stringify(v)).toBeNull();
    expect(langueRetenue(null)).toBe('fr');
    expect(langueRetenue(stockageMemoire({ [CLE_LANGUE]: 'en' }))).toBe('fr');
    expect(langueRetenue(stockageMemoire({ [CLE_LANGUE]: { langue: 'en' } }))).toBe('en');
  });

  it('s ecrit en objet et se relit ; sans stockage, rien n est garde', () => {
    const s = stockageMemoire();
    expect(garderLangue(s, 'en')).toBe(true);
    expect(s.lire(CLE_LANGUE)).toEqual({ langue: 'en' });
    expect(langueRetenue(s)).toBe('en');
    expect(garderLangue(null, 'en')).toBe(false);
  });
});

describe('le changement de langue', () => {
  it('nomme l autre langue dans sa langue, et chaque langue par son nom', () => {
    expect(autreLangue('fr')).toBe('en');
    expect(autreLangue('en')).toBe('fr');
    expect(libelleChangementLangue('fr')).toBe('Language: English');
    expect(libelleChangementLangue('en')).toBe('Langue : français');
    expect(NOMS_LANGUES).toEqual({ fr: 'Français', en: 'English' });
  });

  it('n a de geste que si l hote en pose un', () => {
    expect(changementLangue()).toBeNull();
    const vues: string[] = [];
    definirChangementLangue(l => { vues.push(l); });
    changementLangue()?.('en');
    expect(vues).toEqual(['en']);
    definirChangementLangue(null);
    expect(changementLangue()).toBeNull();
  });
});

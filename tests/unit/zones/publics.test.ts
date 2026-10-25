// Un accueil par public (ADR-0024) : la memoire du choix relue champ par champ, l'ordre des voies de chaque public, le contexte
// de production que l'editeur prend pour la machine, le circuit de chacun, et l'embarquement montre aux integrateurs.

import { describe, expect, it } from 'vitest';
import { stockageMemoire } from '../../../src/io/stockage.js';
import { CHOIX_CRICUT_DEFAUT } from '../../../src/model/contextes.js';
import { choixDeDepart } from '../../../src/engine/preparation.js';
import {
  circuitDu, CLE_PUBLIC, codeIntegration, DEMO_HOTE, lienGuide, lirePublic, memoirePublic, OPTIONS_INTEGRATION, ordreDesVoies, phraseRecu,
  phraseReglageMachine, productionDuPublic, PUBLICS, titrePublic, type ChoixPublic
} from '../../../src/zones/publics.js';
import { verifierOptions } from '../../../src/zones/embarque.js';
import { NOMS_ICONES } from '../../../src/zones/icones.js';

/** Les textes portent des espaces insecables (typographie francaise) : on les compare a espaces ordinaires. */
const n = (t: string): string => t.replace(/\u00a0/g, ' ');

describe('les trois publics', () => {
  it('sont ceux de PRODUCT.md, dans l ordre de la question, chacun avec une phrase de ce qu il obtient', () => {
    expect(PUBLICS.map(p => p.id)).toEqual(['machine', 'retouche', 'integration']);
    expect(PUBLICS.map(p => p.titre)).toEqual(['Découper ou dessiner avec une machine', 'Retoucher un dessin ou une image', 'Intégrer l’éditeur à mon produit']);
    for (const p of PUBLICS) {
      expect(p.phrase.length, p.id).toBeGreaterThan(40);
      expect(NOMS_ICONES).toContain(p.icone);
      // Typographie francaise : jamais une espace ordinaire avant « : ; ? ! ».
      expect(p.phrase).not.toMatch(/ [:;?!]/);
    }
    expect(n(PUBLICS[0]?.phrase ?? '')).toContain('Design Space');
    expect(n(PUBLICS[0]?.phrase ?? '')).toMatch(/découpe.*stylo.*Print Then Cut/);
    expect(titrePublic('integration')).toBe('Intégrer l’éditeur à mon produit');
  });
});

describe('la memoire du choix', () => {
  it('relit les quatre reponses, et ce qu elle ecrit se relit', () => {
    for (const c of ['machine', 'retouche', 'integration', 'aucun'] as const) {
      expect(lirePublic(memoirePublic(c))).toBe(c);
      const s = stockageMemoire();
      s.ecrire(CLE_PUBLIC, memoirePublic(c));
      expect(lirePublic(s.lire(CLE_PUBLIC))).toBe(c);
    }
    expect(CLE_PUBLIC).toBe('svg.accueil');
  });

  it('se lit champ par champ : une valeur abimee, etrangere, empoisonnee ou future se lit « jamais repondu », sans lever', () => {
    for (const v of [null, undefined, 'machine', 3, true, [], ['machine'], {}, { public: 'Machine' }, { public: 'laser' }, { public: 2 }, { public: null }, { choix: 'machine' }]) {
      expect(lirePublic(v), JSON.stringify(v)).toBeNull();
    }
    // Un champ de plus (une version plus recente) ne gache pas une reponse connue.
    expect(lirePublic({ public: 'retouche', version: 2, quand: 'hier' })).toBe('retouche');
    // Le stockage retire les cles de prototype a la lecture : une pollution ne passe pas.
    const s = stockageMemoire();
    s.ecrire(CLE_PUBLIC, JSON.parse('{"__proto__":{"public":"machine"}}'));
    expect(lirePublic(s.lire(CLE_PUBLIC))).toBeNull();
  });
});

describe('l ordre des voies', () => {
  it('est celui d avant pour tous, sauf la machine qui part de la bibliotheque puis d une image', () => {
    const tous: ReadonlyArray<ChoixPublic | null> = [null, 'aucun', 'retouche', 'integration'];
    for (const p of tous) expect(ordreDesVoies(p), String(p)).toEqual(['svg', 'image', 'formes']);
    expect(ordreDesVoies('machine')).toEqual(['formes', 'image', 'svg']);
  });

  it('ne duplique ni ne retire jamais une voie', () => {
    for (const p of [null, 'aucun', 'machine', 'retouche', 'integration'] as const) expect([...ordreDesVoies(p)].sort()).toEqual(['formes', 'image', 'svg']);
  });
});

describe('le contexte de production du public', () => {
  it('regle l editeur pour une Cricut Maker, en decoupe, dans l unite retenue (le millimetre par defaut)', () => {
    const mm = productionDuPublic('machine', 'mm');
    expect(mm).toEqual({ contexte: 'cricut', machine: 'maker', tapis: '12x12', materiau: 'papier-cartonne', procede: 'decoupe', unite: 'mm' });
    expect(mm).toEqual({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT });
    expect(productionDuPublic('machine', 'in')).toMatchObject({ contexte: 'cricut', unite: 'in' });
    for (const p of [null, 'aucun', 'retouche', 'integration'] as const) expect(productionDuPublic(p, 'mm'), String(p)).toBeNull();
  });

  it('est un depart que l editeur applique tel quel quand le SVG n a pas de marque, et que la marque remplace', () => {
    const depart = productionDuPublic('machine', 'mm');
    expect(choixDeDepart(undefined, depart)).toEqual(depart);
    expect(choixDeDepart({ contexte: 'cricut', machine: 'explore', unite: 'in' }, depart)).toMatchObject({ machine: 'explore', unite: 'in' });
  });

  it('se dit avec le libelle du selecteur de la barre', () => {
    const depart = productionDuPublic('machine', 'mm');
    if (depart?.contexte !== 'cricut') throw new Error('le public machine part en contexte Cricut');
    expect(n(phraseReglageMachine(depart))).toBe('L’éditeur s’ouvre réglé pour : Cricut Maker · 12 × 12, découpe, en millimètres. La machine se change dans la barre, à tout moment.');
    expect(n(phraseReglageMachine({ ...depart, unite: 'in' }))).toContain('en pouces');
    expect(phraseReglageMachine({ contexte: 'generique' })).toBe('');
  });
});

describe('le circuit de chaque public', () => {
  it('a toujours trois etapes, la derniere dit ce qui sort, et la machine nomme Design Space', () => {
    for (const p of [null, 'aucun', 'machine', 'retouche', 'integration'] as const) {
      const c = circuitDu(p);
      expect(c.etapes).toHaveLength(3);
      for (const e of c.etapes) { expect(e.titre.length).toBeGreaterThan(5); expect(NOMS_ICONES).toContain(e.icone); expect(e.aide).not.toMatch(/ [:;?!]/); }
    }
    expect(circuitDu('machine').etapes.map(e => e.titre)).toEqual(['Une forme ou une image', 'Préparée pour la machine', 'Fichier prêt pour Design Space']);
    expect(circuitDu('integration').etapes.map(e => e.titre)).toEqual(['Le SVG de votre page', 'Retouché dans l’éditeur', 'Rendu à votre code']);
    expect(circuitDu(null)).toEqual(circuitDu('aucun'));
  });
});

describe('l embarquement montre aux integrateurs', () => {
  it('nomme les options principales de ouvrir, toutes reconnues par verifierOptions', () => {
    expect(OPTIONS_INTEGRATION.map(([nom]) => nom)).toEqual(['svg', 'onEnregistrer', 'libelleEnregistrer', 'visite', 'stockage', 'baseAnnexes']);
    // L'extrait de code est un appel valide : ses options passent la verification de l'hote.
    expect(verifierOptions({ svg: '<svg/>', nom: DEMO_HOTE.nom, libelleEnregistrer: DEMO_HOTE.libelleEnregistrer, onEnregistrer: () => undefined })).toBeNull();
    const code = codeIntegration();
    expect(code).toContain('EditeurSvg.ouvrir({');
    expect(code).toContain('libelleEnregistrer: \'' + DEMO_HOTE.libelleEnregistrer + '\'');
    expect(code).toContain('onEnregistrer: function (svg)');
    // Du JavaScript : aucune espace insecable n'y entre.
    expect(code).not.toMatch(/\u00a0/);
  });

  it('renvoie au guide du depot declare, ou a une ancre de la page : jamais une adresse inventee', () => {
    expect(lienGuide('git+https://github.com/bertrandra/svg.git')).toBe('https://github.com/bertrandra/svg/blob/main/docs/integration.md');
    expect(lienGuide('https://github.com/bertrandra/svg')).toBe('https://github.com/bertrandra/svg/blob/main/docs/integration.md');
    for (const d of [undefined, '', 'javascript:alert(1)', 'http://exemple.org/a/b', 'git@github.com:a/b.git', 'https://exemple.org/"onclick=x/b']) expect(lienGuide(d), String(d)).toBe('#options-integration');
  });

  it('dit ce que la page hote a recu', () => {
    expect(n(phraseRecu('<svg/>'))).toBe('Votre page a reçu le SVG retouché par onEnregistrer : 6 caractères, déjà nettoyé.');
  });
});

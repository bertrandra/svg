import { describe, expect, it } from 'vitest';
import { BORNES_PROJET, FORMAT_PROJET, MIGRATIONS, VERSION_PROJET, cheminProjetValide, lireProjet, migrer, nomDeProjet, type Projet } from '../../../src/model/projet.js';
import { peintureSure } from '../../../src/engine/editionSvg.js';

// Le projet (ADR-0030) : le JSON natif d'un travail. Sa lecture vient d'un serveur ou d'un fichier : elle migre, valide champ par
// champ, borne et refuse en le nommant, sans jamais lever (ADR-0014).

const projetMinimal = (): Record<string, unknown> => ({
  format: FORMAT_PROJET, version: VERSION_PROJET, nom: 'Carte',
  dessin: { vb: [0, 0, 100, 80], formes: [{ id: 'f1', d: 'M10 10L90 10L50 70Z', remplissage: '#c81e28', contour: null, epaisseur: 1, opacite: 1, regle: 'nonzero', visible: true, verrouille: false }] },
  production: { contexte: 'generique' }, nuancier: [{ nom: 'Rouge', hex: '#c81e28' }], ressources: { polices: [], images: [] }
});

const lu = (x: unknown): Projet => {
  const r = lireProjet(x);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.projet;
};
const erreur = (x: unknown): string => { const r = lireProjet(x); return 'erreur' in r ? r.erreur : ''; };

describe('la lecture d un projet', () => {
  it('rend un projet valide tel quel, dans l ordre des champs du format', () => {
    const p = projetMinimal();
    expect(JSON.stringify(lu(p))).toBe(JSON.stringify(p));
    expect(lu(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('garde un texte vivant complet, les operations, les origines, le verrouillage et le contexte Cricut', () => {
    const p = projetMinimal();
    const formes = [{
      id: 'f2', d: 'M0 0L10 0L10 10Z', remplissage: '#15181d', contour: '#ffffff', epaisseur: 0.5, opacite: 0.8, opaciteRemplissage: 0.5, opaciteContour: 0.25,
      pointilles: [5, 3], decalagePointilles: -1, bout: 'round', jonction: 'miter', limiteMitre: 6, origine: ['game-icons:3d-glasses'],
      texte: { texte: 'Joyeux Noël', police: { id: 'c-1b0c5ca30f8f68', version: '0123456789abcd', famille: 'Roboto' }, taille: 18, interlettrage: 0.05, interligne: 1.4, alignement: 'centre', ligatures: true, trace: 'median', matrice: [1, 0, 0, 1, 100, 30] },
      operation: 'ecriture', regle: 'evenodd', visible: false, verrouille: true
    }];
    const cricut = { ...p, dessin: { vb: [0, 0, 100, 80], formes }, production: { contexte: 'cricut', machine: 'maker', tapis: '12x12', materiau: 'papier-cartonne', procede: 'decoupe', unite: 'mm' } };
    expect(JSON.stringify(lu(cricut))).toBe(JSON.stringify(cricut));
  });

  it('refuse un autre JSON, et un projet plus recent en le nommant', () => {
    expect(erreur(null)).toMatch(/pas un projet/);
    expect(erreur({ format: 'autre', version: 1 })).toMatch(/pas un projet/);
    expect(erreur({ ...projetMinimal(), version: 0 })).toMatch(/version/);
    expect(erreur({ ...projetMinimal(), version: VERSION_PROJET + 1 })).toBe(
      'Ce projet a été enregistré par une version plus récente de l’éditeur (format ' + (VERSION_PROJET + 1) + ') ; cette version lit les projets jusqu’au format ' + VERSION_PROJET + '. Mettez le site à jour pour l’ouvrir.');
  });

  it('a une migration pour chaque version anterieure : la chaine n est jamais tronquee', () => {
    for (let v = 1; v < VERSION_PROJET; v++) expect(MIGRATIONS[v], 'migration depuis ' + v).toBeTypeOf('function');
    const r = migrer(projetMinimal());
    expect('erreur' in r ? r.erreur : r.migre).toBe(false);
  });

  it('refuse chaque champ mal forme en le nommant, sans lever', () => {
    const avec = (f: (p: Record<string, unknown>) => void) => { const p = JSON.parse(JSON.stringify(projetMinimal())) as Record<string, unknown>; f(p); return erreur(p); };
    const forme = (p: Record<string, unknown>) => ((p['dessin'] as { formes: Array<Record<string, unknown>> }).formes[0] as Record<string, unknown>);
    expect(avec(p => { forme(p)['d'] = 'M10 10 L20 20'; })).toMatch(/tracé de la forme 1 est mal formé/);
    expect(avec(p => { forme(p)['d'] = 'M1e999 0'; })).toMatch(/tracé/);
    expect(avec(p => { forme(p)['d'] = 'A1 1 0 0 1 2 2'; })).toMatch(/tracé/);
    expect(avec(p => { forme(p)['remplissage'] = 'url(https://x)'; })).toMatch(/couleur admise/);
    expect(avec(p => { forme(p)['remplissage'] = 'red;background:url(x)'; })).toMatch(/couleur admise/);
    expect(avec(p => { forme(p)['id'] = '../f1'; })).toMatch(/identifiant/);
    expect(avec(p => { forme(p)['opacite'] = 2; })).toMatch(/opacité/);
    expect(avec(p => { forme(p)['visible'] = 'oui'; })).toMatch(/visibilité/);
    expect(avec(p => { forme(p)['operation'] = 'graver'; })).toMatch(/opération/);
    expect(avec(p => { (p['dessin'] as { formes: unknown[] }).formes.push(forme(p)); })).toMatch(/deux formes portent/);
    expect(avec(p => { (p['dessin'] as { vb: unknown[] }).vb = [0, 0, 0, 10]; })).toMatch(/plan de travail/);
    expect(avec(p => { p['production'] = { contexte: 'laser' }; })).toMatch(/inconnu/);
    expect(avec(p => { p['nuancier'] = [{ nom: 'x', hex: 'rouge' }]; })).toMatch(/nuancier/);
    expect(avec(p => { p['nom'] = 'x'.repeat(BORNES_PROJET.nom + 1); })).toMatch(/nom du projet/);
    expect(avec(p => { p['ressources'] = { polices: [{ id: 'inter', famille: 'Inter', donnees: '' }], images: [] }; })).toMatch(/fonte déposée/);
    expect(avec(p => { p['ressources'] = { polices: [{ id: 'u-0123456789abcd', famille: 'X', donnees: 'pas du base64!' }], images: [] }; })).toMatch(/base64/);
    expect(avec(p => { p['ressources'] = { polices: [], images: [{ role: 'source', nom: 'a', type: 'image/svg+xml', donnees: '' }] }; })).toMatch(/type d’une image/);
    expect(avec(p => { forme(p)['texte'] = { texte: '   ', police: { id: 'inter' }, taille: 10, interlettrage: 0, interligne: 1.2, alignement: 'gauche', ligatures: false, matrice: [1, 0, 0, 1, 0, 0] }; })).toMatch(/vide/);
    expect(avec(p => { forme(p)['texte'] = { texte: 'a', police: { id: 'inter' }, taille: 10, interlettrage: 0, interligne: 1.2, alignement: 'gauche', ligatures: false, matrice: [0, 0, 0, 0, 0, 0] }; })).toMatch(/dégénérée/);
    expect(avec(p => { p['creeLe'] = 'hier'; })).toMatch(/date/);
  });

  it('ne garde que les champs connus : une cle de prototype ou un champ en trop ne passent pas', () => {
    const p = JSON.parse('{"__proto__":{"pollue":1},' + JSON.stringify(projetMinimal()).slice(1)) as unknown;
    const r = lu(p);
    expect(Object.keys(r)).toEqual(['format', 'version', 'nom', 'dessin', 'production', 'nuancier', 'ressources']);
    expect(({} as Record<string, unknown>)['pollue']).toBeUndefined();
    const avecTrop = { ...projetMinimal(), script: '<script>' };
    expect(Object.keys(lu(avecTrop))).not.toContain('script');
  });

  it('borne ce qu il compte : formes, trace, polices', () => {
    const p = projetMinimal();
    const trop = { ...p, dessin: { vb: [0, 0, 10, 10], formes: Array.from({ length: BORNES_PROJET.formes + 1 }, () => ({})) } };
    expect(erreur(trop)).toMatch(/plus de 200000/);
    const polices = { ...p, ressources: { polices: Array.from({ length: BORNES_PROJET.polices + 1 }, () => ({})), images: [] } };
    expect(erreur(polices)).toMatch(/plus de/);
  });

  it('ne leve jamais, sur des entrees mutees au hasard (graine fixe)', () => {
    let graine = 17;
    const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
    const base = JSON.stringify(projetMinimal());
    for (let i = 0; i < 2000; i++) {
      const t = [...base];
      for (let k = 0; k < 4; k++) t[Math.floor(hasard() * t.length)] = String.fromCharCode(32 + Math.floor(hasard() * 95));
      let x: unknown;
      try { x = JSON.parse(t.join('')); } catch { continue; }
      expect(() => lireProjet(x)).not.toThrow();
    }
    expect(() => lireProjet({ get format() { throw new Error('piege'); } })).not.toThrow();
  });
});

describe('le chemin d un projet', () => {
  it('admet M, L, C, Q, Z absolus avec le bon nombre de valeurs, des nombres finis et bornes', () => {
    expect(cheminProjetValide('')).toBe(true);
    expect(cheminProjetValide('M0 0L1.5 -2e-7C1 2 3 4 5 6Q1 2 3 4Z')).toBe(true);
    expect(cheminProjetValide('M-0 0Z')).toBe(true);
    for (const faux of ['M0', 'M0 0 0', 'M0  0', 'M0 0z', 'm0 0', 'M0 NaN', 'M0 Infinity', 'M2e9 0', 'M0,0', 'MZ']) expect(cheminProjetValide(faux), faux).toBe(false);
  });

  it('juge une couleur comme l ecriture (peintureSure)', () => {
    const base = projetMinimal();
    for (const c of ['#abc', '#a1b2c3', '#a1b2c3d4', 'red', 'rgb(1, 2, 3)', 'currentcolor', 'none', 'url(#x)', 'RED', '#ABC', 'rgb(1,2,3);x', 'a'.repeat(50)]) {
      const p = JSON.parse(JSON.stringify(base)) as { dessin: { formes: Array<Record<string, unknown>> } };
      (p.dessin.formes[0] as Record<string, unknown>)['remplissage'] = c;
      expect('erreur' in lireProjet(p), c).toBe(!peintureSure(c));
    }
  });
});

describe('le nom d un projet', () => {
  it('retire les caracteres de controle et de mise en forme, les barres, les points de tete ; borne ; « Sans titre » s il ne reste rien', () => {
    expect(nomDeProjet('  Carte   de  Noël ')).toBe('Carte de Noël');
    expect(nomDeProjet('../../etc/passwd')).toBe('-..-etc-passwd');
    expect(nomDeProjet('a\u0000b‮c​d\nе')).toBe('abcdе');
    expect(nomDeProjet('...')).toBe('Sans titre');
    expect(nomDeProjet('\u0007')).toBe('Sans titre');
    expect([...nomDeProjet('é'.repeat(300))]).toHaveLength(BORNES_PROJET.nom);
  });
});

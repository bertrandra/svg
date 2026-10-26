// Le projet JSON (ADR-0030) garde TOUT le modele : chaque champ d'une forme et du dessin doit y etre porte, sinon un projet rouvert
// perdrait en silence ce que le modele v2 ajoute. Les tables ci-dessous classent chaque champ ; le typage force a classer un champ
// nouveau (une cle manquante ne compile pas), et le test verifie que les champs dits « porte » font l'aller-retour exact. Une etape
// qui livre un champ v2 le porte (une ligne de model/projetV2/champs.ts et de engine/projetV2/champs.ts, son lecteur et son
// aller-retour dans ses fichiers), puis le passe ici a « porte » (ADR-0012, annexe 8). Les champs du dessin (nuancier, reperes) ne
// rendent pas le dessin non plat : un projet plat qui les porte reste au format 1.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin, lireDessin, transformer, rotation, type Degrade, type DessinSvg, type Forme } from '../../../src/engine/editionSvg.js';
import { etatDuProjet, formeDuProjet, formeProjet, projetDe, texteDuProjet, type EtatProjet } from '../../../src/engine/projet.js';
import { FORMAT_PROJET, VERSION_PROJET, VERSION_PROJET_PLAT, lireProjet } from '../../../src/model/projet.js';
import { ARRETS_PROJET_MAX } from '../../../src/model/projetV2/peinture.js';
import { ARRETS_MAX } from '../../../src/engine/edition/degrades.js';

type Portage = 'porte' | `etape ${number}`;

const CHAMPS_FORME: Readonly<Record<keyof Forme, Portage>> = {
  id: 'porte', d: 'porte', remplissage: 'porte', contour: 'porte', epaisseur: 'porte', opacite: 'porte', opaciteRemplissage: 'porte',
  opaciteContour: 'porte', pointilles: 'porte', decalagePointilles: 'porte', bout: 'porte', jonction: 'porte', limiteMitre: 'porte',
  origine: 'porte', texte: 'porte', operation: 'porte', regle: 'porte', visible: 'porte', verrouille: 'porte',
  parent: 'porte', peintureRemplissage: 'porte', peintureContour: 'porte', effets: 'etape 7', image: 'porte'
};

const CHAMPS_DESSIN: Readonly<Record<keyof DessinSvg, Portage>> = { vb: 'porte', formes: 'porte', nuancier: 'porte', reperes: 'porte', groupes: 'porte' };

const lire = (nom: string, modele: 'plat' | 'riche' = 'plat'): DessinSvg => {
  const r = lireDessin(readFileSync(resolve(__dirname, '../../fixtures/svg', nom), 'utf8'), { modele });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};

const lineaire: Degrade = {
  genre: 'lineaire', x1: 0.1 + 0.2, y1: -0, x2: 1e-7, y2: 90.123456789,
  arrets: [{ position: 0, couleur: '#c81e28' }, { position: 0.4, couleur: '#f2b705', opacite: 0.35 }, { position: 1, couleur: '#1f5fb0' }],
  matrice: [Math.cos(0.3), Math.sin(0.3), -Math.sin(0.3), Math.cos(0.3) * 0.5, 12.5, -7], etalement: 'reflect'
};
const radial: Degrade = { genre: 'radial', cx: 50, cy: 40, r: 30, fx: 45, fr: 2, arrets: [{ position: 0, couleur: '#ffffff' }, { position: 1, couleur: '#000000', opacite: 0 }] };

const etat = (dessin: DessinSvg): EtatProjet => ({ nom: 'essai', dessin, production: { contexte: 'generique' }, nuancier: [], polices: [], images: [] });

function allerRetour(e: EtatProjet): { texte: string; rouvert: EtatProjet } {
  const texte = texteDuProjet(projetDe(e));
  const relu = lireProjet(JSON.parse(texte));
  if ('erreur' in relu) throw new Error(relu.erreur);
  const rouvert = etatDuProjet(relu.projet);
  if ('erreur' in rouvert) throw new Error(rouvert.erreur);
  return { texte, rouvert };
}

const erreur = (x: unknown): string => { const r = lireProjet(x); return 'erreur' in r ? r.erreur : ''; };

describe('le projet porte tout le modele', () => {
  it('chaque champ dit porte fait l aller-retour exact, et le projet n en ecrit pas d autre', () => {
    const avecTexte = lire('texte-sur-forme.attendu.svg').formes.find(f => f.texte?.disposition);
    if (!avecTexte) throw new Error('aucun texte pose dans la reference');
    // Une forme qui porte tous les champs a la fois : le trace est alors le rectangle de l'image (le projet le recalcule au retour).
    const image = lire('v2/images-rotation.svg', 'riche').formes.find(f => f.image);
    if (!image?.image) throw new Error('aucune image dans la reference');
    const pleine: Forme = {
      ...avecTexte, d: image.d, image: image.image, contour: '#1f4e8c', epaisseur: 2, opacite: 0.5, opaciteRemplissage: 0.4, opaciteContour: 0.3, pointilles: [4, 2], decalagePointilles: 1,
      bout: 'round', jonction: 'bevel', limiteMitre: 6, origine: ['game-icons:a'], operation: 'ecriture', regle: 'evenodd', visible: false, verrouille: true,
      peintureRemplissage: lineaire, peintureContour: radial, parent: 'g1'
    };
    const portes = Object.entries(CHAMPS_FORME).filter(([, p]) => p === 'porte').map(([k]) => k).sort();
    expect(Object.keys(pleine).sort()).toEqual(portes);
    expect(Object.keys(formeProjet(pleine)).sort()).toEqual(portes);
    expect(formeDuProjet(formeProjet(pleine))).toEqual(pleine);
  });

  it('les champs du modele v2 attendent l etape qui les livre', () => {
    const attendus = Object.entries({ ...CHAMPS_FORME, ...CHAMPS_DESSIN }).filter(([, p]) => p !== 'porte').map(([k, p]) => k + ' : ' + p);
    expect(attendus).toEqual(['effets : etape 7']);
  });

  it('un dessin plat garde son nuancier et ses reperes, au format 1', () => {
    const d: DessinSvg = { ...lire('chemins.svg'), nuancier: { provenance: 'dessin', teintes: [{ hex: '#c81e28' }, { hex: '#1f5fb0', opacite: 0.5 }] }, reperes: { h: [10.5], v: [3, 40] } };
    const { texte, rouvert } = allerRetour(etat(d));
    expect(JSON.parse(texte).version).toBe(VERSION_PROJET_PLAT);
    expect(rouvert.dessin).toEqual(d);
    expect(texteDuProjet(projetDe(rouvert))).toBe(texte);
  });
});

describe('les images dans le projet (etape 12)', () => {
  it('un dessin a images s ecrit au format 2 et fait l aller-retour exact : modele, texte JSON et SVG ecrit', () => {
    for (const nom of ['images-png', 'images-jpeg', 'images-gif-webp', 'images-rotation', 'images-type-corrige']) {
      const d = lire('v2/' + nom + '.svg', 'riche');
      expect(d.formes.some(f => f.image), nom).toBe(true);
      const tourne = transformer(d, d.formes.map(f => f.id), rotation(17, 40, 30));
      for (const x of [d, tourne]) {
        const { texte, rouvert } = allerRetour(etat(x));
        expect(JSON.parse(texte).version, nom).toBe(VERSION_PROJET);
        expect(rouvert.dessin, nom).toEqual(x);
        expect(texteDuProjet(projetDe(rouvert)), nom).toBe(texte);
        expect(ecrireDessin(rouvert.dessin, 3), nom).toBe(ecrireDessin(x, 3));
      }
    }
  });

  it('refuse en le nommant une image mal formee, aux octets menteurs, ou qui porte une couleur', () => {
    const d = lire('v2/images-png.svg', 'riche');
    const base = JSON.parse(texteDuProjet(projetDe(etat(d)))) as { version: number; dessin: { formes: Array<Record<string, unknown>> } };
    const i = base.dessin.formes.findIndex(f => f.image !== undefined);
    const img = base.dessin.formes[i]?.image as Record<string, unknown>;
    const avec = (champs: Record<string, unknown>) => ({ ...base, dessin: { ...base.dessin, formes: base.dessin.formes.map((f, k) => (k === i ? { ...f, ...champs } : f)) } });
    const ouvrir = (x: unknown): string => { const r = lireProjet(x); if ('erreur' in r) return r.erreur; const e = etatDuProjet(r.projet); return 'erreur' in e ? e.erreur : ''; };
    expect(ouvrir(avec({ image: { ...img, donnees: 'https://x.invalid/a.png' } }))).toMatch(/PNG, JPEG, GIF ou WebP/);
    expect(ouvrir(avec({ image: { ...img, l: 0 } }))).toMatch(/taille d’une image/);
    expect(ouvrir(avec({ remplissage: '#000000' }))).toMatch(/remplissage ou un contour/);
    expect(ouvrir(avec({ image: { ...img, donnees: String(img['donnees']).replace('image/png', 'image/gif') } }))).toMatch(/Ce projet contient/);
    expect(ouvrir(avec({}))).toBe('');
  });
});

describe('les degrades dans le projet (etape 3)', () => {
  it('un dessin a degrades s ecrit au format 2 et fait l aller-retour exact : modele, texte JSON et SVG ecrit', () => {
    for (const nom of ['degrades-chaine', 'degrades-boite', 'degrades-opacite', 'degrades-contour', 'degrades-transformes']) {
      const d = lire('v2/' + nom + '.svg', 'riche');
      const tourne = transformer(d, d.formes.map(f => f.id), rotation(17, 40, 30));
      for (const x of [d, tourne]) {
        const { texte, rouvert } = allerRetour(etat(x));
        expect(JSON.parse(texte).version, nom).toBe(VERSION_PROJET);
        expect(rouvert.dessin, nom).toEqual(x);
        expect(texteDuProjet(projetDe(rouvert)), nom).toBe(texte);
        expect(ecrireDessin(rouvert.dessin, 3), nom).toBe(ecrireDessin(x, 3));
      }
    }
  });

  it('un dessin plat reste au format 1, et un projet au format 1 se lit sans « migration » annoncee', () => {
    const d = lire('chemins.svg');
    const { texte } = allerRetour(etat(d));
    expect(JSON.parse(texte).version).toBe(VERSION_PROJET_PLAT);
    const r = lireProjet(JSON.parse(texte));
    expect('erreur' in r ? r.erreur : r.migre).toBe(false);
    expect('erreur' in r ? null : r.projet.version).toBe(VERSION_PROJET_PLAT);
  });

  it('un champ v2 n existe pas au format 1 : il y est ignore, comme le ferait un programme d avant', () => {
    const d = lire('v2/degrades-lineaire.svg', 'riche');
    const projet = JSON.parse(texteDuProjet(projetDe(etat(d)))) as { version: number; dessin: { formes: Array<Record<string, unknown>> } };
    projet.version = 1;
    const r = lireProjet(projet);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.projet.dessin.formes.every(f => f.peintureRemplissage === undefined)).toBe(true);
  });

  it('refuse en le nommant un degrade mal forme, un motif, un degrade sans couleur de repli, un format plus recent', () => {
    const d = lire('v2/degrades-lineaire.svg', 'riche');
    const base = JSON.parse(texteDuProjet(projetDe(etat(d)))) as { version: number; dessin: { formes: Array<Record<string, unknown>> } };
    const avec = (champs: Record<string, unknown>) => ({ ...base, dessin: { ...base.dessin, formes: [{ ...base.dessin.formes[0], ...champs }] } });
    const p = base.dessin.formes[0]?.peintureRemplissage as Record<string, unknown>;
    expect(erreur(avec({ peintureRemplissage: { ...p, genre: 'motif' } }))).toMatch(/motifs.*version plus récente/);
    expect(erreur(avec({ remplissage: null }))).toMatch(/n’a pas de couleur de repli/);
    expect(erreur(avec({ peintureRemplissage: { ...p, arrets: [{ position: 0, couleur: '#000000' }] } }))).toMatch(/moins de deux/);
    expect(erreur(avec({ peintureRemplissage: { ...p, arrets: [{ position: 0.5, couleur: '#000000' }, { position: 0.2, couleur: '#ffffff' }] } }))).toMatch(/reculent/);
    expect(erreur(avec({ peintureRemplissage: { ...p, arrets: [{ position: 0, couleur: 'red' }, { position: 1, couleur: '#ffffff' }] } }))).toMatch(/#rrggbb/);
    expect(erreur(avec({ peintureRemplissage: { ...p, x1: 'url(http://x)' } }))).toMatch(/n’est pas un nombre/);
    expect(erreur(avec({ peintureRemplissage: { ...p, matrice: [1, 0, 0, 1, 0] } }))).toMatch(/six valeurs/);
    expect(erreur(avec({ peintureRemplissage: { ...p, etalement: 'pad' } }))).toMatch(/étalement/);
    expect(erreur(avec({ peintureRemplissage: { ...p, arrets: Array.from({ length: ARRETS_MAX + 1 }, (_, i) => ({ position: i / (ARRETS_MAX + 1), couleur: '#000000' })) } }))).toMatch(/plus de 64/);
    expect(erreur({ ...base, version: VERSION_PROJET + 1 })).toMatch(/version plus récente/);
    expect(erreur({ ...base, format: FORMAT_PROJET, version: 0 })).toMatch(/version lisible/);
  });

  it('la borne des arrets du projet est celle de la lecture', () => {
    expect(ARRETS_PROJET_MAX).toBe(ARRETS_MAX);
  });
});

describe('les groupes dans le projet (etape 1)', () => {
  it('un dessin a groupes fait l aller-retour exact, au format 2, et reecrit le meme SVG', () => {
    for (const nom of ['v2/groupes-imbriques.svg', 'v2/groupes-nom-piegeux.svg', 'v2/groupes-use.svg', 'v2/groupes-degrade-image.svg', 'lecture-use-imbriques.svg', 'texte-vivant-lecture.svg']) {
      const d = lire(nom, 'riche');
      expect(d.groupes, nom).toBeDefined();
      const { texte, rouvert } = allerRetour(etat(d));
      expect(JSON.parse(texte).version, nom).toBe(VERSION_PROJET);
      expect(rouvert.dessin, nom).toEqual(d);
      expect(texteDuProjet(projetDe(rouvert)), nom).toBe(texte);
      expect(ecrireDessin(rouvert.dessin, 3), nom).toBe(ecrireDessin(d, 3));
    }
  });

  it('les groupes, comme tout champ v2, n existent pas au format 1 : ils y sont ignores, le dessin se lit plat', () => {
    const projet = JSON.parse(texteDuProjet(projetDe(etat(lire('v2/groupes-imbriques.svg', 'riche'))))) as { version: number; dessin: { groupes?: unknown; formes: Array<Record<string, unknown>> } };
    projet.version = VERSION_PROJET_PLAT;
    const r = lireProjet(projet);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.projet.dessin.groupes).toBeUndefined();
    expect(r.projet.dessin.formes.every(f => f.parent === undefined)).toBe(true);
  });

  it('refuse en le nommant une forme d un groupe absent, et un arbre abime a l ouverture', () => {
    const d = lire('v2/groupes-imbriques.svg', 'riche');
    const projet = JSON.parse(texteDuProjet(projetDe(etat(d)))) as { dessin: { formes: unknown[] } };
    const [premiere, ...autres] = projet.dessin.formes;
    const casse = { ...projet, dessin: { ...projet.dessin, formes: [...autres, premiere] } };
    const lu = lireProjet(casse);
    if ('erreur' in lu) throw new Error(lu.erreur);
    expect(etatDuProjet(lu.projet)).toEqual({ erreur: 'Ce projet porte des groupes mal formés.' });
    const orpheline = { ...projet, dessin: { ...projet.dessin, formes: [{ ...(premiere as object), parent: 'g99' }, ...autres] } };
    expect(erreur(orpheline)).toMatch(/dans un groupe absent/);
  });
});

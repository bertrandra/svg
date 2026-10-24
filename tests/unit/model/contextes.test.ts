// Les profils de production sont des donnees : ce test en garde la coherence (renvois, unites, bornes), et oblige
// chaque valeur incertaine a dire d'ou elle vient et a figurer dans le protocole de verification.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { identifiantValide } from '../../../src/engine/editionSvg.js';
import {
  CHOIX_CRICUT_DEFAUT, CONTEXTES, CRICUT, DESIGN_SPACE_PX_NU_PAR_POUCE, FAMILLES, NOMS_PROCEDE, UNITES_PLAN_PAR_POUCE, type Valeur
} from '../../../src/model/contextes.js';

/** Toutes les valeurs d'un objet de profil, avec leur chemin (`cricut.tapis.12x12.zoneUtile.largeur`). */
function valeurs(objet: unknown, chemin: string): Array<{ chemin: string; v: Valeur }> {
  if (Array.isArray(objet)) return objet.flatMap(x => valeurs(x, chemin + '.' + String((x as { id?: string }).id ?? '?')));
  if (objet === null || typeof objet !== 'object') return [];
  if (typeof (objet as { valeur?: unknown }).valeur === 'number') return [{ chemin, v: objet as Valeur }];
  return Object.entries(objet).flatMap(([k, x]) => valeurs(x, chemin + '.' + k));
}

const toutes = [...valeurs(CRICUT, 'cricut'), { chemin: 'designSpace.pxNu', v: DESIGN_SPACE_PX_NU_PAR_POUCE }];
const aVerifier = toutes.filter(x => x.v.aVerifier);

describe('les profils de production', () => {
  it('rangent Generique d abord, sans famille, et Cricut avec la sienne', () => {
    expect(CONTEXTES.map(c => c.id)).toEqual(['generique', 'cricut']);
    expect(CONTEXTES[0]?.famille).toBeNull();
    expect(FAMILLES.map(f => f.id)).toEqual(['cricut']);
    expect(UNITES_PLAN_PAR_POUCE).toBe(96);
  });

  it('decrivent les trois machines voulues, chacune avec des tapis connus et des procedes', () => {
    expect(CRICUT.machines.map(m => m.id)).toEqual(['joy', 'explore', 'maker']);
    const tapis = new Set(CRICUT.tapis.map(t => t.id));
    for (const m of CRICUT.machines) {
      expect(m.famille).toBe('cricut');
      expect(m.tapis.length, m.id).toBeGreaterThan(0);
      for (const t of m.tapis) expect(tapis.has(t), m.id + ' -> ' + t).toBe(true);
      expect(m.procedes).toContain('decoupe');
      for (const p of m.procedes) expect(Object.keys(NOMS_PROCEDE)).toContain(p);
    }
    // La Joy ne fait pas Print Then Cut ; l'Explore et la Maker, si.
    expect(CRICUT.machines.find(m => m.id === 'joy')?.procedes).toEqual(['decoupe']);
    expect(CRICUT.machines.filter(m => m.procedes.includes('imprimer-decouper')).map(m => m.id)).toEqual(['explore', 'maker']);
  });

  it('ont des zones utiles positives, jamais plus grandes que leur support', () => {
    for (const t of CRICUT.tapis) {
      expect(t.zoneUtile.largeur.valeur, t.id).toBeGreaterThan(0);
      expect(t.zoneUtile.hauteur.valeur, t.id).toBeGreaterThan(0);
      expect(t.zoneUtile.largeur.valeur, t.id).toBeLessThanOrEqual(t.largeur.valeur);
      expect(t.zoneUtile.hauteur.valeur, t.id).toBeLessThanOrEqual(t.hauteur.valeur);
    }
  });

  it('n ouvrent que le papier cartonne au lancement, et gardent la place des autres materiaux', () => {
    expect(CRICUT.materiaux.filter(m => m.disponible).map(m => m.id)).toEqual(['papier-cartonne']);
    expect(CRICUT.materiaux.map(m => m.id)).toEqual(['papier-cartonne', 'vinyle', 'thermocollant', 'feutre']);
    for (const m of CRICUT.materiaux) expect(m.disponible === (m.seuils !== null), m.id).toBe(true);
    const s = CRICUT.materiaux[0]?.seuils;
    expect(s?.detailMin.valeur).toBeGreaterThanOrEqual(1 / 16);
    expect(s?.detailMin.valeur).toBeLessThanOrEqual(1 / 8);
  });

  it('ont un choix par defaut coherent : Maker, tapis 12 x 12, papier cartonne, decoupe, pouces', () => {
    const m = CRICUT.machines.find(x => x.id === CHOIX_CRICUT_DEFAUT.machine);
    expect(m?.tapis).toContain(CHOIX_CRICUT_DEFAUT.tapis);
    expect(m?.procedes).toContain(CHOIX_CRICUT_DEFAUT.procede);
    expect(CRICUT.materiaux.find(x => x.id === CHOIX_CRICUT_DEFAUT.materiau)?.disponible).toBe(true);
    expect(CHOIX_CRICUT_DEFAUT.unite).toBe('in');
  });

  it('n ont que des identifiants qui s ecrivent tels quels dans un attribut data-ed-*', () => {
    const ids = [...CONTEXTES.map(c => c.id), ...CRICUT.machines.map(m => m.id), ...CRICUT.tapis.map(t => t.id), ...CRICUT.materiaux.map(m => m.id), ...Object.keys(NOMS_PROCEDE), 'in', 'mm'];
    for (const id of ids) expect(identifiantValide(id), id).toBe(true);
  });

  it('n ont que des nombres finis et positifs', () => {
    expect(toutes.length).toBeGreaterThan(20);
    for (const x of toutes) expect(Number.isFinite(x.v.valeur) && x.v.valeur > 0, x.chemin).toBe(true);
  });

  it('font dire a chaque valeur a verifier d ou elle vient', () => {
    expect(aVerifier.length).toBeGreaterThan(10);
    for (const x of aVerifier) expect((x.v.note ?? '').length, x.chemin).toBeGreaterThan(20);
  });

  it('font figurer chaque valeur a verifier dans le protocole du proprietaire', () => {
    const protocole = readFileSync(resolve(__dirname, '../../../docs/cricut/protocole.md'), 'utf8');
    const absentes = aVerifier.map(x => x.chemin).filter(c => !protocole.includes('`' + c + '`'));
    expect(absentes, 'valeurs a verifier absentes de docs/cricut/protocole.md').toEqual([]);
  });
});

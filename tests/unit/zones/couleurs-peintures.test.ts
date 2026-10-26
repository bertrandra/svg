// Les listes de couleurs d'un dessin a degrades et a motifs (ADR-0012, etape 13d), rendues hors navigateur dans un editeur de facade :
// « Couleurs du dessin » et « Par couleur » ont une ligne par couleur d'arret et de tuile, jamais la couleur de repli ; la ligne
// « Dégradés » rappelle les couleurs de leurs arrets ; un dessin plat n'a pas de ligne « Dégradés » (le DOM d'avant).

import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { CouleursDuDessin } from '../../../src/zones/CouleursDuDessin.js';
import { ParCouleur } from '../../../src/zones/ParCouleur.js';
import { FournisseurEditeur } from '../../../src/zones/contexteEditeur.js';
import type { ActionsEditeur, EtatInterface, ModeleDessin } from '../../../src/zones/typesEditeur.js';

const actions = new Proxy({}, { get: () => () => undefined }) as ActionsEditeur;

function rendre(composant: FunctionComponent, dessin: DessinSvg): string {
  const modele = {
    h: { passe: [], present: dessin, futur: [], cle: null },
    dessin, sel: [], choisies: new Set<string>(), boite: null, formeSeule: null, nuancier: [], ignores: [], bibliotheque: null, versions: [], presse: [], preparation: null
  } as unknown as ModeleDessin;
  const etat = { profil: null, deplies: new Set<string>(), contexte: null } as unknown as EtatInterface;
  return renderToStaticMarkup(createElement(FournisseurEditeur, { dessin: modele, actions, etat, children: createElement(composant) }));
}

const lire = (chemin: string, modele: 'plat' | 'riche'): DessinSvg => {
  const r = lireDessin(readFileSync(resolve(__dirname, '../../fixtures/svg', chemin), 'utf8'), { modele });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const codes = (html: string): string[] => [...html.matchAll(/<code>(#[0-9A-F]{6})<\/code>/g)].map(m => m[1] ?? '');

describe('les listes de couleurs d un dessin a degrades et a motifs', () => {
  const riche = lire('v2/couleurs-peintures.svg', 'riche');
  const replis = new Set(riche.formes.filter(f => f.peintureRemplissage).map(f => f.remplissage?.toUpperCase()));

  it('« Couleurs du dessin » : les arrets et la tuile ont leur ligne, pas la couleur de repli', () => {
    const html = rendre(CouleursDuDessin, riche);
    expect(codes(html).sort()).toEqual(['#1F5FB0', '#2A9D8F', '#C81E28', '#C91F27', '#F2B705', '#FFFFFF']);
    for (const r of replis) expect(codes(html)).not.toContain(r);
    expect(html).toContain('class="ligne-degrades"');
    // Le degrade de la tuile n'est pas une forme du dessin : deux formes, deux degrades distincts, cinq couleurs d'arret.
    expect(html).toContain('· 2 dégradés, 2 formes, 5 couleurs');
  });

  it('« Par couleur » : les memes couleurs, et la ligne « Dégradés »', () => {
    const html = rendre(ParCouleur, riche);
    expect(codes(html).sort()).toEqual(['#1F5FB0', '#2A9D8F', '#C81E28', '#C91F27', '#F2B705', '#FFFFFF']);
    expect(html).toContain('class="ligne-degrades"');
  });

  it('un dessin plat n a pas de ligne « Dégradés »', () => {
    const plat = lire('couleurs-calques.svg', 'plat');
    expect(rendre(CouleursDuDessin, plat)).not.toContain('ligne-degrades');
    expect(rendre(ParCouleur, plat)).not.toContain('ligne-degrades');
  });
});

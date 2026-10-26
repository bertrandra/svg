// Le rendu generique de la toile (ADR-0012, etape 2, paquet A) : ce qui se voit est ce qui s'ecrit. Les definitions, la peinture
// d'une feuille, les attributs d'un groupe et l'element d'une image viennent des memes crochets que l'ecriture riche ; une
// fonctionnalite ajoutee au catalogue (decoupes, effets…) passe par eux sans que la toile change.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FONCTIONNALITES, deplacer, ecrireDessin, lireAttributs, lireDessin, renduDe, RANG_FEUILLE, RANG_GROUPE, type DessinSvg, type Fonctionnalite
} from '../../../src/engine/editionSvg.js';

const FIXTURES = resolve(__dirname, '../../fixtures/svg');
const riche = (nom: string): DessinSvg => {
  const r = lireDessin(readFileSync(resolve(FIXTURES, nom), 'utf8'), { modele: 'riche' });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const defsEcrites = (d: DessinSvg): string => /<defs>(.*)<\/defs>/.exec(ecrireDessin(d, 3))?.[1] ?? '';

describe('le rendu generique d un dessin riche', () => {
  const d = riche('v2/groupes-degrade-image.attendu.svg');

  it('depose les memes definitions que l ecriture, dans le meme ordre', () => {
    const r = renduDe(d);
    expect(r.definitions).not.toBe('');
    expect(r.definitions).toBe(defsEcrites(d));
  });

  it('rend chaque feuille peinte comme elle s ecrit, et une image par son element', () => {
    const r = renduDe(d), ecrit = ecrireDessin(d, 3);
    let chemins = 0, images = 0;
    for (const f of d.formes) {
      const x = r.feuille(f);
      if (x.genre === 'element') { images++; expect(ecrit).toContain(x.balisage); continue; }
      chemins++;
      if (f.peintureRemplissage) expect(x.forme.remplissage).toMatch(/^url\(#ed-d-[0-9a-f]{14}\)$/);
      if (f.peintureContour) expect(x.forme.contour).toMatch(/^url\(#ed-d-[0-9a-f]{14}\)$/);
    }
    expect(chemins).toBeGreaterThan(0);
    expect(images).toBe(1);
  });

  it('rend les attributs d un groupe tels qu ils s ecrivent (opacite, nom)', () => {
    const r = renduDe(d), ciel = Object.values(d.groupes ?? {}).find(g => g.nom === 'Ciel');
    expect(ciel).toBeDefined();
    if (ciel) expect(r.groupe(ciel).attributs).toEqual([['opacity', '0.8'], ['data-ed-nom', 'Ciel']]);
  });

  it('se memorise par dessin et par objet : un geste ne recalcule que ce qui a bouge', () => {
    const r = renduDe(d);
    expect(renduDe(d)).toBe(r);
    const [premiere, seconde] = d.formes;
    if (!premiere || !seconde) throw new Error('deux feuilles au moins');
    const apres = deplacer(d, [premiere.id], 5, 0);
    const r2 = renduDe(apres);
    expect(r2).not.toBe(r);
    expect(r2.feuille(seconde)).toBe(r.feuille(seconde));
    expect(r2.definitions).toBe(defsEcrites(apres));
  });

  it('passe par les crochets : une fonctionnalite de plus (ici fictive) se rend sans rien changer d autre', () => {
    const fictive: Fonctionnalite = {
      nom: 'fictive',
      ecriture: {
        attributsFeuille: (f, e) => (f.id === 'f1' ? [[RANG_FEUILLE.filtre, ' filter="url(#' + e.definitions.poser({ genre: 'f', balise: 'filter', attributs: ' x="0"', enfants: '<feGaussianBlur stdDeviation="2"/>' }) + ')"']] : []),
        attributsGroupe: g => (g.nom === 'Photo' ? [[RANG_GROUPE.decoupe, ' clip-path="url(#ed-c-00000000000000)"']] : [])
      }
    };
    const liste = [...FONCTIONNALITES, fictive];
    const r = renduDe(d, liste);
    const f1 = d.formes.find(f => f.id === 'f1');
    if (!f1) throw new Error('f1');
    const x = r.feuille(f1);
    expect(x.genre === 'chemin' ? x.attributs : []).toEqual([['filter', expect.stringMatching(/^url\(#ed-f-[0-9a-f]{14}\)$/)]]);
    expect(r.definitions).toMatch(/<filter id="ed-f-[0-9a-f]{14}" x="0"><feGaussianBlur stdDeviation="2"\/><\/filter>/);
    const photo = Object.values(d.groupes ?? {}).find(g => g.nom === 'Photo');
    if (photo) expect(r.groupe(photo).attributs).toEqual([['clip-path', 'url(#ed-c-00000000000000)'], ['data-ed-nom', 'Photo']]);
    // Le catalogue seul ne la connait pas : rien de fictif dans son rendu.
    expect(renduDe(d).definitions).not.toContain('<filter');
  });
});

describe('lireAttributs', () => {
  it('lit les attributs ecrits et decode leurs valeurs', () => {
    expect(lireAttributs(' opacity="0.5" data-ed-nom="a&amp;b &quot;c&quot; &lt;d"')).toEqual([['opacity', '0.5'], ['data-ed-nom', 'a&b "c" <d']]);
    expect(lireAttributs('')).toEqual([]);
  });
});

describe('le rendu des effets et des images a effets', () => {
  it('rend les definitions d un dessin a effets comme l ecriture, groupes filtres compris', () => {
    for (const nom of ['v2/effets-flou-ombre.svg', 'v2/effets-rotation.svg', 'v2/effets-image.svg']) {
      const d = riche(nom);
      expect(renduDe(d).definitions, nom).toBe(defsEcrites(d));
    }
  });

  it('suit les enfants d un groupe filtre : sa region se remesure quand un enfant bouge, l objet du groupe restant le meme', () => {
    const d = riche('v2/effets-flou-ombre.svg');
    const g = Object.values(d.groupes ?? {}).find(x => x.effets);
    expect(g).toBeDefined();
    const enfant = d.formes.find(f => f.parent === g?.id);
    expect(enfant).toBeDefined();
    renduDe(d);
    const bouge = deplacer(d, [enfant?.id ?? ''], 40, 25);
    expect(bouge.groupes?.[g?.id ?? '']).toBe(g);
    expect(renduDe(bouge).definitions).toBe(defsEcrites(bouge));
    expect(renduDe(bouge).definitions).not.toBe(renduDe(d).definitions);
  });
});

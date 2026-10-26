// Les points d'extension du modele v2 (ADR-0012, annexe 8, etape 0) : la lecture, l'ecriture et la transformation consultent les
// fonctionnalites du catalogue. Ici, des fonctionnalites FACTICES prouvent que chaque crochet est appele au bon endroit, et que le
// mode plat n'en consulte aucune ; puis le contrat que toute fonctionnalite inscrite doit tenir sur une feuille plate.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FONCTIONNALITES, RANG_FEUILLE, RANG_GROUPE, ecrireDessin, ecrireForme, idDefinition, lireDessin, modifier, recueil, rotation, transformer, transformerFeuille,
  translation, type Chemin, type ContexteEcriture, type DessinSvg, type Fonctionnalite, type Forme, type Groupe, type Peinture
} from '../../../src/engine/editionSvg.js';
import { lireDessinAvec } from '../../../src/engine/edition/lecture.js';
import { ecrireDessinRiche } from '../../../src/engine/edition/ecritureRiche.js';
import { multiplier, transformerChemin } from '../../../src/engine/edition/geometrie.js';

const carre: Chemin = [{ c: 'M', p: [0, 0] }, { c: 'L', p: [10, 0] }, { c: 'L', p: [10, 10] }, { c: 'Z', p: [] }];
const f = (id: string, p: Partial<Forme> = {}): Forme => ({ id, d: carre, remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p });
const g = (id: string, p: Partial<Groupe> = {}): Groupe => ({ id, visible: true, verrouille: false, ...p });
const degrade: Peinture = { genre: 'lineaire', x1: 0, y1: 0, x2: 10, y2: 0, arrets: [{ position: 0, couleur: '#000000' }, { position: 1, couleur: '#ffffff' }] };
const SVG = (corps: string) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + corps + '</svg>';
const erreur = (r: ReturnType<typeof lireDessin>) => ('erreur' in r ? r.erreur : '');
const formes = (r: ReturnType<typeof lireDessin>): readonly Forme[] => { if ('erreur' in r) throw new Error(r.erreur); return r.dessin.formes; };

// ---------------------------------------------------------------- des fonctionnalites factices

/** Lit <image> en une feuille a son rectangle. */
const images: Fonctionnalite = {
  nom: 'images-factices',
  lecture: {
    elements: {
      image: (n, _pret, marche) => {
        const x = Number(n.attributs.x ?? 0), y = Number(n.attributs.y ?? 0), l = Number(n.attributs.width ?? 0), h = Number(n.attributs.height ?? 0);
        marche.parcours.formes.push(f('f' + (marche.parcours.formes.length + 1), {
          d: [{ c: 'M', p: [x, y] }, { c: 'L', p: [x + l, y] }, { c: 'L', p: [x + l, y + h] }, { c: 'L', p: [x, y + h] }, { c: 'Z', p: [] }],
          remplissage: null, image: { donnees: n.attributs.href ?? '', x, y, l, h }
        }));
      }
    }
  },
  ecriture: {
    elementFeuille: (x, e) => (x.image ? '<image x="' + x.image.x + '" width="' + x.image.l + '" p="' + e.precision + '"/>' : null)
  }
};

/** Prend en charge `filter` et le lit sur la feuille en un flou ; ecrit `filter` par une definition. */
const effets: Fonctionnalite = {
  nom: 'effets-factices',
  lecture: {
    prises: ['filtre'],
    feuille: (x, _n, pret) => (pret.heritees.filter === undefined && pret.pr.filter ? { ...x, effets: { flou: { ecart: 2 } } } : x)
  },
  ecriture: {
    attributsFeuille: (x, e) => (x.effets?.flou ? [[RANG_FEUILLE.filtre, ' filter="url(#' + e.definitions.poser({ genre: 'f', balise: 'filter', attributs: '', enfants: '<feGaussianBlur stdDeviation="' + x.effets.flou.ecart + '"/>' }) + ')"']] : [])
  },
  transformation: {
    feuille: (x, m) => (x.effets?.flou ? { ...x, effets: { flou: { ecart: x.effets.flou.ecart * Math.hypot(m[0], m[1]) } } } : x)
  }
};

/** Resout url(#…) en degrade, repli gris ; l'ecrit en definition, a la place de la couleur. */
const degrades: Fonctionnalite = {
  nom: 'degrades-factices',
  lecture: { peinture: url => (url.startsWith('url(#d') ? { peinture: degrade, repli: '#808080' } : null) },
  ecriture: {
    peindreFeuille: (x, e) => (x.peintureRemplissage
      ? { ...x, remplissage: 'url(#' + e.definitions.poser({ genre: 'd', balise: 'linearGradient', attributs: ' gradientUnits="userSpaceOnUse"', enfants: '<stop offset="0"/>' }) + ')' }
      : x)
  }
};

/** Ecrit l'opacite et le nom d'un groupe, dans le desordre : le rang les remet en place. */
const groupes: Fonctionnalite = {
  nom: 'groupes-factices',
  ecriture: {
    attributsGroupe: x => [
      ...(x.nom ? [[RANG_GROUPE.nom, ' data-ed-nom="' + x.nom + '"'] as const] : []),
      ...(x.opacite !== undefined ? [[RANG_GROUPE.opacite, ' opacity="' + x.opacite + '"'] as const] : [])
    ]
  }
};

const FACTICES = [images, effets, degrades, groupes];

// ---------------------------------------------------------------- lecture

describe('la lecture consulte les fonctionnalites en mode riche seulement', () => {
  it('un lecteur d element lit une balise que le mode plat refuse', () => {
    const svg = SVG('<image x="5" y="6" width="20" height="10" href="data:image/png;base64,AAAA"/>');
    expect(erreur(lireDessin(svg))).toContain('une image');
    expect(erreur(lireDessinAvec(svg, {}, []))).toContain('une image');
    expect(formes(lireDessinAvec(svg, { modele: 'riche' }, FACTICES))[0]?.image).toEqual({ donnees: 'data:image/png;base64,AAAA', x: 5, y: 6, l: 20, h: 10 });
  });

  it('une prise en charge leve le refus et la feuille se complete', () => {
    const svg = SVG('<path d="M0 0L10 0L10 10Z" filter="url(#f)"/>');
    expect(erreur(lireDessin(svg))).toContain('un filtre');
    expect(erreur(lireDessin(svg, { modele: 'riche' }))).toContain('un filtre');
    expect(formes(lireDessinAvec(svg, {}, FACTICES))[0]?.effets).toEqual({ flou: { ecart: 2 } });
    // Ce que personne ne prend en charge reste refuse, avec la phrase d'aujourd'hui.
    expect(erreur(lireDessinAvec(SVG('<path d="M0 0L10 0Z" clip-path="url(#c)"/>'), {}, FACTICES))).toContain('un masque ou une découpe');
  });

  it('une peinture url(#…) resolue garde son repli en couleur et sa peinture a cote', () => {
    const svg = SVG('<path d="M0 0L10 0L10 10Z" fill="url(#d1)"/>');
    expect(erreur(lireDessin(svg))).toContain('un dégradé ou un motif');
    const [x] = formes(lireDessinAvec(svg, {}, FACTICES));
    expect(x?.remplissage).toBe('#808080');
    expect(x?.peintureRemplissage).toEqual(degrade);
    expect(erreur(lireDessinAvec(SVG('<path d="M0 0L10 0Z" stroke="url(#p1)"/>'), {}, FACTICES))).toContain('un dégradé ou un motif');
  });
});

// ---------------------------------------------------------------- ecriture

const ecrivain = (precision: number) => () => (x: Forme) => ecrireForme(x, precision);

describe('l ecriture riche', () => {
  it('n est jamais prise pour un dessin plat', () => {
    const d: DessinSvg = { vb: [0, 0, 100, 100], formes: [f('f1')] };
    expect(ecrireDessin(d, 3)).not.toContain('data-ed-modele');
  });

  it('ecrit les groupes visibles, rien d un groupe masque, et le marqueur en dernier attribut', () => {
    const d: DessinSvg = {
      vb: [0, 0, 100, 100],
      formes: [f('f1'), f('f2', { parent: 'g1' }), f('f3', { parent: 'g2' }), f('f4', { parent: 'g3' })],
      groupes: { g1: g('g1'), g2: g('g2', { visible: false }), g3: g('g3') }
    };
    const svg = ecrireDessin(d, 3);
    const chemin = (x: Forme) => ecrireForme(x, 3);
    expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" data-ed-modele="2">'
      + chemin(f('f1')) + '<g>' + chemin(f('f2', { parent: 'g1' })) + '</g><g>' + chemin(f('f4', { parent: 'g3' })) + '</g></svg>');
    // Une feuille sans champ v2 s'ecrit avec les octets de l'ecriture plate.
    expect(chemin(f('f2', { parent: 'g1' }))).toBe(chemin(f('f2')));
  });

  it('appelle les ecrivains : definitions dedoublonnees en tete, attributs tries par rang, element entier', () => {
    const d: DessinSvg = {
      vb: [0, 0, 100, 100],
      formes: [
        f('f1', { peintureRemplissage: degrade, remplissage: '#808080', effets: { flou: { ecart: 3 } } }),
        f('f2', { parent: 'g1', peintureRemplissage: degrade, remplissage: '#808080' }),
        f('f3', { image: { donnees: 'data:', x: 1, y: 2, l: 3, h: 4 }, remplissage: null })
      ],
      groupes: { g1: g('g1', { nom: 'Nuage', opacite: 0.5 }) }
    };
    const svg = ecrireDessinRiche(d, 3, ecrivain(3), FACTICES);
    const idD = idDefinition('d', 'linearGradient gradientUnits="userSpaceOnUse"><stop offset="0"/></linearGradient>');
    const idF = idDefinition('f', 'filter><feGaussianBlur stdDeviation="3"/></filter>');
    expect(idD).toMatch(/^ed-d-[0-9a-f]{14}$/);
    expect(svg).toContain(' xmlns:xlink="http://www.w3.org/1999/xlink" viewBox=');
    expect(svg).toContain('data-ed-modele="2"><defs><linearGradient id="' + idD + '" gradientUnits="userSpaceOnUse"><stop offset="0"/></linearGradient><filter id="' + idF + '">');
    expect(svg.match(/<linearGradient /g)).toHaveLength(1);
    expect(svg).toContain('fill="url(#' + idD + ')" filter="url(#' + idF + ')"/>');
    expect(svg).toContain('<g opacity="0.5" data-ed-nom="Nuage"><path d="M0 0L10 0L10 10Z" fill="url(#' + idD + ')"/></g>');
    expect(svg).toContain('<image x="1" width="3" p="3"/>');
  });

  it('ecrit un contenu imbrique avec la meme machinerie', () => {
    let vu = '';
    const masques: Fonctionnalite = {
      nom: 'masques-factices',
      ecriture: { attributsGroupe: (x, e: ContexteEcriture) => { if (!x.masque) return []; vu = e.contenu(x.masque.contenu); return [[RANG_GROUPE.masque, ' mask="url(#m)"']]; } }
    };
    const d: DessinSvg = { vb: [0, 0, 100, 100], formes: [f('f1', { parent: 'g1' })], groupes: { g1: g('g1', { masque: { type: 'luminance', region: { x: 0, y: 0, l: 1, h: 1 }, contenu: { formes: [f('f9', { remplissage: '#ffffff' })] } } }) } };
    expect(ecrireDessinRiche(d, 3, ecrivain(3), [masques])).toContain('<g mask="url(#m)">');
    expect(vu).toBe(ecrireForme(f('f9', { remplissage: '#ffffff' }), 3));
  });

  it('le recueil dedoublonne par texte et nomme par empreinte', () => {
    const r = recueil();
    const a = r.poser({ genre: 'c', balise: 'clipPath', attributs: '', enfants: '<path d="M0 0Z"/>' });
    expect(r.poser({ genre: 'c', balise: 'clipPath', attributs: '', enfants: '<path d="M0 0Z"/>' })).toBe(a);
    expect(r.poser({ genre: 'c', balise: 'clipPath', attributs: '', enfants: '<path d="M1 1Z"/>' })).not.toBe(a);
    expect(r.ecrire()).toMatch(/^<defs><clipPath id="ed-c-[0-9a-f]{14}"><path d="M0 0Z"\/><\/clipPath><clipPath id="ed-c-[0-9a-f]{14}">/);
    expect(recueil().ecrire()).toBe('');
  });
});

// ---------------------------------------------------------------- transformation

describe('la transformation d une feuille', () => {
  it('passe par les fonctionnalites apres le trace, le trait et le texte', () => {
    const m = multiplier(translation(5, 5), rotation(90));
    const x = f('f1', { effets: { flou: { ecart: 2 } }, contour: '#000000', epaisseur: 1 });
    const y = transformerFeuille(x, m, undefined, FACTICES);
    expect(y.d).toEqual(transformerChemin(carre, m));
    expect(y.effets?.flou?.ecart).toBeCloseTo(2);
    expect(transformerFeuille(x, [2, 0, 0, 2, 0, 0], undefined, FACTICES).effets).toEqual({ flou: { ecart: 4 } });
    // Le catalogue (vide a l'etape 0) ne touche a rien d'autre que le calcul d'avant.
    expect(transformer({ vb: [0, 0, 1, 1], formes: [x] }, ['f1'], [2, 0, 0, 2, 0, 0]).formes[0]?.effets).toEqual({ flou: { ecart: 2 } });
  });
});

describe('modifier et les peintures non unies', () => {
  it('une couleur unie retire la peinture du meme cote, pas celle de l autre', () => {
    const x = f('f1', { peintureRemplissage: degrade, remplissage: '#808080', peintureContour: degrade, contour: '#808080', epaisseur: 1 });
    const d: DessinSvg = { vb: [0, 0, 10, 10], formes: [x] };
    const fond = modifier(d, ['f1'], { remplissage: '#808080' }).formes[0];
    expect(fond?.peintureRemplissage).toBeUndefined();
    expect(fond?.peintureContour).toEqual(degrade);
    expect(fond?.remplissage).toBe('#808080');
    const trait = modifier(d, ['f1'], { contour: null }).formes[0];
    expect(trait && 'peintureContour' in trait).toBe(false);
    expect(trait?.peintureRemplissage).toEqual(degrade);
    expect(modifier(d, ['f1'], { opacite: 1 })).toBe(d);
  });
});

// ---------------------------------------------------------------- le contrat de toute fonctionnalite inscrite

const DOSSIER = resolve(__dirname, '../../fixtures/svg');
const feuillesPlates: Forme[] = readdirSync(DOSSIER).filter(n => n.endsWith('.svg') && !n.endsWith('.attendu.svg')).flatMap(n => {
  const r = lireDessin(readFileSync(resolve(DOSSIER, n), 'utf8'));
  return 'erreur' in r ? [] : r.dessin.formes;
});

/** Le contrat sur une feuille plate : la meme feuille, aucun attribut, aucun element, aucune definition. */
function violationsDuContrat(k: Fonctionnalite): string[] {
  const out: string[] = [], r = recueil();
  const e: ContexteEcriture = { precision: 3, definitions: r, contenu: () => '' };
  for (const x of feuillesPlates) {
    if ((k.transformation?.feuille?.(x, rotation(30)) ?? x) !== x) out.push(k.nom + ' transforme une feuille plate ' + x.id);
    if ((k.ecriture?.peindreFeuille?.(x, e) ?? x) !== x) out.push(k.nom + ' repeint une feuille plate ' + x.id);
    if ((k.ecriture?.attributsFeuille?.(x, e) ?? []).length) out.push(k.nom + ' ajoute un attribut a une feuille plate ' + x.id);
    if ((k.ecriture?.elementFeuille?.(x, e) ?? null) !== null) out.push(k.nom + ' ecrit un element pour une feuille plate ' + x.id);
    const b = { x: 0, y: 0, l: 1, h: 1 };
    if ((k.etendue?.feuille?.(x, b) ?? b) !== b) out.push(k.nom + ' change la boite visuelle d une feuille plate ' + x.id);
  }
  if (r.ecrire() !== '') out.push(k.nom + ' pose une definition pour une feuille plate');
  return out;
}

describe('le contrat des fonctionnalites', () => {
  it('le corpus de feuilles plates est assez grand', () => {
    expect(feuillesPlates.length).toBeGreaterThan(200);
  });

  it('les fonctionnalites factices le tiennent (le controle n est pas vide)', () => {
    for (const k of FACTICES) expect(violationsDuContrat(k)).toEqual([]);
    const fautive: Fonctionnalite = { nom: 'fautive', transformation: { feuille: x => ({ ...x }) } };
    expect(violationsDuContrat(fautive).length).toBeGreaterThan(0);
  });

  it('chaque fonctionnalite du catalogue le tient, et porte un nom unique', () => {
    for (const k of FONCTIONNALITES) expect(violationsDuContrat(k), k.nom).toEqual([]);
    expect(new Set(FONCTIONNALITES.map(k => k.nom)).size).toBe(FONCTIONNALITES.length);
  });
});

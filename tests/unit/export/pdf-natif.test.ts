// Le PDF natif d'un dessin riche (ADR-0012, etape 13a) : degrades en shading, decoupes en chemin de decoupe, masques en masque doux,
// images en XObject. Chaque SVG de tests/fixtures/pdf-natif/ est lu en riche, descendu pour le PDF, ses images preparees (le flux
// PNG decompresse par le zlib de Node, comme le navigateur le fait dans `io`), puis ecrit ; les octets sont compares a la reference
// commise a cote. Les references se refont, apres relecture, par :
//
//   ACTUALISER_REFERENCES=1 npx vitest run tests/unit/export/pdf-natif.test.ts
//
// Le fichier est relu par un lecteur independant du writer (table des decalages, objets, flux decompresses), et rendu par pdftoppm
// (Poppler) quand il est installe : quelques points de chaque page doivent avoir la couleur que le navigateur donne au SVG.

import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { aplatirPour, phrasePertes } from '../../../src/engine/aplatir.js';
import { CAPACITES_EPS, CAPACITES_PDF } from '../../../src/export/capacites.js';
import { ecrirePdf, type OptionsPdf } from '../../../src/export/pdf.js';
import { aDecompresser, preparerImagesPdf } from '../../../src/export/pdfImages.js';

const DOSSIER = resolve(__dirname, '../../fixtures/pdf-natif');
const ACTUALISER = process.env.ACTUALISER_REFERENCES === '1';

const riche = (svg: string): DessinSvg => {
  const r = lireDessin(svg, { modele: 'riche' });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};

/** L'export PDF tel que l'editeur le fait (`zones/actionsExport.ts`), la decompression de Node a la place de celle du navigateur. */
export function exporterPdf(d: DessinSvg, options: OptionsPdf = {}): { octets: Uint8Array; phrase: string } {
  const r = aplatirPour(d, CAPACITES_PDF);
  if (!r.scene) return { octets: ecrirePdf(r.dessin, options), phrase: phrasePertes(r.pertes, r.perdus) };
  const decompresses = new Map(aDecompresser(r.scene).map(f => [f.donnees, new Uint8Array(inflateSync(f.flux))]));
  const images = preparerImagesPdf(r.scene, decompresses, options.cmjn === true);
  return { octets: ecrirePdf(r.dessin, options, { scene: r.scene, images }), phrase: phrasePertes([...r.pertes, ...images.pertes], [...r.perdus, ...images.perdus]) };
}

// ---------------------------------------------------------------- un lecteur independant du writer

interface Objet { readonly dict: string; readonly flux: Buffer | null }

function lire(o: Uint8Array): Map<number, Objet> {
  const t = Buffer.from(o).toString('latin1');
  expect(t.startsWith('%PDF-1.4\n')).toBe(true);
  expect(t.endsWith('%%EOF\n')).toBe(true);
  const sx = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(t)?.[1]);
  expect(t.slice(sx, sx + 5)).toBe('xref\n');
  const taille = Number(/^xref\n0 (\d+)\n/.exec(t.slice(sx))?.[1]);
  const lignes = [...t.slice(sx).matchAll(/^(\d{10}) (\d{5}) ([nf]) \n/gm)];
  expect(lignes.length).toBe(taille);
  expect(t).toContain('trailer\n<< /Size ' + taille + ' /Root 1 0 R /Info 5 0 R >>');
  const objets = new Map<number, Objet>();
  lignes.slice(1).forEach((m, i) => {
    const pos = Number(m[1]), tete = (i + 1) + ' 0 obj\n';
    expect(t.slice(pos, pos + tete.length)).toBe(tete);
    const debut = pos + tete.length, s = t.indexOf('\nstream\n', debut), fin = t.indexOf('\nendobj\n', debut);
    if (s >= 0 && s < fin) {
      const dict = t.slice(debut, s), n = Number(/\/Length (\d+)/.exec(dict)?.[1]);
      // /Length est exact : « endstream » suit le flux.
      expect(t.slice(s + 8 + n, s + 8 + n + 11), 'objet ' + (i + 1)).toBe('\nendstream\n');
      objets.set(i + 1, { dict, flux: Buffer.from(o.subarray(s + 8, s + 8 + n)) });
    } else objets.set(i + 1, { dict: t.slice(debut, fin), flux: null });
  });
  return objets;
}

/** Le flux d'un objet, decompresse s'il est en FlateDecode (sans predicteur). */
const decode = (x: Objet): Buffer => (x.flux && /\/Filter \/FlateDecode/.test(x.dict) && !/Predictor/.test(x.dict) ? inflateSync(x.flux) : x.flux ?? Buffer.alloc(0));

/** Chaque reference `N 0 R` d'un texte vise un objet qui existe ; chaque ressource citee par un contenu est declaree. */
function verifierReferences(objets: Map<number, Objet>): void {
  for (const [n, x] of objets) for (const m of x.dict.matchAll(/(\d+) 0 R/g)) expect(objets.has(Number(m[1])), n + ' -> ' + m[1]).toBe(true);
  // Les ressources : l'objet 6 d'un PDF natif, ou le dictionnaire de la page (le PDF d'un dessin plat).
  const page = objets.get(3)?.dict ?? '', ressources = /\/Resources 6 0 R/.test(page) ? objets.get(6)?.dict ?? '' : page;
  const contenus = [...objets].filter(([n, x]) => n === 4 || /\/Subtype \/Form/.test(x.dict)).map(([, x]) => decode(x).toString('latin1'));
  for (const c of contenus) {
    for (const m of c.matchAll(/\/([A-Za-z]+\d+) (gs|sh|Do|SCN)/g)) expect(ressources, m[1] + ' ' + m[2]).toContain('/' + m[1] + ' ');
    // q et Q s'equilibrent.
    const jetons = c.split(/\s+/);
    let p = 0;
    for (const j of jetons) { if (j === 'q') p++; if (j === 'Q') p--; expect(p).toBeGreaterThanOrEqual(0); }
    expect(p).toBe(0);
  }
}

const FIXTURES = readdirSync(DOSSIER).filter(n => n.endsWith('.svg')).map(n => n.slice(0, -4)).sort();

/** Les variantes de chaque reference : les options neutres ; le CMJN sur une page A4 a fond perdu pour le melange. */
const VARIANTES: readonly { readonly nom: string; readonly fixture: string; readonly options: OptionsPdf }[] = [
  ...FIXTURES.map(f => ({ nom: f, fixture: f, options: {} })),
  { nom: 'mixte-a4-cmjn', fixture: 'mixte', options: { page: 'A4', marge: 10, fondPerdu: 3, reperes: true, cmjn: true, titre: 'Mixte' } },
  { nom: 'degrades-a4', fixture: 'degrades', options: { page: 'A4', marge: 10 } }
];

describe('le PDF natif d un dessin riche', () => {
  it('a ses fixtures', () => {
    expect(FIXTURES).toEqual(['decoupes', 'degrades', 'images', 'images-perdues', 'masques', 'mixte']);
  });

  for (const v of VARIANTES) {
    it('ecrit la reference ' + v.nom + ' a l octet, et un fichier bien forme', () => {
      const d = riche(readFileSync(join(DOSSIER, v.fixture + '.svg'), 'utf8'));
      const { octets, phrase } = exporterPdf(d, v.options);
      // Memes entrees, memes octets.
      expect(Buffer.from(exporterPdf(d, v.options).octets).equals(Buffer.from(octets))).toBe(true);
      const chemin = join(DOSSIER, v.nom + '.pdf');
      if (ACTUALISER) writeFileSync(chemin, octets);
      expect(existsSync(chemin), v.nom + ' : reference absente (ACTUALISER_REFERENCES=1)').toBe(true);
      expect(Buffer.from(octets).equals(readFileSync(chemin)), v.nom + ' : la reference a change').toBe(true);
      verifierReferences(lire(octets));
      expect(phrase, v.nom).toBe(PHRASES[v.nom] ?? '');
    });
  }

  it('ecrit chaque fonction a sa facon : shading, chemin de decoupe, masque doux, groupe de transparence, XObject image', () => {
    const contenu = (nom: string) => {
      const o = lire(readFileSync(join(DOSSIER, nom + '.pdf')));
      const page = o.get(4);
      return { o, page: page ? decode(page).toString('latin1') : '', ressources: o.get(6)?.dict ?? '' };
    };
    const deg = contenu('degrades');
    expect(deg.ressources).toMatch(/\/ShadingType 2 /);
    expect(deg.ressources).toMatch(/\/ShadingType 3 [^>]*\/Coords \[0\.3 0\.3 0 0\.5 0\.5 0\.5\]/);
    expect(deg.ressources).toMatch(/\/PatternType 2 \/Shading/);
    expect(deg.ressources).toMatch(/\/Domain \[6 8\] \/Function << \/FunctionType 3 \/Domain \[6 8\] \/Functions \[(\d+) 0 R \1 0 R\]/);
    expect(deg.ressources).toMatch(/\/Encode \[0 1 1 0 0 1 1 0\]/);
    expect(deg.ressources).toMatch(/\/SMask << \/Type \/Mask \/S \/Luminosity \/G \d+ 0 R >>/);
    expect(deg.page).toMatch(/\nW n\n[-\d. ]+ cm\n\/Sh\d+ sh\n/);
    const dec = contenu('decoupes');
    expect(dec.page).toMatch(/\nW\* n\n/);
    expect(dec.page.match(/\nW n\n/g)?.length).toBeGreaterThanOrEqual(3);
    const msq = contenu('masques');
    expect(msq.ressources).toMatch(/\/S \/Alpha /);
    expect([...msq.o.values()].filter(x => /\/Group << \/S \/Transparency \/CS \/DeviceGray >>/.test(x.dict))).toHaveLength(2);
    // Le contenu d'un masque de luminance s'ecrit en gris : sa luminance.
    expect([...msq.o.values()].some(x => /\/CS \/DeviceGray/.test(x.dict) && / g\n/.test(decode(x).toString('latin1')))).toBe(true);
    const mix = contenu('mixte');
    expect(mix.ressources).toMatch(/<< \/ca 0\.85 \/CA 0\.85 >>/);
    const img = contenu('images');
    // Quinze images, treize differentes : une image reprise s'ecrit une fois.
    expect(img.ressources.match(/\/X\d+ \d+ 0 R/g)?.length).toBe(13);
    expect([...img.o.values()].filter(x => /\/Filter \/DCTDecode/.test(x.dict))).toHaveLength(4);
    expect([...img.o.values()].filter(x => /\/Predictor 15/.test(x.dict))).toHaveLength(3);
    expect([...img.o.values()].filter(x => /\/SMask \d+ 0 R/.test(x.dict))).toHaveLength(4);
    // Le CMJN : jamais rg ni RG dans la page.
    const cmjn = contenu('mixte-a4-cmjn');
    expect(cmjn.page).not.toMatch(/ (rg|RG)\n/);
    expect(cmjn.ressources).toMatch(/\/DeviceCMYK/);
  });

  it('se rend par pdftoppm (Poppler) quand il est installe : les couleurs du navigateur aux points sur', () => {
    if (!POPPLER) return;
    const dossier = mkdtempSync(join(tmpdir(), 'pdf-natif-'));
    try {
      for (const [nom, points] of Object.entries(POINTS)) {
        execFileSync('pdftoppm', ['-r', '72', join(DOSSIER, nom + '.pdf'), join(dossier, nom)], { stdio: 'pipe' });
        const ppm = readFileSync(join(dossier, nom + '-1.ppm'));
        const [, l = '0'] = /^P6\s+(\d+)\s+\d+\s+255\s/.exec(ppm.toString('latin1', 0, 32)) ?? [];
        const debut = ppm.length - Number(l) * Number(/^P6\s+\d+\s+(\d+)/.exec(ppm.toString('latin1', 0, 32))?.[1]) * 3;
        for (const [x, y, attendu] of points) {
          const i = debut + (y * Number(l) + x) * 3, lu = [ppm[i] ?? 0, ppm[i + 1] ?? 0, ppm[i + 2] ?? 0];
          expect(Math.max(...lu.map((v, k) => Math.abs(v - (attendu[k] ?? 0)))), nom + ' (' + x + ', ' + y + ') ' + lu.join(' ')).toBeLessThanOrEqual(14);
        }
      }
    } finally { rmSync(dossier, { recursive: true, force: true }); }
  });

  it('un dessin riche sans rien de natif garde le PDF de sa descente d avant, octet pour octet', () => {
    const racine = resolve(__dirname, '../../fixtures/svg');
    let vus = 0;
    for (const nom of readdirSync(racine).filter(n => n.endsWith('.svg'))) {
      const r = lireDessin(readFileSync(join(racine, nom), 'utf8'), { modele: 'riche' });
      if ('erreur' in r) continue;
      const pdf = aplatirPour(r.dessin, CAPACITES_PDF);
      if (pdf.scene) continue;
      vus++;
      expect(Buffer.from(ecrirePdf(pdf.dessin)).equals(Buffer.from(ecrirePdf(aplatirPour(r.dessin, CAPACITES_EPS).dessin))), nom).toBe(true);
    }
    expect(vus).toBeGreaterThan(50);
  });

  it('ecrit un fichier bien forme pour chaque dessin riche du corpus et des fixtures v2, que Poppler lit sans erreur', () => {
    const racine = resolve(__dirname, '../../fixtures/svg');
    const noms = [...readdirSync(join(racine, 'v2')).filter(n => n.endsWith('.svg')).map(n => join(racine, 'v2', n)), ...readdirSync(join(racine, 'corpus')).filter(n => n.endsWith('.svg')).map(n => join(racine, 'corpus', n))];
    const dossier = POPPLER ? mkdtempSync(join(tmpdir(), 'pdf-natif-')) : '';
    let scenes = 0;
    try {
      for (const chemin of noms) {
        const r = lireDessin(readFileSync(chemin, 'utf8'), { modele: 'riche' });
        if ('erreur' in r) continue;
        const { octets } = exporterPdf(r.dessin);
        verifierReferences(lire(octets));
        if (!aplatirPour(r.dessin, CAPACITES_PDF).scene) continue;
        scenes++;
        if (!POPPLER) continue;
        const f = join(dossier, 'x.pdf');
        writeFileSync(f, octets);
        // Poppler dit sur sa sortie d'erreur ce qu'il ne lit pas (objet absent, operateur inconnu, flux casse) : rien.
        const p = spawnSync('pdftoppm', ['-r', '20', f, join(dossier, 'x')], { encoding: 'utf8' });
        expect([p.status, p.stderr], chemin).toEqual([0, '']);
      }
    } finally { if (dossier) rmSync(dossier, { recursive: true, force: true }); }
    expect(scenes).toBeGreaterThan(40);
  });
});

/** Ce que l'export dit de chaque reference (« approché », « perdu »). */
const PHRASES: Readonly<Record<string, string>> = {
  decoupes: 'Approché par ce format : une découpe faite de formes qui se recouvrent (son bord est recalculé, les courbes rebâties).',
  'images-perdues': 'Perdu dans ce format : une image WebP (ce format ne la lit pas : elle n’est pas exportée).',
  'mixte-a4-cmjn': 'Approché par ce format : les images (gardées en RVB : ce format ne convertit pas leurs pixels en CMJN).'
};

/** Pdftoppm repond-il ? (Poppler ; absent de la CI, present sur la machine qui relit les references.) */
const POPPLER = (() => { try { execFileSync('pdftoppm', ['-v'], { stdio: 'pipe' }); return true; } catch { return false; } })();

/**
 * Des points de chaque reference, loin des bords et des pixels d'image agrandis (Poppler lisse une image en decalant ses echantillons
 * d'un demi-pixel), et la couleur que Chromium donne au meme endroit du SVG ecrit par l'editeur (releve le 26 octobre 2026, au centre
 * du pixel, a trois fois la taille).
 */
const POINTS: Readonly<Record<string, readonly (readonly [number, number, readonly number[]])[]>> = {
  degrades: [[27, 40, [126, 113, 72]], [44, 40, [238, 181, 7]], [47, 40, [43, 135, 76]], [125, 40, [236, 152, 105]], [172, 40, [88, 48, 192]], [200, 16, [255, 248, 224]], [35, 95, [52, 96, 212]], [35, 140, [220, 227, 248]], [65, 120, [200, 193, 215]], [103, 120, [77, 77, 77]], [112, 120, [192, 192, 192]], [150, 125, [58, 110, 145]], [220, 140, [151, 228, 151]]],
  decoupes: [[50, 20, [224, 184, 74]], [50, 80, [255, 255, 255]], [12, 50, [255, 255, 255]], [150, 20, [42, 138, 90]], [150, 50, [255, 255, 255]], [115, 50, [42, 138, 90]], [205, 45, [208, 80, 16]], [232, 70, [208, 80, 16]], [185, 85, [255, 255, 255]], [40, 50, [163, 112, 135]]],
  masques: [[15, 60, [203, 42, 52]], [105, 60, [252, 244, 245]], [60, 60, [144, 168, 198]], [140, 60, [148, 196, 172]]],
  images: [[191, 13, [20, 140, 60]], [150, 85, [53, 62, 173]], [210, 80, [232, 232, 232]], [260, 80, [192, 32, 96]], [40, 150, [118, 56, 113]], [120, 140, [162, 146, 181]], [255, 140, [32, 64, 208]], [280, 175, [33, 176, 32]]],
  mixte: [[100, 30, [243, 235, 206]], [40, 70, [101, 131, 184]], [100, 80, [133, 135, 162]], [100, 120, [36, 110, 81]], [60, 40, [203, 207, 208]]]
};

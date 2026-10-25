// Les PDF de tests/fixtures/pdf, commis, et ce que la lecture doit en tirer. Trois familles :
//   - ecrits a la main par ce fichier (minimal, compresse, pages, texte-image, chiffre, malforme), dans le style des producteurs
//     courants : table classique en texte, ou PDF 1.5 avec table en flux, flux d'objets, formulaire, espace ICC et calque ;
//   - ecrits par l'export du projet (export-elements, export-elements-a4-cmjn), depuis tests/fixtures/svg/elements.svg ;
//   - ecrits par d'autres producteurs, sans reseau : reportlab 4 (reportlab.pdf), Cairo 1.18 par poppler 24.02, le moteur PDF
//     d'Inkscape (cairo.pdf, PDF 1.7 a flux d'objets), et Skia par Chromium 141 (skia.pdf). Ceux-la ne se regenerent pas ici ;
//     ils sont venus ainsi (reportlab est deterministe avec invariant=1) :
//       python3 -c "$SCRIPT" reportlab.pdf, ou SCRIPT est :
//         from reportlab.pdfgen import canvas; from reportlab.lib.colors import Color, CMYKColor; import sys
//         c = canvas.Canvas(sys.argv[1], pagesize=(300, 200), invariant=1)
//         c.setFillColorRGB(0.8, 0.1, 0.15); c.rect(10, 10, 80, 60, fill=1, stroke=0)
//         c.setStrokeColorRGB(0, 0, 1); c.setLineWidth(3); c.setDash(6, 3); c.circle(140, 75, 40, fill=0, stroke=1); c.setDash()
//         c.setFillColor(CMYKColor(0, 0.5, 1, 0)); c.roundRect(200, 20, 80, 50, 10, fill=1, stroke=0)
//         c.setFillAlpha(0.5); c.setFillColorRGB(0, 0.6, 0.2); c.ellipse(20, 100, 120, 180, fill=1, stroke=0); c.setFillAlpha(1)
//         c.saveState(); p = c.beginPath(); p.rect(160, 100, 120, 80); c.clipPath(p, stroke=0, fill=0)
//         c.linearGradient(160, 100, 280, 180, (Color(1, 0, 0), Color(0, 0, 1)), extend=False); c.restoreState()
//         c.setFillColorRGB(0, 0, 0); c.drawString(20, 185, 'Bonjour')
//         p = c.beginPath(); p.moveTo(200, 190); p.curveTo(220, 160, 260, 200, 290, 170); c.setLineWidth(2); c.drawPath(p, stroke=1, fill=0)
//         c.showPage(); c.setFillColorRGB(0.2, 0.2, 0.8); c.rect(50, 50, 100, 100, fill=1, stroke=0); c.showPage(); c.save()
//       pdftocairo -pdf reportlab.pdf cairo.pdf
//       skia.pdf : page.pdf({ width: '300px', height: '200px', printBackground: true }) de Playwright sur une page HTML (@page 300 x 200 px,
//       marges nulles) qui porte un SVG en ligne : rectangle #c81e28, cercle trace #1428a0 en tirets « 8 4 », triangle #33aa44 a 60 %,
//       rectangle arrondi #f0a020 tourne de 20 degres, courbe #15181d a bouts ronds ; et un paragraphe « Texte » qui deborde sur une 2e page.
//
// Regenerer les deux premieres familles apres un changement voulu de l'export ou de ce fichier :
//
//   ACTUALISER_REFERENCES=1 npx vitest run tests/unit/engine/pdf/fixtures.test.ts

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireDessin } from '../../../../src/engine/editionSvg.js';
import { ecrirePdf } from '../../../../src/export/pdf.js';
import { enTexte, flux, lire, lu, octets, pdfClassique, pdfModerne, refus } from './fabrique.js';

const DOSSIER = resolve(__dirname, '../../../fixtures/pdf');
const ACTUALISER = process.env.ACTUALISER_REFERENCES === '1';
const fixture = (nom: string): Buffer => readFileSync(resolve(DOSSIER, nom));

/** Un cercle en quatre cubiques (k = 0,5523), en operateurs PDF. */
const cercle = (cx: number, cy: number, r: number): string => {
  const k = 0.5523 * r, f = (v: number) => String(Math.round(v * 1000) / 1000);
  return [f(cx + r) + ' ' + f(cy) + ' m', [cx + r, cy + k, cx + k, cy + r, cx, cy + r].map(f).join(' ') + ' c', [cx - k, cy + r, cx - r, cy + k, cx - r, cy].map(f).join(' ') + ' c',
    [cx - r, cy - k, cx - k, cy - r, cx, cy - r].map(f).join(' ') + ' c', [cx + k, cy - r, cx + r, cy - k, cx + r, cy].map(f).join(' ') + ' c', 'h'].join('\n');
};

const CATALOGUE = '<< /Type /Catalog /Pages 2 0 R >>';

/** Le dessin d'exemple de l'accueil (zones/Application.tsx), ecrit a la main en operateurs PDF, sans compression. */
const minimal = (): Buffer => pdfClassique([
  CATALOGUE,
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 160] /Contents 4 0 R /Resources << >> >>',
  flux('<< >>', ['% Le dessin d exemple de l accueil, en PDF ecrit a la main',
    '0.914 0.925 0.937 rg 16 16 208 128 re f',
    '0.784 0.118 0.157 rg', cercle(80, 80, 40), 'f',
    '0.078 0.157 0.627 rg 130 40 m 170 120 l 210 40 l h f',
    '0.082 0.094 0.114 RG 4 w 1 j 40 30 m 93.333 56.667 146.667 56.667 200 30 c S'].join('\n'))
]);

/** Un PDF 1.5 au style d'Illustrator : flux d'objets, table en flux, contenu compresse, formulaire, espace ICC, calque. */
const compresse = (): Buffer => pdfModerne([
  '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [7 0 R] /D << /ON [7 0 R] /Order [7 0 R] >> >> >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /TrimBox [0 0 300 200] /Contents 4 0 R /Resources << /ColorSpace << /CS0 [/ICCBased 6 0 R] >> /XObject << /Fm0 5 0 R >> /Properties << /MC0 7 0 R >> /ExtGState << /GS0 8 0 R >> >> >>',
  flux('<< >>', ['/OC /MC0 BDC', '/CS0 cs 0.914 0.925 0.937 scn 0 0 300 200 re f', 'q 1 0 0 1 20 20 cm /Fm0 Do Q', 'q 1 0 0 1 160 20 cm /GS0 gs /Fm0 Do Q', 'EMC'].join('\n'), true),
  flux('<< /Type /XObject /Subtype /Form /BBox [0 0 120 160] /Matrix [1 0 0 1 0 0] /Resources << /ColorSpace << /CS0 [/ICCBased 6 0 R] >> >> >>',
    ['/CS0 cs 0.784 0.118 0.157 scn', cercle(60, 100, 40), 'f', '/CS0 CS 0.078 0.157 0.627 SCN 6 w 0 J 0 j 10 M 10 10 m 110 10 l 60 50 l h S'].join('\n'), true),
  flux('<< /N 3 /Alternate /DeviceRGB >>', 'profil ICC factice', true),
  '<< /Type /OCG /Name (Calque 1) >>',
  '<< /Type /ExtGState /ca 0.5 /CA 0.5 >>'
]);

/** Trois pages : MediaBox heritee du noeud, une page qui redefinit la sienne, une page tournee d'un quart. */
const pages = (): Buffer => pdfClassique([
  CATALOGUE,
  '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 /MediaBox [0 0 200 150] >>',
  '<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>',
  flux('<< >>', '1 0 0 rg 20 20 60 60 re f'),
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 150] /Contents 6 0 R >>',
  flux('<< >>', '0 0 1 rg\n' + cercle(75, 75, 50) + '\nf\n' + cercle(225, 75, 50) + '\nf'),
  '<< /Type /Page /Parent 2 0 R /Rotate 90 /Contents 8 0 R >>',
  flux('<< >>', '0 0.6 0.2 rg 20 20 m 180 20 l 100 130 l h f')
]);

/** Des formes, deux textes et deux images (un XObject et une image en ligne) : ce que la lecture dit ne pas reprendre. */
const texteImage = (): Buffer => pdfClassique([
  CATALOGUE,
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 160] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /XObject << /Im0 6 0 R >> >> >>',
  flux('<< >>', ['0.2 0.4 0.8 rg 20 20 100 60 re f', 'BT /F1 18 Tf 20 120 Td (Bonjour) Tj ET', 'BT /F1 10 Tf 20 100 Td [(Au) 20 (revoir)] TJ ET',
    'q 60 0 0 40 150 20 cm /Im0 Do Q', 'q 20 0 0 20 150 100 cm BI /W 2 /H 2 /CS /G /BPC 8 ID \x00\xff\xff\x00 EI Q', '0.8 0.1 0.15 RG 3 w 150 140 m 220 140 l S'].join('\n')),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  flux('<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 >>', '\x00\x80\x80\xff')
]);

const chiffre = (): Buffer => pdfClassique([CATALOGUE, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>', flux('<< >>', '0 0 10 10 re f'),
  '<< /Filter /Standard /V 2 /R 3 /Length 128 /O <28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A> /U <28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A> /P -3904 >>'],
'/Root 1 0 R /Encrypt 5 0 R /ID [<0123456789ABCDEF0123456789ABCDEF> <0123456789ABCDEF0123456789ABCDEF>]');

const malforme = (): Buffer => octets('%PDF-1.7\n%\xe2\xe3\xcf\xd3\nCeci n’est pas un PDF : l’en-tête est là, rien ne suit.\n%%EOF\n');

const ELEMENTS = (() => { const r = lireDessin(readFileSync(resolve(__dirname, '../../../fixtures/svg/elements.svg'), 'utf8')); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; })();

const FABRIQUES: ReadonlyArray<readonly [string, () => Uint8Array]> = [
  ['minimal.pdf', minimal], ['compresse.pdf', compresse], ['pages.pdf', pages], ['texte-image.pdf', texteImage], ['chiffre.pdf', chiffre], ['malforme.pdf', malforme],
  ['export-elements.pdf', () => ecrirePdf(ELEMENTS, { titre: 'Éléments' })],
  ['export-elements-a4-cmjn.pdf', () => ecrirePdf(ELEMENTS, { page: 'A4', marge: 10, fondPerdu: 3, reperes: true, cmjn: true })]
];

describe('les fixtures ecrites ici et par l export', () => {
  for (const [nom, fabriquer] of FABRIQUES) {
    it(nom + ' est a jour (ACTUALISER_REFERENCES=1 pour la reecrire)', () => {
      const attendu = Buffer.from(fabriquer());
      if (ACTUALISER) writeFileSync(resolve(DOSSIER, nom), attendu);
      // La compression de zlib peut changer d'octets d'une version a l'autre : seuls les fichiers sans flux compresse se comparent a l'octet.
      if (nom === 'compresse.pdf') expect(lu(fixture(nom)).dessin).toEqual(lu(attendu).dessin);
      else expect(fixture(nom).equals(attendu), nom).toBe(true);
    });
  }
});

describe('ce que la lecture tire de chaque fixture', () => {
  it('minimal.pdf : le dessin d exemple, quatre formes, rien de perdu', () => {
    const r = lu(fixture('minimal.pdf'));
    expect(r.dessin.vb).toEqual([0, 0, 240, 160]);
    expect(r.dessin.formes.map(f => [f.remplissage, f.contour])).toEqual([['#e9ecef', null], ['#c81e28', null], ['#1428a0', null], [null, '#15181d']]);
    expect(enTexte(r.dessin.formes[2]?.d ?? [])).toBe('M130,120 L170,40 L210,120 Z');
    expect(r.ignores).toEqual([]);
  });

  it('compresse.pdf : table en flux, flux d objets, formulaire dessine deux fois (la seconde a demi transparente), ICC', () => {
    const r = lu(fixture('compresse.pdf'));
    expect(r.dessin.formes.map(f => [f.remplissage, f.contour, f.opacite])).toEqual([
      ['#e9ecef', null, 1], ['#c81e28', null, 1], [null, '#1428a0', 1], ['#c81e28', null, 0.5], [null, '#1428a0', 0.5]
    ]);
    expect(r.dessin.formes[2]?.jonction).toBe('miter');
    expect(r.ignores).toEqual([]);
  });

  it('pages.pdf : trois pages, la premiere par defaut, la troisieme tournee', () => {
    const o = fixture('pages.pdf');
    expect([lu(o).pages, lu(o).page, lu(o).dessin.formes.length]).toEqual([3, 1, 1]);
    expect(lu(o, 2).dessin.vb).toEqual([0, 0, 300, 150]);
    expect(lu(o, 2).dessin.formes.map(f => f.remplissage)).toEqual(['#0000ff', '#0000ff']);
    expect(lu(o, 3).dessin.vb).toEqual([0, 0, 150, 200]);
  });

  it('texte-image.pdf : deux formes, deux textes et deux images dits', () => {
    const r = lu(fixture('texte-image.pdf'));
    expect(r.dessin.formes.length).toBe(2);
    expect(r.ignores).toEqual(['2 textes (convertissez le texte en contours dans votre logiciel avant d’exporter le PDF)', '2 images (une image se vectorise par « Convertir une image »)']);
  });

  it('chiffre.pdf et malforme.pdf : refuses en le nommant', () => {
    expect(refus(fixture('chiffre.pdf'))).toMatch(/^Ce PDF est chiffré/);
    expect(refus(fixture('malforme.pdf'))).toBe('Ce PDF ne se lit pas : aucun objet n’y a été trouvé (fichier tronqué ou endommagé).');
  });

  it('export-elements.pdf et sa version A4 CMJN avec reperes : les formes peintes d elements.svg, plus huit reperes', () => {
    const peintes = ELEMENTS.formes.filter(f => f.remplissage || (f.contour && f.epaisseur > 0)).length;
    expect(lu(fixture('export-elements.pdf')).dessin.formes.length).toBe(peintes);
    const a4 = lu(fixture('export-elements-a4-cmjn.pdf'));
    expect(a4.dessin.formes.length).toBe(peintes + 8);
    expect(a4.dessin.vb.map(Math.round)).toEqual([0, 0, 893, 646]);
  });
});

describe('les PDF d autres producteurs', () => {
  it('reportlab : formes, tirets, transparence, CMJN, un degrade dans sa decoupe, un texte ; deux pages', () => {
    const r = lu(fixture('reportlab.pdf'));
    expect(r.pages).toBe(2);
    expect(r.dessin.formes.map(f => [f.remplissage, f.contour, f.opacite])).toEqual([
      ['#cc1a26', null, 1], [null, '#0000ff', 1], ['#ff8000', null, 1], ['#009933', null, 0.5], ['#800080', null, 1], [null, '#0000ff', 1]
    ]);
    expect(r.dessin.formes[1]?.pointilles).toEqual([6, 3]);
    expect(r.ignores).toEqual([
      '1 texte (convertissez le texte en contours dans votre logiciel avant d’exporter le PDF)',
      'les dégradés et motifs de 1 forme, remplacés par une couleur unie',
      'les couleurs CMJN, converties en RVB sans profil (valeurs approchées)'
    ]);
    expect(lu(fixture('reportlab.pdf'), 2).dessin.formes.map(f => f.remplissage)).toEqual(['#3333cc']);
  });

  it('Cairo (le moteur PDF d Inkscape) : PDF 1.7 a flux d objets, les memes formes que reportlab', () => {
    const o = fixture('cairo.pdf');
    expect(o.toString('latin1')).toContain('/Type /ObjStm');
    const r = lu(o), modele = lu(fixture('reportlab.pdf'));
    expect(r.dessin.formes.length).toBe(modele.dessin.formes.length);
    r.dessin.formes.forEach((f, i) => {
      const m = modele.dessin.formes[i];
      expect(f.contour === null).toBe(m?.contour === null);
      expect(f.opacite).toBe(m?.opacite);
    });
    expect(r.ignores[0]).toMatch(/^1 texte/);
  });

  it('Skia (Chromium) : rectangle, tirets developpes en surfaces, transparence, rotation, courbe ; un texte ; une page vide', () => {
    const r = lu(fixture('skia.pdf'));
    expect(r.pages).toBe(2);
    expect(r.dessin.formes.map(f => f.remplissage ?? f.contour)).toEqual(['#c81e28', '#1428a0', '#33aa44', '#f0a020', '#15181d']);
    expect(r.dessin.formes[2]?.opacite).toBe(0.6);
    expect(r.ignores).toEqual(['1 texte (convertissez le texte en contours dans votre logiciel avant d’exporter le PDF)']);
    expect(lire(fixture('skia.pdf'), 2)).toEqual({ erreur: 'Cette page du PDF ne contient aucun tracé vectoriel à éditer.', pages: 2 });
  });
});

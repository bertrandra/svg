import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  adressesFichier, cheminAdmis, estIdCatalogue, familleDe, filtrerFamilles, idVariante, lireVariante, nomVariante, serveursDe, trouverVariante,
  validerCatalogue, variantePrincipale, versionVariante, type CataloguePolices, type FamilleCatalogue, type VarianteBrute
} from '../../../src/model/cataloguePolices.js';
import { fenetre, SEUIL_FENETRE } from '../../../src/util/fenetre.js';

// L'index des polices (ADR-0025) : l'identite d'une variante, ses adresses et leur ordre (jsDelivr, puis Bunny en repli), la
// validation qui refuse toute entree hors de la liste blanche ou mal epinglee, la recherche et le fenetrage de la longue liste.

const SHA = 'A'.repeat(43) + '=', SHA2 = 'B'.repeat(43) + '=';
const famille = (f: Partial<FamilleCatalogue> = {}): FamilleCatalogue => ({
  id: 'essai', nom: 'Essai', depot: 'fontsource', source: 'google', categorie: 'lineale', licence: 'OFL-1.1', version: '5.3.0', ecritures: ['latin', 'latin-ext'],
  variantes: [[400, 0, SHA, SHA2], [700, 1, SHA2, null]], ...f
});
const index = (familles: unknown[], anciennes: unknown[] = []): unknown => ({ format: 1, instantane: '2026-10-25', familles, anciennes });
const INDEX = JSON.parse(readFileSync(resolve(__dirname, '../../../data/catalogue-polices.json'), 'utf8')) as CataloguePolices;

describe('l identite d une variante', () => {
  it('est stable : c- et 14 chiffres, tire du depot, de la famille et du style, jamais des octets', () => {
    const f = famille();
    const id = idVariante(f, [400, 0, SHA, SHA2]);
    expect(id).toMatch(/^c-[0-9a-f]{14}$/);
    expect(estIdCatalogue(id)).toBe(true);
    // La meme variante d'une autre version garde son identifiant ; sa version, elle, change.
    expect(idVariante({ ...f, version: '5.4.0' }, [400, 0, SHA2, null])).toBe(id);
    expect(versionVariante([400, 0, SHA, SHA2])).not.toBe(versionVariante([400, 0, SHA2, null]));
    expect(idVariante(f, [400, 1, SHA, null])).not.toBe(id);
    expect(idVariante({ ...f, depot: 'fontshare' }, [400, 0, SHA, null, 'X'])).not.toBe(id);
    // Une valeur figee : changer la cle changerait l'identifiant de tous les textes deja ecrits.
    expect(idVariante({ depot: 'fontsource', id: 'roboto' }, [400, 0, SHA, null])).toBe('c-1b0c5ca30f8f68');
    expect(idVariante({ depot: 'fontsource', id: 'roboto' }, [700, 1, SHA, null])).toBe('c-0851166f6bdb0c');
    expect(estIdCatalogue('u-0123456789abcd')).toBe(false);
    expect(estIdCatalogue('inter')).toBe(false);
  });

  it('se nomme en francais, la reguliere sans rien, les autres par leur graisse, l italique dit', () => {
    const f = famille();
    expect(nomVariante(f, [400, 0, SHA, null])).toBe('Essai');
    expect(nomVariante(f, [700, 1, SHA, null])).toBe('Essai Grasse italique');
    expect(nomVariante(f, [350, 0, SHA, null])).toBe('Essai 350');
    expect(nomVariante({ nom: 'Flor' }, [400, 0, SHA, null, 'x.woff', 'Fractura'])).toBe('Flor Fractura');
  });

  it('prend pour principale la reguliere droite, a defaut la plus proche de 400', () => {
    expect(variantePrincipale(famille())?.poids).toBe(400);
    expect(variantePrincipale(famille({ variantes: [[700, 1, SHA, null], [300, 0, SHA, null], [600, 0, SHA, null]] }))?.poids).toBe(300);
  });
});

describe('les adresses d un fichier', () => {
  it('Fontsource : jsDelivr a la version epinglee d abord, puis Bunny Fonts, latin puis latin-ext', () => {
    const v = lireVariante(famille(), [400, 0, SHA, SHA2]);
    expect(v.fichiers.map(f => f.sousEnsemble)).toEqual(['latin', 'latin-ext']);
    expect(v.fichiers[0]?.adresses).toEqual([
      { serveur: 'jsdelivr', url: 'https://cdn.jsdelivr.net/npm/@fontsource/essai@5.3.0/files/essai-latin-400-normal.woff' },
      { serveur: 'bunny', url: 'https://fonts.bunny.net/essai/files/essai-latin-400-normal.woff' }
    ]);
    expect(v.fichiers[1]?.adresses[0]?.url).toBe('https://cdn.jsdelivr.net/npm/@fontsource/essai@5.3.0/files/essai-latin-ext-400-normal.woff');
    expect(lireVariante(famille(), [700, 1, SHA2, null]).fichiers.map(f => f.adresses[0]?.url)).toEqual(['https://cdn.jsdelivr.net/npm/@fontsource/essai@5.3.0/files/essai-latin-700-italic.woff']);
    expect(serveursDe([v])).toEqual(['jsdelivr', 'bunny']);
  });

  it('Velvetyne : l API GitLab au commit ; Fontshare : son adresse opaque', () => {
    const commit = '0123456789abcdef0123456789abcdef01234567';
    const vv = famille({ depot: 'velvetyne', source: 'velvetyne', version: commit, projet: '42', variantes: [[400, 0, SHA, null, 'fonts/web/Ma Fonte.woff']] });
    expect(adressesFichier(vv, [400, 0, SHA, null, 'fonts/web/Ma Fonte.woff'], 'complet')).toEqual([
      { serveur: 'gitlab', url: 'https://gitlab.com/api/v4/projects/42/repository/files/fonts%2Fweb%2FMa%20Fonte.woff/raw?ref=' + commit }
    ]);
    const chemin = 'A'.repeat(32) + '/' + 'B'.repeat(32) + '/' + 'C'.repeat(32) + '.woff';
    const fs = famille({ depot: 'fontshare', source: 'fontshare', licence: 'ITF-FFL', version: '1.0', variantes: [[400, 0, SHA, null, chemin]] });
    expect(lireVariante(fs, [400, 0, SHA, null, chemin]).fichiers).toEqual([{ sousEnsemble: 'complet', empreinte: SHA, adresses: [{ serveur: 'fontshare', url: 'https://cdn.fontshare.com/wf/' + chemin }] }]);
  });

  it('n admet un chemin que de la forme de son depot, jamais « .. »', () => {
    expect(cheminAdmis('velvetyne', 'fonts/web/A-Regular.woff')).toBe(true);
    for (const c of ['../secret.woff', 'fonts/../../x.ttf', 'fonts/a.woff2', 'a.exe', '/abs.woff', 'fonts/a?.woff']) expect(cheminAdmis('velvetyne', c), c).toBe(false);
    expect(cheminAdmis('fontsource', 'x.woff')).toBe(false);
  });
});

describe('validerCatalogue', () => {
  it('accepte un index bien forme', () => {
    expect('erreur' in (validerCatalogue(index([famille()])) as object)).toBe(false);
  });

  it('refuse une entree hors de la liste blanche, d une source inconnue, ou une licence que sa source ne declare pas', () => {
    for (const licence of ['MIT', 'Unlicense', 'GPL-3.0', 'CC-BY-4.0', 'Proprietaire']) {
      expect(validerCatalogue(index([famille({ licence: licence as never })])), licence).toEqual({ erreur: expect.stringMatching(/hors de la liste blanche/) as unknown });
    }
    expect(validerCatalogue(index([famille({ source: 'fontsquirrel' as never })]))).toEqual({ erreur: expect.stringMatching(/source absente du registre/) as unknown });
    expect(validerCatalogue(index([famille({ licence: 'ITF-FFL' })]))).toEqual({ erreur: expect.stringMatching(/non déclarée par la source google/) as unknown });
    expect(validerCatalogue(index([famille({ source: 'velvetyne' })]))).toEqual({ erreur: expect.stringMatching(/ne sert pas le dépôt/) as unknown });
  });

  it('refuse une version non epinglee, une empreinte fausse, un chemin dangereux, un doublon d identifiant', () => {
    const refus = (f: Partial<FamilleCatalogue>, motif: RegExp) => expect(validerCatalogue(index([famille(f)]))).toEqual({ erreur: expect.stringMatching(motif) as unknown });
    refus({ version: 'latest' }, /version non épinglée/);
    refus({ version: '^5.3.0' }, /version non épinglée/);
    refus({ variantes: [[400, 0, 'abc', null]] }, /empreinte sha256 invalide/);
    refus({ variantes: [[400, 0, SHA, 'zz']] }, /latin-ext invalide/);
    refus({ variantes: [[400, 0, SHA, null, 'a.woff']] as unknown as VarianteBrute[] }, /chemin de fichier invalide/);
    refus({ variantes: [[400, 0, SHA, null], [400, 0, SHA2, null]] }, /en double/);
    refus({ variantes: [[1200, 0, SHA, null]] }, /graisse invalide/);
    refus({ variantes: [] }, /variantes absentes/);
    refus({ nom: 'Mal<script>' }, /nom invalide/);
    refus({ id: 'Majuscules' }, /identifiant de famille invalide/);
    refus({ categorie: 'icones' as never }, /catégorie inconnue/);
    const vv = { depot: 'velvetyne' as const, source: 'velvetyne' as const, version: '0'.repeat(40), projet: '7' };
    refus({ ...vv, variantes: [[400, 0, SHA, null, '../../etc/passwd.woff']] }, /chemin de fichier invalide/);
    expect(validerCatalogue({ format: 2, instantane: '2026-10-25', familles: [], anciennes: [] })).toEqual({ erreur: 'format d’index inconnu' });
    expect(validerCatalogue(null)).toEqual({ erreur: 'l’index des polices n’est pas un objet' });
  });
});

describe('retrouver la variante d un texte', () => {
  it('par son identifiant, a sa version ; une version remplacee se retrouve dans les anciennes', () => {
    const ancienne = famille({ version: '5.2.0', variantes: [[400, 0, SHA2, null]] });
    const c = validerCatalogue(index([famille()], [ancienne])) as CataloguePolices;
    const courante = trouverVariante(c, idVariante(famille(), [400, 0, SHA, SHA2]));
    expect(courante?.famille.version).toBe('5.3.0');
    const hier = trouverVariante(c, courante?.id ?? '', versionVariante([400, 0, SHA2, null]));
    expect(hier?.famille.version).toBe('5.2.0');
    expect(hier?.fichiers[0]?.adresses[0]?.url).toContain('@fontsource/essai@5.2.0/');
    expect(trouverVariante(c, courante?.id ?? '', '00000000000000')).toBeNull();
    expect(trouverVariante(c, 'inter')).toBeNull();
    expect(familleDe(c, courante?.id ?? '')?.id).toBe('essai');
  });
});

describe('la recherche et la longue liste', () => {
  it('cherche sans accents ni casse, un nom qui commence par le mot d abord, et filtre par genre et par source', () => {
    const r = filtrerFamilles(INDEX.familles, { texte: 'ROBOTO' });
    expect(r[0]?.nom).toBe('Roboto');
    expect(r.every(f => f.nom.toLowerCase().includes('roboto'))).toBe(true);
    expect(filtrerFamilles(INDEX.familles, { texte: 'facade' }).some(f => f.nom === 'Facade' || f.nom.startsWith('Fa'))).toBe(true);
    const league = filtrerFamilles(INDEX.familles, { source: 'league' });
    expect(league.length).toBeGreaterThan(10);
    expect(league.every(f => f.source === 'league')).toBe(true);
    const manuscrites = filtrerFamilles(INDEX.familles, { categorie: 'manuscrite', source: 'fontshare' });
    expect(manuscrites.every(f => f.categorie === 'manuscrite' && f.source === 'fontshare')).toBe(true);
  });

  it('est assez longue pour se fenetrer (ADR-0008) : seule une poignee de lignes se dessine', () => {
    const total = INDEX.familles.length;
    expect(total).toBeGreaterThan(SEUIL_FENETRE);
    const f = fenetre(total, 29, 0, 260);
    expect(f.fin - f.debut).toBeLessThan(40);
    expect(f.hauteur).toBe(Math.floor(total * 29));
  });
});

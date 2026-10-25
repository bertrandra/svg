// L'ouverture d'un PDF par la page : la decompression du navigateur (DecompressionStream, que Node 22 a aussi), bornee, et la
// boucle qui relance la lecture pure jusqu'a ce qu'elle ait tous ses flux. Le SVG rendu passe ensuite par la voie d'un SVG.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { decompresserZlib, estPdf, fichierPdf, ouvrirPdf } from '../../../src/io/pdf.js';
import { lireDessin } from '../../../src/engine/editionSvg.js';
import { nettoyerSvg } from '../../../src/util/svg.js';

const fixture = (nom: string) => new Uint8Array(readFileSync(resolve(__dirname, '../../fixtures/pdf', nom)));

afterEach(() => { vi.unstubAllGlobals(); });

describe('la decompression du navigateur', () => {
  it('rend les octets d un flux zlib', async () => {
    const r = await decompresserZlib(deflateSync(Buffer.from('0 0 10 10 re f')), 1000);
    expect(Buffer.from(r as Uint8Array).toString()).toBe('0 0 10 10 re f');
  });

  it('s arrete des que la sortie depasse la borne (bombe)', async () => {
    const bombe = deflateSync(Buffer.alloc(50 * 1024 * 1024));
    expect(await decompresserZlib(bombe, 1024 * 1024)).toBe('trop');
  });

  it('rend ce qui a pu etre lu d un flux tronque, « illisible » s il n en sort rien', async () => {
    const entier = deflateSync(Buffer.from('1 0 0 rg '.repeat(2000)));
    const tronque = await decompresserZlib(entier.subarray(0, Math.floor(entier.length / 2)), 1e6);
    expect(tronque).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(tronque as Uint8Array).toString().startsWith('1 0 0 rg 1 0 0 rg')).toBe(true);
    expect(await decompresserZlib(Uint8Array.from([1, 2, 3, 4]), 1000)).toBe('illisible');
  });

  it('dit « indisponible » dans un navigateur sans DecompressionStream', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    expect(await decompresserZlib(deflateSync(Buffer.from('x')), 10)).toBe('indisponible');
    const r = await ouvrirPdf(fixture('compresse.pdf'));
    expect(r).toEqual({ erreur: 'Ce navigateur ne sait pas décompresser les flux de ce PDF (DecompressionStream manque) : ouvrez-le dans un navigateur récent.' });
    // Un PDF sans flux compresse s'ouvre quand meme.
    expect('svg' in (await ouvrirPdf(fixture('minimal.pdf')))).toBe(true);
  });
});

describe('l ouverture d un PDF', () => {
  it('reconnait un PDF par ses octets ou par son fichier', () => {
    expect(estPdf(fixture('minimal.pdf'))).toBe(true);
    expect(estPdf(new TextEncoder().encode('<svg/>'))).toBe(false);
    expect([fichierPdf({ name: 'a.PDF', type: '' }), fichierPdf({ name: 'a', type: 'application/pdf' }), fichierPdf({ name: 'a.svg', type: 'image/svg+xml' })]).toEqual([true, true, false]);
  });

  it('relance la lecture jusqu a avoir tous les flux (table en flux, flux d objets, page et formulaire)', async () => {
    const appels: number[] = [];
    const r = await ouvrirPdf(fixture('compresse.pdf'), 1, { decompresser: async (brut, max) => { appels.push(brut.length); return decompresserZlib(brut, max); } });
    expect('svg' in r && r.pages).toBe(1);
    // Quatre flux compresses : la table, le flux d'objets, le contenu de la page et celui du formulaire (le profil ICC n'est jamais lu).
    expect(appels.length).toBe(4);
  });

  it('rend un SVG que la voie d un SVG relit sans rien changer', async () => {
    const r = await ouvrirPdf(fixture('pages.pdf'), 2);
    if (!('svg' in r)) throw new Error(r.erreur);
    expect([r.pages, r.page, r.ignores]).toEqual([3, 2, []]);
    const propre = nettoyerSvg(r.svg);
    expect(propre?.svg).toBe(r.svg);
    const relu = lireDessin(r.svg);
    expect('erreur' in relu ? relu.erreur : relu.dessin.formes.length).toBe(2);
  });

  it('rend les refus nommes, avec le nombre de pages quand le document s est ouvert', async () => {
    expect(await ouvrirPdf(fixture('malforme.pdf'))).toEqual({ erreur: 'Ce PDF ne se lit pas : aucun objet n’y a été trouvé (fichier tronqué ou endommagé).' });
    expect(await ouvrirPdf(fixture('pages.pdf'), 9)).toEqual({ erreur: 'Ce PDF n’a pas de page 9 : il en compte 3.', pages: 3 });
    expect('erreur' in (await ouvrirPdf(fixture('chiffre.pdf')))).toBe(true);
  });

  it('refuse un fichier trop gros sans le lire', async () => {
    const r = await ouvrirPdf(new Uint8Array(100 * 1024 * 1024 + 1));
    expect(r).toEqual({ erreur: 'Ce PDF pèse plus de 100 Mo : il est trop gros pour être lu ici.' });
  });

  it('ne laisse jamais passer une exception, meme d une decompression qui leve', async () => {
    const r = await ouvrirPdf(fixture('compresse.pdf'), 1, { decompresser: () => Promise.reject(new Error('panne')) });
    expect('erreur' in r).toBe(true);
  });
});

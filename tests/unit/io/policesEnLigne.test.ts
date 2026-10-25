import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'opentype.js';
import {
  CLE_CONSENTEMENT, accorderConsentement, empreinteSha256, glyphesComposes, lireConsentement, retirerConsentement, serveursAAccepter, telechargerVariante,
  variantesEmployees, type CachePolices, type OutilsTelechargement
} from '../../../src/io/policesEnLigne.js';
import { enSfnt, genreFonte } from '../../../src/io/woff.js';
import { glyphesDe } from '../../../src/io/polices.js';
import { stockageMemoire } from '../../../src/io/stockage.js';
import { lireVariante, validerCatalogue, type CataloguePolices, type FamilleCatalogue } from '../../../src/model/cataloguePolices.js';
import type { IdServeur } from '../../../src/model/sourcesPolices.js';
import { composer } from '../../../src/engine/texte.js';
import { enWoff } from './woffFactice.js';

// Le telechargement d'une police du catalogue (ADR-0025) : aucune requete sans consentement, chaque fichier verifie par son
// empreinte sha256 avant d'etre lu, Bunny Fonts en repli quand jsDelivr echoue ou sert un autre fichier, le WOFF remis en sfnt.
// Pas de vrai reseau : un faux `fetch` qui compte ses appels.

const lire = (p: string): Uint8Array => new Uint8Array(readFileSync(resolve(__dirname, '../../../node_modules/@expo-google-fonts', p)));
const INTER = lire('inter/400Regular/Inter_400Regular.ttf');
const OSWALD = lire('oswald/500Medium/Oswald_500Medium.ttf');
const WOFF = enWoff(INTER), WOFF_EXT = enWoff(OSWALD);
const sha = (o: Uint8Array): string => createHash('sha256').update(o).digest('base64');

const FAMILLE: FamilleCatalogue = {
  id: 'essai', nom: 'Essai', depot: 'fontsource', source: 'google', categorie: 'lineale', licence: 'OFL-1.1', version: '5.3.0', ecritures: ['latin'],
  variantes: [[400, 0, sha(WOFF), null]]
};
const VARIANTE = lireVariante(FAMILLE, [400, 0, sha(WOFF), null]);
const TOUS: ReadonlySet<IdServeur> = new Set(['jsdelivr', 'bunny']);

/** Un faux reseau : une table adresse -> reponse (octets ou statut), et le journal des adresses demandees. */
function reseau(table: Record<string, Uint8Array | number>): { outils: Partial<OutilsTelechargement>; demandes: string[]; inits: RequestInit[] } {
  const demandes: string[] = [], inits: RequestInit[] = [];
  const chercher = (url: string, init: RequestInit): Promise<Response> => {
    demandes.push(url);
    inits.push(init);
    const r = table[url];
    if (r === undefined) return Promise.reject(new TypeError('réseau coupé'));
    return Promise.resolve(typeof r === 'number' ? new Response(null, { status: r }) : new Response(r as Uint8Array<ArrayBuffer>, { status: 200 }));
  };
  return { outils: { chercher }, demandes, inits };
}
const JSD = 'https://cdn.jsdelivr.net/npm/@fontsource/essai@5.3.0/files/essai-latin-400-normal.woff';
const BUNNY = 'https://fonts.bunny.net/essai/files/essai-latin-400-normal.woff';

describe('le consentement', () => {
  it('se lit vide sans stockage, sans valeur ou avec une valeur etrangere', () => {
    expect(lireConsentement(null).size).toBe(0);
    expect(lireConsentement(stockageMemoire()).size).toBe(0);
    for (const v of [true, 'oui', { serveurs: 'jsdelivr' }, { serveurs: ['evil.example', 42, null] }, [1, 2]]) {
      expect(lireConsentement(stockageMemoire({ [CLE_CONSENTEMENT]: v })).size, JSON.stringify(v)).toBe(0);
    }
  });

  it('se retient serveur par serveur, s ajoute, et se retire', () => {
    const s = stockageMemoire();
    const a = accorderConsentement(s, new Set(), ['jsdelivr', 'bunny']);
    expect([...a]).toEqual(['jsdelivr', 'bunny']);
    expect(s.lire(CLE_CONSENTEMENT)).toEqual({ serveurs: ['jsdelivr', 'bunny'] });
    expect([...accorderConsentement(s, a, ['fontshare'])].sort()).toEqual(['bunny', 'fontshare', 'jsdelivr']);
    expect([...lireConsentement(s)].sort()).toEqual(['bunny', 'fontshare', 'jsdelivr']);
    retirerConsentement(s);
    expect(lireConsentement(s).size).toBe(0);
    // Sans stockage, l'accord vaut pour la session : rien ne s'ecrit, l'ensemble rendu le porte.
    expect([...accorderConsentement(null, new Set(), ['gitlab'])]).toEqual(['gitlab']);
  });

  it('dit les serveurs qui restent a accepter pour une police', () => {
    expect(serveursAAccepter(VARIANTE, new Set())).toEqual(['jsdelivr', 'bunny']);
    expect(serveursAAccepter(VARIANTE, new Set(['jsdelivr']))).toEqual(['bunny']);
    expect(serveursAAccepter(VARIANTE, TOUS)).toEqual([]);
  });
});

describe('telechargerVariante', () => {
  it('ne fait aucune requete sans consentement', async () => {
    const r = reseau({ [JSD]: WOFF });
    expect(await telechargerVariante(VARIANTE, new Set(), r.outils)).toEqual({ erreur: expect.stringMatching(/pas autorisé/) as unknown });
    expect(await telechargerVariante(VARIANTE, new Set(['gitlab']), r.outils)).toEqual({ erreur: expect.stringMatching(/pas autorisé/) as unknown });
    expect(r.demandes).toEqual([]);
  });

  it('telecharge chez jsDelivr, sans cookie ni referent, verifie l empreinte et rend une police qui compose', async () => {
    const r = reseau({ [JSD]: WOFF });
    const p = await telechargerVariante(VARIANTE, TOUS, r.outils);
    if ('erreur' in p) throw new Error(p.erreur);
    expect(r.demandes).toEqual([JSD]);
    expect(r.inits[0]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors' });
    expect(p).toMatchObject({ id: VARIANTE.id, nom: 'Essai', nature: 'contour', version: VARIANTE.version });
    // Les memes contours que la fonte TTF lue directement : le WOFF remis en sfnt est la meme fonte.
    const direct = glyphesDe(parse(INTER.slice().buffer), INTER.slice().buffer);
    expect(composer('Fête', p.glyphes, { taille: 40 })).toEqual(composer('Fête', direct, { taille: 40 }));
  });

  it('se replie sur Bunny Fonts quand jsDelivr echoue, et refuse en le nommant un fichier a l empreinte fausse', async () => {
    const enPanne = reseau({ [JSD]: 503, [BUNNY]: WOFF });
    expect('erreur' in (await telechargerVariante(VARIANTE, TOUS, enPanne.outils))).toBe(false);
    expect(enPanne.demandes).toEqual([JSD, BUNNY]);

    // jsDelivr sert un autre fichier (une autre version, un fichier altere) : refuse, Bunny essaye ensuite.
    const altere = reseau({ [JSD]: WOFF_EXT, [BUNNY]: WOFF });
    expect('erreur' in (await telechargerVariante(VARIANTE, TOUS, altere.outils))).toBe(false);
    expect(altere.demandes).toEqual([JSD, BUNNY]);

    const faux = reseau({ [JSD]: WOFF_EXT, [BUNNY]: WOFF_EXT });
    const r = await telechargerVariante(VARIANTE, TOUS, faux.outils);
    expect(r).toEqual({ erreur: 'Essai : le fichier servi par cdn.jsdelivr.net n’a pas l’empreinte attendue : refusé ; le fichier servi par fonts.bunny.net n’a pas l’empreinte attendue : refusé.' });

    // Bunny seul accepte : jsDelivr n'est pas contacte.
    const bunnySeul = reseau({ [JSD]: WOFF, [BUNNY]: WOFF });
    expect('erreur' in (await telechargerVariante(VARIANTE, new Set(['bunny']), bunnySeul.outils))).toBe(false);
    expect(bunnySeul.demandes).toEqual([BUNNY]);
  });

  it('dit pourquoi : un serveur qui ne repond pas, un statut, un navigateur sans crypto.subtle', async () => {
    expect(await telechargerVariante(VARIANTE, TOUS, reseau({ [JSD]: 404 }).outils)).toEqual({ erreur: 'Essai : cdn.jsdelivr.net a répondu 404 ; fonts.bunny.net ne répond pas.' });
    const sansCrypto = { ...reseau({ [JSD]: WOFF }).outils, empreinte: () => Promise.resolve(null) };
    expect(await telechargerVariante(VARIANTE, TOUS, sansCrypto)).toEqual({ erreur: expect.stringMatching(/crypto\.subtle manque/) as unknown });
  });

  it('lit le cache d abord, le verifie, et y range un fichier verifie', async () => {
    const range = new Map<string, Uint8Array>();
    const cache: CachePolices = { lire: url => Promise.resolve(range.get(url) ?? null), ecrire: (url, o) => { range.set(url, o); return Promise.resolve(); } };
    const r1 = reseau({ [JSD]: WOFF });
    await telechargerVariante(VARIANTE, TOUS, { ...r1.outils, cache });
    expect([...range.keys()]).toEqual([JSD]);
    const r2 = reseau({});
    expect('erreur' in (await telechargerVariante(VARIANTE, TOUS, { ...r2.outils, cache }))).toBe(false);
    expect(r2.demandes).toEqual([]);
    // Un cache empoisonne n'est pas cru : l'empreinte ne correspond pas, le fichier se retelecharge.
    range.set(JSD, WOFF_EXT);
    const r3 = reseau({ [JSD]: WOFF });
    expect('erreur' in (await telechargerVariante(VARIANTE, TOUS, { ...r3.outils, cache }))).toBe(false);
    expect(r3.demandes).toEqual([JSD]);
  });

  it('compose le latin puis le latin etendu : une lettre absente de la premiere fonte vient de la seconde', async () => {
    const f: FamilleCatalogue = { ...FAMILLE, variantes: [[400, 0, sha(WOFF), sha(WOFF_EXT)]] };
    const v = lireVariante(f, [400, 0, sha(WOFF), sha(WOFF_EXT)]);
    const ext = 'https://cdn.jsdelivr.net/npm/@fontsource/essai@5.3.0/files/essai-latin-ext-400-normal.woff';
    const p = await telechargerVariante(v, TOUS, reseau({ [JSD]: WOFF, [ext]: WOFF_EXT }).outils);
    if ('erreur' in p) throw new Error(p.erreur);
    expect(p.version).toBe(v.version);
    expect(p.version).not.toBe(VARIANTE.version);
  });
});

describe('glyphesComposes', () => {
  const premier = { unitesParEm: 1000, contour: () => [{ type: 'M' as const, x: 1, y: 1 }], avance: () => 500, crenage: () => -10, possede: (c: string) => c !== 'ł' };
  const second = { unitesParEm: 2000, contour: () => [{ type: 'M' as const, x: 2, y: 2 }], avance: () => 800, crenage: () => -40, possede: () => true };
  const g = glyphesComposes(premier, second);
  it('prend chaque lettre de la premiere fonte qui la possede, a l em de la premiere', () => {
    expect(g.contour('a', 0, 0, 10)[0]?.x).toBe(1);
    expect(g.contour('ł', 0, 0, 10)[0]?.x).toBe(2);
    expect(g.avance('ł')).toBe(400);
    expect(g.crenage('a', 'b')).toBe(-10);
    expect(g.crenage('ł', 'ł')).toBe(-20);
    expect(g.crenage('a', 'ł')).toBe(0);
    expect(glyphesComposes(premier, null)).toBe(premier);
  });
});

describe('le WOFF remis en sfnt', () => {
  it('reconnait les genres de fichiers et rend les octets des tables d origine', async () => {
    expect(genreFonte(WOFF)).toBe('woff');
    expect(genreFonte(INTER)).toBe('sfnt');
    expect(genreFonte(new TextEncoder().encode('wOF2xxxxxxxxxxxx'))).toBe('woff2');
    const sfnt = await enSfnt(WOFF);
    if ('erreur' in sfnt) throw new Error(sfnt.erreur);
    const lu = parse(sfnt);
    expect(lu.unitsPerEm).toBe(parse(INTER.slice().buffer).unitsPerEm);
    expect(lu.charToGlyph('ê').index).toBe(parse(INTER.slice().buffer).charToGlyph('ê').index);
  });

  it('refuse un WOFF2, un fichier qui n est pas une fonte, un WOFF tronque ou menteur', async () => {
    expect(await enSfnt(new TextEncoder().encode('wOF2xxxxxxxxxxxx'))).toEqual({ erreur: expect.stringMatching(/WOFF2/) as unknown });
    expect(await enSfnt(new TextEncoder().encode('<html>pas une fonte</html>'))).toEqual({ erreur: expect.stringMatching(/pas une fonte/) as unknown });
    expect('erreur' in (await enSfnt(WOFF.slice(0, 200)))).toBe(true);
    const menteur = WOFF.slice();
    new DataView(menteur.buffer).setUint32(16, 0x7fffffff);
    expect(await enSfnt(menteur)).toEqual({ erreur: 'en-tête WOFF invalide' });
  });

  it('calcule l empreinte sha256 comme Node', async () => {
    expect(await empreinteSha256(WOFF)).toBe(sha(WOFF));
  });
});

describe('les polices employees, pour les credits', () => {
  it('rend chaque variante une fois, a sa version ou a la courante', () => {
    const c = validerCatalogue({ format: 1, instantane: '2026-10-25', familles: [FAMILLE], anciennes: [] }) as CataloguePolices;
    const l = variantesEmployees(c, [{ id: VARIANTE.id, version: VARIANTE.version }, { id: VARIANTE.id }, { id: 'inter' }]);
    expect(l.map(v => v.nom)).toEqual(['Essai']);
    expect(variantesEmployees(null, [{ id: VARIANTE.id }])).toEqual([]);
  });
});

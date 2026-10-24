import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { COMPOSANTS, mentionOrigines, origineDeBibliotheque } from '../../../src/model/credits.js';

// Les mentions des composants tiers (CC BY 3.0 des formes, SIL OFL des fontes, MIT des bibliotheques) : THIRD-PARTY-NOTICES.md est
// genere par scripts/mentions.mjs et ce test refait le calcul en memoire. Perime, il echoue. Le regenerer :
//
//   ACTUALISER_REFERENCES=1 npx vitest run tests/unit/depot/mentions.test.ts     (ou : npm run mentions)

const racine = resolve(__dirname, '../../..');
const CHEMIN = join(racine, 'THIRD-PARTY-NOTICES.md');
const ACTUALISER = process.env.ACTUALISER_REFERENCES === '1';
const COMMANDE = 'ACTUALISER_REFERENCES=1 npx vitest run tests/unit/depot/mentions.test.ts';

interface Script { composerMentions: () => Promise<string>; paquetsEmbarques: () => Promise<{ paquets: string[]; fichiers: string[] }> }
const charger = async () => (await import(pathToFileURL(join(racine, 'scripts/mentions.mjs')).href)) as Script;
const lireLf = (chemin: string) => readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n');

describe('les mentions des composants tiers', () => {
  it('THIRD-PARTY-NOTICES.md est celui que scripts/mentions.mjs ecrit aujourd hui', async () => {
    const { composerMentions } = await charger();
    const attendu = await composerMentions();
    if (ACTUALISER) { writeFileSync(CHEMIN, attendu); return; }
    expect(existsSync(CHEMIN), 'THIRD-PARTY-NOTICES.md absent (' + COMMANDE + ')').toBe(true);
    expect(lireLf(CHEMIN), 'THIRD-PARTY-NOTICES.md est perime : une dependance, une fonte ou la liste de src/model/credits.ts a change (' + COMMANDE + ')').toBe(attendu);
  }, 60_000);

  it('dit ce qu il faut : la mention des formes, chaque composant, et chaque texte de licence copie des paquets', async () => {
    const { composerMentions } = await charger();
    const t = await composerMentions();
    expect(t).toContain(mentionOrigines([origineDeBibliotheque('abacus')]));
    for (const c of COMPOSANTS) expect(t, c.paquet).toContain('`' + c.paquet + '`');
    // Un texte copie tel quel du paquet : la licence MIT de React, la SIL OFL, l'Unlicense de robust-predicates.
    expect(t).toContain('Copyright (c) Meta Platforms, Inc. and affiliates.');
    expect(t).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(t).toContain('This is free and unencumbered software released into the public domain.');
    expect(t).toContain('Copyright 2020 The Inter Project Authors');
    // Ce qui n'a pas de texte de licence le dit au lieu de l'inventer.
    expect(t).toContain('@visioncortex/vtracer : texte de licence absent');
    expect(t).toContain('tslib : texte de licence absent');
  }, 60_000);

  it('chaque titulaire de la liste figure dans la licence du paquet (ou, a defaut, dans ses metadonnees)', () => {
    const sansEspaces = (t: string) => t.toLowerCase().replace(/\s+/g, '');
    // Le credit des formes est celui que la licence demande (la source), pas un nom que le paquet porte : on verifie sa licence declaree.
    const info = JSON.parse(readFileSync(join(racine, 'node_modules/@iconify-json/game-icons/info.json'), 'utf8')) as { license: { spdx: string }; author: { url: string } };
    expect(info.license.spdx).toBe(COMPOSANTS.find(c => c.genre === 'forme')?.spdx);
    expect(info.author.url).toContain('game-icons');
    for (const c of COMPOSANTS.filter(x => x.installe !== false && x.genre !== 'forme')) {
      const dossier = join(racine, 'node_modules', c.paquet);
      const textes = readdirSync(dossier).filter(f => /^(licen[cs]e|readme)/i.test(f)).map(f => lireLf(join(dossier, f)));
      textes.push(readFileSync(join(dossier, 'package.json'), 'utf8'));
      const trouve = textes.some(t => sansEspaces(t).includes(sansEspaces(c.titulaire)));
      expect(trouve, c.paquet + ' : « ' + c.titulaire + ' » ne figure ni dans sa licence ni dans ses metadonnees').toBe(true);
    }
  });

  it('les composants recopies dans un autre paquet sont bien dans son fichier livre', async () => {
    const { paquetsEmbarques } = await charger();
    const e = await paquetsEmbarques();
    expect(e.paquets).toEqual(expect.arrayContaining(['react', 'react-dom', 'scheduler', 'opentype.js', 'polygon-clipping']));
    expect(e.paquets).not.toContain('@expo-google-fonts/inter');
    expect(e.fichiers.some(f => f.endsWith('polygon-clipping/dist/polygon-clipping.umd.js'))).toBe(true);
  }, 60_000);

  it('la licence du depot est celle que le proprietaire a choisie : proprietaire, tous droits reserves', () => {
    const paquet = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8')) as Record<string, unknown>;
    // Jamais une licence ouverte posee par defaut : changer ceci est une decision du proprietaire.
    expect(paquet['license']).toBe('UNLICENSED');
    expect(readFileSync(join(racine, 'LICENSE'), 'utf8')).toContain('Tous droits réservés');
  });
});

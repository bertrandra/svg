import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adresseDeposee, fichierImage, PHRASE_HTML, PHRASE_INCONNUE, reconnaitre, texteDuSvg } from '../../../src/zones/OuvrirAdresse.js';
import { PHRASE_IMAGE_EDITEUR, svgAInserer } from '../../../src/zones/InsererAdresse.js';

// Ouvrir depuis une adresse dans l'interface (ADR-0036) : ce que la page fait des octets recus (la voie de leur nature, ou un refus
// nomme), un lien glisse, le nom et le type d'une image remise au convertisseur, et ce que l'editeur insere.

const octets = (t: string): Uint8Array => new TextEncoder().encode(t);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5" fill="#c81e28"/></svg>';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const donnees = (d: Record<string, string>) => ({ getData: (t: string) => d[t] ?? '' });

describe('la reconnaissance des octets recus', () => {
  it('rend la nature lue sur les octets, jamais sur le nom', () => {
    expect(reconnaitre('logo', octets(SVG))).toMatchObject({ nom: 'logo', nature: 'svg' });
    expect(reconnaitre('photo', PNG)).toMatchObject({ nature: 'png' });
    expect(reconnaitre('x', new Uint8Array(readFileSync(resolve(__dirname, '../../fixtures/pdf/minimal.pdf'))))).toMatchObject({ nature: 'pdf' });
  });

  it('refuse une page web, un fichier vide, un type inconnu, en le nommant', () => {
    expect(reconnaitre('x', octets('<!DOCTYPE html><html></html>'))).toEqual({ erreur: PHRASE_HTML });
    expect(reconnaitre('x', new Uint8Array(0))).toEqual({ erreur: 'Le serveur a renvoyé un fichier vide.' });
    expect(reconnaitre('x', octets('Not Found'))).toEqual({ erreur: PHRASE_INCONNUE });
  });

  it('decode un SVG comme un fichier depose : UTF-8, marque d ordre des octets retiree', () => {
    expect(texteDuSvg(octets('﻿' + SVG))).toBe(SVG);
    expect(texteDuSvg(octets('<svg><title>Noël</title></svg>'))).toBe('<svg><title>Noël</title></svg>');
  });

  it('une image recue devient un fichier du bon type, nomme d apres l adresse', () => {
    const f = fichierImage({ nom: 'photo', nature: 'jpeg', octets: PNG });
    expect([f.name, f.type, f.size]).toEqual(['photo.jpg', 'image/jpeg', PNG.length]);
    expect(fichierImage({ nom: 'logo', nature: 'bmp', octets: PNG }).type).toBe('image/bmp');
  });
});

describe('un lien glisse', () => {
  it('se lit dans text/uri-list (commentaires ignores), sinon dans un texte qui n est qu une adresse', () => {
    expect(adresseDeposee(donnees({ 'text/uri-list': '# depuis une page\r\nhttps://exemple.fr/logo.svg\r\n' }))).toBe('https://exemple.fr/logo.svg');
    expect(adresseDeposee(donnees({ 'text/plain': ' https://exemple.fr/a.png ' }))).toBe('https://exemple.fr/a.png');
    expect(adresseDeposee(donnees({ 'text/plain': SVG }))).toBeNull();
    expect(adresseDeposee(donnees({ 'text/uri-list': 'javascript:alert(1)', 'text/plain': 'javascript:alert(1)' }))).toBeNull();
    expect(adresseDeposee(donnees({}))).toBeNull();
  });
});

describe('inserer depuis une adresse dans l editeur', () => {
  it('un SVG passe par le nettoyage et la lecture ; un script n y survit pas', async () => {
    const r = await svgAInserer({ nom: 'x', nature: 'svg', octets: octets('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="x()"><script>x()</script><rect width="5" height="5"/></svg>') });
    expect('svg' in r && r.svg).toBeTruthy();
    expect('svg' in r ? r.svg : '').not.toMatch(/script|onload/);
  });

  it('un PDF donne sa premiere page ; une image et un SVG illisible sont refuses en le nommant', async () => {
    expect(await svgAInserer({ nom: 'x', nature: 'pdf', octets: new Uint8Array(readFileSync(resolve(__dirname, '../../fixtures/pdf/minimal.pdf'))) })).toHaveProperty('svg');
    expect(await svgAInserer({ nom: 'x', nature: 'png', octets: PNG })).toEqual({ erreur: PHRASE_IMAGE_EDITEUR });
    const illisible = await svgAInserer({ nom: 'x', nature: 'svg', octets: octets('<svg xmlns="http://www.w3.org/2000/svg"><use href="https://espion.exemple/a.svg#b"/></svg>') });
    expect(illisible).toHaveProperty('erreur');
  });
});

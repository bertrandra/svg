import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { estImage, natureDesOctets, TYPES_IMAGE } from '../../../src/engine/natureOctets.js';

// La nature d'un fichier recu par une adresse (ADR-0036) se decide sur ses octets : jamais sur l'extension, ni sur le type annonce.

const octets = (t: string): Uint8Array => new TextEncoder().encode(t);
const avec = (tete: number[], reste = 64): Uint8Array => { const o = new Uint8Array(tete.length + reste); o.set(tete); return o; };
const FIXTURES = resolve(__dirname, '../../fixtures');

describe('la nature des octets', () => {
  it('reconnait les signatures d images', () => {
    expect(natureDesOctets(avec([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(natureDesOctets(avec([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(natureDesOctets(octets('GIF87a……'))).toBe('gif');
    expect(natureDesOctets(octets('GIF89a<svg onload=x>'))).toBe('gif');
    expect(natureDesOctets(octets('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('webp');
    expect(natureDesOctets(octets('RIFF\u0000\u0000\u0000\u0000WAVEfmt '))).toBe('inconnue');
  });

  it('ne prend « BM » pour une image BMP qu avec un en-tete DIB connu', () => {
    const bmp = avec([0x42, 0x4d], 60);
    bmp[14] = 40;
    expect(natureDesOctets(bmp)).toBe('bmp');
    expect(natureDesOctets(octets('BM, c’est un texte, pas une image : rien de plus.'))).toBe('inconnue');
  });

  it('reconnait un PDF, en tete ou apres quelques octets', () => {
    expect(natureDesOctets(new Uint8Array(readFileSync(resolve(FIXTURES, 'pdf/minimal.pdf'))))).toBe('pdf');
    expect(natureDesOctets(octets('\u0000\u0000junk%PDF-1.7\n'))).toBe('pdf');
    expect(natureDesOctets(octets('x'.repeat(2000) + '%PDF-1.7'))).toBe('inconnue');
  });

  it('reconnait un SVG : racine <svg> (prefixee ou non), declaration XML, DOCTYPE, commentaires, marque d ordre des octets', () => {
    expect(natureDesOctets(octets('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('svg');
    expect(natureDesOctets(octets('﻿<?xml version="1.0"?>\n<!-- Illustrator -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n<svg>'))).toBe('svg');
    expect(natureDesOctets(octets('  \n\t<svg:svg xmlns:svg="http://www.w3.org/2000/svg">'))).toBe('svg');
    expect(natureDesOctets(octets('<svg>'))).toBe('svg');
    expect(natureDesOctets(octets('<SVG>'))).toBe('inconnue');
    expect(natureDesOctets(octets('<svgx>'))).toBe('inconnue');
  });

  it('reconnait une page HTML, meme avec des icones SVG dedans', () => {
    expect(natureDesOctets(octets('<!doctype html><html><body><svg viewBox="0 0 1 1"></svg></body></html>'))).toBe('html');
    expect(natureDesOctets(octets('<html lang="fr"><svg/></html>'))).toBe('html');
    expect(natureDesOctets(octets('\n<HEAD><TITLE>404</TITLE></HEAD>'))).toBe('html');
    // Un SVG qui decrit du HTML dans un commentaire reste un SVG : la racine vient d'abord.
    expect(natureDesOctets(octets('<svg xmlns="http://www.w3.org/2000/svg"><!-- <html> --></svg>'))).toBe('svg');
  });

  it('un fichier vide, un texte, du JSON ou des octets quelconques ne sont pas reconnus', () => {
    expect(natureDesOctets(new Uint8Array(0))).toBe('vide');
    expect(natureDesOctets(octets('Not Found'))).toBe('inconnue');
    expect(natureDesOctets(octets('{"erreur":"introuvable"}'))).toBe('inconnue');
    expect(natureDesOctets(new Uint8Array([0, 1, 2, 3, 250, 251]))).toBe('inconnue');
    expect(natureDesOctets(octets('<?xml version="1.0"?><rss/>'))).toBe('inconnue');
  });

  it('ne lit que le debut : une racine au-dela de 256 Ko n est pas cherchee, et un tres gros fichier se decide vite', () => {
    expect(natureDesOctets(octets('<!--' + ' '.repeat(300 * 1024) + '--><svg>'))).toBe('inconnue');
    const gros = new Uint8Array(64 * 1024 * 1024).fill(0x20);
    gros[0] = 0x3c;
    const debut = performance.now();
    expect(natureDesOctets(gros)).toBe('inconnue');
    expect(performance.now() - debut).toBeLessThan(1000);
  });

  it('donne un type MIME a chaque image, et rien d autre n est une image', () => {
    expect(Object.keys(TYPES_IMAGE).sort()).toEqual(['bmp', 'gif', 'jpeg', 'png', 'webp']);
    expect(estImage('png')).toBe(true);
    expect(estImage('svg')).toBe(false);
    expect(estImage('pdf')).toBe(false);
  });
});

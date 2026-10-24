import { describe, it, expect } from 'vitest';
import { sonderNavigateur, type HoteSondable } from '../../../src/io/capacites.js';

/** Un navigateur complet, fait de rien : de quoi retirer une API a la fois. */
const complet = (): HoteSondable => ({
  PointerEvent: function PointerEvent() { return undefined; },
  Blob: function Blob() { return undefined; },
  URL: { createObjectURL: () => 'blob:x' },
  WebAssembly: { instantiate: () => Promise.resolve({}) },
  document: { createElement: () => ({ getContext: () => ({}) }) }
});

describe('sonderNavigateur', () => {
  it('voit tout dans un navigateur complet', () => {
    expect(sonderNavigateur(complet())).toEqual({ objectHasOwn: true, pointeurs: true, blob: true, canvas: true, webassembly: true });
  });

  it('ne voit que Object.hasOwn dans un hote vide (le moteur JavaScript le porte)', () => {
    expect(sonderNavigateur({})).toEqual({ objectHasOwn: true, pointeurs: false, blob: false, canvas: false, webassembly: false });
  });

  it('retire une API a la fois', () => {
    expect(sonderNavigateur({ ...complet(), PointerEvent: undefined }).pointeurs).toBe(false);
    expect(sonderNavigateur({ ...complet(), URL: {} }).blob).toBe(false);
    expect(sonderNavigateur({ ...complet(), Blob: undefined }).blob).toBe(false);
    expect(sonderNavigateur({ ...complet(), WebAssembly: {} }).webassembly).toBe(false);
  });

  it('tient pour absent un canvas qui se refuse ou qui leve', () => {
    expect(sonderNavigateur({ ...complet(), document: { createElement: () => ({ getContext: () => null }) } }).canvas).toBe(false);
    expect(sonderNavigateur({ ...complet(), document: { createElement: () => ({}) } }).canvas).toBe(false);
    expect(sonderNavigateur({ ...complet(), document: { createElement: () => { throw new Error('bloque'); } } }).canvas).toBe(false);
  });

  it('voit un Object.hasOwn retire', () => {
    const avant = Object.getOwnPropertyDescriptor(Object, 'hasOwn');
    Object.defineProperty(Object, 'hasOwn', { value: undefined, configurable: true, writable: true });
    try {
      expect(sonderNavigateur(complet()).objectHasOwn).toBe(false);
    } finally {
      if (avant) Object.defineProperty(Object, 'hasOwn', avant);
    }
  });
});

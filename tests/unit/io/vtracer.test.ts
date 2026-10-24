import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Traceur } from '../../../src/engine/vectorisation.js';

// io/vtracerWasm.ts importe un .wasm que seul le bundler sait lire : il n'est jamais charge sous
// Node (son motif de colle est garde par vectorisation.test.ts). Ici on ne teste que le chargement
// a la demande, memorise, remis a zero sur echec (ADR-0002), contre un module factice.
const traceurWasm = vi.hoisted(() => vi.fn());
vi.mock('../../../src/io/vtracerWasm.js', () => ({ traceurWasm }));

const traceurA: Traceur = () => '<svg/>';

beforeEach(() => {
  traceurWasm.mockReset();
  // Le module memorise sa promesse : chaque test repart d'un module neuf.
  vi.resetModules();
});

const charger = async () => (await import('../../../src/io/vtracer.js')).chargerTraceur;

describe('chargerTraceur', () => {
  it('ne charge rien tant que personne ne vectorise', async () => {
    await charger();
    expect(traceurWasm).not.toHaveBeenCalled();
  });

  it('charge le WASM une seule fois, quel que soit le nombre d appels', async () => {
    traceurWasm.mockResolvedValue(traceurA);
    const chargerTraceur = await charger();
    const [a, b] = await Promise.all([chargerTraceur(), chargerTraceur()]);
    expect(a).toBe(traceurA);
    expect(b).toBe(traceurA);
    expect(await chargerTraceur()).toBe(traceurA);
    expect(traceurWasm).toHaveBeenCalledTimes(1);
  });

  it('rejette avec l erreur du chargement, puis recharge a l appel suivant', async () => {
    traceurWasm.mockRejectedValueOnce(new Error('wasm refuse')).mockResolvedValueOnce(traceurA);
    const chargerTraceur = await charger();
    await expect(chargerTraceur()).rejects.toThrow('wasm refuse');
    expect(await chargerTraceur()).toBe(traceurA);
    expect(traceurWasm).toHaveBeenCalledTimes(2);
  });

  it('enveloppe en Error un echec qui n en est pas une', async () => {
    traceurWasm.mockRejectedValueOnce('texte brut');
    const chargerTraceur = await charger();
    await expect(chargerTraceur()).rejects.toThrow('texte brut');
  });
});

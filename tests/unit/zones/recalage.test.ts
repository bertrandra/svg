// Le recalage automatique et la feuille dans la page (ADR-0039) : le plan qui suit le tapis fixe, les phrases dites, les etapes de
// la carte « Dans Design Space » sans recalage, et le document enregistre. Depuis la revision du 26 octobre 2026, le tapis fixe est
// le defaut : la case cochee (`recalage: true`) est l'ancien comportement.

import { describe, expect, it } from 'vitest';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { resoudreProfil } from '../../../src/engine/preparation.js';
import { CHOIX_CRICUT_DEFAUT, type ChoixMachine, type ChoixProduction } from '../../../src/model/contextes.js';
import { cadreDeVue, phraseFeuille, phraseRecalage, planPourChoix, svgDocument } from '../../../src/zones/actionsProduction.js';
import { etapesDesignSpace } from '../../../src/zones/parcoursCricut.js';

const lire = (corps: string, vb = '0 0 480 288'): DessinSvg => {
  const r = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + corps + '</svg>');
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const choix = (c: Partial<ChoixMachine> = {}): ChoixProduction => ({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, ...c });
const D = lire('<rect x="100" y="50" width="200" height="100" fill="#c81e28"/>');

describe('le plan de travail et le tapis fixe', () => {
  it('se pose sur le tapis tel que la toile le montrait quand on decoche le recalage : rien ne bouge a l ecran', () => {
    const d = planPourChoix(D, choix({ recalage: true }), choix());
    // La zone utile etait calee sur le coin du dessin (100, 50), le tapis d'un quart de pouce autour.
    expect(d?.vb).toEqual([76, 26, 1152, 1152]);
    expect(d?.formes).toBe(D.formes);
  });

  it('prend la taille d un autre tapis au meme coin, et ne change rien avec le recalage, en Print Then Cut ou deja pose', () => {
    const pose = planPourChoix(D, choix({ recalage: true }), choix()) ?? D;
    expect(planPourChoix(pose, choix(), choix({ tapis: '12x24' }))?.vb).toEqual([76, 26, 1152, 2304]);
    expect(planPourChoix(pose, choix(), choix())).toBeNull();
    expect(planPourChoix(D, choix({ recalage: true }), choix({ recalage: true, tapis: '12x24' }))).toBeNull();
    expect(planPourChoix(D, choix({ recalage: true }), choix({ procede: 'imprimer-decouper' }))).toBeNull();
    expect(planPourChoix(D, { contexte: 'generique' }, { contexte: 'generique' })).toBeNull();
    // Cocher la case ne touche pas au plan : le tapis suit le dessin, le plan reste.
    expect(planPourChoix(pose, choix(), choix({ recalage: true }))).toBeNull();
  });

  it('se pose quand on choisit Cricut depuis Generique : un geste, une entree d historique', () => {
    expect(planPourChoix(D, { contexte: 'generique' }, choix())?.vb).toEqual([68.441, 18.441, 1152, 1152]);
  });

  it('fait cadrer « Ajuster » sur le tapis fixe', () => {
    const pose = planPourChoix(D, choix({ recalage: true }), choix()) ?? D;
    expect(cadreDeVue(pose, choix())).toEqual({ x: 76, y: 26, l: 1152, h: 1152 });
  });
});

describe('ce que la page dit et ecrit', () => {
  it('dit le recalage et la feuille', () => {
    expect(phraseRecalage(false)).toMatch(/^Recalage automatique désactivé : le plan de travail est le tapis/);
    expect(phraseRecalage(true)).toMatch(/^Recalage automatique activé/);
    expect(phraseRecalage(false, true)).toMatch(/ Ctrl\+Z rend l’ancien plan\.$/);
    expect(phraseRecalage(false)).not.toContain('Ctrl+Z');
    const p = resoudreProfil(choix({ unite: 'mm', feuille: { x: 96, y: 192, l: 480, h: 384 } }));
    expect(p && phraseFeuille(p)).toBe('Feuille de 127 × 101,6 mm, à 25,4 mm du bord gauche et 50,8 mm du bord haut du tapis.');
    const entier = resoudreProfil(choix());
    expect(entier && phraseFeuille(entier)).toBe('Feuille : le tapis entier.');
  });

  it('enregistre le recalage coche et la feuille sur la racine, rien de plus par defaut', () => {
    expect(svgDocument(D, choix())).not.toMatch(/data-ed-recalage|data-ed-feuille/);
    expect(svgDocument(D, choix({ recalage: true, feuille: { x: 96, y: 192, l: 480, h: 384 } }))).toContain(' data-ed-unite="mm" data-ed-recalage="oui" data-ed-feuille="9600-19200-48000-38400">');
    expect(svgDocument(D, { contexte: 'generique' })).not.toContain('data-ed-');
  });

  it('dit, sans recalage, d attacher chaque cadre, de le passer en Guide et ou verifier la place, chaque etape a verifier', () => {
    const p = resoudreProfil(choix({ unite: 'mm' }));
    if (!p) throw new Error('profil');
    const etapes = etapesDesignSpace(p, 'essai', { l: 192, h: 96 }, false, { x: 96, y: 48 });
    expect(etapes.map(e => e.texte)).toEqual([
      'Dans Design Space, « Nouveau projet », puis « Importer ».',
      'Choisissez le fichier essai-cricut.svg, importez-le, puis ajoutez-le au projet.',
      'Vérifiez sa taille : 292,1 × 292,1 mm, cadre compris. Ne la changez pas.',
      'Pour chaque couleur, sélectionnez le cadre de repérage de cette couleur et les formes de la même couleur, puis « Attacher ».',
      'Passez chaque cadre en « Guide » (menu Opération) : il ne se découpe pas.',
      'Sur l’aperçu du tapis, vérifiez la place : le dessin commence à 25,4 mm du bord gauche et 12,7 mm du bord haut du tapis ; sinon, faites-y glisser le dessin, puis posez la feuille à cet endroit.',
      'Pour chaque couche, choisissez couper, dessiner ou rainer : le fichier ne le dit pas.'
    ]);
    expect(etapes.slice(2, 6).every(e => e.aVerifier)).toBe(true);
    // Avec le recalage coche, les etapes d'avant.
    const avant = resoudreProfil(choix({ unite: 'mm', recalage: true }));
    if (!avant) throw new Error('profil');
    expect(etapesDesignSpace(avant, 'essai', { l: 192, h: 96 }).length).toBe(4);
  });
});

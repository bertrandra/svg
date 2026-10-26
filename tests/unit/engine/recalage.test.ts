// Le recalage automatique et la feuille sur le tapis (ADR-0039) : le choix, sa marque dans le document (seulement hors du defaut,
// jamais dans un export), le tapis fixe au coin du plan, le plan pose sur le tapis, le constat d'une forme hors de la feuille et sa
// correction, et le projet JSON qui les garde. Depuis la revision du 26 octobre 2026, le tapis fixe est le defaut : seul le recalage
// coche se garde (`recalage: true`, « oui » dans le document) ; l'ancienne valeur « decochee » se lit comme le defaut.

import { describe, expect, it } from 'vitest';
import { ecrireDessin, lireDessin, lireProduction, marquerProduction, type DessinSvg } from '../../../src/engine/editionSvg.js';
import {
  cadreTapis, choixDeMarque, constatsPreparation, corrigerPreparation, feuilleSur, gabaritDuTapis, lireFeuille, marqueDeChoix, marqueDeProfil, normaliserChoix,
  planDOuverture, planDuTapis, planPourChoix, regionDeCoupe, resoudreProfil, texteFeuille, type ProfilProduction
} from '../../../src/engine/preparation.js';
import { CHOIX_CRICUT_DEFAUT, type ChoixMachine, type ChoixProduction } from '../../../src/model/contextes.js';
import { lireProjet } from '../../../src/model/projet.js';
import { projetDe } from '../../../src/engine/projet.js';

const lire = (corps: string, vb = '0 0 1152 1152'): DessinSvg => {
  const r = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + corps + '</svg>');
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const choix = (c: Partial<ChoixMachine> = {}): ChoixProduction => ({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, unite: 'in', ...c });
const profil = (c: Partial<ChoixMachine> = {}): ProfilProduction => { const p = resoudreProfil(choix(c)); if (!p) throw new Error('profil'); return p; };

describe('le choix du recalage et de la feuille', () => {
  it('ne garde que recalage: true, et ramene la feuille sur le tapis au centieme', () => {
    const c = choix({ recalage: true });
    expect(normaliserChoix(c)).toBe(c);
    // L'ancienne valeur « decochee » (le tapis fixe quand il n'etait pas le defaut) se lit comme le defaut, et ne se garde pas.
    expect(normaliserChoix({ ...choix(), recalage: false } as unknown as ChoixProduction)).toEqual(choix());
    expect(normaliserChoix(choix({ feuille: { x: -5, y: 100.123456, l: 5000, h: 300 } }))).toEqual(choix({ feuille: { x: 0, y: 100.12, l: 1152, h: 300 } }));
    // Le tapis entier ne s'ecrit pas ; une feuille trop petite prend le cote minimal (un demi-pouce).
    expect(normaliserChoix(choix({ feuille: { x: 0, y: 0, l: 1152, h: 1152 } }))).toEqual(choix());
    expect(feuilleSur({ x: 10, y: 10, l: 1, h: 1 }, 1152, 1152)).toEqual({ x: 10, y: 10, l: 48, h: 48 });
    // Un tapis plus petit ramene la feuille dessus.
    expect(normaliserChoix(choix({ machine: 'joy', tapis: 'joy-4x6', feuille: { x: 300, y: 0, l: 200, h: 200 } }))).toMatchObject({ feuille: { x: 232, y: 0, l: 200, h: 200 } });
  });

  it('a un profil qui le dit : recalage faux (le tapis fixe) et feuille du tapis entier par defaut', () => {
    expect(profil().recalage).toBe(false);
    expect(profil().feuille).toEqual({ x: 0, y: 0, l: 1152, h: 1152 });
    expect(profil({ recalage: true }).recalage).toBe(true);
  });
});

describe('la marque du document', () => {
  const d = lire('<rect x="400" y="500" width="100" height="80" fill="#c81e28"/>');
  const document = (c: ChoixProduction) => marquerProduction(ecrireDessin(d, 3), marqueDeChoix(c));

  it('n ecrit rien de plus avec le tapis fixe du defaut et le tapis entier : les octets d une marque d avant', () => {
    expect(marqueDeChoix(choix())).toEqual({ contexte: 'cricut', machine: 'maker', tapis: '12x12', materiau: 'papier-cartonne', procede: 'decoupe', unite: 'in' });
    expect(document(choix())).not.toContain('data-ed-recalage');
    expect(document(choix())).not.toContain('data-ed-feuille');
  });

  it('ecrit le recalage coche et la feuille en dernier sur la racine, et les relit', () => {
    const c = choix({ recalage: true, feuille: { x: 96, y: 48.5, l: 480, h: 384 } });
    const s = document(c);
    expect(s).toMatch(/ data-ed-unite="in" data-ed-recalage="oui" data-ed-feuille="9600-4850-48000-38400">/);
    const lu = lireDessin(s);
    if ('erreur' in lu) throw new Error(lu.erreur);
    expect(choixDeMarque(lu.production).choix).toEqual(c);
    // Relu puis reecrit, le document ne bouge plus.
    expect(marquerProduction(ecrireDessin(lu.dessin, 3), marqueDeChoix(choixDeMarque(lu.production).choix))).toBe(s);
  });

  it('ne lit que les valeurs exactes : un autre recalage ou une feuille mal formee se lisent comme absents', () => {
    expect(choixDeMarque(lireProduction({ 'data-ed-contexte': 'cricut', 'data-ed-recalage': 'vrai' })).choix).not.toHaveProperty('recalage');
    expect(choixDeMarque(lireProduction({ 'data-ed-contexte': 'cricut', 'data-ed-recalage': 'oui' })).choix).toHaveProperty('recalage', true);
    expect(lireFeuille('1-2-3')).toBeNull();
    expect(lireFeuille('0-0-0-100')).toBeNull();
    expect(lireFeuille(texteFeuille({ x: 1.5, y: 2, l: 300, h: 200.25 }))).toEqual({ x: 1.5, y: 2, l: 300, h: 200.25 });
  });

  it('lit un document d avant la revision, marque « non », comme le defaut, et ne reecrit plus l attribut', () => {
    const s = document(choix()).replace(' data-ed-unite="in">', ' data-ed-unite="in" data-ed-recalage="non">');
    expect(s).toContain('data-ed-recalage="non"');
    const lu = lireDessin(s);
    if ('erreur' in lu) throw new Error(lu.erreur);
    const relu = choixDeMarque(lu.production).choix;
    expect(relu).toEqual(choix());
    expect(marquerProduction(ecrireDessin(lu.dessin, 3), marqueDeChoix(relu))).toBe(document(choix()));
  });

  it('ne porte jamais le recalage ni la feuille dans un export', () => {
    for (const p of [profil({ feuille: { x: 96, y: 48, l: 480, h: 384 } }), profil({ recalage: true, feuille: { x: 96, y: 48, l: 480, h: 384 } })]) {
      expect(marqueDeProfil(p)).not.toHaveProperty('recalage');
      expect(marqueDeProfil(p)).not.toHaveProperty('feuille');
    }
  });
});

describe('le tapis fixe', () => {
  it('suit le dessin avec le recalage, au nombre pres du calcul d avant ; reste au coin du plan sans', () => {
    const d = lire('<rect x="400.3" y="500.7" width="100" height="80" fill="#c81e28"/>', '-10 -20 2000 2000');
    const e = { x: 400.3, y: 500.7 };
    const avec = gabaritDuTapis(profil({ recalage: true }), d, e);
    expect(avec.tapis).toEqual(cadreTapis(profil(), e));
    expect(avec.zone).toEqual({ x: 400.3, y: 500.7, l: 1104, h: 1104 });
    const sans = gabaritDuTapis(profil(), d, e);
    expect(sans.tapis).toEqual({ x: -10, y: -20, l: 1152, h: 1152 });
    expect(sans.zone).toEqual({ x: 14, y: 4, l: 1104, h: 1104 });
  });

  it('pose le plan sur le tapis au millieme, et rend le meme objet quand il l est deja', () => {
    const d = lire('<rect x="0" y="0" width="10" height="10" fill="#c81e28"/>', '0 0 480 288');
    const pose = planDuTapis(d, { x: -23.99999, y: 0.00049, l: 1152, h: 1152 });
    expect(pose.vb).toEqual([-24, 0, 1152, 1152]);
    expect(pose.formes).toBe(d.formes);
    expect(planDuTapis(pose, { x: -24, y: 0, l: 1152, h: 1152 })).toBe(pose);
  });

  it('coupe la ou la feuille croise la zone utile', () => {
    const d = lire('<rect x="0" y="0" width="10" height="10" fill="#c81e28"/>');
    const p = profil({ feuille: { x: 0, y: 600, l: 400, h: 552 } });
    expect(regionDeCoupe(p, gabaritDuTapis(p, d, null))).toEqual({ x: 24, y: 600, l: 376, h: 528 });
  });
});

describe('le constat d une forme hors de la feuille', () => {
  it('ne se pose qu avec le tapis fixe, et nomme la zone utile ou la feuille', () => {
    const d = lire('<rect x="10" y="500" width="100" height="80" fill="#c81e28"/><rect x="500" y="500" width="100" height="80" fill="#c81e28"/>');
    expect(constatsPreparation(d, profil({ recalage: true })).map(c => c.code)).not.toContain('hors-tapis');
    const c = constatsPreparation(d, profil()).find(x => x.code === 'hors-tapis');
    expect(c).toMatchObject({ gravite: 'a-corriger', formes: ['f1'], correction: 'ramener-zone' });
    expect(c?.message).toBe('Une forme sort de la zone utile du tapis 12 × 12 po (les pointillés) : la machine ne la couperait pas à cet endroit. Ramenez-la sur le tapis.');
    const partielle = profil({ feuille: { x: 400, y: 400, l: 400, h: 400 } });
    const cp = constatsPreparation(d, partielle).find(x => x.code === 'hors-tapis');
    expect(cp?.message).toMatch(/^Une forme sort de la feuille posée sur le tapis 12 × 12 po/);
  });

  it('se corrige par le plus petit deplacement qui ramene chaque forme sur la feuille', () => {
    const d = lire('<rect x="10" y="500" width="100" height="80" fill="#c81e28"/><rect x="1100" y="1120" width="100" height="80" fill="#1428a0"/>');
    const p = profil();
    const c = constatsPreparation(d, p).find(x => x.code === 'hors-tapis');
    if (!c) throw new Error('constat');
    const r = corrigerPreparation(d, 'ramener-zone', c, p);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.phrase).toBe('2 formes ramenées sur la feuille, dans la zone utile du tapis.');
    expect(constatsPreparation(r.dessin, p).map(x => x.code)).not.toContain('hors-tapis');
    expect(r.dessin.formes[0]?.d[0]?.p).toEqual([24, 500]);
    expect(r.dessin.formes[1]?.d[0]?.p).toEqual([1028, 1048]);
  });
});

describe('le projet JSON', () => {
  const d = lire('<rect x="10" y="10" width="100" height="80" fill="#c81e28"/>');
  const etat = (production: ChoixProduction) => ({ nom: 'essai', dessin: d, production, nuancier: [], polices: [], images: [] });

  it('garde le recalage et la feuille seulement hors du defaut, et les relit', () => {
    const avec = projetDe(etat(choix({ recalage: true, feuille: { x: 1, y: 2, l: 300, h: 400 } })) as Parameters<typeof projetDe>[0]);
    expect(avec.production).toEqual(choix({ recalage: true, feuille: { x: 1, y: 2, l: 300, h: 400 } }));
    const relu = lireProjet(JSON.parse(JSON.stringify(avec)));
    expect('projet' in relu ? relu.projet.production : relu).toEqual(avec.production);
    const sans = projetDe(etat(choix()) as Parameters<typeof projetDe>[0]);
    expect(Object.keys(sans.production)).toEqual(['contexte', 'machine', 'tapis', 'materiau', 'procede', 'unite']);
  });

  it('refuse un recalage ou une feuille mal formes, en le nommant', () => {
    const base = JSON.parse(JSON.stringify(projetDe(etat(choix()) as Parameters<typeof projetDe>[0]))) as Record<string, Record<string, unknown>>;
    const avec = (champ: Record<string, unknown>) => lireProjet({ ...base, production: { ...base['production'], ...champ } });
    expect(avec({ recalage: 'non' })).toMatchObject({ erreur: expect.stringMatching(/recalage/) });
    // L'ancienne valeur « decochee » d'un projet d'avant la revision se lit comme le defaut, sans refus.
    const ancien = avec({ recalage: false });
    expect('projet' in ancien ? ancien.projet.production : ancien).toEqual(choix());
    expect(avec({ feuille: { x: 0, y: 0, l: 0, h: 10 } })).toMatchObject({ erreur: expect.stringMatching(/feuille/) });
  });
});

describe('le plan pose sur le tapis des le depart', () => {
  const D = lire('<rect x="100" y="50" width="200" height="100" fill="#c81e28"/>', '0 0 480 288');

  it('pose le tapis a l ouverture comme Design Space poserait les pieces : le dessin a 2 mm du coin de la zone utile, les formes ne bougent pas', () => {
    const d = planDOuverture(D, choix());
    // La zone utile (un quart de pouce dans le tapis) commence a 2 mm (la marge par defaut de la feuille) du coin du dessin (100, 50).
    expect(d.vb).toEqual([68.441, 18.441, 1152, 1152]);
    expect(d.formes).toBe(D.formes);
    expect(constatsPreparation(d, profil()).map(c => c.code)).not.toContain('hors-tapis');
    // Un dessin qui ne tient dans la zone qu'avec moins de marge en prend moins : ici aucune, il la remplit en largeur.
    expect(planDOuverture(lire('<rect x="10" y="10" width="1104" height="100" fill="#c81e28"/>', '0 0 1200 200'), choix()).vb).toEqual([-14, -21.559, 1152, 1152]);
    // Un document enregistre sans recalage (le plan a deja la taille du tapis) garde son plan : le meme objet.
    expect(planDOuverture(d, choix())).toBe(d);
    // Un dessin vide prend le tapis au coin du plan.
    expect(planDOuverture({ vb: [0, 0, 800, 600], formes: [] }, choix()).vb).toEqual([0, 0, 1152, 1152]);
  });

  it('ne change rien en Generique, avec le recalage, en Print Then Cut : le meme objet', () => {
    expect(planDOuverture(D, { contexte: 'generique' })).toBe(D);
    expect(planDOuverture(D, choix({ recalage: true }))).toBe(D);
    expect(planDOuverture(D, choix({ procede: 'imprimer-decouper' }))).toBe(D);
    expect(planDOuverture(D, choix({ procede: 'dessin-stylo' })).vb).toEqual([68.441, 18.441, 1152, 1152]);
  });

  it('garde un dessin plus grand que le tapis tel quel et le dit : hors-tapis, avec sa correction', () => {
    // Deux pieces qui tiennent chacune, mais pas ensemble : la seconde sort de la zone utile, rien ne la deplace en silence.
    const grand = lire('<rect x="0" y="0" width="600" height="200" fill="#c81e28"/><rect x="700" y="0" width="600" height="200" fill="#c81e28"/>', '0 0 1600 400');
    const d = planDOuverture(grand, choix());
    expect(d.vb).toEqual([-24, -31.559, 1152, 1152]);
    expect(d.formes).toBe(grand.formes);
    expect(constatsPreparation(d, profil()).find(c => c.code === 'hors-tapis')).toMatchObject({ gravite: 'a-corriger', formes: ['f2'], correction: 'ramener-zone' });
    // Une piece plus grande que la zone utile reste ce qu'elle etait : bloquante, avec « Ajuster a la zone utile ».
    const enorme = planDOuverture(lire('<rect x="0" y="0" width="1500" height="200" fill="#c81e28"/>', '0 0 1600 400'), choix());
    expect(constatsPreparation(enorme, profil()).find(c => c.code === 'piece-trop-grande')).toMatchObject({ gravite: 'bloquant', correction: 'ajuster-zone' });
  });

  it('pose le plan quand on choisit Cricut, garde le coin d un plan deja pose, et suit le tapis montre quand on decoche', () => {
    expect(planPourChoix(D, { contexte: 'generique' }, choix())?.vb).toEqual([68.441, 18.441, 1152, 1152]);
    const pose = planDOuverture(D, choix());
    expect(planPourChoix(pose, choix({ procede: 'imprimer-decouper' }), choix())).toBeNull();
    expect(planPourChoix(pose, choix(), choix({ tapis: '12x24' }))?.vb).toEqual([68.441, 18.441, 1152, 2304]);
    // Decocher la case sur un plan deja pose garde son coin : les formes retrouvent leur place sur le tapis fixe, meme deplacees.
    const deplace = { ...pose, formes: pose.formes.map(f => ({ ...f, d: f.d.map(s => ({ ...s, p: s.p.map(v => v + 96) })) })) };
    expect(planPourChoix(deplace, choix({ recalage: true }), choix())).toBeNull();
    // Sur un plan qui n'est pas le tapis, le tapis tel que la toile le montrait, cale sur le coin du dessin.
    expect(planPourChoix({ ...D, formes: deplace.formes }, choix({ recalage: true }), choix())?.vb).toEqual([172, 122, 1152, 1152]);
  });
});

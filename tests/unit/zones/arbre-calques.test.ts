// L'arbre des calques, cote calcul (ADR-0012, etape 2, paquet 2-B) : les lignes visibles et leur memoire, les destinations de
// « Déplacer vers… », le contexte qu'un choix amene, et les deplacements du clavier (Ctrl+Maj+fleches) avec leurs phrases.

import { describe, expect, it } from 'vitest';
import { ancetres, arbreDe, lireDessin, verifierDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { changerDeRang, ciblesDe, deplacerVers, entrerAuDessus, renommerGroupe, sortirDuGroupe } from '../../../src/zones/deplacerCalques.js';
import { destinations, etendue, groupeCommun, lignesVisibles } from '../../../src/zones/lignesCalques.js';
import { phraseDeplie, phraseFreresDeplies, phraseReplie } from '../../../src/zones/phrasesCalques.js';

/** Un ciel (un nuage de deux formes, puis un soleil), une herbe de deux formes, une forme seule au premier plan. */
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<g data-ed-nom="Ciel"><g data-ed-nom="Nuage"><rect x="40" y="40" width="80" height="60"/><rect x="160" y="40" width="80" height="60"/></g><circle cx="300" cy="60" r="30"/></g>'
  + '<g data-ed-nom="Herbe"><rect x="0" y="250" width="400" height="10"/><rect x="0" y="260" width="400" height="10"/></g>'
  + '<rect x="40" y="180" width="80" height="60"/>'
  + '</svg>';

function lire(): DessinSvg {
  const r = lireDessin(SVG, { modele: 'riche' });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
}
const d = lire();
const id = (nom: string): string => Object.values(d.groupes ?? {}).find(g => g.nom === nom)?.id ?? '';
const CIEL = id('Ciel'), NUAGE = id('Nuage'), HERBE = id('Herbe');
/** Les enfants d'un groupe (ou de la racine), du premier plan au fond, comme l'arbre les montre. */
const enfants = (x: DessinSvg, g: string | null): string[] => {
  const a = arbreDe(x), n = g === null ? null : a.parId.get(g);
  const t = g === null ? a.racine : n?.genre === 'groupe' ? n.enfants : [];
  return t.map(e => (e.genre === 'feuille' ? e.forme.id : e.groupe.id)).reverse();
};

describe('les lignes visibles', () => {
  it('replie : la racine seule, du premier plan au fond', () => {
    const { lignes, index } = lignesVisibles(d, new Set());
    expect(lignes.map(l => l.id)).toEqual(['f6', HERBE, CIEL]);
    expect(lignes.map(l => [l.niveau, l.position, l.freres])).toEqual([[1, 1, 3], [1, 2, 3], [1, 3, 3]]);
    expect(index.get(CIEL)).toBe(2);
  });

  it('deplie : les enfants sous leur groupe, au niveau suivant, avec leur parent', () => {
    const { lignes } = lignesVisibles(d, new Set([CIEL, NUAGE]));
    expect(lignes.map(l => l.id + ':' + l.niveau + ':' + (l.parent ?? '-'))).toEqual(['f6:1:-', HERBE + ':1:-', CIEL + ':1:-', 'f3:2:' + CIEL, NUAGE + ':2:' + CIEL, 'f2:3:' + NUAGE, 'f1:3:' + NUAGE]);
    // Un groupe deplie sous un groupe replie ne montre rien.
    expect(lignesVisibles(d, new Set([NUAGE])).lignes).toHaveLength(3);
  });

  it('memorise par dessin et par ensemble deplie', () => {
    const deplies = new Set([CIEL]);
    expect(lignesVisibles(d, deplies)).toBe(lignesVisibles(d, deplies));
    expect(lignesVisibles(d, new Set([CIEL]))).not.toBe(lignesVisibles(d, deplies));
  });

  it('l etendue d un Maj+clic, dans un sens ou dans l autre', () => {
    const { lignes } = lignesVisibles(d, new Set([CIEL]));
    expect(etendue(lignes, 3, 1)).toEqual([HERBE, CIEL, 'f3']);
  });
});

describe('le contexte et les destinations', () => {
  it('le groupe commun d un choix : le parent, l ancetre commun, ou la racine', () => {
    expect(groupeCommun(d, ['f1'])).toBe(NUAGE);
    expect(groupeCommun(d, ['f1', 'f3'])).toBe(CIEL);
    expect(groupeCommun(d, ['f1', 'f6'])).toBeNull();
    expect(groupeCommun(d, [CIEL])).toBeNull();
    expect(groupeCommun(d, [])).toBeNull();
  });

  it('« Déplacer vers… » : la racine et chaque groupe par son chemin ; ni le groupe deplace, ni ses descendants, ni le parent commun', () => {
    expect(destinations(d, ['f6'])).toEqual([
      { id: null, libelle: 'Racine', refusee: true },
      { id: HERBE, libelle: 'Herbe', refusee: false },
      { id: CIEL, libelle: 'Ciel', refusee: false },
      { id: NUAGE, libelle: 'Ciel › Nuage', refusee: false }
    ]);
    expect(destinations(d, [CIEL]).map(x => x.refusee)).toEqual([true, false, true, true]);
    expect(destinations(d, ['f1', 'f4']).map(x => x.refusee)).toEqual([false, false, false, false]);
  });
});

describe('les deplacements du clavier', () => {
  it('Ctrl+Maj+Haut et Bas : un rang parmi les freres, et la butee dite', () => {
    const r = changerDeRang(d, ['f1'], 'monte');
    expect(enfants(r.dessin, NUAGE)).toEqual(['f1', 'f2']);
    expect(r.phrase).toBe('Rectangle 1 monte d’un rang.');
    const butee = changerDeRang(d, ['f6'], 'monte');
    expect(butee.dessin).toBe(d);
    expect(butee.phrase).toBe('Rectangle 6 est déjà au premier plan de son niveau.');
    expect(changerDeRang(d, [HERBE], 'descend').phrase).toBe('Groupe « Herbe » descend d’un rang.');
    expect(enfants(changerDeRang(d, [HERBE], 'descend').dessin, null)).toEqual(['f6', CIEL, HERBE]);
  });

  it('Ctrl+Maj+Gauche sort du groupe, juste sous lui ; Ctrl+Maj+Droite entre dans le groupe au-dessus, tout en bas : aller et retour', () => {
    const sortie = sortirDuGroupe(d, 'f2', ['f2']);
    expect(enfants(sortie.dessin, CIEL)).toEqual(['f3', NUAGE, 'f2']);
    expect(enfants(sortie.dessin, NUAGE)).toEqual(['f1']);
    expect(sortie.phrase).toBe('Rectangle 2 sort du groupe « Nuage », dans le groupe « Ciel ».');
    expect(verifierDessin(sortie.dessin)).toEqual([]);
    const dedans = entrerAuDessus(sortie.dessin, 'f2', ['f2']);
    expect(enfants(dedans.dessin, NUAGE)).toEqual(['f1', 'f2']);
    expect(dedans.phrase).toBe('Rectangle 2 passe dans le groupe « Nuage ».');
    expect(dedans.deplier).toEqual([NUAGE, CIEL]);
    // Entrer puis sortir rend le dessin d'avant : l'ordre de peinture n'a pas change.
    const aller = entrerAuDessus(d, CIEL, [CIEL]), retour = sortirDuGroupe(aller.dessin, CIEL, [CIEL]);
    expect(retour.dessin.formes.map(f => f.id)).toEqual(d.formes.map(f => f.id));
    expect(ancetres(retour.dessin, CIEL)).toEqual([]);
  });

  it('sortir tous les enfants d un groupe : il disparait, ils prennent sa place ; a la racine, rien', () => {
    const r = sortirDuGroupe(d, 'f1', ['f1', 'f2']);
    expect(enfants(r.dessin, CIEL)).toEqual(['f3', 'f2', 'f1']);
    expect(r.dessin.groupes?.[NUAGE]).toBeUndefined();
    expect(r.phrase).toBe('2 éléments sortent du groupe « Nuage », dans le groupe « Ciel ».');
    const racine = sortirDuGroupe(d, 'f6', ['f6']);
    expect(racine.dessin).toBe(d);
    expect(racine.phrase).toBe('Rectangle 6 est déjà à la racine.');
    expect(sortirDuGroupe(d, 'f1', ['f1', 'f6']).phrase).toMatch(/même groupe/);
  });

  it('entrer au-dessus : seulement si le frere juste au-dessus est un groupe', () => {
    const r = entrerAuDessus(d, CIEL, [CIEL]);
    expect(enfants(r.dessin, HERBE)).toEqual(['f5', 'f4', CIEL]);
    expect(entrerAuDessus(d, HERBE, [HERBE]).phrase).toBe('Le calque juste au-dessus n’est pas un groupe : rien où entrer.');
    expect(entrerAuDessus(d, HERBE, [HERBE]).dessin).toBe(d);
  });

  it('« Déplacer vers… » et le depot : au premier plan du groupe, ou sous une feuille ; jamais en lui-meme', () => {
    const r = deplacerVers(d, ['f6', 'f1'], HERBE);
    expect(enfants(r.dessin, HERBE)).toEqual(['f6', 'f1', 'f5', 'f4']);
    expect(r.phrase).toBe('2 éléments passent dans le groupe « Herbe ».');
    expect(r.deplier).toEqual([HERBE]);
    expect(deplacerVers(d, ['f1'], null).phrase).toBe('Rectangle 1 passe à la racine.');
    expect(enfants(deplacerVers(d, ['f1'], null).dessin, null)[0]).toBe('f1');
    const sous = deplacerVers(d, ['f6'], HERBE, 'f5');
    expect(enfants(sous.dessin, HERBE)).toEqual(['f5', 'f6', 'f4']);
    expect(deplacerVers(d, [CIEL], NUAGE).phrase).toBe('Un groupe ne peut pas entrer en lui-même ni dans l’un de ses groupes.');
    expect(deplacerVers(d, [CIEL], NUAGE).dessin).toBe(d);
    expect(deplacerVers(d, ['f6'], null).phrase).toBe('Rectangle 6 est déjà à la racine.');
    expect(ancetres(sous.dessin, 'f6')).toEqual([HERBE]);
  });

  it('les cibles : la selection si la ligne en est, ses unites ; sinon la ligne seule', () => {
    expect(ciblesDe(d, 'f1', [NUAGE, 'f1', 'f6'])).toEqual([NUAGE, 'f6']);
    expect(ciblesDe(d, 'f3', ['f1'])).toEqual(['f3']);
  });

  it('F2 renomme un groupe ; un nom vide le retire ; une feuille ne se renomme pas', () => {
    const r = renommerGroupe(d, HERBE, '  Pré ');
    expect(r?.dessin.groupes?.[HERBE]?.nom).toBe('Pré');
    expect(r?.phrase).toBe('Groupe renommé : « Pré ».');
    expect(renommerGroupe(d, HERBE, '')?.phrase).toBe('Nom retiré : Groupe ' + HERBE.slice(1) + '.');
    expect(renommerGroupe(d, HERBE, 'Herbe')).toBeNull();
    expect(renommerGroupe(d, 'f1', 'x')).toBeNull();
  });
});

describe('les phrases de plier et deplier', () => {
  it('disent le groupe et son nombre d elements', () => {
    const g = d.groupes?.[CIEL];
    if (!g) throw new Error('ciel');
    expect(phraseDeplie(g, 2)).toBe('Groupe « Ciel » déplié : 2 éléments.');
    expect(phraseReplie(g)).toBe('Groupe « Ciel » replié.');
    expect(phraseFreresDeplies(2)).toBe('2 groupes dépliés.');
    expect(phraseFreresDeplies(0)).toBe('Aucun groupe à déplier à ce niveau.');
  });
});

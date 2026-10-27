// Le mecanisme de la traduction (ADR-0042 §2) : la cle est la phrase francaise, `t` rend la cle en francais et l'entree du
// dictionnaire en anglais (la cle quand elle manque), les `{valeurs}` s'interpolent, les pluriels passent par `t`, les nombres et la
// locale suivent la langue, et seule une langue connue passe la validation.

import { afterEach, describe, expect, it } from 'vitest';
import {
  definirDictionnaire, definirLangue, dictionnairePose, estLangue, interpoler, langue, LANGUES, locale, nombre, t, traduction
} from '../../../src/util/i18n.js';
import { pluriel } from '../../../src/util/texte.js';

afterEach(() => { definirLangue('fr'); definirDictionnaire('en', {}); });

describe('t', () => {
  it('rend la cle telle quelle en francais, la langue par defaut', () => {
    expect(langue()).toBe('fr');
    expect(t('Annuler')).toBe('Annuler');
    expect(t('Projet « {nom} » enregistré.', { nom: 'Logo' })).toBe('Projet « Logo » enregistré.');
  });

  it('rend l entree du dictionnaire en anglais, interpolee, et la cle quand elle manque', () => {
    definirDictionnaire('en', { 'Annuler': 'Cancel', 'Projet « {nom} » enregistré.': 'Project “{nom}” saved.' });
    definirLangue('en');
    expect(t('Annuler')).toBe('Cancel');
    expect(t('Projet « {nom} » enregistré.', { nom: 'Logo' })).toBe('Project “Logo” saved.');
    expect(t('Fermer')).toBe('Fermer');
    expect(traduction('Fermer')).toBeUndefined();
  });

  it('interpole chaque {nom}, laisse un nom sans valeur visible, et ne lit jamais le prototype', () => {
    expect(interpoler('{a} et {b}, {a}', { a: 1, b: 'deux' })).toBe('1 et deux, 1');
    expect(interpoler('{inconnu} reste', {})).toBe('{inconnu} reste');
    expect(interpoler('{constructor}', {})).toBe('{constructor}');
    definirDictionnaire('en', {});
    definirLangue('en');
    expect(t('constructor')).toBe('constructor');
    expect(t('toString')).toBe('toString');
  });
});

describe('la langue', () => {
  it('n accepte que fr et en ; fr est la premiere et le defaut', () => {
    expect(LANGUES).toEqual(['fr', 'en']);
    expect(estLangue('fr') && estLangue('en')).toBe(true);
    for (const v of ['de', 'FR', 'en-US', '', null, undefined, 1, ['en'], { langue: 'en' }]) expect(estLangue(v), String(v)).toBe(false);
  });

  it('sait si un dictionnaire est pose : toujours pour le francais, apres definirDictionnaire pour l anglais', () => {
    // Un module neuf n'a aucun dictionnaire anglais ; l'afterEach en pose un vide, qui compte comme pose.
    expect(dictionnairePose('fr')).toBe(true);
    definirDictionnaire('en', { a: 'b' });
    expect(dictionnairePose('en')).toBe(true);
  });

  it('donne la locale et le format des nombres de chaque langue', () => {
    expect(locale()).toBe('fr-FR');
    // L'espace des milliers est une fine insecable (U+202F) ou une insecable (U+00A0) selon l'ICU de Node : on la ramene a un blanc.
    expect(nombre(5000).replace(/[\u202f\u00a0]/g, ' ')).toBe('5 000');
    expect(nombre(1.23456, 2)).toBe('1,23');
    expect(nombre(1.23456)).toBe('1,235');
    definirLangue('en');
    expect(locale()).toBe('en-US');
    expect(nombre(5000)).toBe('5,000');
    expect(nombre(1.23456, 2)).toBe('1.23');
  });
});

describe('pluriel, par t', () => {
  it('garde la regle francaise : un s au-dela de un, les mots en s, x, z invariables, un irregulier donne entier', () => {
    expect(pluriel(1, 'forme')).toBe('1 forme');
    expect(pluriel(3, 'forme')).toBe('3 formes');
    expect(pluriel(2, 'tapis')).toBe('2 tapis');
    expect(pluriel(1, 'cheval', 'chevaux')).toBe('1 cheval');
    expect(pluriel(2, 'cheval', 'chevaux')).toBe('2 chevaux');
  });

  it('en anglais, traduit le singulier et met un s, sauf si le dictionnaire donne le pluriel francais', () => {
    definirDictionnaire('en', { forme: 'shape', copie: 'copy', copies: 'copies', cheval: 'horse', tapis: 'mat' });
    definirLangue('en');
    expect(pluriel(1, 'forme')).toBe('1 shape');
    expect(pluriel(3, 'forme')).toBe('3 shapes');
    expect(pluriel(0, 'forme')).toBe('0 shape');
    expect(pluriel(2, 'copie')).toBe('2 copies');
    expect(pluriel(2, 'cheval', 'chevaux')).toBe('2 horses');
    expect(pluriel(2, 'tapis')).toBe('2 mats');
    // Un mot sans traduction reste francais, et s'accorde quand meme.
    expect(pluriel(2, 'nuage')).toBe('2 nuages');
  });
});

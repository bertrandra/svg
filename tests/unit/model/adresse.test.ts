import { describe, it, expect } from 'vitest';
import { estAdresseSeule, LONGUEUR_ADRESSE_MAX, nomDepuisAdresse, validerAdresse } from '../../../src/model/adresse.js';

// Ouvrir depuis une adresse (ADR-0036) : ce qu'on accepte d'une adresse avant toute requete, et le nom qu'on en tire.

const erreur = (texte: string, http = false): string => {
  const v = validerAdresse(texte, { http });
  return 'erreur' in v ? v.erreur : '';
};

describe('la validation d une adresse', () => {
  it('accepte https, normalise, retire le fragment et rend l hote', () => {
    expect(validerAdresse('  https://Exemple.FR/dessins/logo.svg?v=2#haut ')).toEqual({ url: 'https://exemple.fr/dessins/logo.svg?v=2', hote: 'exemple.fr' });
    expect(validerAdresse('https://[2001:db8::1]:8443/a.pdf')).toEqual({ url: 'https://[2001:db8::1]:8443/a.pdf', hote: '[2001:db8::1]' });
  });

  it('donne https a une adresse sans schema', () => {
    expect(validerAdresse('exemple.fr/logo.png')).toEqual({ url: 'https://exemple.fr/logo.png', hote: 'exemple.fr' });
    expect(validerAdresse('exemple.fr:8443/logo.png')).toEqual({ url: 'https://exemple.fr:8443/logo.png', hote: 'exemple.fr' });
  });

  it('refuse http, sauf quand l hote le permet (le site, si son administrateur l a choisi)', () => {
    expect(erreur('http://exemple.fr/a.svg')).toContain('« http:// »');
    expect(validerAdresse('http://exemple.fr/a.svg', { http: true })).toEqual({ url: 'http://exemple.fr/a.svg', hote: 'exemple.fr' });
  });

  it('refuse tout autre schema en le nommant, et ne colle jamais https:// devant', () => {
    for (const [a, s] of [['javascript:alert(1)', 'javascript:'], ['data:image/svg+xml,<svg/>', 'data:'], ['file:///etc/passwd', 'file:'], ['ftp://exemple.fr/a.svg', 'ftp:'], ['blob:https://exemple.fr/x', 'blob:'], ['gopher://exemple.fr/', 'gopher:'], ['JavaScript:alert(1)', 'javascript:']] as const) {
      expect(erreur(a), a).toContain('« ' + s + ' » est refusé');
    }
  });

  it('refuse un identifiant ou un mot de passe dans l adresse, une adresse vide, illisible ou demesuree', () => {
    expect(erreur('https://moi:secret@exemple.fr/a.svg')).toContain('identifiant ou un mot de passe');
    expect(erreur('https://moi@exemple.fr/a.svg')).toContain('identifiant ou un mot de passe');
    expect(erreur('   ')).toContain('Saisissez');
    expect(erreur('https://')).toContain('n’est pas valide');
    expect(erreur('https://exemple.fr/' + 'a'.repeat(LONGUEUR_ADRESSE_MAX))).toContain('dépasse 2048');
  });

  it('ne leve jamais, quelle que soit l entree', () => {
    for (const t of ['%', 'https://%zz', '[::1', 'https://a b', '\u0000', 'https://exemple.fr:99999/', '::::', 'https://.']) {
      expect(() => validerAdresse(t)).not.toThrow();
    }
  });
});

describe('une adresse seule (collee ou deposee)', () => {
  it('est une adresse http(s) sans rien autour', () => {
    expect(estAdresseSeule(' https://exemple.fr/a.svg ')).toBe(true);
    expect(estAdresseSeule('http://exemple.fr/a.svg')).toBe(true);
    expect(estAdresseSeule('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe(false);
    expect(estAdresseSeule('voir https://exemple.fr/a.svg')).toBe(false);
    expect(estAdresseSeule('https://exemple.fr/a.svg https://exemple.fr/b.svg')).toBe(false);
    expect(estAdresseSeule('javascript:alert(1)')).toBe(false);
  });
});

describe('le nom tire d une adresse', () => {
  it('est le dernier segment, decode, sans extension, nettoye par nomDeFichier', () => {
    expect(nomDepuisAdresse('https://exemple.fr/dessins/Carte%20de%20No%C3%ABl.svg')).toBe('carte-de-noel');
    expect(nomDepuisAdresse('https://exemple.fr/a/b/logo.PNG')).toBe('logo');
    expect(nomDepuisAdresse('https://exemple.fr/plan.pdf/')).toBe('plan');
    expect(nomDepuisAdresse('https://exemple.fr/photo.jpeg')).toBe('photo');
  });

  it('ne prend jamais les parametres (ils peuvent porter un jeton) ; l hote faute de segment', () => {
    expect(nomDepuisAdresse('https://exemple.fr/telecharger?fichier=secret.svg&jeton=abc')).toBe('telecharger');
    expect(nomDepuisAdresse('https://www.exemple.fr/?jeton=abc')).toBe('exemple-fr');
    expect(nomDepuisAdresse('https://exemple.fr/%E0%A4%A')).toBe('e0-a4-a');
    expect(nomDepuisAdresse('pas une adresse')).toBe('dessin');
    expect(nomDepuisAdresse('https://exemple.fr/%2E%2E%2F%2E%2E%2Fetc%2Fpasswd')).toBe('etc-passwd');
  });
});

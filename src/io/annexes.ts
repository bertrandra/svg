// Les fichiers annexes (bibliotheque.js, polices.js, vtracer.js) : des scripts classiques que la page
// charge a la demande par une balise <script>, plutot que par fetch ou import(), pour que cela marche
// aussi depuis le disque (file://). Ce module sait deux choses, une seule fois pour les trois :
//
//   - OU les chercher : a cote de la page, sous leur nom nu, ou sous un dossier de base que l'hote donne ;
//   - COMMENT les charger : une injection au plus, un succes qui se garde, un echec qui se remet a zero
//     pour qu'un nouvel essai (le fichier a ete pose entre-temps) reparte de rien.
//
// Chaque annexe se decrit par un `Annexe<T>` (son fichier, la globale que le script pose, ce qu'il doit
// contenir) ; le navigateur n'entre que par `Amenees`, pour que tout se teste sans page.

/** Ce qu'il faut savoir d'une annexe : ou elle est, ce qu'elle pose, et comment se plaindre d'elle. */
export interface Annexe<T> {
  /** Le nom du fichier, sans dossier : `bibliotheque.js`. */
  fichier: string;
  /** La variable de la fenetre que le script pose : `__bibliothequeSvg`. */
  globale: string;
  /** Ce que le fichier doit contenir, pour « ne contient pas … » : `la bibliothèque`. */
  contenu: string;
  /** Ce que la personne doit faire quand le fichier manque, apres « introuvable à côté de la page : ». */
  consigne: string;
  /** Rend la valeur posee si elle a la bonne forme, undefined sinon (absente ou inattendue). */
  valider: (posee: unknown) => T | undefined;
}

/** Les deux gestes du navigateur, passes en parametre pour que le reste se teste sans page. */
export interface Amenees {
  /** Ajoute le script d'adresse `url` ; rend vrai s'il est arrive, faux s'il est introuvable. */
  injecter: (url: string) => Promise<boolean>;
  /** Ce que le script a pose sur la fenetre sous ce nom, s'il l'a pose. */
  lire: (globale: string) => unknown;
}

export interface Chargeur<T> {
  charger: () => Promise<T>;
  /** Vrai quand le chargement a abouti : un appel qui suit n'a rien a annoncer. */
  pret: () => boolean;
}

let base = '';

/** Le dossier de base avec sa barre finale ; une base vide reste vide (a cote de la page). */
export function normaliserBase(dossier: string): string {
  const d = dossier.trim();
  return d === '' || d.endsWith('/') ? d : d + '/';
}

/**
 * Pose le dossier des annexes pour les chargements a venir (un fichier deja charge ne bouge plus). Une
 * balise <script> resout un chemin relatif contre la page, pas contre le script qui l'ecrit : la base se
 * donne donc relative a la page de l'hote, ou absolue.
 */
export function definirBaseAnnexes(dossier: string): void { base = normaliserBase(dossier); }

/** L'adresse d'un fichier annexe sous la base courante. */
export const urlAnnexe = (fichier: string): string => base + fichier;

export const messageIntrouvable = <T>(a: Annexe<T>): string =>
  'Le fichier ' + a.fichier + ' est introuvable à côté de la page : ' + a.consigne + '.';

export const messageVide = <T>(a: Annexe<T>): string => 'Le fichier ' + a.fichier + ' ne contient pas ' + a.contenu + '.';

/**
 * Garde un succes, oublie un echec. La promesse en cours se partage (deux demandes de front ne lancent
 * qu'un chargement) ; un echec la remet a zero pour que l'appel suivant reparte de rien.
 */
export function memoiserSucces<T>(demarrer: () => Promise<T>): Chargeur<T> {
  let promesse: Promise<T> | null = null;
  let pret = false;
  return {
    charger: () => {
      promesse ??= demarrer().then(v => { pret = true; return v; }, (e: unknown) => {
        promesse = null;
        throw e instanceof Error ? e : new Error(String(e));
      });
      return promesse;
    },
    pret: () => pret
  };
}

/**
 * Le chargeur d'une annexe : ne rajoute rien si le script a deja pose sa valeur, n'injecte qu'une fois,
 * et dit si le fichier manque ou s'il est arrive sans (ou avec autre chose que) ce qu'on attendait.
 */
export function fabriquerChargeurAnnexe<T>(a: Annexe<T>, amenees: Amenees): Chargeur<T> {
  return memoiserSucces(async () => {
    const dejaLa = a.valider(amenees.lire(a.globale));
    if (dejaLa !== undefined) return dejaLa;
    if (!(await amenees.injecter(urlAnnexe(a.fichier)))) throw new Error(messageIntrouvable(a));
    const posee = a.valider(amenees.lire(a.globale));
    if (posee === undefined) throw new Error(messageVide(a));
    return posee;
  });
}

/** Le vrai navigateur : une balise <script> ajoutee puis retiree, une globale lue sur la fenetre. */
export const navigateur: Amenees = {
  lire: globale => (window as unknown as Record<string, unknown>)[globale],
  injecter: url => new Promise<boolean>(ok => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => { s.remove(); ok(true); };
    s.onerror = () => { s.remove(); ok(false); };
    document.head.appendChild(s);
  })
};

/** Vrai quand le script a deja pose sa valeur : un panneau qui se rouvre n'a pas a redemander. */
export const annexePosee = <T>(a: Annexe<T>, amenees: Amenees = navigateur): boolean =>
  a.valider(amenees.lire(a.globale)) !== undefined;

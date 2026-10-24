// Ou chercher les fichiers annexes (bibliotheque.js, polices.js) : par defaut a cote de la page, sous
// leur nom nu ; un hote qui range ses fichiers ailleurs donne un dossier de base. Une balise <script>
// resout un chemin relatif contre la page, pas contre le script qui l'ecrit : la base se donne donc
// relative a la page de l'hote, ou absolue.

let base = '';

/** Le dossier de base avec sa barre finale ; une base vide reste vide (a cote de la page). */
export function normaliserBase(dossier: string): string {
  const d = dossier.trim();
  return d === '' || d.endsWith('/') ? d : d + '/';
}

/** Pose le dossier des annexes pour les chargements a venir (un fichier deja charge ne bouge plus). */
export function definirBaseAnnexes(dossier: string): void { base = normaliserBase(dossier); }

/** L'adresse d'un fichier annexe sous la base courante. */
export const urlAnnexe = (fichier: string): string => base + fichier;

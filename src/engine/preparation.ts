// La preparation d'un dessin pour une machine de decoupe (ADR-0013) : un contexte de production est un profil
// de donnees (model/contextes.ts) que le moteur resout, avec lequel il juge le dessin en continu et regle les
// outils existants. Ce fichier n'est que la facade : le travail vit dans `preparation/`. Pur : ni DOM, ni
// horloge, ni hasard, ni reseau.

export {
  resoudreProfil, normaliserChoix, marqueDeChoix, marqueDeProfil, choixDeMarque, choixDeDepart, unitesDePouces, versUnite, depuisUnite, texteMesure, texteTaille,
  cadreTapis, unionCadres, type CadreTapis, type ProfilProduction
} from './preparation/profil.js';
export {
  constatsPreparation, constatsBloquants, resumePreparation, aUnTrait, estTransparente, GRAVITES, LIBELLES_CORRECTION, FORMES_MAX_FINESSE,
  type Constat, type CodeConstat, type CodeCorrection, type Gravite
} from './preparation/constats.js';
export { corrigerPreparation, type ResultatCorrection } from './preparation/corrections.js';
export { couchesDe, etendueVisible, formesPeintes, tientDans, type Couche } from './preparation/mesures.js';
export { finesseDe, AIRE_MIN, POINTS_MAX_MESURE, type Finesse } from './preparation/finesse.js';
export { silhouetteDe, regionPeinte, unirRegions } from './preparation/silhouette.js';
export { boiteDeRegion, pairesTrous } from './preparation/geometrie.js';

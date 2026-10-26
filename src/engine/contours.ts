// Les outils de contour qui demandent le moteur de decoupe (polygon-clipping) : transformer le trait d'une
// forme en forme pleine, decaler un contour. Comme `booleens.ts`, ils vivent a cote de `editionSvg.ts` et
// non dedans : ils s'appuient sur lui (et sur l'aplatissement des booleens), il ne les connait pas.

export { etendreTrait, etendreTraits, aireDuTrait, type OptionsEtendre, type ResultatEtendre, MSG_SANS_TRAIT } from './contour/etendre.js';
export { decaler, decalerFormes, type OptionsDecalage, type ResultatDecalage, type ResultatDecalageFormes } from './contour/decaler.js';
export type { Jonction, Bout } from './contour/epaissir.js';
export { cheminDeRegionChoisie } from './contour/region.js';
export { largeurVariable, largeurA, profilValide, regionLargeurVariable, type ProfilLargeur, type ResultatLargeur } from './contour/largeur.js';

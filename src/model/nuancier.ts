// Le nuancier du dessin (ADR-0037) : les couleurs tirees du fichier ouvert (SVG, PDF, image convertie) ou d'une selection,
// gardees avec le dessin comme une donnee du document. Il ne s'ecrit jamais dans le SVG : seul le projet JSON le porte
// (ADR-0030). Ce module ne dit que sa forme et ses bornes ; le calcul (surfaces, fusion, plafond) est celui du moteur
// (engine/nuancier.ts).

/**
 * D'ou viennent les teintes : de tout le dessin (a l'ouverture, ou repris depuis le dessin), d'une selection qui a remplace le
 * nuancier, ou des deux (une selection ajoutee aux couleurs du dessin).
 */
export type ProvenanceNuancier = 'dessin' | 'selection' | 'mixte';

export const PROVENANCES_NUANCIER: readonly ProvenanceNuancier[] = ['dessin', 'selection', 'mixte'];

/**
 * Une teinte du nuancier du dessin : un code `#rrggbb` en minuscules, et l'opacite gardee a part (celle qui couvre le plus de
 * surface pour cette couleur), absente quand elle vaut 1. Pas de nom : il se calcule a l'affichage (model/nomsCouleurs.ts).
 */
export interface TeinteDessin { readonly hex: string; readonly opacite?: number }

export interface NuancierDessin { readonly provenance: ProvenanceNuancier; readonly teintes: readonly TeinteDessin[] }

/** Le nombre de teintes que l'on tire d'un dessin ou d'une selection, par defaut : assez pour un logo, lisible d'un coup d'oeil. */
export const PLAFOND_NUANCIER = 24;

/** Ce que le nuancier du dessin porte au plus, ajouts compris : la borne du nuancier d'un projet (BORNES_PROJET.nuancier). */
export const TEINTES_NUANCIER_MAX = 256;

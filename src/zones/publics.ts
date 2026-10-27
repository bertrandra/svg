// Un accueil par public (ADR-0024) : la page demande d'abord « Pour quoi dessinez-vous ? » et adapte la suite. Ici, le pur :
// les trois publics et leurs mots, la memoire du choix relue champ par champ, l'ordre des voies, le circuit de chaque public,
// le contexte de production que l'editeur prend a l'ouverture, et l'embarquement montre aux integrateurs. Rien ne touche au
// DOM ni au stockage : la page (Application.tsx, AccueilPublic.tsx) lit et ecrit, ce module dit quoi.
//
// Un public ne fait pas un autre produit (PRODUCT.md, « un contexte configure, il n'invente pas ») : il range les memes voies
// dans un autre ordre, montre le circuit qui le concerne, et regle l'editeur par le mecanisme qui existait (le contexte de
// production de l'ADR-0013). Choisir n'est jamais obligatoire : sans reponse, l'accueil est celui d'avant, question en tete.

import { CHOIX_CRICUT_DEFAUT, NOMS_PROCEDE, type ChoixProduction, type UniteLongueur } from '../model/contextes.js';
import { t } from '../util/i18n.js';
import { insecables, pluriel } from '../util/texte.js';
import type { NomIcone } from './icones.js';
import { libelleSelecteur } from './parcoursCricut.js';

export type IdPublic = 'machine' | 'retouche' | 'integration';
/** Une reponse a la question : un public, ou « aucun » quand on a passe la question (on ne la repose pas d'elle-meme). */
export type ChoixPublic = IdPublic | 'aucun';
/** Les trois voies de l'accueil (ADR-0006), par l'identifiant de leur onglet (`voie-svg`, `voie-image`, `voie-formes`). */
export type Voie = 'svg' | 'image' | 'formes';

/** La cle de la memoire du choix dans le stockage injecte : un confort, comme le brouillon (ADR-0010). */
export const CLE_PUBLIC = 'svg.accueil';

export interface DescriptionPublic {
  readonly id: IdPublic;
  readonly icone: NomIcone;
  /** Ce que la personne fait, a la premiere personne quand c'est elle qui parle (« Intégrer l'éditeur à mon produit »). */
  readonly titre: string;
  /** Ce qu'elle obtient, en une phrase concrete. */
  readonly phrase: string;
}

/**
 * Les trois publics de premier rang (PRODUCT.md), dans l'ordre de la question : d'egale dignite, la meme forme pour chacun. Des
 * donnees : le titre et la phrase se traduisent a l'affichage (`t(p.titre)`, `insecables(t(p.phrase))`, ADR-0042 §3), comme un
 * nom de machine ; la phrase est la cle, telle qu'elle est ecrite ici, et la typographie francaise (espaces insecables) se pose
 * apres la traduction, jamais avant : une cle aux insecables ne serait plus dans le dictionnaire.
 */
export const PUBLICS: readonly DescriptionPublic[] = [
  {
    id: 'machine', icone: 'machine', titre: 'Découper ou dessiner avec une machine',
    phrase: 'Pour une Cricut : un fichier prêt pour Design Space, à la taille réelle, en découpe, au stylo ou en Print Then Cut.'
  },
  {
    id: 'retouche', icone: 'palette', titre: 'Retoucher un dessin ou une image',
    phrase: 'Ouvrir un SVG ou un PDF, convertir une image, changer les couleurs, puis récupérer un fichier propre.'
  },
  {
    id: 'integration', icone: 'code', titre: 'Intégrer l’éditeur à mon produit',
    phrase: 'Un composant React ou une fonction ouvrir(), sans serveur : votre page reçoit le SVG retouché.'
  }
];

const IDS: readonly ChoixPublic[] = ['machine', 'retouche', 'integration', 'aucun'];

/**
 * La memoire du choix, relue champ par champ : un objet dont le champ `public` est l'une des quatre reponses connues. Tout le reste
 * (absent, abime, empoisonne, une reponse d'une version plus recente, un tableau) se lit comme « jamais repondu », sans lever ; les
 * champs inconnus d'un objet par ailleurs valide sont ignores.
 */
export function lirePublic(v: unknown): ChoixPublic | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const p = (v as Record<string, unknown>)['public'];
  return typeof p === 'string' && (IDS as readonly string[]).includes(p) ? (p as ChoixPublic) : null;
}

/** Ce qui s'ecrit sous `CLE_PUBLIC` : un objet, pour qu'un champ de plus demain ne casse pas la lecture d'aujourd'hui. */
export const memoirePublic = (c: ChoixPublic): { readonly public: ChoixPublic } => ({ public: c });

/** Le titre d'un public, pour la ligne qui rappelle le choix. */
export const titrePublic = (id: IdPublic): string => PUBLICS.find(p => p.id === id)?.titre ?? id;

const ORDRE_DEFAUT: readonly Voie[] = ['svg', 'image', 'formes'];
const ORDRE_MACHINE: readonly Voie[] = ['formes', 'image', 'svg'];

/**
 * L'ordre des voies : celui d'avant (Ouvrir, Convertir, Bibliothèque) pour tous, sauf la machine, qui part d'une forme de la
 * bibliotheque ou d'une image (les deux sources d'un projet de decoupe) avant un fichier deja vectoriel. Les voies ne sont jamais
 * dupliquees ni retirees : seul leur rang change, et la premiere est celle qu'on voit.
 */
export const ordreDesVoies = (p: ChoixPublic | null): readonly Voie[] => (p === 'machine' ? ORDRE_MACHINE : ORDRE_DEFAUT);

/**
 * Le contexte de production avec lequel l'editeur s'ouvre (ADR-0013) : Cricut pour la machine, avec le premier choix du modele
 * (Maker, tapis 12 × 12, papier cartonne, decoupe) et l'unite retenue (le millimetre par defaut) ; rien pour les autres, qui
 * restent en Generique. Un SVG qui porte sa marque l'emporte toujours (choixDeDepart) : ce n'est qu'un depart.
 */
export function productionDuPublic(p: ChoixPublic | null, unite: UniteLongueur): ChoixProduction | null {
  return p === 'machine' ? { contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, unite } : null;
}

/** La phrase qui dit, sous le circuit de la machine, comment l'editeur s'ouvrira : le meme libelle que le selecteur de la barre. */
export function phraseReglageMachine(c: ChoixProduction): string {
  if (c.contexte !== 'cricut') return '';
  // Le nom du procede est une donnee du modele : il se traduit a l'affichage (ADR-0042 §3).
  return insecables(t('L’éditeur s’ouvre réglé pour : {machine}, {procede}, en {unite}. La machine se change dans la barre, à tout moment.', {
    machine: libelleSelecteur(c), procede: t(NOMS_PROCEDE[c.procede]).toLowerCase(), unite: c.unite === 'mm' ? t('millimètres') : t('pouces')
  }));
}

export interface EtapeCircuit {
  readonly icone: NomIcone;
  readonly titre: string;
  readonly aide: string;
}

export interface Circuit {
  readonly titre: string;
  readonly etapes: readonly [EtapeCircuit, EtapeCircuit, EtapeCircuit];
}

const etape = (icone: NomIcone, titre: string, aide: string): EtapeCircuit => ({ icone, titre, aide: insecables(aide) });

/**
 * Le circuit « l'ensemble sur une plateforme » (PRODUCT.md, Positioning) vu par chaque public : d'ou part le dessin, ce que
 * l'editeur en fait, ce qui en sort. Trois etapes, toujours : c'est le meme circuit, dit avec les mots de celui qui le parcourt.
 * Sans public (pas encore repondu, ou passe), le circuit general, pour l'ecran comme pour la machine.
 */
export function circuitDu(p: ChoixPublic | null): Circuit {
  switch (p) {
    case 'machine':
      return {
        titre: t('De la forme au fichier prêt pour Design Space'),
        etapes: [
          etape('scene', t('Une forme ou une image'), t('Prise dans la bibliothèque, ou une image convertie en vecteurs.')),
          etape('machine', t('Préparée pour la machine'), t('Le tapis à l’écran, la taille réelle, des corrections proposées et annulables.')),
          etape('telecharger', t('Fichier prêt pour Design Space'), t('Pour la découpe, le stylo ou Print Then Cut.'))
        ]
      };
    case 'retouche':
      return {
        titre: t('De votre dessin au fichier prêt'),
        etapes: [
          etape('ouvrir', t('Un dessin ou une image'), t('Un SVG, un PDF, ou une photo à convertir en vecteurs.')),
          etape('palette', t('Retouché dans l’éditeur'), t('Couleurs, formes, texte : chaque geste se défait.')),
          etape('telecharger', t('Un fichier prêt pour l’écran'), t('En SVG, PNG, PDF ou dans un autre format.'))
        ]
      };
    case 'integration':
      return {
        titre: t('Du SVG de votre page au SVG retouché'),
        etapes: [
          etape('code', t('Le SVG de votre page'), t('Vous le donnez à ouvrir() ou au composant.')),
          etape('palette', t('Retouché dans l’éditeur'), t('En plein écran, par-dessus votre page.')),
          etape('coche', t('Rendu à votre code'), t('onEnregistrer reçoit le SVG propre.'))
        ]
      };
    default:
      return {
        titre: t('De l’image au fichier prêt'),
        etapes: [
          etape('image', t('Une forme, un dessin ou une image'), t('Prise dans la bibliothèque, ouverte, ou convertie en vecteurs.')),
          etape('palette', t('Retouché ou préparé'), t('Dans l’éditeur, comme dans un logiciel de dessin.')),
          etape('telecharger', t('Un fichier prêt'), t('Pour l’écran ou pour une machine de découpe.'))
        ]
      };
  }
}

// ---------------------------------------------------------------------------------------------
// L'embarquement montre aux integrateurs : ce que fait `ouvrir`, un extrait de code, et la demonstration qui l'execute.
// ---------------------------------------------------------------------------------------------

/**
 * Ce que la demonstration passe a l'editeur, comme le ferait un hote : le meme objet ecrit l'extrait de code. Le libelle est un
 * accesseur, traduit a la lecture (ADR-0042) : l'extrait montre alors le libelle dans la langue de la page, comme un hote l'ecrirait.
 */
export const DEMO_HOTE: { readonly nom: 'logo'; readonly libelleEnregistrer: string } = { nom: 'logo', get libelleEnregistrer() { return t('Mettre à jour le logo'); } };

/**
 * Les options principales de `ouvrir` (docs/integration.md) : un nom, ce qu'elle fait en une phrase. Des donnees : la phrase est la
 * cle, traduite a l'affichage (`insecables(t(phrase))`), comme celles des publics.
 */
export const OPTIONS_INTEGRATION: ReadonlyArray<readonly [string, string]> = [
  ['svg', 'Le texte du SVG à retoucher, tel quel.'],
  ['onEnregistrer', 'Reçoit le SVG retouché, déjà nettoyé, quand la personne valide.'],
  ['libelleEnregistrer', 'Le nom du bouton de fin : « Valider », « Mettre à jour le logo »…'],
  ['visite', 'La visite guidée de l’éditeur ; désactivée par défaut.'],
  ['stockage', 'Où garder les versions nommées : le vôtre, celui du navigateur, ou rien.'],
  ['baseAnnexes', 'Le dossier où trouver la bibliothèque et les fontes, chargées au premier besoin.']
];

/**
 * L'extrait de code montre et copie : le bundle (le plus simple, docs/integration.md), avec les options de la demonstration. Du
 * JavaScript : aucune typographie francaise n'y entre (une espace insecable dans une chaine changerait le libelle).
 */
export function codeIntegration(): string {
  return [
    '<script src="editeur-svg-embarque.js"></script>',
    '<script>',
    '  EditeurSvg.ouvrir({',
    '    svg: monSvg,',
    '    nom: \'' + DEMO_HOTE.nom + '\',',
    '    libelleEnregistrer: \'' + DEMO_HOTE.libelleEnregistrer + '\',',
    '    onEnregistrer: function (svg) { monSvg = svg; }',
    '  });',
    '</script>'
  ].join('\n');
}

/** Le guide d'integration complet dans le depot du produit, quand le build le connait. */
export const CHEMIN_GUIDE = 'docs/integration.md';

/**
 * L'adresse du guide : le fichier dans le depot declare par package.json (le build la pose), ou, sans depot connu (les tests, des
 * sources importees telles quelles), l'ancre des options dans la page meme. Aucune adresse publique n'est inventee.
 */
export function lienGuide(depot: string | undefined): string {
  const d = depot?.trim().replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/+$/, '') ?? '';
  return /^https:\/\/[\w.-]+\/[\w.-]+\/[\w.-]+$/.test(d) ? d + '/blob/main/' + CHEMIN_GUIDE : '#options-integration';
}

/** Ce que la page « hote » de la demonstration dit avoir recu : ce que `onEnregistrer` recevrait chez vous. */
export const phraseRecu = (svg: string): string =>
  insecables(t('Votre page a reçu le SVG retouché par onEnregistrer : {caracteres}, déjà nettoyé.', { caracteres: pluriel(svg.length, 'caractère') }));

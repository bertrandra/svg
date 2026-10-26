// Fabrique le contexte des actions : tous les verbes de l'editeur, faits une fois par editeur. Ils ne
// capturent aucun etat : ce qu'ils doivent savoir (le dessin, la selection, l'outil…) se lit par `lire`,
// qui rend l'etat du dernier rendu. Les setters de React, eux, sont stables par construction.

import type { Dispatch, RefObject, SetStateAction } from 'react';
import { bornerParametres, contenuEnDessin, dessinableEnPoints, reposerContenu, garderTextes, MSG_POINTS_IMAGE, poidsDessin, sansTexte, type DessinSvg, type Forme, type ParametresFormes, type PoliceTexte, type Style } from '../engine/editionSvg.js';
import { suivreDispositions } from '../engine/texte/disposition.js';
import type { Glyphes } from '../engine/texte.js';
import { annuler, avancer, clore, limitePourTaille, retablir, type Historique } from '../util/historique.js';
import { actionsEdition, type EtatLu } from './actions.js';
import { actionsTrace } from './actionsTrace.js';
import { actionsGroupes } from './actionsGroupes.js';
import { actionsContenus } from './actionsContenus.js';
import { actionsProduction, cadreDeVue, svgDocument } from './actionsProduction.js';
import type { ChoixProduction } from '../model/contextes.js';
import type { Stockage } from '../io/stockage.js';
import type { Annonce } from './annonces.js';
import { garderVersions, idVersion, type Version } from './session.js';
import type { ActionsEditeur, ContexteEdition, EtatEnregistrement, Fond, Modele, OptionsFin, Outil, Point, SuiteCricut, Tiroir } from './typesEditeur.js';
import { garderModele, phraseModele } from './modele.js';
import { aEnregistrer, perdrait } from './enregistrement.js';
import { lentilleDe, type Lentille } from './lentille.js';
import { RAISONS_LENTILLE } from './phrasesContenus.js';
import { actionsContexte } from './actionsContexte.js';
import type { Focale } from '../engine/navigation.js';
import type { Aimant } from '../engine/transformations.js';
import type { RegleZone } from '../engine/selection.js';

/** L'etat du moment, avec ce que seuls les verbes d'etat lisent en plus. */
export interface EtatDuMoment extends EtatLu {
  modifie: boolean; refaisable: boolean; versions: readonly Version[]; fermer: () => void; stockage: Stockage | null;
  brouillon?: ((svg: string) => unknown) | undefined; productionModifiee: boolean; fin: OptionsFin; suiteCricut: SuiteCricut; apercuMachine: boolean;
  /** L'etat d'enregistrement que l'hote annonce (le site, ADR-0030) ; absent chez un hote qui ne garde rien. */
  enregistrement?: EtatEnregistrement | null | undefined;
  /** L'hote a fixe le modele : le reglage ne change pas (ADR-0012, annexe 5 §3). Absent : faux. */
  modeleFixe?: boolean | undefined;
  /** Le contexte d'edition du moment (ADR-0012, annexe 6 §2). Absent : la racine. */
  contexte?: ContexteEdition | null | undefined;
}

/** Les setters de l'editeur (React les garde d'une identite stable). */
export interface Setters {
  poserH: Dispatch<SetStateAction<Historique<DessinSvg>>>; choisir: Dispatch<SetStateAction<string[]>>;
  poserOutilBrut: Dispatch<SetStateAction<Outil>>; poserPoint: Dispatch<SetStateAction<number | null>>; poserStyle: Dispatch<SetStateAction<Style>>;
  poserParametres: Dispatch<SetStateAction<ParametresFormes>>; poserDemandeFormes: Dispatch<SetStateAction<number>>;
  poserTrace: Dispatch<SetStateAction<readonly Point[]>>; poserPresse: Dispatch<SetStateAction<readonly Forme[]>>;
  poserGrille: Dispatch<SetStateAction<boolean>>; poserAimants: Dispatch<SetStateAction<boolean>>; poserLisserBooleens: Dispatch<SetStateAction<boolean>>;
  poserGuides: Dispatch<SetStateAction<readonly Aimant[]>>;
  poserVersions: Dispatch<SetStateAction<readonly Version[]>>; poserTiroir: Dispatch<SetStateAction<Tiroir>>; poserContours: Dispatch<SetStateAction<boolean>>;
  poserFond: Dispatch<SetStateAction<Fond>>; dire: Dispatch<SetStateAction<string>>; poserQuitter: Dispatch<SetStateAction<boolean>>;
  poserCurseur: Dispatch<SetStateAction<Point | null>>; poserFocale: Dispatch<SetStateAction<Focale | null>>; poserAnnonce: Dispatch<SetStateAction<Annonce>>;
  poserProduction: Dispatch<SetStateAction<ChoixProduction>>; poserSuiteCricut: Dispatch<SetStateAction<SuiteCricut>>;
  poserApercuMachine: Dispatch<SetStateAction<boolean>>;
  poserRegleZone: Dispatch<SetStateAction<RegleZone>>;
  poserModele: Dispatch<SetStateAction<Modele>>; poserContexte: Dispatch<SetStateAction<ContexteEdition | null>>;
  poserDeplies: Dispatch<SetStateAction<ReadonlySet<string>>>;
  toile: RefObject<HTMLDivElement | null>;
}

export function creerActions(lire: () => EtatDuMoment, s: Setters): ActionsEditeur {
  let compteur = 0;
  // Les glyphes des polices chargees (posees par le contexte du texte) : de quoi recomposer un texte pose sur une forme qui change.
  let glyphesDe: ((p: PoliceTexte) => Glyphes | null) | null = null;
  // La garde du texte vivant (ADR-0022) : un outil qui change le trace d'un texte sans le connaitre le vectorise ; ses contours
  // restent, il ne se retape plus. Les actions qui le peuvent le disent (phrasesTexte.ts). Puis le lien des textes poses (ADR-0031) :
  // un texte dont la forme a change se recompose sur elle, dans la meme entree d'historique ; sans forme, il redevient libre.
  const suivre = (avant: DessinSvg, apres: DessinSvg): DessinSvg => suivreDispositions(avant, garderTextes(avant, apres).dessin, p => glyphesDe?.(p) ?? null).dessin;
  // Dans une decoupe ou un masque (paquet 8-D), l'operation recoit le dessin de travail de la lentille, et ce qu'elle rend reprend sa
  // place dans le groupe : un geste reste UNE entree d'historique du dessin complet. La lentille est celle du moment de l'appel.
  const parLentille = (complet: DessinSvg, l: Lentille, f: (d: DessinSvg) => DessinSvg): DessinSvg => {
    const vue = contenuEnDessin(complet, l.groupe, l.genre);
    return vue ? reposerContenu(complet, l.groupe, l.genre, suivre(vue, f(vue))).dessin : complet;
  };
  const avancerAvec = (x: Historique<DessinSvg>, d: DessinSvg, cle: string | null) => avancer(x, d, cle, limitePourTaille(poidsDessin(d)));
  const appliquer: ActionsEditeur['appliquer'] = (f, cle = null) => {
    const l = lentilleDe(lire().contexte);
    s.poserH(x => avancerAvec(x, l ? parLentille(x.present, l, f) : suivre(x.present, f(x.present)), cle));
  };
  // Ce qui vise le dessin entier meme dans une lentille : liberer ou inverser son contenu, corriger un constat de la machine.
  const appliquerComplet = (f: (d: DessinSvg) => DessinSvg, cle: string | null = null) => s.poserH(x => avancerAvec(x, suivre(x.present, f(x.present)), cle));
  const finir = () => s.poserH(x => clore(x));
  // Changer d'outil, de quelque facon que ce soit, rend aussi le reticule du clavier : il n'a de sens que pour l'outil qui l'a pose.
  const poserOutilBrut = (o: Outil) => { s.poserOutilBrut(o); s.poserCurseur(null); };
  const poserOutil = (o: Outil) => {
    // Modifier les points d'un texte vivant, c'est le vectoriser d'abord (ADR-0022) : on le fait, une entree d'historique, et on le dit.
    const seule = o === 'points' ? lire().formeSeule : null;
    // Les points d'une image ne se modifient pas (ADR-0012, etape 12) : l'outil reste ce qu'il etait, et on dit quoi faire.
    if (seule && !dessinableEnPoints(seule)) { dire(MSG_POINTS_IMAGE); return; }
    // Le texte ne passe pas par la lentille (paquet 8-D) : une decoupe n'en garderait que les contours, un masque l'ecrit en contours.
    if (o === 'texte' && lentilleDe(lire().contexte)) { dire(RAISONS_LENTILLE.texte); return; }
    if (seule?.texte && !seule.verrouille) {
      appliquer(d => ({ ...d, formes: d.formes.map(f => (f.id === seule.id ? sansTexte(f) : f)) }));
      dire('Texte vectorisé pour modifier ses points : il n’est plus modifiable comme texte. Ctrl+Z le rend.');
    }
    poserOutilBrut(o); s.poserTrace([]); s.poserPoint(null);
  };
  const remettreAZero = () => { s.poserPoint(null); s.poserTrace([]); s.dire(''); };
  // La region vocale repete une phrase identique : le rang change a chaque annonce, pas le texte.
  const annoncer = (t: string) => { if (t) s.poserAnnonce(a => ({ texte: t, rang: a.rang + 1 })); };
  // Tout ce que l'editeur dit dans la barre d'etat, il le dit aussi a voix haute.
  const dire = (t: string) => { s.dire(t); annoncer(t); };
  const poserVersions = (v: readonly Version[]) => { s.poserVersions(v); garderVersions(lire().stockage, v); };
  const leviers = { appliquer, choisir: s.choisir, poserPoint: s.poserPoint, poserOutil, poserOutilBrut, poserTrace: s.poserTrace, poserPresse: s.poserPresse, dire, annoncer, toile: s.toile };
  const metier = actionsEdition(lire, leviers);
  const trace = actionsTrace(lire, leviers);
  const groupes = actionsGroupes(lire, leviers);
  const contexte = actionsContexte(lire, s, dire, annoncer);
  // Le contexte de production juge et corrige le dessin entier, meme depuis une decoupe ou un masque.
  const lireComplet = () => { const e = lire(); return e.complet ? { ...e, dessin: e.complet } : e; };
  const production = actionsProduction(lireComplet, { ...leviers, appliquer: appliquerComplet }, { poserProduction: s.poserProduction, poserSuiteCricut: s.poserSuiteCricut, poserApercuMachine: s.poserApercuMachine });
  return {
    appliquer, finir, poserOutil,
    poserGlyphes: g => { glyphesDe = g; },
    faire: (f, texte = '') => { appliquer(f); dire(texte); },
    // Un geste qui n'a rien produit (un rectangle sans surface) retire l'entree qu'il avait ouverte.
    annulerGeste: cle => s.poserH(x => (x.cle === cle ? clore(annuler(x)) : x)),
    defaire: () => {
      if (!lire().modifie) { annoncer('Rien à annuler.'); return; }
      s.poserH(x => annuler(clore(x)));
      remettreAZero();
      annoncer('Annulé.');
    },
    refaire: () => {
      if (!lire().refaisable) { annoncer('Rien à rétablir.'); return; }
      s.poserH(x => retablir(x));
      remettreAZero();
      annoncer('Rétabli.');
    },
    nouvelleCle: () => 'geste-' + ++compteur,
    poserParametres: p => s.poserParametres(x => bornerParametres({ ...x, ...p })),
    ouvrirFormes: () => s.poserDemandeFormes(n => n + 1),
    dire, annoncer, poserCurseur: s.poserCurseur, poserFocale: s.poserFocale, choisir: s.choisir, poserPoint: s.poserPoint, poserStyle: s.poserStyle, poserTrace: s.poserTrace,
    poserGrille: s.poserGrille, poserAimants: s.poserAimants, poserLisserBooleens: s.poserLisserBooleens, poserGuides: s.poserGuides, poserTiroir: s.poserTiroir, poserContours: s.poserContours, poserFond: s.poserFond,
    demanderFermeture: () => { const e = lire(); if (perdrait(e.modifie, e.enregistrement)) s.poserQuitter(true); else e.fermer(); },
    fermer: () => lire().fermer(),
    terminer: () => {
      const e = lire();
      // Rien n'a change : la page referme sans rien reecrire (la fiche garde le fichier tel qu'il est venu) ; ailleurs, on le dit.
      if (aEnregistrer(e.modifie, e.productionModifiee, e.enregistrement)) metier.enregistrerTout();
      else if (e.fin.fermerSansModification) e.fermer();
      else dire(e.enregistrement?.etat === 'en-cours' ? 'Enregistrement en cours…' : 'Aucune modification à enregistrer.');
    },
    enregistrerEtFermer: () => { if (metier.enregistrerTout()) lire().fermer(); },
    garderBrouillon: () => {
      const e = lire();
      // Chez un hote qui garde des projets (le site, ADR-0030), Ctrl+S est le geste d'enregistrer : il rend le dessin, sans fermer.
      if (e.fin.ctrlSEnregistre) {
        if (aEnregistrer(e.modifie, e.productionModifiee, e.enregistrement)) metier.enregistrerTout();
        else dire(e.enregistrement?.etat === 'en-cours' ? 'Enregistrement en cours…' : 'Aucune modification : rien à enregistrer.');
        return;
      }
      // Ctrl+S ne ferme jamais : fermer est un geste a part (le bouton de fin, Echap). Sans brouillon a garder, on dit ou va le dessin.
      if (!e.brouillon) { dire('Ctrl+S ne garde rien ici : « ' + e.fin.libelle + ' » rend votre dessin.'); return; }
      if (!e.modifie && !e.productionModifiee) { dire('Aucune modification : rien à garder.'); return; }
      // Un brouillon qui rend faux n'a pas ete garde (stockage refuse ou plein) : on ne pretend pas le contraire.
      dire(e.brouillon(svgDocument(e.complet ?? e.dessin, e.production)) === false ? 'Le brouillon n’a pas pu être gardé : ce navigateur refuse de l’écrire.' : 'Brouillon gardé.');
    },
    ajuster: () => { const e = lire(), cadre = cadreDeVue(e.complet ?? e.dessin, e.production); if (cadre) e.vues.cadrer(cadre); else e.vues.ajuster(); },
    ajusterAuDessin: () => lire().vues.ajuster(),
    continuerEdition: () => s.poserQuitter(false),
    garderVersion: (nom, svg) => {
      const quand = Date.now(), { versions } = lire();
      poserVersions([{ id: idVersion(quand, versions.length), nom, svg, quand }, ...versions]);
      dire('Version « ' + nom + ' » gardée dans ce navigateur.');
    },
    supprimerVersion: id => poserVersions(lire().versions.filter(v => v.id !== id)),
    poserModele: m => {
      const e = lire();
      if (e.modeleFixe) return;
      s.poserModele(m);
      dire(phraseModele(m, garderModele(e.stockage, m)));
    },
    poserRegleZone: r => {
      s.poserRegleZone(r);
      dire(r === 'touche' ? 'Le cadre et le lasso prennent les formes qu’ils touchent, même en partie.' : 'Le cadre et le lasso ne prennent que les formes entièrement dedans.');
    },
    ...metier, ...trace, ...production, ...groupes, ...contexte,
    // Les contenus (ADR-0012, etape 8) : decoupes, masques, effets, images inserees ; modifier une decoupe ou un masque (paquet 8-D).
    ...actionsContenus(lire, { ...leviers, appliquerComplet, annoncer }, contexte.poserContexte, s.poserContexte)
  };
}

// Fabrique le contexte des actions : tous les verbes de l'editeur, faits une fois par editeur. Ils ne
// capturent aucun etat : ce qu'ils doivent savoir (le dessin, la selection, l'outil…) se lit par `lire`,
// qui rend l'etat du dernier rendu. Les setters de React, eux, sont stables par construction.

import type { Dispatch, RefObject, SetStateAction } from 'react';
import { garderTextes, sansTexte, type DessinSvg, type Forme, type Style } from '../engine/editionSvg.js';
import { annuler, avancer, clore, limitePourTaille, retablir, type Historique } from '../util/historique.js';
import { actionsEdition, type EtatLu } from './actions.js';
import { actionsTrace } from './actionsTrace.js';
import { actionsProduction, cadreDeVue, svgDocument } from './actionsProduction.js';
import type { ChoixProduction } from '../model/contextes.js';
import type { Stockage } from '../io/stockage.js';
import type { Annonce } from './annonces.js';
import { garderVersions, idVersion, type Version } from './session.js';
import type { ActionsEditeur, EtatEnregistrement, Fond, OptionsFin, Outil, Point, SuiteCricut, Tiroir } from './typesEditeur.js';
import { aEnregistrer, perdrait } from './enregistrement.js';
import type { Focale } from '../engine/navigation.js';
import type { Aimant } from '../engine/transformations.js';

/** L'etat du moment, avec ce que seuls les verbes d'etat lisent en plus. */
export interface EtatDuMoment extends EtatLu {
  modifie: boolean; refaisable: boolean; versions: readonly Version[]; fermer: () => void; stockage: Stockage | null;
  brouillon?: ((svg: string) => unknown) | undefined; productionModifiee: boolean; fin: OptionsFin; suiteCricut: SuiteCricut; apercuMachine: boolean;
  /** L'etat d'enregistrement que l'hote annonce (le site, ADR-0030) ; absent chez un hote qui ne garde rien. */
  enregistrement?: EtatEnregistrement | null | undefined;
}

/** Les setters de l'editeur (React les garde d'une identite stable). */
export interface Setters {
  poserH: Dispatch<SetStateAction<Historique<DessinSvg>>>; choisir: Dispatch<SetStateAction<string[]>>;
  poserOutilBrut: Dispatch<SetStateAction<Outil>>; poserPoint: Dispatch<SetStateAction<number | null>>; poserStyle: Dispatch<SetStateAction<Style>>;
  poserTrace: Dispatch<SetStateAction<readonly Point[]>>; poserPresse: Dispatch<SetStateAction<readonly Forme[]>>;
  poserGrille: Dispatch<SetStateAction<boolean>>; poserAimants: Dispatch<SetStateAction<boolean>>; poserLisserBooleens: Dispatch<SetStateAction<boolean>>;
  poserGuides: Dispatch<SetStateAction<readonly Aimant[]>>;
  poserVersions: Dispatch<SetStateAction<readonly Version[]>>; poserTiroir: Dispatch<SetStateAction<Tiroir>>; poserContours: Dispatch<SetStateAction<boolean>>;
  poserFond: Dispatch<SetStateAction<Fond>>; dire: Dispatch<SetStateAction<string>>; poserQuitter: Dispatch<SetStateAction<boolean>>;
  poserCurseur: Dispatch<SetStateAction<Point | null>>; poserFocale: Dispatch<SetStateAction<Focale | null>>; poserAnnonce: Dispatch<SetStateAction<Annonce>>;
  poserProduction: Dispatch<SetStateAction<ChoixProduction>>; poserSuiteCricut: Dispatch<SetStateAction<SuiteCricut>>;
  poserApercuMachine: Dispatch<SetStateAction<boolean>>;
  toile: RefObject<HTMLDivElement | null>;
}

export function creerActions(lire: () => EtatDuMoment, s: Setters): ActionsEditeur {
  let compteur = 0;
  // La garde du texte vivant (ADR-0022) : un outil qui change le trace d'un texte sans le connaitre le vectorise ; ses contours
  // restent, il ne se retape plus. Les actions qui le peuvent le disent (phrasesTexte.ts).
  const appliquer: ActionsEditeur['appliquer'] = (f, cle = null) => { s.poserH(x => { const d = garderTextes(x.present, f(x.present)).dessin; return avancer(x, d, cle, limitePourTaille(d.formes.length)); }); };
  const finir = () => s.poserH(x => clore(x));
  // Changer d'outil, de quelque facon que ce soit, rend aussi le reticule du clavier : il n'a de sens que pour l'outil qui l'a pose.
  const poserOutilBrut = (o: Outil) => { s.poserOutilBrut(o); s.poserCurseur(null); };
  const poserOutil = (o: Outil) => {
    // Modifier les points d'un texte vivant, c'est le vectoriser d'abord (ADR-0022) : on le fait, une entree d'historique, et on le dit.
    const seule = o === 'points' ? lire().formeSeule : null;
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
  const production = actionsProduction(lire, leviers, { poserProduction: s.poserProduction, poserSuiteCricut: s.poserSuiteCricut, poserApercuMachine: s.poserApercuMachine });
  return {
    appliquer, finir, poserOutil,
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
      dire(e.brouillon(svgDocument(e.dessin, e.production)) === false ? 'Le brouillon n’a pas pu être gardé : ce navigateur refuse de l’écrire.' : 'Brouillon gardé.');
    },
    ajuster: () => { const e = lire(), cadre = cadreDeVue(e.dessin, e.production); if (cadre) e.vues.cadrer(cadre); else e.vues.ajuster(); },
    ajusterAuDessin: () => lire().vues.ajuster(),
    continuerEdition: () => s.poserQuitter(false),
    garderVersion: (nom, svg) => {
      const quand = Date.now(), { versions } = lire();
      poserVersions([{ id: idVersion(quand, versions.length), nom, svg, quand }, ...versions]);
      dire('Version « ' + nom + ' » gardée dans ce navigateur.');
    },
    supprimerVersion: id => poserVersions(lire().versions.filter(v => v.id !== id)),
    ...metier, ...trace, ...production
  };
}

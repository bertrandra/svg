// L'editeur SVG plein ecran : retoucher un dessin vectoriel comme dans un logiciel de dessin.
// Selection, deplacement, mise a l'echelle, points et poignees, outils de trace (rectangle, ellipse,
// etoile, ligne, plume), couleurs d'un nuancier, empilement, alignement, nettoyage du trace,
// insertion depuis la bibliotheque de formes, et un historique qui annule chaque geste. Tout le
// calcul est dans `engine/editionSvg.ts` ; ici, l'affichage et les gestes.
//
// Le composant ne connait aucun magasin : il recoit le SVG, un nuancier facultatif, la bibliotheque
// facultative, et rend le SVG retouche a `enregistrer`. C'est ce qui le rend reutilisable.
//
// L'etat de l'editeur (etatEditeur.ts) se donne aux panneaux par trois contextes : le dessin, les
// actions, l'interface (contexteEditeur.tsx). Un panneau lit ce qui le concerne.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DessinSvg, MarqueProduction } from '../engine/editionSvg.js';
import type { ChoixProduction } from '../model/contextes.js';
import type { Bibliotheque } from '../io/bibliotheque.js';
import type { Stockage } from '../io/stockage.js';
import { Cadre } from './Cadre.js';
import { FournisseurSections } from './commun/Section.js';
import { FournisseurEditeur } from './contexteEditeur.js';
import { FournisseurReperes, FournisseurVisite, type OptionsGuide } from './contexteGuide.js';
import { FournisseurStockage } from './contexteStockage.js';
import { ContextePolicesEnLigne } from './contexteTexte.js';
import { useEtatEditeur } from './etatEditeur.js';
import { useFocusEditeur } from './focusEditeur.js';
import { lireDessinMemo } from './lecture.js';
import { estHex } from './aidesEditeur.js';
import type { ActionHote, EtatEnregistrement, EtatRendu, Modele, Teinte } from './typesEditeur.js';
import { modeleRetenu } from './modele.js';
import { preparerLangue } from '../io/langue.js';
import { definirLangue, dictionnairePose, langue, type Langue } from '../util/i18n.js';

// Les types que les autres zones lisent ici : ils vivent dans typesEditeur.ts (types seuls, sans cycle).
export type { ActionHote, ActionsEditeur, EtatEnregistrement, EtatInterface, EtatRendu, Modele, ModeleDessin, Outil, OutilForme, Teinte, Vues } from './typesEditeur.js';

export interface ProprietesEditeur {
  /** Le SVG a retoucher, tel quel (ignore quand `dessin` est donne). */
  svg: string;
  /**
   * Le dessin du modele a ouvrir tel quel, sans relire de SVG : un projet rouvert (le site, ADR-0030). Le SVG ecrit ensuite est
   * celui qu'ecrivait ce dessin avant son enregistrement, octet pour octet.
   */
  dessin?: DessinSvg | undefined;
  /** Le titre de la fenetre. */
  titre: string;
  /** Le nom du fichier propose au telechargement, sans extension. */
  nom: string;
  /** Les couleurs proposees dans l'inspecteur et pour le remplacement d'une couleur partout. */
  nuancier?: readonly Teinte[];
  /** La bibliotheque de formes a inserer : deja chargee, ou a charger au premier besoin. */
  bibliotheque?: Bibliotheque | 'a-charger';
  fermer: () => void;
  /**
   * Recoit le SVG retouche, deja nettoye par `nettoyerSvg`, et l'etat du modele (le dessin, le contexte) : de quoi ecrire un projet
   * pour un hote qui en garde (le site, ADR-0030). Un hote qui ne veut que le SVG ignore le second argument.
   */
  enregistrer: (svg: string, etat: EtatRendu) => void;
  /**
   * Recoit le SVG du moment apres chaque modification (une seconde de repos), et a chaque Ctrl+S : de quoi reprendre apres un
   * rechargement. Rendre `false` dit que le brouillon n'a pas ete garde (l'editeur ne pretend pas le contraire).
   */
  brouillon?: (svg: string) => unknown;
  /**
   * Le libelle du bouton de fin, qui rend le dessin a `enregistrer` (defaut « Enregistrer »). La page dit « Terminer » ; un hote dit
   * le sien. L'editeur ne devine pas ou il est : il recoit son libelle.
   */
  libelleEnregistrer?: string;
  /** Le bouton de fin ferme l'editeur meme sans modification, sans rien reecrire (la page). Faux par defaut : il reste inactif et dit pourquoi. */
  fermerSansModification?: boolean;
  /**
   * Ou garder les versions nommees. Absent ou null : l'editeur ne garde rien (il ne connait aucun
   * magasin). La page lui donne celui du navigateur (`stockageNavigateur`), un hote ce qu'il veut.
   */
  stockage?: Stockage | null;
  /**
   * L'accueil guide (ADR-0019) : la visite de l'editeur, son menu, et les reperes de premiere rencontre. Absent : ni l'un ni
   * l'autre, l'editeur se tait (un hote qui ne l'a pas demande). La page le donne toujours ; l'embarquement sur `visite: true`.
   */
  guide?: OptionsGuide | null;
  /** Ce que la lecture du document d'origine n'a pas repris (un PDF, le texte d'un SVG mis en lettres) : dit avec ce que perd la lecture du SVG. */
  ignores?: readonly string[] | undefined;
  /**
   * Le contexte de production de depart (ADR-0013), quand le SVG n'en porte aucun : la page le donne pour le public « machine » de
   * l'accueil (ADR-0024). Une marque du SVG l'emporte toujours ; rien ne s'ecrit tant que la personne ne modifie pas le dessin.
   */
  production?: ChoixProduction | undefined;
  /**
   * Les polices libres telechargeables (ADR-0025) : l'outil Texte propose « Toutes les polices », et une police choisie se
   * telecharge apres l'accord de la personne. Faux par defaut : rien ne se telecharge, seules les dix fontes livrees se proposent.
   */
  policesEnLigne?: boolean;
  /**
   * Pour un hote qui garde des projets (le site, ADR-0030) : l'etat de l'enregistrement, que la barre affiche et qui dit s'il reste
   * quelque chose a enregistrer ou a perdre en fermant. Absent : la regle d'avant (une modification depuis l'ouverture).
   */
  enregistrement?: EtatEnregistrement | null | undefined;
  /** Appele a chaque changement du dessin ou du contexte, avec l'etat du moment : l'hote en deduit « enregistré » ou « modifié ». */
  changement?: ((etat: EtatRendu) => void) | undefined;
  /** Ctrl+S rend le dessin a `enregistrer` sans fermer (le site) ; faux par defaut : Ctrl+S garde un brouillon. */
  ctrlSEnregistre?: boolean | undefined;
  /** Des gestes de l'hote ajoutes au menu Fichier (« Enregistrer sous… ») ; chacun recoit l'etat du moment. */
  actionsHote?: readonly ActionHote[] | undefined;
  /**
   * Le modele de lecture du SVG (ADR-0012, annexe 5 §3) : `plat` (le contrat d'avant : les groupes se fondent) ou `riche` (groupes,
   * degrades, decoupes, masques, effets, images). Donne, il est fixe : le reglage du menu Edition ne se montre pas. Absent : le reglage garde dans
   * `stockage` (cle `svg.modele`), `modeleParDefaut` sans lui.
   */
  modele?: Modele | undefined;
  /**
   * Le modele quand ni `modele` ni le stockage n'en donnent un : `plat` si absent. La page et le site passent `MODELE_PAGE`
   * (ADR-0012, etape 14) ; un hote qui embarque ne le passe pas.
   */
  modeleParDefaut?: Modele | undefined;
  /**
   * La langue de l'interface (ADR-0042) : `fr` ou `en`, posee avant le premier rendu. Un hote qui a deja appele `preparerLangue`
   * (io/langue.ts) peut l'omettre ; donnee, le composant prepare la langue lui-meme (le dictionnaire anglais se charge sous la base
   * des annexes) et ne dessine rien avant. Absente, la langue courante, `fr` tant que personne n'en a pose une autre.
   */
  langue?: Langue | undefined;
}

/**
 * Une image enveloppee dans un SVG ne s'edite pas a plat : il faut d'abord la vectoriser. En modele riche, une image integree est une
 * feuille (ADR-0012, etape 12) : la lecture decide.
 */
export const editable = (svg: string, modele: Modele = 'plat'): boolean => modele === 'riche' || !/<image\b/i.test(svg);

const SANS_NUANCIER: readonly Teinte[] = [];

/** Un nuancier propre : codes en minuscules, sans doublon, et un nom a chaque teinte. */
export function nuancierPropre(teintes: readonly Teinte[]): Teinte[] {
  const vus = new Set<string>(), r: Teinte[] = [];
  for (const t of teintes) {
    // Un hote n'est pas type : une entree qui n'est pas { nom, hex } en textes est ecartee, jamais une exception.
    if (typeof t !== 'object' || t === null || typeof t.hex !== 'string') continue;
    const hex = t.hex.trim().toLowerCase();
    if (estHex(hex) && !vus.has(hex)) { vus.add(hex); r.push({ nom: (typeof t.nom === 'string' ? t.nom.trim() : '') || hex, hex }); }
  }
  return r;
}

/**
 * Le bouton qui ouvre l'editeur sur un SVG, et l'editeur quand il est ouvert. `enregistrer` recoit
 * le SVG retouche, deja nettoye. Une image enveloppee ne s'edite pas : il faut la vectoriser.
 */
export function BoutonEditerSvg({ svg, titre, nom, nuancier, bibliotheque, enregistrer, stockage }: Omit<ProprietesEditeur, 'fermer'>) {
  const [ouvert, ouvrir] = useState(false);
  const ok = editable(svg);
  return (
    <>
      <button type="button" className="discret" disabled={!ok} title={ok ? 'Ouvrir l’éditeur SVG plein écran' : 'Une image enveloppée ne s’édite pas : vectorisez-la d’abord.'}
        onClick={() => ouvrir(true)}>Éditer le SVG en plein écran</button>
      {ouvert ? <EditeurSvg svg={svg} titre={titre} nom={nom} nuancier={nuancier ?? SANS_NUANCIER} {...(bibliotheque === undefined ? {} : { bibliotheque })} {...(stockage === undefined ? {} : { stockage })} fermer={() => ouvrir(false)} enregistrer={(s, etat) => { enregistrer(s, etat); ouvrir(false); }} /> : null}
    </>
  );
}

export function EditeurSvg({ svg, dessin, titre, nom, nuancier: brut = SANS_NUANCIER, bibliotheque, fermer, enregistrer, brouillon, stockage, guide, ignores: avant, libelleEnregistrer, fermerSansModification, production: depart, policesEnLigne = false, modele: modeleHote, modeleParDefaut = 'plat', langue: langueHote, ...hote }: ProprietesEditeur) {
  // La langue de l'hote (ADR-0042), avant le premier rendu : tout de suite si son dictionnaire est la (fr, ou en deja charge),
  // sinon apres son chargement, et rien ne se dessine avant.
  const [languePrete, poserLanguePrete] = useState(() => {
    const prete = langueHote === undefined || dictionnairePose(langueHote);
    if (prete && langueHote !== undefined) definirLangue(langueHote);
    return prete;
  });
  useEffect(() => { if (!languePrete && langueHote !== undefined) void preparerLangue(langueHote).then(() => poserLanguePrete(true)); }, [languePrete, langueHote]);
  // Le modele de lecture : celui de l'hote, sinon le reglage garde, lu une fois a l'ouverture (le changer au menu vaut pour la suite).
  const [modele] = useState<Modele>(() => modeleHote ?? modeleRetenu(stockage ?? null, modeleParDefaut));
  // Un dessin donne (un projet rouvert) s'ouvre tel quel : sans marque lue, son contexte est le depart que l'hote donne.
  const lu = useMemo(() => {
    if (dessin) return { dessin, ignores: avant ?? [], production: undefined };
    const l = lireDessinMemo(svg, modele);
    return 'erreur' in l || !avant?.length ? l : { ...l, ignores: [...avant, ...l.ignores] };
  }, [svg, dessin, avant, modele]);
  const nuancier = useMemo(() => nuancierPropre(brut), [brut]);
  const racine = useRef<HTMLDivElement>(null);
  useFocusEditeur(racine);
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = avant; };
  }, []);
  if (!languePrete) return null;
  return createPortal(
    <div className="editeur-svg" ref={racine} role="dialog" aria-modal="true" aria-label={'Éditer : ' + titre} lang={langue()}>
      {'erreur' in lu ? (
        <div className="editeur-erreur">
          <p>{lu.erreur}</p>
          <button type="button" onClick={fermer}>Fermer</button>
        </div>
      ) : (
        <FournisseurStockage stockage={stockage ?? null}>
          <ContextePolicesEnLigne.Provider value={policesEnLigne}>
          <FournisseurReperes actif={!!guide}>
            <FournisseurSections><Atelier initial={lu.dessin} ignores={lu.ignores} production={lu.production} depart={depart} titre={titre} nom={nom} nuancier={nuancier} bibliotheque={bibliotheque ?? null} fermer={fermer} enregistrer={enregistrer} brouillon={brouillon} guide={guide ?? null}
              libelleEnregistrer={libelleEnregistrer} fermerSansModification={fermerSansModification} modele={modele} modeleFixe={modeleHote !== undefined} {...hote} /></FournisseurSections>
          </FournisseurReperes>
          </ContextePolicesEnLigne.Provider>
        </FournisseurStockage>
      )}
    </div>,
    document.body
  );
}

interface ProprietesAtelier {
  initial: DessinSvg; ignores: readonly string[]; production?: MarqueProduction | undefined; depart?: ChoixProduction | undefined; titre: string; nom: string; nuancier: readonly Teinte[]; bibliotheque: Bibliotheque | 'a-charger' | null;
  fermer: () => void; enregistrer: (svg: string, etat: EtatRendu) => void; brouillon?: ((svg: string) => unknown) | undefined; guide: OptionsGuide | null;
  libelleEnregistrer?: string | undefined; fermerSansModification?: boolean | undefined;
  enregistrement?: EtatEnregistrement | null | undefined; changement?: ((etat: EtatRendu) => void) | undefined;
  ctrlSEnregistre?: boolean | undefined; actionsHote?: readonly ActionHote[] | undefined;
  modele?: Modele | undefined; modeleFixe?: boolean | undefined;
}

/** Garde l'etat de l'editeur et le donne aux contextes ; le dessin de l'ecran est dans `Cadre`. */
function Atelier({ titre, nom, guide, ...p }: ProprietesAtelier) {
  const e = useEtatEditeur(p);
  return (
    <FournisseurEditeur dessin={e.modele} actions={e.actions} etat={e.etat}>
      <FournisseurVisite options={guide}>
        <Cadre titre={titre} nom={nom} toile={e.toile} svgRef={e.svgRef} />
      </FournisseurVisite>
    </FournisseurEditeur>
  );
}

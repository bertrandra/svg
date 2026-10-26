// Le site PHP (ADR-0030) : un hote de l'editeur, comme la page autonome ou l'embarquement. Il garde des projets sur le serveur
// (io/serveur.ts) ; l'editeur, lui, ne connait toujours aucun magasin (ADR-0010) : il recoit un dessin, rend un dessin, et le site
// en fait un projet. « Enregistrer » et Ctrl+S ecrivent le projet sans fermer, « Enregistrer sous… » le garde sous un autre nom,
// l'etat « enregistré / modifications non enregistrées » est dans la barre de l'editeur, et quitter la page avec des modifications
// demande confirmation au navigateur.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ecrireDessin } from '../engine/editionSvg.js';
import { avecNuancier } from '../engine/nuancier.js';
import { planDOuverture } from '../engine/preparation.js';
import { nomDeProjet, type TeinteProjet } from '../model/projet.js';
import { CHOIX_GENERIQUE } from '../model/contextes.js';
import { stockageNavigateur } from '../io/stockage.js';
import type { MetaProjet, Serveur } from '../io/serveur.js';
import { EditeurSvg, type ActionHote, type EtatEnregistrement, type EtatRendu } from '../zones/EditeurSvg.js';
import { EXEMPLE, NUANCIER_EXEMPLE, OuvrirSvg, Voies } from '../zones/Application.js';
import { SectionBibliotheque } from '../zones/Bibliotheque.js';
import { Vectoriser } from '../zones/Vectoriser.js';
import { useReception } from '../zones/OuvrirAdresse.js';
import { FournisseurStockage } from '../zones/contexteStockage.js';
import { FournisseurReperes, type OptionsGuide } from '../zones/contexteGuide.js';
import { DialogueCredits } from '../zones/Credits.js';
import { useFocusDialogue } from '../zones/focusEditeur.js';
import { lireNuancier } from '../zones/nuancier.js';
import { svgDeBibliotheque } from '../zones/provenanceBibliotheque.js';
import { phraseIgnores } from '../zones/aidesEditeur.js';
import { MODELE_PAGE, modeleRetenu, refusAvecRepli } from '../zones/modele.js';
import type { Modele } from '../zones/typesEditeur.js';
import type { TonMessage } from '../zones/commun/Message.js';
import { nomDeFichier } from '../util/texte.js';
import type { Voie } from '../zones/publics.js';
import { EcranProjets, type GestesProjets } from './Projets.js';
import { imageSource, memeEtat, projetAEnregistrer, travailDuProjet, travailDuSvg, type TravailOuvert } from './projetSite.js';

const STOCKAGE = stockageNavigateur();

/** Le modele de lecture du site, comme celui de la page : le reglage garde, son defaut sinon (ADR-0012, etape 14). */
const modeleDuSite = (): Modele => modeleRetenu(STOCKAGE, MODELE_PAGE);

const NUANCIER: readonly TeinteProjet[] = lireNuancier(NUANCIER_EXEMPLE);
const ORDRE: readonly Voie[] = ['svg', 'image', 'formes'];
const GUIDE: OptionsGuide = { demarrer: 'jamais', recuperer: 'enregistrer' };
/** Au-dela, la vignette (le SVG du dessin) ne part pas : la liste montre une case vide plutot qu'un aperçu de plusieurs Mo. */
const VIGNETTE_MAX = 200_000;
/**
 * Un projet vierge : un plan au format d'ecran ordinaire (que « Ajuster le plan » ou la machine changent ensuite), aucune forme. Un
 * dessin du modele, pas un SVG : la lecture d'un SVG refuse un document sans forme, l'editeur, lui, sait en partir.
 */
const vierge = (): TravailOuvert => ({ id: null, revision: null, nom: 'Sans titre', dessin: { vb: [0, 0, 800, 600], formes: [] }, production: CHOIX_GENERIQUE, nuancier: NUANCIER, polices: [], images: [] });

interface Edition { travail: TravailOuvert; cle: number }

/** La boite « Enregistrer sous… » : un nom, puis le projet neuf. Posee dans l'editeur, modale, Echap la ferme. */
function EnregistrerSous({ nom, valider, fermer }: { nom: string; valider: (nom: string) => void; fermer: () => void }) {
  const [valeur, poserValeur] = useState(nom);
  const voile = useRef<HTMLDivElement>(null), champ = useRef<HTMLInputElement>(null), idTitre = useId(), idChamp = useId();
  useFocusDialogue(voile, champ, fermer);
  const envoyer = (e: FormEvent) => { e.preventDefault(); valider(nomDeProjet(valeur)); };
  return createPortal(
    <div className="credits-voile" ref={voile}>
      <form className="credits-dialogue enregistrer-sous" role="dialog" aria-modal="true" aria-labelledby={idTitre} onSubmit={envoyer}>
        <h2 id={idTitre}>Enregistrer sous…</h2>
        <p className="aide">Un projet neuf, sous ce nom ; celui que vous avez ouvert reste tel qu’il était enregistré.</p>
        <label className="champ" htmlFor={idChamp}>
          <span>Nom du projet</span>
        </label>
        <input id={idChamp} ref={champ} type="text" value={valeur} maxLength={120} onChange={e => poserValeur(e.target.value)} />
        <div className="actions">
          <button type="submit" className="primaire">Enregistrer</button>
          <button type="button" onClick={fermer}>Annuler</button>
        </div>
      </form>
    </div>,
    document.querySelector<HTMLElement>('.editeur-svg') ?? document.body
  );
}

/** Les trois voies de la page autonome, pour commencer un projet d'un fichier, d'une image, d'une forme. */
function VoiesDuSite({ ouvrirSvg, image, dire }: {
  ouvrirSvg: (nom: string, texte: string, ignores?: readonly string[]) => void; image: { current: { nom: string; fichier: File } | null }; dire: (t: string, ton?: TonMessage) => void;
}) {
  const [voie, poserVoie] = useState<Voie>('svg');
  // Ouvrir depuis une adresse (ADR-0036) : le serveur du site va chercher le fichier (io/serveur.ts), la voie suit sa nature.
  const reception = useReception(poserVoie);
  return (
    <Voies ordre={ORDRE} voie={voie} poserVoie={poserVoie}>
      {{
        svg: <OuvrirSvg ouvrir={(nom, texte, ignores) => { image.current = null; ouvrirSvg(nom.replace(/\.(svg|pdf)$/i, '') || 'Sans titre', texte, ignores); }} dire={dire} essayer={() => ouvrirSvg('Exemple', EXEMPLE)} invitation={false} reception={reception} />,
        image: <Vectoriser ouvrir={(nom, svg) => ouvrirSvg(nom, svg)} surImage={(nom, fichier) => { image.current = { nom, fichier }; }} reception={reception} />,
        formes: <SectionBibliotheque active={voie === 'formes'} ouvrir={x => { image.current = null; ouvrirSvg(x.nom, svgDeBibliotheque(x.id, x.svg, x.source)); }} />
      }}
    </Voies>
  );
}

function PiedDuSite({ montrerCredits }: { montrerCredits: () => void }) {
  return (
    <footer className="pied">
      <p className="aide">Les formes de la bibliothèque viennent de <a href="https://game-icons.net" rel="noreferrer">game-icons.net</a> et de ses contributeurs (licence <a href="https://creativecommons.org/licenses/by/3.0/" rel="noreferrer">CC BY 3.0</a>) ; la vectorisation emploie vtracer (Vision Cortex). Le dessin se calcule dans votre navigateur ; seuls vos projets, et les polices que vous choisissez, passent par ce site.</p>
      <p className="aide"><button type="button" className="discret" onClick={montrerCredits}>À propos et crédits</button></p>
    </footer>
  );
}

export function Site({ serveur, csrf }: { serveur: Serveur; csrf: string }) {
  return <FournisseurStockage stockage={STOCKAGE}><FournisseurReperes actif={false}><Hote serveur={serveur} csrf={csrf} /></FournisseurReperes></FournisseurStockage>;
}

function Hote({ serveur, csrf }: { serveur: Serveur; csrf: string }) {
  const [projets, poserProjets] = useState<readonly MetaProjet[] | null>(null);
  const [message, poserMessage] = useState<{ texte: string; ton: TonMessage }>({ texte: '', ton: 'info' });
  const dire = useCallback((texte: string, ton: TonMessage = 'alerte') => poserMessage({ texte, ton }), []);
  const [edition, poserEdition] = useState<Edition | null>(null);
  const [enregistrement, poserEnregistrement] = useState<EtatEnregistrement>({ etat: 'enregistre' });
  const [sous, poserSous] = useState<EtatRendu | null>(null);
  const [credits, poserCredits] = useState(false);
  // Le dernier etat enregistre et l'etat du moment : le premier change a chaque enregistrement, le second a chaque geste.
  const reference = useRef<EtatRendu | null>(null), courant = useRef<EtatRendu | null>(null);
  const enCours = useRef(false), fermerApres = useRef(false), cles = useRef(0);
  const travail = useRef<TravailOuvert | null>(null);
  travail.current = edition?.travail ?? null;
  // L'image deposee dans la voie « Convertir une image » : gardee avec le projet qui en sort (meme nom), jamais envoyee seule.
  const image = useRef<{ nom: string; fichier: File } | null>(null);

  const recharger = useCallback(async () => {
    const r = await serveur.lister();
    // Sur l'ecran des projets, rien n'est ouvert : une session expiree ramene a la connexion, qui le dit.
    if (!r.ok && r.code === 'session' && !travail.current) { window.location.reload(); return; }
    if (r.ok) poserProjets(r.valeur); else { poserProjets(p => p ?? []); dire(r.message); }
  }, [serveur, dire]);
  useEffect(() => { void recharger(); }, [recharger]);

  // Quitter la page (fermer l'onglet, recharger) avec des modifications non enregistrees : le navigateur demande confirmation.
  const sale = edition !== null && enregistrement.etat !== 'enregistre';
  useEffect(() => {
    if (!sale) return;
    const avant = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avant);
    return () => window.removeEventListener('beforeunload', avant);
  }, [sale]);

  const ouvrirTravail = useCallback((ouvert: TravailOuvert) => {
    // Le nuancier (ADR-0037) et le tapis fixe d'un projet Cricut (ADR-0039), poses comme l'editeur les pose : la reference est ce qu'il ouvre.
    const t = { ...ouvert, dessin: planDOuverture(avecNuancier(ouvert.dessin), ouvert.production) };
    cles.current++;
    reference.current = t.id ? { dessin: t.dessin, production: t.production } : null;
    courant.current = { dessin: t.dessin, production: t.production };
    poserEnregistrement({ etat: t.id ? 'enregistre' : 'modifie' });
    poserEdition({ travail: t, cle: cles.current });
    dire('');
  }, [dire]);

  const ouvrirSvg = useCallback((nom: string, texte: string, ignores: readonly string[] = []) => {
    // Le modele de lecture (ADR-0012, annexe 5 §3) : le reglage garde, que le menu Edition de l'editeur change.
    void travailDuSvg(nom, texte, NUANCIER, ignores, modeleDuSite()).then(async t => {
      if ('erreur' in t) { dire(refusAvecRepli(texte, t.erreur, modeleDuSite())); return; }
      const img = image.current?.nom === nom ? await imageSource(nom, image.current.fichier) : null;
      ouvrirTravail(img ? { ...t, images: [img] } : t);
      if (t.ignores?.length) dire(phraseIgnores(t.ignores));
    });
  }, [dire, ouvrirTravail]);

  const fermerEdition = useCallback(() => {
    poserEdition(null); poserSous(null); reference.current = null; courant.current = null; fermerApres.current = false;
    void recharger();
  }, [recharger]);

  /** Enregistre l'etat rendu par l'editeur : par-dessus le projet ouvert, ou comme projet neuf (`nomNeuf`, « Enregistrer sous… »). */
  const enregistrer = useCallback(async (etat: EtatRendu, nomNeuf: string | null = null) => {
    const t = travail.current;
    if (!t || enCours.current) return;
    enCours.current = true;
    poserEnregistrement({ etat: 'en-cours' });
    const nom = nomNeuf ?? t.nom, neuf = nomNeuf !== null || !t.id || t.revision === null;
    const projet = projetAEnregistrer(neuf ? { ...t, creeLe: undefined, modifieLe: undefined } : t, etat, nom);
    const svg = ecrireDessin(etat.dessin, 3);
    const r = await serveur.enregistrer(projet, neuf || !t.id || t.revision === null ? null : { id: t.id, revision: t.revision }, svg.length <= VIGNETTE_MAX ? svg : null);
    enCours.current = false;
    if (!r.ok) {
      fermerApres.current = false;
      poserEnregistrement({ etat: 'echec', message: r.message });
      return;
    }
    const m = r.valeur;
    reference.current = etat;
    poserEdition(e => (e ? { ...e, travail: { ...e.travail, id: m.id, revision: m.revision, nom: m.nom, creeLe: m.creeLe, modifieLe: m.modifieLe, polices: projet.ressources.polices } } : e));
    poserEnregistrement({ etat: memeEtat(courant.current, etat) ? 'enregistre' : 'modifie', message: 'Projet « ' + m.nom + ' » enregistré.' });
    if (fermerApres.current) fermerEdition();
  }, [serveur, fermerEdition]);

  // Chaque geste de l'editeur : enregistre si l'on revient a l'etat enregistre (Ctrl+Z), modifie sinon ; rien ne change pendant un enregistrement.
  const changement = useCallback((etat: EtatRendu) => {
    courant.current = etat;
    if (enCours.current) return;
    const voulu: EtatEnregistrement['etat'] = memeEtat(reference.current, etat) ? 'enregistre' : 'modifie';
    poserEnregistrement(e => (e.etat === voulu && !e.message ? e : { etat: voulu }));
  }, []);

  // Fermer pendant un enregistrement attend sa fin : un echec garde l'editeur ouvert, et le dit, plutot que de perdre le travail.
  const fermer = useCallback(() => { if (enCours.current) fermerApres.current = true; else fermerEdition(); }, [fermerEdition]);

  const actionsHote = useMemo<readonly ActionHote[]>(() => [{ id: 'enregistrer-sous', libelle: 'Enregistrer sous…', faire: poserSous }], []);

  const ouvrirProjet = useCallback(async (m: MetaProjet) => {
    dire('Ouverture de « ' + m.nom + ' »…', 'info');
    const r = await serveur.ouvrir(m.id);
    if (!r.ok) { dire(r.message); return; }
    const lu = travailDuProjet(r.valeur.projet, m.id, r.valeur.revision);
    if ('erreur' in lu) { dire(lu.erreur); return; }
    ouvrirTravail(lu.travail);
    const notes = [
      ...(r.valeur.migre ? ['Ce projet venait d’un format plus ancien : il a été complété, et s’enregistrera dans le format actuel.'] : []),
      ...(lu.ecartees.length ? ['La police déposée « ' + lu.ecartees.join(', ') + ' » ne se lit plus : ses textes gardent leurs contours.'] : [])
    ];
    if (notes.length) dire(notes.join(' '), 'info');
  }, [serveur, dire, ouvrirTravail]);

  const gestes = useMemo<GestesProjets>(() => ({
    ouvrir: m => { void ouvrirProjet(m); },
    nouveau: () => { image.current = null; ouvrirTravail(vierge()); },
    renommer: async (m, nom) => {
      const r = await serveur.renommer(m.id, nom);
      if (!r.ok) { dire(r.message); return false; }
      dire('Projet renommé : « ' + r.valeur.nom + ' ».', 'info'); await recharger(); return true;
    },
    dupliquer: async m => {
      const r = await serveur.dupliquer(m.id);
      if (!r.ok) { dire(r.message); return false; }
      dire('Copie créée : « ' + r.valeur.nom + ' ».', 'info'); await recharger(); return true;
    },
    supprimer: async m => {
      const r = await serveur.supprimer(m.id);
      if (!r.ok) { dire(r.message); return false; }
      dire('Projet « ' + m.nom + ' » mis à la corbeille.', 'info'); await recharger(); return true;
    },
    vignette: m => serveur.adresseVignette(m)
  }), [serveur, dire, recharger, ouvrirProjet, ouvrirTravail]);

  const voies = <VoiesDuSite ouvrirSvg={ouvrirSvg} image={image} dire={dire} />;
  const pied = <PiedDuSite montrerCredits={() => poserCredits(true)} />;

  const t = edition?.travail;
  return (
    <>
      <EcranProjets projets={projets} message={message} gestes={gestes} csrf={csrf} voies={voies} pied={pied} />
      {credits ? <DialogueCredits fermer={() => poserCredits(false)} conteneur={document.body} /> : null}
      {edition && t ? (
        <EditeurSvg key={edition.cle} svg="" dessin={t.dessin} titre={t.nom} nom={nomDeFichier(t.nom, 'projet')} nuancier={t.nuancier} bibliotheque="a-charger" stockage={STOCKAGE} modeleParDefaut={MODELE_PAGE}
          guide={GUIDE} ignores={t.ignores} production={t.production} libelleEnregistrer="Enregistrer" policesEnLigne
          enregistrement={enregistrement} changement={changement} ctrlSEnregistre actionsHote={actionsHote}
          fermer={fermer} enregistrer={(_svg, etat) => { void enregistrer(etat); }} />
      ) : null}
      {edition && t && sous ? (
        <EnregistrerSous nom={t.nom + ' (copie)'} fermer={() => poserSous(null)} valider={nom => { const e = sous; poserSous(null); void enregistrer(e, nom); }} />
      ) : null}
    </>
  );
}

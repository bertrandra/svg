// La page autonome : ouvrir un SVG ou un PDF (fichier, glisser-deposer, code colle ou exemple), convertir une
// image en SVG, choisir une forme de la bibliotheque, editer en plein ecran, puis reprendre le
// resultat (apercu, telechargement, autres formats). L'editeur lui-meme ne sait rien de cette page :
// il recoit un SVG, un libelle pour son geste de fin (« Terminer »), et en rend un.
//
// L'accueil demande d'abord pour quoi l'on dessine (ADR-0024, AccueilPublic.tsx) et range la suite pour ce public : le circuit
// qui le concerne, l'ordre des voies, le contexte de production avec lequel l'editeur s'ouvre. Repondre n'est jamais obligatoire.

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react';
import { EditeurSvg } from './EditeurSvg.js';
import { SectionBibliotheque } from './Bibliotheque.js';
import { MenuAutresFormats, telechargerSvgPage } from './Exporter.js';
import { Icone, type NomIcone } from './icones.js';
import { Vectoriser } from './Vectoriser.js';
import { lireNuancier } from './nuancier.js';
import { phraseIgnores } from './aidesEditeur.js';
import { FournisseurStockage } from './contexteStockage.js';
import { FournisseurReperes, useReperes, type OptionsGuide } from './contexteGuide.js';
import { dateCourte, garderBrouillon, lireBrouillon, oublierBrouillon, type Brouillon } from './session.js';
import { stockageNavigateur } from '../io/stockage.js';
import { statistiques } from '../engine/editionSvg.js';
import { insecables, nomDeFichier } from '../util/texte.js';
import { lireDessinMemo } from './lecture.js';
import { garderModele, MODELE_PAGE, modeleRetenu, refusModele } from './modele.js';
import type { Modele } from './typesEditeur.js';
import { nettoyerSvgNomme } from '../util/svg.js';
import { DialogueCredits } from './Credits.js';
import { svgDeBibliotheque } from './provenanceBibliotheque.js';
import { Message, type TonMessage } from './commun/Message.js';
import { focusAuClavier } from './commun/focusClavier.js';
import { ChoixPagePdf, fichierPdf, usePdf, type OuvrirDessin } from './OuvrirPdf.js';
import { contientTexte, lettresDuSvg } from '../io/texteSvg.js';
import type { ChoixProduction } from '../model/contextes.js';
import { au } from '../util/tableaux.js';
import { uniteRetenue } from './actionsProduction.js';
import { CircuitPublic, ID_TITRE_SUITE, PanneauIntegration, QuestionPublic, usePublic } from './AccueilPublic.js';
import { adressesPermises, ChampAdresse, texteDuSvg, useAdresseDeVoie, useReception, type Dire, type Reception } from './OuvrirAdresse.js';
import { estAdresseSeule } from '../model/adresse.js';
import { circuitDu, DEMO_HOTE, ordreDesVoies, phraseRecu, phraseReglageMachine, productionDuPublic, type ChoixPublic, type Voie } from './publics.js';

/** Le dessin ouvert ; `production` : le contexte de depart propose a l'editeur (le public « machine »), quand il y en a un. */
interface Fichier { nom: string; svg: string; ignores?: readonly string[]; production?: ChoixProduction }

export const EXEMPLE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">'
  + '<rect x="16" y="16" width="208" height="128" rx="14" fill="#e9ecef"/>'
  + '<circle cx="80" cy="80" r="40" fill="#c81e28"/>'
  + '<path d="M130 120 L170 40 L210 120 Z" fill="#1428a0"/>'
  + '<path d="M40 130 Q120 90 200 130" fill="none" stroke="#15181d" stroke-width="4"/>'
  + '</svg>';

export const NUANCIER_EXEMPLE = 'Rouge #c81e28\nBleu #1428a0\nEncre #15181d\nBlanc #ffffff';

/** Chaque voie : son icone, son titre, son aide. Leur ordre vient du public (publics.ts, ordreDesVoies). */
const VOIES: Readonly<Record<Voie, readonly [NomIcone, string, string]>> = {
  svg: ['ouvrir', 'Ouvrir un SVG ou un PDF', 'Un fichier SVG ou PDF, du code collé, ou l’exemple'],
  image: ['image', 'Convertir une image', 'PNG, JPG… en vecteurs, fond détouré'],
  formes: ['scene', 'Bibliothèque', 'Plus de 4 000 formes par événement']
};

// La page est ce qui connait le magasin : le brouillon et les versions de l'editeur vont dans le navigateur.
const STOCKAGE = stockageNavigateur();

/** Le modele de lecture de la page : le reglage garde, son defaut sinon (ADR-0012, etape 14). */
const modeleDeLaPage = (): Modele => modeleRetenu(STOCKAGE, MODELE_PAGE);

const sansExtension = (nom: string) => nom.replace(/\.(svg|pdf)$/i, '').trim() || 'dessin';

/** La page : l'accueil, avec le stockage du navigateur pour ce qu'elle garde (brouillon, corrections) et pour l'editeur. */
export function Application() {
  return <FournisseurStockage stockage={STOCKAGE}><FournisseurReperes actif><Accueil /></FournisseurReperes></FournisseurStockage>;
}

function Accueil() {
  const [fichier, poserFichier] = useState<Fichier | null>(null);
  const [edition, poserEdition] = useState(false);
  const [nuancierTexte, poserNuancierTexte] = useState(NUANCIER_EXEMPLE);
  // Le public de l'accueil (ADR-0024) : retenu, ou null tant qu'on n'a pas repondu (la question est alors posee en tete).
  const [publicChoisi, choisirPublic] = usePublic(STOCKAGE);
  const [question, poserQuestion] = useState(publicChoisi === null);
  const [voie, poserVoie] = useState<Voie>(() => au(ordreDesVoies(publicChoisi), 0));
  // Un fichier ouvert depuis une adresse (ADR-0036) va a la voie de sa nature, decidee sur ses octets.
  const reception = useReception(poserVoie);
  // Un message a un ton : un avertissement (ambre, par defaut) ou une information (neutre), qui ne se ressemblent pas.
  const [message, poserMessage] = useState<{ texte: string; ton: TonMessage }>({ texte: '', ton: 'alerte' });
  const dire = useCallback((texte: string, ton: TonMessage = 'alerte') => poserMessage({ texte, ton }), []);
  const informer = useCallback((texte: string) => poserMessage({ texte, ton: 'info' }), []);
  const [credits, poserCredits] = useState(false);
  const [brouillon, poserBrouillon] = useState<Brouillon | null>(() => lireBrouillon(STOCKAGE));
  // La demonstration des integrateurs : l'editeur ouvert comme un hote l'ouvrirait, et ce que la page « hote » en a recu.
  const [demo, poserDemo] = useState(false);
  const [recu, poserRecu] = useState('');
  // La visite guidee ne s'ouvre d'elle-meme que si on l'a demandee (« Essayer avec la visite guidée ») : ouvrir l'exemple
  // tout court ouvre l'exemple, rien d'autre (ADR-0019). Le menu Aide de l'editeur la rejoue.
  const [visiteDemandee, demanderVisite] = useState(false);
  const guide = useMemo<OptionsGuide>(() => ({
    demarrer: visiteDemandee ? 'toujours' : 'jamais',
    recuperer: 'telecharger',
    // Une suite de la fin de visite : l'editeur s'est enregistre et ferme, la voie « Convertir une image » prend la main.
    convertir: () => { poserVoie('image'); requestAnimationFrame(() => document.getElementById('voie-image')?.focus()); }
  }), [visiteDemandee]);
  const nuancier = useMemo(() => lireNuancier(nuancierTexte), [nuancierTexte]);
  // Chaque modification dans l'editeur laisse un brouillon (et Ctrl+S) : un rechargement ne perd rien. Faux : le navigateur a refuse.
  const garder = useCallback((svg: string) => (fichier ? garderBrouillon(STOCKAGE, fichier.nom, svg, Date.now()) : false), [fichier]);
  // Quand l'editeur rend un dessin (« Terminer » apres une modification), le focus va au telechargement de la fiche plutot qu'au
  // bouton qui l'avait ouvert, plus bas : Entree suffit a recuperer le fichier. Fermer sans rien rendre (Echap, abandon) rend le
  // focus a ce bouton, comme l'editeur le fait chez tout hote (ADR-0011).
  const telecharger = useRef<HTMLButtonElement>(null);
  const [retour, poserRetour] = useState(0);
  useEffect(() => { if (retour) telecharger.current?.focus(); }, [retour]);

  // Repondre (ou passer) range l'accueil pour ce public et y mene le focus : le titre de ce qui suit dit ce qui a change.
  const repondre = useCallback((c: ChoixPublic) => {
    choisirPublic(c);
    poserQuestion(false);
    poserVoie(au(ordreDesVoies(c), 0));
    requestAnimationFrame(() => document.getElementById(ID_TITRE_SUITE)?.focus());
  }, [choisirPublic]);
  const rouvrir = useCallback(() => {
    poserQuestion(true);
    requestAnimationFrame(() => (document.querySelector<HTMLElement>('.publics .public.actuel') ?? document.querySelector<HTMLElement>('.publics .public'))?.focus());
  }, []);
  // Le contexte de depart du public « machine » : Cricut, dans l'unite retenue (le millimetre par defaut, ADR-0013).
  const depart = (): ChoixProduction | null => productionDuPublic(publicChoisi, uniteRetenue(STOCKAGE));

  /**
   * Ouvre un texte SVG dans l'editeur, ou dit pourquoi il ne s'ouvre pas. `ignores` : ce que la lecture du document d'origine (un
   * PDF, ou le texte du SVG mis en lettres) n'a pas repris, dit avec ce que la lecture du SVG laisse tomber. `production` : le
   * contexte de depart de l'editeur (celui du public, par defaut ; aucun pour la visite guidee).
   */
  const ouvrir = (nom: string, texte: string, ignores: readonly string[] = [], production: ChoixProduction | null = depart()) => {
    const propre = nettoyerSvgNomme(texte);
    if (propre && 'erreur' in propre) { dire(propre.erreur); return; }
    if (!propre) { dire('Ce contenu n’est pas un SVG lisible : il lui faut une balise <svg> avec un viewBox ou des dimensions.'); return; }
    // Du texte : ses lettres deviennent des formes avec les fontes de la page, chargees a la demande (ADR-0020).
    // Le modele de lecture (ADR-0012, annexe 5 §3) : le reglage garde, celui que l'editeur reprendra a l'ouverture.
    const modele = modeleDeLaPage();
    if (contientTexte(propre.svg)) { dire('Lecture du texte…', 'info'); void lettresDuSvg(propre.svg, undefined, modele).then(r => ('erreur' in r ? dire(r.erreur) : ouvrir(nom, r.svg, [...ignores, ...r.ignores], production))); return; }
    const lu = lireDessinMemo(propre.svg, modele);
    if ('erreur' in lu) { dire(lu.erreur); return; }
    poserFichier({ nom: sansExtension(nom), svg: propre.svg, ignores, ...(production ? { production } : {}) });
    poserEdition(true);
    // Une seule fois, ici : ce que la lecture a laisse tomber, pour qu'un rendu qui change ne passe pas inapercu.
    dire(phraseIgnores([...ignores, ...lu.ignores]));
    window.scrollTo(0, 0);
  };
  // La visite enseigne la premiere retouche sur l'exemple, en contexte generique quel que soit le public : ses etapes nomment
  // « Télécharger le SVG », et l'exemple a un trait que l'export Cricut refuserait (ADR-0024).
  const essayer = () => { demanderVisite(true); ouvrir('exemple', EXEMPLE, [], null); };
  const circuit = circuitDu(publicChoisi);
  const reglage = depart();

  return (
    <main className="accueil">
      <header className="tete">
        <h1>Éditeur SVG</h1>
        <p>Ouvrez un dessin vectoriel, convertissez une image, ou prenez une forme dans la bibliothèque ; retouchez en plein écran comme dans un logiciel de dessin, et récupérez un fichier propre, pour l’écran ou pour une machine de découpe. Rien ne quitte votre navigateur.</p>
      </header>

      {message.texte ? <Message ton={message.ton}>{message.texte}</Message> : null}

      {brouillon && !fichier ? <RepriseBrouillon brouillon={brouillon} reprendre={() => ouvrir(brouillon.nom, brouillon.svg)} oublier={() => { oublierBrouillon(STOCKAGE); poserBrouillon(null); }} /> : null}

      {fichier ? <FicheResultat fichier={fichier} telecharger={telecharger} informer={informer} reprendre={() => poserEdition(true)}
        fermer={() => { poserFichier(null); oublierBrouillon(STOCKAGE); poserBrouillon(null); dire(''); }} /> : null}

      <QuestionPublic choix={publicChoisi} ouverte={question} choisir={repondre} rouvrir={rouvrir} />

      {publicChoisi === 'integration'
        ? <PanneauIntegration circuit={circuit} essayer={() => { poserRecu(''); poserDemo(true); }} recu={recu} />
        : (
          <CircuitPublic circuit={circuit}>
            {publicChoisi === 'machine' && reglage ? <p className="aide">{phraseReglageMachine(reglage)}</p> : null}
            {publicChoisi === 'retouche' ? <Invitation essayer={essayer} /> : null}
          </CircuitPublic>
        )}

      <Voies ordre={ordreDesVoies(publicChoisi)} voie={voie} poserVoie={poserVoie}>
        {{
          svg: <OuvrirSvg ouvrir={ouvrir} dire={dire} essayer={essayer} invitation={publicChoisi !== 'retouche'} reception={reception} />,
          image: <Vectoriser ouvrir={ouvrir} reception={reception} />,
          formes: <SectionBibliotheque active={voie === 'formes'} ouvrir={x => ouvrir(nomDeFichier(x.nom, x.id), svgDeBibliotheque(x.id, x.svg, x.source))} />
        }}
      </Voies>

      {/* Un reglage d'expert : replie, en bas, avant le pied de page. */}
      <NuancierPage texte={nuancierTexte} poserTexte={poserNuancierTexte} teintes={nuancier.length} />

      <footer className="pied">
        <p className="aide">Les formes de la bibliothèque viennent de <a href="https://game-icons.net" rel="noreferrer">game-icons.net</a> et de ses contributeurs (licence <a href="https://creativecommons.org/licenses/by/3.0/" rel="noreferrer">CC BY 3.0</a>) ; la vectorisation emploie vtracer (Vision Cortex). Tout se calcule dans votre navigateur.</p>
        <p className="aide"><button type="button" className="discret" onClick={() => poserCredits(true)}>À propos et crédits</button></p>
      </footer>
      {credits ? <DialogueCredits fermer={() => poserCredits(false)} conteneur={document.body} /> : null}

      {fichier && edition ? (
        <EditeurSvg svg={fichier.svg} titre={fichier.nom + '.svg'} nom={fichier.nom} nuancier={nuancier} bibliotheque="a-charger" brouillon={garder} stockage={STOCKAGE} modeleParDefaut={MODELE_PAGE} guide={guide} ignores={fichier.ignores}
          production={fichier.production} libelleEnregistrer="Terminer" fermerSansModification policesEnLigne
          fermer={() => { poserEdition(false); demanderVisite(false); }}
          enregistrer={s => {
            // Le dessin rendu porte sa marque s'il a ete prepare : la reprise de l'edition la relit, le depart ne sert plus.
            poserFichier({ nom: fichier.nom, svg: s }); garderBrouillon(STOCKAGE, fichier.nom, s, Date.now()); poserEdition(false); demanderVisite(false);
            dire('Dessin prêt : téléchargez-le en SVG, ou choisissez un autre format.', 'info');
            poserRetour(n => n + 1);
          }} />
      ) : null}

      {/* L'editeur comme un hote l'ouvre (embarque.tsx) : son libelle de fin, aucun guide, ni bibliotheque ni nuancier, et la page
          garde la main a l'enregistrement (fermerApresEnregistrer). Rien de la fiche ni du brouillon n'est touche. */}
      {demo ? (
        <EditeurSvg svg={EXEMPLE} titre={DEMO_HOTE.nom + '.svg'} nom={DEMO_HOTE.nom} stockage={STOCKAGE} guide={null} libelleEnregistrer={DEMO_HOTE.libelleEnregistrer} modele="plat"
          fermer={() => poserDemo(false)} enregistrer={s => { poserRecu(phraseRecu(s)); poserDemo(false); }} />
      ) : null}
    </main>
  );
}

/**
 * Le bandeau de reprise (un dessin etait en cours) : reprendre ou oublier le brouillon. Un brouillon ecrit en modele riche ne se reprend pas
 * a plat (ADR-0012, annexe 5 §3) : le bandeau le dit, et propose d'activer le modele riche pour le reprendre ; rien n'est efface.
 */
function RepriseBrouillon({ brouillon, reprendre, oublier }: { brouillon: Brouillon; reprendre: () => void; oublier: () => void }) {
  const refus = refusModele(brouillon.svg, modeleDeLaPage(), 'brouillon');
  return (
    <section className="reprise" aria-label="Reprendre">
      <p>Un dessin était en cours : <strong>{brouillon.nom}.svg</strong>, modifié le {dateCourte(brouillon.quand)}.</p>
      {refus ? <p className="aide">{refus}</p> : null}
      <div className="actions">
        {refus
          ? <button type="button" className="primaire" onClick={() => { garderModele(STOCKAGE, 'riche'); reprendre(); }}>Activer le modèle riche et reprendre</button>
          : <button type="button" className="primaire" onClick={reprendre}>Reprendre</button>}
        <button type="button" className="discret" onClick={oublier}>Oublier</button>
      </div>
    </section>
  );
}

/** Le nuancier propose a l'editeur, une teinte par ligne : un reglage d'expert, replie. */
function NuancierPage({ texte, poserTexte, teintes }: { texte: string; poserTexte: (t: string) => void; teintes: number }) {
  return (
    <details className="nuancier-page">
      <summary>Nuancier proposé dans l’éditeur <span className="aide">{teintes} teinte{teintes > 1 ? 's' : ''}</span></summary>
      <label className="champ">
        <span className="aide">Une teinte par ligne, « Nom #rrggbb ». Ces couleurs sont proposées pour remplir, contourer et recolorer.</span>
        <textarea rows={5} value={texte} spellCheck={false} onChange={e => poserTexte(e.target.value)} />
        <span className="aide">{teintes ? teintes + ' teinte' + (teintes > 1 ? 's' : '') + ' lue' + (teintes > 1 ? 's' : '') : 'Aucune teinte lue. Écrivez une teinte par ligne, par exemple « Rouge #c81e28 » ; sans teinte, l’éditeur ne propose que le sélecteur de couleur.'}</span>
      </label>
    </details>
  );
}

/** La fiche du dessin rendu par l'editeur : son apercu, ses mesures, et le geste du moment, le telecharger. */
function FicheResultat({ fichier, telecharger, informer, reprendre, fermer }: {
  fichier: Fichier; telecharger: RefObject<HTMLButtonElement | null>; informer: (t: string) => void; reprendre: () => void; fermer: () => void;
}) {
  const stats = useMemo(() => {
    const lu = lireDessinMemo(fichier.svg, modeleDeLaPage());
    return 'erreur' in lu ? null : statistiques(lu.dessin);
  }, [fichier]);
  return (
    <section className="resultat" aria-label="Dessin courant">
      <img className="apercu" alt={'Aperçu de ' + fichier.nom} src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fichier.svg)} />
      <div className="fiche">
        <h2>{fichier.nom}.svg</h2>
        {stats ? <p className="aide">{stats.formes} forme{stats.formes > 1 ? 's' : ''} · {stats.points} points · {Math.max(1, Math.round(stats.octets / 1024))} Ko</p> : null}
        {/* Le geste du moment : recuperer le fichier. Reprendre l'edition et les autres formats restent a portee, en secondaires. */}
        <div className="actions">
          <button type="button" className="primaire" ref={telecharger} onClick={() => telechargerSvgPage(fichier.svg, fichier.nom, informer, modeleDeLaPage())}>Télécharger le SVG</button>
          <button type="button" onClick={reprendre}>Reprendre l’édition</button>
          <MenuAutresFormats svg={fichier.svg} nom={fichier.nom} dire={informer} modele={modeleDeLaPage()} />
          <button type="button" className="discret" onClick={fermer}>Fermer</button>
        </div>
      </div>
    </section>
  );
}

/**
 * Les trois voies, dans l'ordre du public, en onglets (ADR-0006) : la premiere est celle qu'on voit apres un choix de public. Les
 * trois panneaux restent montes, dans un ordre fixe : ce qu'on a regle dans l'un survit a un detour par un autre, et a un changement
 * de public.
 */
export function Voies({ ordre, voie, poserVoie, children }: { ordre: readonly Voie[]; voie: Voie; poserVoie: (v: Voie) => void; children: Readonly<Record<Voie, ReactNode>> }) {
  return (
    <section className="voies" aria-label="Par où commencer">
      <div className="voies-choix" role="tablist" aria-label="Point de départ">
        {ordre.map((id, i) => {
          const [icone, titre, aide] = VOIES[id];
          return (
            <button key={id} type="button" role="tab" id={'voie-' + id} aria-selected={voie === id} aria-controls={'panneau-' + id} tabIndex={voie === id ? 0 : -1} className="voie"
              onClick={() => poserVoie(id)}
              onKeyDown={e => {
                const pas = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
                if (!pas) return;
                e.preventDefault();
                const suite = ordre[(i + pas + ordre.length) % ordre.length];
                if (suite) { poserVoie(suite); focusAuClavier(document.getElementById('voie-' + suite)); }
              }}>
              <Icone nom={icone} taille={22} />
              <span className="voie-titre">{titre}</span>
              <span className="voie-aide">{aide}</span>
            </button>
          );
        })}
      </div>
      {(['svg', 'image', 'formes'] as const).map(id => (
        <div key={id} className="voie-panneau" role="tabpanel" id={'panneau-' + id} aria-labelledby={'voie-' + id} hidden={voie !== id}>{children[id]}</div>
      ))}
    </section>
  );
}

/**
 * La premiere fois (la visite n'a jamais ete vue, ni dans ce navigateur, ni dans cette session sans stockage) : une phrase
 * oriente vers l'essai guide sur l'exemple. Un bouton discret, pas une seconde action pleine (ADR-0006) ; une fois la visite
 * vue, la phrase s'efface et le menu Aide de l'editeur la rejoue.
 */
function Invitation({ essayer }: { essayer: () => void }) {
  const { memoire } = useReperes();
  if (memoire.visite) return null;
  return (
    <p className="invitation">
      <span>{insecables('Première fois ? Essayez avec notre exemple : changez une couleur en une minute.')}</span>
      <button type="button" className="discret" onClick={essayer}>Essayer avec la visite guidée</button>
    </p>
  );
}

/**
 * Deposer un fichier SVG ou PDF, en coller le code, l'ouvrir depuis une adresse (`reception`, ADR-0036), ou ouvrir l'exemple.
 * L'invitation a la visite y est, sauf pour le public « retouche », qui l'a sous son circuit.
 */
export function OuvrirSvg({ ouvrir, dire, essayer, invitation, reception }: { ouvrir: OuvrirDessin; dire: Dire; essayer: () => void; invitation: boolean; reception?: Reception }) {
  const [code, poserCode] = useState('');
  const [survol, poserSurvol] = useState(false);
  const entree = useRef<HTMLInputElement>(null);
  const pdf = usePdf(ouvrir, dire);
  // Un SVG ou un PDF recu d'une adresse (tapee ici, ou dans la voie « Convertir une image ») : la lecture d'un fichier depose.
  const { t: adresse, lienDepose } = useAdresseDeVoie(reception, dire, reception?.documentRecu, r => { if (r.nature === 'pdf') pdf.ouvrirOctets(r.nom, r.octets); else ouvrir(r.nom, texteDuSvg(r.octets)); });
  const ouvrirFichier = (f: File | undefined) => {
    if (!f) return;
    if (fichierPdf(f)) { pdf.ouvrirFichier(f); return; }
    void f.text().then(t => ouvrir(f.name, t)).catch(() => ouvrir(f.name, ''));
  };
  const deposer = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    poserSurvol(false);
    const f = e.dataTransfer.files[0];
    if (f) { ouvrirFichier(f); return; }
    // Un lien glisse depuis une autre page : le deposer est le geste qui demande le fichier.
    if (lienDepose(e.dataTransfer)) return;
    const t = e.dataTransfer.getData('text/plain');
    if (/<svg[\s>]/i.test(t)) ouvrir('dessin', t);
  };
  return (
    <section className="ouvrir" aria-label="Ouvrir un SVG ou un PDF">
      <h2 className="sr-only">Ouvrir un SVG ou un PDF</h2>
      <div className={'depot' + (survol ? ' survol' : '')} onDragOver={e => { e.preventDefault(); poserSurvol(true); }} onDragLeave={() => poserSurvol(false)} onDrop={deposer}>
        <p>Déposez un fichier SVG ou PDF ici, ou</p>
        <div className="actions">
          <button type="button" className={pdf.choix ? undefined : 'primaire'} onClick={() => entree.current?.click()}>Choisir un fichier…</button>
          <button type="button" onClick={() => ouvrir('exemple', EXEMPLE)}>Ouvrir l’exemple</button>
        </div>
        <input ref={entree} type="file" accept=".svg,image/svg+xml,.pdf,application/pdf" hidden onChange={e => { ouvrirFichier(e.target.files?.[0]); e.target.value = ''; }} />
        {invitation ? <Invitation essayer={essayer} /> : null}
      </div>
      {reception ? <ChampAdresse t={adresse} aide="Un SVG, un PDF ou une image PNG, JPEG, GIF, WebP ou BMP." /> : null}
      <ChoixPagePdf pdf={pdf} />
      <label className="champ">
        <span>Ou collez le code d’un SVG</span>
        <textarea rows={4} value={code} spellCheck={false} placeholder="<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; viewBox=&quot;0 0 100 100&quot;>…</svg>" onChange={e => poserCode(e.target.value)}
          onPaste={e => {
            // Une adresse collee seule, a la place d'un code : coller est le geste qui demande le fichier, comme « Ouvrir ».
            const texte = e.clipboardData.getData('text/plain');
            if (reception && adressesPermises() && estAdresseSeule(texte)) { e.preventDefault(); adresse.lancer(texte.trim()); }
          }} />
        <button type="button" className="discret" disabled={!code.trim()} onClick={() => ouvrir('dessin', code)}>Ouvrir ce code</button>
      </label>
    </section>
  );
}

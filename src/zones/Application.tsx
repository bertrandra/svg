// La page autonome : ouvrir un SVG (fichier, glisser-deposer, code colle ou exemple), convertir une
// image en SVG, choisir une forme de la bibliotheque, editer en plein ecran, puis reprendre le
// resultat (apercu, telechargement, copie du code). L'editeur lui-meme ne sait rien de cette page :
// il recoit un SVG et en rend un.

import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import { EditeurSvg } from './EditeurSvg.js';
import { SectionBibliotheque } from './Bibliotheque.js';
import { MenuExport } from './Exporter.js';
import { Icone, type NomIcone } from './icones.js';
import { Vectoriser } from './Vectoriser.js';
import { lireNuancier } from './nuancier.js';
import { phraseIgnores } from './aidesEditeur.js';
import { FournisseurStockage } from './contexteStockage.js';
import { dateCourte, garderBrouillon, lireBrouillon, oublierBrouillon, type Brouillon } from './session.js';
import { stockageNavigateur } from '../io/stockage.js';
import { statistiques } from '../engine/editionSvg.js';
import { lireDessinMemo } from './lecture.js';
import { nettoyerSvg } from '../util/svg.js';

interface Fichier { nom: string; svg: string }

const EXEMPLE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">'
  + '<rect x="16" y="16" width="208" height="128" rx="14" fill="#e9ecef"/>'
  + '<circle cx="80" cy="80" r="40" fill="#c81e28"/>'
  + '<path d="M130 120 L170 40 L210 120 Z" fill="#1428a0"/>'
  + '<path d="M40 130 Q120 90 200 130" fill="none" stroke="#15181d" stroke-width="4"/>'
  + '</svg>';

const NUANCIER_EXEMPLE = 'Rouge #c81e28\nBleu #1428a0\nEncre #15181d\nBlanc #ffffff';

type Voie = 'svg' | 'image' | 'formes';
const VOIES: ReadonlyArray<readonly [Voie, NomIcone, string, string]> = [
  ['svg', 'ouvrir', 'Ouvrir un SVG', 'Un fichier, du code collé, ou l’exemple'],
  ['image', 'image', 'Convertir une image', 'PNG, JPG… en vecteurs, fond détouré'],
  ['formes', 'scene', 'Bibliothèque', 'Plus de 4 000 formes par événement']
];

// La page est ce qui connait le magasin : le brouillon et les versions de l'editeur vont dans le navigateur.
const STOCKAGE = stockageNavigateur();

const sansExtension = (nom: string) => nom.replace(/\.svg$/i, '').trim() || 'dessin';

/** La page : l'accueil, avec le stockage du navigateur pour ce qu'elle garde (brouillon, corrections) et pour l'editeur. */
export function Application() {
  return <FournisseurStockage stockage={STOCKAGE}><Accueil /></FournisseurStockage>;
}

function Accueil() {
  const [fichier, poserFichier] = useState<Fichier | null>(null);
  const [edition, poserEdition] = useState(false);
  const [nuancierTexte, poserNuancierTexte] = useState(NUANCIER_EXEMPLE);
  const [voie, poserVoie] = useState<Voie>('svg');
  const [message, dire] = useState('');
  const [brouillon, poserBrouillon] = useState<Brouillon | null>(() => lireBrouillon(STOCKAGE));
  const nuancier = useMemo(() => lireNuancier(nuancierTexte), [nuancierTexte]);
  // Chaque modification dans l'editeur laisse un brouillon : un rechargement ne perd rien.
  const garder = useCallback((svg: string) => { if (fichier) garderBrouillon(STOCKAGE, fichier.nom, svg, Date.now()); }, [fichier]);

  /** Ouvre un texte SVG dans l'editeur, ou dit pourquoi il ne s'ouvre pas. */
  const ouvrir = (nom: string, texte: string) => {
    const propre = nettoyerSvg(texte);
    if (!propre) { dire('Ce contenu n’est pas un SVG lisible : il lui faut une balise <svg> avec un viewBox ou des dimensions.'); return; }
    const lu = lireDessinMemo(propre.svg);
    if ('erreur' in lu) { dire(lu.erreur); return; }
    poserFichier({ nom: sansExtension(nom), svg: propre.svg });
    poserEdition(true);
    // Une seule fois, ici : ce que la lecture a laisse tomber, pour qu'un rendu qui change ne passe pas inapercu.
    dire(phraseIgnores(lu.ignores));
    window.scrollTo(0, 0);
  };
  const stats = useMemo(() => {
    if (!fichier) return null;
    const lu = lireDessinMemo(fichier.svg);
    return 'erreur' in lu ? null : statistiques(lu.dessin);
  }, [fichier]);

  return (
    <main className="accueil">
      <header className="tete">
        <h1>Éditeur SVG</h1>
        <p>Ouvrez un dessin vectoriel, convertissez une image, ou prenez une forme dans la bibliothèque ; retouchez en plein écran comme dans un logiciel de dessin, et récupérez un SVG propre. Rien ne quitte votre navigateur.</p>
      </header>

      {message ? <p className="message" role="alert">{message}</p> : null}

      {brouillon && !fichier ? (
        <section className="reprise" aria-label="Reprendre">
          <p>Un dessin était en cours : <strong>{brouillon.nom}.svg</strong>, modifié le {dateCourte(brouillon.quand)}.</p>
          <div className="actions">
            <button type="button" className="primaire" onClick={() => { ouvrir(brouillon.nom, brouillon.svg); }}>Reprendre</button>
            <button type="button" className="discret" onClick={() => { oublierBrouillon(STOCKAGE); poserBrouillon(null); }}>Oublier</button>
          </div>
        </section>
      ) : null}

      {fichier ? (
        <section className="resultat" aria-label="Dessin courant">
          <img className="apercu" alt={'Aperçu de ' + fichier.nom} src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fichier.svg)} />
          <div className="fiche">
            <h2>{fichier.nom}.svg</h2>
            {stats ? <p className="aide">{stats.formes} forme{stats.formes > 1 ? 's' : ''} · {stats.points} points · {Math.max(1, Math.round(stats.octets / 1024))} Ko</p> : null}
            <div className="actions">
              <button type="button" className="primaire" onClick={() => poserEdition(true)}>Reprendre l’édition</button>
              <MenuExport svg={fichier.svg} nom={fichier.nom} dire={dire} />
              <button type="button" className="discret" onClick={() => { poserFichier(null); oublierBrouillon(STOCKAGE); poserBrouillon(null); dire(''); }}>Fermer</button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="voies" aria-label="Par où commencer">
        <div className="voies-choix" role="tablist" aria-label="Point de départ">
          {VOIES.map(([id, icone, titre, aide], i) => (
            <button key={id} type="button" role="tab" id={'voie-' + id} aria-selected={voie === id} aria-controls={'panneau-' + id} tabIndex={voie === id ? 0 : -1} className="voie"
              onClick={() => poserVoie(id)}
              onKeyDown={e => {
                const pas = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
                if (!pas) return;
                e.preventDefault();
                const suite = VOIES[(i + pas + VOIES.length) % VOIES.length];
                if (suite) { poserVoie(suite[0]); document.getElementById('voie-' + suite[0])?.focus(); }
              }}>
              <Icone nom={icone} taille={22} />
              <span className="voie-titre">{titre}</span>
              <span className="voie-aide">{aide}</span>
            </button>
          ))}
        </div>
        {/* Les trois panneaux restent montes : ce qu'on a regle dans l'un survit a un detour par un autre. */}
        <div className="voie-panneau" role="tabpanel" id="panneau-svg" aria-labelledby="voie-svg" hidden={voie !== 'svg'}><OuvrirSvg ouvrir={ouvrir} /></div>
        <div className="voie-panneau" role="tabpanel" id="panneau-image" aria-labelledby="voie-image" hidden={voie !== 'image'}><Vectoriser ouvrir={ouvrir} /></div>
        <div className="voie-panneau" role="tabpanel" id="panneau-formes" aria-labelledby="voie-formes" hidden={voie !== 'formes'}><SectionBibliotheque ouvrir={x => ouvrir(x.id, x.svg)} /></div>
      </section>

      <details className="nuancier-page">
        <summary>Nuancier proposé dans l’éditeur <span className="aide">{nuancier.length} teinte{nuancier.length > 1 ? 's' : ''}</span></summary>
        <label className="champ">
          <span className="aide">Une teinte par ligne, « Nom #rrggbb ». Ces couleurs sont proposées pour remplir, contourer et recolorer.</span>
          <textarea rows={5} value={nuancierTexte} spellCheck={false} onChange={e => poserNuancierTexte(e.target.value)} />
          <span className="aide">{nuancier.length ? nuancier.length + ' teinte' + (nuancier.length > 1 ? 's' : '') + ' lue' + (nuancier.length > 1 ? 's' : '') : 'Aucune teinte lue : l’éditeur proposera seulement le sélecteur.'}</span>
        </label>
      </details>

      <footer className="pied">
        <p className="aide">Les formes de la bibliothèque viennent de <a href="https://game-icons.net" rel="noreferrer">game-icons.net</a> (licence CC BY 3.0) ; la vectorisation emploie vtracer (Vision Cortex). Tout se calcule dans votre navigateur.</p>
      </footer>

      {fichier && edition ? (
        <EditeurSvg svg={fichier.svg} titre={fichier.nom + '.svg'} nom={fichier.nom} nuancier={nuancier} bibliotheque="a-charger" brouillon={garder} stockage={STOCKAGE}
          fermer={() => poserEdition(false)}
          enregistrer={s => { poserFichier({ nom: fichier.nom, svg: s }); garderBrouillon(STOCKAGE, fichier.nom, s, Date.now()); poserEdition(false); dire('Dessin enregistré : exportez-le en SVG, PNG ou PDF.'); }} />
      ) : null}
    </main>
  );
}

/** Deposer un fichier SVG, en coller le code, ou ouvrir l'exemple. */
function OuvrirSvg({ ouvrir }: { ouvrir: (nom: string, texte: string) => void }) {
  const [code, poserCode] = useState('');
  const [survol, poserSurvol] = useState(false);
  const entree = useRef<HTMLInputElement>(null);
  const ouvrirFichier = (f: File | undefined) => {
    if (!f) return;
    void f.text().then(t => ouvrir(f.name, t)).catch(() => ouvrir(f.name, ''));
  };
  const deposer = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    poserSurvol(false);
    const f = e.dataTransfer.files[0];
    if (f) { ouvrirFichier(f); return; }
    const t = e.dataTransfer.getData('text/plain');
    if (/<svg[\s>]/i.test(t)) ouvrir('dessin', t);
  };
  return (
    <section className="ouvrir" aria-label="Ouvrir un SVG">
      <h2 className="sr-only">Ouvrir un SVG</h2>
      <div className={'depot' + (survol ? ' survol' : '')} onDragOver={e => { e.preventDefault(); poserSurvol(true); }} onDragLeave={() => poserSurvol(false)} onDrop={deposer}>
        <p>Déposez un fichier SVG ici, ou</p>
        <div className="actions">
          <button type="button" className="primaire" onClick={() => entree.current?.click()}>Choisir un fichier…</button>
          <button type="button" onClick={() => ouvrir('exemple', EXEMPLE)}>Ouvrir l’exemple</button>
        </div>
        <input ref={entree} type="file" accept=".svg,image/svg+xml" hidden onChange={e => { ouvrirFichier(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      <label className="champ">
        <span>Ou collez le code d’un SVG</span>
        <textarea rows={4} value={code} spellCheck={false} placeholder="<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; viewBox=&quot;0 0 100 100&quot;>…</svg>" onChange={e => poserCode(e.target.value)} />
        <button type="button" className="discret" disabled={!code.trim()} onClick={() => ouvrir('dessin', code)}>Ouvrir ce code</button>
      </label>
    </section>
  );
}

// La page autonome : ouvrir un SVG (fichier, glisser-deposer, code colle ou exemple), l'editer en
// plein ecran, puis reprendre le resultat (apercu, telechargement, copie du code). L'editeur
// lui-meme ne sait rien de cette page : il recoit un SVG et en rend un.

import { useMemo, useRef, useState, type DragEvent } from 'react';
import { EditeurSvg } from './EditeurSvg.js';
import { lireNuancier } from './nuancier.js';
import { lireDessin, statistiques } from '../engine/editionSvg.js';
import { nettoyerSvg } from '../util/svg.js';
import { copier, proposer, texteOctets } from '../io/fichiers.js';

interface Fichier { nom: string; svg: string }

const EXEMPLE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">'
  + '<rect x="16" y="16" width="208" height="128" rx="14" fill="#e9ecef"/>'
  + '<circle cx="80" cy="80" r="40" fill="#c81e28"/>'
  + '<path d="M130 120 L170 40 L210 120 Z" fill="#1428a0"/>'
  + '<path d="M40 130 Q120 90 200 130" fill="none" stroke="#15181d" stroke-width="4"/>'
  + '</svg>';

const NUANCIER_EXEMPLE = 'Rouge #c81e28\nBleu #1428a0\nEncre #15181d\nBlanc #ffffff';

const sansExtension = (nom: string) => nom.replace(/\.svg$/i, '').trim() || 'dessin';

export function Application() {
  const [fichier, poserFichier] = useState<Fichier | null>(null);
  const [edition, poserEdition] = useState(false);
  const [code, poserCode] = useState('');
  const [nuancierTexte, poserNuancierTexte] = useState(NUANCIER_EXEMPLE);
  const [message, dire] = useState('');
  const [survol, poserSurvol] = useState(false);
  const entree = useRef<HTMLInputElement>(null);
  const nuancier = useMemo(() => lireNuancier(nuancierTexte), [nuancierTexte]);

  /** Ouvre un texte SVG dans l'editeur, ou dit pourquoi il ne s'ouvre pas. */
  const ouvrir = (nom: string, texte: string) => {
    const propre = nettoyerSvg(texte);
    if (!propre) { dire('Ce contenu n’est pas un SVG lisible : il lui faut une balise <svg> avec un viewBox ou des dimensions.'); return; }
    const lu = lireDessin(propre.svg);
    if ('erreur' in lu) { dire(lu.erreur); return; }
    poserFichier({ nom: sansExtension(nom), svg: propre.svg });
    poserEdition(true);
    dire('');
  };
  const ouvrirFichier = (f: File | undefined) => {
    if (!f) return;
    void f.text().then(t => ouvrir(f.name, t)).catch(() => dire('Le fichier ne se lit pas.'));
  };
  const deposer = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    poserSurvol(false);
    const f = e.dataTransfer.files[0];
    if (f) { ouvrirFichier(f); return; }
    const t = e.dataTransfer.getData('text/plain');
    if (/<svg[\s>]/i.test(t)) ouvrir('dessin', t);
  };
  const stats = useMemo(() => {
    if (!fichier) return null;
    const lu = lireDessin(fichier.svg);
    return 'erreur' in lu ? null : statistiques(lu.dessin);
  }, [fichier]);

  return (
    <main className="accueil">
      <header className="tete">
        <h1>Éditeur SVG</h1>
        <p>Ouvrez un dessin vectoriel, retouchez-le en plein écran comme dans un logiciel de dessin, et récupérez un SVG propre. Rien ne quitte votre navigateur.</p>
      </header>

      <section className={'depot' + (survol ? ' survol' : '')} aria-label="Ouvrir un SVG"
        onDragOver={e => { e.preventDefault(); poserSurvol(true); }} onDragLeave={() => poserSurvol(false)} onDrop={deposer}>
        <p>Déposez un fichier SVG ici, ou</p>
        <div className="actions">
          <button type="button" onClick={() => entree.current?.click()}>Choisir un fichier…</button>
          <button type="button" className="discret" onClick={() => ouvrir('exemple', EXEMPLE)}>Ouvrir l’exemple</button>
        </div>
        <input ref={entree} type="file" accept=".svg,image/svg+xml" hidden onChange={e => { ouvrirFichier(e.target.files?.[0]); e.target.value = ''; }} />
      </section>

      <section className="colonnes">
        <label className="champ">
          <span>Coller le code d’un SVG</span>
          <textarea rows={6} value={code} spellCheck={false} placeholder="<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; viewBox=&quot;0 0 100 100&quot;>…</svg>" onChange={e => poserCode(e.target.value)} />
          <button type="button" className="discret" disabled={!code.trim()} onClick={() => ouvrir('dessin', code)}>Ouvrir ce code</button>
        </label>
        <label className="champ">
          <span>Nuancier proposé dans l’éditeur <span className="aide">· une teinte par ligne, « Nom #rrggbb »</span></span>
          <textarea rows={6} value={nuancierTexte} spellCheck={false} onChange={e => poserNuancierTexte(e.target.value)} />
          <span className="aide">{nuancier.length ? nuancier.length + ' teinte' + (nuancier.length > 1 ? 's' : '') + ' lue' + (nuancier.length > 1 ? 's' : '') : 'Aucune teinte lue : l’éditeur proposera seulement le sélecteur.'}</span>
        </label>
      </section>

      {message ? <p className="message" role="alert">{message}</p> : null}

      {fichier ? (
        <section className="resultat" aria-label="Dessin courant">
          <img className="apercu" alt={'Aperçu de ' + fichier.nom} src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fichier.svg)} />
          <div className="fiche">
            <h2>{fichier.nom}.svg</h2>
            {stats ? <p className="aide">{stats.formes} forme{stats.formes > 1 ? 's' : ''} · {stats.points} points · {Math.max(1, Math.round(stats.octets / 1024))} Ko</p> : null}
            <div className="actions">
              <button type="button" onClick={() => poserEdition(true)}>Reprendre l’édition</button>
              <button type="button" className="discret" onClick={() => { void proposer(fichier.nom + '.svg', texteOctets(fichier.svg)).then(dire); }}>Télécharger</button>
              <button type="button" className="discret" onClick={() => { void copier(fichier.svg).then(ok => dire(ok ? 'Code SVG copié.' : 'La page n’a pas le droit d’écrire dans le presse-papiers.')); }}>Copier le code</button>
              <button type="button" className="discret" onClick={() => { poserFichier(null); dire(''); }}>Fermer</button>
            </div>
          </div>
        </section>
      ) : null}

      {fichier && edition ? (
        <EditeurSvg svg={fichier.svg} titre={fichier.nom + '.svg'} nom={fichier.nom} nuancier={nuancier}
          fermer={() => poserEdition(false)}
          enregistrer={s => { poserFichier({ nom: fichier.nom, svg: s }); poserEdition(false); dire('Dessin enregistré : téléchargez-le ou copiez son code.'); }} />
      ) : null}
    </main>
  );
}

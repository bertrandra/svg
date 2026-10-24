// Le panneau des calques : la liste des formes, du premier plan au fond.

import { modifier } from '../engine/editionSvg.js';
import { ParCouleur } from './ParCouleur.js';
import type { Edition } from './typesEditeur.js';

/** La liste des formes, du premier plan au fond : tout choisir ou rien, masquer, verrouiller. */
export function Calques({ ed }: { ed: Edition }) {
  const { dessin, sel } = ed;
  const choisissables = dessin.formes.filter(f => f.visible && !f.verrouille).map(f => f.id);
  const masquees = dessin.formes.filter(f => !f.visible).length;
  const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
  return (
    <aside className="editeur-calques" aria-label="Calques">
      <h3>Calques <span className="aide">{dessin.formes.length}</span></h3>
      <div className="calques-actions">
        <button type="button" className="discret" disabled={!choisissables.length || sel.length === choisissables.length} title="Tout sélectionner (Ctrl+A)" onClick={() => { ed.choisir(choisissables); ed.poserPoint(null); }}>Tout</button>
        <button type="button" className="discret" disabled={!sel.length} title="Ne rien sélectionner (Échap)" onClick={() => { ed.choisir([]); ed.poserPoint(null); }}>Aucun</button>
        <button type="button" className="discret" disabled={!choisissables.length} title="Inverser la sélection" onClick={() => { ed.choisir(choisissables.filter(id => !sel.includes(id))); ed.poserPoint(null); }}>Inverser</button>
        <button type="button" className="discret" disabled={!masquees} title="Afficher toutes les formes masquées" onClick={() => ed.faire(d => modifier(d, d.formes.filter(f => !f.visible).map(f => f.id), { visible: true }), pluriel(masquees, 'forme') + ' affichée' + (masquees > 1 ? 's' : '') + '.')}>Tout afficher</button>
      </div>
      <ParCouleur ed={ed} />
      <h4>Formes</h4>
      <ol>
        {[...dessin.formes].reverse().map(f => (
          <li key={f.id} className={sel.includes(f.id) ? 'choisi' : undefined}>
            <button type="button" className="calque-nom" disabled={f.verrouille} onClick={e => {
              ed.choisir(e.shiftKey ? (sel.includes(f.id) ? sel.filter(s => s !== f.id) : [...sel, f.id]) : [f.id]);
              ed.poserPoint(null);
            }}>
              <span className="echantillon" style={{ background: f.remplissage ?? 'transparent', borderColor: f.contour ?? undefined }} />
              {'Forme ' + f.id.slice(1)}
            </button>
            <button type="button" className="calque-bascule" aria-pressed={!f.visible} title={f.visible ? 'Masquer' : 'Afficher'} aria-label={(f.visible ? 'Masquer la forme ' : 'Afficher la forme ') + f.id.slice(1)}
              onClick={() => ed.appliquer(d => modifier(d, [f.id], { visible: !f.visible }))}>{f.visible ? '◉' : '○'}</button>
            <button type="button" className="calque-bascule" aria-pressed={f.verrouille} title={f.verrouille ? 'Déverrouiller' : 'Verrouiller'} aria-label={(f.verrouille ? 'Déverrouiller la forme ' : 'Verrouiller la forme ') + f.id.slice(1)}
              onClick={() => { ed.appliquer(d => modifier(d, [f.id], { verrouille: !f.verrouille })); if (!f.verrouille) ed.choisir(sel.filter(s => s !== f.id)); }}>{f.verrouille ? '🔒' : '🔓'}</button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

// Le texte en formes (ADR-0004) : un texte tape, une fonte embarquee ou deposee, une taille, un
// interlettrage ; chaque lettre devient une forme au centre du plan. Les fontes se chargent au
// premier besoin ; le SVG ecrit ne contient jamais de <text>.

import { useEffect, useRef, useState } from 'react';
import { boiteChemin, unir } from '../engine/editionSvg.js';
import { ajouterTexte, composer } from '../engine/texte.js';
import { chargerPolices, policeDeposee, type Police } from '../io/polices.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';

export function PanneauTexte() {
  const mo = useDessin(), ac = useActions(), ui = useInterface();
  const [polices, poserPolices] = useState<Police[] | null>(null);
  const [erreur, poserErreur] = useState('');
  const [texte, poserTexte] = useState('Joyeux anniversaire');
  const [policeId, poserPoliceId] = useState('');
  const [taille, poserTaille] = useState(() => Math.round(Math.min(mo.dessin.vb[2], mo.dessin.vb[3]) / 6));
  const [interlettrage, poserInterlettrage] = useState(0);
  const entree = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let vivant = true;
    chargerPolices().then(p => { if (vivant) { poserPolices(p); poserPoliceId(id => id || p[0]?.id || ''); } }).catch((e: unknown) => { if (vivant) { poserPolices([]); poserErreur(e instanceof Error ? e.message : String(e)); } });
    return () => { vivant = false; };
  }, []);
  const police = polices?.find(p => p.id === policeId) ?? polices?.[0] ?? null;

  const deposer = (f: File | undefined) => {
    if (!f) return;
    void policeDeposee(f).then(r => {
      if ('erreur' in r) { poserErreur(r.erreur); return; }
      poserPolices(p => [...(p ?? []), r]);
      poserPoliceId(r.id);
      poserErreur('');
    });
  };
  const ajouter = () => {
    if (!police || !texte.trim()) return;
    const lettres = composer(texte, police.glyphes, { taille, interlettrage, x: 0, y: 0 });
    const b = unir(lettres.map(l => boiteChemin(l.d)));
    if (!b) { ac.dire('Ce texte ne donne aucune forme avec cette fonte.'); return; }
    const [vx, vy, vl, vh] = mo.dessin.vb;
    // Le bloc de texte, centre sur le plan : on compose a l'origine puis on decale.
    const dx = vx + (vl - b.l) / 2 - b.x, dy = vy + (vh - b.h) / 2 - b.y;
    const posees = composer(texte, police.glyphes, { taille, interlettrage, x: dx, y: dy });
    const r = ajouterTexte(mo.dessin, posees, ui.style);
    if (!r.ids.length) return;
    ac.appliquer(() => r.dessin);
    ac.choisir(r.ids);
    ac.poserOutil('selection');
    ac.dire(r.ids.length + ' lettre' + (r.ids.length > 1 ? 's' : '') + ' ajoutée' + (r.ids.length > 1 ? 's' : '') + ' en formes, une par lettre : combinez-les si besoin.');
  };

  return (
    <fieldset className="editeur-groupe">
      <legend>Texte en formes</legend>
      <textarea rows={2} value={texte} onChange={e => poserTexte(e.target.value)} aria-label="Texte" placeholder="Votre texte" />
      <label className="champ-ligne">
        <span>Fonte</span>
        {polices === null ? <span className="aide">Chargement des fontes…</span> : (
          <select value={policeId} onChange={e => poserPoliceId(e.target.value)} aria-label="Fonte">
            {polices.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        )}
      </label>
      <div className="grille-2">
        <label className="champ-ligne"><span>Taille</span><input type="text" inputMode="decimal" value={String(taille)} onChange={e => poserTaille(Math.max(1, Number(e.target.value.replace(',', '.')) || 1))} /></label>
        <label className="champ-ligne"><span>Espace</span><input type="text" inputMode="decimal" value={String(interlettrage)} onChange={e => poserInterlettrage(Number(e.target.value.replace(',', '.')) || 0)} title="Interlettrage, en part de la taille" /></label>
      </div>
      <div className="boutons">
        <button type="button" className="primaire" disabled={!police || !texte.trim()} onClick={ajouter}>Ajouter le texte</button>
        <button type="button" className="discret" onClick={() => entree.current?.click()}>Déposer une fonte TTF/OTF…</button>
        <input ref={entree} type="file" accept=".ttf,.otf,font/ttf,font/otf" hidden onChange={e => { deposer(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {erreur ? <p className="aide" role="alert">{erreur}</p> : <p className="aide">Les lettres prennent le remplissage et le contour courants. Fontes libres (OFL) : Inter, Oswald, Bebas Neue, Playfair, Lobster, Pacifico, Caveat, Fredoka.</p>}
    </fieldset>
  );
}

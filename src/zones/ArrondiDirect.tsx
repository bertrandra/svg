// Arrondir en direct (ADR-0038) : le rayon des angles se regle a un curseur, et la forme s'arrondit sous les yeux, depuis le
// dessin d'avant le reglage, dans une seule entree d'historique ; le champ garde la valeur exacte (Entree, ou le bouton). En mode
// points, seul le coin du point actif s'arrondit (« Arrondir ce coin ») ; sinon, tous les coins des formes choisies. Le calcul
// est celui d'« Arrondir les angles » (engine/edition/arrondi.ts : un arc tangent aux deux segments, borne par leur longueur).

import { useEffect, useRef, useState } from 'react';
import { arrondirFormes, boiteDe, type DessinSvg } from '../engine/editionSvg.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { arrondi } from './aidesEditeur.js';
import { phraseArrondi } from './phrasesTrace.js';

const nombre = (t: string): number => Number(t.replace(',', '.'));

/** Le geste du curseur : le dessin d'avant, la cle d'historique, le dernier dessin pose (pour voir qu'un autre geste est passe). */
interface Geste { base: DessinSvg; cle: string; pose: DessinSvg | null }

/**
 * Le rayon, son curseur en direct et son bouton. `coin` : l'indice de la commande dont l'ancre est le coin a arrondir (le point actif
 * du mode points), ou null pour tous les coins.
 */
export function ArrondiDirect({ coin }: { coin: number | null }) {
  const mo = useDessin(), ac = useActions(), { profil } = useInterface();
  const { dessin, sel } = mo;
  // Le rayon de depart : celui de la lame en contexte de production (ADR-0013), sinon un quarantieme du plan.
  const [rayon, poserRayon] = useState(() => String(arrondi(profil ? profil.rayonLame : Math.max(dessin.vb[2], dessin.vb[3]) / 40)));
  const geste = useRef<Geste | null>(null);
  const b = boiteDe(dessin, sel);
  // Le curseur va jusqu'a la moitie du plus grand cote de la selection : au-dela, chaque coin est deja ramene au plus grand rayon possible.
  const max = arrondi(b ? Math.max(b.l, b.h) / 2 : Math.max(dessin.vb[2], dessin.vb[3]) / 4) || 1;
  const coins = coin === null ? undefined : new Set([coin]);
  const desactive = !sel.length;
  // Un autre geste passe pendant le reglage (annuler, deplacer) : le prochain mouvement du curseur repart du dessin du moment.
  useEffect(() => { if (geste.current && dessin !== geste.current.pose && dessin !== geste.current.base) geste.current = null; }, [dessin]);
  const dire = (base: DessinSvg, r: number) => {
    const a = arrondirFormes(base, sel, r, coins);
    ac.dire(phraseArrondi(a.angles, a.reduits, r, a.rayonMin));
  };
  const enDirect = (t: string) => {
    poserRayon(t);
    const r = nombre(t);
    if (!(r >= 0) || desactive) return;
    geste.current ??= { base: dessin, cle: ac.nouvelleCle(), pose: null };
    const g = geste.current, a = arrondirFormes(g.base, sel, r, coins).dessin;
    g.pose = a;
    ac.appliquer(() => a, g.cle);
  };
  const finir = () => {
    const g = geste.current;
    if (!g) return;
    geste.current = null;
    ac.finir();
    dire(g.base, nombre(rayon));
  };
  const appliquer = () => {
    if (geste.current) { finir(); return; }
    const r = nombre(rayon);
    // Tous les coins : le verbe de l'editeur, qui dit aussi ce qu'il arrive a un texte vivant (vectorise pour etre arrondi).
    if (coin === null) { ac.arrondirAngles(r); return; }
    if (!(r > 0)) { ac.dire('Donnez un rayon positif.'); return; }
    const a = arrondirFormes(dessin, sel, r, coins);
    if (a.dessin !== dessin) ac.appliquer(() => a.dessin);
    ac.dire(phraseArrondi(a.angles, a.reduits, r, a.rayonMin));
  };
  return (
    <div className="outil-trace arrondi-direct">
      <label className="champ-ligne nombre" title="Arrondit chaque angle d’un arc de ce rayon ; ramené au plus grand possible si les côtés sont trop courts">
        <span>{coin === null ? 'Rayon des angles' : 'Rayon du coin'}</span>
        <input type="text" inputMode="decimal" data-champ-trace="rayon" value={rayon} onChange={e => poserRayon(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') appliquer(); }} />
      </label>
      <label className="champ-ligne">
        <span>En direct</span>
        <input type="range" min={0} max={max} step={max / 100} value={Math.min(max, Math.max(0, nombre(rayon) || 0))} disabled={desactive}
          aria-valuetext={rayon} onChange={e => enDirect(String(arrondi(Number(e.target.value))))} onPointerUp={finir} onBlur={finir} />
      </label>
      <button type="button" className="discret" disabled={desactive} onClick={appliquer}>{coin === null ? 'Arrondir les angles' : 'Arrondir ce coin'}</button>
    </div>
  );
}

// « Dupliquer sur la feuille » (ADR-0039) : en contexte Cricut, la selection copiee et rangee sur la feuille posee sur le tapis, en
// quantite ou jusqu'a la remplir, sans chevaucher ce qui y est deja. Le calcul est pur (engine/preparation/placement.ts) ; l'imbrication
// « avancée » passe par tranches (io/placement.ts), avec une attente qu'on peut arreter. Le resultat entre dans l'historique d'un coup :
// Ctrl+Z retire toutes les copies. Le panneau flotte sur la toile comme ceux de la repetition (ADR-0038).

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import {
  ESPACEMENT_DEFAUT, MARGE_DEFAUT, etendueVisible, finirPlacement, gabaritDuTapis, operationsApplicables, phrasePlacement, preparerPlacement, regionDeCoupe,
  type Optimisation, type OptionsPlacement
} from '../engine/preparation.js';
import { placerParTranches, type TachePlacement } from '../io/placement.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useActionsRegles, useRegles } from './contexteRegles.js';
import { lireValeur } from './graduations.js';
import { Icone } from './icones.js';
import { arrondi } from './aidesEditeur.js';
import { pluriel } from '../util/texte.js';
import { lentilleDe } from './lentille.js';

export const TITRE_FEUILLE = 'Dupliquer sur la feuille';

interface Saisie { mode: 'quantite' | 'remplir'; quantite: string; espacement: string; marge: string; rotation: boolean; optimisation: Optimisation }

/** Le panneau, quand il est demande. */
export function PanneauFeuille({ svgRef }: { svgRef: RefObject<SVGSVGElement | null> }) {
  const rg = useRegles();
  return rg.panneau === 'feuille' ? <DupliquerSurFeuille svgRef={svgRef} /> : null;
}

function DupliquerSurFeuille({ svgRef }: { svgRef: RefObject<SVGSVGElement | null> }) {
  const mo = useDessin(), ui = useInterface(), ac = useActions(), arg = useActionsRegles(), rg = useRegles();
  const u = rg.unite, titre = useId(), racine = useRef<HTMLDivElement>(null);
  const ecrire = (v: number) => String(arrondi(u.vers(v)));
  const [s, poserS] = useState<Saisie>(() => ({ mode: 'quantite', quantite: '1', espacement: ecrire(ESPACEMENT_DEFAUT), marge: ecrire(MARGE_DEFAUT), rotation: true, optimisation: 'simple' }));
  const [calcul, poserCalcul] = useState<{ tache: TachePlacement; trouvees: number } | null>(null);
  const [erreur, poserErreur] = useState<string | null>(null);
  const regler = (p: Partial<Saisie>) => { poserS(x => ({ ...x, ...p })); poserErreur(null); };
  // Ni dans une decoupe ou un masque (la feuille est celle du dessin entier), ni hors d'une Cricut qui coupe ou ecrit.
  const profil = ui.profil, permis = !!profil && operationsApplicables(profil.procede) && !lentilleDe(ui.contexte);
  useEffect(() => { racine.current?.querySelector<HTMLElement>('.panneau-flottant-corps input, .panneau-flottant-corps button')?.focus(); }, []);
  // Fermer le panneau arrete un calcul en cours : rien n'est pose.
  const enCours = useRef<TachePlacement | null>(null);
  // Le dessin du moment, lu a la fin d'un calcul : un dessin change entre-temps ne recoit pas des copies calculees sur un autre.
  const dessinCourant = useRef(mo.dessin);
  dessinCourant.current = mo.dessin;
  useEffect(() => () => enCours.current?.annuler(), []);

  const fermer = () => { calcul?.tache.annuler(); arg.ouvrir(null); svgRef.current?.focus(); };

  const lancer = () => {
    if (!profil || !permis) return;
    const espacement = lireValeur(s.espacement, u), marge = lireValeur(s.marge, u);
    const quantite = s.mode === 'remplir' ? 'remplir' as const : /^\s*\d+\s*$/.test(s.quantite) ? Number(s.quantite) : Number.NaN;
    if (espacement === null || marge === null) { poserErreur('Donnez un espacement et une marge lisibles.'); return; }
    const dessin = mo.dessin, ids = mo.sel;
    const feuille = regionDeCoupe(profil, gabaritDuTapis(profil, dessin, etendueVisible(dessin)));
    if (!feuille) { poserErreur('La feuille sort de la zone utile du tapis : replacez-la dans le panneau « Prêt pour Cricut ».'); return; }
    const o: OptionsPlacement = { quantite, espacement, marge, rotation: s.rotation, optimisation: s.optimisation };
    const depart = preparerPlacement(dessin, ids, feuille, o);
    if (depart.erreur) { poserErreur(depart.erreur); return; }
    const tache = placerParTranches(depart, { progres: e => poserCalcul(c => (c ? { ...c, trouvees: Math.max(e.posees.length, e.simple.length) } : c)) });
    enCours.current = tache;
    poserCalcul({ tache, trouvees: depart.simple.length });
    if (!depart.fini) ac.dire('Calcul du placement… Échap l’arrête.');
    void tache.fin.then(({ etat, annule }) => {
      enCours.current = null;
      poserCalcul(null);
      if (annule) { ac.dire('Placement arrêté : aucune copie posée.'); return; }
      // Le dessin a pu changer pendant le calcul : on ne pose rien sur un autre dessin que celui mesure.
      if (dessinCourant.current !== dessin) { poserErreur('Le dessin a changé pendant le calcul : aucune copie posée. Relancez.'); ac.dire('Le dessin a changé pendant le calcul : aucune copie posée.'); return; }
      const r = finirPlacement(dessin, etat);
      if (!r.copies) { poserErreur(r.erreur ?? 'Aucune copie ne tient sur la feuille.'); ac.dire(r.erreur ?? 'Aucune copie ne tient sur la feuille.'); return; }
      ac.appliquer(() => r.dessin);
      ac.finir();
      ac.choisir([...r.ids]);
      ac.dire(phrasePlacement(r));
      arg.ouvrir(null);
      svgRef.current?.focus();
    });
  };

  let corps;
  if (!permis) corps = <p className="aide">Choisissez d’abord une machine Cricut, en découpe ou au stylo, dans la barre : les copies se rangent sur sa feuille.</p>;
  else if (!mo.sel.length) corps = <p className="aide">Choisissez d’abord une forme, ou plusieurs : elles seront copiées ensemble, comme une seule pièce.</p>;
  else {
    corps = (
      <>
        <fieldset className="champ-groupe">
          <legend>Copies</legend>
          <label className="case"><input type="radio" name={titre + '-mode'} checked={s.mode === 'quantite'} onChange={() => regler({ mode: 'quantite' })} /> Quantité</label>
          <label className="champ-ligne nombre">
            <span>Copies à ajouter</span>
            <input type="text" inputMode="numeric" value={s.quantite} disabled={s.mode !== 'quantite'} title="L’original reste en plus des copies" onChange={e => regler({ quantite: e.target.value, mode: 'quantite' })} />
          </label>
          <label className="case"><input type="radio" name={titre + '-mode'} checked={s.mode === 'remplir'} onChange={() => regler({ mode: 'remplir' })} /> Remplir la feuille</label>
        </fieldset>
        <div className="grille-2">
          <label className="champ-ligne nombre" title="L’écart entre deux pièces, pour que la lame passe entre elles">
            <span>Espacement</span>
            <input type="text" inputMode="decimal" value={s.espacement} onChange={e => regler({ espacement: e.target.value })} />
            {u.nom ? <span className="unite">{u.nom}</span> : null}
          </label>
          <label className="champ-ligne nombre" title="L’écart au bord de la feuille">
            <span>Marge</span>
            <input type="text" inputMode="decimal" value={s.marge} onChange={e => regler({ marge: e.target.value })} />
            {u.nom ? <span className="unite">{u.nom}</span> : null}
          </label>
        </div>
        <label className="case"><input type="checkbox" checked={s.rotation} onChange={e => regler({ rotation: e.target.checked })} /> Permettre la rotation (quart de tour) pour en faire tenir davantage</label>
        <fieldset className="champ-groupe">
          <legend>Optimisation</legend>
          <label className="case"><input type="radio" name={titre + '-optimisation'} checked={s.optimisation === 'simple'} onChange={() => regler({ optimisation: 'simple' })} /> Simple</label>
          <label className="case"><input type="radio" name={titre + '-optimisation'} checked={s.optimisation === 'avancee'} onChange={() => regler({ optimisation: 'avancee' })} /> Avancée</label>
          <p className="aide">Simple : des rangées, chaque pièce dans sa boîte. Avancée : les contours s’emboîtent (étoiles, lettres, cœurs) ; plus long, jamais moins de copies.</p>
        </fieldset>
      </>
    );
  }
  const etat = calcul ? 'Calcul en cours… ' + pluriel(calcul.trouvees, 'copie') + ' trouvée' + (calcul.trouvees > 1 ? 's' : '') + ' jusqu’ici.' : erreur;
  return (
    <div className="panneau-flottant panneau-repetition panneau-feuille" role="dialog" aria-labelledby={titre} ref={racine} aria-busy={calcul ? true : undefined}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (calcul) calcul.tache.annuler(); else fermer(); } }}>
      <div className="panneau-flottant-tete">
        <h2 id={titre}>{TITRE_FEUILLE}</h2>
        <button type="button" className="icone-bouton" aria-label="Fermer sans dupliquer" title="Fermer sans dupliquer (Échap)" onClick={fermer}><Icone nom="fermer" /></button>
      </div>
      <div className="panneau-flottant-corps">{corps}</div>
      {etat ? <p className={'aide' + (erreur && !calcul ? ' erreur' : '')} role={erreur && !calcul ? 'alert' : 'status'}>{etat}</p> : null}
      <div className="panneau-flottant-pied">
        {calcul
          ? <button type="button" onClick={() => calcul.tache.annuler()}>Arrêter le calcul</button>
          : <button type="button" className="discret" onClick={fermer}>Annuler</button>}
        <button type="button" disabled={!permis || !mo.sel.length || !!calcul} onClick={lancer}>Dupliquer</button>
      </div>
    </div>
  );
}

// « Ajouter des liens » (ADR-0040) : en contexte Cricut, chaque ilot des formes choisies (le centre d'un O, d'un A, d'un D, qui tombe
// a la decoupe d'un pochoir) recoit des liens, des bandes de feuille laissees en travers de la forme. La largeur (2 mm) et le nombre
// par ilot (3) sont des reglages de la session, jamais ecrits ; le calcul est pur (engine/preparation/liens.ts) et entre dans
// l'historique d'un coup : Ctrl+Z retire tous les liens. Le panneau flotte sur la toile comme « Dupliquer sur la feuille ».

import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { ilotsDe, operationDe, operationsApplicables, LARGEUR_LIEN_MAX, LARGEUR_LIEN_MIN, NOMBRE_LIENS_MAX, NOMBRE_LIENS_MIN } from '../engine/preparation.js';
import { toleranceBooleen } from '../engine/booleens.js';
import { feuillesDe } from '../engine/editionSvg.js';
import { nombreFr } from '../engine/description.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useActionsRegles, useRegles } from './contexteRegles.js';
import { lireValeur, type UniteRegle } from './graduations.js';
import { Icone } from './icones.js';
import { pluriel } from '../util/texte.js';
import { lentilleDe } from './lentille.js';

export const TITRE_LIENS = 'Ajouter des liens';

/** Une largeur dans le champ : au centieme de millimetre, au millieme de pouce (2 mm valent 0,079 po). */
const texteLargeur = (v: number, u: UniteRegle): string => {
  const k = u.nom === 'po' ? 1000 : 100;
  return String(Math.round(u.vers(v) * k) / k);
};

/** Le panneau, quand il est demande. */
export function PanneauLiens({ svgRef }: { svgRef: RefObject<SVGSVGElement | null> }) {
  const rg = useRegles();
  return rg.panneau === 'liens' ? <AjouterLiens svgRef={svgRef} /> : null;
}

function AjouterLiens({ svgRef }: { svgRef: RefObject<SVGSVGElement | null> }) {
  const mo = useDessin(), ui = useInterface(), ac = useActions(), arg = useActionsRegles(), rg = useRegles();
  const u = rg.unite, titre = useId(), racine = useRef<HTMLDivElement>(null);
  const [largeur, poserLargeur] = useState(() => texteLargeur(rg.liens.largeur, u));
  const [nombre, poserNombre] = useState(() => String(rg.liens.nombre));
  const [erreur, poserErreur] = useState<string | null>(null);
  const profil = ui.profil, permis = !!profil && operationsApplicables(profil.procede) && !lentilleDe(ui.contexte);
  useEffect(() => { racine.current?.querySelector<HTMLElement>('.panneau-flottant-corps input')?.focus(); }, []);
  // Ce que la selection offre : ses formes a couper, et leurs ilots (memorises par forme, le calcul est celui du constat).
  const compte = useMemo(() => {
    if (!profil) return { formes: 0, ilots: 0 };
    const tol = toleranceBooleen(mo.dessin), feuilles = new Set(feuillesDe(mo.dessin, mo.sel));
    let formes = 0, ilots = 0;
    for (const f of mo.dessin.formes) {
      if (!feuilles.has(f.id) || f.remplissage === null || operationDe(f, profil.procede) !== 'decoupe') continue;
      formes++;
      ilots += ilotsDe(f, tol).length;
    }
    return { formes, ilots };
  }, [mo.dessin, mo.sel, profil]);

  const fermer = () => { arg.ouvrir(null); svgRef.current?.focus(); };
  const lancer = () => {
    // Un champ que l'on n'a pas touche garde la valeur exacte de la session : 2 mm restent 2 mm, meme affiches en pouces arrondis.
    const l = largeur === texteLargeur(rg.liens.largeur, u) ? rg.liens.largeur : lireValeur(largeur, u);
    const n = /^\s*\d+\s*$/.test(nombre) ? Number(nombre) : Number.NaN;
    if (l === null || l < LARGEUR_LIEN_MIN - 1e-9 || l > LARGEUR_LIEN_MAX + 1e-9) { poserErreur('Donnez une largeur entre ' + nombreFr(u.vers(LARGEUR_LIEN_MIN)) + ' et ' + nombreFr(u.vers(LARGEUR_LIEN_MAX)) + ' ' + u.nom + '.'); return; }
    if (!(n >= NOMBRE_LIENS_MIN && n <= NOMBRE_LIENS_MAX)) { poserErreur('Donnez un nombre de liens entre ' + NOMBRE_LIENS_MIN + ' et ' + NOMBRE_LIENS_MAX + ' par îlot.'); return; }
    const reglages = { largeur: l, nombre: n };
    arg.poserLiens(reglages);
    if (!ac.ajouterLiens(reglages)) { poserErreur('Aucun lien posé : la barre d’état dit pourquoi.'); return; }
    fermer();
  };

  let corps;
  if (!permis) corps = <p className="aide">Choisissez d’abord une machine Cricut, en découpe, dans la barre : les liens retiennent ce qui tomberait à la découpe.</p>;
  else {
    const etat = !mo.sel.length ? 'Choisissez d’abord une forme pleine à couper, ou plusieurs.'
      : !compte.formes ? 'Aucune forme choisie n’est pleine et à couper : une forme à écrire n’a pas d’îlot.'
        : !compte.ilots ? (compte.formes > 1 ? 'Ces formes n’ont' : 'Cette forme n’a') + ' pas d’îlot : rien ne tombera à la découpe.'
          : pluriel(compte.ilots, 'îlot') + ' dans ' + pluriel(compte.formes, 'forme') + ' : chaque îlot recevra ses liens.';
    corps = (
      <>
        <p className="aide">En pochoir, le centre d’un O, d’un A ou d’un D tombe à la découpe. Un lien est une bande de feuille laissée en travers de la forme, qui le retient.</p>
        <div className="grille-2">
          <label className="champ-ligne nombre" title={'La largeur de chaque lien, entre ' + nombreFr(u.vers(LARGEUR_LIEN_MIN)) + ' et ' + nombreFr(u.vers(LARGEUR_LIEN_MAX)) + ' ' + u.long}>
            <span>Largeur</span>
            <input type="text" inputMode="decimal" value={largeur} onChange={e => { poserLargeur(e.target.value); poserErreur(null); }} onKeyDown={e => { if (e.key === 'Enter') lancer(); }} />
            {u.nom ? <span className="unite">{u.nom}</span> : null}
          </label>
          <label className="champ-ligne nombre" title={'Le nombre de liens autour de chaque îlot, de ' + NOMBRE_LIENS_MIN + ' à ' + NOMBRE_LIENS_MAX}>
            <span>Liens par îlot</span>
            <input type="text" inputMode="numeric" value={nombre} onChange={e => { poserNombre(e.target.value); poserErreur(null); }} onKeyDown={e => { if (e.key === 'Enter') lancer(); }} />
          </label>
        </div>
        <p className="aide" role="status">{etat}</p>
        <p className="aide">La largeur qui tient dépend de la matière : essayez sur une chute (à vérifier).</p>
      </>
    );
  }
  return (
    <div className="panneau-flottant panneau-repetition panneau-liens" role="dialog" aria-labelledby={titre} ref={racine}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); } }}>
      <div className="panneau-flottant-tete">
        <h2 id={titre}>{TITRE_LIENS}</h2>
        <button type="button" className="icone-bouton" aria-label="Fermer sans ajouter de liens" title="Fermer sans ajouter de liens (Échap)" onClick={fermer}><Icone nom="fermer" /></button>
      </div>
      <div className="panneau-flottant-corps">{corps}</div>
      {erreur ? <p className="aide erreur" role="alert">{erreur}</p> : null}
      <div className="panneau-flottant-pied">
        <button type="button" className="discret" onClick={fermer}>Annuler</button>
        <button type="button" disabled={!permis || !compte.ilots} onClick={lancer}>Ajouter les liens</button>
      </div>
    </div>
  );
}

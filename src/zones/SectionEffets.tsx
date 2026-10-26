// La section Effets de l'inspecteur (ADR-0012, etape 8, paquet B ; annexe 6 §6) : une case « Flou » et une case « Ombre portée », puis
// leurs reglages (l'ecart du flou ; le decalage, le flou, la couleur et l'opacite de l'ombre), pour la premiere forme ou le premier
// groupe choisis, appliques a toute la selection. Elle n'existe qu'en modele riche (`groupesActifs`) : poser un effet rend un dessin
// riche ; a plat, l'inspecteur garde son DOM d'avant.
//
// Les champs chiffres s'appliquent a la validation, bornes par le moteur (`poserEffets` : `ecartMax`, `decalageMax`) ; une valeur
// ramenee a sa borne se dit. Curseurs et selecteur de couleur sont un geste continu, fondu par sa cle, clos en quittant le champ.

import { useEffect, useRef, useState } from 'react';
import { decalageMax, ecartMax, ECART_FLOU_MIN, effetsDe, flouParDefaut, flousApproches, MSG_EFFETS_OPERATIONS, type DessinSvg, type OmbrePortee, type ReglageEffets } from '../engine/editionSvg.js';
import { Section } from './commun/Section.js';
import { Nombre } from './commun/Nombre.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { estHex } from './aidesEditeur.js';
import { groupesActifs } from './commandesGroupes.js';
import { nombreDit, phraseFlou, phraseOmbre } from './phrasesContenus.js';

/** La valeur ramenee a ses bornes, et la phrase qui le dit quand elle l'a ete. */
function borne(v: number, min: number, max: number, quoi: string): { v: number; dit: string } {
  if (v > max) return { v: max, dit: ' ' + quoi + ' au plus ' + nombreDit(max) + '.' };
  if (v < min) return { v: min, dit: ' ' + quoi + ' au moins ' + nombreDit(min) + '.' };
  return { v, dit: '' };
}

/** La section Effets ; rien a plat, ni sans selection. */
export function SectionEffets() {
  const mo = useDessin(), ui = useInterface(), ac = useActions();
  const [premier] = mo.sel;
  if (premier === undefined || !groupesActifs(mo.dessin, ui.modele)) return null;
  return <CorpsEffets dessin={mo.dessin} premier={premier} poser={ac.poserEffets} finir={ac.finir} annoncer={ac.annoncer} />;
}

function CorpsEffets({ dessin, premier, poser, finir, annoncer }: { dessin: DessinSvg; premier: string; poser: (r: ReglageEffets, cle?: string | null) => void; finir: () => void; annoncer: (t: string) => void }) {
  const e = effetsDe(dessin, premier), vb = dessin.vb;
  const emax = Math.max(ECART_FLOU_MIN, ecartMax(vb)), dmax = decalageMax(vb);
  const flou = e?.flou, ombre = e?.ombre;
  const [code, poserCode] = useState<string | null>(null);
  const resume = [flou ? 'flou' : '', ombre ? 'ombre' : ''].filter(Boolean).join(', ');
  const ecartFlou = (v: number) => {
    const b = borne(v, ECART_FLOU_MIN, emax, 'Écart');
    poser({ flou: { ecart: b.v, ecartY: null } }, 'flou-ecart');
    annoncer(phraseFlou(b.v) + b.dit);
  };
  const ombreChamp = (r: Partial<OmbrePortee>, phrase: string, cle: string | null) => { poser({ ombre: r }, cle); annoncer(phrase); };
  const validerCode = () => {
    const hex = /^#?([0-9a-f]{6})$/i.exec((code ?? '').trim())?.[1];
    if (hex) ombreChamp({ couleur: '#' + hex.toLowerCase() }, 'Couleur de l’ombre : #' + hex.toLowerCase() + '.', null);
    poserCode(null);
  };
  return (
    <Section titre="Effets" ouverte={!!e} note={resume || undefined}>
      <label className="champ-ligne case-effet">
        <input type="checkbox" checked={!!flou} onChange={x => {
          poser({ flou: x.target.checked ? {} : null });
          annoncer(phraseFlou(x.target.checked ? flouParDefaut(vb).ecart : null));
        }} />
        <span>Flou</span>
      </label>
      {flou ? (
        <div className="reglages-effet" role="group" aria-label="Réglages du flou">
          <label className="champ-ligne">
            <span>Écart</span>
            <input type="range" min={0} max={100} step={1} value={Math.round(Math.sqrt(flou.ecart / emax) * 100)} aria-valuetext={nombreDit(flou.ecart)}
              onChange={x => { const t = Number(x.target.value) / 100; ecartFlou(Math.max(ECART_FLOU_MIN, Math.round(t * t * emax * 1000) / 1000)); }} onPointerUp={finir} onBlur={finir} />
          </label>
          <Nombre libelle="Écart du flou" valeur={flou.ecart} poser={v => { ecartFlou(v); finir(); }} />
          {flou.ecartY !== undefined
            ? <p className="aide">Flou inégal : {nombreDit(flou.ecart)} × {nombreDit(flou.ecartY)}. Régler l’écart le rend uniforme.</p>
            : null}
        </div>
      ) : null}
      <label className="champ-ligne case-effet">
        <input type="checkbox" checked={!!ombre} onChange={x => { poser({ ombre: x.target.checked ? {} : null }); annoncer(phraseOmbre(x.target.checked)); }} />
        <span>Ombre portée</span>
      </label>
      {ombre ? (
        <div className="reglages-effet" role="group" aria-label="Réglages de l’ombre portée">
          <div className="grille-2">
            <Nombre libelle="Décalage X" valeur={ombre.dx} poser={v => { const b = borne(v, -dmax, dmax, 'Décalage'); ombreChamp({ dx: b.v }, 'Décalage horizontal de l’ombre : ' + nombreDit(b.v) + '.' + b.dit, null); }} />
            <Nombre libelle="Décalage Y" valeur={ombre.dy} poser={v => { const b = borne(v, -dmax, dmax, 'Décalage'); ombreChamp({ dy: b.v }, 'Décalage vertical de l’ombre : ' + nombreDit(b.v) + '.' + b.dit, null); }} />
          </div>
          <Nombre libelle="Flou de l’ombre" valeur={ombre.ecart} poser={v => { const b = borne(v, 0, ecartMax(vb), 'Flou'); ombreChamp({ ecart: b.v }, 'Flou de l’ombre : ' + nombreDit(b.v) + '.' + b.dit, null); }} />
          <div className="champ-ligne">
            <span>Couleur</span>
            <input type="color" aria-label="Couleur de l’ombre" value={estHex(ombre.couleur) ? ombre.couleur : '#000000'} onChange={x => poser({ ombre: { couleur: x.target.value } }, 'ombre-couleur')} onBlur={finir} />
            <input type="text" aria-label="Couleur de l’ombre (code)" size={8} value={code ?? ombre.couleur} onChange={x => poserCode(x.target.value)} onBlur={validerCode} onKeyDown={x => { if (x.key === 'Enter') validerCode(); }} />
          </div>
          <label className="champ-ligne">
            <span>Opacité</span>
            <input type="range" min={0} max={100} step={1} value={Math.round(ombre.opacite * 100)} aria-valuetext={Math.round(ombre.opacite * 100) + ' %'}
              onChange={x => poser({ ombre: { opacite: Number(x.target.value) / 100 } }, 'ombre-opacite')} onPointerUp={finir} onBlur={finir} />
            <span className="aide">{Math.round(ombre.opacite * 100)} %</span>
          </label>
          <p className="aide">L’ombre ne tourne pas avec la forme.</p>
        </div>
      ) : null}
    </Section>
  );
}

/**
 * Dit quand une transformation a approche un flou inegal (ADR-0012, etape 7 : une rotation ou une inclinaison le rend uniforme, d'ecart
 * moyen, et le crochet de transformation n'a pas de canal pour le dire). Veille sur le dessin : d'un etat au suivant, un flou inegal
 * devenu uniforme se dit une fois (le geste suivant ne le redit pas : le flou est deja uniforme). Montee par la toile.
 */
export function useVeilleFlous(): void {
  const mo = useDessin(), ac = useActions();
  const avant = useRef(mo.dessin);
  useEffect(() => {
    const a = avant.current;
    avant.current = mo.dessin;
    if (flousApproches(a, mo.dessin) > 0) ac.dire(MSG_EFFETS_OPERATIONS.approche);
  }, [mo.dessin, ac]);
}

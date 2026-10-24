// L'inspecteur : les reglages de la selection, et les champs (couleur, nombre) que d'autres panneaux reprennent.

import { useEffect, useState } from 'react';
import {
  basculerSegment, diviserSegment, genrePointilles, modifier, modifierTrait, motifDeGenre, normaliserPointilles, opaciteDuContour, opaciteDuRemplissage, redimensionner,
  type Forme, type GenrePointilles, type Reglage, type ReglageTrait
} from '../engine/editionSvg.js';
import { Section } from './commun/Section.js';
import { NoeudsPoint, OutilsTrace } from './OutilsTrace.js';
import { arrondi, estHex } from './aidesEditeur.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import type { Teinte } from './typesEditeur.js';

/** Les reglages de la selection : apparence, position et taille, transformations chiffrees, points. Aligner, empiler, booleens et le reste vivent dans la barre de la selection. */
export function Inspecteur() {
  const mo = useDessin(), ac = useActions(), ui = useInterface();
  const { dessin, sel, boite } = mo;
  const premiere = dessin.formes.find(f => f.id === sel[0]);
  if (!premiere) return null;
  const choisies = dessin.formes.filter(f => mo.choisies.has(f.id));
  const mixte = (k: keyof Forme) => new Set(choisies.map(f => f[k])).size > 1;
  const regler = (r: Reglage, cle: string | null) => ac.appliquer(d => modifier(d, sel, r), cle === null ? ac.nouvelleCle() : cle + ':' + sel.join(','));
  const points = ui.outil === 'points' && mo.formeSeule;
  return (
    <>
      <h3>{sel.length > 1 ? sel.length + ' formes' : 'Forme ' + premiere.id.slice(1)}</h3>
      <Section titre="Apparence" ouverte>
        <Peinture libelle="Remplissage" valeur={premiere.remplissage} mixte={mixte('remplissage')} nuancier={mo.nuancier} finir={ac.finir} poser={(v, continu) => regler({ remplissage: v }, continu ? 'remplissage' : null)} />
        <Peinture libelle="Contour" valeur={premiere.contour} mixte={mixte('contour')} nuancier={mo.nuancier} finir={ac.finir} poser={(v, continu) => regler({ contour: v }, continu ? 'contour' : null)} />
        {premiere.contour ? <Nombre libelle="Épaisseur" valeur={premiere.epaisseur} min={0} poser={v => regler({ epaisseur: v }, null)} /> : null}
        {premiere.contour ? <StyleDeTrait forme={premiere} poser={r => ac.appliquer(d => modifierTrait(d, sel, r), ac.nouvelleCle())} /> : null}
        <Opacite libelle="Opacité" titre="La forme entière, fond et contour ensemble" valeur={premiere.opacite} poser={v => regler({ opacite: v }, 'opacite')} finir={ac.finir} />
        {premiere.remplissage && (premiere.contour || opaciteDuRemplissage(premiere) < 1) ? <Opacite libelle="Opacité du fond" titre="Le fond seul : le contour reste plein" valeur={opaciteDuRemplissage(premiere)} poser={v => regler({ opaciteRemplissage: v }, 'opacite-fond')} finir={ac.finir} /> : null}
        {premiere.contour ? <Opacite libelle="Opacité du contour" titre="Le contour seul : le fond reste plein" valeur={opaciteDuContour(premiere)} poser={v => regler({ opaciteContour: v }, 'opacite-contour')} finir={ac.finir} /> : null}
        <label className="champ-ligne">
          <span>Trous</span>
          <select value={premiere.regle} onChange={e => regler({ regle: e.target.value === 'evenodd' ? 'evenodd' : 'nonzero' }, null)}>
            <option value="nonzero">Selon le sens du tracé</option>
            <option value="evenodd">Pair-impair (chaque boucle creuse)</option>
          </select>
        </label>
      </Section>
      {boite ? (
        <Section titre="Position et taille" ouverte>
          <div className="grille-2">
            <Nombre libelle="X" valeur={boite.x} poser={v => ac.appliquer(d => redimensionner(d, sel, { ...boite, x: v }))} />
            <Nombre libelle="Y" valeur={boite.y} poser={v => ac.appliquer(d => redimensionner(d, sel, { ...boite, y: v }))} />
            <Nombre libelle="L" valeur={boite.l} min={0} poser={v => ac.appliquer(d => redimensionner(d, sel, { ...boite, l: v }))} />
            <Nombre libelle="H" valeur={boite.h} min={0} poser={v => ac.appliquer(d => redimensionner(d, sel, { ...boite, h: v }))} />
          </div>
        </Section>
      ) : null}
      <Section titre="Transformer" note="angle, échelle, inclinaison, contour">
        <TransformationsNumeriques />
        <OutilsTrace />
      </Section>
      {points ? <PanneauPoint forme={points} /> : null}
      <p className="aide">{sel.length === 1 && !points ? 'Double-cliquez la forme pour éditer ses points. ' : ''}Aligner, empiler, booléens, miroirs : la barre au-dessus de la toile.</p>
    </>
  );
}

/** Un curseur d'opacite, de 0 a 100 %. */
function Opacite({ libelle, titre, valeur, poser, finir }: { libelle: string; titre: string; valeur: number; poser: (v: number) => void; finir: () => void }) {
  return (
    <label className="champ-ligne" title={titre}>
      <span>{libelle}</span>
      <input type="range" min={0} max={100} value={Math.round(valeur * 100)} onChange={e => poser(Number(e.target.value) / 100)} onPointerUp={finir} onBlur={finir} />
      <span className="aide">{Math.round(valeur * 100)} %</span>
    </label>
  );
}

/** Tourner d'un angle, incliner, mettre a l'echelle : des champs qui s'appliquent a la validation, en relatif. */
function TransformationsNumeriques() {
  const ac = useActions();
  const [rotation, poserRotation] = useState('0');
  const [ix, poserIx] = useState('0');
  const [iy, poserIy] = useState('0');
  const [echelle, poserEchelle] = useState('100');
  const n = (t: string) => Number(t.replace(',', '.'));
  const appliquer = () => {
    ac.transformerNumerique({ rotation: n(rotation) || 0, inclinaisonX: n(ix) || 0, inclinaisonY: n(iy) || 0, echelle: n(echelle) || 100 });
    poserRotation('0'); poserIx('0'); poserIy('0'); poserEchelle('100');
  };
  const champ = (libelle: string, v: string, poser: (t: string) => void, titre: string) => (
    <label className="champ-ligne nombre" title={titre}><span>{libelle}</span><input type="text" inputMode="decimal" value={v} onChange={e => poser(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') appliquer(); }} /></label>
  );
  return (
    <div className="transformations-numeriques">
      <div className="grille-2">
        {champ('Rotation °', rotation, poserRotation, 'Angle, dans le sens horaire ; Maj en tirant la poignée ronde arrondit à 15°')}
        {champ('Échelle %', echelle, poserEchelle, 'Pourcentage, autour du centre')}
        {champ('Incl. X °', ix, poserIx, 'Inclinaison horizontale')}
        {champ('Incl. Y °', iy, poserIy, 'Inclinaison verticale')}
      </div>
      <button type="button" className="discret" onClick={appliquer}>Appliquer</button>
    </div>
  );
}

function PanneauPoint({ forme }: { forme: Forme }) {
  const ac = useActions(), ui = useInterface();
  const p = ui.point, c = p !== null ? forme.d[p] : undefined, suivante = p !== null ? forme.d[p + 1] : undefined;
  return (
    <Section titre={'Point' + (c && p !== null ? ' ' + (p + 1) + ' sur ' + forme.d.filter(x => x.c !== 'Z').length : '')} ouverte>
      {c && p !== null ? (
        <>
          <div className="boutons">
            <button type="button" disabled={!suivante || suivante.c === 'M' || suivante.c === 'Z'} onClick={() => ac.faire(d => diviserSegment(d, forme.id, p + 1))}>Ajouter un point après</button>
            <button type="button" disabled={c.c === 'M' || c.c === 'Z'} onClick={() => ac.faire(d => basculerSegment(d, forme.id, p))}>{c.c === 'L' ? 'Courber le segment' : 'Redresser le segment'}</button>
            <button type="button" className="danger" onClick={ac.supprimerSelection}>Supprimer le point</button>
          </div>
          <NoeudsPoint forme={forme} point={p} />
        </>
      ) : <p className="aide">Cliquez un point pour le régler ; glissez-le, ou ses poignées. Flèches : au millième du plan.</p>}
    </Section>
  );
}

/** Une couleur : selecteur, code, « aucune », et le nuancier. */
export function Peinture({ libelle, valeur, mixte, nuancier, poser, finir }: { libelle: string; valeur: string | null; mixte: boolean; nuancier: readonly Teinte[]; poser: (v: string | null, continu: boolean) => void; finir: () => void }) {
  const [texte, poserTexte] = useState(valeur ?? '');
  useEffect(() => { poserTexte(valeur ?? ''); }, [valeur]);
  const valider = () => {
    const t = texte.trim().toLowerCase();
    if (!t || t === 'none' || t === 'aucun') { if (valeur !== null) poser(null, false); return; }
    const hex = /^#?([0-9a-f]{6})$/.exec(t)?.[1];
    if (hex) poser('#' + hex, false); else poserTexte(valeur ?? '');
  };
  return (
    <div className="peinture" role="group" aria-label={libelle}>
      <span className="peinture-titre">{libelle}{mixte ? <span className="aide"> · mixte</span> : null}</span>
      <div className="champ-ligne">
        <input type="color" aria-label={libelle} value={estHex(valeur) ? valeur : '#000000'} onChange={e => poser(e.target.value, true)} onBlur={finir} />
        <input type="text" aria-label={libelle + ' (code)'} value={texte} placeholder="aucun" size={8} onChange={e => poserTexte(e.target.value)} onBlur={valider} onKeyDown={e => { if (e.key === 'Enter') valider(); }} />
        <button type="button" className="discret" aria-pressed={valeur === null} onClick={() => poser(null, false)}>Aucun</button>
      </div>
      {nuancier.length ? (
        <div className="nuancier" role="group" aria-label={libelle + ' : nuancier'}>
          {nuancier.map(t => <button key={t.hex} type="button" className="echantillon" title={t.nom + ' ' + t.hex.toUpperCase()} aria-label={t.nom} aria-pressed={valeur === t.hex} style={{ background: t.hex }} onClick={() => poser(t.hex, false)} />)}
        </div>
      ) : null}
    </div>
  );
}

export function Nombre({ libelle, valeur, poser, min }: { libelle: string; valeur: number; poser: (v: number) => void; min?: number }) {
  const [t, poserT] = useState(String(arrondi(valeur)));
  useEffect(() => { poserT(String(arrondi(valeur))); }, [valeur]);
  const valider = () => {
    const v = Number(t.replace(',', '.'));
    if (Number.isFinite(v) && v !== arrondi(valeur) && (min === undefined || v >= min)) poser(v);
    else poserT(String(arrondi(valeur)));
  };
  return (
    <label className="champ-ligne nombre">
      <span>{libelle}</span>
      <input type="text" inputMode="decimal" value={t} onChange={e => poserT(e.target.value)} onBlur={valider} onKeyDown={e => { if (e.key === 'Enter') valider(); }} />
    </label>
  );
}

/** Le style du trait : bout, jonction, et pointilles (plein, tirets, points, ou un motif libre). */
function StyleDeTrait({ forme, poser }: { forme: Forme; poser: (r: ReglageTrait) => void }) {
  const genre = genrePointilles(forme.pointilles);
  const motif = (forme.pointilles ?? []).join(' ');
  const [brut, poserBrut] = useState(motif);
  useEffect(() => { poserBrut(motif); }, [motif]);
  const choisirGenre = (g: GenrePointilles) => {
    if (g === genre) return;
    // Des points ne se voient qu'avec un bout rond : un trait de longueur nulle n'a pas de bout plat.
    poser({ pointilles: g === 'plein' ? null : motifDeGenre(g, forme.epaisseur), ...(g === 'pointilles' && !forme.bout ? { bout: 'round' as const } : {}) });
  };
  const validerBrut = () => {
    const liste = normaliserPointilles(brut.split(/[\s,]+/).filter(Boolean).map(Number));
    if (liste) poser({ pointilles: liste }); else poserBrut(motif);
  };
  const longueur = forme.pointilles?.[genre === 'pointilles' ? 1 : 0] ?? 0;
  return (
    <>
      <label className="champ-ligne">
        <span>Bout</span>
        <select value={forme.bout ?? 'butt'} onChange={e => poser({ bout: e.target.value === 'round' ? 'round' : e.target.value === 'square' ? 'square' : 'butt' })}>
          <option value="butt">Plat</option>
          <option value="round">Rond</option>
          <option value="square">Carré</option>
        </select>
      </label>
      <label className="champ-ligne">
        <span>Jonction</span>
        <select value={forme.jonction ?? 'round'} onChange={e => poser({ jonction: e.target.value === 'miter' ? 'miter' : e.target.value === 'bevel' ? 'bevel' : 'round' })}>
          <option value="round">Arrondie</option>
          <option value="miter">En pointe</option>
          <option value="bevel">Biseautée</option>
        </select>
      </label>
      {forme.jonction === 'miter' ? <Nombre libelle="Limite de pointe" valeur={forme.limiteMitre ?? 4} min={1} poser={v => poser({ limiteMitre: v })} /> : null}
      <label className="champ-ligne">
        <span>Style du trait</span>
        <select value={genre} onChange={e => choisirGenre(e.target.value === 'tirets' ? 'tirets' : e.target.value === 'pointilles' ? 'pointilles' : e.target.value === 'mixte' ? 'mixte' : 'plein')}>
          <option value="plein">Plein</option>
          <option value="tirets">Tirets</option>
          <option value="pointilles">Pointillés</option>
          <option value="mixte">Mixte</option>
        </select>
      </label>
      {genre === 'tirets' || genre === 'pointilles' ? <Nombre libelle={genre === 'tirets' ? 'Longueur des tirets' : 'Écart des points'} valeur={longueur} min={0.001} poser={v => poser({ pointilles: genre === 'tirets' ? [v, v] : [0, v] })} /> : null}
      {genre === 'mixte' ? (
        <label className="champ-ligne nombre" title="Trait, blanc, trait, blanc… séparés par des espaces">
          <span>Motif</span>
          <input type="text" aria-label="Motif des pointillés" value={brut} onChange={e => poserBrut(e.target.value)} onBlur={validerBrut} onKeyDown={e => { if (e.key === 'Enter') validerBrut(); }} />
        </label>
      ) : null}
      {genre !== 'plein' ? <Nombre libelle="Décalage du motif" valeur={forme.decalagePointilles ?? 0} poser={v => poser({ decalagePointilles: v })} /> : null}
    </>
  );
}

// L'inspecteur : les reglages de la selection, et les champs (couleur, nombre) que d'autres panneaux reprennent.

import { useEffect, useState } from 'react';
import {
  basculerSegment, diviserSegment, genrePointilles, groupeDe, modifier, modifierTrait, motifDeGenre, normaliserPointilles, opaciteDuContour, opaciteDuRemplissage,
  type Forme, type GenrePointilles, type Reglage, type ReglageTrait
} from '../engine/editionSvg.js';
import { Section } from './commun/Section.js';
import { NoeudsPoint, OutilsTrace } from './OutilsTrace.js';
import { estHex, genreAffiche } from './aidesEditeur.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useTactile } from './Vue.js';
import { pluriel, selonSaisie } from '../util/texte.js';
import { t } from '../util/i18n.js';
import { useReperes } from './contexteGuide.js';
import { Repere } from './Repere.js';
import type { Teinte } from './typesEditeur.js';
import { Nombre } from './commun/Nombre.js';
import { SectionTexte } from './InspecteurTexte.js';
import { SectionNuancier } from './SectionNuancier.js';
import { PeintureDegradable, useDegradesPermis } from './EditeurDegrade.js';
import { SectionEffets } from './SectionEffets.js';
import { SectionPositionTaille } from './SectionPositionTaille.js';
import { nomDeGroupe } from './phrasesGroupes.js';
import { lentilleDe } from './lentille.js';
import { RAISONS_LENTILLE } from './phrasesContenus.js';

// Le champ chiffre vit dans commun/Nombre.tsx (la section Texte s'en sert aussi) ; il se relit ici pour les autres panneaux.
export { Nombre };

/** Les reglages de la selection : apparence, position et taille, transformations chiffrees, points. Aligner, empiler, booleens et le reste vivent dans la barre de la selection. */
export function Inspecteur() {
  const mo = useDessin(), ac = useActions(), ui = useInterface(), degradesPermis = useDegradesPermis();
  const { dessin, sel, boite } = mo;
  const premiere = dessin.formes.find(f => f.id === sel[0]);
  // Un groupe choisi en premier (modele riche) : ses effets (ADR-0012, etape 8) ; ses feuilles se reglent en y entrant.
  if (!premiere) return <InspecteurGroupe />;
  const choisies = dessin.formes.filter(f => mo.choisies.has(f.id));
  const mixte = (k: keyof Forme) => new Set(choisies.map(f => f[k])).size > 1;
  const regler = (r: Reglage, cle: string | null) => ac.appliquer(d => modifier(d, sel, r), cle === null ? ac.nouvelleCle() : cle + ':' + sel.join(','));
  const points = ui.outil === 'points' && mo.formeSeule;
  const decoupe = lentilleDe(ui.contexte)?.genre === 'decoupe';
  const doigt = useTactile();
  return (
    <>
      <h3>{sel.length > 1 ? pluriel(sel.length, 'forme') : genreAffiche(premiere) + ' ' + premiere.id.slice(1)}</h3>
      <ReperesSelection points={!!points} />
      {/* Un texte vivant (ADR-0022) se retape et se restyle en tete : c'est ce qu'on vient y faire. */}
      {mo.formeSeule?.texte ? <SectionTexte forme={{ ...mo.formeSeule, texte: mo.formeSeule.texte }} /> : null}
      {/* Dans une decoupe (paquet 8-D), seule la geometrie compte : la regle des trous, et une phrase pour le reste. */}
      {decoupe ? (
        <Section titre={t('Apparence')} ouverte>
          <p className="aide">{RAISONS_LENTILLE.peinture}</p>
          <ChoixTrous valeur={premiere.regle} poser={r => regler({ regle: r }, null)} />
        </Section>
      ) : (
      <Section titre={t('Apparence')} ouverte>
        {/* Uni, ou un degrade (ADR-0012, etape 4) quand le modele riche est regle ou que le dessin l'est deja ; sinon le selecteur d'avant. */}
        <PeintureDegradable cote="remplissage" libelle={t('Remplissage')} forme={premiere}>
          <Peinture libelle={t('Remplissage')} sansTitre={degradesPermis} valeur={premiere.remplissage} mixte={mixte('remplissage')} nuancier={mo.nuancier} finir={ac.finir} poser={(v, continu) => regler({ remplissage: v }, continu ? 'remplissage' : null)} />
        </PeintureDegradable>
        <PeintureDegradable cote="contour" libelle={t('Contour')} forme={premiere}>
          <Peinture libelle={t('Contour')} sansTitre={degradesPermis} valeur={premiere.contour} mixte={mixte('contour')} nuancier={mo.nuancier} finir={ac.finir} poser={(v, continu) => regler({ contour: v }, continu ? 'contour' : null)} />
        </PeintureDegradable>
        {premiere.contour ? <Nombre libelle={t('Épaisseur')} valeur={premiere.epaisseur} min={0} poser={v => regler({ epaisseur: v }, null)} /> : null}
        {premiere.contour ? <StyleDeTrait forme={premiere} poser={r => ac.appliquer(d => modifierTrait(d, sel, r), ac.nouvelleCle())} /> : null}
        <Opacite libelle={t('Opacité')} titre={t('La forme entière, fond et contour ensemble')} valeur={premiere.opacite} poser={v => regler({ opacite: v }, 'opacite')} finir={ac.finir} />
        {premiere.remplissage && (premiere.contour || opaciteDuRemplissage(premiere) < 1) ? <Opacite libelle={t('Opacité du fond')} titre={t('Le fond seul : le contour reste plein')} valeur={opaciteDuRemplissage(premiere)} poser={v => regler({ opaciteRemplissage: v }, 'opacite-fond')} finir={ac.finir} /> : null}
        {premiere.contour ? <Opacite libelle={t('Opacité du contour')} titre={t('Le contour seul : le fond reste plein')} valeur={opaciteDuContour(premiere)} poser={v => regler({ opaciteContour: v }, 'opacite-contour')} finir={ac.finir} /> : null}
        <ChoixTrous valeur={premiere.regle} poser={r => regler({ regle: r }, null)} />
      </Section>
      )}
      {/* Flou et ombre portee (ADR-0012, etape 8), en modele riche seulement : a plat, rien. */}
      <SectionEffets />
      <SectionNuancier />
      {boite ? <SectionPositionTaille boite={boite} /> : null}
      <Section titre={t('Transformer')} note={t('angle, échelle, contour')}>
        <TransformationsNumeriques />
        <OutilsTrace />
      </Section>
      {points ? <PanneauPoint forme={points} /> : null}
      <p className="aide">{selonSaisie((sel.length === 1 && !points ? t('Double-cliquez la forme pour modifier son contour point par point. ') : '') + t('Aligner, empiler, assembler des formes (les unir, découper l’une dans l’autre), miroirs : la rangée au-dessus de la toile.'), doigt)}</p>
    </>
  );
}

/** La regle des trous : la seule « apparence » qui compte aussi dans une decoupe (son `clip-rule`). */
function ChoixTrous({ valeur, poser }: { valeur: Forme['regle']; poser: (r: Forme['regle']) => void }) {
  return (
    <label className="champ-ligne">
      <span>{t('Trous')}</span>
      <select value={valeur} onChange={e => poser(e.target.value === 'evenodd' ? 'evenodd' : 'nonzero')}>
        <option value="nonzero">{t('Selon le sens du tracé')}</option>
        <option value="evenodd">{t('Pair-impair (chaque boucle creuse)')}</option>
      </select>
    </label>
  );
}

/** L'inspecteur d'une selection qui commence par un groupe : son nom, puis ses effets ; rien pour ce qui n'est pas un groupe. */
function InspecteurGroupe() {
  const mo = useDessin();
  const [id] = mo.sel, g = id !== undefined ? groupeDe(mo.dessin, id) : undefined;
  if (!g) return null;
  return (
    <>
      <h3>{mo.sel.length > 1 ? pluriel(mo.sel.length, 'élément') : g.nom ? t('Groupe « {nom} »', { nom: g.nom }) : nomDeGroupe(g)}</h3>
      <SectionEffets />
      <p className="aide">{t('Entrée, ou un double-clic, entre dans le groupe pour régler ses formes.')}</p>
    </>
  );
}

/**
 * Le repere du premier assemblage de formes (ADR-0019) : apres un booleen, il n'y a plus qu'une forme, a la couleur de celle du
 * dessous. Celui des points vit dans la section du point (PanneauPoint).
 */
function ReperesSelection({ points }: { points: boolean }) {
  const { rencontres } = useReperes();
  if (points) return null;
  return rencontres.has('booleen') ? (
    <Repere id="booleen" titre={t('Les formes n’en font plus qu’une')}>
      {t('Le résultat est une seule forme, à la couleur de celle du dessous. Annuler (Ctrl+Z) rend les formes séparées.')}
    </Repere>
  ) : null;
}

/** Un curseur d'opacite, de 0 a 100 %. */
function Opacite({ libelle, titre, valeur, poser, finir }: { libelle: string; titre: string; valeur: number; poser: (v: number) => void; finir: () => void }) {
  return (
    <label className="champ-ligne" title={titre}>
      <span>{libelle}</span>
      <input type="range" min={0} max={100} value={Math.round(valeur * 100)} onChange={e => poser(Number(e.target.value) / 100)} onPointerUp={finir} onBlur={finir} />
      <span className="aide">{t('{n} %', { n: Math.round(valeur * 100) })}</span>

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
        {champ(t('Rotation °'), rotation, poserRotation, t('Angle, dans le sens horaire ; Maj en tirant la poignée ronde arrondit à 15°'))}
        {champ(t('Échelle %'), echelle, poserEchelle, t('Pourcentage, autour du centre'))}
        {champ(t('Incl. X °'), ix, poserIx, t('Inclinaison horizontale'))}
        {champ(t('Incl. Y °'), iy, poserIy, t('Inclinaison verticale'))}
      </div>
      <button type="button" className="discret" onClick={appliquer}>{t('Appliquer')}</button>
    </div>
  );
}

function PanneauPoint({ forme }: { forme: Forme }) {
  const ac = useActions(), ui = useInterface(), doigt = useTactile();
  const p = ui.point, c = p !== null ? forme.d[p] : undefined, suivante = p !== null ? forme.d[p + 1] : undefined;
  return (
    <Section titre={c && p !== null ? t('Point {rang} sur {total}', { rang: p + 1, total: forme.d.filter(x => x.c !== 'Z').length }) : t('Point')} ouverte>
      {/* Le repere des points vit ici, avec les reglages du point : il ne pousse pas le reste de l'inspecteur. */}
      <Repere id="points" titre={t('Modifier le contour point par point')}>
        {t('Les petits carrés sont les points du contour : glissez-en un pour changer la forme. Un point de courbe a des poignées rondes, qui règlent l’arrondi. L’outil sélection (V) rend la forme entière.')}
      </Repere>
      {c && p !== null ? (
        <>
          <div className="boutons">
            <button type="button" disabled={!suivante || suivante.c === 'M' || suivante.c === 'Z'} onClick={() => ac.faire(d => diviserSegment(d, forme.id, p + 1))}>{t('Ajouter un point après')}</button>
            <button type="button" disabled={c.c === 'M' || c.c === 'Z'} onClick={() => ac.faire(d => basculerSegment(d, forme.id, p))}>{c.c === 'L' ? t('Courber le segment') : t('Redresser le segment')}</button>
            <button type="button" className="danger" onClick={ac.supprimerSelection}>{t('Supprimer le point')}</button>
          </div>
          <NoeudsPoint forme={forme} point={p} />
        </>
      ) : <p className="aide">{selonSaisie(t('Cliquez un point pour le régler ; glissez-le, ou ses poignées. Flèches : au millième du plan.'), doigt)}</p>}
    </Section>
  );
}

/** Une couleur : selecteur, code, « aucune », et le nuancier. */
export function Peinture({ libelle, valeur, mixte, nuancier, poser, finir, sansTitre = false }: { libelle: string; valeur: string | null; mixte: boolean; nuancier: readonly Teinte[]; poser: (v: string | null, continu: boolean) => void; finir: () => void; sansTitre?: boolean }) {
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
      {/* Sous le choix Uni / Dégradé (EditeurDegrade.tsx), le titre est sa legende : il ne se repete pas. */}
      {sansTitre ? (mixte ? <span className="aide">{t('mixte')}</span> : null) : <span className="peinture-titre">{libelle}{mixte ? <span className="aide"> · {t('mixte')}</span> : null}</span>}
      <div className="champ-ligne">
        <input type="color" aria-label={libelle} value={estHex(valeur) ? valeur : '#000000'} onChange={e => poser(e.target.value, true)} onBlur={finir} />
        <input type="text" aria-label={t('{libelle} (code)', { libelle })} value={texte} placeholder={t('aucun')} size={8} onChange={e => poserTexte(e.target.value)} onBlur={valider} onKeyDown={e => { if (e.key === 'Enter') valider(); }} />
        <button type="button" className="discret" aria-pressed={valeur === null} onClick={() => poser(null, false)}>{t('Aucun')}</button>
      </div>
      {nuancier.length ? (
        <div className="nuancier" role="group" aria-label={t('{libelle} : nuancier', { libelle })}>
          {nuancier.map(te => <button key={te.hex} type="button" className="echantillon" title={t(te.nom) + ' ' + te.hex.toUpperCase()} aria-label={t(te.nom)} aria-pressed={valeur === te.hex} style={{ background: te.hex }} onClick={() => poser(te.hex, false)} />)}
        </div>
      ) : null}
    </div>
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
        <span>{t('Bout')}</span>
        <select value={forme.bout ?? 'butt'} onChange={e => poser({ bout: e.target.value === 'round' ? 'round' : e.target.value === 'square' ? 'square' : 'butt' })}>
          <option value="butt">{t('Plat')}</option>
          <option value="round">{t('Rond')}</option>
          <option value="square">{t('Carré')}</option>
        </select>
      </label>
      <label className="champ-ligne">
        <span>{t('Jonction')}</span>
        <select value={forme.jonction ?? 'round'} onChange={e => poser({ jonction: e.target.value === 'miter' ? 'miter' : e.target.value === 'bevel' ? 'bevel' : 'round' })}>
          <option value="round">{t('Arrondie')}</option>
          <option value="miter">{t('En pointe')}</option>
          <option value="bevel">{t('Biseautée')}</option>
        </select>
      </label>
      {forme.jonction === 'miter' ? <Nombre libelle={t('Limite de pointe')} valeur={forme.limiteMitre ?? 4} min={1} poser={v => poser({ limiteMitre: v })} /> : null}
      <label className="champ-ligne">
        <span>{t('Style du trait')}</span>
        <select value={genre} onChange={e => choisirGenre(e.target.value === 'tirets' ? 'tirets' : e.target.value === 'pointilles' ? 'pointilles' : e.target.value === 'mixte' ? 'mixte' : 'plein')}>
          <option value="plein">{t('Plein')}</option>
          <option value="tirets">{t('Tirets')}</option>
          <option value="pointilles">{t('Pointillés')}</option>
          <option value="mixte">{t('Mixte')}</option>
        </select>
      </label>
      {genre === 'tirets' || genre === 'pointilles' ? <Nombre libelle={genre === 'tirets' ? t('Longueur des tirets') : t('Écart des points')} valeur={longueur} min={0.001} poser={v => poser({ pointilles: genre === 'tirets' ? [v, v] : [0, v] })} /> : null}
      {genre === 'mixte' ? (
        <label className="champ-ligne nombre" title={t('Trait, blanc, trait, blanc… séparés par des espaces')}>
          <span>{t('Motif')}</span>
          <input type="text" aria-label={t('Motif des pointillés')} value={brut} onChange={e => poserBrut(e.target.value)} onBlur={validerBrut} onKeyDown={e => { if (e.key === 'Enter') validerBrut(); }} />
        </label>
      ) : null}
      {genre !== 'plein' ? <Nombre libelle={t('Décalage du motif')}
 valeur={forme.decalagePointilles ?? 0} poser={v => poser({ decalagePointilles: v })} /> : null}
    </>
  );
}

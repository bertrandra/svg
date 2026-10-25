// Le contexte de production dans l'editeur (ADR-0013) : le selecteur de la barre (et sa rubrique du menu « Plus » sur
// un telephone), le panneau « Pret pour Cricut » de l'inspecteur, et le gabarit du tapis sur la toile. Tout le calcul
// est dans engine/preparation.ts ; ici, ce qu'on voit et les gestes qui appellent les actions.

import { memo, useMemo } from 'react';
import { ecrireChemin, type Forme } from '../engine/editionSvg.js';
import { cadreTapis, etendueVisible, GRAVITES, LIBELLES_CORRECTION, texteTaille, unitesDePouces, type Constat, type Gravite } from '../engine/preparation.js';
import { CHOIX_GENERIQUE, CRICUT, NOMS_PROCEDE, type ChoixProduction, type Procede, type UniteLongueur } from '../model/contextes.js';
import { pluriel } from '../util/texte.js';
import { choixCricut, nomTapis, phraseReste } from './actionsProduction.js';
import { MenuDeroulant, type ElementMenu, type SectionMenu } from './commun/Menu.js';
import { Section } from './commun/Section.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useStockage } from './contexteStockage.js';
import { ExportCricut } from './FinCricut.js';
import { libelleSelecteur, phraseCouches } from './parcoursCricut.js';
import { Repere } from './Repere.js';

const NOMS_GRAVITE: Readonly<Record<Gravite, string>> = { bloquant: 'Bloquant', 'a-corriger': 'À corriger', conseil: 'Conseil' };
// Le millimetre d'abord : c'est l'unite par defaut d'une interface francaise ; le pouce (celle de Design Space) reste au choix.
const UNITES: ReadonlyArray<readonly [UniteLongueur, string]> = [['mm', 'Millimètres'], ['in', 'Pouces']];
const PROCEDES: readonly Procede[] = ['decoupe', 'imprimer-decouper'];

/**
 * Les rubriques du choix de machine : la machine d'abord (« Générique » ou une Cricut : c'est le choix qui compte), puis, en Cricut,
 * le tapis, le materiau, le procede et l'unite. Les materiaux annonces tiennent sur une ligne inactive (« Bientôt : … ») plutot que
 * sur trois choix grises qui allongeaient le menu sans rien offrir.
 */
export function useRubriquesProduction(): SectionMenu[] {
  const { production: c } = useInterface(), ac = useActions(), stockage = useStockage();
  const radio = (id: string, libelle: string, coche: boolean, choix: ChoixProduction, desactive = false): ElementMenu =>
    ({ id, libelle, radio: true, coche, desactive, onClick: () => { if (!coche) ac.poserProduction(choix); } });
  const cricut = c.contexte === 'cricut' ? c : null;
  const machines: SectionMenu = {
    id: 'machine', titre: 'Machine',
    elements: [
      radio('contexte-generique', 'Générique (aucune machine)', !cricut, CHOIX_GENERIQUE),
      ...CRICUT.machines.map(m => radio('machine-' + m.id, 'Cricut ' + m.nom, cricut?.machine === m.id, cricut ? { ...cricut, machine: m.id } : choixCricut(stockage, m.id)))
    ]
  };
  if (!cricut) return [machines];
  const machine = CRICUT.machines.find(m => m.id === cricut.machine);
  const bientot = CRICUT.materiaux.filter(m => !m.disponible).map(m => m.nom.toLowerCase());
  return [
    machines,
    { id: 'tapis', titre: 'Tapis', elements: (machine?.tapis ?? []).map(id => radio('tapis-' + id, CRICUT.tapis.find(t => t.id === id)?.nom ?? id, cricut.tapis === id, { ...cricut, tapis: id })) },
    {
      id: 'materiau', titre: 'Matériau',
      elements: [
        ...CRICUT.materiaux.filter(m => m.disponible).map(m => radio('materiau-' + m.id, m.nom, cricut.materiau === m.id, { ...cricut, materiau: m.id })),
        ...(bientot.length ? [{ id: 'materiau-bientot', libelle: 'Bientôt : ' + bientot.join(', '), desactive: true } satisfies ElementMenu] : [])
      ]
    },
    { id: 'procede', titre: 'Procédé', elements: PROCEDES.map(p => radio('procede-' + p, NOMS_PROCEDE[p], cricut.procede === p, { ...cricut, procede: p }, !machine?.procedes.includes(p))) },
    { id: 'unite', titre: 'Unité', elements: UNITES.map(([u, nom]) => radio('unite-' + u, nom, cricut.unite === u, { ...cricut, unite: u })) }
  ];
}

/**
 * Le selecteur de machine de la barre (bureau) : un menu de rubriques a choix unique. Son bouton dit ce qu'il fait (« Machine :
 * Générique », « Cricut Maker · 12 × 12 ») ; son infobulle detaille le materiau et l'unite.
 */
export const SelecteurContexte = memo(function SelecteurContexte() {
  const { production, profil } = useInterface();
  const rubriques = useRubriquesProduction();
  const libelle = libelleSelecteur(production);
  const titre = profil ? libelle + ', ' + profil.materiau.nom.toLowerCase() + ', en ' + (profil.unite === 'in' ? 'pouces' : 'millimètres') : 'Machine : Générique, le dessin n’est jugé pour aucune machine';
  return (
    <div className="groupe production" role="group" aria-label="Machine de découpe">
      <MenuDeroulant etiquette={titre} libelle={libelle} icone="machine" alignement="droite" sections={rubriques} className="selecteur-contexte" />
    </div>
  );
});

/** Une ligne de constat : la phrase, et ses gestes (corriger, choisir les formes, changer de tapis). */
function LigneConstat({ c }: { c: Constat }) {
  const ac = useActions(), { production } = useInterface();
  const dit = /à vérifier|à tester/.test(c.message);
  return (
    <li className={'constat constat-' + c.gravite}>
      <p>{c.message}{c.aVerifier && !dit ? <span className="a-verifier"> (à vérifier)</span> : null}</p>
      {c.correction || c.formes.length || c.tapis ? (
        <div className="boutons">
          {c.correction ? <button type="button" onClick={() => ac.corrigerConstat(c.code)}>{LIBELLES_CORRECTION[c.correction]}</button> : null}
          {c.tapis && production.contexte === 'cricut' ? <button type="button" onClick={() => ac.poserProduction({ ...production, tapis: c.tapis ?? production.tapis })}>Passer au {nomTapis(c.tapis)}</button> : null}
          {c.formes.length ? <button type="button" className="discret" aria-label={'Choisir les formes en cause (' + pluriel(c.formes.length, 'forme') + ')'} onClick={() => { ac.choisir([...c.formes]); ac.dire(pluriel(c.formes.length, 'forme') + ' choisie' + (c.formes.length > 1 ? 's' : '') + '.'); }}>Choisir les formes</button> : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Le panneau « Pret pour Cricut » : le profil, la taille finale et les couches en permanence, les constats classes par
 * gravite avec leur correction, et l'export, seule action primaire. Absent en Generique.
 */
export function PanneauCricut({ nom }: { nom: string }) {
  const { preparation } = useDessin(), { profil } = useInterface();
  if (!profil) return null;
  const constats = preparation?.constats ?? [];
  const ptc = profil.procede === 'imprimer-decouper';
  const statut = !preparation ? 'analyse…' : constats.length ? pluriel(constats.length, 'constat') : 'prêt';
  return (
    <div className="panneau-cricut">
      <Section titre={ptc ? 'Prêt pour Print Then Cut' : 'Prêt pour Cricut'} ouverte note={statut}>
        <p className="aide">{profil.machine.nom} · {profil.tapis.nom} · {profil.materiau.nom}{ptc ? ' · Print Then Cut' : ''}</p>
        <Repere id="cricut" titre="Ce panneau prépare la découpe">
          Il vérifie le dessin pour votre machine : chaque constat dit ce qui se découperait mal et propose une correction, que Ctrl+Z annule. Le tapis s’affiche sous le dessin ; la machine découpe ce qui tient dans les pointillés.
        </Repere>
        {preparation ? (
          <dl className="resume-cricut">
            <dt>Taille finale</dt>
            <dd>{preparation.taille ? texteTaille(preparation.taille.l, preparation.taille.h, profil.unite) : 'aucune forme'}</dd>
            <dt>{ptc ? 'Couleurs' : 'Couches'}</dt>
            <dd>
              {ptc ? pluriel(preparation.couches.length, 'couleur') + ', imprimées ensemble' : phraseCouches(preparation.couches.length)}
              <span className="pastilles" aria-hidden="true">{preparation.couches.slice(0, 12).map(x => <span key={x.couleur} className="pastille" style={{ background: x.couleur }} />)}</span>
            </dd>
          </dl>
        ) : <p className="aide" role="status">Analyse du dessin…</p>}
        {preparation && !constats.length ? (
          <>
            <p className="pret">{phraseReste(0, profil.procede)}</p>
            <p className="aide">Rien à corriger. « Exporter pour Cricut » écrit {ptc ? 'l’image à imprimer et sa ligne de coupe' : 'le fichier à importer dans Design Space'}.</p>
          </>
        ) : null}
        {GRAVITES.map(g => {
          const liste = constats.filter(c => c.gravite === g);
          return liste.length ? (
            <div key={g} className={'gravite gravite-' + g}>
              {/* Focalisable par programme : « Revoir », depuis la confirmation d'export, y mene. */}
              <p className="titre-gravite" tabIndex={-1}>{NOMS_GRAVITE[g]} ({liste.length})</p>
              <ul className="constats">{liste.map(c => <LigneConstat key={c.code} c={c} />)}</ul>
            </div>
          ) : null;
        })}
        <ExportCricut nom={nom} />
        <details className="aide-cricut">
          <summary>Couper, dessiner, rainer</summary>
          {CRICUT.typesDeLigne.map(t => <p key={t} className="aide">{t}</p>)}
          <p className="aide">Le SVG enregistré garde l’échelle de l’écran (96 unités par pouce) et le contexte ; pour Design Space, utilisez « Exporter pour Cricut », qui écrit la taille en {profil.unite === 'in' ? 'pouces' : 'millimètres'}.</p>
        </details>
      </Section>
    </div>
  );
}

const cheminsDeZones = new WeakMap<Constat, string>();
const cheminDeZones = (c: Constat): string => {
  let d = cheminsDeZones.get(c);
  if (d === undefined) { d = ecrireChemin(c.zones ?? [], 3); cheminsDeZones.set(c, d); }
  return d;
};

/**
 * Le gabarit du tapis sur la toile : le support, sa zone utile (pointilles) et un quadrillage au pouce, la zone utile
 * calee sur le coin haut gauche du dessin (la ou Design Space pose les pieces). Dessous les formes.
 */
export const GabaritTapis = memo(function GabaritTapis() {
  const { preparation } = useDessin(), { profil } = useInterface();
  if (!profil || profil.procede !== 'decoupe' || !preparation) return null;
  const z = profil.zoneUtile;
  const etendue = etendueVisible(preparation.dessin);
  const origine = etendue ?? { x: preparation.dessin.vb[0], y: preparation.dessin.vb[1] };
  // Le meme cadre que celui que « Ajuster » montre (cadreTapis) : la vue cadre exactement le tapis dessine.
  const { x: x0, y: y0, l, h } = cadreTapis(profil, origine), pouce = unitesDePouces(1);
  return (
    <g className="gabarit" pointerEvents="none" aria-hidden="true">
      <defs>
        <pattern id="gabarit-pouce" patternUnits="userSpaceOnUse" x={x0} y={y0} width={pouce} height={pouce}>
          <path className="gabarit-quadrillage" d={`M${pouce} 0L0 0L0 ${pouce}`} fill="none" />
        </pattern>
      </defs>
      <rect className="gabarit-tapis" x={x0} y={y0} width={l} height={h} />
      <rect x={x0} y={y0} width={l} height={h} fill="url(#gabarit-pouce)" />
      <rect className="gabarit-zone" x={origine.x} y={origine.y} width={z.l} height={z.h} />
    </g>
  );
});

/** Par-dessus les formes : les formes qui debordent du tapis, et les parties trop fines, surlignees. */
export const AlertesToile = memo(function AlertesToile({ chemin }: { chemin: (f: Forme) => string }) {
  const { preparation } = useDessin();
  const parId = useMemo(() => new Map((preparation?.dessin.formes ?? []).map(f => [f.id, f])), [preparation]);
  if (!preparation) return null;
  const debordent = preparation.constats.filter(c => c.code === 'piece-trop-grande' || c.code === 'depassement').flatMap(c => c.formes);
  const fines = preparation.constats.find(c => c.code === 'detail-fin');
  return (
    <g className="alertes-toile" pointerEvents="none" aria-hidden="true">
      {debordent.map(id => { const f = parId.get(id); return f ? <path key={id} className="forme-debordante" d={chemin(f)} /> : null; })}
      {fines?.zones?.length ? <path className="zone-fine" d={cheminDeZones(fines)} /> : null}
    </g>
  );
});

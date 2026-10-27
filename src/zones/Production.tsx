// Le contexte de production dans l'editeur (ADR-0013) : le selecteur de la barre (et sa rubrique du menu « Plus » sur
// un telephone), le panneau « Pret pour Cricut » de l'inspecteur, et le gabarit du tapis sur la toile. Tout le calcul
// est dans engine/preparation.ts ; ici, ce qu'on voit et les gestes qui appellent les actions.

import { memo, useMemo } from 'react';
import { ecrireChemin, type Forme } from '../engine/editionSvg.js';
import { etendueVisible, feuillePartielle, feuilleSurTapis, gabaritDuTapis, GRAVITES, LIBELLES_CORRECTION, texteTaille, unitesDePouces, type Constat, type Gravite } from '../engine/preparation.js';
import { CHOIX_GENERIQUE, CRICUT, NOMS_PROCEDE, OUTILS_A_VENIR, type ChoixProduction, type Procede, type UniteLongueur } from '../model/contextes.js';
import { pluriel } from '../util/texte.js';
import { choixCricut, nomTapis, phraseReste } from './actionsProduction.js';
import { MenuDeroulant, type ElementMenu, type SectionMenu } from './commun/Menu.js';
import { Section } from './commun/Section.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useStockage } from './contexteStockage.js';
import { ExportCricut } from './FinCricut.js';
import { operationsPeintes } from '../export/operations.js';
import { libelleSelecteur, phraseCouches } from './parcoursCricut.js';
import { Repere } from './Repere.js';
import { ReglagesTapis } from './ReglagesTapis.js';
import { useActionsRegles, useRegles } from './contexteRegles.js';
import { t } from '../util/i18n.js';

// Des fonctions, pas des constantes : les libelles se traduisent au rendu, quand le dictionnaire de la langue est pose (ADR-0042).
const nomsGravite = (): Readonly<Record<Gravite, string>> => ({ bloquant: t('Bloquant'), 'a-corriger': t('À corriger'), conseil: t('Conseil') });
// Le millimetre d'abord : c'est l'unite par defaut d'une interface francaise ; le pouce (celle de Design Space) reste au choix.
const unites = (): ReadonlyArray<readonly [UniteLongueur, string]> => [['mm', t('Millimètres')], ['in', t('Pouces')]];
const PROCEDES: readonly Procede[] = ['decoupe', 'imprimer-decouper', 'dessin-stylo'];

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
    id: 'machine', titre: t('Machine'),
    elements: [
      radio('contexte-generique', t('Générique (aucune machine)'), !cricut, CHOIX_GENERIQUE),
      ...CRICUT.machines.map(m => radio('machine-' + m.id, t('Cricut {nom}', { nom: m.nom }), cricut?.machine === m.id, cricut ? { ...cricut, machine: m.id } : choixCricut(stockage, m.id)))
    ]
  };
  if (!cricut) return [machines];
  const machine = CRICUT.machines.find(m => m.id === cricut.machine);
  const bientot = CRICUT.materiaux.filter(m => !m.disponible).map(m => t(m.nom).toLowerCase());
  return [
    machines,
    { id: 'tapis', titre: t('Tapis'), elements: (machine?.tapis ?? []).map(id => radio('tapis-' + id, t(CRICUT.tapis.find(x => x.id === id)?.nom ?? id), cricut.tapis === id, { ...cricut, tapis: id })) },
    {
      id: 'materiau', titre: t('Matériau'),
      elements: [
        ...CRICUT.materiaux.filter(m => m.disponible).map(m => radio('materiau-' + m.id, t(m.nom), cricut.materiau === m.id, { ...cricut, materiau: m.id })),
        ...(bientot.length ? [{ id: 'materiau-bientot', libelle: t('Bientôt : {liste}', { liste: bientot.join(', ') }), desactive: true } satisfies ElementMenu] : [])
      ]
    },
    {
      id: 'procede', titre: t('Procédé'),
      elements: [
        ...PROCEDES.map(p => radio('procede-' + p, t(NOMS_PROCEDE[p]), cricut.procede === p, { ...cricut, procede: p }, !machine?.procedes.includes(p))),
        // Les outils a venir (gravure, dorure) suivent la logique du stylo : annonces sur une ligne inactive, comme les materiaux.
        { id: 'procede-bientot', libelle: t('Bientôt : {liste}', { liste: OUTILS_A_VENIR.map(o => t(o.nom)).join(', ') }), desactive: true } satisfies ElementMenu
      ]
    },
    { id: 'unite', titre: t('Unité'), elements: unites().map(([u, nom]) => radio('unite-' + u, nom, cricut.unite === u, { ...cricut, unite: u })) }
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
  const titre = profil ? t('{libelle}, {materiau}, en {unite}', { libelle, materiau: t(profil.materiau.nom).toLowerCase(), unite: profil.unite === 'in' ? t('pouces') : t('millimètres') }) : t('Machine : Générique, le dessin n’est jugé pour aucune machine');
  return (
    <div className="groupe production" role="group" aria-label={t('Machine de découpe')}>
      <MenuDeroulant etiquette={titre} libelle={libelle} icone="machine" alignement="droite" sections={rubriques} className="selecteur-contexte" />
    </div>
  );
});

/** Une ligne de constat : la phrase, et ses gestes (corriger, choisir les formes, changer de tapis). */
function LigneConstat({ c }: { c: Constat }) {
  const ac = useActions(), { production } = useInterface(), rg = useRegles(), arg = useActionsRegles();
  const dit = /à vérifier|à tester/.test(c.message);
  return (
    <li className={'constat constat-' + c.gravite}>
      <p>{c.message}{c.aVerifier && !dit ? <span className="a-verifier">{t(' (à vérifier)')}</span> : null}</p>
      {c.correction || c.formes.length || c.tapis ? (
        <div className="boutons">
          {/* Les liens des ilots (ADR-0040) suivent les reglages de la session ; « Régler les liens… » les montre, les formes choisies. */}
          {c.correction ? <button type="button" onClick={() => (c.code === 'ilot' ? ac.ajouterLiens(rg.liens, c.formes) : ac.corrigerConstat(c.code))}>{t(LIBELLES_CORRECTION[c.correction])}</button> : null}
          {c.code === 'ilot' ? <button type="button" onClick={() => { ac.choisir([...c.formes]); arg.ouvrir('liens'); }}>{t('Régler les liens…')}</button> : null}
          {(c.autres ?? []).map(k => <button key={k} type="button" onClick={() => ac.corrigerConstat(c.code, k)}>{t(LIBELLES_CORRECTION[k])}</button>)}
          {c.tapis && production.contexte === 'cricut' ? <button type="button" onClick={() => ac.poserProduction({ ...production, tapis: c.tapis ?? production.tapis })}>{t('Passer au {tapis}', { tapis: nomTapis(c.tapis) })}</button> : null}
          {c.formes.length ? <button type="button" className="discret" aria-label={t('Choisir les formes en cause ({formes})', { formes: pluriel(c.formes.length, 'forme') })} onClick={() => { ac.choisir([...c.formes]); const formes = pluriel(c.formes.length, 'forme'); ac.dire(c.formes.length > 1 ? t('{formes} choisies.', { formes }) : t('{formes} choisie.', { formes })); }}>{t('Choisir les formes')}</button> : null}
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
  const ptc = profil.procede === 'imprimer-decouper', stylo = profil.procede === 'dessin-stylo';
  const statut = !preparation ? t('analyse…') : constats.length ? pluriel(constats.length, 'constat') : t('prêt');
  return (
    <div className="panneau-cricut">
      <Section titre={ptc ? t('Prêt pour Print Then Cut') : stylo ? t('Prêt pour le stylo') : t('Prêt pour Cricut')} ouverte note={statut}>
        <p className="aide">{t(profil.machine.nom)} · {t(profil.tapis.nom)} · {t(profil.materiau.nom)}{ptc ? ' · Print Then Cut' : stylo ? t(' · Dessin au stylo') : ''}</p>
        <Repere id="cricut" titre={t('Ce panneau prépare la découpe')}>
          {t('Il vérifie le dessin pour votre machine : chaque constat dit ce qui se découperait mal et propose une correction, que Ctrl+Z annule. Le tapis s’affiche sous le dessin ; la machine découpe ce qui tient dans les pointillés.')}
        </Repere>
        <ReglagesTapis />
        {preparation ? (
          <dl className="resume-cricut">
            <dt>{t('Taille finale')}</dt>
            <dd>{preparation.taille ? texteTaille(preparation.taille.l, preparation.taille.h, profil.unite) : t('aucune forme')}</dd>
            <dt>{ptc ? t('Couleurs') : stylo ? t('Stylos') : t('Couches')}</dt>
            <dd>
              {ptc ? t('{couleurs}, imprimées ensemble', { couleurs: pluriel(preparation.couches.length, 'couleur') }) : stylo ? t('{couleurs} : {stylos}', { couleurs: pluriel(preparation.couches.length, 'couleur'), stylos: pluriel(preparation.couches.length, 'stylo') }) : phraseCouches(preparation.couches.length)}
              <span className="pastilles" aria-hidden="true">{preparation.couches.slice(0, 12).map(x => <span key={x.couleur} className="pastille" style={{ background: x.couleur }} />)}</span>
            </dd>
            <ResumeOperations />
          </dl>
        ) : <p className="aide" role="status">{t('Analyse du dessin…')}</p>}
        {preparation && !constats.length ? (
          <>
            <p className="pret">{phraseReste(0, profil.procede)}</p>
            <p className="aide">{t('Rien à corriger.')} {stylo ? t('« Exporter pour le stylo » écrit les traits à dessiner, sans remplissage.') : ptc ? t('« Exporter pour Cricut » écrit l’image à imprimer et sa ligne de coupe.') : t('« Exporter pour Cricut » écrit le fichier à importer dans Design Space.')}</p>
          </>
        ) : null}
        {GRAVITES.map(g => {
          const liste = constats.filter(c => c.gravite === g);
          return liste.length ? (
            <div key={g} className={'gravite gravite-' + g}>
              {/* Focalisable par programme : « Revoir », depuis la confirmation d'export, y mene. */}
              <p className="titre-gravite" tabIndex={-1}>{nomsGravite()[g]} ({liste.length})</p>
              <ul className="constats">{liste.map(c => <LigneConstat key={c.code} c={c} />)}</ul>
            </div>
          ) : null;
        })}
        <ExportCricut nom={nom} />
        <details className="aide-cricut">
          <summary>{t('Couper, dessiner, rainer')}</summary>
          {CRICUT.typesDeLigne.map(ligne => <p key={ligne} className="aide">{t(ligne)}</p>)}
          <p className="aide">{t('Le SVG enregistré garde l’échelle de l’écran (96 unités par pouce) et le contexte ; pour Design Space, utilisez « Exporter pour Cricut », qui écrit la taille en {unite}.', { unite: profil.unite === 'in' ? t('pouces') : t('millimètres') })}</p>
        </details>
      </Section>
    </div>
  );
}

/**
 * Ce que la machine fait du dessin quand il mele couper et ecrire (ADR-0028) : combien de formes de chaque cote, et ce que l'export
 * livrera. Rien quand une seule operation compte : le panneau dit deja tout.
 */
function ResumeOperations() {
  const { preparation } = useDessin(), { profil } = useInterface();
  if (!preparation || !profil) return null;
  const n = operationsPeintes(preparation.dessin, profil);
  if (!n.decoupe || !n.ecriture) return null;
  return (
    <>
      <dt>{t('Opérations')}</dt>
      <dd>{t('{decoupe} à couper · {ecriture} à écrire : un fichier pour chaque', { decoupe: n.decoupe, ecriture: n.ecriture })}</dd>

    </>
  );
}

const cheminsDeZones = new WeakMap<Constat, string>();
const cheminDeZones = (c: Constat): string => {
  let d = cheminsDeZones.get(c);
  if (d === undefined) { d = ecrireChemin(c.zones ?? [], 3); cheminsDeZones.set(c, d); }
  return d;
};

/**
 * Le gabarit du tapis sur la toile : le support, sa zone utile (pointilles), un quadrillage au pouce et la feuille posee dessus
 * quand elle ne couvre pas tout le tapis. Avec le recalage automatique, la zone utile calee sur le coin haut gauche du dessin (la ou
 * Design Space pose les pieces) ; sans (ADR-0039), le tapis fixe au coin du plan de travail. Dessous les formes.
 */
export const GabaritTapis = memo(function GabaritTapis() {
  const { preparation } = useDessin(), { profil } = useInterface();
  if (!profil || profil.procede === 'imprimer-decouper' || !preparation) return null;
  // Le meme cadre que celui que « Ajuster » montre (gabaritDuTapis) : la vue cadre exactement le tapis dessine.
  const { tapis, zone } = gabaritDuTapis(profil, preparation.dessin, etendueVisible(preparation.dessin));
  const { x: x0, y: y0, l, h } = tapis, pouce = unitesDePouces(1);
  const feuille = feuillePartielle(profil) ? feuilleSurTapis(profil, tapis) : null;
  return (
    <g className="gabarit" pointerEvents="none" aria-hidden="true" data-recalage={profil.recalage ? undefined : 'non'}>
      <defs>
        <pattern id="gabarit-pouce" patternUnits="userSpaceOnUse" x={x0} y={y0} width={pouce} height={pouce}>
          <path className="gabarit-quadrillage" d={`M${pouce} 0L0 0L0 ${pouce}`} fill="none" />
        </pattern>
      </defs>
      <rect className="gabarit-tapis" x={x0} y={y0} width={l} height={h} />
      <rect x={x0} y={y0} width={l} height={h} fill="url(#gabarit-pouce)" />
      <rect className="gabarit-zone" x={zone.x} y={zone.y} width={zone.l} height={zone.h} />
      {feuille ? <rect className="gabarit-feuille" x={feuille.x} y={feuille.y} width={feuille.l} height={feuille.h} /> : null}
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

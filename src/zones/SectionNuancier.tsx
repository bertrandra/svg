// La section « Nuancier » de l'inspecteur (ADR-0037), avec ou sans selection : deux groupes de pastilles qui ne s'effacent pas
// l'un l'autre. « Couleurs du dessin » : le nuancier tire du fichier ouvert (SVG, PDF, image convertie) ou d'une selection, que
// l'on remplace, complete, reprend du dessin ou exporte. « Nuancier proposé » : celui que la page ou l'hote donne (la liste tapee
// « Nom #rrggbb » de l'accueil, l'option `nuancier` d'un hote).
//
// Un clic pose la couleur sur le remplissage des formes choisies, Maj+clic sur leur contour ; « Appliquer au » inverse les deux,
// pour le clavier et le doigt. Sans selection, la couleur va aux formes nouvelles. Les pastilles montrent les couleurs du dessin,
// pas des couleurs d'interface : leur fond est la donnee elle-meme, leur bord le filet fort, comme toutes les pastilles.

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { nuancierEffectif } from '../engine/nuancier.js';
import { nomDeCouleur } from '../model/nomsCouleurs.js';
import type { ProvenanceNuancier } from '../model/nuancier.js';
import { selonSaisie } from '../util/texte.js';
import { t } from '../util/i18n.js';
import { EtatVide } from './commun/EtatVide.js';
import { focusAuClavier } from './commun/focusClavier.js';
import { MenuDeroulant, type ElementMenu } from './commun/Menu.js';
import { Section } from './commun/Section.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useTactile } from './Vue.js';
import {
  creerNuancierDepuisSelection, exporterNuancier, nomDeTeinte, poserTeinte, RACCOURCI_AJOUTER, RACCOURCI_REMPLACER, reprendreNuancierDuDessin, type CibleTeinte
} from './actionsNuancier.js';

/** Une pastille : son code, son nom accessible (nom, code, opacite). */
interface Pastille { readonly hex: string; readonly nom: string }

// Dites au rendu (la langue n'est posee qu'apres le chargement des modules).
const PROVENANCES: Readonly<Record<ProvenanceNuancier, () => string>> = { dessin: () => t('tirées du dessin'), selection: () => t('de la sélection'), mixte: () => t('du dessin et de la sélection') };

const autre = (c: CibleTeinte): CibleTeinte => (c === 'remplissage' ? 'contour' : 'remplissage');

/** Les fleches parcourent les pastilles d'un groupe (Debut et Fin aux bouts), comme les pastilles d'evenements. */
function parcourir(e: KeyboardEvent<HTMLDivElement>) {
  const pas = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
  if (!pas && e.key !== 'Home' && e.key !== 'End') return;
  const liste = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button.echantillon'));
  const i = liste.indexOf(e.target as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const j = e.key === 'Home' ? 0 : e.key === 'End' ? liste.length - 1 : (i + pas + liste.length) % liste.length;
  focusAuClavier(liste[j]);
}

interface ProprietesGroupe {
  titre: string; note: string; pastilles: readonly Pastille[]; pressee: string | null;
  poser: (p: Pastille, inverse: boolean) => void; aide: string; outils?: ReactNode; vide?: ReactNode;
}

/** Un groupe titre de pastilles : un clic pose la couleur sur la cible, Maj+clic (ou Maj+Entree) sur l'autre. */
function GroupeTeintes({ titre, note, pastilles, pressee, poser, aide, outils, vide }: ProprietesGroupe) {
  const id = useId();
  return (
    <div className="nuancier-groupe" role="group" aria-labelledby={id}>
      <div className="nuancier-tete">
        <p className="nuancier-titre" id={id}>{titre} <span className="aide">{note}</span></p>
        {outils ? <span className="nuancier-outils">{outils}</span> : null}
      </div>
      {pastilles.length ? (
        <div className="nuancier" onKeyDown={parcourir}>
          {pastilles.map(p => (
            <button key={p.hex} type="button" className="echantillon" aria-label={p.nom} title={p.nom + ' · ' + aide} aria-pressed={pressee === p.hex} style={{ background: p.hex }}
              onClick={e => poser(p, e.shiftKey)}
              onKeyDown={e => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); poser(p, true); } }} />
          ))}
        </div>
      ) : vide}
    </div>
  );
}

/** Le menu du nuancier du dessin : le reprendre de tout le dessin, l'exporter. */
function MenuNuancierDessin({ vide }: { vide: boolean }) {
  const mo = useDessin(), ac = useActions();
  const exporter = (format: 'gpl' | 'ase') => { void exporterNuancier(nuancierEffectif(mo.dessin).teintes, format).then(ac.dire); };
  const elements: ElementMenu[] = [
    { id: 'nuancier-reprendre', libelle: t('Reprendre les couleurs de tout le dessin'), icone: 'palette', onClick: () => reprendreNuancierDuDessin(ac, mo.dessin) },
    { id: 'nuancier-gpl', libelle: t('Exporter en .gpl (GIMP, Inkscape)'), icone: 'exporter', separateur: true, desactive: vide, onClick: () => exporter('gpl') },
    { id: 'nuancier-ase', libelle: t('Exporter en .ase (Adobe)'), desactive: vide, onClick: () => exporter('ase') }
  ];
  return <MenuDeroulant etiquette={t('Nuancier du dessin : reprendre, exporter')} icone="options" chevron={false} alignement="droite" elements={elements} className="nuancier-menu" />;
}

/** « Depuis la sélection » : le petit menu de la commande, ses deux choix. Seulement quand quelque chose est choisi. */
function MenuDepuisSelection() {
  const mo = useDessin(), ac = useActions();
  if (!mo.sel.length) return null;
  const elements: ElementMenu[] = [
    { id: 'nuancier-remplacer', libelle: t('Remplacer'), raccourci: t(RACCOURCI_REMPLACER), onClick: () => creerNuancierDepuisSelection(ac, mo.dessin, mo.sel, 'remplacer') },
    { id: 'nuancier-ajouter', libelle: t('Ajouter'), raccourci: t(RACCOURCI_AJOUTER), onClick: () => creerNuancierDepuisSelection(ac, mo.dessin, mo.sel, 'ajouter') }
  ];
  return <MenuDeroulant etiquette={t('Créer le nuancier depuis la sélection')} libelle={t('Depuis la sélection')} alignement="droite" elements={elements} className="nuancier-menu" />;
}

/** Le meme petit menu dans la rangee de la selection : une icone de palette, les deux choix. */
export function MenuNuancierSelection() {
  const mo = useDessin(), ac = useActions();
  const elements: ElementMenu[] = [
    { id: 'nuancier-remplacer', libelle: t('Remplacer le nuancier du dessin'), raccourci: t(RACCOURCI_REMPLACER), onClick: () => creerNuancierDepuisSelection(ac, mo.dessin, mo.sel, 'remplacer') },
    { id: 'nuancier-ajouter', libelle: t('Ajouter au nuancier du dessin'), raccourci: t(RACCOURCI_AJOUTER), onClick: () => creerNuancierDepuisSelection(ac, mo.dessin, mo.sel, 'ajouter') }
  ];
  return <MenuDeroulant etiquette={t('Créer le nuancier depuis la sélection')} icone="palette" chevron={false} elements={elements} />;
}

/**
 * Ouverte d'elle-meme, sous une selection comme sans : c'est la qu'on pose une couleur du dessin. La memoire des sections (par titre)
 * retient qu'on l'a repliee, d'un panneau a l'autre.
 */
export function SectionNuancier() {
  const mo = useDessin(), ac = useActions(), ui = useInterface(), doigt = useTactile();
  const [cible, poserCible] = useState<CibleTeinte>('remplissage');
  const idCible = useId();
  const duDessin = nuancierEffectif(mo.dessin);
  const premiere = mo.sel.length ? mo.dessin.formes.find(f => f.id === mo.sel[0]) ?? null : null;
  // La pastille enfoncee : la couleur que porte deja la cible (la premiere forme choisie, ou le style des formes nouvelles).
  const pressee = (premiere ? premiere[cible] : ui.style[cible])?.toLowerCase() ?? null;
  const poser = (p: Pastille, inverse: boolean) => poserTeinte(ac, mo.sel, ui.style, p.hex, inverse ? autre(cible) : cible, p.nom);
  const dessin: Pastille[] = duDessin.teintes.map(t => ({ hex: t.hex, nom: nomDeTeinte(t) }));
  // Une teinte proposee sans nom (« #c81e28 » seul) prend le nom approche de sa couleur, comme une couleur du dessin.
  const proposees: Pastille[] = mo.nuancier.map(x => ({ hex: x.hex, nom: (x.nom === x.hex ? t(nomDeCouleur(x.hex)) : x.nom) + ' ' + x.hex.toUpperCase() }));
  const ou = mo.sel.length ? (mo.sel.length > 1 ? t('des formes choisies') : t('de la forme choisie')) : t('des formes nouvelles');
  const aide = (cible === 'remplissage' ? t('clic : remplissage, Maj+clic : contour') : t('clic : contour, Maj+clic : remplissage')) + ' ' + ou;
  const n = dessin.length + proposees.length;
  // La cible nommee dans la phrase d'aide : « au remplissage » ou « au contour », une phrase par cible et par geste.
  const phraseAide = (): string => {
    if (!mo.sel.length) return cible === 'remplissage' ? t('Sans sélection, une pastille règle le remplissage des formes nouvelles.') : t('Sans sélection, une pastille règle le contour des formes nouvelles.');
    if (doigt) return cible === 'remplissage' ? t('Cliquez une pastille : la couleur va au remplissage {ou} ; « Appliquer au » la donne au contour.', { ou }) : t('Cliquez une pastille : la couleur va au contour {ou} ; « Appliquer au » la donne au remplissage.', { ou });
    return cible === 'remplissage' ? t('Cliquez une pastille : la couleur va au remplissage {ou} ; Maj+clic, au contour.', { ou }) : t('Cliquez une pastille : la couleur va au contour {ou} ; Maj+clic, au remplissage.', { ou });
  };
  return (
    <Section titre={t('Nuancier')} ouverte note={n || undefined} className="section-nuancier">
      <div className="nuancier-cible" role="group" aria-labelledby={idCible}>
        <span className="aide" id={idCible}>{t('Appliquer au')}</span>
        <button type="button" aria-pressed={cible === 'remplissage'} onClick={() => poserCible('remplissage')}>{t('Remplissage')}</button>
        <button type="button" aria-pressed={cible === 'contour'} onClick={() => poserCible('contour')}>{t('Contour')}</button>
      </div>
      <GroupeTeintes titre={t('Couleurs du dessin')} note={dessin.length ? dessin.length + ' · ' + PROVENANCES[duDessin.provenance]() : ''} pastilles={dessin} pressee={pressee} poser={poser} aide={aide}
        outils={<><MenuDepuisSelection /><MenuNuancierDessin vide={!dessin.length} /></>}
        vide={<EtatVide genre={mo.dessin.formes.length ? 'aucun-resultat' : 'premiere-fois'} titre={t('Aucune couleur dans le dessin.')}>
          {mo.sel.length ? t('Les formes n’ont ni remplissage ni contour : donnez-leur une couleur, puis « Depuis la sélection ».') : t('Les couleurs des formes viendront ici ; choisissez des formes, puis « Depuis la sélection ».')}
        </EtatVide>} />
      {proposees.length ? <GroupeTeintes titre={t('Nuancier proposé')} note={String(proposees.length)} pastilles={proposees} pressee={pressee} poser={poser} aide={aide} /> : null}
      <p className="aide">{selonSaisie(phraseAide(), doigt)}</p>
    </Section>
  );
}

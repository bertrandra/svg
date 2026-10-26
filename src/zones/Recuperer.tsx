// Recuperer son fichier, dans l'editeur : tout est dans le menu Fichier (au bureau, le bouton a l'icone de document ; sur un
// telephone, les rubriques du menu « Plus »), en tete : « Télécharger le SVG », l'export de la machine en contexte Cricut ou Print
// Then Cut, puis les autres formats replies dessous, chacun dit par son usage.
//
// Pourquoi : « Enregistrer » fermait l'editeur sans rien telecharger, « Télécharger le SVG » etait cache au milieu d'un panneau de
// neuf formats de meme poids. Il a eu son bouton dans la barre ; le proprietaire l'a range dans Fichier (26 octobre 2026), pour une
// barre plus calme : le menu le porte en premier, sous un titre qui dit ce qu'on y fait, et la visite guidee y mene.

import { proposer, texteOctets } from '../io/fichiers.js';
import { svgATelecharger } from './actionsExport.js';
import type { ElementMenu } from './commun/Menu.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useSignalVisite } from './contexteGuide.js';
import { ListeFormats, optionsDeSession } from './Exporter.js';
import { etatExport } from './parcoursCricut.js';
import { estMelange } from './FinCricut.js';
import { dessinComplet } from './lentille.js';
import { Icone } from './icones.js';

/** Le SVG du dessin au telechargement : chaque facon de recuperer le dessin acheve aussi l'etape 4 de la visite guidee. */
export function useTelechargerSvg(nom: string): () => void {
  const mo = useDessin(), ui = useInterface(), ac = useActions(), signaler = useSignalVisite();
  return () => { void proposer(nom + '.svg', texteOctets(svgATelecharger(dessinComplet(mo), ui.production, optionsDeSession()))).then(m => { ac.dire(m); signaler('recupere'); }); };
}

/**
 * Les elements qui recuperent le fichier, en tete du menu Fichier : « Télécharger le SVG », toujours ; en contexte Cricut, l'export
 * pour la machine (le SVG de decoupe, ou l'archive Print Then Cut), grise avec sa raison tant qu'un constat le bloque. Hors d'un
 * contexte de production, pas d'export Cricut : « Générique » n'ecrit aucun octet de plus (ADR-0013), et le choix de la machine,
 * dans la barre, est le chemin qui y mene.
 */
export function useElementsRecuperer(nom: string): ElementMenu[] {
  const mo = useDessin(), ui = useInterface(), ac = useActions(), signaler = useSignalVisite();
  const telecharger = useTelechargerSvg(nom);
  const svg: ElementMenu = { id: 'recuperer', libelle: 'Télécharger le SVG', icone: 'telecharger', onClick: telecharger };
  if (!ui.profil) return [svg];
  // Un dessin qui mele couper et ecrire (ADR-0028) s'exporte « pour Cricut » meme au stylo : l'archive porte les deux.
  const melange = estMelange(mo.preparation?.dessin, ui.profil);
  const ptc = ui.profil.procede === 'imprimer-decouper', stylo = ui.profil.procede === 'dessin-stylo' && !melange;
  const e = etatExport(mo.preparation?.constats ?? null, ui.profil.procede, melange);
  const machine: ElementMenu = {
    id: 'exporter-machine', libelle: ptc ? 'Exporter pour Print Then Cut' : stylo ? 'Exporter pour le stylo' : 'Exporter pour Cricut',
    icone: stylo ? 'stylo' : 'machine', desactive: e.raison !== null, ...(e.raison ? { raison: e.raison } : {}),
    onClick: () => { ac.exporterPourCricut(nom); signaler('recupere'); }
  };
  return [svg, machine];
}

/** Les autres formats de l'editeur : le SVG n'y est plus, il a son element en tete du menu. */
export function PanneauFormats({ nom }: { nom: string }) {
  const mo = useDessin(), ac = useActions(), signaler = useSignalVisite();
  // Un export dit son issue par `dire` : c'est aussi le signal qu'un fichier a ete recupere (visite guidee).
  const dire = (t: string) => { ac.dire(t); signaler('recupere'); };
  return <ListeFormats svg="" dessin={dessinComplet(mo)} nom={nom} dire={dire} />;
}

/** Les autres formats, replies sous leur titre apres les elements qui recuperent (le menu ne s'allonge que si on le demande). */
export function AutresFormatsRepliees({ nom }: { nom: string }) {
  return (
    <details className="autres-formats-repli">
      {/* Le chevron dit qu'il se deplie : sans lui, le titre en couleur d'outil se lisait comme un lien. */}
      <summary><Icone nom="chevron-bas" taille={12} />Autres formats</summary>
      <PanneauFormats nom={nom} />
    </details>
  );
}

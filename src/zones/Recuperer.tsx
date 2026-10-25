// Recuperer son fichier, dans l'editeur : un geste clair et unique pour le format du moment (le SVG ; l'export de la machine en
// contexte Cricut ou Print Then Cut), et les autres formats ranges dessous, chacun dit par son usage. Au bureau, un bouton et son
// menu « Autres formats » dans la barre ; sur un telephone, la rubrique Fichier du menu « Plus ».
//
// Pourquoi : « Enregistrer » fermait l'editeur sans rien telecharger, « Télécharger le SVG » etait cache dans le menu Fichier
// a cote d'un panneau de neuf formats de meme poids et d'un second « Copier le code SVG ». Le debutant ne trouvait pas son fichier.

import { proposer, texteOctets } from '../io/fichiers.js';
import { svgATelecharger } from './actionsExport.js';
import { BoutonRaison } from './commun/BoutonRaison.js';
import { MenuDeroulant, type ElementMenu } from './commun/Menu.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useSignalVisite } from './contexteGuide.js';
import { LigneSvg, ListeFormats, optionsDeSession } from './Exporter.js';
import { etatExport } from './parcoursCricut.js';
import { Icone } from './icones.js';

/** Le geste recommande dans ce contexte : son libelle, pourquoi il est refuse (un constat bloquant), et ce qu'il fait. */
interface Recuperation { readonly libelle: string; readonly raison: string | null; readonly aide: string; readonly faire: () => void }

/** Le SVG du dessin au telechargement : chaque facon de recuperer le dessin acheve aussi l'etape 4 de la visite guidee. */
export function useTelechargerSvg(nom: string): () => void {
  const mo = useDessin(), ui = useInterface(), ac = useActions(), signaler = useSignalVisite();
  return () => { void proposer(nom + '.svg', texteOctets(svgATelecharger(mo.dessin, ui.production, optionsDeSession()))).then(m => { ac.dire(m); signaler('recupere'); }); };
}

/** Le format recommande : le SVG en Generique, l'export pour la machine en Cricut (le SVG de decoupe, ou l'archive Print Then Cut). */
export function useRecuperation(nom: string): Recuperation {
  const mo = useDessin(), ui = useInterface(), ac = useActions(), signaler = useSignalVisite();
  const telecharger = useTelechargerSvg(nom);
  if (!ui.profil) return { libelle: 'Télécharger le SVG', raison: null, aide: 'Le dessin en SVG, dans vos téléchargements', faire: telecharger };
  const ptc = ui.profil.procede === 'imprimer-decouper';
  const e = etatExport(mo.preparation?.constats ?? null);
  return {
    libelle: ptc ? 'Exporter pour Print Then Cut' : 'Exporter pour Cricut',
    raison: e.raison,
    aide: ptc ? 'L’image à imprimer et sa ligne de coupe, dans une archive ZIP' : 'Le fichier à importer dans Design Space',
    faire: () => { ac.exporterPourCricut(nom); signaler('recupere'); }
  };
}

/** Les autres formats de l'editeur ; en contexte de production, le SVG du dessin s'y ajoute en tete (le bouton principal exporte pour la machine). */
export function PanneauFormats({ nom }: { nom: string }) {
  const mo = useDessin(), ui = useInterface(), ac = useActions(), signaler = useSignalVisite();
  const telecharger = useTelechargerSvg(nom);
  // Un export dit son issue par `dire` : c'est aussi le signal qu'un fichier a ete recupere (visite guidee).
  const dire = (t: string) => { ac.dire(t); signaler('recupere'); };
  return <ListeFormats svg="" dessin={mo.dessin} nom={nom} dire={dire} {...(ui.profil ? { enTete: <LigneSvg faire={telecharger} /> } : {})} />;
}

/** Au bureau : le geste recommande, puis « Autres formats ». */
export function RecupererBarre({ nom }: { nom: string }) {
  const r = useRecuperation(nom);
  return (
    <span className="recuperer" role="group" aria-label="Récupérer le fichier">
      <BoutonRaison className="texte recuperer-principal" aide={r.aide} raison={r.raison} onClick={r.faire}><Icone nom="telecharger" /> {r.libelle}</BoutonRaison>
      {/* Un chevron accole au bouton, comme l'outil des formes : la barre tient sur une ligne a 1 280 px, et le menu se nomme « Autres formats ». */}
      <MenuDeroulant etiquette="Autres formats" alignement="droite" className="chevron-seul autres-formats" enfants={<PanneauFormats nom={nom} />} />
    </span>
  );
}

/** Sur un telephone : le geste recommande, element de la rubrique Fichier du menu « Plus ». */
export function useElementRecuperer(nom: string): ElementMenu {
  const r = useRecuperation(nom);
  return { id: 'recuperer', libelle: r.libelle, icone: 'telecharger', desactive: r.raison !== null, onClick: r.faire };
}

/** Sur un telephone : les autres formats, repliees sous leur titre dans la rubrique Fichier (le menu ne s'allonge que si on le demande). */
export function AutresFormatsRepliees({ nom }: { nom: string }) {
  return (
    <details className="autres-formats-repli">
      <summary>Autres formats</summary>
      <PanneauFormats nom={nom} />
    </details>
  );
}

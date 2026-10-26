// L'aide de l'editeur (ADR-0019) : un menu « Aide » dans la barre (une rubrique de « Plus » sur un telephone) qui rejoue la visite
// guidee, ouvre la liste des raccourcis et, dans la page et le site, les documentations (`documentation.ts`). Au bureau, c'est une
// icone a droite, avant Fichier : un point d'interrogation, ou l'on cherche l'aide d'habitude, nomme « Aide » par son infobulle.

import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useVisite } from './contexteGuide.js';
import { useFocusDialogue } from './focusEditeur.js';
import { MenuDeroulant, type ElementMenu } from './commun/Menu.js';
import { useDessin, useInterface } from './contexteEditeur.js';
import { groupesActifs } from './commandesGroupes.js';
import { dessinComplet } from './lentille.js';
import { documentationsPosees } from './documentation.js';

/** Les raccourcis de l'editeur, tels qu'on les dit : la meme liste dans le panneau du dessin et dans la boite de l'aide. */
export function ListeRaccourcis() {
  // Le modele riche (ADR-0012, etape 2) donne Ctrl+G aux groupes : la liste dit les raccourcis du dessin ouvert.
  const riche = groupesActifs(dessinComplet(useDessin()), useInterface().modele);
  return (
    <ul className="raccourcis">
      <li>V sélection · B cadre de sélection · Q lasso · A points · H, ou espace maintenu en glissant : main · O contours</li>
      <li>Cadre et lasso : ils prennent toute forme dont le tracé touche la zone, même en partie (zone en tirets) ; « Les formes entièrement dedans », au menu de l’outil de sélection, ne prend que ce qu’ils contiennent (trait plein) · Maj ajoute à la sélection, Alt retire · avec l’outil sélection, un glisser sur le vide trace un cadre ; l’outil Cadre commence même sur une forme, et c’est lui qui sert au doigt</li>
      <li>R rectangle · E ellipse · S étoile · L ligne · F palette des formes (flèches, puis Entrée choisit) · P plume (Entrée ferme, Retour arrière retire un point) · T texte</li>
      <li>Formes : Maj en traçant garde les proportions (un carré, un cercle, une forme non étirée) ; le carré et le cercle les gardent toujours ; leurs réglages (côtés, branches, rayon des coins…) sont dans le panneau quand l’outil est choisi</li>
      <li>Alt en tirant la poignée d’un point lisse ou symétrique : elle bouge seule, le temps du geste</li>
      <li>Alt+clic sur la toile : la forme du dessous (encore Alt+clic : la suivante, en boucle) · une forme se prend à quelques pixels de son trait</li>
      <li>M aimants · poignée ronde : rotation (Maj : par 15°) · deux doigts : zoom</li>
      <li>Ctrl+Z annuler · Ctrl+Maj+Z ou Ctrl+Y rétablir</li>
      <li>Ctrl+C copier · Ctrl+X couper · Ctrl+V coller · Ctrl+D dupliquer · Ctrl+A tout sélectionner · Suppr supprimer</li>
      {riche
        ? <li>Ctrl+G grouper · Ctrl+Maj+G dégrouper · Entrée sur un groupe : y entrer, double-clic aussi · Maj+Entrée ou Échap : en sortir · dans un groupe, Tab, Page suivante et Ctrl+A ne voient que ses éléments · Combiner et Séparer : menu Édition · Ctrl+] avancer, Ctrl+[ reculer (Maj : premier ou arrière-plan)</li>
        : <li>Ctrl+G combiner · Ctrl+Maj+G séparer · Ctrl+] avancer, Ctrl+[ reculer (Maj : premier ou arrière-plan)</li>}
      <li>G grille magnétique · Z zoom sur la sélection · Ctrl+S enregistrer</li>
      <li>Maj+R règles (glissez depuis une règle : un repère ; Entrée sur une règle : un repère au milieu de la vue) · Ctrl+; repères · Ctrl+Alt+; verrouiller les repères · Ctrl+Maj+; les effacer · un repère choisi : Suppr le retire, les flèches le déplacent, Entrée ouvre son champ, double-clic aussi</li>
      <li>I inverser la sélection · C même couleur de fond (de contour pour une forme sans fond) · Alt+C même couleur de contour · Y même type (texte, trait, forme pleine)</li>
      <li>Maj+N : le nuancier du dessin devient les couleurs de la sélection · Alt+Maj+N les y ajoute · dans le nuancier, Maj+clic (ou Maj+Entrée) pose la couleur sur le contour</li>
      <li>En contexte Cricut, découpe ou stylo : Maj+X range la sélection à couper, Maj+E à écrire au stylo · Maj+O montre ou retire l’aperçu de la machine · Alt+Maj+X choisit tout ce qui est à couper, Alt+Maj+E tout ce qui est à écrire</li>
      <li>Flèches : déplacer (Maj : ×10) · Alt+flèches : redimensionner, coin haut gauche fixe (Maj : ×10) · Ctrl+flèche gauche ou droite : tourner de 15° (Maj : 1°) · Maj en glissant : contraindre</li>
      <li>Coins de la sélection : glisser redimensionne librement, Maj garde les proportions · « Conserver les proportions » (la chaîne entre L et H, section Position et taille) : glisser un coin les garde et Maj redimensionne librement le temps du geste ; les champs L et H et Alt+flèches les gardent aussi · une ligne droite n’a pas de proportion à garder</li>
      <li>Au clavier, sur la toile : Tab et Maj+Tab passent à la forme suivante ou précédente (en mode points, au point suivant ou précédent) ; après la dernière, Tab quitte la toile · Page suivante et Page précédente : forme suivante ou précédente, en boucle · Entrée sur une forme : ses points</li>
      <li>Outils de tracé au clavier : les flèches déplacent le réticule (Maj : ×10), Entrée pose la forme à sa taille par défaut au réticule, ou un point avec la plume (Maj+Entrée termine le tracé) · Échap puis Tab quittent la toile · « Aller à la toile » est le premier arrêt de Tab</li>
      <li>Une forme à deux coins au clavier : Espace (ou Maj+Entrée) pose le premier coin au réticule, les flèches déplacent l’autre coin (un aperçu en pointillés suit), Espace ou Entrée le pose ; Échap annule le premier coin</li>
      <li>Sélection additive au clavier (outil sélection) : Maj+Page suivante ou Maj+Page précédente ajoute la forme voisine à la sélection et y place le curseur ; Espace ajoute ou retire la forme au curseur</li>
      <li>Cadre au clavier (outil F) : Espace ou Entrée pose un coin au réticule, les flèches déplacent l’autre, Entrée prend les formes (Maj+Entrée les ajoute), Échap annule · Lasso au clavier (outil Q) : Espace pose un point, Retour arrière retire le dernier, Entrée ferme le lasso et prend les formes</li>
      <li>Outil texte : Entrée met le focus dans le champ Texte du panneau ; « Ajouter le texte » pose les lettres au centre du plan</li>
      <li>Visite guidée (menu Aide) : F6 va à sa bulle et revient à la toile, « Aller à la visite guidée » est le deuxième arrêt de Tab ; dans la bulle, Échap quitte la visite</li>
      <li>Molette : zoom · Maj+molette : défiler · + / − · 0 ajuster · 1 taille réelle · Échap désélectionner</li>
    </ul>
  );
}

/** La boite des raccourcis : modale comme celle des credits (le meme focus, la meme sortie par Echap), dans la racine de l'editeur. */
function DialogueRaccourcis({ fermer }: { fermer: () => void }) {
  const voile = useRef<HTMLDivElement>(null), boite = useRef<HTMLDivElement>(null), idTitre = useId();
  useFocusDialogue(voile, boite, fermer);
  return createPortal(
    <div className="credits-voile" ref={voile}>
      <div className="credits-dialogue" role="dialog" aria-modal="true" aria-labelledby={idTitre} tabIndex={-1} ref={boite}>
        <h2 id={idTitre}>Raccourcis clavier</h2>
        <ListeRaccourcis />
        <div className="actions"><button type="button" className="primaire" onClick={fermer}>Fermer</button></div>
      </div>
    </div>,
    document.querySelector<HTMLElement>('.editeur-svg') ?? document.body
  );
}

/**
 * Les elements du menu Aide : la visite (quand l'editeur l'a), les raccourcis, puis les documentations que l'hote a posees, chacune
 * dans un nouvel onglet (`noopener` : la documentation ne tient aucune poignee sur l'editeur).
 */
export function useElementsAide(ouvrirRaccourcis: () => void): ElementMenu[] {
  const v = useVisite();
  return [
    ...(v ? [{ id: 'visite', libelle: 'Visite guidée', icone: 'reprendre', onClick: v.demarrer } satisfies ElementMenu] : []),
    { id: 'raccourcis', libelle: 'Raccourcis clavier', onClick: ouvrirRaccourcis },
    ...documentationsPosees().map((d, i): ElementMenu => ({
      id: 'documentation-' + d.id, libelle: d.libelle, icone: 'documentation', separateur: i === 0,
      onClick: () => { window.open(d.adresse, '_blank', 'noopener'); }
    }))
  ];
}

/** L'etat de la boite des raccourcis, et la boite quand elle est ouverte : le menu Aide et le menu « Plus » la partagent. */
export function useBoiteRaccourcis(): { ouvrir: () => void; boite: ReactNode } {
  const [ouverte, poserOuverte] = useState(false);
  return { ouvrir: () => poserOuverte(true), boite: ouverte ? <DialogueRaccourcis fermer={() => poserOuverte(false)} /> : null };
}

/** Le menu Aide de la barre (bureau) : une icone, a droite, avant Fichier. */
export function MenuAide() {
  const raccourcis = useBoiteRaccourcis();
  return (
    <>
      <MenuDeroulant etiquette="Aide" icone="aide" chevron={false} alignement="droite" className="menu-aide" elements={useElementsAide(raccourcis.ouvrir)} />
      {raccourcis.boite}
    </>
  );
}

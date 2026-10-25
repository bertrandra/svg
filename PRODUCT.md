# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Trois publics de premier rang, servis par un même éditeur. Chacun aura **son contexte d'usage**, choisi dans la
barre, qui configure l'éditeur pour lui sans en faire un autre produit (sur le modèle du contexte de production
Cricut, ADR-0013) :

- **Makers et loisirs créatifs** : des personnes qui préparent des fichiers pour une machine de découpe
  (Cricut d'abord, puis Silhouette, laser) : cartes, stickers, décorations d'événements. Leur travail réussit
  quand le fichier se découpe du premier coup.
- **Grand public occasionnel** : quelqu'un qui veut retoucher une icône, convertir un logo ou une image en
  vecteurs, préparer un visuel, sans apprendre un logiciel de dessin professionnel.
- **Intégrateurs** : des produits tiers qui embarquent l'éditeur comme composant (`ouvrir`, bundle
  d'embarquement, React) pour leurs propres utilisateurs ; ils ont besoin d'un composant fiable, cantonné,
  sûr face aux fichiers hostiles, et qui ne connaît aucun magasin.

Décision ouverte : ce que configurent les contextes « grand public » et « intégrateur » (le contexte Cricut existe ;
les deux autres sont à définir).

## Product Purpose

Faire, dans une seule page qui tourne entièrement dans le navigateur, tout le chemin d'un visuel vectoriel :
ouvrir un SVG, convertir une image (détourage, prétraitement, vectorisation vtracer), prendre une forme dans une
bibliothèque de 4 134 silhouettes nommées en français et classées par événement, éditer comme dans un logiciel de
dessin, puis récupérer un fichier propre (SVG, PNG, PDF, EPS, DXF, JPEG, WebP, archive par lot, export Cricut et
Print Then Cut). Le succès : un fichier juste du premier coup, pour l'écran comme pour la machine.

## Positioning

**L'ensemble sur une seule plateforme**, là où les voisins (Design Space, Inkscape, Vectorizer.ai, Canva) n'en
couvrent chacun qu'une part :

- tout se calcule dans le navigateur : aucun serveur, aucun compte, rien ne quitte la machine, pas même l'adresse
  de la personne (la page autonome embarque ses fontes ; un test réseau coupé le prouve) ; une police libre de plus ne se
  télécharge qu'au choix de cette police, et rien de personnel ne part (ADR-0025) ;
- un seul circuit de l'image ou de la forme jusqu'au fichier prêt pour la machine, avec un contrôle de préparation
  qui propose des corrections annulables ;
- des fichiers reproductibles : un même dessin donne toujours les mêmes octets ;
- une bibliothèque par événement (fêtes, moments de vie), avec scènes et palettes prêtes ;
- un éditeur embarquable par d'autres produits.

## Operating Context

- Page autonome (`dist/editeur-svg.html`) qui marche hors ligne, et composant embarqué dans une page hôte.
- Bureau, tablette et téléphone : barre repliée sous 640 px, cibles de 40 px au doigt, 24 px minimum à la souris.
- Clavier seul et lecteur d'écran : un geste d'édition a son équivalent clavier, une région vocale dit chaque action.
- Fichiers d'origine inconnue, potentiellement hostiles : la lecture assainit, borne et refuse en le nommant.
- Machines de découpe : Design Space importe le SVG exporté ; le type de ligne (couper, dessiner, rainer) se règle
  après l'import, pas dans le fichier.

## Capabilities and Constraints

- Interface en français, avec accents, au vouvoiement ; l'anglais n'existe pas encore (décision ouverte).
- Modèle de dessin à plat (chemins M, L, C, Q, Z) ; le texte vivant est implémenté sur ce modèle (ADR-0022) ; groupes,
  masques, dégradés et effets sont proposés par l'ADR-0012, non implémentés.
- Une couleur d'interface est un jeton (`src/styles/jetons.ts`), contraste 4,5:1 dans les deux thèmes.
- Une action primaire par panneau, le rare dans les menus (ADR-0006).
- Licence du projet : propriétaire, tous droits réservés. Formes de la bibliothèque sous CC BY 3.0 (attribution
  écrite dans le fichier), cinq bibliothèques libres à la demande sous MIT, ISC ou Apache 2.0 (notice dans MENTIONS.txt,
  origine gardée par la forme), fontes sous SIL OFL 1.1.
- Valeurs Cricut marquées « à vérifier » tant que `docs/cricut/protocole.md` n'est pas rempli sur une machine.

## Brand Commitments

Aucun nom commercial, logo ni identité arrêtés à ce jour. Le produit s'appelle « Éditeur SVG » dans la page ; ce
n'est pas une marque.

## Evidence on Hand

Aucune preuve externe : ni témoignage, ni client, ni chiffre d'usage, ni tarif, ni presse. Les travaux futurs n'en
inventent pas. Preuves internes réelles : la suite de tests (unitaires, navigateur, axe-core, corpus hostile,
fuzzing), le test réseau coupé, les références d'écriture stables, les six SVG témoins Cricut.

## Product Principles

1. **Un fichier juste du premier coup** : l'éditeur juge et propose avant que la machine ou l'écran ne déçoive.
2. **Rien ne quitte le navigateur** : la confiance vient de ce qu'on peut prouver, pas de ce qu'on promet.
3. **Un contexte configure, il n'invente pas** : chaque usage règle les mêmes outils, jamais un second produit.
4. **Ce qui est écrit reste écrit** : un octet qui change est une décision relue, jamais un effet de bord.
5. **Dire plutôt que deviner** : ce qui est perdu, refusé ou incertain est nommé à l'utilisateur.

## Accessibility & Inclusion

WCAG 2.2 AA tenu et vérifié en test : axe-core sans violation, cibles 24 × 24 px (40 px au doigt), pilotage complet
au clavier (ADR-0011), région vocale `polite`, contraste forcé, thèmes clair et sombre, `prefers-reduced-motion`.

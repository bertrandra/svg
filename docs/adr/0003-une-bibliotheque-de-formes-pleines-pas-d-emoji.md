# ADR-0003 — Une bibliothèque de 4 000 formes pleines, nommées et classées en français

**Date :** 14 octobre 2026
**Statut :** acceptée

## Contexte

On veut une bibliothèque de quelque 4 000 SVG, « juste les formes », classés par nom et par
événement du calendrier français (Noël, Pâques, Halloween…) et de la vie (naissance, anniversaire,
concert, personnage, bâtiment…), qu'une forme s'ouvre dans l'éditeur et s'y recolore. Les emoji
vectoriels (Twemoji, OpenMoji) ont été essayés et **rejetés** : des pictogrammes de 36 pixels,
multicolores, trop petits et trop simples pour servir de formes.

## Décision

1. **La source est game-icons.net** (`@iconify-json/game-icons`, épinglé), 4 134 silhouettes
   d'une seule couleur sur un plan de 512 × 512, chacune un seul `<path>`. Licence CC BY 3.0 : la
   page et le README créditent la source. Un test vérifie que l'éditeur lit chacune d'elles.
2. **Les noms sont traduits par un lexique** (`model/lexique.ts`) : chaque mot anglais de
   l'identifiant a son français, le nom se lit tête en premier (« broken-heart » devient « cœur
   brisé »), et les expressions qui ne se traduisent pas mot à mot sont listées à part. Un mot
   inconnu reste en anglais, visible ; un test borne leur part sous 3 %.
3. **Le classement est une liste de règles** (`model/bibliotheque.ts`) : chaque événement porte ses
   mots-clés anglais (au pluriel près, en suites de mots), et ses exclusions. Quarante-cinq
   événements en trois familles : le calendrier (avec son mois), la vie, les catégories. Un test
   impose au moins dix formes par événement.
4. **La bibliothèque se construit** (`scripts/bibliotheque.mjs`) en `dist/bibliotheque.js`, un script
   de 7 Mo que la page charge à la demande par une balise `<script>`, ce qui marche aussi ouvert
   depuis le disque. Rien n'est commis : le classement est celui du code, déterministe.
5. **Dans l'éditeur, une forme s'insère au centre**, à un tiers du plan, et devient une forme comme
   les autres ; dans la page, elle s'ouvre comme un nouveau dessin.

## Conséquences

- Le vocabulaire de game-icons penche vers le jeu (armes, fantastique) ; les catégories « arme » et
  « symbole » l'absorbent. Les événements du calendrier sont couverts par mots-clés, pas par
  curation : une forme mal rangée se corrige dans les règles, pas à la main.
- Une mise à jour du jeu d'icônes change la bibliothèque : elle se traite comme un changement de
  version mineure, avec l'épinglage exact.

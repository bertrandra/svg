# Vérification manuelle

Ce qu’aucune automatisation du dépôt ne prouve : lecteurs d’écran réels, contraste élevé de Windows, doigts et
stylets, claviers non QWERTY, zoom, mouvement réduit, impression. Une personne, un peu moins d’une heure si
l’on prend un appareil par partie. À rejouer avant chaque version qui touche l’interface, la toile, le clavier
ou les feuilles de style, et à chaque changement de plancher dans [`navigateurs.md`](navigateurs.md).

**Préparation (5 min).** `npm ci && npm run construire`, puis ouvrir `dist/editeur-svg.html` directement
(`file://`), et, pour les appareils mobiles, la servir sur le réseau local (`npx http-server dist` ou
équivalent ; `navigator.clipboard` n’existe qu’en `https` ou `localhost`, ce que le test « Copier » doit
distinguer). Sur la page d’accueil : « Ouvrir l’exemple ». Le dessin d’exemple a quatre formes : 1 rectangle
arrondi (fond `#e9ecef`), 2 cercle rouge, 3 triangle bleu, 4 courbe.

Notez pour chaque point : appareil, système, navigateur (versions), résultat (✔ / ✘ / sans objet), remarque.
Un ✘ ouvre une demande, avec la ligne du point.

---

## 1. Lecteurs d’écran (20 min)

Paires à essayer, au moins une par ligne : **NVDA + Firefox** et **NVDA + Chrome** (Windows) ; **JAWS +
Chrome** (Windows) ; **VoiceOver + Safari** (macOS) ; **VoiceOver + Safari** (iOS, balayage) ; **TalkBack +
Chrome** (Android). Voix en français. Toutes les phrases viennent de l’ADR-0011 et des tests de
`tests/e2e/clavier*.e2e.ts` ; l’éditeur n’a qu’**une** région vocale (`aria-live="polite"`).

Critère commun : chaque phrase est dite **une fois**, **entière**, **sans bruit parasite** (pas de relecture
de la barre d’état, pas d’épellation du code couleur lettre à lettre au point de la rendre inutile), et la
phrase identique rejouée (même action deux fois de suite) est redite.

| # | Geste | Phrase attendue (exemple) | Réussi si |
|---|---|---|---|
| 1.1 | « Ouvrir l’exemple » (Entrée sur le bouton) | Le dialogue s’annonce « Éditer : exemple.svg », le focus est sur la toile | le lecteur nomme la fenêtre, **rien de la page d’accueil derrière n’est lu** (flèches virtuelles, touche de liste d’éléments : l’accueil n’y figure pas) |
| 1.2 | Page suivante, sur la toile | « Forme 1 sélectionnée : tracé courbe, fond blanc #e9ecef, 208 × 128 à 16, 16. » | la couleur est dite avant son code |
| 1.3 | Tab, puis Maj+Tab | « Forme 2 sélectionnée : cercle, fond rouge #c81e28, 80 × 80 à 40, 40. », puis « Forme 3 sélectionnée : triangle, fond bleu #1428a0, … » | une forme par Tab, dans l’ordre du fond au premier plan |
| 1.4 | Échap, puis Tab | « Sélection vidée. », puis le focus part vers la barre | on **peut toujours quitter** la toile au clavier (aucun piège) |
| 1.5 | Forme 2 choisie : Alt+flèche droite, Alt+Maj+flèche bas | « 80,2 × 80. » puis « 80,2 × 82,4. » | pas de « page précédente » du navigateur (voir 5) |
| 1.6 | Ctrl+flèche droite, puis Ctrl+Maj+flèche gauche | « Tournée de 15° vers la droite. » puis « Tournée de 1° vers la gauche. » | idem |
| 1.7 | Entrée (forme choisie), Tab, flèches | « Point 1 sur 3 : départ, à 130, 120. » puis « Point 2 sur 3 : angle, à 170, 40. » | le point et son rang sont dits |
| 1.8 | Ctrl+Z deux fois, Ctrl+Y | « Annulé. », « Annulé. », « Rétabli. » ; au fond de l’historique « Rien à annuler. » | |
| 1.9 | Outil rectangle (R), flèches, Entrée | le réticule se déplace sans bruit ; Entrée dit la forme posée | le réticule n’apparaît pas dans le SVG enregistré |
| 1.10 | Menu Fichier (le bouton à icône de feuille) : Entrée, flèches, Tab sur « Télécharger le SVG », Échap | « Fichier, bouton de menu, réduit/développé », puis chaque rubrique (Insérer, Récupérer le dessin, Fichier) et chaque élément avec son raccourci ; Tab mène à « Autres formats, réduit » | Échap rend le focus au bouton du menu |
| 1.10b | Le geste de fin (l’icône pleine, à droite de la barre ; en bas au téléphone) | « Terminer, bouton » dans la page (« Enregistrer, bouton, estompé : Aucune modification à enregistrer » chez un hôte, avant une modification) | le libellé est lu, pas « bouton » seul ; l’infobulle le redit |
| 1.11 | Supprimer une forme, Fichier › Fermer l’éditeur | la confirmation d’abandon est une alerte ; « Continuer l’édition » a le focus | Échap la ferme et rend le focus |
| 1.12 | Fermer l’éditeur | le focus revient au bouton qui l’avait ouvert | pas au début de la page |
| 1.13 | Téléphone 420 px : bouton Calques, balayage, bouton Calques | le tiroir s’annonce, son contenu est lu, la fermeture rend la barre | le voile est atteignable et ferme le tiroir |
| 1.14 | Forme 2 choisie, inspecteur « Position et taille » : Tab jusqu’au bouton entre L et H, Espace ; puis L à 100, Entrée ; puis sur la toile Alt+flèche droite | « Conserver les proportions, bouton bascule, non enfoncé », puis « Proportions conservées. » ; « 100 × 100. » ; « 100,2 × 100,2. » | le nom du bouton ne change pas, son état (enfoncé) si ; H suit sans qu’on l’ait touché ; Espace à nouveau dit « Proportions libres. » |

Particularités à noter, pas à corriger ici : sur **VoiceOver macOS**, Tab ne s’arrête sur les boutons et liens
que si « Appuyer sur Tab pour mettre en évidence chaque élément » est coché dans Safari › Réglages ›
Avancé (ou avec Option+Tab) ; la toile, elle, a `tabindex`, elle est atteinte dans tous les cas. Sur **iOS et
TalkBack**, la toile se parcourt par balayage et les touches de forme n’existent pas sans clavier physique :
vérifier qu’on atteint **tous les boutons** et que les tiroirs s’ouvrent et se ferment (1.13).
## 1 bis. Lecteurs d’écran : le modèle riche (25 min)

La condition de la bascule de l’ADR-0012 (annexe 6 §9, annexe 8 §1 « Étape 14 ») : l’arbre des calques, le dégradé et les lentilles
sont les pièces d’accessibilité les plus difficiles de l’éditeur, et aucun lecteur d’écran réel ne tourne en CI. Mêmes paires et même
critère commun qu’au § 1 ; **NVDA + Firefox** et **VoiceOver + Safari (macOS)** au moins. La page est en modèle riche par défaut
(la case « Groupes, dégradés, effets » du menu Édition est cochée). Fichier d’essai : collez dans « Ouvrir un SVG ou un PDF »

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><defs><linearGradient id="a"><stop offset="0" stop-color="#c81e28"/><stop offset="1" stop-color="#1428a0"/></linearGradient></defs><g id="Logo"><rect x="10" y="10" width="80" height="60" fill="url(#a)"/><circle cx="140" cy="40" r="30" fill="#1428a0"/></g><path d="M10 100 L190 100" stroke="#15181d" stroke-width="4" fill="none"/></svg>
```

| # | Geste | Ce qui doit être dit | Réussi si |
|---|---|---|---|
| 1b.1 | Calques : Tab jusqu’à l’arbre | « Calques », grille arborescente ; la ligne « Logo », niveau 1, 1 sur 2, réduite ; son nombre d’éléments | **un seul arrêt de Tab** pour toute la grille ; Tab suivant en sort |
| 1b.2 | Flèche droite, flèche bas, flèche gauche | « développée » ; la ligne enfant, niveau 2, 1 sur 2 ; retour au groupe, « réduite » | niveau, rang et état dits à chaque ligne ; Début et Fin vont aux bouts |
| 1b.3 | F2 sur « Logo », taper « Marque », Entrée | le champ « Nouveau nom du groupe … » ; la ligne dit ensuite « Marque » | Échap annule sans rien dire de faux |
| 1b.4 | Ctrl+Maj+flèche bas sur une ligne, puis « Déplacer vers… » | la phrase du déplacement ; le menu des destinations, chaque groupe nommé | le focus reste sur la ligne déplacée |
| 1b.5 | Toile : Entrée sur le groupe, puis Échap | « Dans le groupe Marque, 2 éléments. », puis « Retour à la racine. » | le fil d’Ariane (« Contexte d’édition ») se lit, et rend le focus à la toile |
| 1b.6 | Choisir deux formes, Ctrl+G, puis Ctrl+Maj+G | « Groupe créé : 2 formes. », puis « Groupe défait : 2 formes. » | |
| 1b.7 | Inspecteur, rectangle choisi : Remplissage « Dégradé linéaire » | la liste « Arrêts du remplissage » (zone de liste) ; chaque arrêt avec sa couleur nommée et sa position | flèches haut et bas parcourent les arrêts ; les réglages de l’arrêt se lisent dans le groupe « Réglages de … » |
| 1b.8 | Toile : Tab jusqu’aux poignées du dégradé, flèches, Maj+flèches, Suppr | chaque poignée est un curseur (« slider ») avec sa valeur en pour cent et sa phrase | ±1 % puis ±10 % dits ; Suppr retire un arrêt du milieu et le dit |
| 1b.9 | Menu Édition › « Créer une découpe », puis « Modifier la découpe », Échap | la création ; l’entrée dans la découpe, le fil « Racine › Groupe › Découpe » ; la sortie | le reste du dessin estompé n’est pas lu comme choisissable |
| 1b.10 | « Créer un masque », « Inverser le masque », « Libérer le masque » | chaque geste dit une fois ; une commande grisée dit sa raison | |
| 1b.11 | Section Effets : flou, puis ombre ; régler l’écart au clavier | chaque champ nommé, sa valeur dite | pas de relecture de toute la section à chaque pas |
| 1b.12 | Fichier › « Insérer une image… », puis Entrée (points) sur l’image | l’image insérée, dite « image PNG » ; le refus des points, en clair | |
| 1b.13 | Texte : saisir « Bonjour », Vectoriser › Lettres séparées | « … : 7 formes ordinaires, en un groupe. » | l’arbre montre le groupe « Texte « Bonjour » » |
| 1b.14 | Fichier › « Télécharger le SVG à plat » ; Édition › case du modèle | le téléchargement dit, sans enregistrement ; « Groupes, dégradés et effets désactivés : … » | la case est dite « case à cocher de menu, cochée / non cochée » |

## 2. Contraste élevé de Windows (10 min)

Windows 11 › Accessibilité › Thèmes de contraste : **Aquatique**, **Désert**, **Crépuscule**, **Contraste
élevé noir** (Alt gauche + Maj gauche + Impr. écran bascule). Navigateurs : **Edge**, **Chrome**, **Firefox**
(Firefox gère le mode lui-même, par « Couleurs » dans les réglages ; vérifier aussi Firefox en mode
« Toujours » si le système n’est pas en contraste élevé).

Pour chaque thème, éditeur ouvert sur l’exemple :

| # | À regarder | Réussi si |
|---|---|---|
| 2.1 | l’outil enfoncé de la barre, à côté de ceux au repos | on distingue l’état sans voir une teinte : fond « surbrillance », icône dans la couleur de texte de la surbrillance |
| 2.2 | une forme choisie : contour, coins, poignée de rotation | tout est visible sur le dessin, y compris sur un fond sombre ; les couleurs du **dessin** restent les siennes |
| 2.3 | la ligne choisie des calques | fond et texte du système, lisibles |
| 2.4 | menu Vue : survol et focus d’un élément | fond et texte du système ; un anneau de 2 px |
| 2.5 | Tab sur la barre, sur la toile | anneau de focus de 2 px (3 px sur la toile) |
| 2.6 | boutons désactivés | gris du système, lisibles, encore reconnaissables comme désactivés |
| 2.7 | accueil : voie choisie, zone de dépôt survolée | contour net |

## 3. Tactile : iOS Safari (16.4 et plus) et Chrome Android (25 min)

Un iPhone et, si possible, un iPad ; un téléphone Android. Page servie sur le réseau local. Mode portrait puis
paysage.

| # | Geste | Réussi si |
|---|---|---|
| 3.1 | Pincer à deux doigts sur la toile | le dessin zoome autour des doigts, **la page ne zoome pas**, rien n’est modifié (« 0 modification ») |
| 3.2 | Glisser à un doigt avec l’outil Main | la vue se déplace, la page ne défile pas |
| 3.3 | Boutons Calques et Inspecteur | un tiroir glisse sous un voile ; toucher le voile le ferme ; la barre d’état suit |
| 3.4 | Toucher deux fois vite le bouton Annuler | deux annulations, **aucun zoom de page** (`touch-action: manipulation`) |
| 3.5 | Appui long sur la toile et sur un nom de calque | pas de loupe ni de sélection de texte sur la toile ; pas de menu contextuel du navigateur sur les poignées |
| 3.6 | Menu Fichier et menu Vue, barre d’adresse affichée puis repliée | le panneau du menu tient **entièrement** à l’écran (`dvh`) ; défiler jusqu’au dernier élément |
| 3.7 | Cibles | tous les boutons de la barre se touchent du premier coup (40 px) ; aucun ne se touche en double |
| 3.8 | Après avoir touché un bouton | pas de survol « collé » (bordure de couleur qui reste) — noter sinon, c’est cosmétique |
| 3.9 | Champs (Rotation, Échelle, Texte) | le clavier virtuel s’ouvre, **la page ne saute pas**, la valeur s’applique avec le bouton « Appliquer » |
| 3.10 | Ouvrir un SVG depuis Fichiers, une image depuis la photothèque | l’éditeur s’ouvre ; l’image se dépose |
| 3.11 | Convertir une image de 12 mégapixels (photo d’appareil), mode par défaut | un résultat, ou un message en français ; **jamais** page blanche ni rechargement de l’onglet (limite mémoire de WebAssembly et du canvas sur iOS) |
| 3.12 | « Plus » › « Télécharger le SVG », puis le PNG et le PDF sous « Autres formats » | le fichier s’ouvre dans l’aperçu / la feuille de partage / les téléchargements, avec le bon nom |
| 3.13 | Copier le code (en `https`) puis en `file://` ou `http` | « copié » en `https` ; en contexte non sécurisé la page dit qu’elle n’a pas pu copier |
| 3.14 | Rotation de l’appareil pendant l’édition | la toile se réajuste, le dessin et la sélection restent |
| 3.15 | Mode sombre du système, bascule en direct | l’interface suit sans recharger ; contraste du texte sur les boutons |
| 3.16 | Navigation privée | l’éditeur marche ; brouillon et versions nommées ne persistent pas, sans erreur visible |

## 4. Stylet : Apple Pencil, Surface Pen, S Pen (5 min)

| # | Geste | Réussi si |
|---|---|---|
| 4.1 | Outil rectangle, ellipse, étoile, ligne au stylet | le trait suit la pointe, **la page ne défile pas** pendant le geste |
| 4.2 | Outil plume : poser trois points, terminer | « Tracé ajouté : 3 points. » ou son équivalent visuel |
| 4.3 | Déplacer, redimensionner par les coins, tourner par la poignée ronde | la précision suit la pointe (les poignées grossissent sous pointeur grossier ; sous stylet elles restent fines : noter si c’est trop petit) |
| 4.4 | Paume posée sur l’écran pendant un trait | pas de seconde forme ni de zoom parasite |
| 4.5 | Stylet puis doigt sur la même toile | le doigt déplace/zoome, le stylet dessine, sans geste coincé |
| 4.6 | Survol de l’Apple Pencil (iPad M2) ou S Pen au-dessus d’une forme | sans erreur ; pas d’effet attendu |
| 4.7 | Au doigt, l’outil Cadre (menu du bouton Sélection), un glisser commencé sur une forme ; puis le Lasso | rien ne se déplace ; les formes touchées portent le liseré pendant le geste et sont choisies au relâchement ; deux doigts pendant le geste zooment sans rien choisir |

## 5. Claviers AZERTY, QWERTZ, QWERTY (10 min)

Windows (Edge ou Chrome) puis macOS (Safari), pour chaque disposition. Sur la toile, avec l’exemple.

| # | Raccourci | Réussi si |
|---|---|---|
| 5.1 | Ctrl (Cmd sur Mac) + Z, Y, Maj+Z | annuler / rétablir ; la touche est celle de la lettre, pas sa position |
| 5.2 | Ctrl+A, Ctrl+D, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+G, Ctrl+S | tout choisir, dupliquer, copier, coller, couper, combiner (Maj+Ctrl+G sépare ; avec le modèle riche, grouper et dégrouper) ; Ctrl+S garde un brouillon et dit « Brouillon gardé. », **sans fermer l’éditeur** ni ouvrir « Enregistrer sous » du navigateur |
| 5.3 | Ctrl+] et Ctrl+[ : sur AZERTY et QWERTZ ces crochets demandent AltGr (Ctrl+Alt sous Windows) | le plan avance / recule, ou le menu Édition dit un raccourci qui marche sur cette disposition ; noter la combinaison réelle |
| 5.4 | Lettres d’outils et de vue (R rectangle, G grille, Z zoom sur la sélection, M aimants) sur AZERTY et QWERTZ : « Z », « W », « Y » ne sont pas aux mêmes places | la lettre d’outil est celle **imprimée sur la touche** (`e.key`), pas la position QWERTY |
| 5.5 | Alt+flèches (Windows, Linux) | l’objet se redimensionne, **le navigateur ne revient pas à la page précédente** (Chrome, Edge, Firefox) |
| 5.6 | Cmd+flèches et Ctrl+flèches sur macOS | Ctrl+flèche gauche/droite est pris par Mission Control (changer d’espace) si le réglage système est actif : la rotation au clavier ne part pas. Noter si l’on peut la désactiver, et si Alt+Cmd+flèche est une alternative raisonnable |
| 5.7 | Cmd+[ et Cmd+] dans Safari | le plan change **et** Safari ne navigue pas en arrière/avant |
| 5.8 | Tab, Maj+Tab, Échap, Entrée, Espace, Suppr, Retour arrière | comme dans les tests : Tab ne piège jamais |
| 5.9 | Saisir « é », « ç » et le texte de la forme avec les dispositions ci-dessus | le texte en formes écrit les bons caractères |
| 5.10 | Alt+C (même couleur de contour), et en contexte Cricut Alt+Maj+X et Alt+Maj+E (tout ce qui est à couper, à écrire), sous Windows (barre de menus du navigateur visible ou non) et Option sur macOS | la sélection change ; aucun menu du navigateur ne s’ouvre ; sur macOS, Option+C ne tape pas « ç » dans la toile |
| 5.11 | Alt+glisser sur le vide (retirer de la sélection) sous un bureau Linux qui réserve Alt+glisser au déplacement des fenêtres | noter si la fenêtre se déplace au lieu du cadre ; Alt+cadre avec l’outil Cadre (B) aussi |
| 5.12 | Coin de la sélection avec Maj, verrou « Conserver les proportions » coupé puis posé (souris, puis stylet si disponible) | verrou coupé : sans Maj le coin étire librement, avec Maj il garde les proportions ; verrou posé : sans Maj il les garde, avec Maj il étire librement le temps du geste ; une ligne droite s’étire dans les deux cas sans erreur ; la barre d’état dit « (Maj : proportions) » puis « (Maj : librement) » |

## 6. Zoom et taille du texte (5 min)

| # | Réglage | Réussi si |
|---|---|---|
| 6.1 | Zoom du navigateur 200 % (Ctrl +) sur l’accueil et dans l’éditeur, 1280 px de large | rien n’est coupé ; les barres défilent ; les tiroirs prennent le relais |
| 6.2 | 400 % (fenêtre équivalente à 320 px CSS) | pas de défilement horizontal de la page ; chaque fonction reste atteignable (WCAG 1.4.10) |
| 6.3 | Texte seul à 200 % : Firefox › Affichage › Zoom › Zoom du texte seulement | les libellés ne se chevauchent pas ; les boutons gardent leur nom |
| 6.4 | Taille de police du système : iOS Réglages › Accessibilité › Taille du texte au maximum ; Android › Taille de police maximale | l’accueil est lisible ; la barre de l’éditeur reste utilisable (le texte de l’éditeur est en pixels, il ne suit pas : noter) |
| 6.5 | Focus visible à 200 % | l’anneau ne passe pas sous un bord et se voit |

## 7. Mouvement réduit (3 min)

Windows › Accessibilité › Effets visuels › Effets d’animation **désactivé** ; macOS › Accessibilité › Affichage ›
Réduire les animations ; iOS › Accessibilité › Mouvement › Réduire les animations ; Android › Supprimer les
animations.

| # | À regarder | Réussi si |
|---|---|---|
| 7.1 | Ouvrir un menu, déplier une section, ouvrir un tiroir | **rien ne glisse ni ne fond** : tout apparaît d’un coup |
| 7.2 | Survoler un bouton | le changement de couleur est immédiat |
| 7.3 | Réglage rétabli | les animations de 120 à 220 ms reviennent |

## 8. Impression (3 min)

Aucune feuille de style d’impression n’est écrite : on vérifie qu’elle ne casse rien, pas qu’elle est belle.

| # | Page | Réussi si |
|---|---|---|
| 8.1 | Accueil, après « Terminer » : aperçu du résultat (Ctrl+P, aperçu avant impression) | l’aperçu du SVG et sa fiche sont lisibles, rien n’est coupé au milieu d’un mot ; pas de page blanche |
| 8.2 | Éditeur ouvert | note : ce qui sort (en pratique la première page de la fenêtre fixe). Aucune erreur ; si l’éditeur imprime des pages vides, ouvrir une demande « imprimer le dessin » plutôt que de la corriger ici |
| 8.3 | Le SVG exporté, ouvert seul dans le navigateur | s’imprime à la taille du plan ; le PDF vectoriel du menu Fichier est l’export à imprimer |

## 9. Hôte d’embarquement (5 min)

Ouvrir `exemples/integration.html` dans chaque navigateur du plancher que vous avez sous la main (voir
[`navigateurs.md`](navigateurs.md)).

| # | Geste | Réussi si |
|---|---|---|
| 9.1 | « Éditer » | la fenêtre couvre l’écran, la page de l’hôte ne défile plus, ses styles (casse, lettres, couleurs) n’entrent pas |
| 9.2 | Fermer | la page de l’hôte retrouve son défilement, son focus, ses styles |
| 9.3 | Navigateur sous le plancher (une VM ou un vieil iPad si vous en avez) | l’éditeur dit « Ce navigateur est trop ancien » ou, si le bundle ne s’analyse pas, `window.EditeurSvg` est absent (documenté) : jamais une page de l’hôte cassée sans message |

---

**Compte rendu type** (à coller dans la demande de version) : date, version (`package.json`), appareils, puis le
tableau des parties 1 à 9 avec ✔ / ✘ / sans objet. Une partie non jouée se dit « non jouée », jamais ✔.

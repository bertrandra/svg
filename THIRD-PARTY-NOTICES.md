# Mentions des composants tiers

Ce fichier est généré par `npm run mentions` (`scripts/mentions.mjs`) à partir de `src/model/credits.ts`, de `package-lock.json` et des fichiers de licence
des paquets : ne le modifiez pas à la main. Il liste ce que l’éditeur redistribue dans `dist/` (la page, le bundle d’embarquement, la bibliothèque de formes,
les fontes, le traceur vtracer). Le même texte est livré sous le nom `MENTIONS.txt` ; l’éditeur le résume dans « À propos et crédits » (menu Fichier).

Ce fichier ne couvre que les composants tiers ; la licence du projet lui-même, s’il en porte une, est dans le fichier `LICENSE` du dépôt.

## Formes de la bibliothèque

- Source : **Game Icons**, paquet `@iconify-json/game-icons` 1.2.4 — https://game-icons.net
- Licence : **CC BY 3.0** (`CC-BY-3.0`) — https://creativecommons.org/licenses/by/3.0/
- Auteur déclaré par le jeu de données : « GameIcons » (https://github.com/game-icons/icons) ; licence déclarée : https://github.com/game-icons/icons/blob/master/license.txt
- **Crédit à donner : game-icons.net et ses contributeurs.** Le jeu de données ne porte pas l’auteur de chaque icône : il n’y a donc pas de crédit par forme à écrire,
  mais celui-ci, qui nomme la source et sa licence, doit accompagner chaque redistribution.
- Le texte juridique de la licence n’est pas fourni par le paquet (ni fichier de licence, ni notice de copyright) : il est à l’adresse ci-dessus.
- Les formes sont modifiées par l’éditeur (recolorées, redimensionnées, assemblées) ; ces modifications sont des adaptations au sens de la licence.

Ce que l’éditeur fait pour vous : tout SVG écrit qui contient une forme de la bibliothèque porte un élément `<metadata>` avec cette mention, et chaque `<path>` issu
de la bibliothèque un attribut `data-origine` (par exemple `game-icons:3d-glasses`) ; un PDF la porte dans ses informations (`/Subject`) ; un SVG de découpe
la porte en commentaire. Un PNG ne peut pas la porter : citez la source là où vous le publiez. La mention écrite est :

> Contient des formes dont la source est game-icons.net et ses contributeurs (https://game-icons.net), sous licence CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).

## Fontes

9 fontes (8 familles) sont embarquées dans `polices.js`, sous la licence SIL Open Font License 1.1. Le copyright de chacune ci-dessous
accompagne la fonte partout où elle est redistribuée ; le texte de la licence suit, une fois par variante.

- **Inter** (`@expo-google-fonts/inter` 0.4.2) : Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)
  https://github.com/rsms/inter
- **Oswald** (`@expo-google-fonts/oswald` 0.4.2) : Copyright 2016 The Oswald Project Authors (https://github.com/googlefonts/OswaldFont)
  https://github.com/googlefonts/OswaldFont
- **Bebas Neue** (`@expo-google-fonts/bebas-neue` 0.4.1) : Copyright © 2010 by Dharma Type.
  https://fonts.google.com/specimen/Bebas+Neue
- **Playfair Display** (`@expo-google-fonts/playfair-display` 0.4.2) : Copyright 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display), with Reserved Font Name "Playfair Display"
  https://github.com/clauseggers/Playfair-Display
- **Lobster** (`@expo-google-fonts/lobster` 0.4.1) : Copyright 2010 The Lobster Project Authors (https://github.com/impallari/The-Lobster-Font), with Reserved Font Name "Lobster".
  https://github.com/impallari/The-Lobster-Font
- **Pacifico** (`@expo-google-fonts/pacifico` 0.4.1) : Copyright 2018 The Pacifico Project Authors (https://github.com/googlefonts/Pacifico)
  https://github.com/googlefonts/Pacifico
- **Caveat** (`@expo-google-fonts/caveat` 0.4.2) : Copyright 2014 The Caveat Project Authors (https://github.com/googlefonts/caveat)
  https://github.com/googlefonts/caveat
- **Fredoka** (`@expo-google-fonts/fredoka` 0.4.1) : Copyright 2016 The Fredoka Project Authors (https://github.com/hafontia/Fredoka-One)
  https://github.com/hafontia/Fredoka-One

### Texte de la SIL Open Font License 1.1

```text
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## Logiciels

Ces composants sont compilés dans `editeur-svg.html`, `editeur-svg-embarque.js` et `vtracer.js`. Ceux qui sont « intégrés » sont recopiés dans le fichier
livré d’un autre paquet (un build UMD) : ils n’ont pas de paquet à eux dans les bundles, mais leur licence les accompagne.

- **React** (`react`, 19.3.1) : MIT · Meta Platforms, Inc. and affiliates · https://react.dev
- **React DOM** (`react-dom`, 19.3.1) : MIT · Meta Platforms, Inc. and affiliates · https://react.dev
- **Scheduler** (`scheduler`, 0.28.0) : MIT · Meta Platforms, Inc. and affiliates · https://react.dev
- **opentype.js** (`opentype.js`, 2.0.0) : MIT · Frederik De Bleser · https://opentype.js.org
- **polygon-clipping** (`polygon-clipping`, 0.15.7) : MIT · Mike Fogel · https://github.com/mfogel/polygon-clipping
- **splaytree** (`splaytree`, intégré à `polygon-clipping`, version 3.1.2 ; copie installée 3.2.3) : MIT · Alexander Milevski · https://github.com/w8r/splay-tree
- **robust-predicates** (`robust-predicates`, intégré à `polygon-clipping` ; copie installée 3.0.3) : Unlicense · Vladimir Agafonkin · https://github.com/mourner/robust-predicates
- **tslib** (`tslib`, intégré à `polygon-clipping`) : Apache-2.0 · Microsoft Corporation · http://www.apache.org/licenses/LICENSE-2.0
- **tiny-inflate** (`tiny-inflate`, intégré à `opentype.js`, version 1.0.3) : MIT · Devon Govett · https://github.com/devongovett/tiny-inflate
- **vtracer** (`@visioncortex/vtracer`, 1.0.0-alpha.4) : MIT OR Apache-2.0 · Vision Cortex · https://github.com/visioncortex/vtracer

### Licence de react, react-dom, scheduler (d’après le fichier LICENSE du paquet)

```text
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Licence de opentype.js (d’après le fichier LICENSE du paquet)

```text
The MIT License (MIT)

Copyright (c) 2020 Frederik De Bleser

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### Licence de polygon-clipping (d’après le fichier LICENSE.md du paquet)

```text
The MIT License (MIT)

Copyright (c) 2018 Mike Fogel <mike@fogel.ca> - covers everything not specially attributed to others below.

Copyright (c) 2016 Alexander Milevski <info@w8r.name> - covers all portions originally part of github:w8r/martinez, from which this project was forked on Febuary 2, 2018.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### Licence de splaytree (d’après la section « License » du README du paquet (il n’a pas de fichier de licence))

```text
The MIT License (MIT)

Copyright (c) 2019 Alexander Milevski <info@w8r.name>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### Licence de robust-predicates (d’après le fichier LICENSE du paquet)

```text
This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <http://unlicense.org>
```

### Licence de tiny-inflate (d’après le fichier LICENSE du paquet tiny-inflate 1.0.3 publié sur npm (copie dans scripts/licences/))

```text
MIT License

Copyright (c) 2015-present Devon Govett

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### tslib : texte de licence absent

Le fichier livré de `polygon-clipping` recopie tslib sous la licence « Apache-2.0 », avec l’en-tête de copyright de Microsoft Corporation (conservé dans le code livré) ; aucun paquet installé ne porte le texte complet de la licence, qui est à http://www.apache.org/licenses/LICENSE-2.0.

### @visioncortex/vtracer : texte de licence absent

Le paquet déclare la licence « MIT OR Apache-2.0 » (package.json) mais ne livre ni fichier de licence ni notice de copyright. Le texte de la licence est à l’adresse du projet (https://github.com/visioncortex/vtracer) ; le titulaire n’est pas nommé par le paquet.

### vtracer : composants Rust compilés dans le binaire WebAssembly

Le binaire `vtracer_wasm_bg.wasm` est compilé à partir de bibliothèques Rust (dont `visioncortex`) ; le paquet npm n’en livre pas la liste ni les notices. Elles ne sont pas reprises ici.

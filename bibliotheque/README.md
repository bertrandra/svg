# Corrections de la bibliothèque

`corrections.json` porte les corrections posées à la main sur les formes : un nom, des événements,
ou les deux, par identifiant. La page « Exporter les corrections » produit ce fichier ; collez-le ici
et reconstruisez (`npm run bibliotheque`). Le fichier l'emporte sur les règles de
`src/model/bibliotheque.ts`.

```json
{ "pumpkin-lantern": { "nom": "citrouille d’Halloween", "evenements": ["halloween", "automne"] } }
```

// Les sources libres de la bibliotheque s'ecrivent de facon stable, forme par forme, comme game-icons
// (ecriture-stable.test.ts, bibliotheque.empreintes.txt) : chaque source a SON fichier d'empreintes,
// tests/fixtures/svg/bibliotheque-<source>.empreintes.txt, pour qu'une mise a jour d'un jeu ne touche que le sien et que
// les 4 134 empreintes de game-icons ne bougent jamais pour une autre source.
//
// Reecrire ces empreintes seulement (apres un changement voulu, annonce comme tel dans CHANGELOG.md) :
//
//   ACTUALISER_REFERENCES=1 npx vitest run tests/unit/engine/bibliotheques-libres-stables.test.ts
//
// Cette commande n'ecrit que les fichiers des sources libres ; relire ensuite le diff git, source par source.

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin, lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { construireSource, type CategoriesJeu, type JeuIcones } from '../../../src/model/bibliothequeSources.js';
import { SOURCES_FORMES, SOURCE_PAR_DEFAUT } from '../../../src/model/sourcesFormes.js';
import { nettoyerSvg } from '../../../src/util/svg.js';

const RACINE = resolve(__dirname, '../../..');
const DOSSIER = resolve(RACINE, 'tests/fixtures/svg');
const ACTUALISER = process.env.ACTUALISER_REFERENCES === '1';
const COMMANDE = 'ACTUALISER_REFERENCES=1 npx vitest run tests/unit/engine/bibliotheques-libres-stables.test.ts';

const lire = (svg: string): DessinSvg => {
  const r = lireDessin(svg);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
/** L'ecriture de « Enregistrer » : precision 3, puis le nettoyage. */
const ecrireEnregistre = (d: DessinSvg): string => nettoyerSvg(ecrireDessin(d, 3))?.svg ?? '';
const empreinte = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const ecart = (quoi: string): string =>
  'ECRITURE CHANGEE (' + quoi + ') : un SVG reecrit aujourd hui doit l etre a l identique demain. Tout changement d un octet ecrit est un '
  + 'evenement de VERSION MAJEURE. Si le changement est voulu : l annoncer dans CHANGELOG.md, puis actualiser (' + COMMANDE + ').';

describe.each(SOURCES_FORMES.filter(s => s.id !== SOURCE_PAR_DEFAUT).map(s => [s.id, s] as const))('la source %s s ecrit de facon stable', (id, s) => {
  const dossier = resolve(RACINE, 'node_modules', s.paquet);
  const jeu = JSON.parse(readFileSync(resolve(dossier, 'icons.json'), 'utf8')) as JeuIcones;
  const meta = resolve(dossier, 'metadata.json');
  const categories = existsSync(meta) ? (JSON.parse(readFileSync(meta, 'utf8')) as { categories?: CategoriesJeu }).categories ?? {} : {};
  const entrees = construireSource(s, jeu, categories);
  const chemin = resolve(DOSSIER, 'bibliotheque-' + id + '.empreintes.txt');
  // Calcule au premier test qui en a besoin, pas a la collecte.
  let memo: Array<{ id: string; premier: string }> | null = null;
  const ecrits = () => (memo ??= entrees.map(e => ({ id: e.id, premier: ecrireEnregistre(lire(e.svg)) })));

  it('relue puis reecrite, chaque forme redonne exactement la meme ecriture', () => {
    const bougent = ecrits().filter(x => ecrireEnregistre(lire(x.premier)) !== x.premier).map(x => x.id);
    expect(bougent, ecart('idempotence de ' + id)).toEqual([]);
  });

  it('s ecrit comme la reference, forme par forme (empreintes sha-256)', () => {
    const courant = ecrits().map(x => x.id + '\t' + empreinte(x.premier)).join('\n') + '\n';
    if (ACTUALISER) { writeFileSync(chemin, courant); return; }
    expect(existsSync(chemin), 'reference absente : bibliotheque-' + id + '.empreintes.txt (' + COMMANDE + ')').toBe(true);
    const attendu = new Map(readFileSync(chemin, 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split('\t') as [string, string]));
    const differentes = ecrits().filter(x => attendu.get(x.id) !== empreinte(x.premier)).map(x => x.id);
    expect(differentes.slice(0, 20), ecart(differentes.length + ' formes de ' + id + ', dont les 20 premieres')).toEqual([]);
    expect(ecrits().length, ecart('nombre de formes de ' + id + ' ; si le paquet ' + s.paquet + ' a ete mis a jour, c est lui qui a bouge')).toBe(attendu.size);
  });
});

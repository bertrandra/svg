// Le texte d'un SVG ouvert par la page ou l'embarquement (ADR-0020) : les fontes de dist/polices.js se chargent a la demande, le
// SVG se lit avec elles (une forme par lettre, engine/edition/texteSvg.ts) et se reecrit sans <text>. C'est ce SVG-la que
// l'editeur recoit : il n'a jamais a connaitre les fontes.

import { ecrireDessin, lireDessin, marquerProduction, type Glyphes } from '../engine/editionSvg.js';
import { t } from '../util/i18n.js';
import { fontesDeRemplacement } from './polices.js';

/** Vrai si le SVG porte un element <text> (le seul cas ou les fontes sont utiles). */
export const contientTexte = (svg: string): boolean => /<(?:[\w-]+:)?text[\s>/]/.test(svg);

/**
 * Le SVG avec son texte en lettres et ce que la lecture n'a pas repris ; ou le refus de la lecture, ou l'absence des fontes. `modele` :
 * celui ou l'editeur lira le resultat (ADR-0012, annexe 5 §3) ; en `riche`, les groupes, degrades et images du SVG restent.
 */
export async function lettresDuSvg(svg: string, remplacantes: () => Promise<ReadonlyMap<string, Glyphes>> = fontesDeRemplacement, modele: 'plat' | 'riche' = 'plat'): Promise<{ svg: string; ignores: readonly string[] } | { erreur: string }> {
  let fontes: ReadonlyMap<string, Glyphes>;
  try { fontes = await remplacantes(); } catch (e) {
    return { erreur: t('Ce SVG contient du texte, et les fontes qui le dessinent ne se chargent pas ({raison})', { raison: e instanceof Error ? e.message : String(e) }) };
  }
  const r = lireDessin(svg, { polices: { glyphes: id => fontes.get(id) ?? null }, ...(modele === 'riche' ? { modele } : {}) });
  if ('erreur' in r) return r;
  const ecrit = ecrireDessin(r.dessin, 3);
  return { svg: r.production ? marquerProduction(ecrit, r.production) : ecrit, ignores: r.ignores };
}

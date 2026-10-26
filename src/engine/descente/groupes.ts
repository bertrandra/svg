// La descente des groupes vers un dessin plat (ADR-0012, etape 1, annexe 5 §4) : ce qu'un exporteur qui ne connait pas les groupes
// (PDF, SVG de decoupe, DXF, EPS, fichiers de production) recoit. Le plan est plat, donc tout exporteur approche : les feuilles dans
// leur ordre (celui de la peinture), une feuille d'un groupe masque masquee (elle ne s'exporte pas, comme a l'enregistrement, mais
// elle reste : un texte pose peut s'y lier), et l'opacite des groupes multipliee sur leurs feuilles. Cette multiplication est
// exacte quand les feuilles d'un groupe ne se recouvrent pas ; sinon elle est approchee (les recouvrements s'eclaircissent au lieu de
// composer ensemble), et la descente le dit. Pure. Elle passe EN DERNIER : les autres regles (peintures, effets, decoupes, masques)
// lisent encore les groupes.

import { ancetres, boiteAvecTrait, seCroisent, type Boite, type DessinSvg, type Forme, type Groupe } from '../editionSvg.js';
import type { RegleDescente } from '../aplatir.js';
import { t } from '../../util/i18n.js';

/** La cle de la phrase (evaluee au chargement, avant la langue : le francais) ; `t(MSG_OPACITE_COMPOSEE)` la traduit quand on la dit. */
export const MSG_OPACITE_COMPOSEE = t('une opacité de groupe composée sur ses formes (là où elles se recouvrent, le rendu s’éclaircit)');

const aPropre = (o: object, cle: string): boolean => Object.prototype.hasOwnProperty.call(o, cle);

/** Vrai si des formes visibles se recouvrent, ou si l'une a un fond et un contour (le contour recouvre le fond). */
function seRecouvrent(formes: readonly Forme[]): boolean {
  const boites: Boite[] = [];
  for (const f of formes) {
    if (f.remplissage !== null && f.contour !== null && f.epaisseur > 0) return true;
    const b = boiteAvecTrait(f);
    if (!b) continue;
    if (boites.some(x => seCroisent(x, b))) return true;
    boites.push(b);
  }
  return false;
}

/** Le dessin sans groupes : opacites multipliees, feuilles des groupes masques masquees, aucun `parent`. */
export function descendreGroupes(d: DessinSvg): { readonly dessin: DessinSvg; readonly pertes: readonly string[] } {
  const table = d.groupes;
  if (!table && !d.formes.some(f => f.parent !== undefined)) return { dessin: d, pertes: [] };
  const groupe = (id: string): Groupe | undefined => (table && aPropre(table, id) ? table[id] : undefined);
  // Les feuilles visibles de chaque groupe a opacite, pour dire l'approximation.
  const sousOpacite = new Map<string, Forme[]>();
  const formes = d.formes.map((f): Forme => {
    const chaine = f.parent === undefined ? [] : ancetres(d, f.id);
    const masquee = chaine.some(a => groupe(a)?.visible === false);
    let opacite = f.opacite;
    for (const a of chaine) {
      const o = groupe(a)?.opacite;
      if (o === undefined || o >= 1) continue;
      opacite *= o;
      if (!masquee && f.visible) { const t = sousOpacite.get(a); if (t) t.push(f); else sousOpacite.set(a, [f]); }
    }
    const { parent: _p, ...reste } = f;
    void _p;
    const arrondie = Math.round(opacite * 1000) / 1000;
    return { ...reste, ...(arrondie !== f.opacite ? { opacite: arrondie } : {}), ...(masquee && f.visible ? { visible: false } : {}) };
  });
  const approche = [...sousOpacite.values()].some(seRecouvrent);
  const { groupes: _g, ...plan } = d;
  void _g;
  return { dessin: { ...plan, formes }, pertes: approche ? [t(MSG_OPACITE_COMPOSEE)] : [] };
}

/** La regle des groupes, inscrite en dernier dans `REGLES_DESCENTE` : quel que soit le niveau, le plan est plat. */
export const descenteGroupes: RegleDescente = {
  fonction: 'groupes',
  descendre: d => descendreGroupes(d)
};

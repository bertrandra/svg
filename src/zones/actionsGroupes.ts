// Grouper et degrouper (ADR-0012, etape 2, annexe 6 §2 et §7) : les verbes que le menu Edition, la rangee de la selection et
// Ctrl+G (Ctrl+Maj+G) appellent en modele riche. Le calcul est celui du moteur (edition/groupes.ts) ; ici, la selection qui suit et
// la phrase dite. Comme les autres actions, ils lisent l'etat du moment (`lire`) et ne capturent rien.

import { degrouper, grouper, groupeDe, unites } from '../engine/editionSvg.js';
import type { EtatLu, Leviers } from './actions.js';
import { phraseGroupeCree, phraseGroupeDefait } from './phrasesGroupes.js';
import type { ActionsEditeur } from './typesEditeur.js';
import { t } from '../util/i18n.js';

export type ActionsGroupes = Pick<ActionsEditeur, 'grouper' | 'degrouper'>;

export function actionsGroupes(lire: () => EtatLu, l: Leviers): ActionsGroupes {
  const { appliquer, choisir, poserPoint, dire } = l;
  return {
    grouper: () => {
      const { dessin, sel } = lire();
      // Les racines de la selection : un groupe choisi avec une de ses feuilles ne se groupe qu'une fois.
      const ids = unites(dessin, sel);
      const r = ids.length ? grouper(dessin, ids) : null;
      if (!r?.id) { dire(t('Choisissez les formes à grouper.')); return; }
      const id = r.id;
      appliquer(() => r.dessin);
      choisir([id]);
      poserPoint(null);
      dire(phraseGroupeCree(dessin, ids));
    },
    degrouper: () => {
      const { dessin, sel } = lire();
      const groupes = sel.filter(id => groupeDe(dessin, id) !== undefined);
      if (!groupes.length) { dire(t('Choisissez un groupe à dégrouper.')); return; }
      const r = degrouper(dessin, groupes);
      appliquer(() => r.dessin);
      // Les enfants remontes sont choisis, avec ce que la selection portait d'autre : on voit ce que le groupe reunissait.
      const reste = sel.filter(id => !groupes.includes(id) && !r.ids.includes(id));
      choisir([...reste, ...r.ids]);
      poserPoint(null);
      dire(phraseGroupeDefait(r.dessin, groupes.length, r.ids, r.porteurs.length));
    }
  };
}

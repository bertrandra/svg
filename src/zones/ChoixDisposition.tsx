// Le choix de la disposition d'un texte (ADR-0031) : « Libre », « Sur la forme », « Dans la forme ». Trois boutons a etat (un etat,
// pas une action : jamais pleins) dans la barre de texte (des icones nommees) et dans le panneau Texte (des libelles), et trois
// choix radio dans le menu de la barre resserree. « Sur la forme » ou « Dans la forme » demande la forme : un clic sur la toile (ou
// Tab puis Entree) ; un texte deja pose change de mode sur la meme forme.

import type { Forme } from '../engine/editionSvg.js';
import { useActions, useDessin } from './contexteEditeur.js';
import { useSaisie } from './contexteSaisie.js';
import { candidatesPour, useDisposition } from './actionsDisposition.js';
import { Bouton } from './commun/Bouton.js';
import { MenuDeroulant, type ElementMenu, type SectionMenu } from './commun/Menu.js';
import type { NomIcone } from './icones.js';
import { LIBELLES_DISPOSITION, PHRASE_AUCUNE_CANDIDATE, phraseChoixForme, type ModeDisposition } from './phrasesDisposition.js';
import { useTactile } from './Vue.js';
import { usePolicesSi } from './contexteTexte.js';

export type ChoixDispo = 'libre' | ModeDisposition;

const CHOIX: ReadonlyArray<readonly [ChoixDispo, NomIcone]> = [['libre', 'texte-libre'], ['sur', 'texte-sur'], ['dans', 'texte-dans']];

/** Ce que disent les infobulles de la barre : le libelle, puis le geste. */
const AIDES: Readonly<Record<ChoixDispo, string>> = {
  libre: 'Libre : le texte sur sa ligne droite',
  sur: 'Sur la forme : le texte suit le tracé d’une forme',
  dans: 'Dans la forme : le texte remplit une forme fermée'
};

/** La disposition d'un texte, et le geste qui la change (le choix de la forme d'abord, s'il le faut). */
export function useChoixDisposition(forme: Forme | null | undefined) {
  const mo = useDessin(), ac = useActions(), sx = useSaisie(), dz = useDisposition(), tactile = useTactile();
  const p = forme?.texte?.disposition;
  const actuel: ChoixDispo = p ? p.mode : 'libre';
  const choisir = (c: ChoixDispo) => {
    if (!forme?.texte) return;
    if (sx.choixForme) sx.poserChoixForme(null);
    if (c === 'libre') { dz.liberer(forme.id); return; }
    // Un texte deja pose change de mode sur sa forme ; sinon, on demande la forme.
    if (p) { if (p.mode !== c) dz.poser(forme.id, p.forme, c); return; }
    if (!candidatesPour(mo.dessin, forme.id).length) { ac.dire(PHRASE_AUCUNE_CANDIDATE); return; }
    // La saisie se termine (le texte reste) : le clic suivant sur la toile donne la forme.
    sx.poignee.current?.terminer(false);
    sx.poserChoixForme({ id: forme.id, mode: c });
    ac.dire(phraseChoixForme(c, tactile));
  };
  const enChoix = sx.choixForme?.id === forme?.id ? sx.choixForme?.mode ?? null : null;
  const menu: ElementMenu[] = CHOIX.map(([c, icone]) => ({
    id: 'disposition-' + c, libelle: LIBELLES_DISPOSITION[c], icone, radio: true, coche: actuel === c, desactive: !!forme?.verrouille, onClick: () => choisir(c)
  }));
  return { actuel, choisir, enChoix, menu, verrou: !!forme?.verrouille };
}

/** Les trois boutons de la barre de texte : des icones, nommees par leur libelle. */
export function ChoixDispositionBarre({ forme }: { forme: Forme }) {
  const c = useChoixDisposition(forme);
  return (
    <div className="groupe" role="group" aria-label="Disposition">
      {CHOIX.map(([d, icone]) => (
        <Bouton key={d} icone={icone} aide={AIDES[d]} pressed={c.actuel === d || c.enChoix === d} disabled={c.verrou} onClick={() => c.choisir(d)} />
      ))}
    </div>
  );
}

/** Les trois boutons du panneau Texte, a libelles. */
export function ChoixDispositionPanneau({ forme }: { forme: Forme }) {
  const c = useChoixDisposition(forme);
  return (
    <div className="alignement-texte choix-disposition" role="group" aria-label="Disposition">
      {CHOIX.map(([d]) => (
        <button key={d} type="button" aria-pressed={c.actuel === d || c.enChoix === d} disabled={c.verrou} title={AIDES[d]} onClick={() => c.choisir(d)}>{LIBELLES_DISPOSITION[d]}</button>
      ))}
    </div>
  );
}

/**
 * Un texte et une forme choisis ensemble : « Poser le texte sur la forme » et « Poser le texte dans la forme », une rubrique du menu
 * de la selection. Null pour toute autre selection (deux textes, trois formes, un texte verrouille, une forme qui ne peut le porter).
 */
export function useSectionDisposition(): SectionMenu | null {
  const mo = useDessin(), dz = useDisposition();
  const choisies = mo.dessin.formes.filter(f => mo.sel.includes(f.id));
  const texte = choisies.find(f => f.texte), base = choisies.find(f => !f.texte);
  // Poser le texte le recompose : les fontes ne se demandent que si un texte est choisi, pas pour toute selection.
  usePolicesSi(choisies.length === 2 && !!texte && !!base);
  if (choisies.length !== 2 || !texte || !base || texte.verrouille || !candidatesPour(mo.dessin, texte.id).some(f => f.id === base.id)) return null;
  return {
    id: 'disposition', titre: 'Texte et forme', elements: [
      { id: 'poser-sur', libelle: 'Poser le texte sur la forme', icone: 'texte-sur', onClick: () => dz.poser(texte.id, base.id, 'sur') },
      { id: 'poser-dans', libelle: 'Poser le texte dans la forme', icone: 'texte-dans', onClick: () => dz.poser(texte.id, base.id, 'dans') }
    ]
  };
}

/** Le menu « Texte et forme » de la rangee de la selection, quand un texte et une forme sont choisis ensemble. */
export function DispositionSelection() {
  const section = useSectionDisposition();
  return section ? (
    <div className="groupe" role="group" aria-label="Texte et forme">
      <MenuDeroulant etiquette="Texte et forme : poser le texte sur ou dans la forme" icone="texte-sur" chevron={false} sections={[section]} />
    </div>
  ) : null;
}

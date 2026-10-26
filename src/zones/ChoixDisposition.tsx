// Le choix de la disposition d'un texte (ADR-0031) : « Libre », « Sur la forme », « Dans la forme ». Trois boutons a etat (un etat,
// pas une action : jamais pleins) dans la barre de texte (des icones nommees) et dans le panneau Texte (des libelles), et trois
// choix radio dans le menu de la barre resserree. « Sur la forme » ou « Dans la forme » demande la forme : un clic sur la toile (ou
// Tab puis Entree) ; un texte deja pose change de mode sur la meme forme. « Dans la forme » deforme le texte pour qu'il prenne la
// silhouette de la forme (ADR-0032) ; le remplissage en lignes reste un choix du panneau, et un texte deja en lignes le garde.

import type { Forme } from '../engine/editionSvg.js';
import { useActions, useDessin } from './contexteEditeur.js';
import { useSaisie } from './contexteSaisie.js';
import { candidatesPour, useDisposition } from './actionsDisposition.js';
import { Bouton } from './commun/Bouton.js';
import { MenuDeroulant, type ElementMenu, type SectionMenu } from './commun/Menu.js';
import type { NomIcone } from './icones.js';
import { LIBELLES_DISPOSITION, PHRASE_AUCUNE_CANDIDATE, phraseChoixForme, remplit, type ModeDisposition } from './phrasesDisposition.js';
import { useTactile } from './Vue.js';
import { usePolicesSi } from './contexteTexte.js';
import { t } from '../util/i18n.js';

/** Le choix de la barre : libre, sur la forme, ou dans la forme (deforme, ou en lignes : le panneau dit lequel). */
export type ChoixDispo = 'libre' | 'sur' | 'dans';

/** Le choix de la barre qui montre un mode, et le mode qu'un choix pose : « Dans la forme » deforme (ADR-0032). */
const choixDe = (mode: ModeDisposition): ChoixDispo => (remplit(mode) ? 'dans' : mode);
const modeDe = (c: Exclude<ChoixDispo, 'libre'>): ModeDisposition => (c === 'dans' ? 'enveloppe' : c);

const CHOIX: ReadonlyArray<readonly [ChoixDispo, NomIcone]> = [['libre', 'texte-libre'], ['sur', 'texte-sur'], ['dans', 'texte-dans']];

/** Ce que disent les infobulles de la barre : le libelle, puis le geste. Une fonction : traduit au rendu, la langue posee (ADR-0042). */
const aides = (): Readonly<Record<ChoixDispo, string>> => ({
  libre: t('Libre : le texte sur sa ligne droite'),
  sur: t('Sur la forme : le texte suit le tracé d’une forme'),
  dans: t('Dans la forme : le texte se déforme pour prendre la silhouette d’une forme fermée')
});

/** La disposition d'un texte, et le geste qui la change (le choix de la forme d'abord, s'il le faut). */
export function useChoixDisposition(forme: Forme | null | undefined) {
  const mo = useDessin(), ac = useActions(), sx = useSaisie(), dz = useDisposition(), tactile = useTactile();
  const p = forme?.texte?.disposition;
  const actuel: ChoixDispo = p ? choixDe(p.mode) : 'libre';
  const choisir = (c: ChoixDispo) => {
    if (!forme?.texte) return;
    if (sx.choixForme) sx.poserChoixForme(null);
    if (c === 'libre') { dz.liberer(forme.id); return; }
    // Un texte deja pose change de mode sur sa forme (un texte deja dans la forme, deforme ou en lignes, y reste tel quel) ; sinon,
    // on demande la forme.
    if (p) { if (choixDe(p.mode) !== c) dz.poser(forme.id, p.forme, modeDe(c)); return; }
    if (!candidatesPour(mo.dessin, forme.id).length) { ac.dire(PHRASE_AUCUNE_CANDIDATE); return; }
    // La saisie se termine (le texte reste) : le clic suivant sur la toile donne la forme.
    sx.poignee.current?.terminer(false);
    sx.poserChoixForme({ id: forme.id, mode: modeDe(c) });
    ac.dire(phraseChoixForme(modeDe(c), tactile));
  };
  const enChoix = sx.choixForme?.id === forme?.id && sx.choixForme ? choixDe(sx.choixForme.mode) : null;
  const menu: ElementMenu[] = CHOIX.map(([c, icone]) => ({
    id: 'disposition-' + c, libelle: t(LIBELLES_DISPOSITION[c]), icone, radio: true, coche: actuel === c, desactive: !!forme?.verrouille, onClick: () => choisir(c)
  }));
  return { actuel, choisir, enChoix, menu, verrou: !!forme?.verrouille };
}

/** Les trois boutons de la barre de texte : des icones, nommees par leur libelle. */
export function ChoixDispositionBarre({ forme }: { forme: Forme }) {
  const c = useChoixDisposition(forme);
  return (
    <div className="groupe" role="group" aria-label={t('Disposition')}>
      {CHOIX.map(([d, icone]) => (
        <Bouton key={d} icone={icone} aide={aides()[d]} pressed={c.actuel === d || c.enChoix === d} disabled={c.verrou} onClick={() => c.choisir(d)} />
      ))}
    </div>
  );
}

/** Les trois boutons du panneau Texte, a libelles. */
export function ChoixDispositionPanneau({ forme }: { forme: Forme }) {
  const c = useChoixDisposition(forme);
  return (
    <div className="alignement-texte choix-disposition" role="group" aria-label={t('Disposition')}>
      {CHOIX.map(([d]) => (
        <button key={d} type="button" aria-pressed={c.actuel === d || c.enChoix === d} disabled={c.verrou} title={aides()[d]} onClick={() => c.choisir(d)}>{t(LIBELLES_DISPOSITION[d])}</button>
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
    id: 'disposition', titre: t('Texte et forme'), elements: [
      { id: 'poser-sur', libelle: t('Poser le texte sur la forme'), icone: 'texte-sur', onClick: () => dz.poser(texte.id, base.id, 'sur') },
      { id: 'poser-dans', libelle: t('Poser le texte dans la forme'), icone: 'texte-dans', onClick: () => dz.poser(texte.id, base.id, 'enveloppe') }
    ]
  };
}

/** Le menu « Texte et forme » de la rangee de la selection, quand un texte et une forme sont choisis ensemble. */
export function DispositionSelection() {
  const section = useSectionDisposition();
  return section ? (
    <div className="groupe" role="group" aria-label={t('Texte et forme')}>
      <MenuDeroulant etiquette={t('Texte et forme : poser le texte sur ou dans la forme')} icone="texte-sur" chevron={false} sections={[section]} />
    </div>
  ) : null;
}

// Les filtres de source et de nature de la bibliotheque (ADR des bibliotheques libres) : des pastilles a etat, comme celles des
// evenements, et le chargement a la demande des annexes qu'un filtre appelle. Ce qu'une source propose, ce qu'il faut charger
// et dans quel ordre proposer les natures est du modele (model/bibliothequeSources.ts) ; ici, les boutons et l'attente.

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { naturesDansLOrdre, sourcesDemandees } from '../model/bibliothequeSources.js';
import { NOMS_NATURE, SOURCES_FORMES, SOURCE_PAR_DEFAUT, naturesDe, type NatureForme, type SourceFormes } from '../model/sourcesFormes.js';
import { chargerSource, type SourceChargee } from '../io/bibliotheque.js';
import type { Procede } from '../model/contextes.js';

interface Option { readonly id: string | null; readonly nom: string; readonly titre?: string }

/** Les fleches vont d'une pastille a l'autre du groupe ; Debut et Fin aux bouts (le meme geste que les evenements). */
function deplacer(e: KeyboardEvent<HTMLDivElement>) {
  const pas: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (pas[e.key] === undefined && e.key !== 'Home' && e.key !== 'End') return;
  const liste = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button.pastille-filtre'));
  const i = liste.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const cible = e.key === 'Home' ? 0 : e.key === 'End' ? liste.length - 1 : (i + (pas[e.key] ?? 0) + liste.length) % liste.length;
  liste[cible]?.focus();
}

/** Un groupe nomme de pastilles a etat (aria-pressed) : une seule choisie, un etat et non une action. */
export function PastillesFiltre({ libelle, options, valeur, poser }: { libelle: string; options: readonly Option[]; valeur: string | null; poser: (id: string | null) => void }) {
  return (
    <div className="pastilles-filtres" role="group" aria-label={libelle} onKeyDown={deplacer}>
      <span className="pastilles-titre" aria-hidden="true">{libelle}</span>
      <div className="pastilles">
        {options.map(o => (
          <button key={o.id ?? '*'} type="button" className="pastille-filtre" aria-pressed={o.id === valeur} title={o.titre} onClick={() => poser(o.id)}>{o.nom}</button>
        ))}
      </div>
    </div>
  );
}

/** L'infobulle d'une source : son nom complet, sa licence, ses natures, et ce qu'il faut charger si elle n'est pas la. */
function titreSource(s: SourceFormes, chargee: boolean): string {
  const natures = naturesDe(s).map(n => (n === 'plein' ? 'pleines' : 'en ligne')).join(' et ');
  return s.nom + ' · licence ' + s.licence + ' · formes ' + natures + (chargee ? '' : ' · environ ' + s.poidsMo + ' Mo à charger');
}

/** Les options du filtre de source : « Toutes », puis chaque source du registre. */
export function optionsSources(chargees: ReadonlySet<string>): Option[] {
  const total = SOURCES_FORMES.filter(s => !chargees.has(s.id)).reduce((n, s) => n + s.poidsMo, 0);
  return [
    { id: null, nom: 'Toutes', titre: 'Toutes les sources' + (total ? ' · environ ' + total + ' Mo à charger' : '') },
    ...SOURCES_FORMES.map(s => ({ id: s.id, nom: s.nomCourt, titre: titreSource(s, chargees.has(s.id)) }))
  ];
}

/** Les options du filtre de nature, dans l'ordre que le procede du contexte appelle (le stylo : « En ligne » d'abord). */
export function optionsNatures(procede: Procede | undefined): Option[] {
  return [{ id: null, nom: 'Toutes' }, ...naturesDansLOrdre(procede).map(n => ({ id: n, nom: NOMS_NATURE[n] }))];
}

/** Ce que le chargement des sources rend : les sources arrivees, celles en route, et les echecs, chacun dit. */
export interface EtatSources {
  readonly chargees: ReadonlyMap<string, SourceChargee>;
  readonly enCours: readonly SourceFormes[];
  readonly erreurs: readonly string[];
}

/**
 * Charge, a la premiere demande, les annexes des sources libres que le filtre appelle ; la source par defaut vient avec la
 * bibliotheque deja la. Une source demandee une fois reste chargee : revenir a « Toutes » ne la redemande pas.
 */
export function useSourcesLibres(source: string | null, nature: NatureForme | null): EtatSources {
  const [chargees, poserChargees] = useState<ReadonlyMap<string, SourceChargee>>(() => new Map());
  const [erreurs, poserErreurs] = useState<ReadonlyMap<string, string>>(() => new Map());
  const demandees = useMemo(() => sourcesDemandees(source, nature).filter(s => s.id !== SOURCE_PAR_DEFAUT), [source, nature]);
  const manquantes = demandees.filter(s => !chargees.has(s.id) && !erreurs.has(s.id));
  const cle = manquantes.map(s => s.id).join(' ');
  useEffect(() => {
    if (!cle) return;
    let vivant = true;
    for (const id of cle.split(' ')) {
      chargerSource(id).then(
        r => { if (vivant) poserChargees(m => new Map(m).set(id, r)); },
        (e: unknown) => { if (vivant) poserErreurs(m => new Map(m).set(id, e instanceof Error ? e.message : String(e))); }
      );
    }
    return () => { vivant = false; };
  }, [cle]);
  return { chargees, enCours: manquantes, erreurs: [...erreurs.values()] };
}

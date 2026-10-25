// L'operation de la selection dans sa rangee (ADR-0028) : en contexte Cricut qui coupe ou ecrit, deux boutons a etat, « À couper »
// et « À écrire », disent ce que la machine fera des formes choisies et le changent d'un geste (Maj+X, Maj+E). Une selection melee
// n'enfonce aucun des deux. Au doigt sur un petit ecran, un menu a deux choix tient la place d'un seul bouton. Un composant a part,
// que la rangee monte : il ne lit que ce qu'il montre.

import { memo } from 'react';
import { operationDe, operationsApplicables } from '../engine/preparation.js';
import type { Operation } from '../engine/editionSvg.js';
import { Bouton } from './commun/Bouton.js';
import { MenuDeroulant } from './commun/Menu.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';

/** L'operation des formes choisies : l'une ou l'autre, « melee », ou null hors d'un contexte qui coupe ou ecrit. */
function useOperationSelection(): Operation | 'melee' | null {
  const { dessin, choisies } = useDessin(), { profil } = useInterface();
  if (!profil || !operationsApplicables(profil.procede) || !choisies.size) return null;
  let r: Operation | null = null;
  for (const f of dessin.formes) {
    if (!choisies.has(f.id)) continue;
    const o = operationDe(f, profil.procede);
    if (r && o !== r) return 'melee';
    r = o;
  }
  return r;
}

const NOMS: Readonly<Record<Operation, string>> = { decoupe: 'À couper (Maj+X)', ecriture: 'À écrire au stylo (Maj+E)' };

export const OperationSelection = memo(function OperationSelection({ compacte = false }: { compacte?: boolean }) {
  const op = useOperationSelection(), ac = useActions();
  if (!op) return null;
  if (compacte) {
    const etat = op === 'melee' ? 'à couper et à écrire' : op === 'decoupe' ? 'à couper' : 'à écrire';
    return (
      <div className="groupe operation-selection" role="group" aria-label="Opération">
        <MenuDeroulant etiquette={'Opération de la sélection : ' + etat} icone={op === 'ecriture' ? 'stylo' : 'couper'} chevron={false} alignement="gauche" elements={[
          { id: 'operation-decoupe', libelle: 'À couper', raccourci: 'Maj+X', icone: 'couper', radio: true, coche: op === 'decoupe', onClick: () => ac.poserOperation('decoupe') },
          { id: 'operation-ecriture', libelle: 'À écrire au stylo', raccourci: 'Maj+E', icone: 'stylo', radio: true, coche: op === 'ecriture', onClick: () => ac.poserOperation('ecriture') }
        ]} />
      </div>
    );
  }
  return (
    <div className="groupe operation-selection" role="group" aria-label="Opération">
      <Bouton icone="couper" aide={NOMS.decoupe} pressed={op === 'decoupe'} onClick={() => ac.poserOperation('decoupe')} />
      <Bouton icone="stylo" aide={NOMS.ecriture} pressed={op === 'ecriture'} onClick={() => ac.poserOperation('ecriture')} />
    </div>
  );
});

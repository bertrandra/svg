// Un message de la page, selon son ton (DESIGN.md, « les messages ne servent qu'aux messages ») : un avertissement ou un echec en
// ambre, lu tout de suite (`role="alert"`) ; un succes ou une information en neutre, l'encre sur une feuille, lu poliment
// (`role="status"`). Un « Dessin enregistré » en ambre se lisait comme un probleme.

import type { ReactNode } from 'react';

export type TonMessage = 'alerte' | 'info';

export function Message({ ton, children }: { ton: TonMessage; children: ReactNode }) {
  return ton === 'info' ? <p className="message neutre" role="status">{children}</p> : <p className="message" role="alert">{children}</p>;
}

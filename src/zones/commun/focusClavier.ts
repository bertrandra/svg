// Le focus qu'une touche deplace (fleches d'un menu, d'un groupe de pastilles, des onglets de l'accueil). WebKit n'applique pas
// :focus-visible a un focus pose par script pendant un keydown dont le geste par defaut est empeche (preventDefault, sans quoi
// la fleche ferait aussi defiler la page) : un menu ouvert a la souris puis parcouru aux fleches n'y montrait aucun element
// atteint (mesure sous WebKit 26, Playwright 1.56.1 ; Chromium et Firefox l'appliquent). L'option `focusVisible` le lui
// demande ; un moteur qui ne la connait pas l'ignore et garde son heuristique (docs/navigateurs.md).

/** Donne le focus a `el` comme le clavier le donne : avec son anneau. */
export function focusAuClavier(el: HTMLElement | null | undefined, options: FocusOptions = {}): void {
  // `focusVisible` manque encore aux types DOM de TypeScript 5.9 : l'objet est elargi, pas le contrat.
  const avecAnneau: FocusOptions & { focusVisible: boolean } = { ...options, focusVisible: true };
  el?.focus(avecAnneau);
}

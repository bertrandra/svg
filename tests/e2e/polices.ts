// Aides des tests de navigateur pour la liste deroulante des polices (ADR-0034) : le champ « Police » est un combobox, sa liste
// s'ouvre au clic, au toucher ou a la fleche ; chaque option porte l'identifiant de la police qu'elle pose (`data-police`) et son
// etat (`data-etat` : locale, a-telecharger, en-cours, absente) ; le champ dit la police choisie (`data-valeur`). La liste ouverte vit
// a la racine de l'editeur (un portail) : on la cherche dans la page, une seule est ouverte a la fois.

import type { Locator } from 'playwright';

/** Le champ « Police » d'une zone (le panneau, l'inspecteur, la barre de texte). */
export const champPolice = (zone: Locator): Locator => zone.getByRole('combobox', { name: 'Police', exact: true });

/** La liste ouverte (celle du champ de la zone : une seule liste s'ouvre a la fois). */
export const listePolices = (zone: Locator): Locator => zone.page().getByRole('listbox', { name: 'Polices' });

/** L'option d'une police par son identifiant (la premiere : la police actuelle se montre aussi en tete). */
export const optionPolice = (zone: Locator, id: string): Locator => listePolices(zone).locator('[role="option"][data-police="' + id + '"]').first();

/** La police choisie dans la zone : son identifiant (la famille livree pour sa variante grasse). */
export const valeurPolice = (zone: Locator): Promise<string | null> => champPolice(zone).getAttribute('data-valeur');

/** Ouvre la liste de la zone (au clic, ou au toucher) et attend qu'elle soit la. */
export async function ouvrirPolices(zone: Locator, tactile = false): Promise<void> {
  const champ = champPolice(zone);
  await champ.waitFor({ timeout: 30_000 });
  if ((await champ.getAttribute('aria-expanded')) !== 'true') { if (tactile) await champ.tap(); else await champ.click(); }
  await listePolices(zone).waitFor();
}

/** Choisit une police par son identifiant, comme a la souris (ou au doigt) : ouvre la liste, touche l'option. */
export async function choisirPolice(zone: Locator, id: string, tactile = false): Promise<void> {
  await ouvrirPolices(zone, tactile);
  const option = optionPolice(zone, id);
  if (tactile) await option.tap(); else await option.click();
}

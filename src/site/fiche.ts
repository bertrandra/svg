// Ce qu'une ligne de projet dit de sa fiche (ADR-0030, ADR-0043) : la date et la taille, dans la langue de l'interface (ADR-0042).
// A part des ecrans pour que la liste des projets et celle des projets recus le disent de la meme facon.

import { dateCourte } from '../zones/session.js';
import { locale, t } from '../util/i18n.js';

/** Les mega-octets a une decimale, toujours ecrite (« 1,0 Mo »), avec le separateur de la langue (ADR-0042). */
const mega = (o: number): string => new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }).format(o / 1048576);

export const taille = (o: number): string => (o < 1024 ? t('{n} o', { n: o }) : o < 1048576 ? t('{n} Ko', { n: Math.max(1, Math.round(o / 1024)) }) : t('{n} Mo', { n: mega(o) }));

/** Une date ISO du serveur, courte ; vide si elle ne se lit pas. */
export const quand = (iso: string): string => { const ms = Date.parse(iso); return Number.isFinite(ms) ? dateCourte(ms) : ''; };

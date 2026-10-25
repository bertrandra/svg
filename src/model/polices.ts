// Le remplacement d'une police absente (ADR-0020) : le texte d'un SVG ou d'un PDF demande une police que la page n'a pas ; on
// le dessine avec la plus proche des neuf fontes embarquees (dist/polices.js), et on le dit. Une regle en donnees, lue dans
// l'ordre : la premiere dont un mot-cle figure dans le nom normalise l'emporte ; a defaut, la famille generique ; a defaut,
// Inter. Pur : des noms en entree, un identifiant de fonte en sortie.
//
// Les choix, et pourquoi :
//   - une fonte embarquee demandee par son nom (« Lobster », « Bebas Neue ») est elle-meme : rien a dire ;
//   - les lineales courantes (Helvetica, Arial, Roboto…) vont a Inter, lineale neutre de proportions voisines ; grasses, a Inter gras ;
//   - les familles a empattements (Times, Georgia, Garamond…) vont a Playfair Display gras, la seule a empattements embarquee : le
//     caractere de la lettre se garde, la graisse non (c'est dit) ;
//   - les etroites et d'affiche (Impact, Oswald, League Gothic…) a Oswald ; les arrondies (Nunito, Quicksand…) a Fredoka ;
//   - les manuscrites (Comic, Marker, Kalam…) a Caveat ; les scriptes et pinceaux (Brush Script, Dancing…) a Pacifico ;
//   - la chasse fixe (Courier, Consolas…) n'a pas d'equivalent : Inter, et le dire ;
//   - aucune fonte embarquee n'est italique : une italique demandee se penche de 12 degres (italique synthetique), et c'est dit.

export type IdPolice = 'inter' | 'inter-gras' | 'oswald' | 'bebas' | 'playfair' | 'lobster' | 'pacifico' | 'caveat' | 'fredoka';

/** Le nom lisible de chaque fonte embarquee, celui de scripts/polices.mjs. */
export const NOMS_POLICES: Readonly<Record<IdPolice, string>> = {
  inter: 'Inter', 'inter-gras': 'Inter gras', oswald: 'Oswald', bebas: 'Bebas Neue', playfair: 'Playfair Display gras',
  lobster: 'Lobster', pacifico: 'Pacifico', caveat: 'Caveat gras', fredoka: 'Fredoka'
};

export interface DemandePolice {
  /** Le nom demande : une famille CSS, un /BaseFont de PDF (« ABCDEF+Arial-BoldMT »). */
  readonly nom: string;
  readonly gras?: boolean;
  readonly italique?: boolean;
  /** Ce que le fichier dit de la famille quand le nom ne dit rien (drapeaux du descripteur d'une police PDF). */
  readonly indice?: 'serif' | 'script' | 'mono';
}

export interface Remplacement {
  readonly id: IdPolice;
  /** Vrai quand la police demandee est celle-la meme (une fonte embarquee demandee par son nom) : rien a dire. */
  readonly exacte: boolean;
  /** Vrai quand une italique demandee se penche (italique synthetique). */
  readonly penchee: boolean;
  /** Le nom lisible de la police demandee, pour la phrase (« Arial »). */
  readonly demandee: string;
}

interface Regle { readonly mots: readonly string[]; readonly id: IdPolice; readonly gras?: IdPolice; readonly propre?: boolean }

/** Les fontes embarquees demandees par leur nom : elles-memes (propre), avant toute famille. */
const PROPRES: readonly Regle[] = [
  { mots: ['inter'], id: 'inter', gras: 'inter-gras', propre: true },
  { mots: ['oswald'], id: 'oswald', propre: true },
  { mots: ['bebasneue', 'bebas'], id: 'bebas', propre: true },
  { mots: ['playfairdisplay', 'playfair'], id: 'playfair', propre: true },
  { mots: ['lobster'], id: 'lobster', propre: true },
  { mots: ['pacifico'], id: 'pacifico', propre: true },
  { mots: ['caveat'], id: 'caveat', propre: true },
  { mots: ['fredoka'], id: 'fredoka', propre: true }
];

/** Les familles, par mots-cles du nom normalise. L'ordre compte : « sans » se teste avant « serif » (« PT Sans » n'a pas d'empattements). */
export const REGLES_POLICES: readonly Regle[] = [
  ...PROPRES,
  { mots: ['mono', 'courier', 'consolas', 'menlo', 'monaco', 'code', 'typewriter', 'lucidaconsole'], id: 'inter', gras: 'inter-gras' },
  { mots: ['comic', 'marker', 'hand', 'kalam', 'chalk', 'indie', 'architect', 'patrick', 'shadows', 'gochi', 'amatic'], id: 'caveat' },
  { mots: ['script', 'brush', 'cursive', 'vibes', 'dancing', 'satisfy', 'allura', 'sacramento', 'parisienne', 'zapfchancery', 'chancery', 'kaushan'], id: 'pacifico' },
  { mots: ['rounded', 'round', 'nunito', 'quicksand', 'comfortaa', 'varela', 'baloo'], id: 'fredoka' },
  { mots: ['impact', 'condensed', 'narrow', 'compressed', 'gothic', 'anton', 'teko', 'fjalla', 'barlowcondensed', 'leaguegothic'], id: 'oswald' },
  { mots: ['sans', 'helvetica', 'arial', 'verdana', 'tahoma', 'segoe', 'roboto', 'opensans', 'calibri', 'futura', 'gill', 'myriad', 'lato', 'montserrat', 'poppins', 'frutiger', 'univers', 'avenir', 'geneva', 'trebuchet', 'franklin', 'din', 'grotesk', 'grotesque', 'source'], id: 'inter', gras: 'inter-gras' },
  { mots: ['serif', 'times', 'georgia', 'garamond', 'baskerville', 'palatino', 'cambria', 'minion', 'caslon', 'bodoni', 'didot', 'book', 'roman', 'merriweather', 'lora', 'charter', 'century', 'cochin', 'constantia', 'utopia'], id: 'playfair' }
];

/** Les familles generiques CSS. */
const GENERIQUES: Readonly<Record<string, IdPolice>> = { serif: 'playfair', 'sans-serif': 'inter', monospace: 'inter', cursive: 'pacifico', fantasy: 'oswald', 'system-ui': 'inter', 'ui-sans-serif': 'inter', 'ui-serif': 'playfair', 'ui-monospace': 'inter', 'ui-rounded': 'fredoka' };

const GRAS = /(bold|black|heavy|semibold|demibold|extrabold|ultrabold|demi|bd)\b/i;
const ITALIQUE = /(italic|oblique|it)\b/i;

/** Le nom lisible : sans le prefixe de sous-ensemble (« ABCDEF+ »), sans guillemets, la famille avant ses styles (« Arial-BoldMT » : « Arial »). */
export function nomLisible(brut: string): string {
  const sans = brut.trim().replace(/^["']|["']$/g, '').replace(/^[A-Z]{6}\+/, '');
  const famille = sans.split(/[-,]/)[0] ?? sans;
  return (famille.replace(/(?:MT|PS|Std|Pro|LT)+$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim() || sans || 'police sans nom').slice(0, 60);
}

const normaliser = (t: string): string => t.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

/** La fonte embarquee qui remplace une police demandee. */
export function remplacerPolice(d: DemandePolice): Remplacement {
  const brut = d.nom.trim().replace(/^["']|["']$/g, '').replace(/^[A-Z]{6}\+/, '');
  const styles = brut.split(/[-,]/).slice(1).join(' ') + ' ' + brut.replace(/([a-z])([A-Z])/g, '$1 $2');
  const gras = d.gras ?? GRAS.test(styles), italique = d.italique ?? ITALIQUE.test(brut.replace(/([a-z])([A-Z])/g, '$1 $2'));
  const demandee = nomLisible(d.nom), cle = normaliser(brut.split(/[-,]/)[0] ?? brut);
  const generique = GENERIQUES[brut.toLowerCase()];
  const regle = generique ? null : REGLES_POLICES.find(r => r.mots.some(m => cle.includes(m)));
  const parIndice: IdPolice | null = d.indice === 'serif' ? 'playfair' : d.indice === 'script' ? 'pacifico' : null;
  const id = generique ?? (regle ? (gras && regle.gras ? regle.gras : regle.id) : parIndice ?? (gras ? 'inter-gras' : 'inter'));
  return { id, exacte: regle?.propre === true && !italique, penchee: italique, demandee };
}

/**
 * Le remplacement d'une liste de familles CSS (« Lobster, Georgia, serif ») : la premiere fonte embarquee nommee l'emporte ; a
 * defaut, la premiere famille est remplacee par la regle.
 */
export function remplacerFamilles(familles: string, d: Omit<DemandePolice, 'nom'> = {}): Remplacement {
  const noms = familles.split(',').map(n => n.trim()).filter(Boolean);
  for (const n of noms) {
    const r = remplacerPolice({ ...d, nom: n });
    if (r.exacte) return r;
  }
  const premier = noms[0] ?? 'sans-serif';
  const r = remplacerPolice({ ...d, nom: premier });
  // Une famille generique seule (« serif ») n'est pas une police absente : elle se choisit, sans rien dire de plus.
  return GENERIQUES[premier.toLowerCase()] && noms.length === 1 && !r.penchee ? { ...r, exacte: true } : r;
}

/** La phrase d'un remplacement pour `ignores` : « 3 textes en Arial, police remplacee par Inter ». */
export function phraseRemplacement(textes: number, r: Remplacement): string {
  return textes.toLocaleString('fr-FR') + ' texte' + (textes > 1 ? 's' : '') + ' en ' + r.demandee + ', police remplacée par ' + NOMS_POLICES[r.id] + (r.penchee ? ' penchée (italique synthétique)' : '');
}

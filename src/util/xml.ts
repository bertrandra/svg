// Lire un petit document XML (un SVG) en arbre, sans DOM : le coeur pur l'edite et les tests le
// lisent sous Node. Ce n'est pas un validateur : on lit ce qu'un logiciel de dessin ecrit
// (declarations, commentaires, CDATA, balises et attributs), et l'on rend null sur un texte casse.

export interface Noeud { nom: string; attributs: Record<string, string>; enfants: Noeud[]; texte: string }

const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decoderEntites(t: string): string {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tout, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : tout;
    }
    return ENTITES[e.toLowerCase()] ?? tout;
  });
}

export const echapperAttribut = (t: string): string => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** La racine du document, ou null s'il ne se lit pas (balise non fermee, fermeture orpheline). */
export function lireXml(texte: string): Noeud | null {
  const racine: Noeud = { nom: '#document', attributs: {}, enfants: [], texte: '' };
  const pile: Noeud[] = [racine];
  const balise = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<\/\s*([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let m: RegExpExecArray | null, dernier = 0;
  while ((m = balise.exec(texte))) {
    const courant = pile[pile.length - 1];
    if (!courant) return null;
    courant.texte += decoderEntites(texte.slice(dernier, m.index));
    dernier = balise.lastIndex;
    if (m[1] !== undefined) { courant.texte += m[1]; continue; }
    if (m[2] !== undefined) {
      if (pile.length < 2 || courant.nom !== m[2]) return null;
      pile.pop();
      continue;
    }
    if (m[3] === undefined) continue;
    const attributs: Record<string, string> = {};
    const attr = /([^\s=/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = attr.exec(m[4] ?? ''))) attributs[a[1] ?? ''] = decoderEntites(a[3] ?? a[4] ?? a[5] ?? '');
    const noeud: Noeud = { nom: m[3], attributs, enfants: [], texte: '' };
    courant.enfants.push(noeud);
    if (m[5] !== '/') pile.push(noeud);
  }
  if (pile.length !== 1) return null;
  return racine;
}

/** Le premier element de ce nom, en profondeur. */
export function trouver(n: Noeud, nom: string): Noeud | null {
  for (const e of n.enfants) {
    if (e.nom === nom) return e;
    const r = trouver(e, nom);
    if (r) return r;
  }
  return null;
}

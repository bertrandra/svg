// Nettoyer un SVG avant de l'ouvrir ou de le rendre. Un dessin vient d'un fichier qu'on n'a pas
// ecrit : on en retire tout ce qui s'execute ou va chercher ailleurs (scripts, gestionnaires
// d'evenements, foreignObject, references externes), et on garde le dessin. Ce nettoyage protege
// aussi les SVG enregistres, ouverts ailleurs.

export interface SvgPropre { svg: string; ratio: number }

export function nettoyerSvg(texte: string): SvgPropre | null {
  const debut = texte.search(/<svg[\s>]/i);
  const fin = texte.toLowerCase().lastIndexOf('</svg>');
  if (debut < 0 || fin < debut) return null;
  let s = texte.slice(debut, fin + 6);
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, '').replace(/<script[^>]*\/>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(xlink:)?href\s*=\s*("(?!#|data:image\/(png|jpe?g|gif|webp);)[^"]*"|'(?!#|data:image\/(png|jpe?g|gif|webp);)[^']*')/gi, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(?!#)[^)]*\)/gi, 'none')
    .replace(/javascript:/gi, '');
  if (!/xmlns=/.test(s.slice(0, s.indexOf('>')))) s = s.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  const entete = s.slice(0, s.indexOf('>'));
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(entete);
  const lw = /\swidth\s*=\s*["']?([\d.]+)/i.exec(entete), lh = /\sheight\s*=\s*["']?([\d.]+)/i.exec(entete);
  const l = Number(vb?.[1] ?? lw?.[1]), h = Number(vb?.[2] ?? lh?.[1]);
  if (!(l > 0 && h > 0)) return null;
  if (!vb) s = s.replace(/<svg/i, `<svg viewBox="0 0 ${l} ${h}"`);
  return { svg: s, ratio: l / h };
}

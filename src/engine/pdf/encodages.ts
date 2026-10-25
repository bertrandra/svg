// Les encodages simples d'un PDF (ISO 32000-1, annexe D) : StandardEncoding, WinAnsiEncoding et MacRomanEncoding, code ->
// nom de glyphe, et le caractere Unicode de chacun de ces noms (le caractere que l'annexe D montre pour lui). Des donnees, pas
// de calcul. Un nom absent d'ici se lit par sa forme (« uni00E9 », « u1F600 », une lettre seule) dans `unicodeDeNom`.

/** Les trois encodages, un nom par code de 0 a 255 separes par des espaces ; « . » pour un code sans glyphe. */
const ENCODAGES_BRUTS: Readonly<Record<string, string>> = {
  StandardEncoding: '. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . space exclam quotedbl numbersign dollar percent ampersand quoteright parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore quoteleft a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . exclamdown cent sterling fraction yen florin section currency quotesingle quotedblleft guillemotleft guilsinglleft guilsinglright fi fl . endash dagger daggerdbl periodcentered . paragraph bullet quotesinglbase quotedblbase quotedblright guillemotright ellipsis perthousand . questiondown . grave acute circumflex tilde macron breve dotaccent dieresis . ring cedilla . hungarumlaut ogonek caron emdash . . . . . . . . . . . . . . . . AE . ordfeminine . . . . Lslash Oslash OE ordmasculine . . . . . ae . . . dotlessi . . lslash oslash oe germandbls . . . .',
  WinAnsiEncoding: '. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore grave a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde bullet Euro bullet quotesinglbase florin quotedblbase ellipsis dagger daggerdbl circumflex perthousand Scaron guilsinglleft OE bullet Zcaron bullet bullet quoteleft quoteright quotedblleft quotedblright bullet endash emdash tilde trademark scaron guilsinglright oe bullet zcaron Ydieresis space exclamdown cent sterling currency yen brokenbar section dieresis copyright ordfeminine guillemotleft logicalnot hyphen registered macron degree plusminus twosuperior threesuperior acute mu paragraph periodcentered cedilla onesuperior ordmasculine guillemotright onequarter onehalf threequarters questiondown Agrave Aacute Acircumflex Atilde Adieresis Aring AE Ccedilla Egrave Eacute Ecircumflex Edieresis Igrave Iacute Icircumflex Idieresis Eth Ntilde Ograve Oacute Ocircumflex Otilde Odieresis multiply Oslash Ugrave Uacute Ucircumflex Udieresis Yacute Thorn germandbls agrave aacute acircumflex atilde adieresis aring ae ccedilla egrave eacute ecircumflex edieresis igrave iacute icircumflex idieresis eth ntilde ograve oacute ocircumflex otilde odieresis divide oslash ugrave uacute ucircumflex udieresis yacute thorn ydieresis',
  MacRomanEncoding: '. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore grave a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde . Adieresis Aring Ccedilla Eacute Ntilde Odieresis Udieresis aacute agrave acircumflex adieresis atilde aring ccedilla eacute egrave ecircumflex edieresis iacute igrave icircumflex idieresis ntilde oacute ograve ocircumflex odieresis otilde uacute ugrave ucircumflex udieresis dagger degree cent sterling section bullet paragraph germandbls registered copyright trademark acute dieresis . AE Oslash . plusminus . . yen mu . . . . . ordfeminine ordmasculine . ae oslash questiondown exclamdown logicalnot . florin . . guillemotleft guillemotright ellipsis space Agrave Atilde Otilde OE oe endash emdash quotedblleft quotedblright quoteleft quoteright divide . ydieresis Ydieresis fraction currency guilsinglleft guilsinglright fi fl daggerdbl periodcentered quotesinglbase quotedblbase perthousand Acircumflex Ecircumflex Aacute Edieresis Egrave Iacute Icircumflex Idieresis Igrave Oacute Ocircumflex . Ograve Uacute Ucircumflex Ugrave dotlessi circumflex tilde macron breve dotaccent ring cedilla hungarumlaut ogonek caron',
};

/** Le point de code de chaque nom de ces encodages, en hexadecimal, « nom:code » separes par des espaces. */
const NOMS_BRUTS = [
  'A:41 AE:C6 Aacute:C1 Acircumflex:C2 Adieresis:C4 Agrave:C0 Aring:C5 Atilde:C3 B:42 C:43 Ccedilla:C7 D:44 E:45 Eacute:C9 Ecircumflex:CA Edieresis:CB',
  'Egrave:C8 Eth:D0 Euro:20AC F:46 G:47 H:48 I:49 Iacute:CD Icircumflex:CE Idieresis:CF Igrave:CC J:4A K:4B L:4C Lslash:141 M:4D N:4E Ntilde:D1 O:4F',
  'OE:152 Oacute:D3 Ocircumflex:D4 Odieresis:D6 Ograve:D2 Oslash:D8 Otilde:D5 P:50 Q:51 R:52 S:53 Scaron:160 T:54 Thorn:DE U:55 Uacute:DA Ucircumflex:DB',
  'Udieresis:DC Ugrave:D9 V:56 W:57 X:58 Y:59 Yacute:DD Ydieresis:178 Z:5A Zcaron:17D a:61 aacute:E1 acircumflex:E2 acute:B4 adieresis:E4 ae:E6 agrave:E0',
  'ampersand:26 aring:E5 asciicircum:5E asciitilde:7E asterisk:2A at:40 atilde:E3 b:62 backslash:5C bar:7C braceleft:7B braceright:7D bracketleft:5B',
  'bracketright:5D breve:2D8 brokenbar:A6 bullet:2022 c:63 caron:2C7 ccedilla:E7 cedilla:B8 cent:A2 circumflex:2C6 colon:3A comma:2C copyright:A9',
  'currency:A4 d:64 dagger:2020 daggerdbl:2021 degree:B0 dieresis:A8 divide:F7 dollar:24 dotaccent:2D9 dotlessi:131 e:65 eacute:E9 ecircumflex:EA',
  'edieresis:EB egrave:E8 eight:38 ellipsis:2026 emdash:2014 endash:2013 equal:3D eth:F0 exclam:21 exclamdown:A1 f:66 fi:FB01 five:35 fl:FB02 florin:192',
  'four:34 fraction:2044 g:67 germandbls:DF grave:60 greater:3E guillemotleft:AB guillemotright:BB guilsinglleft:2039 guilsinglright:203A h:68',
  'hungarumlaut:2DD hyphen:2D i:69 iacute:ED icircumflex:EE idieresis:EF igrave:EC j:6A k:6B l:6C less:3C logicalnot:AC lslash:142 m:6D macron:AF mu:B5',
  'multiply:D7 n:6E nine:39 ntilde:F1 numbersign:23 o:6F oacute:F3 ocircumflex:F4 odieresis:F6 oe:153 ogonek:2DB ograve:F2 one:31 onehalf:BD',
  'onequarter:BC onesuperior:B9 ordfeminine:AA ordmasculine:BA oslash:F8 otilde:F5 p:70 paragraph:B6 parenleft:28 parenright:29 percent:25 period:2E',
  'periodcentered:B7 perthousand:2030 plus:2B plusminus:B1 q:71 question:3F questiondown:BF quotedbl:22 quotedblbase:201E quotedblleft:201C',
  'quotedblright:201D quoteleft:2018 quoteright:2019 quotesinglbase:201A quotesingle:27 r:72 registered:AE ring:2DA s:73 scaron:161 section:A7',
  'semicolon:3B seven:37 six:36 slash:2F space:20 sterling:A3 t:74 thorn:FE three:33 threequarters:BE threesuperior:B3 tilde:2DC trademark:2122 two:32',
  'twosuperior:B2 u:75 uacute:FA ucircumflex:FB udieresis:FC ugrave:F9 underscore:5F v:76 w:77 x:78 y:79 yacute:FD ydieresis:FF yen:A5 z:7A zcaron:17E',
  'zero:30'
].join(' ');
const ENCODAGES = new Map(Object.entries(ENCODAGES_BRUTS).map(([k, v]) => [k, v.split(' ').map(n => (n === '.' ? '' : n))]));

const UNICODE = new Map(NOMS_BRUTS.split(' ').map(p => { const [n = '', h = '0'] = p.split(':'); return [n, parseInt(h, 16)] as const; }));

/** Les noms de glyphe d'un encodage nomme (256 entrees, '' pour un code vide), ou null s'il n'est pas l'un des trois. */
export const encodage = (nom: string): readonly string[] | null => ENCODAGES.get(nom) ?? null;

/**
 * Le texte d'un nom de glyphe : par la table, puis par sa forme (« uni00E9 », « uni00660301 », « u1F600 »), un suffixe de
 * variante retire (« a.sc », « one.oldstyle »), une ligature nommee par ses parties (« f_i ») ; '' quand il ne se lit pas
 * (« g42 », « cid17 », un nom propre a la fonte).
 */
export function unicodeDeNom(nom: string): string {
  const connu = UNICODE.get(nom);
  if (connu !== undefined) return String.fromCodePoint(connu);
  const uni = /^uni((?:[0-9A-F]{4})+)$/.exec(nom);
  if (uni?.[1]) return (uni[1].match(/.{4}/g) ?? []).map(h => String.fromCharCode(parseInt(h, 16))).join('');
  const u = /^u([0-9A-F]{4,6})$/.exec(nom);
  if (u?.[1]) { const c = parseInt(u[1], 16); return c <= 0x10ffff ? String.fromCodePoint(c) : ''; }
  const point = nom.indexOf('.');
  if (point > 0) return unicodeDeNom(nom.slice(0, point));
  if (nom.includes('_')) return nom.split('_').map(unicodeDeNom).join('');
  return '';
}

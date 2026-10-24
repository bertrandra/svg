// Le point d'entree de dist/vtracer.js : il pose la fabrique du traceur sur la fenetre, ou la page
// (src/io/vtracer.ts) la trouve une fois le script arrive. Rien ne s'execute avant qu'on l'appelle.
import { traceurWasm } from '../../src/io/vtracerWasm.js';

(window as unknown as { __vtracerSvg?: typeof traceurWasm }).__vtracerSvg = traceurWasm;

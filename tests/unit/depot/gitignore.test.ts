import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// Ce que le depot ne doit jamais proposer a un commit : sans ces regles, un worktree d'agent ou un lien
// node_modules apparait en « fichier non suivi » et bloque la fin de session. On interroge git lui-meme
// (check-ignore), pas le texte du fichier : c'est son interpretation qui compte.

const racine = join(__dirname, '../../..');
const ignore = (chemin: string): boolean => {
  try { execFileSync('git', ['check-ignore', '--no-index', '-q', chemin], { cwd: racine }); return true; } catch { return false; }
};

describe('.gitignore', () => {
  it.each([
    'node_modules', 'node_modules/vitest/package.json', 'dist/editeur-svg.html', 'coverage/lcov.info', 'x.log',
    '.claude/worktrees', '.claude/worktrees/agent-a1b2c3/src/zones/EditeurSvg.tsx', '.claude/settings.local.json'
  ])('ignore %s', chemin => {
    expect(ignore(chemin)).toBe(true);
  });

  it.each(['src/zones/EditeurSvg.tsx', 'docs/jetons.md', 'tests/fixtures/svg/arcs.svg', '.claude/skills/exemple/SKILL.md'])('ne cache pas %s', chemin => {
    expect(ignore(chemin)).toBe(false);
  });
});

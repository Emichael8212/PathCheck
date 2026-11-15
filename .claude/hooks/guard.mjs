#!/usr/bin/env node
// PreToolUse guard for Bash. Glob deny rules in settings.json are easy to sidestep
// (`git -C . push --force`, `npx netlify env:set ...`, `cat .env.local`), so this checks the
// whole command text with regexes. Exit 2 blocks the call and tells Claude why.
// This is defense in depth, not a sandbox: code run by node/npm can still read files.
import { readFileSync } from 'node:fs';

let cmd = '';
try { cmd = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command ?? ''; } catch { process.exit(0); }
if (typeof cmd !== 'string' || cmd === '') process.exit(0);

const block = why => {
  process.stderr.write(`Blocked by PathCheck guard (.claude/hooks/guard.mjs): this command ${why}. ` +
    'This is a hard limit from CLAUDE.md. If it is genuinely needed, stop and ask the human to run it.\n');
  process.exit(2);
};

// `git [-C dir] [-c k=v] <sub> <args...>` — args captured up to the next shell separator.
const gitSub = sub => new RegExp(String.raw`\bgit(?:\s+-[Cc]\s+\S+)*\s+(?:${sub})\b([^|;&]*)`, 'g');
const forEachArgs = (re, fn) => { for (const m of cmd.matchAll(re)) fn(m[1] ?? ''); };

// --- Secrets -------------------------------------------------------------------------
// Messages may mention ".env"; allow that only when nothing in the command executes.
const messageOnly = /^\s*(git\s+commit|gh\s+pr\s+(create|edit|comment))\b/.test(cmd) && !/\$\(|`|<|\|/.test(cmd);
if (!messageOnly && /(^|[\s'"`=:/(<])\.env(\.(?!example\b)[\w.-]+)?(?=$|[\s'"`;|&)>/*])/.test(cmd)) block('reads or touches a .env secret file');
if (/\.(pem|key)\b(?=$|[\s'"`;|&)])/.test(cmd)) block('touches a private key file');
if (/(^|[|;&]\s*|\$\(\s*)(printenv|env|export\s+-p|set)(?=\s*($|[|;&>)]))/.test(cmd)) block('prints environment variables');
if (/\.config\/gh\/hosts|\.netlify\/|\.config\/netlify|\bsecurity\s+find-(generic|internet)-password\b|\bgh\s+auth\s+token\b/.test(cmd)) block('reads a stored login token');

// --- Git ---------------------------------------------------------------------------
forEachArgs(gitSub('push'), args => {
  if (/(^|\s|:)['"]?(refs\/heads\/)?(main|master)['"]?(?=\s|$)/.test(args)) block('pushes to main');
  if (/(^|\s)(-[a-zA-Z]*[fd][a-zA-Z]*|--force\S*|--mirror|--all|--delete|--prune)(?=\s|$)/.test(args)) block('force/mirror/delete push');
  if (/\s['"]?[+:]\S/.test(args)) block('force (+) or delete (:) refspec push');
});
if (gitSub('clean|filter-branch|filter-repo').test(cmd)) block('git clean or history rewrite');
if (gitSub(String.raw`reset\s+--hard|branch\s+-D|worktree\s+remove|update-ref\s+-d`).test(cmd)) block('destructive git operation');

// --- GitHub admin surfaces -------------------------------------------------------------
if (/\bgh\s+(api|secret|ruleset|variable)\b/.test(cmd)) block('GitHub API/secret/ruleset access');
if (/\bgh\s+(repo\s+(edit|delete|rename|archive)|release\s+delete)\b/.test(cmd)) block('changes GitHub repository settings');
if (/\bgh\s+pr\s+merge\b[^|;&]*--admin\b/.test(cmd)) block('admin merge bypass');

// --- Netlify (bare or via npx) ---------------------------------------------------------
if (/\bnetlify\s+(env(:\S*)?|api|sites:delete)(?=\s|$)/.test(cmd)) block('Netlify env/secret or admin API');

// --- Network: remote code and data leaving the machine -----------------------------------
const fetches = /\b(curl|wget)\b/.test(cmd);
if (fetches && /\|\s*(sudo\s+)?((ba|z|da|k)?sh|node|python3?|perl|ruby)\b/.test(cmd)) block('pipes downloaded content into an interpreter');
if (/<\(\s*(curl|wget)\b/.test(cmd)) block('runs downloaded content');
if (fetches) {
  const local = /https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?=[:/\s'"]|$)/i.test(cmd);
  const remoteUrl = /https?:\/\/(?!(127\.0\.0\.1|localhost|\[::1\])(?=[:/\s'"]|$))/i.test(cmd);
  const writes = /(\s(-d|--data\S*|-F|--form\S*|-T|--upload-file|--post-file|--post-data)(?=[\s=@'"]|$))|(\s(-X|--request)\s*['"]?(POST|PUT|PATCH|DELETE)\b)|(\s-[a-zA-Z]*[dFT]@)/i.test(cmd);
  if (writes && (!local || remoteUrl)) block('sends data or a file to a non-local host');
}

// --- Filesystem wipes -----------------------------------------------------------------
for (const m of cmd.matchAll(/\brm\s+((?:(?:-[a-zA-Z]+|--recursive|--force)\s+)+)(?:--\s+)?(['"]?)([^\s'"]+)\2/g)) {
  const flags = m[1], target = m[3];
  if (!/(-[a-zA-Z]*r|--recursive)/i.test(flags)) continue;
  if (/^(\/\*?|\/[A-Za-z]+\/?|~(\/.*)?|\$HOME(\/.*)?|\$\{HOME\}(\/.*)?|\.\.?\/?|\*)$/.test(target)) block('recursive delete of a top-level or home path');
}
process.exit(0);

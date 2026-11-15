#!/usr/bin/env node
// Prints where the work stands, from features.json and docs/sprints/. Used by
// scripts/init.sh and the SessionStart hook so both always say the same thing.
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

let data;
try {
  data = JSON.parse(read('features.json'));
} catch {
  console.log('Features: features.json unreadable');
  process.exit(0);
}

const blocked = id => {
  // BLOCKED = a line starting with that word inside the sprint file's "## Result" section.
  try {
    const result = read(`docs/sprints/${id}.md`).split(/^## /m).find(section => section.startsWith('Result'));
    return /^\s*BLOCKED\b/m.test(result ?? '');
  } catch { return false; }
};

const { features, milestones } = data;
const passing = features.filter(f => f.passes).length;
const blockedIds = features.filter(f => !f.passes && blocked(f.id)).map(f => f.id);
console.log(`Features: ${passing}/${features.length} passing${blockedIds.length ? `; BLOCKED: ${blockedIds.join(', ')}` : ''}`);

// The current milestone is the first one with a feature that does not pass yet.
// Features of later milestones are never started before the owner has checked this one.
const current = milestones.find(m => features.some(f => f.milestone === m.id && !f.passes));
if (!current) {
  console.log('Milestone: every feature passes — stop and ask the owner for the final check.');
  process.exit(0);
}
const open = features.filter(f => f.milestone === current.id && !f.passes);
const next = open.find(f => !blocked(f.id));
console.log(`Milestone: ${current.id} — ${current.delivered} (${open.length} feature(s) left). Owner checks: ${current.ownerChecks}.`);
console.log(next
  ? `Next feature: ${next.id} — ${next.description}`
  : `Next feature: none — everything left in ${current.id} is BLOCKED; stop and ask the owner.`);
const previous = milestones[milestones.indexOf(current) - 1];
if (previous && open.length === features.filter(f => f.milestone === current.id).length) {
  console.log(`Before starting ${current.id}: the owner must have checked ${previous.id} (see docs/decision-log.md). If not recorded there, stop and ask.`);
}

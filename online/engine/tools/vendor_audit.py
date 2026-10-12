#!/usr/bin/env python3
"""pal98-eng-v3.6 street-vendor audit over sss.mkf + m_eng/m_chs/m_cht.slf.

Finds every script neighbourhood with a Yes/No prompt (0x000A) whose Yes branch
decreases cash (0x001E with a negative operand) and/or grants an item (0x001F),
and prints the dialogue shown right before the prompt in all three languages.

Usage: vendor_audit.py <dir with sss.mkf, data.mkf and m_*.slf> [out.json]
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from palparse import Pal, read_slf  # pylint: disable=g-import-not-at-top

DATA = sys.argv[1] if len(sys.argv) > 1 else '.'
OPN = {int(k, 16): v for k, v in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'opnames.json'))).items()}

p = Pal(DATA)
S = p.scripts
N = len(S)
LANG = {}
for lang in ('eng', 'chs', 'cht'):
  LANG[lang] = read_slf(os.path.join(DATA, 'm_%s.slf' % lang))


def s16(v):
  return v - 0x10000 if v & 0x8000 else v


def msg_block_start(i):
  """Given index i of a 0xFFFF entry, return (block_first_index, span, end_index) like MESSAGE_GetSpan."""
  cur = i
  first = last = S[cur][1]
  beginning = True
  if cur + 1 < N and S[cur + 1][0] == 0xFFFF and S[cur + 1][1] != last + 1:
    cur += 1
  else:
    while cur < N and ((S[cur][0] == 0xFFFF and (beginning or S[cur][1] == last + 1)) or S[cur][0] == 0x008E):
      if S[cur][0] == 0xFFFF:
        last = S[cur][1]
      cur += 1
      beginning = False
  return first, last - first, cur


def msg_text(lang, sid):
  m = LANG[lang][0].get(sid)
  if m is None:
    return None
  return ' / '.join(l if l is not None else '[CLR]' for l in m['lines'])


def item_name(lang, obj):
  return LANG[lang][1].get(obj, '#%d' % obj)


def dialogue_before(i, limit=24):
  """Walk back from i-1 to collect the dialogue blocks (0xFFFF runs) preceding instruction i."""
  blocks = []
  j = i - 1
  steps = 0
  while j >= 0 and steps < limit:
    op = S[j][0]
    if op == 0xFFFF:
      # find start of the contiguous 0xFFFF/0x008E run
      k = j
      while k - 1 >= 0 and S[k - 1][0] in (0xFFFF, 0x008E):
        k -= 1
      # split the run into message blocks exactly like the engine does
      q = k
      run = []
      while q <= j:
        if S[q][0] != 0xFFFF:
          q += 1
          continue
        first, span, end = msg_block_start(q)
        run.append((q, first, span))
        q = max(end, q + 1)
      blocks = run + blocks
      j = k - 1
      steps += 1
      if blocks:
        break
    elif op in (0x003B, 0x003C, 0x003D, 0x003E, 0x0005, 0x0009, 0x0014, 0x0016, 0x000F, 0x0047):
      j -= 1
      steps += 1
    else:
      break
  return blocks


def trace(start, limit=12):
  """Linear trace from start following unconditional jumps. Returns list of (idx, op, a, b, c)."""
  out = []
  j = start
  seen = set()
  while len(out) < limit and 0 <= j < N and j not in seen:
    seen.add(j)
    op, a, b, c = S[j]
    out.append((j, op, a, b, c))
    if op in (0x0000, 0x0001, 0x0002):
      break
    if op == 0x0003 and b == 0:
      j = a
      continue
    j += 1
  return out


def fmt(ins):
  j, op, a, b, c = ins
  return '%05d %04x %04x %04x %04x  %s' % (j, op, a, b, c, OPN.get(op, '?')[:40])


# Map script entries to the event objects / scenes that reference them (trigger or auto script).
refs = {}
for evi, ev in enumerate(p.events):
  # EVENTOBJECT: sVanishTime, x, y, sLayer, wTriggerScript, wAutoScript, sState, wTriggerMode, wSpriteNum, ...
  for fld, name in ((4, 'trig'), (5, 'auto')):
    if ev[fld]:
      refs.setdefault(ev[fld], []).append((evi + 1, name))

# Scene ranges: SCENE {wMapNum, wScriptOnEnter, wScriptOnTeleport, wEventObjectIndex}
scene_of_event = {}
for si in range(len(p.scenes) - 1):
  lo = p.scenes[si][3]
  hi = p.scenes[si + 1][3]
  for e in range(lo + 1, hi + 1):
    scene_of_event[e] = si + 1


results = []
for i in range(N):
  op = S[i][0]
  if op != 0x000A:
    continue
  yes = trace(i + 1, 12)
  no_target = S[i][1]
  cash = [x for x in yes if x[1] == 0x001E and s16(x[2]) < 0]
  items = [x for x in yes if x[1] == 0x001F]
  if not cash and not items:
    continue
  dlg = dialogue_before(i)
  # After the (last) item grant, check what follows.
  after = []
  shows_obtained = False
  if items:
    last = items[-1][0]
    after = trace(last + 1, 6)
    for x in after:
      if x[1] in (0xFFFF, 0x003E):
        shows_obtained = True
        break
      if x[1] in (0x0000, 0x0001, 0x0002):
        break
  rec = dict(
      confirm=i,
      no_target=no_target,
      cash=[(x[0], -s16(x[2]), x[3]) for x in cash],
      items=[(x[0], x[2], s16(x[3]) if x[3] else 1) for x in items],
      dialogue=[dict(entry=q, msg=first, span=span,
                     eng=msg_text('eng', first), chs=msg_text('chs', first), cht=msg_text('cht', first))
                for (q, first, span) in dlg],
      yes=[fmt(x) for x in yes],
      after=[fmt(x) for x in after],
      shows_obtained=shows_obtained,
  )
  results.append(rec)

# Find the owning script start (walk back to the nearest referenced entry) for context.
ref_keys = sorted(refs)
import bisect  # pylint: disable=g-import-not-at-top
for r in results:
  k = bisect.bisect_right(ref_keys, r['confirm']) - 1
  owner = ref_keys[k] if k >= 0 else None
  r['owner_entry'] = owner
  r['owner_events'] = [(e, t, scene_of_event.get(e)) for (e, t) in refs.get(owner, [])][:6]

if len(sys.argv) > 2:
  json.dump(results, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)

for r in results:
  print('=' * 100)
  items = ', '.join('%s x%d (%s/%s)' % (item_name('eng', o), q, item_name('chs', o), hex(o)) for (_, o, q) in r['items'])
  cash = ', '.join('%dG' % c for (_, c, _) in r['cash'])
  print('CONFIRM @%05d  no->%05d  cash: %s  items: %s  obtained-msg-after: %s  owner=%s %s' % (
      r['confirm'], r['no_target'], cash or '-', items or '-', r['shows_obtained'], r['owner_entry'], r['owner_events']))
  for d in r['dialogue']:
    print('   DLG @%05d msg %d span %d' % (d['entry'], d['msg'], d['span']))
    print('      EN : %s' % d['eng'])
    print('      CHS: %s' % d['chs'])
  for y in r['yes']:
    print('   YES ' + y)
  for y in r['after']:
    print('   AFT ' + y)
print('TOTAL', len(results))

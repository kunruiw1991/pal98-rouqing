#!/usr/bin/env python3
"""Minimal PAL (DOS/Win95) data parser for the pal98-eng-v3.6 vendor audit."""
import os
import re
import struct

DATA = os.environ.get('PAL_DATA', '.')


def mkf_chunks(path):
  b = open(path, 'rb').read()
  first = struct.unpack_from('<I', b, 0)[0]
  n = first // 4
  offs = [struct.unpack_from('<I', b, 4 * i)[0] for i in range(n)]
  out = []
  for i in range(n - 1):
    out.append(b[offs[i]:offs[i + 1]])
  return out


def words(b):
  return list(struct.unpack('<%dH' % (len(b) // 2), b[:len(b) // 2 * 2]))


class Pal(object):

  def __init__(self, data=DATA):
    self.sss = mkf_chunks(os.path.join(data, 'sss.mkf'))
    self.data = mkf_chunks(os.path.join(data, 'data.mkf'))
    sc = self.sss[4]
    self.scripts = [struct.unpack_from('<4H', sc, 8 * i) for i in range(len(sc) // 8)]
    ev = self.sss[0]
    self.events = [struct.unpack_from('<16H', ev, 32 * i) for i in range(len(ev) // 32)]
    scn = self.sss[1]
    self.scenes = [struct.unpack_from('<4H', scn, 8 * i) for i in range(len(scn) // 8)]
    ob = self.sss[2]
    # Win95 objects have 7 words, DOS objects 6 words.
    self.obj_words = 7 if len(ob) % 14 == 0 and len(ob) // 14 in (0x234, 0x236, 0x24E) else 6
    if len(ob) % 12 == 0 and len(ob) // 12 >= 0x234 and len(ob) % 14 != 0:
      self.obj_words = 6
    k = self.obj_words
    self.objects = [struct.unpack_from('<%dH' % k, ob, 2 * k * i) for i in range(len(ob) // (2 * k))]


def read_slf(path):
  """Returns (messages, words, descs).

  messages: dict sid -> dict(eid=..., lines=[str or None for CLEAR])
  words: dict index -> str
  descs: dict index -> str
  """
  txt = open(path, encoding='utf-8', errors='replace').read().replace('\r\n', '\n')
  msgs = {}
  wrds = {}
  descs = {}
  state = None
  cur = None
  sid = None
  for line in txt.split('\n'):
    if state is None:
      if not line or line.startswith('#'):
        continue
      m = re.match(r'\[BEGIN MESSAGE\]\s*(\d+)', line)
      if m:
        state = 'msg'
        sid = int(m.group(1))
        cur = []
        continue
      if line.startswith('[BEGIN WORDS]'):
        state = 'words'
        continue
      if line.startswith('[BEGIN DESCRIPTIONS]'):
        state = 'desc'
        continue
      if line.startswith('[BEGIN '):
        state = 'other'
        continue
    elif state == 'msg':
      m = re.match(r'\[END MESSAGE\]\s*(\d+)', line)
      if m:
        msgs[sid] = dict(eid=int(m.group(1)), lines=cur)
        state = None
        continue
      if line.startswith('[CLEAR MESSAGE]'):
        cur.append(None)
      else:
        cur.append(line)
    elif state == 'words':
      if line.startswith('[END WORDS]'):
        state = None
        continue
      if line.startswith('#') or '=' not in line:
        continue
      k, v = line.split('=', 1)
      try:
        wrds[int(k.strip())] = v
      except ValueError:
        pass
    elif state == 'desc':
      if line.startswith('[END DESCRIPTIONS]'):
        state = None
        continue
      if line.lstrip().startswith('#') or '=' not in line:
        continue
      k, v = line.split('=', 1)
      m = re.match(r'\s*([0-9a-fA-F]+)', k)
      if m:
        descs[int(m.group(1), 16)] = v
    elif state == 'other':
      if line.startswith('[END '):
        state = None
  return msgs, wrds, descs

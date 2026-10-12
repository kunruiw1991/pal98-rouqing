#!/usr/bin/env python3
"""Builds pal98_data.zip + chunks/manifest.json exactly like the live site.

Usage: build_chunks.py <data_dir> <out_dir> <version>

Members are sorted, deflated at level 9, dated 2026-10-12 12:00:00, mode 0644,
and the zip is split into 2,457,600-byte parts.
"""
import hashlib
import io
import json
import os
import sys
import zipfile

DATA, OUT, VERSION = sys.argv[1], sys.argv[2], sys.argv[3]
CHUNK = 2457600
NAMES = ['abc.mkf', 'ball.mkf', 'data.mkf', 'desc.dat', 'f.mkf', 'fbp.mkf', 'fire.mkf', 'gop.mkf', 'm.msg',
         'm_chs.slf', 'm_cht.slf', 'm_eng.slf', 'map.mkf', 'mgo.mkf', 'midi.mkf', 'mus.mkf', 'pat.mkf', 'rgm.mkf',
         'rng.mkf', 'sdlpal.cfg', 'sss.mkf', 'voc.mkf', 'wor16.asc', 'wor16.fon', 'word.dat']

buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
  for n in sorted(NAMES):
    zi = zipfile.ZipInfo(n, date_time=(2026, 10, 12, 12, 0, 0))
    zi.compress_type = zipfile.ZIP_DEFLATED
    zi.external_attr = 0o644 << 16
    zi.create_system = 3
    z.writestr(zi, open(os.path.join(DATA, n), 'rb').read(), compresslevel=9)
blob = buf.getvalue()

os.makedirs(os.path.join(OUT, 'chunks'), exist_ok=True)
open(os.path.join(OUT, 'pal98_data.zip'), 'wb').write(blob)
chunks = []
for i in range(0, len(blob), CHUNK):
  part = blob[i:i + CHUNK]
  idx = i // CHUNK
  fn = 'chunks/pal98_data.part%02d.bin' % idx
  open(os.path.join(OUT, fn), 'wb').write(part)
  chunks.append({'index': idx, 'file': fn, 'size': len(part), 'sha256': hashlib.sha256(part).hexdigest()})
manifest = {
    'version': VERSION,
    'total_size': len(blob),
    'sha256': hashlib.sha256(blob).hexdigest(),
    'chunk_count': len(chunks),
    'chunks': chunks,
}
# Keep the descriptive keys of the previous manifest (languages, engine), if given.
if len(sys.argv) > 4:
  base = json.load(open(sys.argv[4]))
  for k, v in base.items():
    if k not in manifest:
      manifest[k] = v
  if len(sys.argv) > 5:
    manifest['engine'] = sys.argv[5]
  if len(sys.argv) > 6:
    for lang in manifest.get('languages', []):
      if lang.get('id') == 'm_eng.slf':
        lang['label'] = sys.argv[6]
open(os.path.join(OUT, 'chunks', 'manifest.json'), 'w', encoding='utf-8').write(json.dumps(manifest, indent=2, ensure_ascii=False))
print(VERSION, len(blob), manifest['sha256'], len(chunks), 'chunks')

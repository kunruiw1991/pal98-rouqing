#!/usr/bin/env python3
"""pal98-eng-v3.6 .slf updates: street vendors state their prices up front.

Usage: patch_slf_v36.py <src_dir> <dst_dir>

* Yuhang fruit stall (msg 1967/1971), Suzhou sugar-ball seller (msg 3261) and the
  capital's sugar-ball seller (msg 6569) now say the price *before* the Yes/No
  prompt (it used to be told only after "Yes", or only when you were short).
* Words 625-628 (Obtained / Paid / Cost / Cash) label the engine's vendor card and
  "Obtained" popup.
"""
import os
import re
import sys

SRC, DST = sys.argv[1], sys.argv[2]

# sid -> (old block body, new block body), per language. Bodies use '\n'.
MSG = {
    'eng': {
        1967: ("Fruit Seller:\nCome! Here are today\\'s\nfresh fruits, just picked.\nWant a few?\n",
               "Fruit Seller:\nCome! Here are today\\'s\nfresh fruits, just picked.\nWant a few?\nOnly 25G a pound!\n"),
        1971: ("Li Xiaoyao:\nHow much per pound?\n",
               "Li Xiaoyao:\nI\\'ll take a pound!\n"),
        3261: ("Want to buy Sugar Ball?\n",
               "Sugar Ball, 20G each. Want one?\n"),
        6569: ("Seller:\nSweet candy... very cheap\uff5e\n",
               "Seller:\nSweet candy... very cheap\uff5e\nSugar Ball, only 30G each!\n"),
    },
    'chs': {
        1967: ("水果贩：\n来喔！这儿全都是今儿\n个刚摘下来的新鲜水果\n要不要来几个啊？\n",
               "水果贩：\n来喔！这儿全都是今儿\n个刚摘下来的新鲜水果\n要不要来几个啊？\n一斤只要２５文钱喔！\n"),
        1971: ("李逍遥：\n多少钱一斤？\n",
               "李逍遥：\n那就来一斤吧！\n"),
        3261: ("买糖葫芦吗？\n",
               "买糖葫芦吗？一串２０文钱\n"),
        6569: ("小贩：\n好吃的糖葫芦．．便宜卖喔∼\n",
               "小贩：\n好吃的糖葫芦．．便宜卖喔∼\n一串只要３０文钱！\n"),
    },
    'cht': {
        1967: ("水果販：\n來喔！這兒全都是今兒\n個剛摘下來的新鮮水果\n要不要來幾個啊？\n",
               "水果販：\n來喔！這兒全都是今兒\n個剛摘下來的新鮮水果\n要不要來幾個啊？\n一斤只要２５文錢喔！\n"),
        1971: ("李逍遙：\n多少錢一斤？\n",
               "李逍遙：\n那就來一斤吧！\n"),
        3261: ("買糖葫蘆嗎？\n",
               "買糖葫蘆嗎？一串２０文錢\n"),
        6569: ("小販：\n好吃的糖葫蘆．．便宜賣喔∼\n",
               "小販：\n好吃的糖葫蘆．．便宜賣喔∼\n一串只要３０文錢！\n"),
    },
}

WORDS = {
    'eng': ['625=Obtained', '626=Paid', '627=Cost', '628=Cash'],
    'chs': ['625=得到', '626=花费', '627=需付', '628=金钱'],
    'cht': ['625=得到', '626=花費', '627=需付', '628=金錢'],
}
LAST_WORD = {'eng': '624=Price\n', 'chs': '624=价格\n', 'cht': '624=價格\n'}

os.makedirs(DST, exist_ok=True)
for lang in ('eng', 'chs', 'cht'):
  name = 'm_%s.slf' % lang
  raw = open(os.path.join(SRC, name), 'rb').read()
  assert b'\r\n' not in raw, name
  s = raw.decode('utf-8')

  for sid, (old, new) in MSG[lang].items():
    pat = re.compile(r'(\[BEGIN MESSAGE\] %d\n)(.*?)(\[END MESSAGE\] \d+\n)' % sid, re.S)
    m = pat.search(s)
    assert m, (name, sid)
    assert m.group(2) == old, (name, sid, m.group(2))
    s = s[:m.start(2)] + new + s[m.end(2):]

  anchor = LAST_WORD[lang]
  assert s.count(anchor) == 1, (name, anchor)
  if '\n625=' not in s:
    s = s.replace(anchor, anchor + '\n'.join(WORDS[lang]) + '\n')

  open(os.path.join(DST, name), 'wb').write(s.encode('utf-8'))
  print(name, len(raw), '->', len(s.encode('utf-8')))

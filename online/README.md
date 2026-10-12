# Chinese Paladin 98 (仙剑奇侠传 98柔情篇) — Online WebAssembly Edition (English / 中文)

👉 **Play Live in Browser (macOS Safari / Chrome):** https://kunruiw1991.github.io/pal98-online/

- **Zero Unsigned Binary Installation:** Runs 100% inside the browser sandbox via Emscripten WebAssembly (`sdlpal.wasm` + `sdlpal.js`) with OPL2 RIX music and sound effects.
- **Multi-Part Chunked Streaming (`chunks/`):** Game data (~16.9 MB compressed) is split into **8 small parts (`Part 00` – `Part 07`, `<= 2.34 MB` each)**, fetched in parallel over HTTP, verified against the SHA-256 checksums in `chunks/manifest.json`, and persisted in browser `IndexedDB` so subsequent visits boot instantly (`0 MB` download).
- **3 Built-In Languages, chosen once on the start screen** (no mid-game restart button, so a misclick can never send you back to the title screen):
  - `🇬🇧 English (v3.6)` — default (`m_eng.slf`, fan translation v3.3 + v3.4–v3.6 fixes, ISO pixel font)
  - `🇨🇳 简体中文 (98柔情篇)` (`m_chs.slf`)
  - `🇭🇰 繁體中文 (DOS原版)` (`m_cht.slf`)
- **Saves:** in-game saves (`1.rpg` – `5.rpg`) persist to `IndexedDB` and can be exported/imported as `.zip` or `.rpg` from the toolbar. Imported saves are size-validated, out-of-range script pointers are repaired, and files not named `1.rpg`–`5.rpg` are assigned to a slot.

## v3.6 (`pal98-eng-v3.6`)

- **Street vendors show the price before you say Yes.** Street vendors are scripted events, not shop menus. This covers the Yuhang fruit stall, the Suzhou and capital sugar-ball (冰糖葫芦) sellers, the rice and wine sellers, and paid services such as prison visits, the beggar and the Maoshan Taoist.
  - Their Yes/No prompt now shows a card with:
    - the item and quantity, its price and effect (e.g. `Recover 22 HP and MP` / `HPMP+22`);
    - how many you already own, and your cash;
    - "No money" if you can't afford it.
  - Services show the cost and your cash.
  - No is still the default answer.
- **You see what you bought.** A scripted purchase used to add the item silently. Now a centered **"Obtained Sugar Ball ×1"** / **"得到 糖葫芦 ×1"** window shows the amount paid, the new owned count and the cash left.
  - The Yuhang fruit stall already had its own `Obtained "Fruit"` window. It now stays up long enough to read: keys are ignored for 0.5 s, and it lasts up to 3 s instead of 1.4 s.
- **The dialogue states the price too.** In EN/简体/繁體, the fruit seller says `Only 25G a pound!` / `一斤只要２５文钱喔！`. The sugar-ball sellers say `Sugar Ball, 20G each. Want one?` / `买糖葫芦吗？一串２０文钱` and `Sugar Ball, only 30G each!` / `一串只要３０文钱！`.
- **The inspector under the game** follows vendor events. Before buying it shows the price, description, owned count and cash. After buying it shows, e.g., `✓ Purchased Sugar Ball ×1 (−20 G) · Cash: 980 G · Owned: 3`.
- The 13 vendor prompts found by scanning all 42,309 `sss.mkf` script entries are listed in [`engine/README.md`](engine/README.md), along with the engine changes and the `PAL98.qa` test hooks.

## v3.5 (`pal98-eng-v3.5`)

- **Fullscreen fixed.** Fullscreen is now pure CSS on the game stage. SDL3 used to react to the browser's `fullscreenchange` by resizing its window to the whole screen while the canvas buffer stayed 640×400, which zoomed and cropped the picture and kept it broken after `Esc`. The canvas buffer is now locked to 640×400 and scaled with a strict 16:10 box.
- **Shops show what you are buying.** Press `Enter` on a shop item to open an info card: stat bonuses, **who can equip it**, owned count, cash, and a **quantity selector** (`◄ ►` ±1, `▲ ▼` ±10, `Enter` buys, `Esc` cancels). Items you can't afford still open the card, which says why you can't buy them.
- **Wearers in every description.** The Item (E) and Equip (W) menus list who can equip each item, e.g. `Def+4 [Xiaoyao]` / `防御+4【逍遥】`, using the equip flags and equip scripts in `sss.mkf`. The menus show 4 description lines (`81=1,0`). Stat numbers were checked against every equip script. CHS/CHT minus signs are now visible (`身法-5` used to render as `身法5`), and thrown seals list their power.
- **Shop & Equipment Inspector** below the game shows the highlighted item's stats, the wearers, and how each party member's STR/INT/DEF/AGI/LUK would change compared with what they wear now.
- **Pre-launch setup screen.** Pick the language, then press `▶ Start Game`. The language selector and "Reset Cache" were removed from the in-game toolbar.
- **Auto-save every 5 minutes + ⚡ Quick Save → Slot 5.** The engine runs its own `PAL_SaveGame` at the next safe point of the main loop: free exploration only, never inside a battle, menu, dialog or running script. The file is identical to a manual System → Save. Slot 5 is labelled `Auto 5` / `自动档` / `自動檔` in game. If Slot 5 held a manual save, it is backed up once as `5-backup-<time>.rpg`.

### Engine

`sdlpal.wasm` is SDLPal `v3.0.2025.0616` (the same tag, SDL3 commit and emsdk 4.0.7 as the official release build) plus a small patch set:

- `palweb.c`: `PAL_WebRequestSave`, `PAL_WebInfo`, the street vendor card / "Obtained" window (v3.6) and the `PAL_WebDebug` QA hooks
- the vendor hooks for script opcodes `0x000A` / `0x001E` / `0x001F` in `script.c` (v3.6)
- the shop purchase dialog in `uigame.c`
- an item-focus hook in `itemmenu.c`
- the safe-point save call in `game.c`
- a post-build `sdlpal.js` patch that keeps SDL3 out of CSS fullscreen and window resizes

## v3.4-patched data (`pal98-eng-v3.4-patched`)

- **`sss.mkf`:** all 98柔情篇 DOS community script fixes (外塞之雾 bug-fix patch v1.00–v2.00 + v3.0/v3.1) ported onto the 12,880-message English/Chinese message index space.
- **`m_eng.slf`:**
  - restores 2 skipped dialogs
  - translates the 183 remaining Chinese words
  - corrects the Opium / Confuse status descriptions
  - re-wraps the 128 dialog lines that were clipped at the right screen edge

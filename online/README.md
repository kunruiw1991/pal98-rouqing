# Chinese Paladin 98 (仙剑奇侠传 98柔情篇) — Online WebAssembly Edition (English / 中文)

👉 **Play Live in Browser (macOS Safari / Chrome):** https://kunruiw1991.github.io/pal98-online/

- **Zero Unsigned Binary Installation:** Runs 100% inside the browser sandbox via Emscripten WebAssembly (`sdlpal.wasm` + `sdlpal.js`) with OPL2 RIX music and sound effects.
- **Multi-Part Chunked Streaming (`chunks/`):** Game data (~16.9 MB compressed) is split into **8 small parts (`Part 00` – `Part 07`, `<= 2.34 MB` each)**, fetched in parallel over HTTP, verified against the SHA-256 checksums in `chunks/manifest.json`, and persisted in browser `IndexedDB` so subsequent visits boot instantly (`0 MB` download).
- **3 Built-In Languages, chosen once on the start screen** (no mid-game restart button, so a misclick can never send you back to the title screen):
  - `🇬🇧 English (v3.5)` — default (`m_eng.slf`, fan translation v3.3 + v3.4/v3.5 fixes, ISO pixel font)
  - `🇨🇳 简体中文 (98柔情篇)` (`m_chs.slf`)
  - `🇭🇰 繁體中文 (DOS原版)` (`m_cht.slf`)
- **Saves:** in-game saves (`1.rpg` – `5.rpg`) persist to `IndexedDB` and can be exported/imported as `.zip` or `.rpg` from the toolbar. Imported saves are size-validated, out-of-range script pointers are repaired, and files not named `1.rpg`–`5.rpg` are assigned to a slot.

## v3.5 (`pal98-eng-v3.5`)

- **Fullscreen fixed.** Fullscreen is now pure CSS on the game stage. SDL3 used to react to the browser's `fullscreenchange` by resizing its window to the whole screen while the canvas buffer stayed 640×400, which zoomed and cropped the picture and kept it broken after `Esc`. The canvas buffer is now locked to 640×400 and scaled with a strict 16:10 box.
- **Shops show what you are buying.** Press `Enter` on a shop item to open an info card: stat bonuses, **who can equip it**, owned count, cash, and a **quantity selector** (`◄ ►` ±1, `▲ ▼` ±10, `Enter` buys, `Esc` cancels). Items you can't afford still open the card, which says why you can't buy them.
- **Wearers in every description.** The Item (E) and Equip (W) menus list who can equip each item, e.g. `Def+4 [Xiaoyao]` / `防御+4【逍遥】`, using the equip flags and equip scripts in `sss.mkf`. The menus show 4 description lines (`81=1,0`). Stat numbers were checked against every equip script. CHS/CHT minus signs are now visible (`身法-5` used to render as `身法5`), and thrown seals list their power.
- **Shop & Equipment Inspector** below the game shows the highlighted item's stats, the wearers, and how each party member's STR/INT/DEF/AGI/LUK would change compared with what they wear now.
- **Pre-launch setup screen.** Pick the language, then press `▶ Start Game`. The language selector and "Reset Cache" were removed from the in-game toolbar.
- **Auto-save every 5 minutes + ⚡ Quick Save → Slot 5.** The engine runs its own `PAL_SaveGame` at the next safe point of the main loop: free exploration only, never inside a battle, menu, dialog or running script. The file is identical to a manual System → Save. Slot 5 is labelled `Auto 5` / `自动档` / `自動檔` in game. If Slot 5 held a manual save, it is backed up once as `5-backup-<time>.rpg`.

### Engine

`sdlpal.wasm` is SDLPal `v3.0.2025.0616` (the same tag, SDL3 commit and emsdk 4.0.7 as the official release build) plus a small patch set:

- `palweb.c`: `PAL_WebRequestSave` and `PAL_WebInfo`
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

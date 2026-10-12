# Chinese Paladin 98 (仙剑奇侠传 98柔情篇) — Online WebAssembly Edition (English / 中文)

👉 **Play Live in Browser (macOS Safari / Chrome):** https://kunruiw1991.github.io/pal98-online/

- **Zero Unsigned Binary Installation:** Runs 100% inside the browser sandbox via Emscripten WebAssembly (`sdlpal.wasm` + `sdlpal.js`) with OPL2 RIX music and sound effects.
- **Multi-Part Chunked Streaming (`chunks/`):** Game data (`16.94 MB` compressed / `27.65 MB` uncompressed) is split into **8 small parts (`Part 00` – `Part 07`, `<= 2.34 MB` each)**, fetched in parallel over HTTP, verified against the SHA-256 checksums in `chunks/manifest.json`, and persisted in browser `IndexedDB` so subsequent visits boot instantaneously (`0 MB` download).
- **3 Built-In Languages (Instant Switch in Top Toolbar):**
  - `🇬🇧 English (v3.4 Patched)` — Default (`m_eng.slf`, fan translation v3.3 + v3.4 fixes, ISO pixel font)
  - `🇨🇳 简体中文 (98柔情篇)` (`m_chs.slf`)
  - `🇭🇰 繁體中文 (DOS原版)` (`m_cht.slf`)
- **Save Game Backup & Restore:** In-game saves (`1.rpg` – `5.rpg`) automatically persist to `IndexedDB`, and can be exported/imported as `.zip` or `.rpg` files from the top toolbar. Imported saves are size-validated, out-of-range script pointers are repaired, and files not named `1.rpg`–`5.rpg` are assigned to a slot.

## v3.4-patched data (`pal98-eng-v3.4-patched`)

- **`sss.mkf`:** all 98柔情篇 DOS community script fixes (外塞之雾 bug-fix patch v1.00–v2.00 + v3.0/v3.1) ported onto the 12,880-message English/Chinese message index space: the 9PartWhip / Jade Paste / RottenMeat chests now give their items; the Sugar Ball vendor no longer charges you for answering "No"; 冰心诀 / 灵血咒 / 灵心符 cure Silence; 玄冥宝刀's Luck bonus sits on the weapon slot; the WineGod reuse bug is fixed; 21 off-map items are reachable; the 夜行衣 and 魅影神靴 chests exist; Nanzhao underground palace room C is reachable; the prefect bounty can be claimed; DogBlood has its icon; plus scene-transition and stray-NPC fixes.
- **`m_eng.slf`:** restores 2 dialogs that SDLPal silently skipped (a malformed `[END MESSAGE]` id), translates the 183 remaining Chinese words (enemy names, enemy and cooperative-attack spell names), corrects the Opium / Confuse status descriptions, and re-wraps the 128 dialog lines that were clipped at the right screen edge.
- Existing `.rpg` saves are preserved across the upgrade (event-object fixes apply to new games; script fixes apply immediately).

# Chinese Paladin 98 (仙剑奇侠传 98柔情篇) — Online WebAssembly Edition (English / 中文)

👉 **Play Live in Browser (macOS Safari / Chrome):** https://kunruiw1991.github.io/pal98-online/

- **Zero Unsigned Binary Installation:** Runs 100% inside the browser sandbox via Emscripten WebAssembly (`sdlpal.wasm` + `sdlpal.js`) with OPL2 RIX music and sound effects.
- **Multi-Part Chunked Streaming (`chunks/`):** Game data (`16.94 MB` compressed / `27.65 MB` uncompressed) is split into **8 small parts (`Part 00` – `Part 07`, `<= 2.34 MB` each)**, fetched in parallel over HTTP, and persisted in browser `IndexedDB` so subsequent visits boot instantaneously (`0 MB` download).
- **3 Built-In Languages (Instant Switch in Top Toolbar):**
  - `🇬🇧 English (v3.3 Complete)` — Default (`m_eng.slf`, complete fan translation v3.3 with ISO pixel font)
  - `🇨🇳 简体中文 (98柔情篇)` (`m_chs.slf`)
  - `🇭🇰 繁體中文 (DOS原版)` (`m_cht.slf`)
- **Save Game Backup & Restore:** In-game saves (`1.rpg` – `5.rpg`) automatically persist to `IndexedDB`, and can be exported/imported as `.zip` or `.rpg` files from the top toolbar.

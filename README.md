# 仙剑奇侠传 98柔情篇 · Chinese Paladin 98 (English & Original Online Edition)

👉 **Mac / Browser Online English Edition (Direct Play, No Binary Install):**
- **Live Web Player:** https://kunruiw1991.github.io/pal98-online/
- **Multi-Part Web Source in This Repo:** [`online/`](./online/) (`8 chunks × 2.34 MB` in `online/chunks/`, WebAssembly engine `sdlpal.wasm`, and `m_eng.slf` / `m_chs.slf` / `m_cht.slf` language packs)

---

## Features of the Online WebAssembly Edition (`online/`)
1. **No Unsigned macOS App ("三无产品") Required:** Runs 100% inside Chrome / Safari on macOS via WebAssembly + WebGL/Canvas + WebAudio OPL2 synthesis.
2. **Split into 8 Small Chunks (`<= 2.34 MB` each):**
   - `online/chunks/pal98_data.part00.bin` .. `part07.bin` + `online/chunks/manifest.json` (`16.94 MB` total compressed).
   - Automatically downloads in parallel on first load, reassembles in memory, extracts to browser `IndexedDB` (`/data`), and boots instantaneously on every subsequent visit.
3. **Instant Language Switcher:**
   - **English (`m_eng.slf`)** — Complete English localization v3.3 (UI, status/equip layout, items, spells, descriptions, and all 12,879 dialogue lines).
   - **简体中文 (`m_chs.slf`)** — 98柔情篇简体中文.
   - **繁體中文 (`m_cht.slf`)** — DOS原版繁體中文.
4. **Local Self-Hosting (Optional):**
   ```bash
   cd online && python3 -m http.server 8080
   # Open http://localhost:8080 in Safari or Chrome
   ```

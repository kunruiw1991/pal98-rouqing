# 仙剑奇侠传 98柔情篇 · Chinese Paladin 98 (`pal98-eng-v3.6` Online WebAssembly Edition)

🎮 **Play Directly in Browser (macOS Safari & Chrome, Zero Installation):**
- **Live Web Player (GitHub Pages):** [https://kunruiw1991.github.io/pal98-online/](https://kunruiw1991.github.io/pal98-online/)
- **Online WebAssembly Source & Chunks:** [`online/`](https://github.com/kunruiw1991/pal98-rouqing/tree/main/online) (also mirrored at [kunruiw1991/pal98-online](https://github.com/kunruiw1991/pal98-online))
- **Original Archive Directories:** [`Dos_98/`](https://github.com/kunruiw1991/pal98-rouqing/tree/main/Dos_98) · [`Win98/`](https://github.com/kunruiw1991/pal98-rouqing/tree/main/Win98) · [`Walkthrough/`](https://github.com/kunruiw1991/pal98-rouqing/tree/main/Walkthrough)

---

## ✨ Key Features of the Online WebAssembly Edition (`v3.6`)

1. **100% Browser Sandbox (No Unsigned macOS Binary Required)**
   - Runs natively in macOS Safari and Chrome via a custom-patched **SDLPal WebAssembly (`sdlpal.wasm`)** build (`SDLPal v3.0.2025.0616` + `SDL3` + `emsdk 4.0.7`, C patches in [`engine/`](./online/engine)) with OPL2 RIX music and sound effects.
   - Strict `640×400` (`16:10`) WebGL framebuffer lock for crisp fullscreen (`⛶ Fullscreen`) and clean `Esc` exit without viewport cropping.

2. **8-Part Chunked Streaming & Instant `IndexedDB` Cache (`chunks/`)**
   - Game data (`17.76 MB` compressed / `30.05 MB` uncompressed, 25 files) is split into **8 small byte-slice HTTP chunks (`chunks/pal98_data.part00.bin` – `part07.bin`, `≤ 2.34 MB` each)** verified against SHA-256 in [`chunks/manifest.json`](./online/chunks/manifest.json).
   - Streams in parallel on your first visit, unpacks into Emscripten's `IDBFS` (`/data/`), and boots from local `IndexedDB` cache (`0 MB` network download) on every subsequent visit.

3. **Pre-Launch Language Selection (English / 简体中文 / 繁體中文)**
   - Select your language once on the **Pre-Launch Setup Screen** before the opening animation begins:
     - **🇬🇧 English (`m_eng.slf`, v3.6 Patched)** — Complete English localization (`UseISOFont=1`), all 4,476 dialogue spans verified (`0` skipped spans, `0` clipped lines), and all 578 `[BEGIN WORDS]` entries (including all 153 enemy names, 21 enemy spell names, and 4 COOP skills) translated.
     - **🇨🇳 简体中文 (`m_chs.slf`, 98柔情篇)**
     - **🇭🇰 繁體中文 (`m_cht.slf`, DOS原版)**
   - No mid-game language/reset dropdown in the top bar that could accidentally restart the game.

4. **Automatic 5-Minute Auto-Save + 1-Click `⚡ Quick Save` (`Slot 5 / Auto 5`)**
   - Automatically saves to **Slot 5 (`/data/5.rpg`, `Auto 5` / `自动档`)** every **5 minutes**, whenever you switch tabs or minimize the window (`visibilitychange` / `pagehide`), or when you click **⚡ Quick Save (Slot 5)**.
   - Executes the C engine's own `PAL_SaveGame` at the top of `PAL_GameMain`'s frame loop (safely queuing if triggered during a battle, menu, or cutscene until you return to free roam) and flushes to `IndexedDB` in `< 20 ms`.
   - Use **💾 Export Saves** and **📂 Import `.rpg`** in the top toolbar anytime to back up or restore `.rpg` saves (`Slots 1–5`).

5. **Enhanced Shop Multi-Unit Selector, Equipment Stats & Street Vendor Cards**
   - **Shop Purchase Card (`PAL_BuyMenu`)**: Pressing `Enter` on any shop item opens an in-canvas card displaying full item description, stat bonuses, **wearable characters (`[Xiaoyao/Ling'er/Yueru/Ah Nu]`)**, unit price, and a **multi-unit quantity selector (`Qty < n >`, `◄/► ±1`, `▲/▼ ±10`)**.
   - **Equipment Stats & Wearers (`Item` `E` & `Equip` `W`)**: All 106 equipment items display their exact stat modifiers (`Atk`, `Mag`, `Def`, `Agi`, `Luk`) and wearable characters directly in-game across all 3 languages, paired with a live **Equipment & Shop Inspector Bar** below the canvas showing per-hero stat deltas (e.g., `Xiaoyao replaces Cape DEF 41→45 (+4)`).
   - **Street Vendor Info Cards & `"Obtained"` Popups (`v3.6`)**: Map-scripted street vendors (YuHang Fruit Stall `25G`, Suzhou Sugar Ball Vendor `20G`, Capital Sugar Ball Vendor `30G`, Baihe Sticky Rice Vendor `100G`, Capital Tavern Wine `100G`) state their price up front, show an in-canvas **Vendor Info Card (`Price`, `Effect`, `Have`, `Cash`)** before buying, and pop up a centered **`Obtained <Item> ×1 · Paid · Have · Cash`** confirmation window after buying.

6. **100% Original Numerical Fidelity + All 25 Community Script Bug-Fixes (`sss.mkf` & `data.mkf`)**
   - `data.mkf` (all 15 sub-chunks: 21 stores, 154 enemies, 380 enemy teams, 4 heroes, 104 spells, 65 battlefields, level-up spell tables, EXP curves) is **100% byte-identical** to `Dos_98`.
   - `sss.mkf` (`42,309` script entries) merges all 25 classic community gameplay bug-fixes from `Dos_98/SSS.MKF` (fixing the 3 empty chests, Sugar Ball `No` deduction bug, Silence cure on `CalmHeart`/`SpiritCure`/`CleanCharm`, `Dark Blade` Luck `+98` weapon slot, `WineGod` MP drain target, 21 hidden floor items, and Nanzhao Underground Palace Room C) with the 12,880-entry multilingual message table.

---

## ⌨️ Controls Reference

| Category | Key / Button | Action |
| :--- | :--- | :--- |
| **Field & Menus** | `Arrow Keys` | Move character / Navigate menus |
| | `Enter` / `Space` | Talk / Search / Confirm |
| | `Esc` / `~` (`` ` ``) | Open Main Menu / Cancel (iPad keyboard compatible) |
| | `E` / `W` / `F` / `S` | Use Item / Equip Item / Cast Spell / Character Status |
| | `PgUp` / `PgDn` | Page Up / Page Down in Spell & Item lists |
| **Battle** | `A` | Auto Normal Attack |
| | `F` | Auto Cast Strongest Spell |
| | `E` / `W` | Use Item / Throw Weapon |
| | `R` / `D` / `Q` | Repeat Last Action / Defend / Flee Battle |
| **Shop & Save** | `Enter` (in Shop) | Open Item Info & Quantity Selector Card |
| | `◄ ►` / `▲ ▼` (in Shop) | Adjust purchase quantity `±1` / `±10` |
| | `⚡ Quick Save` | Save immediately to `Slot 5 (Auto 5 / 自动档)` |

---

## 🛠️ Local Self-Hosting (Optional)

```bash
git clone https://github.com/kunruiw1991/pal98-online.git
cd pal98-online
python3 -m http.server 8080
# Open http://localhost:8080 in Safari or Chrome
```

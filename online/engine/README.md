# SDLPal engine build for pal98-eng-v3.6

The live site uses `sdlpal.wasm` / `sdlpal.js` built from the official SDLPal sources plus a small patch set:

- **Upstream:** [sdlpal/sdlpal](https://github.com/sdlpal/sdlpal) tag `v3.0.2025.0616`, commit `366bc366cb`. This is the same source as the official `sdlpal-emscripten.zip` release that the site used up to v3.4.
- **SDL3:** the `3rd/SDL` submodule, `sdlpal/SDL@cfd3fe1e3552e6aa0a497db0a1c3f3a09ad82d71`.
- **Toolchain:** emsdk `4.0.7`, the same version as upstream CI.

Built without the patches, this setup reproduces the official release wasm: same function count and identical function sizes. The only differences are build-path strings. Built with the v3.5 patch set, it reproduces the v3.5.2 `sdlpal.wasm` byte for byte, apart from the 3 bytes of the build directory name.

## Patches (`apply_patches.py`)

| File | Change |
|---|---|
| `palweb.c` (new) | `PAL_WebRequestSave(slot)` runs the engine's own `PAL_SaveGame()` at the next safe point of the main loop: free exploration only, never in a battle, menu, dialog or running script. Also has the read-only `PAL_WebInfo(what, a, b)` accessor (cash, party, stats, equipment effects, inventory, position, event objects), `PAL_WebNotifyItemFocus()`, the street vendor UI (v3.6, below) and the `PAL_WebDebug()` QA hooks. |
| `game.c` | Calls `PAL_WebProcessPendingSave()` at the top of the `PAL_GameMain` loop. |
| `uigame.c` | Shop: `Enter` opens an item card with the full description (stats + who can equip), price, owned count and cash, plus a quantity selector (`◄ ►` ±1, `▲ ▼` ±10). Items you can't afford show "No money" / "Bag full" instead of doing nothing. The buy menu also reports the highlighted item to the page. |
| `itemmenu.c` | Reports the highlighted inventory item to the page (Shop & Equipment Inspector). |
| `script.c` (v3.6) | Street vendors. Opcode `0x000A` (Yes/No) calls `PAL_WebVendorConfirm()`. `0x001E` (cash) reports to `PAL_WebOnScriptCash()`. `0x001F` (add item) reports to `PAL_WebOnScriptAddItem()`. |
| `text.c` (v3.6) | A centered message window that follows a scripted purchase (the Yuhang fruit stall's own `Obtained "Fruit"`) ignores keys for 0.5 s. It then stays up to 3 s instead of 1.4 s. |
| `emscripten/Makefile` | Exports `_PAL_WebRequestSave`, `_PAL_WebInfo` and `_PAL_WebDebug`. |
| `global.c` | `PAL_SaveGame_DOS` zeroes its buffer (`calloc`), so identical game states give byte-identical `.rpg` files. `rgwReserved2` used to be uninitialised memory. |

`patch_sdlpal_js.py` post-processes the generated `sdlpal.js`. SDL3 never registers its `fullscreenchange` or `resize` listeners, and the game canvas buffer stays 640×400. Fullscreen is CSS-only. This fixes the zoom/crop that persisted after `Esc`, caused by `SDL_UpdateFullscreenMode(commit=false)` resizing SDL's window to the screen size.

## Street vendors (v3.6)

Street vendors are event scripts, not shops (`0x0026`). Each one runs: dialog → `0x000A` Yes/No → `0x001E` cash −price (jumps to a "not enough money" line if short) → `0x001F` add item. Before v3.6:

- the Yes/No prompt never showed the price;
- `0x001E`/`0x001F` ran silently, so you only noticed the item by opening the Item menu.

A scan of all 42,309 `sss.mkf` script entries finds 13 such prompts:

| Prompt | Scene / event / entry | Cost | Item |
|---|---|---|---|
| Yuhang fruit stall | 5 / 129 / 8157 | 25 | Fruit |
| Suzhou sugar-ball seller | 23 / 438 / 11976 | 20 | Sugar Ball |
| Capital sugar-ball seller | 111 / 2161 / 21587 | 30 | Sugar Ball |
| Rice seller | 50 / 846, 847 / 15424 | 100 | Rice |
| Tavern (wine) | 127 / 2300 / 20629 | 100 | Wine |
| Poor girl | 30 / 541 | 100 | – |
| Gambler | 29 / 537 | 50 | – |
| Prison visit | 93 / 1817 | 100 | – |
| Prison visit | 91 / 1758 | 300 | – |
| Brothel | 131 / 2368 | 2000 | – |
| Beggar | 100 / 1900 | 10 | – |
| Beggar (news) | 100 / 1901 | 100 | – |
| Maoshan Taoist | 108 / 2078 | 15000 | – |

One more scripted purchase has no prompt: the Silver Pin, scene 23, −400 at entry 10758, item at entry 10785.

What the engine now does:

- **`PAL_WebVendorConfirm()` (before buying).**
  - It scans the Yes branch of the prompt: up to 12 instructions, following plain jumps and stopping at any script end, call, battle, shop, scene change or nested prompt.
  - If that branch spends money, a card replaces the Yes/No boxes.
    - With an item: name ×qty, price, the effect lines (packed from the end of the description to fit), owned count and cash.
    - Services show the cost and cash instead.
  - "No money" appears when you can't afford it. **No** / **Yes** sit on the card, and No is the default, as before.
  - The card goes on the opposite side of the dialog, so the question stays readable.
  - A cash check (`-X` immediately followed by `+X`) is not treated as a cost.
- **`PAL_WebOnScriptCash()` / `PAL_WebOnScriptAddItem()` (after buying).**
  - A `0x001F` counts as a purchase when it comes after a scripted payment with no script end in between.
  - If the script doesn't open its own `0x003E` "Obtained …" window within the next 6 instructions, the engine shows a centered **"Obtained <item> ×n"** window: amount paid, new owned count and cash left.
  - Keys are ignored for the first 0.5 s. The window closes on a key press or after 3.5 s.
- `Module.onPalVendor(kind, item, qty, amount, extra)` drives the page's inspector: 1 = card shown, 2 = bought, 3 = answered No, 4 = service paid, 5 = not enough money.

The `.slf` files also state the price before the prompt: msg 1967/1971 (fruit), 3261 and 6569 (sugar balls). They add words 625–628: Obtained / Paid / Cost / Cash.

## QA hooks

`PAL_WebDebug(what, a, b, c, d)`, exposed by the page as `PAL98.qa`:

| `what` | Page helper | Effect |
|---|---|---|
| 1 | `PAL98.qa.warp(scene, x, y, dir)` | At the next free-roam frame, moves the party leader to map pixel (x, y) of `scene`, facing `dir` (0 S, 1 W, 2 N, 3 E). Same as script opcodes `0x0046` + `0x0059`. |
| 2 | `PAL98.qa.cash(n)` | Sets the cash. |
| 3 | `PAL98.qa.addItem(item, n)` | Adds n of the item (negative n removes). |
| 4 | `PAL98.qa.setEventScript(event, entry)` | Points an event object's trigger script at another script entry. For example, entry 10758 is the Silver Pin purchase. |

To stand in front of an event at (ex, ey), warp to (ex+16, ey−8) facing south (0) and press Enter. Examples:

- Yuhang fruit stall: `PAL98.qa.warp(5, 528, 1400, 0)`
- Suzhou sugar ball: `PAL98.qa.warp(23, 976, 936, 0)`

## Build

```sh
git clone https://github.com/sdlpal/sdlpal && cd sdlpal && git checkout 366bc366cb
git submodule update --init 3rd/SDL scripts   # (.gitmodules uses ../ URLs -> https://github.com/sdlpal/...)
emsdk install 4.0.7 && emsdk activate 4.0.7 && source emsdk_env.sh
emcmake cmake -DSDL_SHARED=OFF -DSDL_STATIC=ON -DSDL_TEST_LIBRARY=OFF \
  -DCMAKE_INSTALL_PREFIX=$PWD/install_prefix -S 3rd/SDL -B sdl_build && make -C sdl_build install
python3 /path/to/engine/apply_patches.py .            # copies palweb.c next to this script
echo '#define PAL_GIT_REVISION "v3.0.2025.0616-pal98-v3.6"' > generated.h
PKG_CONFIG_PATH=$PWD/install_prefix/lib/pkgconfig make -C emscripten GENERATED=-DPAL_HAS_GIT_REVISION
python3 /path/to/engine/patch_sdlpal_js.py emscripten/sdlpal.js sdlpal.js
```

SDLPal is free software under the GNU GPL v3; these patches are under the same license.

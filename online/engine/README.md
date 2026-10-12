# SDLPal engine build for pal98-eng-v3.5

The live site uses `sdlpal.wasm` / `sdlpal.js` built from the official SDLPal sources plus a small patch set:

- **Upstream:** [sdlpal/sdlpal](https://github.com/sdlpal/sdlpal) tag `v3.0.2025.0616`, commit `366bc366cb`. This is the same source as the official `sdlpal-emscripten.zip` release that the site used up to v3.4.
- **SDL3:** the `3rd/SDL` submodule, `sdlpal/SDL@cfd3fe1e3552e6aa0a497db0a1c3f3a09ad82d71`.
- **Toolchain:** emsdk `4.0.7`, the same version as upstream CI.

Built without the patches, this setup reproduces the official release wasm: same function count and identical function sizes. The only differences are build-path strings.

## Patches (`apply_patches.py`)

| File | Change |
|---|---|
| `palweb.c` (new) | `PAL_WebRequestSave(slot)` runs the engine's own `PAL_SaveGame()` at the next safe point of the main loop: free exploration only, never in a battle, menu, dialog or running script. Also adds the read-only `PAL_WebInfo(what, a, b)` accessor (cash, party, stats, equipment effects, inventory) and `PAL_WebNotifyItemFocus()`. |
| `game.c` | Calls `PAL_WebProcessPendingSave()` at the top of the `PAL_GameMain` loop. |
| `uigame.c` | Shop: `Enter` opens an item card with the full description (stats + who can equip), price, owned count and cash, plus a quantity selector (`◄ ►` ±1, `▲ ▼` ±10). Items you can't afford show "No money" / "Bag full" instead of doing nothing. The buy menu also reports the highlighted item to the page. |
| `itemmenu.c` | Reports the highlighted inventory item to the page (Shop & Equipment Inspector). |
| `emscripten/Makefile` | Exports `_PAL_WebRequestSave` and `_PAL_WebInfo`. |

`patch_sdlpal_js.py` post-processes the generated `sdlpal.js`. SDL3 never registers its `fullscreenchange` or `resize` listeners, and the game canvas buffer stays 640×400. Fullscreen is CSS-only. This fixes the zoom/crop that persisted after `Esc`, caused by `SDL_UpdateFullscreenMode(commit=false)` resizing SDL's window to the screen size.

## Build

```sh
git clone https://github.com/sdlpal/sdlpal && cd sdlpal && git checkout 366bc366cb
git submodule update --init 3rd/SDL scripts   # (.gitmodules uses ../ URLs -> https://github.com/sdlpal/...)
emsdk install 4.0.7 && emsdk activate 4.0.7 && source emsdk_env.sh
emcmake cmake -DSDL_SHARED=OFF -DSDL_STATIC=ON -DSDL_TEST_LIBRARY=OFF \
  -DCMAKE_INSTALL_PREFIX=$PWD/install_prefix -S 3rd/SDL -B sdl_build && make -C sdl_build install
python3 /path/to/engine/apply_patches.py .            # copies palweb.c next to this script
echo '#define PAL_GIT_REVISION "v3.0.2025.0616-pal98-v3.5"' > generated.h
PKG_CONFIG_PATH=$PWD/install_prefix/lib/pkgconfig make -C emscripten GENERATED=-DPAL_HAS_GIT_REVISION
python3 /path/to/engine/patch_sdlpal_js.py emscripten/sdlpal.js sdlpal.js
```

SDLPal is free software under the GNU GPL v3; these patches are under the same license.

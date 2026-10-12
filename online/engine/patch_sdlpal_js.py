#!/usr/bin/env python3
"""Post-build patch for emscripten's sdlpal.js (pal98-eng-v3.5).

Fullscreen fix: the page implements fullscreen purely with CSS on #canvasWrap.
SDL3 must never learn about it, otherwise Emscripten_HandleFullscreenChange ->
SDL_UpdateFullscreenMode(commit=false) resizes SDL's window to screen.width x
screen.height while the canvas drawing buffer stays 640x400 (GL viewport crop),
and the windowed size is never restored after Esc.

Usage: patch_sdlpal_js.py <in sdlpal.js> <out sdlpal.js>
"""
import sys

src = open(sys.argv[1], encoding='utf-8').read()


def rep(old, new):
  global src
  n = src.count(old)
  if n != 1:
    raise SystemExit('anchor count %d for: %s' % (n, old[:120]))
  src = src.replace(old, new)


# 1. Never register SDL3's document 'fullscreenchange' listener.
rep("var _emscripten_set_fullscreenchange_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => {\n",
    "var _emscripten_set_fullscreenchange_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => {\n"
    "      // pal98-eng-v3.5: fullscreen is CSS-only (#canvasWrap); keep SDL unaware of it.\n"
    "      if (Module['pal98CssFullscreen'] !== false) return 0;\n")

# 2. Never register SDL3's window 'resize' listener (the 640x400 buffer is scaled by CSS).
rep("var _emscripten_set_resize_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>\n"
    "      registerUiEventCallback(target, userData, useCapture, callbackfunc, 10, \"resize\", targetThread);\n",
    "var _emscripten_set_resize_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>\n"
    "      // pal98-eng-v3.5: window resizes are handled by CSS only.\n"
    "      (Module['pal98CssFullscreen'] !== false) ? 0 :\n"
    "      registerUiEventCallback(target, userData, useCapture, callbackfunc, 10, \"resize\", targetThread);\n")

# 3. Lock the game canvas drawing buffer (default 640x400).
rep("var _emscripten_set_canvas_element_size = (target, width, height) => {\n"
    "      var canvas = findCanvasEventTarget(target);\n"
    "      if (!canvas) return -4;\n",
    "var _emscripten_set_canvas_element_size = (target, width, height) => {\n"
    "      var canvas = findCanvasEventTarget(target);\n"
    "      if (!canvas) return -4;\n"
    "      // pal98-eng-v3.5: keep the game canvas buffer at its native size.\n"
    "      var lock = Module['pal98CanvasLock'];\n"
    "      if (lock && canvas === Module['canvas']) { width = lock[0]; height = lock[1]; }\n")

open(sys.argv[2], 'w', encoding='utf-8').write(src)
print('sdlpal.js patched:', len(src), 'bytes')

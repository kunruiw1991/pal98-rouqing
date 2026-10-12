(function () {
  var DATA_VERSION = 'pal98-eng-v3.4-patched';
  var DEFAULT_LANG = 'm_eng.slf';
  var currentLang = localStorage.getItem('pal98_lang') || DEFAULT_LANG;
  var gameRunning = false;

  // SAVEDGAME_DOS layout (sdlpal global.c): fixed part = 12864 bytes, then EVENTOBJECT[n] (32 bytes each).
  var RPG_MIN_SIZE = 12864;

  // Track all WebAudio contexts so we can resume them on first user click/keydown on macOS
  var trackedAudioContexts = [];
  var OrigAudioContext = window.AudioContext || window.webkitAudioContext;
  if (OrigAudioContext) {
    var PatchedAudioContext = function () {
      var ctx = new OrigAudioContext();
      trackedAudioContexts.push(ctx);
      return ctx;
    };
    PatchedAudioContext.prototype = OrigAudioContext.prototype;
    window.AudioContext = PatchedAudioContext;
    if (window.webkitAudioContext) window.webkitAudioContext = PatchedAudioContext;
  }

  function unlockAudio() {
    var resumedAny = false;
    trackedAudioContexts.forEach(function (ctx) {
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(function () {});
        resumedAny = true;
      }
    });
    if (window.Module && Module.SDL2 && Module.SDL2.audioContext) {
      if (Module.SDL2.audioContext.state === 'suspended') {
        Module.SDL2.audioContext.resume().catch(function () {});
        resumedAny = true;
      }
    }
    var banner = document.getElementById('audioUnlockBanner');
    if (banner && (resumedAny || trackedAudioContexts.some(function (c) { return c.state === 'running'; }))) {
      banner.style.display = 'none';
    }
  }

  ['pointerdown', 'keydown', 'click', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, unlockAudio, { passive: true });
  });

  var statusTextEl = document.getElementById('statusText');
  var byteStatsEl = document.getElementById('byteStats');
  var progressFillEl = document.getElementById('progressFill');
  var loaderPanelEl = document.getElementById('loaderPanel');
  var langSelectEl = document.getElementById('langSelect');

  // Persist /data to IndexedDB unless a sync is already in flight (either a manual
  // FS.syncfs() or the IDBFS autoPersist queue), avoiding overlapping syncs.
  function syncDataIfIdle(cb) {
    var done = function () { if (cb) cb(); };
    if (typeof FS === 'undefined') { done(); return; }
    try {
      var busy = (FS.syncFSRequests || 0) > 0;
      try {
        var mnt = FS.lookupPath('/data').node.mount;
        if (mnt && mnt.idbPersistState) busy = true;
      } catch (e) {}
      if (busy) { done(); return; }
      FS.syncfs(false, function () { done(); });
    } catch (e) {
      done();
    }
  }

  if (langSelectEl) {
    langSelectEl.value = currentLang;
    langSelectEl.addEventListener('change', function () {
      var newLang = langSelectEl.value;
      if (gameRunning && !confirm('Switching language will reload the game. Any unsaved progress since your last in-game save will be lost. Continue?')) {
        langSelectEl.value = currentLang;
        return;
      }
      localStorage.setItem('pal98_lang', newLang);
      currentLang = newLang;
      if (typeof FS !== 'undefined') {
        try {
          writeSdlPalConfig(newLang);
          setStatus('Switching language to ' + newLang + '...');
          FS.syncfs(false, function () {
            window.location.reload();
          });
        } catch (e) {
          window.location.reload();
        }
      } else {
        window.location.reload();
      }
    });
  }

  function setStatus(msg) {
    if (statusTextEl) statusTextEl.textContent = msg;
  }

  function setProgress(pct, statsText) {
    if (progressFillEl) progressFillEl.style.width = Math.max(2, Math.min(100, pct)).toFixed(1) + '%';
    if (statsText && byteStatsEl) byteStatsEl.textContent = statsText;
  }

  function writeSdlPalConfig(langFile) {
    var cfg = [
      'KeepAspectRatio=1',
      'FullScreen=0',
      'LaunchSetting=0',
      'Stereo=1',
      'UseSurroundOPL=1',
      'EnableKeyRepeat=1',
      'UseTouchOverlay=0',
      'EnableAviPlay=0',
      'EnableGLSL=0',
      'EnableHDR=0',
      'TextureHeight=400',
      'TextureWidth=640',
      'ScaleQuality=0',
      'SurroundOPLOffset=384',
      'LogLevel=3',
      'AudioBufferSize=1024',
      'OPLSampleRate=49716',
      'ResampleQuality=4',
      'SampleRate=44100',
      'MusicVolume=80',
      'SoundVolume=80',
      'WindowHeight=400',
      'WindowWidth=640',
      'CD=OGG',
      'Music=RIX',
      'OPLCore=DBFLT',
      'OPLChip=OPL2',
      'MessageFileName=' + (langFile || DEFAULT_LANG),
      'GamePath=/data/',
      'SavePath=/data/',
      ''
    ].join('\n');
    FS.writeFile('/data/sdlpal.cfg', cfg, { encoding: 'utf8' });
  }

  function hasValidCachedData() {
    try {
      var fbpStat = FS.stat('/data/fbp.mkf');
      var engStat = FS.stat('/data/m_eng.slf');
      var ver = FS.readFile('/data/.pal98_version', { encoding: 'utf8' }).trim();
      return fbpStat && fbpStat.size > 100000 && engStat && engStat.size > 100000 && ver === DATA_VERSION;
    } catch (e) {
      return false;
    }
  }

  async function downloadAndUnpackChunks() {
    setStatus('Fetching multi-part manifest...');
    var manResp = await fetch('chunks/manifest.json', { cache: 'no-cache' });
    if (!manResp.ok) throw new Error('Failed to load chunks/manifest.json (' + manResp.status + ')');
    var manifest = await manResp.json();
    var totalBytes = manifest.total_size;
    var chunkBytesLoaded = new Array(manifest.chunks.length).fill(0);
    // Cache-bust chunk URLs per data version so browsers never mix old and new parts.
    var bust = '?v=' + encodeURIComponent(manifest.version || DATA_VERSION);

    function updateOverallProgress() {
      var loaded = chunkBytesLoaded.reduce(function (a, b) { return a + b; }, 0);
      var pct = (loaded / totalBytes) * 85;
      var mbLoaded = (loaded / 1048576).toFixed(2);
      var mbTotal = (totalBytes / 1048576).toFixed(2);
      setProgress(pct, mbLoaded + ' / ' + mbTotal + ' MB (' + manifest.chunks.length + ' parts)');
    }

    setStatus('Downloading ' + manifest.chunks.length + ' game data chunks in parallel...');

    async function sha256Hex(bytes) {
      if (!(window.crypto && crypto.subtle && crypto.subtle.digest)) return null;
      var digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.prototype.map.call(new Uint8Array(digest), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    }

    async function fetchChunkBytes(chunkMeta, fetchOpts) {
      var idx = chunkMeta.index;
      var resp = await fetch(chunkMeta.file + bust, fetchOpts);
      if (!resp.ok) throw new Error('Failed to fetch ' + chunkMeta.file);
      if (resp.body && resp.body.getReader) {
        var reader = resp.body.getReader();
        var parts = [];
        var received = 0;
        while (true) {
          var step = await reader.read();
          if (step.done) break;
          parts.push(step.value);
          received += step.value.byteLength;
          chunkBytesLoaded[idx] = received;
          updateOverallProgress();
        }
        var out = new Uint8Array(received);
        var pos = 0;
        for (var i = 0; i < parts.length; i++) {
          out.set(parts[i], pos);
          pos += parts[i].byteLength;
        }
        return out;
      }
      var ab = await resp.arrayBuffer();
      chunkBytesLoaded[idx] = ab.byteLength;
      updateOverallProgress();
      return new Uint8Array(ab);
    }

    var chunkBuffers = await Promise.all(manifest.chunks.map(async function (chunkMeta) {
      var idx = chunkMeta.index;
      var chip = document.getElementById('chip-' + idx);
      if (chip) {
        chip.className = 'chunk-chip loading';
        chip.textContent = 'Part 0' + idx + ' ⬇';
      }
      var bytes = await fetchChunkBytes(chunkMeta, undefined);
      // Integrity check against the manifest; retry once bypassing any stale HTTP cache.
      if (chunkMeta.sha256) {
        var digest = await sha256Hex(bytes);
        if (digest !== null && (digest !== chunkMeta.sha256 || bytes.byteLength !== chunkMeta.size)) {
          bytes = await fetchChunkBytes(chunkMeta, { cache: 'reload' });
          digest = await sha256Hex(bytes);
          if (digest !== null && digest !== chunkMeta.sha256) {
            throw new Error('Checksum mismatch for ' + chunkMeta.file + ' (please retry / Reset Cache)');
          }
        }
      }
      if (chip) {
        chip.className = 'chunk-chip done';
        chip.textContent = 'Part 0' + idx + ' ✓';
      }
      return bytes;
    }));

    setStatus('Reassembling ' + chunkBuffers.length + ' chunks & unpacking into WebAssembly filesystem...');
    setProgress(88, 'Unpacking game files...');

    var merged = new Uint8Array(totalBytes);
    var offset = 0;
    for (var i = 0; i < chunkBuffers.length; i++) {
      merged.set(chunkBuffers[i], offset);
      offset += chunkBuffers[i].byteLength;
    }

    var zip = await JSZip.loadAsync(merged);
    var entries = [];
    zip.forEach(function (relPath, entry) {
      if (!entry.dir && !relPath.includes('._')) {
        entries.push({ path: relPath.toLowerCase(), entry: entry });
      }
    });

    // Only game data files are overwritten; existing /data/*.rpg saves are preserved.
    for (var j = 0; j < entries.length; j++) {
      var item = entries[j];
      var arr = await item.entry.async('uint8array');
      FS.writeFile('/data/' + item.path, arr, { encoding: 'binary' });
      var unpackPct = 88 + ((j + 1) / entries.length) * 10;
      setProgress(unpackPct, 'Extracted ' + (j + 1) + '/' + entries.length + ': ' + item.path);
    }

    writeSdlPalConfig(currentLang);
    FS.writeFile('/data/.pal98_version', DATA_VERSION, { encoding: 'utf8' });

    setStatus('Syncing to browser IndexedDB cache...');
    await new Promise(function (resolve) {
      FS.syncfs(false, function () { resolve(); });
    });
    setProgress(100, 'Ready · Cached in IndexedDB');
  }

  function startSdlPalEngine() {
    if (gameRunning) return;
    gameRunning = true;
    setStatus('Running (' + (currentLang === 'm_eng.slf' ? 'English v3.4' : currentLang) + ') — Use Arrow Keys, Enter/Space & Esc');
    setTimeout(function () {
      if (loaderPanelEl) loaderPanelEl.style.display = 'none';
    }, 900);
    var canvas = document.getElementById('canvas');
    if (canvas) canvas.focus();
    var mainFunc = Module.cwrap('EMSCRIPTEN_main', 'number', ['number', 'number'], { async: true });
    mainFunc(0, 0);
  }

  window.Module = {
    preRun: [],
    postRun: [],
    print: function (text) {
      console.log('[SDLPal]', text);
    },
    printErr: function (text) {
      console.warn('[SDLPal]', text);
    },
    canvas: (function () {
      var canvas = document.getElementById('canvas');
      canvas.addEventListener('webglcontextlost', function (e) {
        e.preventDefault();
        window.location.reload();
      }, false);
      canvas.addEventListener('click', function () {
        canvas.focus();
        unlockAudio();
      });
      return canvas;
    })(),
    setStatus: function (text) {
      if (text) setStatus(text);
    },
    totalDependencies: 0,
    monitorRunDependencies: function (left) {
      this.totalDependencies = Math.max(this.totalDependencies, left);
    },
    onRuntimeInitialized: function () {
      try {
        FS.mkdir('/data');
      } catch (e) {}
      FS.mount(IDBFS, { autoPersist: true }, '/data');
      setStatus('Checking browser IndexedDB cache...');
      FS.syncfs(true, async function () {
        try {
          if (hasValidCachedData()) {
            writeSdlPalConfig(currentLang);
            for (var i = 0; i < 8; i++) {
              var chip = document.getElementById('chip-' + i);
              if (chip) {
                chip.className = 'chunk-chip done';
                chip.textContent = 'Part 0' + i + ' ✓';
              }
            }
            setProgress(100, 'Cached in IndexedDB (0 MB download)');
            FS.syncfs(false, function () {
              startSdlPalEngine();
            });
          } else {
            await downloadAndUnpackChunks();
            startSdlPalEngine();
          }
        } catch (err) {
          console.error('Failed to initialize PAL98 data:', err);
          setStatus('Error loading chunks: ' + err.message);
        }
      });
    }
  };

  // Periodically sync IDBFS every 6 seconds so in-game saves (.rpg) are always persisted
  setInterval(function () {
    if (gameRunning) syncDataIfIdle();
  }, 6000);

  // Flush pending writes when the tab is hidden / closed (mobile app switch, tab close).
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && gameRunning) syncDataIfIdle();
  });
  window.addEventListener('pagehide', function () {
    if (gameRunning) syncDataIfIdle();
  });

  // Toolbar Actions
  var btnFullscreen = document.getElementById('btnFullscreen');
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', function () {
      var wrap = document.getElementById('canvasWrap') || document.getElementById('canvas');
      if (!document.fullscreenElement) {
        if (wrap.requestFullscreen) wrap.requestFullscreen();
        else if (wrap.webkitRequestFullscreen) wrap.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    });
  }

  var btnExportSave = document.getElementById('btnExportSave');
  if (btnExportSave) {
    btnExportSave.addEventListener('click', function () {
      if (typeof FS === 'undefined') return;
      var zip = new JSZip();
      var count = 0;
      var contents = FS.lookupPath('/data').node.contents;
      Object.keys(contents).forEach(function (name) {
        if (name.toLowerCase().endsWith('.rpg')) {
          zip.file(name.toLowerCase(), FS.readFile('/data/' + name));
          count++;
        }
      });
      if (count === 0) {
        alert('No saved games (.rpg) found yet! Save inside the game via System -> Save Game first.');
        return;
      }
      zip.generateAsync({ type: 'blob' }).then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'pal98-saves.zip';
        a.click();
      });
    });
  }

  // Number of event-script entries in the loaded sss.mkf (MKF chunk #4, 8 bytes per entry).
  function getScriptEntryCount() {
    try {
      var sss = FS.readFile('/data/sss.mkf');
      var dv = new DataView(sss.buffer, sss.byteOffset, sss.byteLength);
      var off4 = dv.getUint32(4 * 4, true);
      var off5 = dv.getUint32(5 * 4, true);
      return Math.floor((off5 - off4) / 8);
    } catch (e) {
      return 0;
    }
  }

  // Validate a DOS-format .rpg and zero any script pointer that is outside the loaded
  // script table (e.g. saves made with a different sss.mkf). Returns {ok, bytes, fixed, reason}.
  function sanitizeRpg(bytes) {
    if (!bytes || bytes.length < RPG_MIN_SIZE) {
      return { ok: false, reason: 'file is ' + (bytes ? bytes.length : 0) + ' bytes (a valid save is at least ' + RPG_MIN_SIZE + ' bytes)' };
    }
    if ((bytes.length - RPG_MIN_SIZE) % 32 !== 0) {
      return { ok: false, reason: 'unexpected size ' + bytes.length + ' bytes (not a DOS-format PAL save)' };
    }
    var out = new Uint8Array(bytes.length);
    out.set(bytes);
    var nScript = getScriptEntryCount();
    var fixed = 0;
    if (nScript > 0) {
      var dv = new DataView(out.buffer);
      var fix = function (off) {
        if (dv.getUint16(off, true) >= nScript) {
          dv.setUint16(off, 0, true);
          fixed++;
        }
      };
      var i;
      // Poison scripts: POISONSTATUS[16][5] {wPoisonID, wPoisonScript} at 1408.
      for (i = 0; i < 16 * 5; i++) fix(1408 + i * 4 + 2);
      // Scene enter/teleport scripts: SCENE[300] {wMapNum, wScriptOnEnter, wScriptOnTeleport, wEventObjectIndex} at 3264.
      for (i = 0; i < 300; i++) { fix(3264 + i * 8 + 2); fix(3264 + i * 8 + 4); }
      // Object scripts: OBJECT_DOS[600] (6 words) at 5664, script words 2..4.
      for (i = 0; i < 600; i++) { fix(5664 + i * 12 + 4); fix(5664 + i * 12 + 6); fix(5664 + i * 12 + 8); }
      // Event objects: EVENTOBJECT[n] at 12864, wTriggerScript @+8, wAutoScript @+10.
      var nEvt = (out.length - RPG_MIN_SIZE) / 32;
      for (i = 0; i < nEvt; i++) { fix(RPG_MIN_SIZE + i * 32 + 8); fix(RPG_MIN_SIZE + i * 32 + 10); }
    }
    return { ok: true, bytes: out, fixed: fixed };
  }

  function slotTaken(slot) {
    try { FS.stat('/data/' + slot + '.rpg'); return true; } catch (e) { return false; }
  }

  // Map an imported file name to a 1..5 save slot (the in-game Load menu only shows 1.rpg..5.rpg).
  function chooseSlot(fileName) {
    var m = /^([1-5])\.rpg$/i.exec(fileName);
    if (m) return parseInt(m[1], 10);
    var def = 1;
    for (var s = 1; s <= 5; s++) { if (!slotTaken(s)) { def = s; break; } }
    var ans = prompt('"' + fileName + '" is not named 1.rpg-5.rpg, so the in-game Load menu would not show it.\n' +
                     'Import it into which save slot (1-5)? Any existing save in that slot will be overwritten.', String(def));
    if (ans === null) return 0;
    var n = parseInt(ans, 10);
    return (n >= 1 && n <= 5) ? n : 0;
  }

  var inputImportSave = document.getElementById('inputImportSave');
  if (inputImportSave) {
    inputImportSave.addEventListener('change', async function () {
      if (!inputImportSave.files || !inputImportSave.files.length) return;
      var imported = [];
      var skipped = [];
      var fixedTotal = 0;
      var handle = function (name, bytes) {
        var base = name.split('/').pop();
        var res = sanitizeRpg(bytes);
        if (!res.ok) { skipped.push(base + ' (' + res.reason + ')'); return; }
        var slot = chooseSlot(base);
        if (!slot) { skipped.push(base + ' (no slot chosen)'); return; }
        FS.writeFile('/data/' + slot + '.rpg', res.bytes, { encoding: 'binary' });
        fixedTotal += res.fixed;
        imported.push(base + ' -> slot ' + slot);
      };
      for (var i = 0; i < inputImportSave.files.length; i++) {
        var f = inputImportSave.files[i];
        if (f.name.toLowerCase().endsWith('.zip')) {
          var z = await JSZip.loadAsync(f);
          var names = Object.keys(z.files);
          for (var k = 0; k < names.length; k++) {
            var zn = names[k];
            if (zn.toLowerCase().endsWith('.rpg') && !z.files[zn].dir && !zn.includes('__MACOSX')) {
              handle(zn, await z.files[zn].async('uint8array'));
            }
          }
        } else if (f.name.toLowerCase().endsWith('.rpg')) {
          handle(f.name, new Uint8Array(await f.arrayBuffer()));
        } else {
          skipped.push(f.name + ' (not a .rpg or .zip file)');
        }
      }
      inputImportSave.value = '';
      FS.syncfs(false, function () {
        var msg = 'Imported ' + imported.length + ' save file(s):\n' + (imported.join('\n') || '(none)');
        if (fixedTotal) msg += '\n\nRepaired ' + fixedTotal + ' out-of-range script pointer(s) for compatibility with this build.';
        if (skipped.length) msg += '\n\nSkipped:\n' + skipped.join('\n');
        msg += '\n\nUse Load Game (title screen) or System -> Load in-game.';
        alert(msg);
      });
    });
  }

  var btnReinstall = document.getElementById('btnReinstall');
  if (btnReinstall) {
    btnReinstall.addEventListener('click', function () {
      if (!confirm('Re-download game chunks (your .rpg save files will be preserved)?')) return;
      try {
        FS.unlink('/data/.pal98_version');
      } catch (e) {}
      FS.syncfs(false, function () {
        window.location.reload();
      });
    });
  }

  // Virtual On-Screen Gamepad buttons -> dispatch genuine SDL2 KeyboardEvents
  function sendSyntheticKey(type, key, keyCode) {
    var evInit = {
      key: key,
      code: key.length === 1 ? 'Key' + key.toUpperCase() : key,
      keyCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true
    };
    var ev = new KeyboardEvent(type, evInit);
    Object.defineProperty(ev, 'keyCode', { get: function () { return keyCode; } });
    Object.defineProperty(ev, 'which', { get: function () { return keyCode; } });
    window.dispatchEvent(ev);
    document.dispatchEvent(ev);
    var canvas = document.getElementById('canvas');
    if (canvas) canvas.dispatchEvent(ev);
  }

  document.querySelectorAll('.key-btn').forEach(function (btn) {
    var key = btn.getAttribute('data-key');
    var code = parseInt(btn.getAttribute('data-code'), 10);
    var press = function (e) {
      e.preventDefault();
      unlockAudio();
      btn.classList.add('active');
      sendSyntheticKey('keydown', key, code);
    };
    var release = function (e) {
      e.preventDefault();
      btn.classList.remove('active');
      sendSyntheticKey('keyup', key, code);
    };
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', function () {
      if (btn.classList.contains('active')) {
        btn.classList.remove('active');
        sendSyntheticKey('keyup', key, code);
      }
    });
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', release, { passive: false });
  });
})();

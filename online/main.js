(function () {
  'use strict';

  var DATA_VERSION = 'pal98-eng-v3.5';
  // Cache key for sdlpal.wasm (must change whenever the engine binary changes).
  var ENGINE_VERSION = 'pal98-eng-v3.5.2';
  var DEFAULT_LANG = 'm_eng.slf';
  var LANGS = {
    'm_eng.slf': { code: 'en', badge: '🇬🇧 English (v3.5)', status: 'English v3.5' },
    'm_chs.slf': { code: 'chs', badge: '🇨🇳 简体中文 (98柔情篇)', status: '简体中文' },
    'm_cht.slf': { code: 'cht', badge: '🇭🇰 繁體中文 (DOS原版)', status: '繁體中文' }
  };
  var currentLang = localStorage.getItem('pal98_lang');
  if (!LANGS[currentLang]) currentLang = DEFAULT_LANG;

  var AUTOSAVE_SLOT = 5;
  var AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000;
  var HIDDEN_SAVE_MIN_GAP_MS = 60 * 1000;
  var CANVAS_W = 640, CANVAS_H = 400;

  var gameRunning = false;
  var dataReady = false;

  // SAVEDGAME_DOS layout (sdlpal global.c): fixed part = 12864 bytes, then EVENTOBJECT[n] (32 bytes each).
  var RPG_MIN_SIZE = 12864;

  // ---------------------------------------------------------------------------
  // UI strings (page chrome follows the language chosen on the start screen)
  // ---------------------------------------------------------------------------
  var STR = {
    en: {
      quickSave: '⚡ Quick Save (Slot 5)',
      autoIdle: '⏱ Auto-save every 5 min → Slot 5',
      saved: '✓ Auto-saved to Slot 5 ({t})',
      quickSaved: '✓ Quick-saved to Slot 5 ({t})',
      pending: '⏳ Saving to Slot 5 as soon as you are back to exploring…',
      unavailable: 'Auto-save unavailable',
      notInGame: 'Start or load a game first',
      backupShort: 'old Slot 5 backed up',
      backup: 'The previous Slot 5 save was kept as {f} (included in 💾 Export Saves; import it to restore).',
      fsEnter: '⛶ Fullscreen', fsExit: '✕ Exit Fullscreen',
      running: 'Running ({l}) — Arrow Keys, Enter/Space & Esc',
      inspIdle: 'Highlight an item in a shop, your inventory or the equip menu to see its stats and who can equip it.',
      inspShopTip: 'In the shop press Enter on an item to choose how many to buy (◄ ► ±1, ▲ ▼ ±10).',
      price: 'Price', sell: 'Sells for', have: 'You have', cash: 'Cash', canBuy: 'Affordable',
      wearers: 'Who can equip', party: 'Your party', notInParty: 'not in party', cannot: 'cannot equip',
      replaces: 'replaces', nothing: 'nothing', equipped: 'already wears this', hitsAll: 'Hits all enemies', twice: 'Attacks twice',
      combo: 'Combo spell', regen: 'Regenerates HP/MP in battle', anyone: 'Anyone',
      parts: { head: 'Headgear', body: 'Body gear', clothes: 'Clothing', weapon: 'Weapon', feet: 'Footwear', accessory: 'Accessory' },
      ctx: { 1: 'Shop', 2: 'Inventory' }
    },
    chs: {
      quickSave: '⚡ 快速存档（进度五）',
      autoIdle: '⏱ 每5分钟自动存档 → 进度五',
      saved: '✓ 已自动存档到进度五（{t}）',
      quickSaved: '✓ 已快速存档到进度五（{t}）',
      pending: '⏳ 回到自由行走状态后立即存入进度五…',
      unavailable: '自动存档不可用',
      notInGame: '请先开始或读取游戏',
      backupShort: '原进度五已备份',
      backup: '原进度五已备份为 {f}（可用 💾 Export Saves 导出）。',
      fsEnter: '⛶ 全屏', fsExit: '✕ 退出全屏',
      running: '运行中（{l}）— 方向键、Enter/空格、Esc',
      inspIdle: '在商店、物品栏或装备菜单中选中一件物品，即可查看属性数值和可装备的人物。',
      inspShopTip: '在商店中对物品按 Enter 可选择购买数量（◄ ► ±1，▲ ▼ ±10）。',
      price: '价格', sell: '卖出价', have: '现有', cash: '金钱', canBuy: '可买',
      wearers: '可装备人物', party: '队伍', notInParty: '不在队伍中', cannot: '不可装备',
      replaces: '替换', nothing: '无', equipped: '已装备此物', hitsAll: '攻击敌方全体', twice: '每回合攻击两次',
      combo: '合体法术', regen: '战斗中每回合恢复HP/MP', anyone: '全员',
      parts: { head: '头戴', body: '披挂', clothes: '身穿', weapon: '手持', feet: '脚穿', accessory: '配带' },
      ctx: { 1: '商店', 2: '物品' }
    },
    cht: {
      quickSave: '⚡ 快速存檔（進度五）',
      autoIdle: '⏱ 每5分鐘自動存檔 → 進度五',
      saved: '✓ 已自動存檔到進度五（{t}）',
      quickSaved: '✓ 已快速存檔到進度五（{t}）',
      pending: '⏳ 回到自由行走狀態後立即存入進度五…',
      unavailable: '自動存檔不可用',
      notInGame: '請先開始或讀取遊戲',
      backupShort: '原進度五已備份',
      backup: '原進度五已備份為 {f}（可用 💾 Export Saves 匯出）。',
      fsEnter: '⛶ 全螢幕', fsExit: '✕ 退出全螢幕',
      running: '執行中（{l}）— 方向鍵、Enter/空白鍵、Esc',
      inspIdle: '在商店、物品欄或裝備選單中選中一件物品，即可查看屬性數值和可裝備的人物。',
      inspShopTip: '在商店中對物品按 Enter 可選擇購買數量（◄ ► ±1，▲ ▼ ±10）。',
      price: '價格', sell: '賣出價', have: '現有', cash: '金錢', canBuy: '可買',
      wearers: '可裝備人物', party: '隊伍', notInParty: '不在隊伍中', cannot: '不可裝備',
      replaces: '替換', nothing: '無', equipped: '已裝備此物', hitsAll: '攻擊敵方全體', twice: '每回合攻擊兩次',
      combo: '合體法術', regen: '戰鬥中每回合恢復HP/MP', anyone: '全員',
      parts: { head: '頭戴', body: '披掛', clothes: '身穿', weapon: '手持', feet: '腳穿', accessory: '配帶' },
      ctx: { 1: '商店', 2: '物品' }
    }
  };
  function S() { return STR[LANGS[currentLang].code] || STR.en; }
  function fmt(s, o) { return s.replace(/\{(\w+)\}/g, function (_, k) { return o[k] !== undefined ? o[k] : ''; }); }
  function hhmmss() { var d = new Date(); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return ('0' + n).slice(-2); }).join(':'); }

  // ---------------------------------------------------------------------------
  // WebAudio unlock (macOS Safari/Chrome require a user gesture)
  // ---------------------------------------------------------------------------
  var trackedAudioContexts = [];
  var OrigAudioContext = window.AudioContext || window.webkitAudioContext;
  if (OrigAudioContext) {
    var PatchedAudioContext = function (opts) {
      var ctx = opts ? new OrigAudioContext(opts) : new OrigAudioContext();
      trackedAudioContexts.push(ctx);
      return ctx;
    };
    PatchedAudioContext.prototype = OrigAudioContext.prototype;
    window.AudioContext = PatchedAudioContext;
    if (window.webkitAudioContext) window.webkitAudioContext = PatchedAudioContext;
  }

  function unlockAudio() {
    var resumedAny = false;
    var ctxs = trackedAudioContexts.slice();
    ['SDL3', 'SDL2'].forEach(function (k) {
      if (window.Module && Module[k] && Module[k].audioContext) ctxs.push(Module[k].audioContext);
    });
    ctxs.forEach(function (ctx) {
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(function () {});
        resumedAny = true;
      }
    });
    var banner = document.getElementById('audioUnlockBanner');
    if (banner && gameRunning && (resumedAny || ctxs.some(function (c) { return c && c.state === 'running'; }))) {
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
  var setupOverlayEl = document.getElementById('setupOverlay');
  var btnStartEl = document.getElementById('btnStartGame');
  var langBadgeEl = document.getElementById('langBadge');
  var saveBadgeEl = document.getElementById('autoSaveBadge');
  var btnQuickSaveEl = document.getElementById('btnQuickSave');
  var canvasEl = document.getElementById('canvas');

  function setStatus(msg) {
    if (statusTextEl) statusTextEl.textContent = msg;
  }

  function setProgress(pct, statsText) {
    if (progressFillEl) progressFillEl.style.width = Math.max(2, Math.min(100, pct)).toFixed(1) + '%';
    if (statsText && byteStatsEl) byteStatsEl.textContent = statsText;
    if (!dataReady && btnStartEl) btnStartEl.textContent = '⏳ ' + Math.round(Math.max(0, Math.min(100, pct))) + '%';
  }

  // Persist /data to IndexedDB unless a sync is already in flight (either a manual
  // FS.syncfs() or the IDBFS autoPersist queue), avoiding overlapping syncs.
  function syncDataIfIdle(cb) {
    var done = function (ok) { if (cb) cb(ok); };
    if (typeof FS === 'undefined') { done(false); return; }
    try {
      var busy = (FS.syncFSRequests || 0) > 0;
      try {
        var mnt = FS.lookupPath('/data').node.mount;
        if (mnt && mnt.idbPersistState) busy = true;
      } catch (e) {}
      if (busy) { done(false); return; }
      FS.syncfs(false, function () { done(true); });
    } catch (e) {
      done(false);
    }
  }

  // Like syncDataIfIdle, but retries while another sync is running so the latest
  // state (e.g. a fresh auto-save) is guaranteed to reach IndexedDB.
  function syncDataSoon(cb, tries) {
    tries = tries === undefined ? 20 : tries;
    syncDataIfIdle(function (ok) {
      if (ok || tries <= 0) { if (cb) cb(ok); return; }
      setTimeout(function () { syncDataSoon(cb, tries - 1); }, 250);
    });
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
            throw new Error('Checksum mismatch for ' + chunkMeta.file + ' (please reload the page)');
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

  // ---------------------------------------------------------------------------
  // Pre-launch setup screen: language is chosen once, before the engine starts.
  // ---------------------------------------------------------------------------
  function selectLang(lang) {
    if (!LANGS[lang] || gameRunning) return;
    currentLang = lang;
    document.querySelectorAll('.lang-opt').forEach(function (b) {
      var on = b.getAttribute('data-lang') === lang;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    refreshChromeStrings();
  }

  function markDataReady() {
    dataReady = true;
    if (btnStartEl) {
      btnStartEl.disabled = false;
      btnStartEl.textContent = '▶ Start Game';
      btnStartEl.focus();
    }
    setStatus('Ready — choose a language and press ▶ Start Game');
  }

  var starting = false;
  function startGameFromSetup() {
    if (!dataReady || gameRunning || starting) return;
    starting = true;
    try {
      writeSdlPalConfig(currentLang);
    } catch (e) {
      console.error(e);
    }
    localStorage.setItem('pal98_lang', currentLang);
    if (setupOverlayEl) setupOverlayEl.classList.add('hidden');
    if (langBadgeEl) {
      langBadgeEl.textContent = '🌐 ' + LANGS[currentLang].badge;
      langBadgeEl.classList.add('locked');
    }
    unlockAudio();
    syncDataIfIdle(function () { startSdlPalEngine(); });
  }

  if (btnStartEl) btnStartEl.addEventListener('click', startGameFromSetup);
  document.querySelectorAll('.lang-opt').forEach(function (b) {
    b.addEventListener('click', function () { selectLang(b.getAttribute('data-lang')); });
    b.addEventListener('dblclick', function () { selectLang(b.getAttribute('data-lang')); startGameFromSetup(); });
  });
  window.addEventListener('keydown', function (e) {
    if (gameRunning || !setupOverlayEl || setupOverlayEl.classList.contains('hidden')) return;
    var order = Object.keys(LANGS);
    var i = order.indexOf(currentLang);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { selectLang(order[(i + 1) % order.length]); e.preventDefault(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { selectLang(order[(i + order.length - 1) % order.length]); e.preventDefault(); }
    else if (e.key === '1' || e.key === '2' || e.key === '3') { selectLang(order[parseInt(e.key, 10) - 1]); }
    else if ((e.key === 'Enter' || e.key === ' ') && dataReady && !(document.activeElement && document.activeElement.tagName === 'BUTTON')) { startGameFromSetup(); e.preventDefault(); }
  }, true);

  var linkRedownload = document.getElementById('linkRedownload');
  if (linkRedownload) {
    linkRedownload.addEventListener('click', function (e) {
      e.preventDefault();
      if (gameRunning) return;
      if (!confirm('Re-download the game data chunks? Your .rpg save files are kept.')) return;
      try { FS.unlink('/data/.pal98_version'); } catch (err) {}
      FS.syncfs(false, function () { window.location.reload(); });
    });
  }

  function refreshChromeStrings() {
    var s = S();
    if (btnQuickSaveEl) btnQuickSaveEl.textContent = s.quickSave;
    if (saveBadgeEl && !saveBadgeEl.dataset.state) saveBadgeEl.textContent = s.autoIdle;
    updateFullscreenButton();
    renderInspector();
  }

  function startSdlPalEngine() {
    if (gameRunning) return;
    gameRunning = true;
    setStatus(fmt(S().running, { l: LANGS[currentLang].status }));
    setTimeout(function () {
      if (loaderPanelEl) loaderPanelEl.style.display = 'none';
    }, 900);
    if (btnQuickSaveEl) btnQuickSaveEl.disabled = false;
    if (canvasEl) canvasEl.focus();
    // Show the audio hint only if the browser still keeps WebAudio suspended.
    setTimeout(function () {
      var banner = document.getElementById('audioUnlockBanner');
      var ctxs = trackedAudioContexts.slice();
      if (Module.SDL3 && Module.SDL3.audioContext) ctxs.push(Module.SDL3.audioContext);
      if (banner && ctxs.some(function (c) { return c && c.state === 'suspended'; })) banner.style.display = '';
    }, 2500);
    var mainFunc = Module.cwrap('EMSCRIPTEN_main', 'number', ['number', 'number'], { async: true });
    mainFunc(0, 0);
  }

  // ---------------------------------------------------------------------------
  // Auto-save (every 5 minutes) + Quick Save, both to Slot 5 (/data/5.rpg).
  // The engine performs the save itself (PAL_SaveGame) at the next safe point of
  // its main loop: free exploration only, never inside a battle, menu, dialog or
  // running script, so the file is identical to a manual System -> Save.
  // ---------------------------------------------------------------------------
  var lastSaveAt = 0;
  var pendingSaveReason = null;
  var backupShown = false;

  function setSaveBadge(state, text, title) {
    if (!saveBadgeEl) return;
    saveBadgeEl.dataset.state = state || '';
    saveBadgeEl.className = 'save-badge' + (state ? ' ' + state : '');
    saveBadgeEl.textContent = text;
    if (title !== undefined) saveBadgeEl.title = title;
  }

  var sessionBackupDone = false;
  var lastBackupName = null;
  var MAX_SLOT5_BACKUPS = 3;

  // Before the first auto/quick save of a session, keep a copy of whatever Slot 5 holds unless the
  // current game was itself loaded from Slot 5 (e.g. after an accidental "New Game").
  function backupForeignSlot5() {
    if (sessionBackupDone) return null;
    sessionBackupDone = true;
    if (lastSaveAt > 0 || webInfo(12) === AUTOSAVE_SLOT) return null;
    try {
      var bytes = FS.readFile('/data/' + AUTOSAVE_SLOT + '.rpg');
      var d = new Date();
      var stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-' +
        ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2) + ('0' + d.getSeconds()).slice(-2);
      var name = AUTOSAVE_SLOT + '-backup-' + stamp + '.rpg';
      FS.writeFile('/data/' + name, bytes, { encoding: 'binary' });
      // Keep only the newest few backups.
      var olds = Object.keys(FS.lookupPath('/data').node.contents).filter(function (n) {
        return n.indexOf(AUTOSAVE_SLOT + '-backup-') === 0 && /\.rpg$/.test(n);
      }).sort();
      while (olds.length > MAX_SLOT5_BACKUPS) {
        try { FS.unlink('/data/' + olds.shift()); } catch (e) {}
      }
      return name;
    } catch (e) {
      return null;
    }
  }

  function requestWebSave(reason) {
    if (!gameRunning || !window.Module || typeof Module._PAL_WebRequestSave !== 'function') {
      if (reason === 'quick') setSaveBadge('warn', S().unavailable);
      return false;
    }
    // Only save a game that is actually running (never from the title screen).
    if (webInfo(11) !== 1) {
      if (reason === 'quick') setSaveBadge('warn', S().notInGame);
      return false;
    }
    var backup = backupForeignSlot5();
    if (backup) {
      lastBackupName = backup;
      setSaveBadge('info', S().autoIdle, fmt(S().backup, { f: backup }));
    }
    var r = Module._PAL_WebRequestSave(AUTOSAVE_SLOT);
    if (r !== 0) return false;
    if (pendingSaveReason !== 'quick') pendingSaveReason = reason;
    if (reason === 'quick') {
      // If the engine cannot save right away (battle, menu, dialog...), tell the player.
      setTimeout(function () {
        if (pendingSaveReason === 'quick') setSaveBadge('pending', S().pending);
      }, 400);
    }
    return true;
  }

  Module_onPalSaved = function (slot, savedTimes) {
    lastSaveAt = Date.now();
    var reason = pendingSaveReason;
    pendingSaveReason = null;
    var t = hhmmss();
    var note = lastBackupName ? fmt(S().backup, { f: lastBackupName }) : '';
    var firstAfterBackup = !!lastBackupName && !backupShown;
    backupShown = backupShown || !!lastBackupName;
    syncDataSoon(function () {
      setSaveBadge('ok', fmt(reason === 'quick' ? S().quickSaved : S().saved, { t: t }) + (firstAfterBackup ? ' · ' + S().backupShort : ''),
        'Slot ' + slot + ' · save #' + savedTimes + ' · /data/' + slot + '.rpg' + (note ? '\n' + note : ''));
    });
  };

  setInterval(function () {
    if (gameRunning && document.visibilityState === 'visible') requestWebSave('auto');
  }, AUTOSAVE_INTERVAL_MS);

  if (btnQuickSaveEl) {
    btnQuickSaveEl.addEventListener('click', function () {
      requestWebSave('quick');
      if (canvasEl) canvasEl.focus();
    });
  }

  // Periodically sync IDBFS every 6 seconds so in-game saves (.rpg) are always persisted
  setInterval(function () {
    if (gameRunning) syncDataIfIdle();
  }, 6000);

  // Flush pending writes when the tab is hidden / closed (mobile app switch, tab close).
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && gameRunning) {
      if (Date.now() - lastSaveAt > HIDDEN_SAVE_MIN_GAP_MS) requestWebSave('hidden');
      syncDataIfIdle();
    }
  });
  window.addEventListener('pagehide', function () {
    if (gameRunning) syncDataIfIdle();
  });

  // ---------------------------------------------------------------------------
  // Shop & Equipment Inspector (driven by the engine's item-focus hook)
  // ---------------------------------------------------------------------------
  var inspState = { ctx: 0, item: 0, flags: 0 };
  var inspRaf = 0;
  var STAT_ATTR = { 17: 0, 18: 1, 19: 2, 20: 3, 21: 4 };
  var PART_INDEX = { head: 0, body: 1, clothes: 2, weapon: 3, feet: 4, accessory: 5 };
  var STAT_LABEL = {
    en: { 17: 'STR', 18: 'INT', 19: 'DEF', 20: 'AGI', 21: 'LUK', 22: 'Poison Res', 23: 'Wind Res', 24: 'Thunder Res', 25: 'Water Res', 26: 'Fire Res', 27: 'Earth Res' },
    chs: { 17: '武术', 18: '灵力', 19: '防御', 20: '身法', 21: '吉运', 22: '避毒率', 23: '避风率', 24: '避雷率', 25: '避水率', 26: '避火率', 27: '避土率' },
    cht: { 17: '武術', 18: '靈力', 19: '防禦', 20: '身法', 21: '吉運', 22: '避毒率', 23: '避風率', 24: '避雷率', 25: '避水率', 26: '避火率', 27: '避土率' }
  };

  function webInfo(what, a, b) {
    try {
      if (window.Module && typeof Module._PAL_WebInfo === 'function') return Module._PAL_WebInfo(what, a || 0, b || 0);
    } catch (e) {}
    return -1;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  Module_onPalItemFocus = function (ctx, item, flags) {
    inspState = { ctx: ctx, item: item, flags: flags };
    if (!inspRaf) inspRaf = requestAnimationFrame(function () { inspRaf = 0; renderInspector(); });
  };

  function renderInspector() {
    var box = document.getElementById('inspector');
    if (!box) return;
    var s = S();
    var lang = LANGS[currentLang].code;
    var items = window.PAL98_ITEMS || {};
    var it = items[inspState.item];
    if (!inspState.ctx || !it) {
      box.className = 'inspector idle';
      box.innerHTML = '<div class="insp-idle">🛒 ' + esc(s.inspIdle) + '</div>';
      return;
    }
    var roleNames = (window.PAL98_ROLES || {})[lang] || [];
    var name = it.n[lang] || it.n.en;
    var html = '<div class="insp-head"><span class="insp-ctx">' + esc(s.ctx[inspState.ctx] || '') + '</span>' +
      '<span class="insp-name">' + esc(name) + (lang !== 'en' && it.n.en ? ' <small>' + esc(it.n.en) + '</small>' : '') + '</span>';
    if (it.part) html += '<span class="insp-chip part">' + esc(s.parts[it.part] || it.part) + '</span>';
    if (inspState.ctx === 1) html += '<span class="insp-price">' + esc(s.price) + ' <b>' + it.p + '</b></span>';
    else if (it.f & 32) html += '<span class="insp-price">' + esc(s.sell) + ' <b>' + Math.floor(it.p / 2) + '</b></span>';
    html += '</div>';

    if (it.e && it.e.length) {
      html += '<div class="insp-stats">';
      it.e.forEach(function (ev) {
        var lbl = (STAT_LABEL[lang] || STAT_LABEL.en)[ev[0]] || ('#' + ev[0]);
        var pct = ev[0] >= 22 ? '%' : '';
        html += '<span class="insp-chip ' + (ev[1] >= 0 ? 'up' : 'down') + '">' + esc(lbl) + ' ' + (ev[1] >= 0 ? '+' : '') + ev[1] + pct + '</span>';
      });
      (it.s || []).forEach(function (sp) {
        var t = sp === 'attack_all' ? s.hitsAll : sp === 'double_attack' ? s.twice : (sp && sp[0] === 'coop') ? s.combo : (sp && sp[0] === 'regen') ? s.regen : '';
        if (t) html += '<span class="insp-chip special">' + esc(t) + '</span>';
      });
      html += '</div>';
    }

    if (it.r) {
      var party = [];
      var n = webInfo(4);
      for (var i = 0; i < n && i < 6; i++) party.push(webInfo(5, i));
      html += '<div class="insp-row"><span class="insp-label">' + esc(s.wearers) + ':</span>';
      for (var r = 0; r < roleNames.length; r++) {
        var can = it.r.indexOf(r) >= 0;
        if (!can && party.indexOf(r) < 0) continue;
        html += '<span class="insp-role ' + (can ? 'can' : 'cannot') + (party.indexOf(r) >= 0 ? ' inparty' : '') + '">' +
          (can ? '✔ ' : '✖ ') + esc(roleNames[r]) + (can ? '' : ' (' + esc(s.cannot) + ')') + '</span>';
      }
      html += '</div>';
      // Compare against what each party member currently wears in that slot.
      var pi = PART_INDEX[it.part];
      var rows = '';
      party.forEach(function (role) {
        if (it.r.indexOf(role) < 0 || pi === undefined) return;
        var curItem = webInfo(6, role, 11 + pi);
        if (curItem === inspState.item) {
          rows += '<div class="insp-cmp"><b>' + esc(roleNames[role] || role) + '</b> <span class="muted">' + esc(s.equipped) + '</span></div>';
          return;
        }
        var curName = curItem > 0 && items[curItem] ? (items[curItem].n[lang] || items[curItem].n.en) : s.nothing;
        var deltas = [];
        it.e.forEach(function (ev) {
          if (STAT_ATTR[ev[0]] === undefined) return;
          var now = webInfo(9, role, STAT_ATTR[ev[0]]);
          var curEff = webInfo(7, role, pi * 100 + ev[0]);
          if (now < 0) return;
          var after = now - curEff + ev[1];
          var d = after - now;
          deltas.push('<span class="cmp ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'same') + '">' +
            esc((STAT_LABEL[lang] || STAT_LABEL.en)[ev[0]]) + ' ' + now + '→' + after + ' (' + (d >= 0 ? '+' : '') + d + ')</span>');
        });
        // Stats the current item gives that the new one does not.
        if (curItem > 0 && items[curItem] && items[curItem].e) {
          items[curItem].e.forEach(function (ev) {
            if (STAT_ATTR[ev[0]] === undefined) return;
            if (it.e.some(function (x) { return x[0] === ev[0]; })) return;
            var now = webInfo(9, role, STAT_ATTR[ev[0]]);
            var curEff = webInfo(7, role, pi * 100 + ev[0]);
            if (now < 0 || !curEff) return;
            deltas.push('<span class="cmp ' + (curEff > 0 ? 'down' : 'up') + '">' +
              esc((STAT_LABEL[lang] || STAT_LABEL.en)[ev[0]]) + ' ' + now + '→' + (now - curEff) + ' (' + (curEff > 0 ? '-' : '+') + Math.abs(curEff) + ')</span>');
          });
        }
        rows += '<div class="insp-cmp"><b>' + esc(roleNames[role] || role) + '</b> <span class="muted">' + esc(s.replaces) + ' ' +
          esc(curName) + '</span> ' + deltas.join(' ') + '</div>';
      });
      if (rows) html += rows;
    }

    var desc = it.d[lang] || it.d.en;
    if (desc && desc.length) {
      html += '<div class="insp-desc">' + desc.map(esc).join('<br>') + '</div>';
    }

    var have = webInfo(8, inspState.item);
    var cash = webInfo(1);
    var foot = [];
    if (have >= 0) foot.push(esc(s.have) + ' <b>' + have + '</b>');
    if (cash >= 0) foot.push(esc(s.cash) + ' <b>' + cash + '</b>');
    if (inspState.ctx === 1 && cash >= 0 && it.p > 0) foot.push(esc(s.canBuy) + ' <b>' + Math.max(0, Math.min(99 - Math.max(0, have), Math.floor(cash / it.p))) + '</b>');
    if (foot.length) html += '<div class="insp-foot">' + foot.join(' · ') + '</div>';
    if (inspState.ctx === 1) html += '<div class="insp-tip">' + esc(s.inspShopTip) + '</div>';

    box.className = 'inspector';
    box.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Emscripten Module
  // ---------------------------------------------------------------------------
  var Module_onPalSaved, Module_onPalItemFocus;

  window.Module = {
    preRun: [],
    postRun: [],
    // Keep the WebGL drawing buffer at 640x400 and let CSS do all scaling; SDL3
    // never sees the (CSS-only) fullscreen or window resizes (see sdlpal.js patch).
    locateFile: function (path, prefix) {
      return (prefix || '') + path + (/\.wasm$/.test(path) ? '?v=' + encodeURIComponent(ENGINE_VERSION) : '');
    },
    pal98CanvasLock: [CANVAS_W, CANVAS_H],
    pal98CssFullscreen: true,
    print: function (text) {
      console.log('[SDLPal]', text);
    },
    printErr: function (text) {
      console.warn('[SDLPal]', text);
    },
    canvas: (function () {
      canvasEl.addEventListener('webglcontextlost', function (e) {
        e.preventDefault();
        syncDataIfIdle(function () { window.location.reload(); });
      }, false);
      canvasEl.addEventListener('click', function () {
        canvasEl.focus();
        unlockAudio();
      });
      return canvasEl;
    })(),
    onPalSaved: function (slot, savedTimes) { Module_onPalSaved(slot, savedTimes); },
    onPalItemFocus: function (ctx, item, flags) { Module_onPalItemFocus(ctx, item, flags); },
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
            for (var i = 0; i < 8; i++) {
              var chip = document.getElementById('chip-' + i);
              if (chip) {
                chip.className = 'chunk-chip done';
                chip.textContent = 'Part 0' + i + ' ✓';
              }
            }
            setProgress(100, 'Cached in IndexedDB (0 MB download)');
          } else {
            await downloadAndUnpackChunks();
          }
          markDataReady();
        } catch (err) {
          console.error('Failed to initialize PAL98 data:', err);
          setStatus('Error loading chunks: ' + err.message);
          if (btnStartEl) btnStartEl.textContent = '⚠ ' + err.message;
        }
      });
    }
  };
  Module_onPalSaved = Module_onPalSaved || function () {};

  // ---------------------------------------------------------------------------
  // Fullscreen (CSS-only on #canvasWrap; the canvas buffer stays 640x400)
  // ---------------------------------------------------------------------------
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function updateFullscreenButton() {
    var b = document.getElementById('btnFullscreen');
    if (b) b.textContent = isFullscreen() ? S().fsExit : S().fsEnter;
  }

  function onFullscreenChange() {
    if (canvasEl) {
      if (canvasEl.width !== CANVAS_W) canvasEl.width = CANVAS_W;
      if (canvasEl.height !== CANVAS_H) canvasEl.height = CANVAS_H;
      canvasEl.style.removeProperty('width');
      canvasEl.style.removeProperty('height');
      canvasEl.style.removeProperty('padding');
      canvasEl.focus();
    }
    document.body.classList.toggle('is-fullscreen', isFullscreen());
    updateFullscreenButton();
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  var btnFullscreen = document.getElementById('btnFullscreen');
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', function () {
      var wrap = document.getElementById('canvasWrap');
      if (!isFullscreen()) {
        if (wrap.requestFullscreen) wrap.requestFullscreen().catch(function () {});
        else if (wrap.webkitRequestFullscreen) wrap.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen().catch(function () {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Save export / import
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Virtual On-Screen Gamepad buttons -> dispatch genuine SDL2 KeyboardEvents
  // ---------------------------------------------------------------------------
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
    if (canvasEl) canvasEl.dispatchEvent(ev);
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

  // Initial state of the start screen.
  selectLang(currentLang);
  if (langBadgeEl) langBadgeEl.textContent = '🌐 ' + LANGS[currentLang].badge;
  refreshChromeStrings();

  // Test/automation hooks (read-only helpers + the save request).
  window.PAL98 = {
    version: DATA_VERSION,
    requestSave: requestWebSave,
    info: webInfo,
    state: function () {
      return { gameRunning: gameRunning, dataReady: dataReady, lang: currentLang, lastSaveAt: lastSaveAt, pending: pendingSaveReason, inspector: inspState };
    },
    start: startGameFromSetup,
    selectLang: selectLang
  };
})();

# 仙剑奇侠传 98柔情篇（原版完整收藏版）

本仓库收录 **《仙剑奇侠传》98柔情篇（简体中文原版）** 的两个完整原始版本：

1. **`Win98/` — 仙剑奇侠传 98柔情篇 Windows 95/98 光盘完整原版（约 244 MB）**
   - 原版执行程序与动态库：`PAL.EXE`（VB4 主程序）、`Pal.dll`（内嵌字库与物品说明的核心库）、`Pal_01.DLL`、`VB40032.DLL`
   - 完整过场动画：`1.avi` ~ `6.avi`（共 6 段原版 AVI 动画）
   - 完整音轨与配乐：`CD/02.ogg` ~ `09.ogg`（CD 音轨）、`Musics/001.MID` ~ `088.MID`（88 首原版 MIDI 配乐）、`MUS.MKF`（RIX 配乐包）、`SOUNDS.MKF`（18 MB 原版 WAV 音效包）
   - 完整数据与脚本资源：`ABC.MKF`、`BALL.MKF`、`DATA.MKF`、`F.MKF`、`FBP.MKF`、`FIRE.MKF`、`GOP.MKF`、`M.MSG`、`MAP.MKF`、`MGO.MKF`、`PAT.MKF`、`RGM.MKF`、`RNG.MKF`、`SSS.MKF`、`WORD.DAT`

2. **`Dos_98/` — 仙剑奇侠传 98柔情篇 DOS / SDLPal 简体中文版（约 29 MB）**
   - 包含简体中文字库（`wor16.FON`、`WOR16.ASC`）、物品/仙术说明文件（`desc.dat`）、RLE 压缩的 `.MKF` 数据包、`VOC.MKF` 语音音效、`MIDI.MKF` 与 `MUS.MKF` 配乐，以及初始存档 `0.RPG` ~ `6.rpg`。
   - 可直接使用 DOSBox 或跨平台开源引擎 [SDLPal](https://github.com/sdlpal/sdlpal) 在 Windows 10/11、macOS、Linux、iOS、Android 上完美运行。

---

## 目录结构

```text
pal98-rouqing/
├── Win98/                  # 仙剑奇侠传 98柔情篇 Windows 光盘完整原版
│   ├── PAL.EXE             # 98柔情篇 Windows 原版主程序
│   ├── Pal.dll             # 98柔情篇核心引擎 DLL（含简体字库与物品描述）
│   ├── VB40032.DLL         # Visual Basic 4.0 32-bit 运行库
│   ├── 1.avi ~ 6.avi       # 6 段原版 AVI 过场动画
│   ├── CD/                 # 02.ogg ~ 09.ogg 原版 CD 音轨
│   ├── Musics/             # 001.MID ~ 088.MID 原版 MIDI 音乐
│   ├── SOUNDS.MKF          # Windows 版 WAV 战斗与环境音效包
│   └── *.MKF / M.MSG / WORD.DAT
└── Dos_98/                 # 仙剑奇侠传 98柔情篇 DOS / SDLPal 简体中文版
    ├── PAL.EXE / PALS.EXE  # DOS 原版可执行文件
    ├── desc.dat            # 98柔情篇新增物品与仙术说明
    ├── wor16.FON / .ASC    # 简体中文 GBK 16x16 点阵字库
    ├── VOC.MKF / MIDI.MKF  # VOC 音效包与 MIDI 配乐包
    └── *.MKF / M.MSG / WORD.DAT / *.RPG
```

---

## 运行方式

### 方式一：使用 SDLPal 跨平台运行（推荐，支持 Win10/11、macOS、Linux、Android、iOS）
1. 在本仓库的 **Releases** 页面（或 [sdlpal/sdlpal Releases](https://github.com/sdlpal/sdlpal/releases)）下载对应系统的 `SDLPal` 程序。
2. 将 `SDLPal` 放入 `Win98/` 或 `Dos_98/` 目录下（或在 SDLPal 启动设置中选择 `Win98/` 或 `Dos_98/` 作为游戏资源目录）即可直接运行，支持高清缩放、窗口化、手柄及 CD/MIDI/RIX 音轨切换。

### 方式二：Windows 10 / 11 原生运行 `Win98/PAL.EXE`
1. 进入 `Win98/` 目录，右键 `PAL.EXE` -> **属性** -> **兼容性**，勾选「以兼容模式运行这个程序（Windows 98 / Windows Me）」及「以管理员身份运行」。
2. 若在非简体中文系统下出现文字乱码，可在「控制面板 -> 区域 -> 管理 -> 非 Unicode 程序的语言」中设置为「中文（简体，中国）」，或使用 Locale Emulator 启动。

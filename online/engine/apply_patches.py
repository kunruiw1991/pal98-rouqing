#!/usr/bin/env python3
"""Applies the pal98-eng-v3.5 engine patches to a pristine SDLPal v3.0.2025.0616 tree.

Usage: apply_patches.py <src_root>
"""
import os
import shutil
import sys

ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))


def edit(path, old, new, count=1):
  full = os.path.join(ROOT, path)
  s = open(full, encoding='utf-8', errors='surrogateescape', newline='').read()
  if s.count(old) == 0 and '\r\n' in old:
    old = old.replace('\r\n', '\n')
    new = new.replace('\r\n', '\n')
  n = s.count(old)
  if n != count:
    raise SystemExit('%s: expected %d occurrence(s) of anchor, found %d:\n%s' % (path, count, n, old[:200]))
  s = s.replace(old, new)
  open(full, 'w', encoding='utf-8', errors='surrogateescape', newline='').write(s)


# Files use CRLF line endings; normalise our snippets accordingly.
def crlf(s):
  return s.replace('\r\n', '\n').replace('\n', '\r\n')


# 1. palweb.c (new file, compiled by the emscripten Makefile wildcard ../*.c)
shutil.copy(os.path.join(HERE, 'palweb.c'), os.path.join(ROOT, 'palweb.c'))

# 2. main.h: prototypes
edit('main.h', crlf('#include "battle.h"\n'), crlf(
    '#include "battle.h"\n'
    '\n'
    'PAL_C_LINKAGE_BEGIN\n'
    'VOID PAL_WebProcessPendingSave(VOID);\n'
    'VOID PAL_WebNotifyItemFocus(int ctx, int item, int flags);\n'
    'PAL_C_LINKAGE_END\n'))

# 3. game.c: safe-point save hook at the top of the main loop
edit('game.c', crlf(
    '      PAL_LoadResources();\n'
    '\n'), crlf(
    '      PAL_LoadResources();\n'
    '\n'
    '      //\n'
    '      // pal98-eng-v3.5: perform a pending browser auto/quick save here. This is\n'
    '      // the same state in which the player can open the System menu to save.\n'
    '      //\n'
    '      PAL_WebProcessPendingSave();\n'
    '\n'))

# 4. uigame.c: shop purchase dialog (item info + quantity) and inspector hooks
DIALOG = r'''
#define BUYMENU_LABEL_QTY       620
#define BUYMENU_LABEL_TOTAL     621
#define BUYMENU_LABEL_NOMONEY   622
#define BUYMENU_LABEL_BAGFULL   623
#define BUYMENU_LABEL_PRICE     624

static LPCWSTR
PAL_BuyMenu_Word(
   int            iWord,
   LPCWSTR        lpszFallback
)
{
   LPCWSTR lpsz = PAL_GetWord(iWord);
   return (lpsz != NULL && *lpsz) ? lpsz : lpszFallback;
}

static VOID
PAL_BuyMenu_PurchaseDialog(
   WORD           wObject
)
/*++
  Purpose:

    pal98-eng-v3.5: show the item's description (stats and who can equip it)
    together with a quantity selector before buying.
    Left/Right: -1/+1, Down/Up: -10/+10, Enter: buy, Esc: cancel.

  Parameters:

    [IN]  wObject - object ID of the item to buy.

  Return value:

    None.

--*/
{
   const WORD     wPrice = gpGlobals->g.rgObject[wObject].item.wPrice;
   const int      nInBag = PAL_GetItemAmount(wObject);
   const int      x = 14, cols = 15, xText = x + 16, xRight = x + 22 + 16 * cols + 22 - 18;
   WCHAR          szDesc[512];
   LPCWSTR        rgLines[6];
   int            nLines = 0, nMax, nMaxCash, nMaxBag, nQty, nRows, boxH, y, ty, i, idx;
   BOOL           fBagFull = FALSE;
   LPBOX          lpBox = NULL;
   SDL_Rect       rect;

   //
   // How many can we buy?
   //
   nMaxCash = (wPrice > 0) ? (int)(gpGlobals->dwCash / wPrice) : 99;
   nMaxBag = 99 - nInBag;
   if (!PAL_GetItemIndexToInventory(wObject, &idx) && idx >= MAX_INVENTORY)
   {
      nMaxBag = 0;
   }
   if (nMaxBag <= 0)
   {
      nMaxBag = 0;
      fBagFull = TRUE;
   }
   nMax = (nMaxCash < nMaxBag) ? nMaxCash : nMaxBag;
   if (nMax > 99) nMax = 99;
   if (nMax < 0) nMax = 0;
   nQty = (nMax > 0) ? 1 : 0;

   //
   // Split the description into lines
   //
   if (gpGlobals->lpObjectDesc != NULL)
   {
      LPCWSTR d = PAL_GetObjectDesc(gpGlobals->lpObjectDesc, wObject);
      if (d != NULL)
      {
         WCHAR *p, *next;
         wcsncpy(szDesc, d, 511);
         szDesc[511] = L'\0';
         p = szDesc;
         while (p != NULL && nLines < 6)
         {
            next = wcschr(p, L'*');
            if (next != NULL) *next++ = L'\0';
            rgLines[nLines++] = p;
            p = next;
         }
      }
   }

   //
   // Box geometry (style 1: top 20, rows of 18, bottom 22 pixels)
   //
   nRows = (16 * (nLines + 3) + 8 + 24 - 42 + 17) / 18;
   if (nRows < 3) nRows = 3;
   boxH = 20 + 18 * nRows + 22;
   y = (200 - boxH) / 2;
   if (y < 0) y = 0;

   rect.x = x;
   rect.y = y;
   rect.w = 22 + 16 * cols + 22 + 6;
   rect.h = boxH + 6;
   if (rect.x + rect.w > 320) rect.w = 320 - rect.x;
   if (rect.y + rect.h > 200) rect.h = 200 - rect.y;

   while (TRUE)
   {
      //
      // (Re)draw the dialog
      //
      if (lpBox != NULL)
      {
         PAL_DeleteBox(lpBox);
      }
      lpBox = PAL_CreateBoxWithShadow(PAL_XY(x, y), nRows, cols, 1, TRUE, 6);

      ty = y + 12;
      PAL_DrawText(PAL_GetWord(wObject), PAL_XY(xText, ty), MENUITEM_COLOR_CONFIRMED, TRUE, FALSE, FALSE);
      PAL_DrawText(PAL_BuyMenu_Word(BUYMENU_LABEL_PRICE, L"Price"), PAL_XY(xRight - 104, ty), MENUITEM_COLOR, TRUE, FALSE, FALSE);
      PAL_DrawNumber(wPrice, 6, PAL_XY(xRight - 36, ty + 5), kNumColorYellow, kNumAlignRight);
      ty += 18;

      for (i = 0; i < nLines; i++)
      {
         PAL_DrawText(rgLines[i], PAL_XY(xText, ty), DESCTEXT_COLOR, TRUE, FALSE, FALSE);
         ty += 16;
      }
      ty += 4;

      if (nMax > 0)
      {
         PAL_DrawText(PAL_BuyMenu_Word(BUYMENU_LABEL_QTY, L"Qty"), PAL_XY(xText, ty), MENUITEM_COLOR, TRUE, FALSE, FALSE);
         PAL_DrawText(L"<", PAL_XY(xText + 48, ty), (nQty > 1) ? MENUITEM_COLOR_SELECTED_FIRST : MENUITEM_COLOR_INACTIVE, TRUE, FALSE, FALSE);
         PAL_DrawNumber(nQty, 2, PAL_XY(xText + 60, ty + 5), kNumColorCyan, kNumAlignRight);
         PAL_DrawText(L">", PAL_XY(xText + 78, ty), (nQty < nMax) ? MENUITEM_COLOR_SELECTED_FIRST : MENUITEM_COLOR_INACTIVE, TRUE, FALSE, FALSE);
         PAL_DrawText(PAL_BuyMenu_Word(BUYMENU_LABEL_TOTAL, L"Total"), PAL_XY(xRight - 104, ty), MENUITEM_COLOR, TRUE, FALSE, FALSE);
         PAL_DrawNumber((UINT)wPrice * (UINT)nQty, 6, PAL_XY(xRight - 36, ty + 5), kNumColorYellow, kNumAlignRight);
      }
      else
      {
         PAL_DrawText(fBagFull ? PAL_BuyMenu_Word(BUYMENU_LABEL_BAGFULL, L"Bag full") : PAL_BuyMenu_Word(BUYMENU_LABEL_NOMONEY, L"No money"),
            PAL_XY(xText, ty), 0x1A, TRUE, FALSE, FALSE);
      }
      ty += 18;

      PAL_DrawText(PAL_GetWord(BUYMENU_LABEL_CURRENT), PAL_XY(xText, ty), MENUITEM_COLOR, TRUE, FALSE, FALSE);
      PAL_DrawNumber(nInBag, 2, PAL_XY(xText + 60, ty + 5), kNumColorCyan, kNumAlignRight);
      PAL_DrawText(PAL_GetWord(CASH_LABEL), PAL_XY(xRight - 104, ty), MENUITEM_COLOR, TRUE, FALSE, FALSE);
      PAL_DrawNumber(gpGlobals->dwCash, 6, PAL_XY(xRight - 36, ty + 5), kNumColorYellow, kNumAlignRight);

      VIDEO_UpdateScreen(&rect);

      //
      // Wait for a key that changes something
      //
      while (TRUE)
      {
         int nOld = nQty;

         PAL_ClearKeyState();
         PAL_ProcessEvent();

         if (g_InputState.dwKeyPress & kKeyMenu)
         {
            PAL_DeleteBox(lpBox);
            VIDEO_UpdateScreen(&rect);
            return;
         }
         else if (g_InputState.dwKeyPress & kKeySearch)
         {
            if (nQty > 0)
            {
               if (PAL_AddItemToInventory(wObject, nQty))
               {
                  gpGlobals->dwCash -= (DWORD)wPrice * (DWORD)nQty;
               }
            }
            PAL_DeleteBox(lpBox);
            VIDEO_UpdateScreen(&rect);
            return;
         }
         else if (nMax > 0)
         {
            if (g_InputState.dwKeyPress & kKeyRight) nQty++;
            else if (g_InputState.dwKeyPress & kKeyLeft) nQty--;
            else if (g_InputState.dwKeyPress & (kKeyUp | kKeyPgUp)) nQty += 10;
            else if (g_InputState.dwKeyPress & (kKeyDown | kKeyPgDn)) nQty -= 10;

            if (nQty > nMax) nQty = nMax;
            if (nQty < 1) nQty = 1;
         }

         if (nQty != nOld)
         {
            break;
         }

         SDL_Delay(50);
      }
   }
}
'''

edit('uigame.c', crlf('static BOOL __buymenu_firsttime_render;\n'), crlf('static BOOL __buymenu_firsttime_render;\n'))

# Insert the dialog right before PAL_BuyMenu's definition.
edit('uigame.c', crlf(
    'VOID\n'
    'PAL_BuyMenu(\n'
    '   WORD           wStoreNum\n'
    ')\n'), crlf(DIALOG.lstrip('\n') +
    '\n'
    'VOID\n'
    'PAL_BuyMenu(\n'
    '   WORD           wStoreNum\n'
    ')\n'))

edit('uigame.c', crlf(
    '      if (gpGlobals->g.rgObject[w].item.wPrice <= gpGlobals->dwCash)\n'
    '      {\n'
    '         if (PAL_ConfirmMenu())\n'
    '         {\n'
    '            //\n'
    '            // Player bought an item\n'
    '            //\n'
    '            gpGlobals->dwCash -= gpGlobals->g.rgObject[w].item.wPrice;\n'
    '            PAL_AddItemToInventory(w, 1);\n'
    '         }\n'
    '      }\n'), crlf(
    '      //\n'
    '      // pal98-eng-v3.5: show the item info + quantity dialog (always, so the\n'
    '      // player can inspect items they cannot afford yet).\n'
    '      //\n'
    '      PAL_BuyMenu_PurchaseDialog(w);\n'))

# Notify the page about the highlighted shop item.
edit('uigame.c', crlf(
    '   VIDEO_UpdateScreen(&rect);\n'
    '   \n'
    '   __buymenu_firsttime_render = FALSE;\n'), crlf(
    '   VIDEO_UpdateScreen(&rect);\n'
    '   \n'
    '   __buymenu_firsttime_render = FALSE;\n'
    '\n'
    '   PAL_WebNotifyItemFocus(1, wCurrentItem, 0);\n'))

# Clear the focus when leaving the buy menu (end of PAL_BuyMenu's while loop).
edit('uigame.c', crlf(
    '      for (y = 0; y < i; y++)\n'
    '      {\n'
    '         if (w == rgMenuItem[y].wValue)\n'
    '         {\n'
    '            w = y;\n'
    '            break;\n'
    '         }\n'
    '      }\n'
    '   }\n'
    '}\n'), crlf(
    '      for (y = 0; y < i; y++)\n'
    '      {\n'
    '         if (w == rgMenuItem[y].wValue)\n'
    '         {\n'
    '            w = y;\n'
    '            break;\n'
    '         }\n'
    '      }\n'
    '   }\n'
    '\n'
    '   PAL_WebNotifyItemFocus(0, 0, 0);\n'
    '}\n'))

# 5. itemmenu.c: notify the page about the highlighted inventory item.
edit('itemmenu.c', crlf('static BOOL    g_fNoDesc = FALSE;\n'), crlf(
    'static BOOL    g_fNoDesc = FALSE;\n'
    'static int     g_iWebLastFocus = -1;\n'))

edit('itemmenu.c', crlf(
    '   wObject = gpGlobals->rgInventory[gpGlobals->iCurInvMenuItem].wItem;\n'
    '\n'
    '   //\n'
    '   // Draw the description of the selected item\n'
    '   //\n'), crlf(
    '   wObject = gpGlobals->rgInventory[gpGlobals->iCurInvMenuItem].wItem;\n'
    '\n'
    '   if (g_iWebLastFocus != (int)wObject)\n'
    '   {\n'
    '      g_iWebLastFocus = (int)wObject;\n'
    '      PAL_WebNotifyItemFocus(2, wObject, g_wItemFlags);\n'
    '   }\n'
    '\n'
    '   //\n'
    '   // Draw the description of the selected item\n'
    '   //\n'))

edit('itemmenu.c', crlf(
    '   g_wItemFlags = wItemFlags;\n'
    '\n'
    '   //\n'
    '   // Compress the inventory\n'), crlf(
    '   g_wItemFlags = wItemFlags;\n'
    '   g_iWebLastFocus = -1;\n'
    '\n'
    '   //\n'
    '   // Compress the inventory\n'))

edit('itemmenu.c', crlf(
    '      if (w != 0xFFFF)\n'
    '      {\n'
    '         g_fNoDesc = FALSE;\n'
    '         return w;\n'
    '      }\n'), crlf(
    '      if (w != 0xFFFF)\n'
    '      {\n'
    '         g_fNoDesc = FALSE;\n'
    '         PAL_WebNotifyItemFocus(0, 0, 0);\n'
    '         return w;\n'
    '      }\n'))

# 6. Makefile: export the web entry points.
edit('emscripten/Makefile',
     "-s EXPORTED_FUNCTIONS=\"['_EMSCRIPTEN_main']\"",
     "-s EXPORTED_FUNCTIONS=\"['_EMSCRIPTEN_main','_PAL_WebRequestSave','_PAL_WebInfo']\"")

# 7. global.c: zero the save buffer so identical game states give byte-identical .rpg
#    files (rgwReserved2 and padding were uninitialised malloc memory).
edit('global.c', 'SAVEDGAME_DOS   *s = (SAVEDGAME_DOS*)malloc(sizeof(SAVEDGAME_DOS));',
     'SAVEDGAME_DOS   *s = (SAVEDGAME_DOS*)calloc(1, sizeof(SAVEDGAME_DOS));', count=2)

print('patched OK')

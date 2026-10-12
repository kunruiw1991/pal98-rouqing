/* -*- mode: c; tab-width: 4; c-basic-offset: 4; c-file-style: "linux" -*- */
//
// palweb.c: Browser (Emscripten) integration hooks for the PAL98 Online
// edition (pal98-eng-v3.6).
//
//  * PAL_WebRequestSave(slot): asks the engine to run its own PAL_SaveGame()
//    at the next safe point of the main game loop (free exploration only:
//    never in a battle, a menu, a dialog or a running script).
//  * PAL_WebInfo(what, a, b): read-only accessor used by the web page's
//    Shop & Equipment Inspector.
//  * PAL_WebNotifyItemFocus(ctx, item, flags): tells the page which item is
//    highlighted in the shop / inventory / equip menus.
//  * Street vendors (v3.6). Fruit stalls, sugar-ball sellers, the rice and
//    wine sellers and the paid services (prison visits, the beggar, ...) are
//    plain event scripts: dialog -> 0x000A (Yes/No) -> 0x001E (cash -= price)
//    -> 0x001F (add item). The original game neither showed the price at the
//    Yes/No prompt nor said what was bought. Now:
//      - PAL_WebVendorConfirm() replaces the Yes/No boxes of a 0x000A whose
//        "Yes" branch spends money with a card: item, quantity, price,
//        effect, owned count and cash (or the cost and cash for services).
//      - PAL_WebOnScriptCash() / PAL_WebOnScriptAddItem() recognise a
//        scripted purchase and show "Obtained <item> x<n>" unless the script
//        already opens its own "Obtained ..." window right after it.
//      - Module.onPalVendor(kind, item, qty, amount, extra) keeps the page's
//        inspector in sync.
//  * PAL_WebDebug(what, a, b, c, d): QA hooks (warp to a scene position at the
//    next safe point, set cash, add items).
//
// This file is part of SDLPAL and is distributed under the GNU GPL v3.
//

#include "main.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define PAL_WEB_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define PAL_WEB_EXPORT
#endif

static volatile int g_iWebSaveRequest = 0;

//
// QA warp request (PAL_WebDebug(1, ...)), applied at the next safe point.
//
static int g_iWebWarpScene = 0, g_iWebWarpX = 0, g_iWebWarpY = 0, g_iWebWarpDir = 0;

//
// Main-loop heartbeat: the top of PAL_GameMain's loop is only reached when no
// script, dialog, menu or battle is running.
//
static uint32_t g_dwWebLoopTicks = 0;
static uint32_t g_dwWebLoopFrames = 0;

//
// Street vendor state (pal98-eng-v3.6).
//
#define VENDOR_WORD_NOMONEY          622
#define VENDOR_WORD_BAGFULL          623
#define VENDOR_WORD_PRICE            624
#define VENDOR_WORD_OBTAINED         625
#define VENDOR_WORD_PAID             626
#define VENDOR_WORD_COST             627
#define VENDOR_WORD_CASH             628

#define VENDOR_SCAN_LIMIT            12   // instructions scanned on the "Yes" branch
#define VENDOR_KEY_GUARD_MS          500  // keys ignored right after an "Obtained" window opens
#define VENDOR_PURCHASE_WINDOW       40   // max distance between the payment and the item
#define VENDOR_MAX_DESC              4
#define VENDOR_DESC_CCH              128

#define VENDOR_NOTIFY_PROMPT         1    // card shown: item, qty, cost
#define VENDOR_NOTIFY_PURCHASED      2    // item bought: item, qty, paid, added (1/0)
#define VENDOR_NOTIFY_DECLINED       3    // player answered No
#define VENDOR_NOTIFY_PAID           4    // service paid (no item): cost
#define VENDOR_NOTIFY_SHORT          5    // the script refused: not enough money

static WORD         g_wVendorSpendEntry = 0xFFFF;  // script entry of the last scripted payment
static int          g_nVendorSpendAmount = 0;
static int          g_nVendorPromptCost = 0;       // cost shown on the current vendor card
static WORD         g_wVendorPromptItem = 0;
static BOOL         g_fVendorGuardCenterText = FALSE;

static VOID
PAL_WebVendorReset(
   VOID
)
{
   g_wVendorSpendEntry = 0xFFFF;
   g_nVendorSpendAmount = 0;
   g_nVendorPromptCost = 0;
   g_wVendorPromptItem = 0;
   g_fVendorGuardCenterText = FALSE;
}

static WORD
PAL_WebGetSavedTimes(
   int            iSaveSlot
)
{
   FILE *fp = UTIL_OpenFileAtPath(gConfig.pszSavePath, PAL_va(0, "%d.rpg", iSaveSlot));
   WORD  wSavedTimes = 0;

   if (fp != NULL)
   {
      if (fread(&wSavedTimes, sizeof(WORD), 1, fp) == 1)
         wSavedTimes = SDL_SwapLE16(wSavedTimes);
      else
         wSavedTimes = 0;
      fclose(fp);
   }
   return wSavedTimes;
}

PAL_WEB_EXPORT int
PAL_WebRequestSave(
   int            iSlot
)
{
   if (iSlot < 1 || iSlot > 5)
   {
      return -1;
   }
   g_iWebSaveRequest = iSlot;
   return 0;
}

static BOOL
PAL_WebIsFreeRoam(
   VOID
)
{
   return gpGlobals->fInMainGame && !gpGlobals->fInBattle && !gpGlobals->fEnteringScene &&
      !gpGlobals->fNeedToFadeIn && gpGlobals->wNumScene != 0;
}

static VOID
PAL_WebApplyWarp(
   VOID
)
/*++
  Purpose:

    QA hook: move the party to (g_iWebWarpX, g_iWebWarpY) of scene
    g_iWebWarpScene, the same way script opcodes 0x0046 + 0x0059 do.

--*/
{
   int i, x, y, xOffset, yOffset;
   WORD wDir = (WORD)g_iWebWarpDir;

   //
   // Load the new scene right away: PAL_GameUpdate() runs the scene's enter
   // script and redraws the map in this very frame.
   //
   gpGlobals->wNumScene = (WORD)g_iWebWarpScene;
   gpGlobals->fEnteringScene = TRUE;
   gpGlobals->wLayer = 0;
   PAL_SetLoadFlags(kLoadScene);
   PAL_LoadResources();

   gpGlobals->wPartyDirection = wDir;

   xOffset = ((wDir == kDirWest || wDir == kDirSouth) ? 16 : -16);
   yOffset = ((wDir == kDirWest || wDir == kDirNorth) ? 8 : -8);

   gpGlobals->viewport = PAL_XY(g_iWebWarpX - PAL_X(gpGlobals->partyoffset),
      g_iWebWarpY - PAL_Y(gpGlobals->partyoffset));

   x = PAL_X(gpGlobals->partyoffset);
   y = PAL_Y(gpGlobals->partyoffset);

   for (i = 0; i < MAX_PLAYABLE_PLAYER_ROLES; i++)
   {
      gpGlobals->rgParty[i].x = x;
      gpGlobals->rgParty[i].y = y;
      gpGlobals->rgParty[i].wFrame = wDir * 3;
      gpGlobals->rgTrail[i].x = x + PAL_X(gpGlobals->viewport);
      gpGlobals->rgTrail[i].y = y + PAL_Y(gpGlobals->viewport);
      gpGlobals->rgTrail[i].wDirection = wDir;

      x += xOffset;
      y += yOffset;
   }

   g_iWebWarpScene = 0;
}

VOID
PAL_WebProcessPendingSave(
   VOID
)
/*++
  Purpose:

    Called at the top of the main game loop (see PAL_GameMain). This is the
    same state in which the player can open the System menu and save, so the
    resulting .rpg is identical to a manual in-game save.

    No script is running at this point, so the per-script street vendor state
    is cleared here too.

--*/
{
   int    iSlot = g_iWebSaveRequest;
   WORD   wSavedTimes = 0;
   int    i;

   PAL_WebVendorReset();
   g_dwWebLoopTicks = (uint32_t)SDL_GetTicks();
   g_dwWebLoopFrames++;

   if (g_iWebWarpScene != 0 && PAL_WebIsFreeRoam())
   {
      PAL_WebApplyWarp();
      return;
   }

   if (iSlot == 0)
   {
      return;
   }

   //
   // Keep the request pending until the party is back in free exploration.
   //
   if (!PAL_WebIsFreeRoam())
   {
      return;
   }

   g_iWebSaveRequest = 0;

   for (i = 1; i <= 5; i++)
   {
      WORD w = PAL_WebGetSavedTimes(i);
      if (w > wSavedTimes)
      {
         wSavedTimes = w;
      }
   }
   wSavedTimes++;

   PAL_SaveGame(iSlot, wSavedTimes);

#ifdef __EMSCRIPTEN__
   EM_ASM({
      if (Module['onPalSaved']) { try { Module['onPalSaved']($0, $1); } catch (e) { console.warn(e); } }
   }, iSlot, wSavedTimes);
#endif
}

PAL_WEB_EXPORT int
PAL_WebInfo(
   int            what,
   int            a,
   int            b
)
{
   WORD *p;

   switch (what)
   {
   case 1:  // cash
      return (int)gpGlobals->dwCash;
   case 2:  // current scene number
      return gpGlobals->wNumScene;
   case 3:  // in battle?
      return gpGlobals->fInBattle ? 1 : 0;
   case 4:  // number of party members
      return gpGlobals->wMaxPartyMemberIndex + 1;
   case 5:  // party member a -> player role
      if (a < 0 || a > gpGlobals->wMaxPartyMemberIndex) return -1;
      return gpGlobals->rgParty[a].wPlayerRole;
   case 6:  // raw PLAYERROLES field: a = role, b = field index (WORD[MAX_PLAYER_ROLES] arrays)
      if (a < 0 || a >= MAX_PLAYER_ROLES || b < 0 || b >= (int)(sizeof(PLAYERROLES) / sizeof(PLAYERS))) return -1;
      p = (WORD *)(&gpGlobals->g.PlayerRoles);
      return p[b * MAX_PLAYER_ROLES + a];
   case 7:  // equipment effect: a = role, b = part * 100 + attribute index
      if (a < 0 || a >= MAX_PLAYER_ROLES || b < 0 || b / 100 > MAX_PLAYER_EQUIPMENTS ||
         b % 100 >= (int)(sizeof(PLAYERROLES) / sizeof(PLAYERS))) return -1;
      p = (WORD *)(&gpGlobals->rgEquipmentEffect[b / 100]);
      return (SHORT)p[(b % 100) * MAX_PLAYER_ROLES + a];
   case 8:  // amount of item a in the inventory
      return PAL_GetItemAmount((WORD)a);
   case 9:  // effective stat of role a: b = 0 STR, 1 INT, 2 DEF, 3 AGI, 4 LUK
      if (a < 0 || a >= MAX_PLAYER_ROLES) return -1;
      switch (b)
      {
      case 0: return PAL_GetPlayerAttackStrength((WORD)a);
      case 1: return PAL_GetPlayerMagicStrength((WORD)a);
      case 2: return PAL_GetPlayerDefense((WORD)a);
      case 3: return PAL_GetPlayerDexterity((WORD)a);
      case 4: return PAL_GetPlayerFleeRate((WORD)a);
      }
      return -1;
   case 10: // pending web save slot (0 = none)
      return g_iWebSaveRequest;
   case 11: // in main game (past the title screen)
      return gpGlobals->fInMainGame ? 1 : 0;
   case 12: // current save slot (0 = new game, else the slot last loaded/saved manually)
      return gpGlobals->bCurrentSaveSlot;
   case 13: // party leader position on the map: a = 0 -> x, 1 -> y
      return (a == 0) ? PAL_X(gpGlobals->viewport) + PAL_X(gpGlobals->partyoffset) :
         PAL_Y(gpGlobals->viewport) + PAL_Y(gpGlobals->partyoffset);
   case 14: // party direction (0 south, 1 west, 2 north, 3 east)
      return gpGlobals->wPartyDirection;
   case 15: // free exploration right now (main loop running, no script/dialog/menu/battle)
      return (PAL_WebIsFreeRoam() && (uint32_t)SDL_GetTicks() - g_dwWebLoopTicks < 300) ? 1 : 0;
   case 16: // event object a (1-based): b = 0 x, 1 y, 2 state, 3 trigger script, 4 trigger mode
      if (a < 1 || a > gpGlobals->g.nEventObject) return -1;
      {
         LPEVENTOBJECT e = &gpGlobals->g.lprgEventObject[a - 1];
         switch (b)
         {
         case 0: return e->x;
         case 1: return e->y;
         case 2: return e->sState;
         case 3: return e->wTriggerScript;
         case 4: return e->wTriggerMode;
         }
      }
      return -1;
   case 17: // main loop frames so far
      return (int)g_dwWebLoopFrames;
   }

   return -1;
}

PAL_WEB_EXPORT int
PAL_WebDebug(
   int            what,
   int            a,
   int            b,
   int            c,
   int            d
)
/*++
  Purpose:

    QA hooks used by the page's PAL98.qa helpers.

    what = 1: warp to scene a, party leader at map pixel (b, c), facing d
              (0 south, 1 west, 2 north, 3 east), at the next safe point.
    what = 2: set the cash to a.
    what = 3: add a x b to the inventory (negative b removes).
    what = 4: set the trigger script of event object a (1-based) to entry b.

--*/
{
   switch (what)
   {
   case 1:
      if (a <= 0 || a > MAX_SCENES || b < 0 || c < 0) return -1;
      g_iWebWarpScene = a;
      g_iWebWarpX = b;
      g_iWebWarpY = c;
      g_iWebWarpDir = d & 3;
      return 0;
   case 2:
      if (a < 0) return -1;
      gpGlobals->dwCash = (DWORD)a;
      return 0;
   case 3:
      if (a <= 0 || a >= MAX_OBJECTS || b == 0) return -1;
      return PAL_AddItemToInventory((WORD)a, b);
   case 4:
      if (a < 1 || a > gpGlobals->g.nEventObject || b < 0 || b >= gpGlobals->g.nScriptEntry) return -1;
      gpGlobals->g.lprgEventObject[a - 1].wTriggerScript = (WORD)b;
      return 0;
   }
   return -1;
}

VOID
PAL_WebNotifyItemFocus(
   int            ctx,
   int            item,
   int            flags
)
{
#ifdef __EMSCRIPTEN__
   EM_ASM({
      if (Module['onPalItemFocus']) { try { Module['onPalItemFocus']($0, $1, $2); } catch (e) { console.warn(e); } }
   }, ctx, item, flags);
#else
   (void)ctx; (void)item; (void)flags;
#endif
}

// ---------------------------------------------------------------------------
// Street vendors (pal98-eng-v3.6)
// ---------------------------------------------------------------------------

static VOID
PAL_WebNotifyVendor(
   int            kind,
   int            item,
   int            qty,
   int            amount,
   int            extra
)
{
#ifdef __EMSCRIPTEN__
   EM_ASM({
      if (Module['onPalVendor']) { try { Module['onPalVendor']($0, $1, $2, $3, $4); } catch (e) { console.warn(e); } }
   }, kind, item, qty, amount, extra);
#else
   (void)kind; (void)item; (void)qty; (void)amount; (void)extra;
#endif
}

static LPCWSTR
PAL_WebWord(
   int            iWord,
   LPCWSTR        lpszFallback
)
{
   LPCWSTR lpsz = PAL_GetWord(iWord);
   return (lpsz != NULL && *lpsz) ? lpsz : lpszFallback;
}

static int
PAL_WebTextWidth(
   LPCWSTR        lpsz
)
{
   int w = 0;

   while (lpsz != NULL && *lpsz)
   {
      if (*lpsz == L'\\' && lpsz[1] != L'\0')
      {
         lpsz++;     // escaped character: the backslash is not drawn
      }
      w += PAL_CharWidth((uint16_t)*lpsz++);
   }
   return w;
}

static int
PAL_WebVendorDescLines(
   WORD           wItem,
   WCHAR          rgszLines[VENDOR_MAX_DESC][VENDOR_DESC_CCH],
   int            nMaxLines,
   int            iMaxWidth
)
/*++
  Purpose:

    Split the item description into at most nMaxLines lines. If there are more
    '*'-separated segments than lines, segments are joined from the end, since
    the effect ("Recover 22 HP and MP", "HPMP+22") always comes last.

  Return value:

    Number of lines written.

--*/
{
   WCHAR          szDesc[512], szCur[VENDOR_DESC_CCH], szTmp[VENDOR_DESC_CCH];
   WCHAR          rgszRev[VENDOR_MAX_DESC][VENDOR_DESC_CCH];
   LPWSTR         rgSeg[8], p;
   LPCWSTR        d;
   int            nSeg = 0, nOut = 0, i;

   if (nMaxLines <= 0 || gpGlobals->lpObjectDesc == NULL)
   {
      return 0;
   }
   if (nMaxLines > VENDOR_MAX_DESC)
   {
      nMaxLines = VENDOR_MAX_DESC;
   }

   d = PAL_GetObjectDesc(gpGlobals->lpObjectDesc, wItem);
   if (d == NULL || *d == L'\0')
   {
      return 0;
   }

   wcsncpy(szDesc, d, 511);
   szDesc[511] = L'\0';
   p = szDesc;
   while (p != NULL && nSeg < 8)
   {
      LPWSTR next = wcschr(p, L'*');
      if (next != NULL) *next++ = L'\0';
      if (*p) rgSeg[nSeg++] = p;
      p = next;
   }

   if (nSeg <= nMaxLines)
   {
      for (i = 0; i < nSeg; i++)
      {
         wcsncpy(rgszLines[i], rgSeg[i], VENDOR_DESC_CCH - 1);
         rgszLines[i][VENDOR_DESC_CCH - 1] = L'\0';
      }
      return nSeg;
   }

   szCur[0] = L'\0';
   for (i = nSeg - 1; i >= 0 && nOut < nMaxLines; i--)
   {
      if (szCur[0] == L'\0')
      {
         wcsncpy(szCur, rgSeg[i], VENDOR_DESC_CCH - 1);
         szCur[VENDOR_DESC_CCH - 1] = L'\0';
      }
      else if (PAL_WebTextWidth(rgSeg[i]) + 8 + PAL_WebTextWidth(szCur) <= iMaxWidth &&
         wcslen(rgSeg[i]) + 1 + wcslen(szCur) < VENDOR_DESC_CCH)
      {
         PAL_swprintf(szTmp, VENDOR_DESC_CCH, L"%ls %ls", rgSeg[i], szCur);
         wcscpy(szCur, szTmp);
      }
      else
      {
         wcscpy(rgszRev[nOut++], szCur);
         wcsncpy(szCur, rgSeg[i], VENDOR_DESC_CCH - 1);
         szCur[VENDOR_DESC_CCH - 1] = L'\0';
      }
   }
   if (szCur[0] != L'\0' && nOut < nMaxLines)
   {
      wcscpy(rgszRev[nOut++], szCur);
   }

   for (i = 0; i < nOut; i++)
   {
      wcscpy(rgszLines[i], rgszRev[nOut - 1 - i]);
   }
   return nOut;
}

static BOOL
PAL_WebVendorScan(
   WORD           wEntry,
   int           *pnCost,
   WORD          *pwItem,
   int           *pnQty
)
/*++
  Purpose:

    Look at the "Yes" branch of a 0x000A prompt (starting at wEntry) for a
    payment (0x001E with a negative amount) and an item grant (0x001F).
    Dialog lines and plain jumps are skipped; anything that leaves the script
    (end, call, battle, shop, scene change, another prompt) stops the scan.

  Return value:

    TRUE if the branch spends money.

--*/
{
   int nSteps = 0;

   *pnCost = 0;
   *pwItem = 0;
   *pnQty = 0;

   while (nSteps++ < VENDOR_SCAN_LIMIT && wEntry != 0 && wEntry < gpGlobals->g.nScriptEntry)
   {
      LPSCRIPTENTRY p = &gpGlobals->g.lprgScriptEntry[wEntry];
      SHORT         s0 = (SHORT)p->rgwOperand[0];

      switch (p->wOperation)
      {
      case 0x0000: case 0x0001: case 0x0002: case 0x0004: case 0x0006: case 0x0007:
      case 0x000A: case 0x0026: case 0x0027: case 0x0059:
         return *pnCost > 0;

      case 0x0003:
         if (p->rgwOperand[1] != 0)
         {
            return *pnCost > 0;
         }
         wEntry = p->rgwOperand[0];
         continue;

      case 0x001E:
         if (s0 < 0)
         {
            //
            // "-X then +X" only checks that the party owns X (no payment).
            //
            if (wEntry + 1 < gpGlobals->g.nScriptEntry && p[1].wOperation == 0x001E &&
               (SHORT)p[1].rgwOperand[0] > 0)
            {
               wEntry += 2;
               continue;
            }
            if (*pnCost == 0)
            {
               *pnCost = -s0;
            }
         }
         break;

      case 0x001F:
         if (*pwItem == 0 && p->rgwOperand[0] != 0 && (SHORT)p->rgwOperand[1] >= 0)
         {
            *pwItem = p->rgwOperand[0];
            *pnQty = ((SHORT)p->rgwOperand[1] > 0) ? (SHORT)p->rgwOperand[1] : 1;
         }
         break;
      }

      if (*pnCost > 0 && *pwItem != 0)
      {
         break;
      }
      wEntry++;
   }

   return *pnCost > 0;
}

static BOOL
PAL_WebVendorCard(
   int            nCost,
   WORD           wItem,
   int            nQty,
   int            yTop,
   int            yBottom
)
/*++
  Purpose:

    Draw the vendor card inside [yTop, yBottom) and let the player choose
    No/Yes on it (No is the default, like the original Yes/No boxes).

  Return value:

    TRUE if the player chose Yes.

--*/
{
   const BOOL     fItem = (wItem != 0);
   const int      cols = fItem ? 15 : 10;
   const int      boxW = 22 + 16 * cols + 22;
   const int      x = (320 - boxW - 6) / 2;
   const int      xText = x + 16;
   const int      xRight = x + boxW - 18;
   const BOOL     fShort = (gpGlobals->dwCash < (DWORD)nCost);
   WCHAR          rgszDesc[VENDOR_MAX_DESC][VENDOR_DESC_CCH];
   WCHAR          szQty[16];
   int            nDesc = 0, nRows, boxH, y, ty, i, avail;
   LPBOX          lpBox;
   SDL_Rect       rect;
   MENUITEM       rgMenu[2];
   WORD           wRet;

   avail = yBottom - yTop;

   if (fItem)
   {
      //
      // 12 (top) + 18 (name) + 16 * nDesc + 2 + 18 (have/cash) + 16 (menu) + 14 (bottom)
      //
      int nWant = 0, nFit = 1, n;
      WCHAR rgszAll[VENDOR_MAX_DESC][VENDOR_DESC_CCH];

      nWant = PAL_WebVendorDescLines(wItem, rgszAll, VENDOR_MAX_DESC, xRight - xText);
      for (n = 1; n <= VENDOR_MAX_DESC; n++)
      {
         int r = (38 + 16 * n + 17) / 18;
         if (42 + 18 * r + 6 <= avail) nFit = n;
      }
      nDesc = PAL_WebVendorDescLines(wItem, rgszDesc, (nWant < nFit) ? nWant : nFit, xRight - xText);
      nRows = (38 + 16 * ((nDesc > 0) ? nDesc : 1) + 17) / 18;
   }
   else
   {
      nRows = 2;     // cost, cash, menu
   }

   boxH = 42 + 18 * nRows;
   y = yTop + (avail - boxH - 6) / 2;
   if (y + boxH + 6 > 200) y = 200 - boxH - 6;
   if (y < 0) y = 0;

   rect.x = x;
   rect.y = y;
   rect.w = boxW + 6;
   rect.h = boxH + 6;

   lpBox = PAL_CreateBoxWithShadow(PAL_XY(x, y), nRows, cols, 1, TRUE, 6);

   ty = y + 12;
   if (fItem)
   {
      LPCWSTR lpszName = PAL_GetWord(wItem);

      PAL_DrawText(lpszName, PAL_XY(xText, ty), MENUITEM_COLOR_CONFIRMED, TRUE, FALSE, FALSE);
      PAL_swprintf(szQty, 16, L"\x00D7%d", nQty);
      PAL_DrawText(szQty, PAL_XY(xText + PAL_WebTextWidth(lpszName) + 4, ty), MENUITEM_COLOR, TRUE, FALSE, FALSE);
      PAL_DrawText(PAL_WebWord(VENDOR_WORD_PRICE, L"Price"), PAL_XY(xRight - 104, ty), MENUITEM_COLOR, TRUE, FALSE, FALSE);
      PAL_DrawNumber(nCost, 6, PAL_XY(xRight - 36, ty + 5), kNumColorYellow, kNumAlignRight);
      ty += 18;

      for (i = 0; i < nDesc; i++)
      {
         PAL_DrawText(rgszDesc[i], PAL_XY(xText, ty), DESCTEXT_COLOR, TRUE, FALSE, FALSE);
         ty += 16;
      }
      if (nDesc == 0) ty += 16;
      ty += 2;

      PAL_DrawText(PAL_GetWord(BUYMENU_LABEL_CURRENT), PAL_XY(xText, ty), MENUITEM_COLOR, TRUE, FALSE, FALSE);
      PAL_DrawNumber(PAL_GetItemAmount(wItem), 2, PAL_XY(xText + 60, ty + 5), kNumColorCyan, kNumAlignRight);
   }
   else
   {
      PAL_DrawText(PAL_WebWord(VENDOR_WORD_COST, L"Cost"), PAL_XY(xText, ty), MENUITEM_COLOR, TRUE, FALSE, FALSE);
      PAL_DrawNumber(nCost, 6, PAL_XY(xRight - 36, ty + 5), kNumColorYellow, kNumAlignRight);
      ty += 18;
   }

   PAL_DrawText(PAL_WebWord(VENDOR_WORD_CASH, PAL_GetWord(CASH_LABEL)),
      PAL_XY(fItem ? xRight - 104 : xText, ty), MENUITEM_COLOR, TRUE, FALSE, FALSE);
   PAL_DrawNumber(gpGlobals->dwCash, 6, PAL_XY(xRight - 36, ty + 5), kNumColorYellow, kNumAlignRight);
   ty += 18;

   if (fShort)
   {
      PAL_DrawText(PAL_WebWord(VENDOR_WORD_NOMONEY, L"No money"), PAL_XY(xText, ty), 0x1A, TRUE, FALSE, FALSE);
   }

   VIDEO_UpdateScreen(&rect);

   //
   // No / Yes, in the same order (and with the same default) as PAL_ConfirmMenu.
   //
   rgMenu[0].wValue = 0;
   rgMenu[0].wNumWord = CONFIRMMENU_LABEL_NO;
   rgMenu[0].fEnabled = TRUE;
   rgMenu[0].pos = PAL_XY(xRight - 80, ty);
   rgMenu[1].wValue = 1;
   rgMenu[1].wNumWord = CONFIRMMENU_LABEL_YES;
   rgMenu[1].fEnabled = TRUE;
   rgMenu[1].pos = PAL_XY(xRight - 36, ty);

   wRet = PAL_ReadMenu(NULL, rgMenu, 2, 0, MENUITEM_COLOR);

   PAL_DeleteBox(lpBox);
   VIDEO_UpdateScreen(&rect);

   return (wRet == 1) ? TRUE : FALSE;
}

BOOL
PAL_WebVendorConfirm(
   WORD           wScriptEntry
)
/*++
  Purpose:

    Replacement for "PAL_ClearDialog(FALSE); PAL_ConfirmMenu()" in script
    opcode 0x000A. Plain Yes/No questions are unchanged; a question whose Yes
    branch spends money gets the vendor card instead.

  Parameters:

    [IN]  wScriptEntry - the 0x000A instruction.

  Return value:

    TRUE if the player chose Yes.

--*/
{
   const BYTE     bPos = g_TextLib.bDialogPosition;
   const int      nLines = g_TextLib.nCurrentDialogLine;
   const int      yText = PAL_Y(g_TextLib.posDialogText);
   const int      yTitle = PAL_Y(g_TextLib.posDialogTitle);
   int            nCost, nQty, yTop = 0, yBottom = 200;
   WORD           wItem;
   BOOL           fYes;

   PAL_ClearDialog(FALSE);

   if (gpGlobals->fInBattle || !PAL_WebVendorScan((WORD)(wScriptEntry + 1), &nCost, &wItem, &nQty))
   {
      return PAL_ConfirmMenu();
   }

   //
   // Keep the question that is still on screen readable.
   //
   if (nLines > 0)
   {
      if (bPos == kDialogLower)
      {
         yBottom = yTitle - 2;
      }
      else if (bPos == kDialogUpper || bPos == kDialogCenter)
      {
         yTop = yText + 18 * nLines + 2;
      }
   }

   g_nVendorPromptCost = nCost;
   g_wVendorPromptItem = wItem;
   PAL_WebNotifyVendor(VENDOR_NOTIFY_PROMPT, wItem, nQty, nCost, 0);

   fYes = PAL_WebVendorCard(nCost, wItem, nQty, yTop, yBottom);

   if (!fYes)
   {
      g_nVendorPromptCost = 0;
      g_wVendorPromptItem = 0;
      PAL_WebNotifyVendor(VENDOR_NOTIFY_DECLINED, wItem, nQty, nCost, 0);
   }
   return fYes;
}

VOID
PAL_WebOnScriptCash(
   WORD           wScriptEntry,
   int            iDelta,
   BOOL           fApplied
)
/*++
  Purpose:

    Called by script opcode 0x001E. Remembers scripted payments so that the
    next 0x001F of the same script can be recognised as a purchase.

--*/
{
   if (iDelta < 0)
   {
      if (fApplied)
      {
         g_wVendorSpendEntry = wScriptEntry;
         g_nVendorSpendAmount = -iDelta;

         if (g_nVendorPromptCost > 0 && g_wVendorPromptItem == 0)
         {
            PAL_WebNotifyVendor(VENDOR_NOTIFY_PAID, 0, 0, -iDelta, 0);
            g_nVendorPromptCost = 0;
         }
      }
      else if (g_nVendorPromptCost > 0)
      {
         PAL_WebNotifyVendor(VENDOR_NOTIFY_SHORT, g_wVendorPromptItem, 0, -iDelta, 0);
         g_nVendorPromptCost = 0;
         g_wVendorPromptItem = 0;
      }
   }
   else if (iDelta > 0)
   {
      //
      // Money coming back (e.g. "-X, +X" to test that the party owns X).
      //
      g_wVendorSpendEntry = 0xFFFF;
      g_nVendorSpendAmount = 0;
   }
}

static BOOL
PAL_WebIsScriptPurchase(
   WORD           wAddEntry
)
{
   WORD w;

   if (g_wVendorSpendEntry == 0xFFFF || wAddEntry <= g_wVendorSpendEntry ||
      wAddEntry - g_wVendorSpendEntry > VENDOR_PURCHASE_WINDOW)
   {
      return FALSE;
   }

   //
   // The payment and the item must belong to the same script (no end in between).
   //
   for (w = g_wVendorSpendEntry + 1; w < wAddEntry; w++)
   {
      WORD op = gpGlobals->g.lprgScriptEntry[w].wOperation;
      if (op == 0x0000 || op == 0x0001 || op == 0x0002)
      {
         return FALSE;
      }
   }
   return TRUE;
}

static VOID
PAL_WebVendorObtainedPopup(
   WORD           wItem,
   int            nQty,
   int            nPaid,
   BOOL           fAdded
)
/*++
  Purpose:

    Centered "Obtained <item> x<n>" window with the amount paid, the new owned
    count and the cash left. Closes on a key press (ignored for the first
    0.5 s so that the Enter used to answer Yes does not skip it) or after 3.5 s.

--*/
{
   const int      cols = 15, boxW = 22 + 16 * cols + 22, boxH = 42 + 18;
   const int      x = (320 - boxW - 6) / 2, y = 70;
   const int      xText = x + 16, xRight = x + boxW - 18;
   LPCWSTR        lpszLabel = fAdded ? PAL_WebWord(VENDOR_WORD_OBTAINED, L"Obtained") :
                                       PAL_WebWord(VENDOR_WORD_BAGFULL, L"Bag full");
   LPCWSTR        lpszName = PAL_GetWord(wItem);
   WCHAR          szQty[16];
   int            ty, wLabel, wName, wQty, xStart;
   uint32_t       t0;
   LPBOX          lpBox;
   SDL_Rect       rect;

   rect.x = x;
   rect.y = y;
   rect.w = boxW + 6;
   rect.h = boxH + 6;

   lpBox = PAL_CreateBoxWithShadow(PAL_XY(x, y), 1, cols, 1, TRUE, 6);

   PAL_swprintf(szQty, 16, L"\x00D7%d", nQty);
   wLabel = PAL_WebTextWidth(lpszLabel);
   wName = PAL_WebTextWidth(lpszName);
   wQty = PAL_WebTextWidth(szQty);
   xStart = x + (boxW - (wLabel + 8 + wName + 4 + wQty)) / 2;
   if (xStart < xText) xStart = xText;

   ty = y + 12;
   PAL_DrawText(lpszLabel, PAL_XY(xStart, ty), fAdded ? MENUITEM_COLOR : 0x1A, TRUE, FALSE, FALSE);
   PAL_DrawText(lpszName, PAL_XY(xStart + wLabel + 8, ty), MENUITEM_COLOR_CONFIRMED, TRUE, FALSE, FALSE);
   PAL_DrawText(szQty, PAL_XY(xStart + wLabel + 8 + wName + 4, ty), MENUITEM_COLOR, TRUE, FALSE, FALSE);

   ty += 18;
   PAL_DrawText(PAL_WebWord(VENDOR_WORD_PAID, L"Paid"), PAL_XY(xText, ty), MENUITEM_COLOR, TRUE, FALSE, FALSE);
   PAL_DrawNumber(nPaid, 5, PAL_XY(xText + 40, ty + 5), kNumColorYellow, kNumAlignLeft);
   PAL_DrawText(PAL_GetWord(BUYMENU_LABEL_CURRENT), PAL_XY(x + 112, ty), MENUITEM_COLOR, TRUE, FALSE, FALSE);
   PAL_DrawNumber(PAL_GetItemAmount(wItem), 2, PAL_XY(x + 152, ty + 5), kNumColorCyan, kNumAlignLeft);
   PAL_DrawText(PAL_WebWord(VENDOR_WORD_CASH, PAL_GetWord(CASH_LABEL)), PAL_XY(xRight - 92, ty), MENUITEM_COLOR, TRUE, FALSE, FALSE);
   PAL_DrawNumber(gpGlobals->dwCash, 6, PAL_XY(xRight - 36, ty + 5), kNumColorYellow, kNumAlignRight);

   VIDEO_UpdateScreen(&rect);

   PAL_ClearKeyState();
   t0 = (uint32_t)SDL_GetTicks();
   while (TRUE)
   {
      uint32_t dt;

      UTIL_Delay(25);
      dt = (uint32_t)SDL_GetTicks() - t0;

      if (dt < VENDOR_KEY_GUARD_MS)
      {
         PAL_ClearKeyState();
         continue;
      }
      if (g_InputState.dwKeyPress != 0 || dt > 3500)
      {
         break;
      }
   }
   PAL_ClearKeyState();

   PAL_DeleteBox(lpBox);
   VIDEO_UpdateScreen(&rect);
}

VOID
PAL_WebOnScriptAddItem(
   WORD           wScriptEntry,
   WORD           wItem,
   int            iNum,
   INT            iResult
)
/*++
  Purpose:

    Called by script opcode 0x001F after PAL_AddItemToInventory(). If the item
    was paid for earlier in the same script, tell the player what they got.

--*/
{
   const int      nQty = (iNum == 0) ? 1 : iNum;
   const BOOL     fAdded = (iResult > 0);
   int            nPaid, n;
   WORD           w;
   BOOL           fNative = FALSE;

   if (nQty < 0 || wItem == 0 || gpGlobals->fInBattle || !PAL_WebIsScriptPurchase(wScriptEntry))
   {
      return;
   }

   nPaid = g_nVendorSpendAmount;
   g_wVendorSpendEntry = 0xFFFF;
   g_nVendorSpendAmount = 0;
   g_nVendorPromptCost = 0;
   g_wVendorPromptItem = 0;

   PAL_WebNotifyVendor(VENDOR_NOTIFY_PURCHASED, wItem, nQty, nPaid, fAdded ? 1 : 0);

   //
   // Does the script open its own "Obtained ..." window (0x003E) right away?
   //
   w = (WORD)(wScriptEntry + 1);
   for (n = 0; n < 6 && w != 0 && w < gpGlobals->g.nScriptEntry; n++)
   {
      LPSCRIPTENTRY p = &gpGlobals->g.lprgScriptEntry[w];

      if (p->wOperation == 0x003E)
      {
         fNative = TRUE;
         break;
      }
      if (p->wOperation == 0x0000 || p->wOperation == 0x0001 || p->wOperation == 0x0002 ||
         p->wOperation == 0x000A)
      {
         break;
      }
      if (p->wOperation == 0x0003 && p->rgwOperand[1] == 0)
      {
         w = p->rgwOperand[0];
         continue;
      }
      w++;
   }

   if (fNative && fAdded)
   {
      //
      // Let that window stay up long enough to be read (see PAL_ShowDialogText).
      //
      g_fVendorGuardCenterText = TRUE;
      return;
   }

   PAL_WebVendorObtainedPopup(wItem, nQty, nPaid, fAdded);
}

FLOAT
PAL_WebCenterTextSeconds(
   FLOAT          flDefault
)
/*++
  Purpose:

    Time-out of a centered message window (PAL_ShowDialogText). Right after a
    scripted purchase that brings its own "Obtained ..." window (the Yuhang
    fruit stall), key presses are ignored for 0.5 s and the window stays up to
    3 s instead of 1.4 s.

--*/
{
   uint32_t t0;

   if (!g_fVendorGuardCenterText)
   {
      return flDefault;
   }
   g_fVendorGuardCenterText = FALSE;

   t0 = (uint32_t)SDL_GetTicks();
   while ((uint32_t)SDL_GetTicks() - t0 < VENDOR_KEY_GUARD_MS)
   {
      UTIL_Delay(25);
   }
   PAL_ClearKeyState();
   return 3.0f;
}

/* -*- mode: c; tab-width: 4; c-basic-offset: 4; c-file-style: "linux" -*- */
//
// palweb.c: Browser (Emscripten) integration hooks for the PAL98 Online
// edition (pal98-eng-v3.5).
//
//  * PAL_WebRequestSave(slot): asks the engine to run its own PAL_SaveGame()
//    at the next safe point of the main game loop (free exploration only:
//    never in a battle, a menu, a dialog or a running script).
//  * PAL_WebInfo(what, a, b): read-only accessor used by the web page's
//    Shop & Equipment Inspector.
//  * PAL_WebNotifyItemFocus(ctx, item, flags): tells the page which item is
//    highlighted in the shop / inventory / equip menus.
//
// This file is part of SDLPAL and is distributed under the GNU GPL v3.
//

#include "main.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>

static volatile int g_iWebSaveRequest = 0;

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

EMSCRIPTEN_KEEPALIVE int
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

VOID
PAL_WebProcessPendingSave(
   VOID
)
/*++
  Purpose:

    Called at the top of the main game loop (see PAL_GameMain). This is the
    same state in which the player can open the System menu and save, so the
    resulting .rpg is identical to a manual in-game save.

--*/
{
   int    iSlot = g_iWebSaveRequest;
   WORD   wSavedTimes = 0;
   int    i;

   if (iSlot == 0)
   {
      return;
   }

   //
   // Keep the request pending until the party is back in free exploration.
   //
   if (!gpGlobals->fInMainGame || gpGlobals->fInBattle || gpGlobals->fEnteringScene ||
      gpGlobals->fNeedToFadeIn || gpGlobals->wNumScene == 0)
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

   EM_ASM({
      if (Module['onPalSaved']) { try { Module['onPalSaved']($0, $1); } catch (e) { console.warn(e); } }
   }, iSlot, wSavedTimes);
}

EMSCRIPTEN_KEEPALIVE int
PAL_WebInfo(
   int            what,
   int            a,
   int            b
)
{
   WORD *p;

   if (gpGlobals == NULL)
   {
      return -1;
   }

   switch (what)
   {
   case 0:  // protocol version
      return 35;
   case 1:  // cash
      return (int)gpGlobals->dwCash;
   case 2:  // scene number
      return gpGlobals->wNumScene;
   case 3:  // in battle
      return gpGlobals->fInBattle ? 1 : 0;
   case 4:  // number of party members
      return gpGlobals->wMaxPartyMemberIndex + 1;
   case 5:  // role of party member a
      if (a < 0 || a > gpGlobals->wMaxPartyMemberIndex || a >= MAX_PLAYABLE_PLAYER_ROLES) return -1;
      return gpGlobals->rgParty[a].wPlayerRole;
   case 6:  // base PLAYERROLES word: a = role, b = attribute index
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
   EM_ASM({
      if (Module['onPalItemFocus']) { try { Module['onPalItemFocus']($0, $1, $2); } catch (e) { console.warn(e); } }
   }, ctx, item, flags);
}

#else

VOID PAL_WebProcessPendingSave(VOID) {}
VOID PAL_WebNotifyItemFocus(int ctx, int item, int flags) { (void)ctx; (void)item; (void)flags; }

#endif

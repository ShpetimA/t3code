import { describe, expect, it } from "vite-plus/test";

import {
  buildThreadTabLifecycleMenuItems,
  dispatchThreadTabLifecycleAction,
  type ThreadTabLifecycleMenuId,
  type ThreadTabLifecycleMenuState,
} from "./threadActionMenu.logic";

const baseState: ThreadTabLifecycleMenuState = {
  isPinned: false,
  isSettled: false,
  isSnoozed: false,
  canSnoozeNow: true,
  canArchiveNow: true,
  closePolicy: "settle-first",
  supports: { settlement: true, snooze: true, pinning: true },
  snoozePresets: [
    {
      id: "hour",
      label: "In 1 hour",
      whenLabel: "3:00 PM",
      snoozedUntil: "2026-08-07T15:00:00Z",
    },
  ],
};

function menuIds(state: ThreadTabLifecycleMenuState): string[] {
  return buildThreadTabLifecycleMenuItems(state).map((item) => item.id);
}

describe("thread tab lifecycle menu", () => {
  it("gates lifecycle actions by capability and current state", () => {
    expect(menuIds(baseState)).toEqual(["pin", "settle", "snooze", "archive"]);
    expect(
      menuIds({
        ...baseState,
        isPinned: true,
        isSettled: true,
        isSnoozed: true,
        closePolicy: "direct",
      }),
    ).toEqual(["unpin", "unsettle", "unsnooze", "archive", "close-tab"]);
    expect(
      menuIds({
        ...baseState,
        supports: {
          settlement: false,
          snooze: false,
          pinning: false,
        },
        closePolicy: "direct",
      }),
    ).toEqual(["archive", "close-tab"]);
  });

  it("uses explicit wording for actions that also close the view", () => {
    expect(
      buildThreadTabLifecycleMenuItems(baseState).map((item) => [item.id, item.label]),
    ).toEqual([
      ["pin", "Pin thread"],
      ["settle", "Settle & close tab"],
      ["snooze", "Snooze & close tab"],
      ["archive", "Archive & close tab"],
    ]);
  });

  it("offers direct close only when the tab is not required by unsettled state", () => {
    expect(menuIds(baseState)).not.toContain("close-tab");
    expect(menuIds({ ...baseState, closePolicy: "direct" })).toContain("close-tab");
  });

  it("keeps snooze presets visible while snoozing is temporarily unavailable", () => {
    const snooze = buildThreadTabLifecycleMenuItems({
      ...baseState,
      canSnoozeNow: false,
    }).find((item) => item.id === "snooze");

    expect(snooze).toMatchObject({ disabled: true });
    expect(snooze?.children?.map((child) => child.id)).toEqual(["snooze:hour"]);
  });

  it("disables archive while a running turn makes it unavailable", () => {
    const archive = buildThreadTabLifecycleMenuItems({
      ...baseState,
      canArchiveNow: false,
    }).find((item) => item.id === "archive");

    expect(archive).toMatchObject({ disabled: true });
  });

  it("treats close tab as a view-only action", async () => {
    const actions: ThreadTabLifecycleMenuId[] = [];
    let closeCount = 0;

    await dispatchThreadTabLifecycleAction({
      action: "close-tab",
      run: async (action) => {
        actions.push(action);
        return true;
      },
      closeTab: () => {
        closeCount += 1;
      },
    });

    expect(actions).toEqual([]);
    expect(closeCount).toBe(1);
  });

  it("closes after successful settle, snooze, and archive actions", async () => {
    const closeCoupledActions = ["settle", "snooze:hour", "archive"] as const;

    for (const action of closeCoupledActions) {
      const actions: ThreadTabLifecycleMenuId[] = [];
      let closeCount = 0;

      await dispatchThreadTabLifecycleAction({
        action,
        run: async (selectedAction) => {
          actions.push(selectedAction);
          return true;
        },
        closeTab: () => {
          closeCount += 1;
        },
      });

      expect(actions).toEqual([action]);
      expect(closeCount).toBe(1);
    }
  });

  it("keeps the tab open when a close-coupled action fails", async () => {
    const closeCoupledActions = ["settle", "snooze:hour", "archive"] as const;

    for (const action of closeCoupledActions) {
      let closeCount = 0;

      await dispatchThreadTabLifecycleAction({
        action,
        run: async () => false,
        closeTab: () => {
          closeCount += 1;
        },
      });

      expect(closeCount).toBe(0);
    }
  });

  it("keeps the tab open after pin, unpin, unsettle, and wake", async () => {
    const viewPreservingActions = ["pin", "unpin", "unsettle", "unsnooze"] as const;

    for (const action of viewPreservingActions) {
      let closeCount = 0;

      await dispatchThreadTabLifecycleAction({
        action,
        run: async () => true,
        closeTab: () => {
          closeCount += 1;
        },
      });

      expect(closeCount).toBe(0);
    }
  });
});

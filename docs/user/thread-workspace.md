# Thread workspace

Each thread owns its own set of workspace tabs for files, terminals, diffs, browser previews, and
agents. Selecting another thread from the sidebar switches both the conversation and those tabs.

## Maximized tabs

Use **Open workspace** in the thread header to enter the full-width tab workspace directly. The
current thread appears as a pinned tab beside the thread's tool tabs. Select the thread tab to return
to the conversation without restoring the split layout. Its compact status indicator mirrors the
sidebar, including working, attention, plan-ready, monitoring, and completion states.

Each editor group has its own tab row. Right-click a file or tool tab and choose **Split Right** or
**Split Down** to keep a second view open, or use **Split & Move** to move it into a new group above,
below, left, or right. Drag the divider to resize groups; double-click it to restore an even split.
Closing the last tab in a group collapses that group automatically. The current thread remains a
single always-available tab and can be moved once another tab remains in its group.

Drag tabs within a tab row to reorder them, or onto another tab row to move or merge them. Drag a
tab over the center of another editor group to swap the two groups. Dropping it on a highlighted
edge moves the tab into a new split on that side. The preview overlay labels the action before the
drop.

Use **Focus View** in an editor group's tab row, or press `mod+shift+enter`, to temporarily let that
group fill the workspace. Repeat the action to restore the complete split layout.

The row below the active tab is contextual. For the thread it contains the usual project, thread,
editor, script, and source-control actions. For a file it shows the file path and file actions.
The group layout, focused group, and split sizes are restored when T3 Code reopens, then reconciled
with the thread's available files, terminals, diffs, previews, and agents.

## Choose the default layout

Open **Settings → General → Thread workspace layout** and choose one of these options:

- **Split panel** keeps the conversation and right panel side by side. This is the default.
- **Maximized tabs** opens each selected thread in the full-width tab workspace with its pinned
  thread tab active.

The selected layout stays in place as you move between threads from the sidebar. The preference
controls the initial layout and can be changed at any time.

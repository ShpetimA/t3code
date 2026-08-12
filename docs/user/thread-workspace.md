# Thread workspace

Each thread owns its own set of workspace tabs for files, terminals, diffs, browser previews, and
agents. Selecting another thread from the sidebar switches both the conversation and those tabs.

In **Settings → General → Thread navigation**, choose **Sidebar** or **Top tabs**. Sidebar remains
the default. Top tabs replace the thread sidebar on desktop-sized windows and keep explicitly opened
threads and app pages in a global strip above the workspace. Opening a thread from search or a
direct link adds it to the strip. Settings uses one tab as you move between sections, and Usage uses
one tab. Pull requests use one list tab and a separate, full-width tab for each review you open.
Closing a top tab only closes that view; it does not settle, archive, delete, close, or merge its
underlying item. Compact windows continue to use the sidebar so every thread state remains
reachable. Closing the final top tab leaves an empty workspace where you can start a thread or open
the command center.

Server-thread tabs also have a thread actions menu. It is always visible on the active tab and
appears when you hover or focus a background tab, so you can pin, settle, snooze, wake, or archive a
thread without opening it first. Actions labeled **Settle & close tab**, **Snooze & close tab**, and
**Archive & close tab** close the view only after the thread action succeeds. The separate close
button and `Cmd/Ctrl+W` remain view-only.

Top tabs show the project icon, thread title, and a compact status indicator for work in progress,
monitoring, pending approval, pending input, failure, a ready plan, or unread completion. Projects
without an icon get a stable colored monogram so their tabs remain recognizable at a glance. Drafts
keep the same tab position when their first message creates the server thread. Drag tabs to reorder
them, use the command center to reopen other threads, and use the plus button to open a new thread,
the pull request list, Usage, or Settings. Pull request tabs similarly distinguish open, draft,
closed, and merged reviews. Settings keeps its section sidebar below the global tab strip.
Hold `Cmd` on macOS or `Ctrl` elsewhere to see the remaining key for each of the first nine open
tabs' `Cmd/Ctrl+1–9` jump shortcut immediately. Keep holding briefly to open every thread tab's info
card for a quick glance; adding another modifier cancels the peek.

On desktop-sized windows, the full-width workspace is the thread view. The current thread appears as
a pinned tab beside its tool tabs. Its compact status indicator mirrors the sidebar, including
working, attention, plan-ready, monitoring, and completion states. Narrow windows keep tools in a
sheet so the conversation remains usable.

Each editor group has its own tab row. Use **Split editor right** in the workspace toolbar to create
an empty group on the right, then choose the surface to open there. Right-click a file or tool tab and
choose **Split Right** or **Split Down** to copy it, or use **Split & Move** to move it into a new or
existing group above, below, left, or right. Drag the divider to resize groups; double-click it to
restore an even split. Closing the last tab in a group collapses that group automatically. The
current thread remains a single always-available tab and can be moved once another tab remains in its
group.

Drag tabs within a tab row to reorder them, or onto another tab row to move them into that group.
Drag a tab over the center of another editor group to swap the two groups. Dropping it on a
highlighted edge moves the tab into a new split on that side. The preview overlay labels the action
before the drop. The same surface can be open once in each group. Moving a surface into a group that
already contains it closes the moved copy and activates the existing tab.

Use **Focus View** in an editor group's tab row, or press `mod+shift+enter`, to temporarily let that
group fill the workspace. Repeat the action to restore the complete split layout.

The row below the active tab is contextual. For the thread it contains the usual project, thread,
editor, script, and source-control actions. For a file it shows the file path and file actions.
The group layout, focused group, and split sizes are restored when T3 Code reopens, then reconciled
with the thread's available files, terminals, diffs, previews, and agents.

On web and desktop, when the current branch has a pull request, **View PR** and the pull request
number beside the branch open that review as a tab in the current thread workspace. Opening it
again activates the existing tab. Review links in the conversation use the same behavior. The
hosting provider remains available from the review's overflow menu when you need its website.

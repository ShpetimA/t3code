import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";

import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { SETTINGS_NAV_ITEMS } from "./SettingsSidebarNav";
import { SETTINGS_SECTION_LABELS } from "./settingsSearch";

const SETTINGS_BREADCRUMB_LABELS: Readonly<Record<string, string>> = {
  ...SETTINGS_SECTION_LABELS,
  "/settings/diagnostics": "Diagnostics",
};

function settingsBreadcrumbLabel(pathname: string): string | null {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return SETTINGS_BREADCRUMB_LABELS[normalizedPathname] ?? null;
}

function SettingsSectionMenu({ sectionLabel }: { readonly sectionLabel: string }) {
  const navigate = useNavigate();

  return (
    <Menu>
      <MenuTrigger className="flex min-h-8 min-w-0 items-center gap-1 rounded-md px-1 text-left outline-none transition-[background-color,color] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent">
        <span className="truncate">{sectionLabel}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup align="start" sideOffset={6} className="min-w-48">
        {SETTINGS_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <MenuItem
              key={item.to}
              onClick={() => void navigate({ to: item.to, hash: "", replace: true })}
            >
              <Icon />
              <span>{item.label}</span>
            </MenuItem>
          );
        })}
      </MenuPopup>
    </Menu>
  );
}

export function SettingsBreadcrumb({
  pathname,
  showSectionMenu = false,
}: {
  readonly pathname: string;
  readonly showSectionMenu?: boolean;
}) {
  const sectionLabel = settingsBreadcrumbLabel(pathname);

  return (
    <WorkspaceBreadcrumb ariaLabel="Settings breadcrumb">
      {sectionLabel ? (
        <>
          <WorkspaceBreadcrumbItem>Settings</WorkspaceBreadcrumbItem>
          <WorkspaceBreadcrumbSeparator />
        </>
      ) : null}
      <WorkspaceBreadcrumbItem current className="truncate">
        {showSectionMenu && sectionLabel ? (
          <SettingsSectionMenu sectionLabel={sectionLabel} />
        ) : (
          (sectionLabel ?? "Settings")
        )}
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  );
}

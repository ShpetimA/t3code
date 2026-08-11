import { useMediaQuery } from "./hooks/useMediaQuery";
import { useThreadNavigationMode } from "./hooks/useSettings";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "./rightPanelLayout";

/** Whether the wide workspace should replace its thread sidebar with global tabs. */
export function useGlobalThreadTabsEnabled(): boolean {
  const navigationMode = useThreadNavigationMode();
  const compactLayout = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  return navigationMode === "tabs" && !compactLayout;
}

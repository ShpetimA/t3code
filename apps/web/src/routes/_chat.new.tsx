import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { GlobalTabsLanding } from "../components/GlobalTabsLanding";
import { useGlobalThreadTabsEnabled } from "../threadNavigationMode";

function NewGlobalTabRouteView() {
  const navigate = useNavigate();
  const globalTabsEnabled = useGlobalThreadTabsEnabled();

  useEffect(() => {
    if (!globalTabsEnabled) void navigate({ to: "/", replace: true });
  }, [globalTabsEnabled, navigate]);

  return globalTabsEnabled ? <GlobalTabsLanding /> : null;
}

export const Route = createFileRoute("/_chat/new")({
  component: NewGlobalTabRouteView,
});

import type { EnvironmentId } from "@t3tools/contracts";
import {
  getProjectFaviconCacheKey,
  isProjectFaviconFallbackUrl,
} from "@t3tools/shared/projectFavicon";
import { FolderIcon } from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";
import { useAssetUrlState } from "../assets/assetUrls";
import { deriveProjectIdentity } from "../projectIdentity";
import { cn } from "~/lib/utils";

const loadedProjectFaviconSrcs = new Map<string, string>();

export function ProjectFavicon(input: {
  environmentId: EnvironmentId;
  cwd: string;
  projectName: string;
  faviconPath?: string | null | undefined;
  className?: string | undefined;
  fallbackIcon?: ComponentType<{ className?: string }>;
}) {
  const state = useProjectFaviconAsset(input);
  const src = state._tag === "Success" ? state.url : null;
  const FallbackIcon = input.fallbackIcon ?? FolderIcon;

  if (!src || isProjectFaviconFallbackUrl(src)) {
    return (
      <ProjectFaviconFallback
        className={input.className}
        icon={FallbackIcon}
        projectName={input.projectName}
      />
    );
  }

  const cacheKey = getProjectFaviconCacheKey(input.environmentId, input.cwd, src);

  return (
    <ProjectFaviconImage
      key={cacheKey}
      cacheKey={cacheKey}
      src={src}
      className={input.className}
      fallbackIcon={FallbackIcon}
      projectName={input.projectName}
    />
  );
}

export function useProjectFaviconAsset(input: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly faviconPath?: string | null | undefined;
}) {
  return useAssetUrlState(input.environmentId, {
    _tag: "project-favicon",
    cwd: input.cwd,
    ...(input.faviconPath ? { path: input.faviconPath } : {}),
  });
}

function ProjectFaviconFallback({
  className,
  icon: Icon,
  projectName,
}: {
  readonly className?: string | undefined;
  readonly icon: ComponentType<{ className?: string }>;
  readonly projectName: string;
}) {
  if (projectName.trim().length === 0) {
    return <Icon className={cn("size-4 shrink-0 text-icon-muted", className)} />;
  }

  const identity = deriveProjectIdentity(projectName);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={cn("size-4 shrink-0 overflow-hidden rounded-[25%] select-none", className)}
      style={{
        backgroundColor: identity.background,
        backgroundImage: `linear-gradient(145deg, ${identity.highlight}, ${identity.background} 72%)`,
      }}
    >
      <text
        x="8"
        y="8.1"
        dominantBaseline="central"
        textAnchor="middle"
        fill="white"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        fontSize="9.25"
        fontWeight="800"
        letterSpacing="0.3"
        textRendering="geometricPrecision"
      >
        {identity.monogram}
      </text>
      <rect
        x="0.5"
        y="0.5"
        width="15"
        height="15"
        rx="3.5"
        fill="none"
        strokeWidth="1"
        className="stroke-black/10 dark:stroke-white/10"
      />
    </svg>
  );
}

function ProjectFaviconImage({
  cacheKey,
  src,
  className,
  fallbackIcon: FallbackIcon,
  projectName,
}: {
  readonly cacheKey: string;
  readonly src: string;
  readonly className?: string | undefined;
  readonly fallbackIcon: ComponentType<{ className?: string }>;
  readonly projectName: string;
}) {
  const [displayedSrc, setDisplayedSrc] = useState<string | null>(
    () => loadedProjectFaviconSrcs.get(cacheKey) ?? null,
  );
  const isLoading = displayedSrc !== src;
  const handleLoadError = (failedSrc: string) => {
    if (loadedProjectFaviconSrcs.get(cacheKey) === failedSrc) {
      loadedProjectFaviconSrcs.delete(cacheKey);
    }
    setDisplayedSrc((currentSrc) => (currentSrc === failedSrc ? null : currentSrc));
  };

  return (
    <>
      {displayedSrc === null ? (
        <ProjectFaviconFallback
          className={className}
          icon={FallbackIcon}
          projectName={projectName}
        />
      ) : null}
      {displayedSrc ? (
        <img
          src={displayedSrc}
          alt=""
          className={cn(
            "size-4 shrink-0 rounded-sm object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10",
            className,
          )}
          onError={() => handleLoadError(displayedSrc)}
        />
      ) : null}
      {isLoading ? (
        <img
          src={src}
          alt=""
          className="hidden"
          onLoad={() => {
            loadedProjectFaviconSrcs.set(cacheKey, src);
            setDisplayedSrc(src);
          }}
          onError={() => handleLoadError(src)}
        />
      ) : null}
    </>
  );
}

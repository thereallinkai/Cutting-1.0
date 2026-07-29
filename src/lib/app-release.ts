import packageManifest from "../../package.json";

export type AppRelease = Readonly<{
  version: string;
  displayVersion: string;
  channel: "alpha" | "beta" | "rc" | "preview" | "stable";
  channelLabel: string;
  displayLabel: string;
  isPrerelease: boolean;
}>;

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

const CHANNEL_LABELS = {
  alpha: "Alpha",
  beta: "Beta",
  rc: "Release candidate",
  preview: "Preview",
  stable: "Stable",
} as const;

export function parseAppRelease(version: string): AppRelease {
  const match = SEMVER_PATTERN.exec(version);
  if (!match) {
    throw new Error(`Invalid application version: ${version}`);
  }

  const prereleaseParts = match[4]?.split(".") ?? [];
  const requestedChannel = prereleaseParts[0]?.toLowerCase();
  const channel: AppRelease["channel"] =
    requestedChannel === "alpha" ||
    requestedChannel === "beta" ||
    requestedChannel === "rc"
      ? requestedChannel
      : prereleaseParts.length
        ? "preview"
        : "stable";
  const iteration =
    channel === "preview"
      ? prereleaseParts.join(".")
      : prereleaseParts.slice(1).join(".");
  const channelLabel = [
    CHANNEL_LABELS[channel],
    iteration ? iteration : null,
  ]
    .filter(Boolean)
    .join(" ");

  return Object.freeze({
    version,
    displayVersion: `v${version}`,
    channel,
    channelLabel,
    displayLabel: `${channelLabel} · v${version}`,
    isPrerelease: prereleaseParts.length > 0,
  });
}

/**
 * package.json is the canonical application version. Runtime labels, tests,
 * release notes, and deployment tags must derive from or match this value.
 */
export const APP_RELEASE = parseAppRelease(packageManifest.version);

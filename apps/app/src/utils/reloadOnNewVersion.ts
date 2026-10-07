import { createPath, type createBrowserRouter } from "react-router";

/**
 * Keep open tabs on the latest deployed version of the app.
 *
 * Each frontend deploy stamps `/version.json` with its commit. We remember the
 * commit this tab loaded, re-check it in the background, and once it changes
 * turn the next navigation into a full page load, so the tab picks up the new
 * build at a moment when nothing is lost. Without this, a tab left open keeps
 * calling the API the way an old build did; the API contract only stays
 * compatible with old builds for a limited time.
 *
 * In local dev there is no `/version.json`, so this does nothing.
 */

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

type Router = ReturnType<typeof createBrowserRouter>;

async function fetchDeployedCommit(): Promise<string | null> {
  try {
    const response = await fetch("/version.json", { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const { sha } = (await response.json()) as { sha?: unknown };
    return typeof sha === "string" && sha !== "" ? sha : null;
  } catch {
    return null;
  }
}

/**
 * Starts watching for new deploys. The returned handle exists for tests: the
 * app ignores it, since the watch lasts for the life of the tab.
 */
export function reloadOnNewVersion(
  router: Router,
  // Swappable so component tests can observe the reload without leaving the page.
  reload: (path: string) => void = (path) => window.location.assign(path),
): {
  /** Resolves once the loaded commit is known (or found to be unavailable). */
  ready: Promise<void>;
  /** Re-checks the deployed commit now. */
  check: () => Promise<void>;
  stop: () => void;
} {
  let loadedCommit: string | null = null;
  let newVersionDeployed = false;
  let stopped = false;
  let interval: ReturnType<typeof setInterval> | undefined;

  async function check() {
    if (!loadedCommit || newVersionDeployed || document.hidden) {
      return;
    }
    const deployed = await fetchDeployedCommit();
    if (deployed && deployed !== loadedCommit) {
      newVersionDeployed = true;
    }
  }

  const ready = fetchDeployedCommit().then((commit) => {
    loadedCommit = commit;
    if (commit && !stopped) {
      interval = setInterval(check, CHECK_INTERVAL_MS);
      document.addEventListener("visibilitychange", check);
    }
  });

  const unsubscribe = router.subscribe((state) => {
    const { location, state: navigationState } = state.navigation;
    if (newVersionDeployed && navigationState === "loading" && location) {
      reload(createPath(location));
    }
  });

  return {
    ready,
    check,
    stop() {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
      unsubscribe();
    },
  };
}

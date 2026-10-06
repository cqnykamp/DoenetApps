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

export function reloadOnNewVersion(router: Router) {
  let loadedCommit: string | null = null;
  let newVersionDeployed = false;

  async function check() {
    if (!loadedCommit || newVersionDeployed || document.hidden) {
      return;
    }
    const deployed = await fetchDeployedCommit();
    if (deployed && deployed !== loadedCommit) {
      newVersionDeployed = true;
    }
  }

  void fetchDeployedCommit().then((commit) => {
    loadedCommit = commit;
    if (commit) {
      setInterval(check, CHECK_INTERVAL_MS);
      document.addEventListener("visibilitychange", check);
    }
  });

  router.subscribe((state) => {
    const { location, state: navigationState } = state.navigation;
    if (newVersionDeployed && navigationState === "loading" && location) {
      window.location.assign(createPath(location));
    }
  });
}

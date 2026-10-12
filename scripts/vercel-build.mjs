/**
 * Vercel build: deploys the Convex backend first (when CONVEX_DEPLOY_KEY is set in Vercel),
 * then builds the site. Without the key, or if the backend deploy fails, it still builds the site
 * so the storefront never goes down because of the backend.
 * Get the key: Convex dashboard → qualified-axolotl-758 → Settings → Deploy key (Production).
 */
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
if (!process.env.CONVEX_DEPLOY_KEY) {
  console.warn("⚠ CONVEX_DEPLOY_KEY not set in Vercel: building the site only, Convex backend NOT updated.");
  run("npx vite build");
} else {
  try {
    run('npx convex deploy --cmd "npx vite build" --cmd-url-env-var-name CONVEX_URL');
  } catch {
    console.error("⚠ Convex backend deploy FAILED (see error above). Building the site without updating the backend.");
    run("npx vite build");
  }
}

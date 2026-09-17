import { PROVIDER } from "./catalog.js";
import { mergeExplicit } from "./provider.js";

/** All catalog writes and locking stay in the host. Never write openclaw.json. */
export async function materializeCatalog(config, snapshot, runtime, ctx = {}) {
  if (snapshot.stale) return { synced: false, reason: "stale" };
  let rows, mode;
  if (typeof runtime.loadPreparedModelCatalog === "function") {
    // September SDK: refresh the published inventory on its real lifecycle owner.
    // Do not create a synthetic config generation in the new atomic runtime.
    rows = await runtime.loadPreparedModelCatalog({ config, readOnly: false, refreshFullCatalog: true,
      ...(ctx.agentId ? { agentId: ctx.agentId } : {}),
      ...(ctx.agentDir ? { agentDir: ctx.agentDir } : {}),
      ...(ctx.workspaceDir ? { workspaceDir: ctx.workspaceDir } : {}),
    });
    mode = "prepared";
  } else if (typeof runtime.loadModelCatalog === "function") {
    // July SDK: the legacy source fingerprint otherwise has no discovery TTL.
    // A temporary config view with the new models lets the official loader own
    // persistence, secret handling and the plugin catalog sidecar. It does not
    // invalidate the separate, private Gateway models.list cache (see research).
    const provider = config.models?.providers?.[PROVIDER];
    const view = { ...config, models: { ...config.models, providers: { ...config.models?.providers,
      [PROVIDER]: { ...provider, baseUrl: snapshot.baseUrl,
        models: snapshot.models.map((model) => mergeExplicit(model, config)) },
    } } };
    rows = await runtime.loadModelCatalog({ config: view, useCache: false });
    mode = "legacy";
  } else throw new Error("This OpenClaw version has no supported catalog publication API");
  const published = new Set(rows.filter((r) => r.provider === PROVIDER).map((r) => r.id));
  if (snapshot.models.some((m) => !published.has(m.id))) throw new Error("OpenClaw did not publish the complete sub2api catalog; sync will retry");
  const allowed = new Set([...snapshot.models, ...(config.models?.providers?.[PROVIDER]?.models ?? [])].map((m) => m.id));
  // The host legitimately retains removed rows while sessions still reference them
  // (2026.9.3+ removeProviderModels semantics). That is not a sync failure: report the
  // leftovers instead of throwing. Throwing here used to abort the whole CLI with
  // "Could not start the CLI", and the retained rows survive every retry by design.
  const retained = [...published].filter((id) => !allowed.has(id));
  return { synced: true, models: snapshot.models.length, revision: snapshot.revision, mode,
    ...(retained.length ? { retained,
      warning: `OpenClaw kept ${retained.length} removed model(s) still referenced by sessions (${retained.join(", ")}); they disappear once references are released and the Gateway restarts.` } : {}),
    ...(mode === "legacy" ? { pickerRefresh: "Existing Gateway models.list caches require a Gateway restart/config reload" } : {}) };
}

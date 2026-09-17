/** Chat-surface command (/sub2api sync) for the TUI, WebUI and messaging channels. */
const USAGE = "Usage: /sub2api sync — refresh and publish the sub2api model catalog.";

const REASONS = {
  unconfigured: "sub2api is not configured; set models.providers.sub2api-provider.baseUrl and credentials first",
  stale: "the sub2api endpoint did not return a fresh catalog; the previous snapshot stays published",
  unchanged: "the catalog is already up to date",
};

export function createSub2apiCommand({ sync }) {
  return {
    name: "sub2api",
    description: "Refresh and publish the sub2api model catalog (/sub2api sync)",
    acceptsArgs: true,
    async handler(ctx) {
      const action = (ctx.args?.trim().split(/\s+/).filter(Boolean)[0] ?? "").toLowerCase();
      if (action !== "sync") return { text: USAGE };
      let result;
      try {
        result = await sync({ config: ctx.config, agentId: ctx.agentId }, true);
      } catch (error) {
        return { text: `sub2api sync failed: ${error?.message ?? error}` };
      }
      if (!result?.synced) {
        return { text: `sub2api sync: not synced (${REASONS[result?.reason] ?? result?.reason ?? "unknown reason"}).` };
      }
      return { text: `sub2api sync: published ${result.models} model(s) (revision ${result.revision ?? "unknown"}, mode ${result.mode}).` };
    },
  };
}

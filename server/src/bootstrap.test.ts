import { describe, expect, it, vi } from "vitest";

import bootstrap from "./bootstrap";

function buildStrapiMock(schemaChanged: boolean) {
  const schemaSetupRun = vi.fn().mockResolvedValue({ schemaChanged });
  const reload = vi.fn();

  const strapi = {
    reload,
    log: { info: vi.fn(), warn: vi.fn() },
    plugin: vi.fn((name: string) => {
      if (name !== "sitetune") throw new Error(`unexpected plugin ${name}`);
      return {
        service: (serviceName: string) => {
          if (serviceName === "schema-setup") return { run: schemaSetupRun };
          throw new Error(`unexpected service ${serviceName}`);
        },
      };
    }),
  };

  return { strapi, schemaSetupRun, reload };
}

describe("bootstrap", () => {
  it("triggers strapi.reload() when schema-setup created components", async () => {
    const { strapi, reload } = buildStrapiMock(true);
    const setImmediateSpy = vi.spyOn(global, "setImmediate");

    await bootstrap({ strapi: strapi as any });

    // Must be deferred (setImmediate), matching the Content-Type Builder's
    // own controller pattern — not called synchronously inline.
    expect(reload).not.toHaveBeenCalled();
    expect(setImmediateSpy).toHaveBeenCalledTimes(1);

    setImmediateSpy.mock.calls[0][0]();
    expect(reload).toHaveBeenCalledTimes(1);

    setImmediateSpy.mockRestore();
  });

  it("does not reload when nothing changed", async () => {
    const { strapi, reload } = buildStrapiMock(false);

    await bootstrap({ strapi: strapi as any });

    expect(reload).not.toHaveBeenCalled();
  });
});

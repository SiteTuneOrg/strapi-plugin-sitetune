import { describe, expect, it, vi } from "vitest";

import bootstrap from "./bootstrap";

function buildStrapiMock({
  schemaSetupResult,
  isReady,
}: {
  schemaSetupResult: { schemaChanged: boolean; needsReload: boolean };
  isReady: boolean;
}) {
  const schemaSetupRun = vi.fn().mockResolvedValue(schemaSetupResult);
  const schemaSetupIsReady = vi.fn().mockReturnValue(isReady);
  const migrationRun = vi.fn().mockResolvedValue(undefined);
  const reload = vi.fn();

  const strapi = {
    reload,
    log: { info: vi.fn(), warn: vi.fn() },
    plugin: vi.fn((name: string) => {
      if (name !== "sitetune") throw new Error(`unexpected plugin ${name}`);
      return {
        service: (serviceName: string) => {
          if (serviceName === "schema-setup") {
            return { run: schemaSetupRun, isReady: schemaSetupIsReady };
          }
          if (serviceName === "seo-migration") return { run: migrationRun };
          throw new Error(`unexpected service ${serviceName}`);
        },
      };
    }),
  };

  return { strapi, schemaSetupRun, schemaSetupIsReady, migrationRun, reload };
}

describe("bootstrap", () => {
  it("triggers strapi.reload() and skips the migration when schema-setup needs a reload", async () => {
    const { strapi, migrationRun, reload } = buildStrapiMock({
      schemaSetupResult: { schemaChanged: true, needsReload: true },
      isReady: false,
    });
    const setImmediateSpy = vi.spyOn(global, "setImmediate");

    await bootstrap({ strapi: strapi as any });

    expect(migrationRun).not.toHaveBeenCalled();
    // Must be deferred (setImmediate), matching the Content-Type Builder's
    // own controller pattern — not called synchronously inline.
    expect(reload).not.toHaveBeenCalled();
    expect(setImmediateSpy).toHaveBeenCalledTimes(1);

    setImmediateSpy.mock.calls[0][0]();
    expect(reload).toHaveBeenCalledTimes(1);

    setImmediateSpy.mockRestore();
  });

  it("skips the migration without reloading when the schema still isn't ready and no change was made this boot", async () => {
    const { strapi, migrationRun, reload } = buildStrapiMock({
      schemaSetupResult: { schemaChanged: false, needsReload: false },
      isReady: false,
    });

    await bootstrap({ strapi: strapi as any });

    expect(reload).not.toHaveBeenCalled();
    expect(migrationRun).not.toHaveBeenCalled();
    expect(strapi.log.warn).toHaveBeenCalled();
  });

  it("runs the migration once the schema is confirmed ready and no change was needed this boot", async () => {
    const { strapi, migrationRun, reload } = buildStrapiMock({
      schemaSetupResult: { schemaChanged: false, needsReload: false },
      isReady: true,
    });

    await bootstrap({ strapi: strapi as any });

    expect(reload).not.toHaveBeenCalled();
    expect(migrationRun).toHaveBeenCalledTimes(1);
  });
});

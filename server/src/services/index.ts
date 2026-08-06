import service from "./service";
import schemaSetup from "./schema-setup";
import redirectValidation from "./redirect-validation";
import { createRedirectImportService } from "./redirect-import";

export default {
  service,
  "schema-setup": schemaSetup,
  "redirect-validation": redirectValidation,
  "redirect-import": createRedirectImportService,
};

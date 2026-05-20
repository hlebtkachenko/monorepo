import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi"
import { z } from "zod"

/**
 * Side-effect-only module. Importing this file calls
 * `extendZodWithOpenApi(z)`, which patches `.openapi(...)` onto every Zod
 * schema. Every file under `packages/shared/src/api/` that calls
 * `.openapi(...)` must import this module *before* any schema is
 * constructed; the actual registry lives in `./registry.ts`, but pulling it
 * in to "just" extend Zod would create a circular load (registry imports
 * the resource files, which import registry to extend Zod).
 */
extendZodWithOpenApi(z)

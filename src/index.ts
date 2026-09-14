/**
 * Entry point GitHub runs.
 *
 * The work lives in main.ts so the tests can import it without the action
 * executing on import.
 */
import { run } from "./main.js";

await run();

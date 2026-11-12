import { createHandler } from "../lib/server/handler.mjs";
import { createStore } from "../lib/server/store.mjs";
export default createHandler({ getStore: () => createStore() });

// @ts-check
import { createSession } from "./quiz.js?v=21";

let session = null;

/** @type {import('../../core/types.js').Mode} */
export default {
  id: "learn",
  async mount(ctx) {
    const s = await createSession(ctx);
    if (ctx.signal.aborted) { s.destroy(); return; }
    session = s;
  },
  unmount() { if (session) { session.destroy(); session = null; } },
  onLangChange() { if (session) session.relang(); },
};

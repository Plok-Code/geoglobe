// @ts-check
// Type definitions only (JSDoc). No runtime code. Gives editor checking for free.

/**
 * @typedef {Object} ModeContext
 * @property {HTMLElement} root      Element the mode owns. Empty on mount, auto-cleared on unmount.
 * @property {HTMLElement} toolbar   Shell toolbar slot for this mode's own controls.
 * @property {(key:string, vars?:Object)=>string} t   Translate a shared chrome key.
 * @property {Object} settings       Persistent prefs: get/set/all/subscribe/modeGet/modeSet.
 * @property {Object} theme          { name, reducedMotion, mapPalette(), onChange }.
 * @property {URLSearchParams} params  Per-mode params parsed from the hash.
 * @property {AbortSignal} signal    Aborts on unmount. Pass to every addEventListener/fetch/timer.
 * @property {Object} router         { navigate(id,params), replace(id,params), current() }.
 * @property {(msg:string, assertive?:boolean)=>void} announce  Speak to screen readers.
 * @property {Object} [engine]       Shared GeoEngine, provided to map modes (later phase).
 */

/**
 * @typedef {Object} Mode
 * @property {string} id
 * @property {(ctx:ModeContext)=>(void|Promise<void>)} mount   Build UI inside ctx.root.
 * @property {()=>void} [unmount]                Optional teardown (root + signal handled by shell).
 * @property {(params:URLSearchParams)=>void} [onParamsChange]  Hash params changed, mode stays mounted.
 * @property {()=>string} [title]                Optional localized title fragment for the header.
 */

export {};

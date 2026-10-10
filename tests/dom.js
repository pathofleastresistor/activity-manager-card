// jsdom + helpers for rendering the card without Home Assistant.
import { after } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost:8123/",
    pretendToBeVisual: true,
});
const { window } = dom;
// Stop jsdom's timers so the test process can exit.
after(() => window.close());

// Expose the jsdom window's globals (Document, Text, NodeFilter, ...) the way a browser would.
for (const key of Object.getOwnPropertyNames(window)) {
    if (key in globalThis || key === "undefined") continue;
    Object.defineProperty(globalThis, key, { get: () => window[key], configurable: true });
}
// Node has its own Event/CustomEvent, which jsdom's dispatchEvent rejects; use jsdom's.
for (const key of ["Event", "CustomEvent"]) {
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
}
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });

// Stand-ins for the HA frontend elements the card lazy-loads, so loadHaComponents() returns at once.
for (const tag of ["ha-form", "ha-icon-picker", "ha-icon", "ha-card", "ha-icon-button", "ha-input"]) {
    if (!window.customElements.get(tag)) window.customElements.define(tag, class extends window.HTMLElement {});
}

// Pin the locale: the card formats relative times with the runtime's default locale.
const RealRTF = Intl.RelativeTimeFormat;
Intl.RelativeTimeFormat = class extends RealRTF {
    constructor(_locale, options) {
        super("en", options);
    }
};

export const NOW = Date.parse("2026-06-15T12:00:00Z");
const WEEK_MS = 7 * 86_400_000;

/** A stored activity that comes due `dueInMs` after NOW (weekly frequency). */
export function activity(id, name, category, dueInMs, extra = {}) {
    return {
        id,
        name,
        category,
        frequency: { days: 7 },
        frequency_ms: WEEK_MS,
        last_completed: new Date(NOW + dueInMs - WEEK_MS).toISOString(),
        icon: "mdi:check",
        entry_id: "entry1",
        list_title: "Home",
        ...extra,
    };
}

const H = 3_600_000;
export const ITEMS = [
    activity("a1", "Run", "Workout", -2 * H),
    activity("a2", "Chest", "Workout", 12 * H),
    activity("a3", "Call parents", "Social", 10 * 24 * H),
    activity("a4", "Dinner", "Social", 30 * H),
];

export function makeHass(items = ITEMS) {
    const calls = [];
    return {
        calls,
        states: {},
        connection: { subscribeEvents: async () => () => {} },
        callWS: async (msg) => {
            calls.push(msg);
            return msg.type === "activity_manager/items" ? items : {};
        },
    };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Mount the card, wait for the first fetch + render, return it. */
export async function mount(config, items = ITEMS) {
    await import("../activity-manager.js");
    const el = document.createElement("activity-manager-card");
    el.setConfig(config);
    el.hass = makeHass(items);
    document.body.appendChild(el);
    await el.updateComplete;
    await tick();
    await el.updateComplete;
    return el;
}

const normalise = (text) => text.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").replace(/> </g, "><").trim();

/** Rendered shadow DOM as a stable string (Lit marker comments, whitespace and <style> removed). */
export function snapshot(el) {
    return normalise(el.shadowRoot.innerHTML.replace(/<style[\s\S]*?<\/style>/g, ""));
}

/** The card's stylesheet text, normalised the same way. */
export function styleText(el) {
    return normalise([...el.shadowRoot.querySelectorAll("style")].map((n) => n.textContent).join("\n"));
}

export { tick };

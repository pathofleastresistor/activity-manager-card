// Guards "existing configs render exactly as before": the golden file was generated from
// the card as it was BEFORE summary mode existed (UPDATE_GOLDEN=1 against that version).
import { test, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { mount, snapshot, styleText, NOW } from "./dom.js";

const GOLDEN = new URL("./fixtures/legacy-render.json", import.meta.url);

// Every pre-existing option, alone and combined. None of these set `mode`.
const CONFIGS = {
    minimal: { entry_id: "entry1" },
    header_icon: { entry_id: "entry1", header: "My Home", icon: "mdi:home" },
    category: { entry_id: "entry1", category: "Workout" },
    show_due_only: { entry_id: "entry1", showDueOnly: true },
    show_due_only_soon_hours_48: { entry_id: "entry1", showDueOnly: true, soonHours: 48 },
    compact: { entry_id: "entry1", compact: true },
    sort_name: { entry_id: "entry1", sortBy: "name" },
    sort_due: { entry_id: "entry1", sortBy: "due" },
    sort_category: { entry_id: "entry1", sortBy: "category" },
    soon_hours_0: { entry_id: "entry1", soonHours: 0 },
    everything: {
        entry_id: "entry1", header: "X", icon: "mdi:star", category: "Social",
        showDueOnly: true, compact: true, soonHours: 48, sortBy: "due",
    },
};

beforeEach(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
afterEach(() => mock.timers.reset());

test("existing configs render exactly as before", async () => {
    const configs = {};
    let css = "";
    for (const [name, config] of Object.entries(CONFIGS)) {
        const el = await mount(config);
        configs[name] = snapshot(el);
        css = styleText(el);
        el.remove();
    }
    if (process.env.UPDATE_GOLDEN) {
        writeFileSync(GOLDEN, JSON.stringify({ css, configs }, null, 2) + "\n");
        return;
    }
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
    assert.deepEqual(Object.keys(configs), Object.keys(golden.configs));
    for (const name of Object.keys(golden.configs)) {
        assert.equal(configs[name], golden.configs[name], `render changed for config "${name}"`);
    }
    // New rules may be appended, but no existing rule may change or be removed.
    assert.ok(css.startsWith(golden.css), "the original stylesheet must be preserved unchanged");
});

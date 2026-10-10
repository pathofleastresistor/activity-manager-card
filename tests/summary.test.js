import { test, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mount, snapshot, makeHass, activity, ITEMS, NOW, tick } from "./dom.js";
import { summarizeActivities, nextTransitionDelay } from "../activity-manager.js";

const H = 3_600_000;
const withDue = (items) => items.map((i) => ({ ...i, due: new Date(Date.parse(i.last_completed) + i.frequency_ms) }));

beforeEach(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
afterEach(() => mock.timers.reset());

const text = (el, sel) => el.shadowRoot.querySelector(sel)?.textContent.trim();
const badges = (el) => [...el.shadowRoot.querySelectorAll(".summary-badge")].map((b) => b.textContent.trim());

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test("summarizeActivities: due includes overdue, next is the earliest due date", () => {
    const s = summarizeActivities(withDue(ITEMS), 24 * H, NOW);
    assert.equal(s.total, 4);
    assert.equal(s.overdueCount, 1);
    assert.equal(s.dueCount, 2);
    assert.deepEqual(s.overdueNames, ["Run"]);
    assert.deepEqual(s.dueNames, ["Run", "Chest"]);
    assert.equal(s.next.name, "Run");
});

test("summarizeActivities: soon window 0 counts only overdue; empty list", () => {
    const s = summarizeActivities(withDue(ITEMS), 0, NOW);
    assert.equal(s.dueCount, 1);
    assert.equal(s.overdueCount, 1);
    const empty = summarizeActivities([], 24 * H, NOW);
    assert.deepEqual([empty.total, empty.dueCount, empty.overdueCount, empty.next], [0, 0, 0, null]);
});

test("nextTransitionDelay: next boundary, or null when nothing will change", () => {
    const items = withDue(ITEMS);
    // Chest is due in 12h, so it enters the 24h soon window now; the next change is Chest overdue at +12h.
    assert.equal(nextTransitionDelay(items, 24 * H, NOW), 6 * H); // Dinner (+30h) enters the window at +6h
    assert.equal(nextTransitionDelay(withDue([activity("x", "Old", "Z", -H)]), 24 * H, NOW), null);
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

test("summary mode renders one tile row with icon, title, due and overdue counts", async () => {
    const el = await mount({ entry_id: "entry1", mode: "summary", category: "Workout", header: "Workout", icon: "mdi:dumbbell" });
    assert.equal(text(el, ".activity-name"), "Workout");
    assert.equal(el.shadowRoot.querySelector(".activity-icon-wrap ha-icon").getAttribute("icon"), "mdi:dumbbell");
    assert.deepEqual(badges(el), ["2 due", "1 overdue"]);
    assert.equal(text(el, ".summary-sub"), "Run, Chest");
    assert.ok(el.shadowRoot.querySelector(".summary-row.status-overdue"));
    // None of the list card's UI.
    assert.equal(el.shadowRoot.querySelector(".activity-list"), null);
    assert.equal(el.shadowRoot.querySelector(".card-header"), null);
    assert.equal(el.shadowRoot.querySelector("ha-icon-button"), null);
});

test("summary mode scopes counts by category and uses the card's soonHours", async () => {
    const social = await mount({ entry_id: "entry1", mode: "summary", category: "Social" });
    assert.deepEqual(badges(social), ["0 due", "0 overdue"]);
    assert.match(text(social, ".summary-sub"), /^Next: Dinner · /);
    assert.ok(social.shadowRoot.querySelector(".summary-row.status-ok"));
    const wide = await mount({ entry_id: "entry1", mode: "summary", category: "Social", soonHours: 48 });
    assert.deepEqual(badges(wide), ["1 due", "0 overdue"]);
    assert.ok(wide.shadowRoot.querySelector(".summary-row.status-soon"));
});

test("summary mode: whole list, default title and icon, empty list", async () => {
    const all = await mount({ entry_id: "entry1", mode: "summary" });
    assert.deepEqual(badges(all), ["2 due", "1 overdue"]);
    assert.equal(text(all, ".activity-name"), "Activities");
    assert.equal(all.shadowRoot.querySelector(".activity-icon-wrap ha-icon").getAttribute("icon"), "mdi:format-list-checkbox");
    const empty = await mount({ entry_id: "entry1", mode: "summary" }, []);
    assert.deepEqual(badges(empty), ["0 due", "0 overdue"]);
    assert.equal(text(empty, ".summary-sub"), "No activities");
});

test("summary mode ignores showDueOnly/compact/sortBy and never writes", async () => {
    const el = await mount({ entry_id: "entry1", mode: "summary", showDueOnly: true, compact: true, sortBy: "name" });
    assert.deepEqual(badges(el), ["2 due", "1 overdue"]);
    el.shadowRoot.querySelector(".summary-row").click();
    await tick();
    assert.deepEqual(el._hass.calls.map((c) => c.type), ["activity_manager/items"]);
});

test("entry_id is still required; unknown mode falls back to the list card", async () => {
    const el = document.createElement("activity-manager-card");
    assert.throws(() => el.setConfig({ mode: "summary" }), /select an activity list/);
    const list = await mount({ entry_id: "entry1", mode: "nonsense" });
    assert.ok(list.shadowRoot.querySelector(".activity-list"));
});

test("layout hints exist only in summary mode", async () => {
    const summary = await mount({ entry_id: "entry1", mode: "summary" });
    assert.equal(summary.getCardSize(), 1);
    assert.deepEqual(summary.getGridOptions().rows, 1);
    const list = await mount({ entry_id: "entry1" });
    assert.equal(list.getCardSize, undefined);
    assert.equal(list.getGridOptions, undefined);
});

// ---------------------------------------------------------------------------
// tap_action
// ---------------------------------------------------------------------------

test("without tap_action the row is inert", async () => {
    const el = await mount({ entry_id: "entry1", mode: "summary" });
    const row = el.shadowRoot.querySelector(".summary-row");
    assert.equal(row.getAttribute("role"), null);
    assert.equal(row.getAttribute("tabindex"), null);
    assert.ok(!row.classList.contains("actionable"));
});

test("tap_action navigate pushes the path and emits location-changed", async () => {
    const el = await mount({ entry_id: "entry1", mode: "summary", tap_action: { action: "navigate", navigation_path: "/lovelace/activities" } });
    const row = el.shadowRoot.querySelector(".summary-row");
    assert.equal(row.getAttribute("role"), "button");
    assert.equal(row.getAttribute("tabindex"), "0");
    let located = 0;
    window.addEventListener("location-changed", () => located++);
    row.click();
    assert.equal(window.location.pathname, "/lovelace/activities");
    assert.equal(located, 1);
});

test("tap_action navigate works from the keyboard (Enter and Space)", async () => {
    const el = await mount({ entry_id: "entry1", mode: "summary", tap_action: { action: "navigate", navigation_path: "/a" } });
    const row = el.shadowRoot.querySelector(".summary-row");
    row.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    assert.equal(window.location.pathname, "/a");
    el._config.tap_action.navigation_path = "/b";
    row.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true }));
    assert.equal(window.location.pathname, "/b");
});

test("tap_action navigate_replace, url, more-info and none", async () => {
    const replaced = await mount({ entry_id: "entry1", mode: "summary", tap_action: { action: "navigate", navigation_path: "/r", navigation_replace: true } });
    const before = window.history.length;
    replaced.shadowRoot.querySelector(".summary-row").click();
    assert.equal(window.location.pathname, "/r");
    assert.equal(window.history.length, before);

    const opened = [];
    const realOpen = window.open;
    window.open = (...args) => opened.push(args);
    const url = await mount({ entry_id: "entry1", mode: "summary", tap_action: { action: "url", url_path: "https://example.com" } });
    url.shadowRoot.querySelector(".summary-row").click();
    window.open = realOpen;
    assert.deepEqual(opened[0].slice(0, 2), ["https://example.com", "_blank"]);

    const info = await mount({ entry_id: "entry1", mode: "summary", tap_action: { action: "more-info", entity: "sensor.home_due" } });
    let detail;
    info.addEventListener("hass-more-info", (e) => (detail = e.detail));
    info.shadowRoot.querySelector(".summary-row").click();
    assert.deepEqual(detail, { entityId: "sensor.home_due" });

    const none = await mount({ entry_id: "entry1", mode: "summary", tap_action: { action: "none" } });
    assert.equal(none.shadowRoot.querySelector(".summary-row").getAttribute("role"), null);
});

// ---------------------------------------------------------------------------
// Live updates
// ---------------------------------------------------------------------------

test("counts refresh by themselves when an activity becomes due or overdue", async () => {
    mock.timers.reset();
    mock.timers.enable({ apis: ["Date", "setTimeout"], now: NOW });
    const el = await mount({ entry_id: "entry1", mode: "summary", category: "Social" });
    assert.deepEqual(badges(el), ["0 due", "0 overdue"]);
    mock.timers.tick(7 * H); // Dinner (+30h) now within the 24h window
    await el.updateComplete;
    assert.deepEqual(badges(el), ["1 due", "0 overdue"]);
    mock.timers.tick(24 * H); // and now past due
    await el.updateComplete;
    assert.deepEqual(badges(el), ["1 due", "1 overdue"]);
});

test("a data event refetches and updates the counts", async () => {
    const el = await mount({ entry_id: "entry1", mode: "summary", category: "Workout" });
    assert.deepEqual(badges(el), ["2 due", "1 overdue"]);
    el._hass.callWS = async () => [activity("a1", "Run", "Workout", 5 * 24 * H)];
    await el._fetchData();
    await el.updateComplete;
    assert.deepEqual(badges(el), ["0 due", "0 overdue"]);
});

test("the refresh timer is cleared when the card is removed", async () => {
    mock.timers.reset();
    mock.timers.enable({ apis: ["Date", "setTimeout"], now: NOW });
    const el = await mount({ entry_id: "entry1", mode: "summary", category: "Social" });
    assert.notEqual(el._tickTimer, null);
    el.remove();
    assert.equal(el._tickTimer, null);
});

test("list mode never starts the refresh timer", async () => {
    mock.timers.reset();
    mock.timers.enable({ apis: ["Date", "setTimeout"], now: NOW });
    const el = await mount({ entry_id: "entry1" });
    assert.equal(el._tickTimer, null);
    assert.equal(el._summary, null);
});

// ---------------------------------------------------------------------------
// Visual editor
// ---------------------------------------------------------------------------

async function mountEditor(config) {
    await import("../activity-manager.js");
    const ed = document.createElement("activity-manager-card-editor");
    ed.setConfig(config);
    const hass = makeHass();
    hass.callWS = async () => [{ entry_id: "entry1", title: "Home" }];
    ed.hass = hass;
    document.body.appendChild(ed);
    await ed.updateComplete;
    await tick();
    await ed.updateComplete;
    return ed;
}
const names = (ed) => ed.shadowRoot.querySelector("ha-form").schema.map((f) => f.name);

test("editor: list mode keeps its original fields and adds the mode selector", async () => {
    const ed = await mountEditor({ entry_id: "entry1" });
    assert.deepEqual(names(ed), ["entry_id", "mode", "category", "header", "icon", "showDueOnly", "compact", "soonHours", "sortBy"]);
});

test("editor: summary mode offers tap_action and hides list-only options", async () => {
    const ed = await mountEditor({ entry_id: "entry1", mode: "summary" });
    assert.deepEqual(names(ed), ["entry_id", "mode", "category", "header", "icon", "tap_action", "soonHours"]);
    const form = ed.shadowRoot.querySelector("ha-form");
    assert.deepEqual(form.schema.find((f) => f.name === "tap_action").selector, { ui_action: {} });
    assert.equal(form.computeLabel({ name: "mode" }), "Display mode");
});

test("editor: choosing List does not write summary keys, so old configs stay unchanged", async () => {
    const ed = await mountEditor({ entry_id: "entry1", header: "Home" });
    let saved;
    ed.addEventListener("config-changed", (e) => (saved = e.detail.config));
    const form = ed.shadowRoot.querySelector("ha-form");
    form.dispatchEvent(new window.CustomEvent("value-changed", { detail: { value: { ...form.data, header: "Renamed" } } }));
    assert.deepEqual(JSON.parse(JSON.stringify(saved)), { entry_id: "entry1", category: null, header: "Renamed" }); // category: null is what the original editor always wrote
    assert.ok(!("mode" in saved) && !("tap_action" in saved));
});

test("editor: switching to summary writes mode and tap_action", async () => {
    const ed = await mountEditor({ entry_id: "entry1" });
    let saved;
    ed.addEventListener("config-changed", (e) => (saved = e.detail.config));
    const form = ed.shadowRoot.querySelector("ha-form");
    const tap = { action: "navigate", navigation_path: "/x" };
    form.dispatchEvent(new window.CustomEvent("value-changed", { detail: { value: { ...form.data, mode: "summary", tap_action: tap } } }));
    assert.equal(saved.mode, "summary");
    assert.deepEqual(saved.tap_action, tap);
});

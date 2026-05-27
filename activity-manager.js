import {
    LitElement,
    html,
    css,
} from "https://unpkg.com/lit@2.8.0/index.js?module";
import { repeat } from "https://unpkg.com/lit@2.8.0/directives/repeat.js?module";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(date) {
    const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const DIVISIONS = [
        { amount: 60, name: "seconds" },
        { amount: 60, name: "minutes" },
        { amount: 24, name: "hours" },
        { amount: 7, name: "days" },
        { amount: 4.34524, name: "weeks" },
        { amount: 12, name: "months" },
        { amount: Number.POSITIVE_INFINITY, name: "years" },
    ];
    let dur = (date - Date.now()) / 1000;
    for (const div of DIVISIONS) {
        if (Math.abs(dur) < div.amount)
            return fmt.format(Math.round(dur), div.name);
        dur /= div.amount;
    }
}

function localDatetimeValue(date = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function datetimeLocalToISO(value) {
    if (!value) return new Date().toISOString();
    const normalised = value.length === 16 ? value + ":00" : value;
    const d = new Date(normalised);
    return isNaN(d) ? new Date().toISOString() : d.toISOString();
}

function getNumber(value, def = 0) {
    const n = parseInt(value, 10);
    return isNaN(n) ? def : n;
}

function statusClass(activity, soonMs) {
    if (activity.difference < 0) return "overdue";
    if (activity.difference < soonMs) return "soon";
    return "ok";
}

// Returns 0–1: how far through the interval (1 = due now, >1 = overdue, clamped to 1 for arc)
function progressFraction(item) {
    if (!item.frequency_ms || item.frequency_ms <= 0) return 0;
    const elapsed = item.frequency_ms - item.difference;
    return Math.max(0, Math.min(1, elapsed / item.frequency_ms));
}

// SVG arc path for a circle progress ring. r = radius, fraction = 0–1.
function arcPath(r, fraction) {
    if (fraction >= 1) {
        // Full circle — two arcs to avoid degenerate path
        return `M ${r} 0 A ${r} ${r} 0 1 1 ${r - 0.001} 0 Z`;
    }
    const angle = fraction * 2 * Math.PI - Math.PI / 2;
    const x = r + r * Math.cos(angle);
    const y = r + r * Math.sin(angle);
    const large = fraction > 0.5 ? 1 : 0;
    return `M ${r} 0 A ${r} ${r} 0 ${large} 1 ${x} ${y}`;
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

class ActivityManagerCard extends LitElement {
    static getConfigElement() {
        return document.createElement("activity-manager-card-editor");
    }

    static getStubConfig() {
        return { entry_id: null, category: null };
    }

    static get properties() {
        return {
            _hass: { attribute: false },
            _config: { attribute: false },
            _activities: { attribute: false },
            // "view" | "manage"
            _panel: { attribute: false },
            // The activity currently being edited/deleted (manage panel)
            _editing: { attribute: false },
            // "add" | "edit" | "delete" — which manage sub-view to show
            _manageView: { attribute: false },
            // Activity pending "mark done" confirmation (null = dialog closed)
            _confirming: { attribute: false },
        };
    }

    constructor() {
        super();
        this._activities = [];
        this._panel = "view";
        this._editing = null;
        this._manageView = "list";
        this._confirming = null;
        this._unsubEvents = null;
        this._disconnected = false;
    }

    setConfig(config) {
        this._config = {
            header: config.header || config.category || "Activities",
            icon: config.icon || "mdi:format-list-checkbox",
            entry_id: config.entry_id || null,
            category: config.category || null,
            showDueOnly: config.showDueOnly || false,
            soonHours: config.soonHours != null ? config.soonHours : 24,
            compact: config.compact || false,
        };
    }

    firstUpdated() {
        loadHaComponents().then(() => this.requestUpdate());
    }

    connectedCallback() {
        super.connectedCallback();
        this._disconnected = false;
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._disconnected = true;
        this._unsubEvents?.();
        this._unsubEvents = null;
    }

    set hass(hass) {
        const first = !this._hass;
        this._hass = hass;
        if (first) {
            this._fetchData();
            hass.connection
                .subscribeEvents(() => this._fetchData(), "activity_manager_updated")
                .then((unsub) => {
                    if (this._disconnected) {
                        unsub();
                    } else {
                        this._unsubEvents = unsub;
                    }
                })
                .catch((err) => console.error("[ActivityManagerCard] Failed to subscribe to events:", err));
        }
    }

    // -----------------------------------------------------------------------
    // Data
    // -----------------------------------------------------------------------

    _fetchData = async () => {
        if (!this._hass) return;
        const msg = { type: "activity_manager/items" };
        if (this._config.entry_id) msg.entry_id = this._config.entry_id;
        let raw;
        try {
            raw = (await this._hass.callWS(msg)) || [];
        } catch (err) {
            console.error("[ActivityManagerCard] Failed to fetch activities:", err);
            return;
        }
        const soonMs = (this._config.soonHours ?? 24) * 3_600_000;
        this._activities = raw
            .map((item) => {
                const completed = new Date(item.last_completed);
                const due = new Date(completed.valueOf() + item.frequency_ms);
                const difference = due - Date.now();
                return { ...item, due, difference, _status: statusClass({ difference }, soonMs) };
            })
            .filter((item) => !this._config.category || item.category === this._config.category)
            .filter((item) => !this._config.showDueOnly || item.difference < 0)
            .sort((a, b) => {
                const catCmp = a.category.toLowerCase().localeCompare(b.category.toLowerCase());
                return catCmp !== 0 ? catCmp : a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            });
    };

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    render() {
        if (!this._config) return html``;
        return html`
            <ha-card>
                ${this._renderHeader()}
                <div class="card-content">
                    ${this._confirming
                        ? this._renderConfirmDialog()
                        : this._panel === "view" ? this._renderList() : this._renderManagePanel()}
                </div>
            </ha-card>
        `;
    }

    _renderHeader() {
        return html`
            <div class="card-header">
                <div class="header-icon">
                    <ha-icon icon="${this._config.icon}"></ha-icon>
                </div>
                <div class="header-title">${this._config.header}</div>
                <div class="header-actions">
                    ${this._panel === "view"
                        ? html`
                            <ha-icon-button
                                .label=${"Manage activities"}
                                @click=${() => this._openManage("list")}
                            >
                                <ha-icon icon="mdi:cog-outline"></ha-icon>
                            </ha-icon-button>
                        `
                        : html`
                            <ha-icon-button
                                .label=${"Back"}
                                @click=${() => this._closeManage()}
                            >
                                <ha-icon icon="mdi:close"></ha-icon>
                            </ha-icon-button>
                        `}
                </div>
            </div>
        `;
    }

    // -----------------------------------------------------------------------
    // View panel — activity list
    // -----------------------------------------------------------------------

    _renderList() {
        if (this._activities.length === 0) {
            return html`<div class="empty-state">
                <ha-icon icon="mdi:check-all"></ha-icon>
                <span>No activities</span>
            </div>`;
        }
        return html`
            <div class="activity-list">
                ${repeat(this._activities, (a) => a.id, (a) => this._renderActivityRow(a))}
            </div>
        `;
    }

    _renderActivityRow(activity) {
        const compact = this._config.compact;
        const frac = progressFraction(activity);
        const R = compact ? 14 : 18;
        const stroke = compact ? 2 : 2.5;
        const size = (R + stroke) * 2;
        const cx = size / 2;
        return html`
            <div class="activity-row status-${activity._status} ${compact ? "compact" : ""}"
                 @click=${() => this._showDoneDialog(activity)}>
                <div class="activity-icon-wrap status-bg-${activity._status} ${compact ? "compact" : ""}">
                    <svg class="progress-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                        <circle
                            class="progress-ring-track"
                            cx="${cx}" cy="${cx}" r="${R}"
                            fill="none" stroke-width="${stroke}"
                        />
                        <path
                            class="progress-ring-arc status-arc-${activity._status}"
                            d="${arcPath(R, frac)}"
                            fill="none" stroke-width="${stroke}"
                            transform="translate(${stroke}, ${stroke})"
                        />
                    </svg>
                    <ha-icon icon="${activity.icon || "mdi:checkbox-marked-circle-outline"}"></ha-icon>
                </div>
                <div class="activity-info">
                    <span class="activity-name">${activity.name}</span>
                    ${compact ? "" : html`<span class="activity-sub">${activity.category} · ${formatRelative(activity.due)}</span>`}
                </div>
                ${compact ? html`<span class="activity-due-compact">${formatRelative(activity.due)}</span>` : ""}
            </div>
        `;
    }

    _showDoneDialog(activity) {
        this._confirming = activity;
    }

    // -----------------------------------------------------------------------
    // Mark-done confirm dialog
    // -----------------------------------------------------------------------

    _renderConfirmDialog() {
        const a = this._confirming;
        const now = localDatetimeValue();
        return html`
            <div class="form-panel">
                <div class="form-hero">
                    <div class="form-hero-icon">
                        <ha-icon icon="${a.icon || "mdi:checkbox-marked-circle-outline"}"></ha-icon>
                    </div>
                    <div class="form-hero-text">
                        <div class="form-hero-name">${a.name}</div>
                        <div class="form-hero-label">Mark as completed</div>
                    </div>
                </div>
                <ha-input
                    id="confirm-dt"
                    type="datetime-local"
                    label="Completed at"
                    .value=${now}
                    style="width:100%"
                ></ha-input>
                <div class="form-actions">
                    <button class="am-btn am-btn-text" @click=${() => { this._confirming = null; }}>Cancel</button>
                    <button class="am-btn am-btn-primary" @click=${this._submitDone}>Mark Done</button>
                </div>
            </div>
        `;
    }

    async _submitDone() {
        const a = this._confirming;
        if (!a) return;
        const dtEl = this.shadowRoot.querySelector("#confirm-dt");
        const last_completed = datetimeLocalToISO(dtEl?.value);
        this._confirming = null;
        try {
            await this._hass.callWS({
                type: "activity_manager/update",
                entry_id: a.entry_id,
                item_id: a.id,
                last_completed,
            });
        } catch (err) {
            console.error("[ActivityManagerCard] Failed to mark done:", err);
        }
    }

    // -----------------------------------------------------------------------
    // Manage panel
    // -----------------------------------------------------------------------

    _openManage(view, activity = null) {
        this._panel = "manage";
        this._manageView = view;
        this._editing = activity ? { ...activity } : null;
    }

    _closeManage() {
        this._panel = "view";
        this._editing = null;
        this._manageView = "list";
    }

    _renderManagePanel() {
        if (this._manageView === "add") return this._renderAddForm();
        if (this._manageView === "edit") return this._renderEditForm();
        if (this._manageView === "delete") return this._renderDeleteConfirm();
        return this._renderManageList();
    }

    _renderManageList() {
        return html`
            <div class="manage-list">
                <button class="add-btn" @click=${() => this._openManage("add")}>
                    <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                    Add activity
                </button>
                ${this._activities.length === 0
                    ? html`<div class="empty-state"><span>No activities yet — add one above.</span></div>`
                    : html`
                        <div class="activity-list">
                            ${repeat(this._activities, (a) => a.id, (a) => html`
                                <div class="activity-row status-${a._status}">
                                    <div class="activity-icon-wrap status-bg-${a._status}">
                                        <ha-icon icon="${a.icon || "mdi:checkbox-marked-circle-outline"}"></ha-icon>
                                    </div>
                                    <div class="activity-info">
                                        <span class="activity-name">${a.name}</span>
                                        <span class="activity-sub">${a.category}</span>
                                    </div>
                                    <div class="manage-actions">
                                        <ha-icon-button
                                            .label=${"Edit"}
                                            @click=${() => this._openManage("edit", a)}
                                        ><ha-icon icon="mdi:pencil-outline"></ha-icon></ha-icon-button>
                                        <ha-icon-button
                                            .label=${"Delete"}
                                            class="delete-btn-icon"
                                            @click=${() => this._openManage("delete", a)}
                                        ><ha-icon icon="mdi:trash-can-outline"></ha-icon></ha-icon-button>
                                    </div>
                                </div>
                            `)}
                        </div>
                    `}
            </div>
        `;
    }

    // -----------------------------------------------------------------------
    // Add form
    // -----------------------------------------------------------------------

    _renderAddForm() {
        const now = localDatetimeValue();
        return html`
            <div class="form-panel">
                <div class="form-hero">
                    <div class="form-hero-icon">
                        <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                    </div>
                    <div class="form-hero-text">
                        <div class="form-hero-name">New activity</div>
                        <div class="form-hero-label">Add to this list</div>
                    </div>
                </div>
                <div class="form-fields">
                    <ha-input id="add-name" label="Name" style="width:100%"></ha-input>
                    <ha-input id="add-category" label="Category" .value=${this._config.category || ""} style="width:100%" autocomplete="off"></ha-input>
                    <ha-icon-picker id="add-icon" label="Icon" style="width:100%"></ha-icon-picker>
                    <div class="field-group">
                        <label class="field-label">Frequency</label>
                        <div class="duration-row">
                            <ha-input id="add-freq-d" label="days"  type="number" inputmode="numeric" without-spin-buttons value="0"></ha-input>
                            <ha-input id="add-freq-h" label="hours" type="number" inputmode="numeric" without-spin-buttons value="0"></ha-input>
                            <ha-input id="add-freq-m" label="min"   type="number" inputmode="numeric" without-spin-buttons value="0"></ha-input>
                        </div>
                    </div>
                    <ha-input id="add-last" type="datetime-local" label="Last completed" .value=${now} style="width:100%"></ha-input>
                </div>
                <div class="form-actions">
                    <button class="am-btn am-btn-text" @click=${() => this._closeManage()}>Cancel</button>
                    <button class="am-btn am-btn-primary" @click=${this._submitAdd}>Add</button>
                </div>
            </div>
        `;
    }

    _readFreq(prefix) {
        return {
            days: getNumber(this.shadowRoot.querySelector(`#${prefix}-freq-d`).value),
            hours: getNumber(this.shadowRoot.querySelector(`#${prefix}-freq-h`).value),
            minutes: getNumber(this.shadowRoot.querySelector(`#${prefix}-freq-m`).value),
        };
    }

    _freqMs(freq) {
        return freq.days * 86_400_000 + freq.hours * 3_600_000 + freq.minutes * 60_000;
    }

    _submitAdd() {
        const name = this.shadowRoot.querySelector("#add-name");
        const category = this.shadowRoot.querySelector("#add-category");
        const icon = this.shadowRoot.querySelector("#add-icon");
        const lastEl = this.shadowRoot.querySelector("#add-last");
        const freq = this._readFreq("add");

        if (!name.value.trim()) {
            name.setCustomValidity("Required");
            name.reportValidity();
            return;
        }
        if (this._freqMs(freq) === 0) {
            alert("Frequency must be greater than zero.");
            return;
        }
        if (!this._config.entry_id) {
            alert("No activity list selected. Edit the card configuration and choose a list.");
            return;
        }

        this._hass.callWS({
            type: "activity_manager/add",
            entry_id: this._config.entry_id,
            name: name.value.trim(),
            category: category.value.trim(),
            frequency: freq,
            icon: icon.value || undefined,
            last_completed: datetimeLocalToISO(lastEl.value),
        }).catch((err) => console.error("[ActivityManagerCard] Failed to add activity:", err));

        this._closeManage();
    }

    // -----------------------------------------------------------------------
    // Edit form
    // -----------------------------------------------------------------------

    _renderEditForm() {
        const a = this._editing;
        if (!a) return html``;
        const lastVal = a.last_completed
            ? localDatetimeValue(new Date(a.last_completed))
            : localDatetimeValue();
        const freq = typeof a.frequency === "object" ? a.frequency : {};
        return html`
            <div class="form-panel">
                <div class="form-hero">
                    <div class="form-hero-icon">
                        <ha-icon icon="${a.icon || "mdi:checkbox-marked-circle-outline"}"></ha-icon>
                    </div>
                    <div class="form-hero-text">
                        <div class="form-hero-name">${a.name}</div>
                        <div class="form-hero-label">Edit activity</div>
                    </div>
                </div>
                <div class="form-fields">
                    <ha-input id="edit-name" label="Name" value=${a.name} style="width:100%"></ha-input>
                    <ha-input id="edit-category" label="Category" .value=${a.category || ""} style="width:100%" autocomplete="off"></ha-input>
                    <ha-icon-picker id="edit-icon" label="Icon" .value=${a.icon || ""} style="width:100%"></ha-icon-picker>
                    <div class="field-group">
                        <label class="field-label">Frequency</label>
                        <div class="duration-row">
                            <ha-input id="edit-freq-d" label="days"  type="number" inputmode="numeric" without-spin-buttons value=${String(freq.days || 0)}></ha-input>
                            <ha-input id="edit-freq-h" label="hours" type="number" inputmode="numeric" without-spin-buttons value=${String(freq.hours || 0)}></ha-input>
                            <ha-input id="edit-freq-m" label="min"   type="number" inputmode="numeric" without-spin-buttons value=${String(freq.minutes || 0)}></ha-input>
                        </div>
                    </div>
                    <ha-input id="edit-last" type="datetime-local" label="Last completed" value=${lastVal} style="width:100%"></ha-input>
                </div>
                <div class="form-actions">
                    <button class="am-btn am-btn-text" @click=${() => this._closeManage()}>Cancel</button>
                    <button class="am-btn am-btn-primary" @click=${this._submitEdit}>Save</button>
                </div>
            </div>
        `;
    }

    _submitEdit() {
        const a = this._editing;
        if (!a) return;
        const name = this.shadowRoot.querySelector("#edit-name");
        const category = this.shadowRoot.querySelector("#edit-category");
        const icon = this.shadowRoot.querySelector("#edit-icon");
        const lastEl = this.shadowRoot.querySelector("#edit-last");
        const freq = this._readFreq("edit");

        if (!name.value.trim()) {
            name.setCustomValidity("Required");
            name.reportValidity();
            return;
        }
        if (this._freqMs(freq) === 0) {
            alert("Frequency must be greater than zero.");
            return;
        }

        this._hass.callWS({
            type: "activity_manager/update",
            entry_id: a.entry_id,
            item_id: a.id,
            name: name.value.trim(),
            category: category.value.trim() || a.category,
            frequency: freq,
            icon: icon.value || undefined,
            last_completed: datetimeLocalToISO(lastEl.value),
        }).catch((err) => console.error("[ActivityManagerCard] Failed to update activity:", err));

        this._closeManage();
    }

    // -----------------------------------------------------------------------
    // Delete confirm
    // -----------------------------------------------------------------------

    _renderDeleteConfirm() {
        const a = this._editing;
        if (!a) return html``;
        return html`
            <div class="form-panel">
                <div class="form-hero form-hero-danger">
                    <div class="form-hero-icon form-hero-icon-danger">
                        <ha-icon icon="${a.icon || "mdi:checkbox-marked-circle-outline"}"></ha-icon>
                    </div>
                    <div class="form-hero-text">
                        <div class="form-hero-name">${a.name}</div>
                        <div class="form-hero-label form-hero-label-danger">Remove activity?</div>
                    </div>
                </div>
                <p class="delete-body">This will be permanently removed from <em>${a.list_title || "this list"}</em>.</p>
                <div class="form-actions">
                    <button class="am-btn am-btn-text" @click=${() => this._closeManage()}>Cancel</button>
                    <button class="am-btn am-btn-danger" @click=${this._submitDelete}>Remove</button>
                </div>
            </div>
        `;
    }

    _submitDelete() {
        const a = this._editing;
        if (!a) return;
        this._hass.callWS({
            type: "activity_manager/remove",
            entry_id: a.entry_id,
            item_id: a.id,
        }).catch((err) => console.error("[ActivityManagerCard] Failed to remove activity:", err));
        this._closeManage();
    }

    // -----------------------------------------------------------------------
    // Styles
    // -----------------------------------------------------------------------

    static styles = css`
        :host {
            --am-ok-color: var(--state-inactive-color, #9e9e9e);
            --am-soon-color: var(--warning-color, #ff9800);
            --am-overdue-color: var(--error-color, #db4437);
            --am-icon-size: 36px;
            --am-row-gap: 8px;
        }

        ha-card {
            overflow: hidden;
        }

        /* ---- Header ---- */
        .card-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 0 4px 0 12px;
            height: 56px;
        }
        .header-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: rgba(var(--rgb-primary-color, 33,150,243), 0.12);
            color: var(--primary-color);
            flex-shrink: 0;
            --mdc-icon-size: 20px;
        }
        .header-icon ha-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
        }
        .header-title {
            flex: 1;
            font-size: 14px;
            font-weight: 500;
            color: var(--primary-text-color);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .header-actions {
            display: flex;
            align-items: center;
            flex-shrink: 0;
        }
        .header-actions ha-icon-button {
            color: var(--secondary-text-color);
            --mdc-icon-button-size: 36px;
            --mdc-icon-size: 20px;
        }

        /* ---- Card content ---- */
        .card-content {
            padding: 12px;
        }

        /* ---- Activity rows (shared between view + manage list) ---- */
        .activity-list {
            display: flex;
            flex-direction: column;
            gap: var(--am-row-gap);
        }

        .activity-row {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            border-radius: 10px;
            background: var(--secondary-background-color, rgba(0,0,0,.04));
            cursor: pointer;
            transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .activity-row:hover {
            background: var(--secondary-background-color, rgba(0,0,0,.04));
            transform: translateY(-1px);
            box-shadow: 0 3px 10px rgba(0,0,0,0.18);
        }
        .activity-row:active {
            transform: translateY(0);
            box-shadow: none;
        }
        .activity-row.status-overdue {
            background: rgba(var(--rgb-error-color, 219,68,55), 0.08);
        }
        .activity-row.status-soon {
            background: rgba(var(--rgb-warning-color, 255,152,0), 0.08);
        }

        .activity-icon-wrap {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            width: var(--am-icon-size);
            height: var(--am-icon-size);
            border-radius: 50%;
            flex-shrink: 0;
            background: rgba(var(--rgb-disabled-color, 189,189,189), 0.2);
            color: var(--am-ok-color);
            --mdc-icon-size: 20px;
        }
        .activity-icon-wrap.compact {
            width: 28px;
            height: 28px;
            --mdc-icon-size: 16px;
        }
        .activity-icon-wrap.status-bg-overdue {
            background: rgba(var(--rgb-error-color, 219,68,55), 0.15);
            color: var(--am-overdue-color);
        }
        .activity-icon-wrap.status-bg-soon {
            background: rgba(var(--rgb-warning-color, 255,152,0), 0.15);
            color: var(--am-soon-color);
        }

        /* ---- Progress ring ---- */
        .progress-ring {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            overflow: visible;
            pointer-events: none;
        }
        .progress-ring-track {
            stroke: rgba(var(--rgb-disabled-color, 189,189,189), 0.25);
        }
        .progress-ring-arc {
            stroke: var(--am-ok-color);
            stroke-linecap: round;
            transition: stroke-dasharray 0.3s ease;
        }
        .progress-ring-arc.status-arc-soon {
            stroke: var(--am-soon-color);
        }
        .progress-ring-arc.status-arc-overdue {
            stroke: var(--am-overdue-color);
        }

        /* ---- Compact mode ---- */
        .activity-row.compact {
            padding: 6px 10px;
        }
        .activity-due-compact {
            font-size: 11px;
            color: var(--secondary-text-color);
            white-space: nowrap;
            flex-shrink: 0;
        }
        .activity-row.compact.status-overdue .activity-due-compact {
            color: var(--am-overdue-color);
            font-weight: 500;
        }
        .activity-row.compact.status-soon .activity-due-compact {
            color: var(--am-soon-color);
        }

        .activity-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
        }
        .activity-name {
            font-size: 14px;
            font-weight: 500;
            color: var(--primary-text-color);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .activity-sub {
            font-size: 12px;
            color: var(--secondary-text-color);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .activity-row.status-overdue .activity-sub {
            color: var(--am-overdue-color);
            font-weight: 500;
        }
        .activity-row.status-soon .activity-sub {
            color: var(--am-soon-color);
        }


        /* ---- Empty state ---- */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            padding: 24px 0;
            color: var(--secondary-text-color);
            font-size: 14px;
        }
        .empty-state ha-icon {
            --mdc-icon-size: 32px;
            opacity: 0.4;
        }

        /* ---- Manage panel ---- */
        .manage-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .add-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            padding: 10px 14px;
            border: 2px dashed var(--divider-color, rgba(0,0,0,.18));
            border-radius: 10px;
            background: transparent;
            color: var(--primary-color);
            font-size: 14px;
            font-weight: 500;
            font-family: inherit;
            cursor: pointer;
            transition: background 0.15s;
        }
        .add-btn:hover {
            background: rgba(var(--rgb-primary-color, 33,150,243), 0.06);
        }
        .add-btn ha-icon {
            --mdc-icon-size: 20px;
        }

        .manage-actions {
            display: flex;
            align-items: center;
            flex-shrink: 0;
        }
        .delete-btn-icon {
            color: var(--error-color, #db4437);
        }

        /* ---- Danger hero variants ---- */
        .form-hero-icon-danger {
            background: rgba(var(--rgb-error-color, 219,68,55), 0.12);
            color: var(--error-color, #db4437);
        }
        .form-hero-label-danger {
            color: var(--error-color, #db4437);
        }

        .form-fields {
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: 100%;
            box-sizing: border-box;
        }

        .field-label {
            font-size: 12px;
            font-weight: 500;
            color: var(--secondary-text-color);
            margin-bottom: 4px;
        }


        .field-group {
            display: flex;
            flex-direction: column;
            width: 100%;
        }

        .duration-row {
            display: flex;
            gap: 8px;
            width: 100%;
        }
        .duration-row ha-input {
            flex: 1;
            min-width: 0;
        }

        .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding-top: 4px;
        }

        /* ---- Mark Done panel ---- */
        .form-panel {
            display: flex;
            flex-direction: column;
            gap: 16px;
            width: 100%;
            box-sizing: border-box;
        }
        .form-hero {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 4px 0 8px;
            border-bottom: 1px solid var(--divider-color, rgba(0,0,0,.12));
        }
        .form-hero-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            flex-shrink: 0;
            background: rgba(var(--rgb-primary-color, 33,150,243), 0.12);
            color: var(--primary-color);
            --mdc-icon-size: 24px;
        }
        .form-hero-text {
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
        }
        .form-hero-name {
            font-size: 15px;
            font-weight: 600;
            color: var(--primary-text-color);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .form-hero-label {
            font-size: 12px;
            color: var(--secondary-text-color);
        }

        .delete-body {
            font-size: 14px;
            color: var(--primary-text-color);
            margin: 0;
            line-height: 1.5;
        }

        .am-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            height: 36px;
            padding: 0 16px;
            border-radius: 18px;
            border: none;
            font-size: 14px;
            font-weight: 500;
            font-family: inherit;
            cursor: pointer;
            transition: background 0.15s, opacity 0.15s;
            white-space: nowrap;
        }
        .am-btn-text {
            background: transparent;
            color: var(--primary-color);
        }
        .am-btn-text:hover {
            background: rgba(var(--rgb-primary-color, 33,150,243), 0.08);
        }
        .am-btn-primary {
            background: var(--primary-color);
            color: var(--text-primary-color, #fff);
        }
        .am-btn-primary:hover {
            opacity: 0.88;
        }
        .am-btn-danger {
            background: var(--error-color, #db4437);
            color: #fff;
        }
        .am-btn-danger:hover {
            opacity: 0.88;
        }
    `;
}

// ---------------------------------------------------------------------------
// Card editor
// ---------------------------------------------------------------------------

class ActivityManagerCardEditor extends LitElement {
    static get properties() {
        return {
            _hass: { attribute: false },
            _config: { attribute: false },
            _lists: { attribute: false },
        };
    }

    constructor() {
        super();
        this._lists = null;
    }

    setConfig(config) {
        this._config = config;
    }

    set hass(hass) {
        const first = !this._hass;
        this._hass = hass;
        if (first) this._loadLists();
    }

    async _loadLists() {
        try {
            const entries = await this._hass.callWS({
                type: "config_entries/get",
                domain: "activity_manager",
            });
            this._lists = entries.map((e) => ({ value: e.entry_id, label: e.title }));
            this.requestUpdate();
        } catch (_) {
            // fallback to entity scan if WS call fails
            this._lists = null;
        }
    }

    _getLists() {
        if (!this._hass) return [];
        // Primary: use config entries fetched via WS (works with empty lists).
        if (this._lists) return this._lists;
        // Fallback: scan entity states (populated once activities have been added).
        const lists = {};
        Object.values(this._hass.states).forEach((e) => {
            const a = e.attributes;
            if (a.integration === "activity_manager" && a.entry_id)
                lists[a.entry_id] = a.list_title || a.entry_id;
        });
        return Object.entries(lists).map(([value, label]) => ({ value, label }));
    }

    _getCategories() {
        if (!this._hass) return [];
        const target = this._config?.entry_id;
        const seen = new Set();
        Object.values(this._hass.states).forEach((e) => {
            const a = e.attributes;
            if (a.integration !== "activity_manager") return;
            if (target && a.entry_id !== target) return;
            if (a.category) seen.add(a.category);
        });
        return Array.from(seen).sort().map((c) => ({ value: c, label: c }));
    }

    _valueChanged(ev) {
        if (!this._config || !this._hass) return;
        const v = ev.detail.value;
        const config = {
            ...this._config,
            entry_id: v.entry_id || null,
            category: v.category || null,
            header: v.header,
            icon: v.icon,
            showDueOnly: v.showDueOnly,
            compact: v.compact,
            soonHours: v.soonHours,
        };
        this._config = config;
        this.dispatchEvent(new CustomEvent("config-changed", {
            detail: { config },
            bubbles: true,
            composed: true,
        }));
    }

    render() {
        if (!this._hass || !this._config) return html``;
        const lists = this._getLists();
        const categories = this._getCategories();

        return html`
            <div class="editor">
                <div class="editor-row">
                    <label>Activity list</label>
                    <select class="editor-select" .value=${this._config.entry_id ?? ""} @change=${this._listChanged}>
                        <option value="" ?selected=${!this._config.entry_id}>— choose a list —</option>
                        ${lists.map((l) => html`
                            <option value=${l.value} ?selected=${this._config.entry_id === l.value}>${l.label}</option>
                        `)}
                    </select>
                    ${lists.length === 0 ? html`<span class="editor-hint">No lists found. Add an Activity Manager integration first.</span>` : html``}
                </div>
                <ha-form
                    .hass=${this._hass}
                    .data=${this._config}
                    .schema=${[
                        {
                            name: "category",
                            selector: { select: { options: categories, custom_value: true } },
                        },
                        { name: "header", selector: { text: {} } },
                        { name: "icon", selector: { icon: {} } },
                        { name: "showDueOnly", selector: { boolean: {} } },
                        { name: "compact", selector: { boolean: {} } },
                        { name: "soonHours", selector: { number: { unit_of_measurement: "hours", min: 0 } } },
                    ]}
                    .computeLabel=${(s) => ({
                        category: "Filter by category (optional)",
                        header: "Card title",
                        icon: "Card icon",
                        showDueOnly: "Only show overdue/due-soon activities",
                        compact: "Compact mode (smaller rows)",
                        soonHours: "\"Due soon\" threshold",
                    }[s.name] ?? s.name)}
                    @value-changed=${this._valueChanged}
                ></ha-form>
            </div>
        `;
    }

    _listChanged(ev) {
        const entry_id = ev.target.value || null;
        const config = { ...this._config, entry_id };
        this._config = config;
        this.dispatchEvent(new CustomEvent("config-changed", {
            detail: { config },
            bubbles: true,
            composed: true,
        }));
    }

    static styles = css`
        .editor {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .editor-row {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 8px 0;
        }
        .editor-row label {
            font-size: 12px;
            font-weight: 500;
            color: var(--secondary-text-color);
        }
        .editor-select {
            width: 100%;
            padding: 8px 10px;
            border-radius: 6px;
            border: 1px solid var(--divider-color, rgba(0,0,0,.2));
            background: var(--card-background-color, #fff);
            color: var(--primary-text-color);
            font-size: 14px;
            font-family: inherit;
        }
        .editor-hint {
            font-size: 12px;
            color: var(--warning-color, #ff9800);
        }
    `;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

customElements.define("activity-manager-card", ActivityManagerCard);
customElements.define("activity-manager-card-editor", ActivityManagerCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
    type: "activity-manager-card",
    name: "Activity Manager",
    description: "Track recurring activities with due-date awareness.",
    preview: true,
});

// Lazily load ha-form and ha-icon-picker (needed for editor + forms)
async function loadHaComponents() {
    if (customElements.get("ha-form") && customElements.get("ha-icon-picker")) return;
    await customElements.whenDefined("partial-panel-resolver");
    const ppr = document.createElement("partial-panel-resolver");
    ppr.hass = { panels: [{ url_path: "tmp", component_name: "config" }] };
    ppr._updateRoutes();
    await ppr.routerOptions.routes.tmp.load();
    await customElements.whenDefined("ha-panel-config");
    const cpr = document.createElement("ha-panel-config");
    await cpr.routerOptions.routes.automation.load();
}

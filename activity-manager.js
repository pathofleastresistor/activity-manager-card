import {
    LitElement,
    html,
    until,
    css,
    repeat,
} from "https://cdn.jsdelivr.net/gh/lit/dist@2/all/lit-all.min.js";

class ActivityManagerCard extends LitElement {
    _current_id = null;

    static getConfigElement() {
        return document.createElement("activity-manager-card-editor");
    }

    static getStubConfig() {
        return {
            category: "Activities",
        };
    }

    // Define fields that will trigger re-rendering when changed
    static get properties() {
        return {
            _hass: {},
            _config: {},
            _activities: [],
        };
    }

    constructor() {
        super();
        this._activities = [];
    }

    setConfig(config) {
        this._config = structuredClone(config);
        this._config.header =
            this._config.header || this._config.category || "Activities";
        this._config.showDueOnly = config.showDueOnly || false;
        this._config.actionTitle = config.actionTitle || "Did it!";
        this._config.mode = config.mode || "basic";
        this._config.soonHours = config.soonHours || 24;
        this._config.icon = config.icon || "mdi:format-list-checkbox";

        this._runOnce = false;
        this.fetchData();
    }

    set hass(hass) {
        this._hass = hass;
        if (!this._runOnce) {
            // Update when loading
            this.fetchData();

            // Update once an hour
            this._interval = setInterval(() => {
                this.fetchData(hass);
            }, 60000);

            // Update when changes are made
            this._hass.connection.subscribeEvents(
                () => this.fetchData(),
                "activity_manager_updated"
            );

            this._runOnce = true;
        }
    }

    renderActionButton(item) {
        return html`
            <div class="right am-action">
                <mwc-button
                    outlined
                    class="button"
                    @click=${this._config.mode == "basic"
                        ? this.showUpdateDialog
                        : this.remove_activity}
                    data-am-id=${item.id}
                >
                    ${this._config.mode == "basic"
                        ? this._config["actionTitle"]
                        : "Remove"}
                </mwc-button>
            </div>
        `;
    }

    renderAddDialog() {
        const date = new Date();
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        let val = `${year}-${month}-${day}T${hours}:${minutes}`;

        return html`
            <ha-dialog class="manage-form" heading="Add Activity">
                <form>
                    <div class="am-add-form" >
                        <input
                            type="hidden"
                            id="category"
                            placeholder="Category"
                            value="${this._config["category"]}" />

                        <ha-textfield type="text" id="name" label="Activity Name">
                        </ha-textfield>
                        <label for="frequency-day">Frequency</label>
                        <div class="duration-input">
                            <ha-textfield type="number" label="Day" id="frequency-day">
                            </ha-textfield>:<ha-textfield type="number" label="Hour" id="frequency-hour">
                            </ha-textfield>:<ha-textfield type="number" label="Min" id="frequency-minute">
                            </ha-textfield>:<ha-textfield type="number" label="Sec"id="frequency-second">
                            </ha-textfield>
                        </div>
                        <ha-textfield type="text" id="icon" label="Activity Icon">
                        </ha-textfield>
                        <ha-textfield type="datetime-local" id="last-completed" label="Activity Last Completed" value=${val}>
                        </ha-textfield>
                    </div>
                    </ha-form>
                </form>
                <mwc-button slot="primaryAction" dialogAction="discard" @click=${this.add_activity}>
                    Add
                </mwc-button>
                <mwc-button slot="secondaryAction" dialogAction="cancel">
                    Cancel
                </mwc-button>
            </ha-dialog>
            `;
    }

    renderConfirmDialog() {
        const date = new Date();
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        let val = `${year}-${month}-${day}T${hours}:${minutes}`;

        return html`
            <ha-dialog class="confirm-update" heading="Confirm">
                <ha-textfield
                    type="datetime-local"
                    id="update-last-completed"
                    label="Activity Last Completed"
                    value=${val}
                >
                </ha-textfield>
                <mwc-button
                    slot="primaryAction"
                    dialogAction="discard"
                    @click=${this.updateActivity}
                >
                    Confirm
                </mwc-button>
                <mwc-button slot="secondaryAction" dialogAction="cancel">
                    Cancel
                </mwc-button>
            </ha-dialog>
        `;
    }

    render() {
        return html`
            <ha-card>
                <div class="header">
                    <div class="icon-container">
                        <ha-icon icon="${this._config.icon}"></ha-icon>
                    </div>
                    <div class="info-container">
                        <div class="primary">${this._config.header}</div>
                    </div>
                    <div class="action-container">
                        <mwc-icon-button
                            @click=${() => {
                                this.shadowRoot
                                    .querySelector(".manage-form")
                                    .show();
                            }}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    d="M14.3 21.7C13.6 21.9 12.8 22 12 22C6.5 22 2 17.5 2 12S6.5 2 12 2C13.3 2 14.6 2.3 15.8 2.7L14.2 4.3C13.5 4.1 12.8 4 12 4C7.6 4 4 7.6 4 12S7.6 20 12 20C12.4 20 12.9 20 13.3 19.9C13.5 20.6 13.9 21.2 14.3 21.7M7.9 10.1L6.5 11.5L11 16L21 6L19.6 4.6L11 13.2L7.9 10.1M18 14V17H15V19H18V22H20V19H23V17H20V14H18Z"
                                />
                            </svg>
                        </mwc-icon-button>
                        <mwc-icon-button @click=${this.switch_mode}>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z"
                                />
                            </svg>
                        </mwc-icon-button>
                    </div>
                </div>
                <div class="content">
                    <div class="am-grid">
                        ${repeat(
                            this._activities,
                            (activity) => activity.name,
                            (activity) => html`
                                <div
                                    class="am-item
                                        ${activity.difference < 0
                                        ? "am-due"
                                        : ""}
                                        ${activity.difference > 0 &&
                                    activity.difference <
                                        this._config.soonHours * 60 * 60 * 1000
                                        ? "am-due-soon"
                                        : ""}"
                                >
                                    <div class="am-item-name">
                                        <div class="am-item-primary">
                                            ${activity.name}
                                        </div>
                                        <div class="am-item-secondary">
                                            ${this.formatTimeAgo(activity.due)}
                                        </div>
                                    </div>
                                    ${this.renderActionButton(activity)}
                                </div>
                            `
                        )}
                    </div>
                </div>
            </ha-card>
            ${this.renderAddDialog()} ${this.renderConfirmDialog()}
        `;
    }

    switch_mode(ev) {
        switch (this._config.mode) {
            case "basic":
                this._config.mode = "manage";
                break;
            case "manage":
                this._config.mode = "basic";
                break;
        }
        this.requestUpdate();
    }

    fetchData = async () => {
        const items =
            (await this._hass?.callWS({
                type: "activity_manager/items",
            })) || [];

        this._activities = items
            .map((item) => {
                const completed = new Date(item.last_completed);
                const due = new Date(completed.valueOf() + item.frequency_ms);
                //const due = new Date(new Date(item.last_completed).setDate(new Date(item.last_completed).getDate() + item.frequency_ms));
                const now = new Date();
                const difference = due - now; // miliseconds

                return {
                    ...item,
                    due: due,
                    difference: difference,
                    time_unit: "day",
                };
            })
            .filter((item) => {
                if ("category" in this._config)
                    return (
                        item["category"] == this._config["category"] ||
                        item["category"] == "Activities"
                    );
                return true;
            })
            .filter((item) => {
                if (this._config.showDueOnly) return item["difference"] < 0;
                return true;
            })
            .sort((a, b) => {
                if (a["category"] == b["category"])
                    return a["name"]
                        .toLowerCase()
                        .localeCompare(b["name"].toLowerCase());
                return a["category"]
                    .toLowerCase()
                    .localeCompare(b["category"].toLowerCase());
            });
    };

    add_activity(ev) {
        ev.stopPropagation();
        let name = this.shadowRoot.querySelector("#name");
        let category = this.shadowRoot.querySelector("#category");
        let icon = this.shadowRoot.querySelector("#icon");
        let last_completed = this.shadowRoot.querySelector("#last-completed");

        let frequency = {};
        frequency.days = this._getNumber(
            this.shadowRoot.querySelector("#frequency-day").value,
            0
        );
        frequency.hours = this._getNumber(
            this.shadowRoot.querySelector("#frequency-hour").value,
            0
        );
        frequency.minutes = this._getNumber(
            this.shadowRoot.querySelector("#frequency-minute").value,
            0
        );
        frequency.seconds = this._getNumber(
            this.shadowRoot.querySelector("#frequency-second").value,
            0
        );

        console.log(last_completed);

        this._hass.callService("activity_manager", "add_activity", {
            name: name.value,
            category: category.value,
            frequency: frequency,
            icon: icon.value,
            last_completed: last_completed.value,
        });
        name.value = "";
        category.value = "";
        icon = "";
        last_completed = "";

        let manageEl = this.shadowRoot.querySelector(".manage-form");
        manageEl.close();
    }

    _getNumber(value, defaultValue) {
        const num = parseInt(value, 10);
        return isNaN(num) ? defaultValue : num;
    }

    showUpdateDialog(ev) {
        this.shadowRoot.querySelector(".confirm-update").show();
        this._current_id = ev.target.dataset.amId;
    }

    updateActivity() {
        if (this._current_id == null) return;

        let last_completed = this.shadowRoot.querySelector(
            "#update-last-completed"
        );

        this._hass.callWS({
            type: "activity_manager/update",
            item_id: this._current_id,
            last_completed: last_completed.value,
        });

        this._current_id = null;
    }

    remove_activity(ev) {
        ev.stopPropagation();
        const item_id = ev.target.dataset.amId;
        this._hass.callWS({
            type: "activity_manager/remove",
            item_id: item_id,
        });
    }

    static styles = css`
        :host {
            --am-item-primary-color: #ffffff;
            --am-item-background-color: #00000000;
            --am-item-due-primary-color: #ff4a4a;
            --am-item-due-background-color: #ff4a4a14;
            --am-item-due-soon-primary-color: #ffffff;
            --am-item-due-soon-background-color: #00000020;
            --am-item-primary-font-size: 14px;
            --am-item-secondary-font-size: 12px;
            --mdc-theme-primary: var(--primary-text-color);
        }
        .content {
            padding: 0 12px 12px 12px;
        }
        .am-add-form {
            padding-top: 10px;
            display: grid;
            align-items: center;
            gap: 10px;
        }
        .am-add-button {
            padding-top: 10px;
        }
        .duration-input {
            display: flex;
            flex-direction: row;
            gap: 4px;
            align-items: center;
        }
        .header {
            display: grid;
            grid-template-columns: 52px auto min-content;
            align-items: center;
            height: 40px;
            padding: 12px;
            gap: 4px;
        }
        .icon-container {
            display: flex;
            height: 40px;
            width: 40px;
            border-radius: 50%;
            background: rgba(111, 111, 111, 0.2);
            place-content: center;
            align-items: center;
            margin-right: 12px;
        }
        .info-container {
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        .primary {
            font-weight: bold;
        }
        .action-container {
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }
        .am-grid {
            display: grid;
            gap: 6px;
        }
        .am-item {
            display: grid;
            grid-template-columns: auto max-content;
            padding: 12px;
            #color: var(--am-item-primary-color, #ffffff);
            #background-color: var(--am-item-background-color, #000000ff);
            border-radius: 8px;
            align-items: center;
        }
        .am-item-primary {
            font-size: var(--am-item-primary-font-size, 14px);
            font-weight: bold;
        }
        .am-item-secondary {
            font-size: var(--am-item-secondary-font-size, 12px);
        }
        .am-action {
            text-align: right;
        }
        .am-due-soon {
            color: var(--am-item-due-soon-primary-color, #ffffff);
            background-color: var(
                --am-item-due-soon-background-color,
                #00000014
            );
            --mdc-theme-primary: var(--am-item-due-soon-primary-color);
        }
        .am-due {
            color: var(--am-item-due-primary-color, #ffffff);
            background-color: var(--am-item-due-background-color, #00000014);
            --mdc-theme-primary: var(--am-item-due-primary-color);
        }
    `;

    formatTimeAgo(date) {
        const formatter = new Intl.RelativeTimeFormat(undefined, {
            numeric: "auto",
        });

        const DIVISIONS = [
            { amount: 60, name: "seconds" },
            { amount: 60, name: "minutes" },
            { amount: 24, name: "hours" },
            { amount: 7, name: "days" },
            { amount: 4.34524, name: "weeks" },
            { amount: 12, name: "months" },
            { amount: Number.POSITIVE_INFINITY, name: "years" },
        ];
        let duration = (date - new Date()) / 1000;

        for (let i = 0; i < DIVISIONS.length; i++) {
            const division = DIVISIONS[i];
            if (Math.abs(duration) < division.amount) {
                return formatter.format(Math.round(duration), division.name);
            }
            duration /= division.amount;
        }
    }
}

class ActivityManagerCardEditor extends LitElement {
    static get properties() {
        return {
            hass: {},
            _config: {},
        };
    }

    setConfig(config) {
        this._config = config;
    }

    set hass(hass) {
        this._hass = hass;
    }

    _valueChanged(ev) {
        if (!this._config || !this._hass) {
            return;
        }
        const _config = Object.assign({}, this._config);
        _config.category = ev.detail.value.category;
        _config.soonHours = ev.detail.value.soonHours;
        _config.showDueOnly = ev.detail.value.showDueOnly;
        _config.actionTitle = ev.detail.value.actionTitle;
        _config.icon = ev.detail.value.icon;
        this._config = _config;

        const event = new CustomEvent("config-changed", {
            detail: { config: _config },
            bubbles: true,
            composed: true,
        });
        this.dispatchEvent(event);
    }

    render() {
        if (!this._hass || !this._config) {
            return html``;
        }
        return html`
            <ha-form
                .hass=${this._hass}
                .data=${this._config}
                .schema=${[
                    { name: "category", selector: { text: { type: "text" } } },
                    { name: "icon", selector: { icon: {} } },
                    { name: "actionTitle", selector: { text: {} } },
                    { name: "showDueOnly", selector: { boolean: {} } },
                    {
                        name: "soonHours",
                        selector: { number: { unit_of_measurement: "hours" } },
                    },
                ]}
                .computeLabel=${this._computeLabel}
                @value-changed=${this._valueChanged}
            ></ha-form>
        `;
    }

    _computeLabel(schema) {
        var labelMap = {
            category: "Category",
            icon: "Icon",
            actionTitle: "Action button label",
            showDueOnly: "Only show activities that are due",
            soonHours: "Soon to be due (styles the activity)",
            mode: "Manage mode",
        };
        return labelMap[schema.name];
    }
}

customElements.define("activity-manager-card", ActivityManagerCard);
customElements.define(
    "activity-manager-card-editor",
    ActivityManagerCardEditor
);

window.customCards = window.customCards || [];
window.customCards.push({
    type: "activity-manager-card",
    name: "Activity Manager Card",
    preview: true, // Optional - defaults to false
});

import { LitElement, html, until, css, repeat } from "https://cdn.jsdelivr.net/gh/lit/dist@2/all/lit-all.min.js";

class ActivityManagerCard extends LitElement{
    static getConfigElement() {
      return document.createElement("activity-manager-card-editor");
    }

    static getStubConfig() {
        return {
            category: "Activities"
        }
      }

    // Define fields that will trigger re-rendering when changed
    static get properties() {
        return {
            _hass: {},
            _config: {},
            _activities: []
        };
    }

    constructor() {
        super();
        this._activities = []
    }

    setConfig(config) {
        if (!config.category) {
          throw new Error("category must be specified");
        }
        this._config = config;
        this.header = this._config.category || "Activities";
        this._runOnce = false
    }

    set hass(hass) {
        this._hass = hass;
        if (!this._runOnce) {
            // Update when loading
            this.fetchData()

            // Update once an hour
            this._interval = setInterval(() => {
                this.fetchData(hass)
            }, 60000);

            // Update when changes are made
            this._hass.connection.subscribeEvents(
                () => this.fetchData(),
                "activity_manager_updated"
            );

            this._runOnce = true;
        }
    }

    getDueTemplate(item) {
        return html`
        <div class="${(item.difference < 0) ? "unsafe" : "safe"}"">
            ${this.formatTimeAgo(item.due)}
        </div>
        `;
    }

    getActionButton(item) {
        if (!("mode" in this._config) || this._config.mode != "manage")
            return html`
            <div class="right">
                <mwc-button class="button" @click=${this.update_activity} data-am-id=${item.id}>
                Did it!
                </mwc-button>
            </div>
            `;

        return html``;
    }

    getRemoveButton(item) {
        if (this._config["mode"] == "manage")
            return html`
            <div class="right">
                <mwc-button class="button" @click=${this.remove_activity} data-am-id=${item.id}>
                Remove
                </mwc-button>
            </div>
            `;

        return html``;
    }

    getAddForm() {
        if (this._config.mode == "manage")
            return html`
            <hr />
            <form>
                <div class="form-grid-2" >
                    <input
                        type="hidden"
                        id="category-input"
                        placeholder="Category"
                        value="${this._config["category"]}">
                    </input>

                    <ha-textfield type="text" id="activity-input" placeholder="Activity">
                    </ha-textfield>
                    <ha-textfield type="number" id="frequency-input" placeholder="Frequency">
                    </ha-textfield>
                </div>
                <div class="form-grid-1">
                    <mwc-button @click=${this.add_activity}>Add</mwc-button>
                </div>
            </form>
            `
    }

    render() {
        return html`
        <ha-card header=${this.header}>
            <ha-icon @click=${this.switch_mode} id="settings" icon="mdi:cog"></ha-icon>
            <div class="card-content">
                <div class="grid-container">
                    ${repeat(
                        this._activities,
                        (activity) => activity.name,
                        (activity) => html`
                            <div>
                                ${activity.name}
                            </div>
                            ${this.getDueTemplate(activity)}
                            ${this.getActionButton(activity)}
                            ${this.getRemoveButton(activity)}`
                    )}
                </div>
                <div class="grid-container">

                </div>
                ${this.getAddForm()}
            </div>
        </ha-card>
        `;
    }

    switch_mode(ev) {
        if ("mode" in this._config) {
            const { "mode": _, ...rest } = this._config;
            this._config = rest;
        }
        else
            this._config = {...this._config, mode: "manage"}
    }

    fetchData = async () => {
        const items =  await this._hass.callWS({
            type: "activity_manager/items",
        });

        this._activities = items
            .map(item => {
                const completed = new Date(item.last_completed);
                const due = new Date(new Date(item.last_completed).setDate(new Date(item.last_completed).getDate() + item.frequency));
                const now = new Date();
                const difference = (due - now) / (1000 * 60 * 60 * 24)

                return { ...item, due: due, difference: difference, time_unit: "day" }
            })
            .filter(item => {
                if("category" in this._config)
                    return item["category"] == this._config["category"]
                return true;
            })
            .sort((a, b) => {
                if (a["category"] == b["category"])
                    return a["name"].toLowerCase().localeCompare(b["name"].toLowerCase());
                return a["category"].toLowerCase().localeCompare(b["category"].toLowerCase());
            });
        console.log(this._activities);
    };

    _add_activity = async (name, category, frequency) => {
        const result = await this._hass.callWS({
            type: "activity_manager/add",
            name: name,
            category: category,
            frequency: parseInt(frequency)
        });

        return result;
    }

    add_activity(ev) {
        ev.stopPropagation();
        const activity_name = this.shadowRoot.querySelector("#activity-input").value
        const category_name = this.shadowRoot.querySelector("#category-input").value
        const frequency = this.shadowRoot.querySelector("#frequency-input").value

        this._add_activity(activity_name, category_name, frequency).then(() => this.fetchData());
    }

    _update_activity = async (id) => {
        const result = await this._hass.callWS({
            type: "activity_manager/update",
            item_id: id,
        });

        return result;
    }

    update_activity(ev) {
        ev.stopPropagation();
        const item_id = ev.target.dataset.amId;
        this._update_activity(
            item_id).then(() => this.fetchData());
    }

    _remove_activity = async (item_id) => {
        const result = await this._hass.callWS({
            type: "activity_manager/remove",
            item_id: item_id,
        });

        return result;
    }

    remove_activity(ev) {
        ev.stopPropagation();
        const item_id = ev.target.dataset.amId;
        this._remove_activity(item_id);
    }

    static styles = css`
    .grid-container {
        display: grid;
        grid-template-columns: 1fr 1fr 25%;
        align-items: center;
        gap: 10px;
    }
    .form-grid-3 {
        padding-top: 10px;
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        align-items: center;
        gap: 10px;
    }
    .form-grid-2 {
        padding-top: 10px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        align-items: center;
        gap: 10px;
    }
    .form-grid-1 {
        padding-top: 10px;
        display: grid;
        grid-template-columns: 1fr;
        align-items: center;
        gap: 10px;
    }
    .right {
        text-align: right;
    }

    button {
        background-color: var(--primary-color);
    }
    .safe {
    }
    .unsafe {
        color: var(--error-color);
    }

    #settings {
        position: absolute;
        top: 22px;
        right: 20px;
    }
    `;

    formatTimeAgo(date) {
        const formatter = new Intl.RelativeTimeFormat(undefined, {
            numeric: 'auto'
        })

        const DIVISIONS = [
            { amount: 60, name: 'seconds' },
            { amount: 60, name: 'minutes' },
            { amount: 24, name: 'hours' },
            { amount: 7, name: 'days' },
            { amount: 4.34524, name: 'weeks' },
            { amount: 12, name: 'months' },
            { amount: Number.POSITIVE_INFINITY, name: 'years' }
        ]
        let duration = (date - new Date()) / 1000

        for (let i = 0; i < DIVISIONS.length; i++) {
          const division = DIVISIONS[i]
          if (Math.abs(duration) < division.amount) {
            return formatter.format(Math.round(duration), division.name)
          }
          duration /= division.amount
        }
    }
}

class ActivityManagerCardEditor extends LitElement {
    setConfig(config) {
        this._config = config;
    }

    get _category() {
        return this._config?.category || '';
    }

    configChanged(newConfig) {
        const event = new Event("config-changed", {
            bubbles: true,
            composed: true,
        });
        event.detail = { config: newConfig };
        this.dispatchEvent(event);
    }
}

customElements.define("activity-manager-card", ActivityManagerCard);
customElements.define("activity-manager-card-editor", ActivityManagerCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
    type: "activity-manager-card",
    name: "Activity Manager Card",
    preview: true, // Optional - defaults to false
});
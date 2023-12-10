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
        this._config = structuredClone(config);
        this._config.header = this._config.header || this._config.category || "Activities";
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


    getActionButton(item) {
        if (this._config.mode == "basic")
            return html`
            <div class="right am-action">
                <mwc-button class="button" @click=${this.update_activity} data-am-id=${item.id}>
                ${this._config["actionTitle"]}
                </mwc-button>
            </div>
            `;

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
                <div class="am-add-form" >
                    <input
                        type="hidden"
                        id="category-input"
                        placeholder="Category"
                        value="${this._config["category"]}">
                    </input>

                    <ha-textfield type="text" id="activity-input" placeholder="Activity">
                    </ha-textfield>
                    <div class="duration-input">
                        <ha-textfield type="number" label="HH" id="frequency-hour">
                        </ha-textfield>:<ha-textfield type="number" label="MM" id="frequency-minute">
                        </ha-textfield>:<ha-textfield type="number" label="SS"id="frequency-second">
                        </ha-textfield>
                    </div>
                </div>
                <div class="am-add-button">
                    <mwc-button @click=${this.add_activity}>Add</mwc-button>
                </div>
            </form>
            `
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
                    <ha-icon @click=${this.switch_mode} id="settings" icon="mdi:dots-vertical"></ha-icon>
                </div>
            </div>
            <div class="content">
                <div class="am-grid">
                    ${repeat(
                        this._activities,
                        (activity) => activity.name,
                        (activity) => html`
                            <div class="am-item
                                        ${(activity.difference < 0) ? "am-due" : ""}
                                        ${(activity.difference > 0 && activity.difference < (this._config.soonHours*60*60*1000)) ? "am-due-soon" : ""}"
                            >
                                <div class="am-item-name">
                                    <div class="am-item-primary">
                                        ${activity.name}
                                    </div>
                                    <div class="am-item-secondary">
                                        ${this.formatTimeAgo(activity.due)}
                                    </div>
                                </div>
                                ${this.getActionButton(activity)}
                            </div>`
                    )}
                </div>
                ${this.getAddForm()}
            </div>
        </ha-card>
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
        const items =  await this._hass?.callWS({
            type: "activity_manager/items",
        }) || [];

        this._activities = items
            .map(item => {
                const completed = new Date(item.last_completed);
                const due = new Date(completed.valueOf() + item.frequency_ms);
                //const due = new Date(new Date(item.last_completed).setDate(new Date(item.last_completed).getDate() + item.frequency_ms));
                const now = new Date();
                const difference = (due - now) // miliseconds

                return { ...item, due: due, difference: difference, time_unit: "day" }
            })
            .filter(item => {
                if("category" in this._config)
                    return (item["category"] == this._config["category"] || item["category"] == "Activities")
                return true;
            })        
            .filter(item => {
                if (this._config.showDueOnly)
                    return item["difference"] < 0;
                return true;
            })
            .sort((a, b) => {
                if (a["category"] == b["category"])
                    return a["name"].toLowerCase().localeCompare(b["name"].toLowerCase());
                return a["category"].toLowerCase().localeCompare(b["category"].toLowerCase());
            });
    };

    _add_activity = async (name, category, frequency_ms) => {
        const result = await this._hass.callWS({
            type: "activity_manager/add",
            name: name,
            category: category,
            frequency_ms: parseInt(frequency_ms)
        });

        return result;
    }

    add_activity(ev) {
        ev.stopPropagation();
        const activity_name = this.shadowRoot.querySelector("#activity-input").value
        const category_name = this.shadowRoot.querySelector("#category-input").value
        //const frequency = this.shadowRoot.querySelector("#frequency-input").value
        const frequency_hh = this._getNumber(this.shadowRoot.querySelector("#frequency-hour").value, 0) * 60 * 60 * 1000
        const frequency_mm = this._getNumber(this.shadowRoot.querySelector("#frequency-minute").value, 0) * 60 * 1000
        const frequency_ss = this._getNumber(this.shadowRoot.querySelector("#frequency-second").value, 0) * 1000
        console.log(frequency_hh, frequency_mm, frequency_ss);

        this._add_activity(activity_name, category_name, frequency_hh+frequency_mm+frequency_ss).then(() => this.fetchData());
        
    }
    _getNumber(value, defaultValue) {
        const num = parseInt(value, 10);
        return isNaN(num) ? defaultValue : num;
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

    .header{
        display: grid;
        height: 40px;
        padding: 12px;
        grid-template-columns: min-content auto 40px;
        gap: 4px;
    }
    .icon-container{
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
        grid-template-columns: auto min-content;
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
        background-color: var(--am-item-due-soon-background-color, #00000014);
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
      _config.mode = ev.detail.value.mode;
      
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
            {name: "category", selector: { text: {type:'text'} }},
            {name: "icon", selector: {icon: {}}},
            {name: "actionTitle", selector: {text: {}}},
            {name: "mode", selector: { select: {
                mode: "dropdown", 
                options:[
                    {label: "Basic", value: "basic"},
                    {label: "Manager", value: "manage"},
                ]
            }}},
            {name: "showDueOnly", selector: {boolean: {}}},
            {name: "soonHours", selector: {number: { unit_of_measurement: "hours" }}},
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
            mode: "Manage mode"          
        }
        return labelMap[schema.name];
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

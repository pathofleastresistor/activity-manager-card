# activity-manager-card

A Lovelace card companion to the [Activity Manager](https://github.com/pathofleastresistor/activity-manager) integration.

The card displays your recurring activities with due-date awareness — overdue items are highlighted, upcoming items are flagged, and you can manage your activities (add, edit, delete) directly from the card.

## Installation

### HACS

1. Open the HACS section of Home Assistant.
2. Click the "..." button in the top right corner and select "Custom Repositories."
3. Paste this repository's GitHub URL, select "Lovelace", and click Install.

### Manually

1. Copy `activity-manager.js` into `<config>/www/activity-manager-card/`.
2. Add it as a dashboard resource: Settings → Dashboards → Resources → Add resource
   - URL: `/local/activity-manager-card/activity-manager.js`
   - Type: JavaScript module

## Configuration

The card has a built-in visual editor. Click the card in edit mode to configure it. All fields are optional except the activity list.

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `entry_id` | Yes | — | The activity list to display. Select from the dropdown in the card editor. |
| `header` | No | List name | Title shown at the top of the card |
| `icon` | No | `mdi:format-list-checkbox` | Icon shown in the card header |
| `category` | No | — | Filter to only show activities from a specific category |
| `showDueOnly` | No | `false` | When `true`, only shows overdue and due-soon activities |
| `soonHours` | No | `24` | Activities due within this many hours are styled as "due soon" |
| `mode` | No | `list` | `list` is the full card. `summary` is a single tile-style row, see [Summary mode](#summary-mode). |
| `tap_action` | No | none | Summary mode only. What tapping the row does, see [Summary mode](#summary-mode). |

Example YAML configuration:

```yaml
type: custom:activity-manager-card
entry_id: <your-entry-id>
header: Home
category: Cleaning
showDueOnly: false
soonHours: 48
```

## Summary mode

Set `mode: summary` to get a single compact row for a dashboard: an icon, a title, a **due** count and an **overdue** count. The row turns amber when something is due soon and red when something is overdue. Under the title it lists the names of the due activities, or, when nothing is due, the next one coming up.

```yaml
type: custom:activity-manager-card
mode: summary
entry_id: <your-entry-id>
category: Workout        # optional: count only this category
header: Workout
icon: mdi:dumbbell
soonHours: 24            # optional, default 24
tap_action:
  action: navigate
  navigation_path: /lovelace/activities
```

- **Due** includes overdue: "2 due, 1 overdue" means two activities need doing and one of them is already late. "Due" is overdue plus anything coming due within `soonHours`.
- Counts are computed from the same data the list card uses, so they match it and the "due soon" threshold is the card's `soonHours`. They update when activities change and when an activity becomes due or overdue, with no reload. Nothing else is needed from the integration, so summary mode works with older versions of it.
- `header`, `icon`, `category` and `soonHours` work as in list mode. `showDueOnly`, `compact` and `sortBy` do nothing in summary mode.
- Add one card per category (or one with no `category` for the whole list). They sit well in a grid or a horizontal stack.

`tap_action` is optional. Without it the row is not clickable. Supported actions:

| `action` | Extra options | Does |
|----------|---------------|------|
| `navigate` | `navigation_path` (required), `navigation_replace` | Go to another dashboard view |
| `url` | `url_path` | Open a URL in a new tab |
| `more-info` | `entity` | Open the more-info dialog for an entity, e.g. `sensor.home_due` from the integration |
| `none` | | Do nothing |

The visual editor has a **Display mode** selector; choosing *Summary* shows the tap action picker and hides the list-only options.

If you also want automations or native Home Assistant tiles, the integration has matching sensors (`sensor.<list>_due`, `sensor.<list>_overdue`, per-category variants and a "has due activities" binary sensor) in versions that include them. See the [integration README](https://github.com/pathofleastresistor/activity-manager#summary-entities).

## Features

### Viewing activities

Activities are sorted by category then name. Each row shows:
- The activity's icon and status colour (green = ok, amber = due soon, red = overdue)
- The activity name and category
- How long until the activity is due (or how long it has been overdue)

Click any activity row to mark it as done. A confirmation dialog lets you set the exact completion datetime before confirming.

### Managing activities

Click the pencil icon in the card header to open the manage panel. From here you can:

- **Add** a new activity (name, category, icon, frequency, last completed date)
- **Edit** an existing activity
- **Delete** an activity

Frequency can be set in days, hours, and minutes.

## Status colours

| Colour | Meaning |
|--------|---------|
| Grey | Activity is on track (not due yet) |
| Amber | Activity is due within `soonHours` (default 24 hours) |
| Red | Activity is overdue |

## Development

The card is the single file `activity-manager.js`, with no build step. `package.json` only holds the test tooling:

```sh
npm install
npm test
```

The tests render the card in jsdom with a mocked `hass`. `tests/legacy-render.test.js` compares the output of every pre-existing option against a stored render and also requires the original stylesheet to stay unchanged, so changes to list mode show up as test failures.

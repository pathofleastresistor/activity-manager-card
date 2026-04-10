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

Example YAML configuration:

```yaml
type: custom:activity-manager-card
entry_id: <your-entry-id>
header: Home
category: Cleaning
showDueOnly: false
soonHours: 48
```

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

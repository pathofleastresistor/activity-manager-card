# EARLY RELEASE
This was designed to solve a personal need and I'm now trying to prepare it for others to use. That means several things can break between releases.

# activity-manager-card
A Lovelace card designed as a companion to the [Activity Manager](https://github.com/pathofleastresistor/activity-manager) component.

## Installation

### Manually
1. Copy activity-manager.js into your `<config>/<www>` folder
2. Add `activity-manager.js` as a dashboard resource.


### HACS

1. Open the HACS section of Home Assistant.
2. Click the "..." button in the top right corner and select "Custom Repositories."
3. In the window that opens paste this Github URL.
4. Select "Lovelace"
5. In the window that opens when you select it click om "Install This Repository in HACS"

## Usage
| Field | Required| Description |
| - | -| - |
| header | no | Title of the card |
| category | no | Filter activities to a specific category |
| mode | no| Set to "manage" if you want the manager interface. Defaults to basic mode.|
| showDueOnly | no | Set to `true` and only activities that are due is shown

```
type: custom:activity-manager-card
header: Home
category: Home
mode: manage
```
<p align="center">
  <img width="300" src="images/manager.png">
</p>

```
type: custom:activity-manager-card
header: Home
category: Home
```
<p align="center">
  <img width="300" src="images/basic.png">
</p>

## Customization
If you want to customize the card style, you can use [Lovlace Card Mod](https://github.com/thomasloven/lovelace-card-mod). Here are some classes:

| Class | Description |
| - | - |
| .am-grid | Adjust the grid layout of the activities |
| .am-item-name | Style activity name |
| .am-due-date | Style the due date column |
| .am-due | Style the date if it's due. By default, the text is red. |
| .am-action | Style the action column |

## More information
* Activities are stored in .activities_list.json in your `<config>` folder
* An entity is created for each activity (e.g. `activity_manager.<category>_<activity>`). The state of the activity is when the activity is due. You can use this entity to build notifications or your own custom cards.

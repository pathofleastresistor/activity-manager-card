# activity-manager-card



# Installation
## HACS
Add this repository as a Lovelace respository in HACS

# Usage
```
type: custom:activity-manager-card
header: Home
category: Home
mode: manage
```

| Field | Required| Description |
| - | -| - |
| header | no | Title of the card |
| category | no | Filter activities to a specific category |
| mode | no| Set to "manage" if you want the manager interface. Defaults to basic mode.|

# More information
* Activities are stored in .activities_list.json in your `<config>` folder
* An entity is created for each activity (e.g. `activity_manager.<category>_<activity>`). The state of the activity is when the activity is due. You can use this entity to build notifications or your own custom cards.
# MITRE ATT&CK for Visual Studio Code

![This was supposed to be a badge](https://github.com/rctgardner/vscode-attack/workflows/build/badge.svg)
![This was supposed to be a badge](https://github.com/rctgardner/vscode-attack/workflows/release/badge.svg)

Provides features for working with MITRE ATT&CK techniques.

## Editor Features

### Code Completion

This extension provides Intellisense-like support for ATT&CK tactics, techniques and sub-techniques. This includes completions for technique names too, so typing either `Powers` or `T1059.001` will insert the appropriate text.

If enabled, code completion is supported for Group, Mitigation, and Software IDs/names. However, by default, these providers are disabled. To enable them, go into the `vscode-attack` section of Settings and check which objects you would like to enable.

### Hover

This extension provides descriptions when hovering over tactic and technique IDs, which include the name, MITRE ATT&CK source link, and configurable descriptions pulled from the ATT&CK technique information.

Like code completion, hovers are supported for Group, Mitigation, and Software IDs, and they can be enabled using the appropriate toggles.

### Technique Search

This extension provides a command that allows searching for techniques by their technique IDs, names, or interesting keywords found in the descriptions.

For example, searching for the keyword `certutil`, which is not present in any technique name, will yield a result for `T1140 Deobfuscate/Decode Files or Information`, because there is a reference to it in the description. Any matching techniques reveal webpanel with results similar to those found in the hover results.

## Miscellaneous

### Automatic Updating

The extension will attempt to keep track of new versions of the MITRE ATT&CK framework and download them from [The Cyber Threat Intelligence Repository of ATT&CK and CAPEC catalogs](https://github.com/mitre/cti) if available.

### Window Items

The version of ATT&CK currently in use will be displayed in the lower right-hand corner of the IDE (e.g. `ATT&CK v8.1`).

Clicking on this item will also execute the `Search` command and prompt the user for a term to search within the IDE.

### Configurability

Certain aspects of this extension can be configured using the Visual Studio Code Settings page.

#### Applicable Files

By default, this extension applies to saved Markdown and YAML files, but this setting is configurable using the `vscode-attack.applicableFiles` setting.

Users can add [DocumentFilters](https://code.visualstudio.com/api/references/vscode-api#DocumentFilter) to register new document types.

For example, if a user wants this extension to apply to all Python scripts, all `_reports.txt` files, and unsaved files, add the following filters:
```txt
{ "language": "python" },
{ "pattern": "*_reports.txt" },
{ "scheme": "untitled" }
```

#### Completion Format

By default, this extension inserts ATT&CK objects by their object ID, such as `T1059`.

Users can modify the setting `vscode-attack.completionFormat` to display one of the following options instead:

* `name`: Display the object by name, such as `Command and Scripting Interpreter`
* `fullname`: Display the object by name and parent if it is a sub-technique, such as `Command and Scripting Interpreter: PowerShell`
* `id-name`: Display the object by their ID and name, such as `T1059.001 PowerShell`
* `id-fullname`: Display the object by their ID, name, and parent if it is a sub-technique, such as `T1059.001 Command and Scripting Interpreter: PowerShell`

#### Description Length

By default, this extension displays only the first line in ATT&CK object descriptions, such as those found in the Hover and Code Completion messages.

Users can modify the `vscode-attack.description` setting to display just the name + source link (using the `short` option), or the full description (using the `long` option).

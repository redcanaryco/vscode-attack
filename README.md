# MITRE ATT&CK for Visual Studio Code

![This was supposed to be a badge](https://github.com/rctgardner/vscode-attack/workflows/Run%20Tests/badge.svg)

Provides features for working with MITRE ATT&CK techniques.

## Code Completion

This extension provides Intellisense-like support for ATT&CK tactics, techniques and sub-techniques. This includes completions for technique names too, so typing either `Powers` or `T1059.001` will insert the appropriate text.

There is also a setting for configuring the format of inserted text, which allows for inserting most combinations of the technique ID, technique name, and/or technique parent name, if available:

```txt
T1059.001
PowerShell
Command and Scripting Interpreter: PowerShell
T1059.001 PowerShell
T1059.001 Command and Scripting Interpreter: PowerShell
```

## Hover

This extension provides descriptions when hovering over tactic and technique IDs, which include the name, MITRE ATT&CK source link, and configurable descriptions pulled from the ATT&CK technique information.

## Technique Search

This extension provides a command that allows searching for techniques by their technique IDs, names, or interesting keywords found in the descriptions.

For example, searching for the keyword `certutil`, which is not present in any technique name, will yield a result for `T1140 Deobfuscate/Decode Files or Information`, because there is a reference to it in the description. Any matching techniques reveal an HTML-based webpanel with results similar to those found in the hover results.

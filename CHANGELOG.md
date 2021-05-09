# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2021-05-09

- Improved logging to include timestamps and more verbose messaging around ATT&CK map download process
- Standardized more tests
- New completion item format: `link`: insert an unformatted link to the attack.mitre.org site when performing code completion
- New command: `vscode-attack.insertLink`: convert a preexisting ATT&CK ID or name into a Markdown link to the attack.mitre.org site

## [1.0.0] - 2021-01-18

- Lots of code linting and cleanup
- Split off tests into discrete modules for readability purposes

## [0.1.1] - 2020-11-22

- Updated README to include newly-added features from 0.1.0
- Limiting results from technique description searches to improve result time

## [0.1.0] - 2020-11-18

- Added Completions and Hovers for ATT&CK Groups, Software, and Mitigations
- Added new settings to toggle various providers based on ATT&CK item type (`vscode-attack.groups`, `.mitigations`, `.tactics`, etc.)

[Unreleased]: https://github.com/redcanaryco/vscode-attack/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/redcanaryco/vscode-attack/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/redcanaryco/vscode-attack/compare/v0.1.1...v1.0.0
[0.1.1]: https://github.com/redcanaryco/vscode-attack/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/redcanaryco/vscode-attack/commit/0e439fa94b7f762462d6144b5e4445f9dfbf175a

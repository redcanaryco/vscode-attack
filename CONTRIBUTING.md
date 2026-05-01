# Contributing to VSCode ATT&CK

## Prerequisites

- [Node.js](https://nodejs.org/) v14+ and npm
- [Visual Studio Code](https://code.visualstudio.com/) v1.57+

## Setup

```bash
git clone https://github.com/redcanaryco/vscode-attack.git
cd vscode-attack
npm install
```

## Building

One-shot compile:

```bash
npm run compile
```

Watch mode (recompiles on file changes):

```bash
npm run watch
```

## Running and Debugging

### Desktop Extension

Press **F5** in VS Code (or **Run > Start Debugging**). This launches a new Extension Development Host window with the extension loaded. The `Run Extension` launch configuration in `.vscode/launch.json` handles compilation automatically via a pre-launch task.

### Web Extension (vscode.dev)

```bash
npm run run-in-browser
```

Or use the `Run Web Extension` launch configuration in VS Code.

### Debug Logging

Enable `vscode-attack.debug` in VS Code settings, then check the **MITRE ATT&CK** output channel (**View > Output** and select "MITRE ATT&CK" from the dropdown).

## Testing

Run the full test suite:

```bash
npm test
```

This compiles the extension and tests, then runs them via `@vscode/test-electron` and Mocha.

To debug tests, use the `Extension Tests` launch configuration in VS Code, which lets you set breakpoints in test files.

### Test Structure

```
test/
  files/           # Test fixtures (ATT&CK JSON snapshots, sample markdown)
  suite/
    extension.test.ts    # Core extension, caching, version comparison
    techniques.test.ts   # Technique hover/completion providers
    tactics.test.ts      # Tactic providers
    groups.test.ts       # Group providers
    software.test.ts     # Software providers
    mitigations.test.ts  # Mitigation providers
    commands.test.ts     # Search and insertLink commands
    testHelpers.ts       # Shared utilities (config helpers, cleanup)
```

### Writing Tests

Follow the existing Mocha pattern. Use `vscode.commands.executeCommand('vscode.executeHoverProvider', ...)` and `vscode.commands.executeCommand('vscode.executeCompletionItemProvider', ...)` to test providers.

## Linting

```bash
npm run lint          # Source files
npm run linttests     # Test files
```

## Project Structure

```
src/
  extension.ts        # Entry point: activation, caching, command registration
  configuration.ts    # Settings management, matrix config constants
  helpers.ts          # HTTP downloads, version comparison, file utilities
  interfaces.ts       # TypeScript interfaces for all ATT&CK object types
  techniques.ts       # Technique hover + completion providers
  tactics.ts          # Tactic providers
  groups.ts           # Group providers
  software.ts         # Software providers
  mitigations.ts      # Mitigation providers
  search.ts           # Search webview command
  insertLink.ts       # Insert ATT&CK link command
```

### Data Flow

1. `activate()` reads configuration and calls `cacheData()` to download or load cached ATT&CK STIX data
2. Each `init()` function parses raw STIX objects into typed arrays (techniques, tactics, etc.)
3. `registerFeatures()` creates hover and completion providers for the configured file types
4. Providers use regex matching (e.g. `/T\d{4}([./]\d{3})?/`) to detect ATT&CK IDs in documents

### Caching

ATT&CK data is cached in VS Code's global storage directory with filenames like `enterprise-attack.16.1.json`, `mobile-attack.16.1.json`. The extension checks GitHub for newer versions at startup and optionally on a periodic interval.

## Packaging

Install the VS Code Extension Manager:

```bash
npm install -g @vscode/vsce
```

Build for production and create a VSIX package:

```bash
npm run vscode:prepublish
vsce package
```

The resulting `.vsix` file can be installed locally or published to the VS Code Marketplace.

## Contributing Code

1. Fork the repository and create a feature branch
2. Make changes and add/update tests as needed
3. Run `npm test` and `npm run lint` to verify
4. Commit with a clear message describing the change
5. Open a Pull Request against the `main` branch

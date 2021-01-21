import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { groupRegex } from '../../helpers';
import { configSection, extensionID, ignoreConsoleLogs, resetState, setTestConfig } from '../suite/testHelpers';


describe('Groups', function () {
    const testPath: string = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'files', 'test.md');
    const testUri: vscode.Uri = vscode.Uri.file(testPath);
    let ext: vscode.Extension<unknown> | undefined;
    let modifiedConfig: vscode.WorkspaceConfiguration;

    before(async function () {
        ignoreConsoleLogs();
        ext = vscode.extensions.getExtension(extensionID);
        await ext?.activate();
        exports = ext?.exports;
        modifiedConfig = vscode.workspace.getConfiguration(configSection);
        await modifiedConfig.update('groups', true, vscode.ConfigurationTarget.Global);
    });
    after(async function () {
        await modifiedConfig.update('groups', false, vscode.ConfigurationTarget.Global);
    });
    beforeEach(ignoreConsoleLogs);
    afterEach(resetState);

    it('regex should match group ID', async function () {
        const gid = 'G0007';
        assert.ok(groupRegex.test(gid));
    });
    it('should provide one competion item for exact group IDs', async function () {
        const expectedGID = 'G0007';
        const position: vscode.Position = new vscode.Position(9, expectedGID.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].label, expectedGID);
        assert.strictEqual(results.items[0].kind, vscode.CompletionItemKind.Value);
    });
    it('should provide all completion items containing a group name', async function () {
        const expectedName = 'APT28';
        const position: vscode.Position = new vscode.Position(10, expectedName.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        const groupResults: Array<vscode.CompletionItem> = results.items.filter((item: vscode.CompletionItem) => {
            return item instanceof vscode.CompletionItem && groupRegex.test(`${item.detail}`);
        });
        assert.strictEqual(groupResults.length, 1);
        assert.ok(groupResults[0] instanceof vscode.CompletionItem);
        assert.strictEqual(groupResults[0].label, expectedName);
        assert.strictEqual(groupResults[0].kind, vscode.CompletionItemKind.Value);
    });
    it('should provide a hover for group IDs', async function () {
        const expectedGID = 'G0007';
        const expectedLink = `[Source Link](https://attack.mitre.org/groups/${expectedGID})`;
        const position: vscode.Position = new vscode.Position(9, expectedGID.length);
        const expectedRange: vscode.Range = new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, position.character));
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 1);
        assert.ok(results[0] instanceof vscode.Hover);
        assert.deepStrictEqual(results[0].range, expectedRange);
        const contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
        assert.ok(contents.value.includes(expectedLink));
    });
});

describe('Group Settings', function () {
    // bumping timeout on this due to config updates in afterEach()
    // ... potentially taking a long time
    this.timeout(5000);

    let modifiedConfig: vscode.WorkspaceConfiguration;
    const testPath: string = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'files', 'test.md');
    const testUri: vscode.Uri = vscode.Uri.file(testPath);

    beforeEach(() => {
        ignoreConsoleLogs();
        modifiedConfig = vscode.workspace.getConfiguration(configSection);
    });
    afterEach(async () => {
        await modifiedConfig.update('groups', false, vscode.ConfigurationTarget.Global);
        resetState();
    });
    it('should enable the Group providers when set to true', async function () {
        await setTestConfig('groups', true, modifiedConfig);
        const expectedGID = 'G0007';
        const position: vscode.Position = new vscode.Position(9, expectedGID.length);
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 1);
    });
    it('should disable the Group providers when set to false', async function () {
        await setTestConfig('groups', false, modifiedConfig);
        const expectedGID = 'G0007';
        const position: vscode.Position = new vscode.Position(9, expectedGID.length);
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 0);
    });
});

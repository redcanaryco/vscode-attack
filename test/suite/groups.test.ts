import * as assert from 'assert';
import * as vscode from 'vscode';
import { groupRegex } from '../../src/helpers';
import { configSection, extensionID, ignoreConsoleLogs, resetState, setTestConfig } from './testHelpers';


function isGroup(item: vscode.CompletionItem) {
    return groupRegex.test(`${item.detail}`);
}

describe('Groups', function () {
    const testUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/test.md`);
    let ext: vscode.Extension<unknown> | undefined;
    let modifiedConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(configSection);

    before(async function () {
        ignoreConsoleLogs();
        ext = vscode.extensions.getExtension(extensionID);
        await ext?.activate();
        exports = ext?.exports;
        await setTestConfig('groups', true, modifiedConfig);
    });
    after(async function () {
        await setTestConfig('groups', undefined, modifiedConfig);
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
        const groupResults: Array<vscode.CompletionItem> = results.items.filter(isGroup);
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
    const testUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/test.md`);
    const modifiedConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(configSection);

    before(async function () {
        await setTestConfig('groups', true, modifiedConfig);
    });
    beforeEach(async function () {
        ignoreConsoleLogs();
    });
    afterEach(async function () {
        resetState();
    });
    after(async function () {
        await setTestConfig('groups', undefined, modifiedConfig);
        await setTestConfig('completionFormat', undefined, modifiedConfig);
    });
    it('completionFormat: should show only an ID when set to id', async function () {
        const gid = 'G0007';
        const expectedDetail: string = gid;
        await setTestConfig('completionFormat', 'id', modifiedConfig);
        const position: vscode.Position = new vscode.Position(9, gid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show only a name when set to name', async function () {
        const gid = 'G0007';
        const expectedDetail = 'APT28';
        await setTestConfig('completionFormat', 'name', modifiedConfig);
        const position: vscode.Position = new vscode.Position(9, gid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show only a link when set to link', async function () {
        const gid = 'G0007';
        const expectedDetail = 'https://attack.mitre.org/groups/G0007';
        await setTestConfig('completionFormat', 'link', modifiedConfig);
        const position: vscode.Position = new vscode.Position(9, gid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show only a name when set to fullname', async function () {
        const gid = 'G0007';
        const expectedDetail = 'APT28';
        await setTestConfig('completionFormat', 'fullname', modifiedConfig);
        const position: vscode.Position = new vscode.Position(9, gid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show an ID and name when set to id-name', async function () {
        const gid = 'G0007';
        const expectedDetail = `${gid} APT28`;
        await setTestConfig('completionFormat', 'id-name', modifiedConfig);
        const position: vscode.Position = new vscode.Position(9, gid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show an ID and name when set to id-fullname', async function () {
        const gid = 'G0007';
        const expectedDetail = `${gid} APT28`;
        await setTestConfig('completionFormat', 'id-fullname', modifiedConfig);
        const position: vscode.Position = new vscode.Position(9, gid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('should enable the Group providers when set to true', async function () {
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

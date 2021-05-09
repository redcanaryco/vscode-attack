import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { softwareRegex } from '../../helpers';
import { configSection, extensionID, ignoreConsoleLogs, resetState, setTestConfig } from '../suite/testHelpers';


describe('Software', function () {
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
        await setTestConfig('software', true, modifiedConfig);
    });
    after(async function () {
        await setTestConfig('software', undefined, modifiedConfig);
    });
    beforeEach(ignoreConsoleLogs);
    afterEach(resetState);

    it('regex should match software ID', async function () {
        const gid = 'S0045';
        assert.ok(softwareRegex.test(gid));
    });
    it('should provide one competion item for exact software IDs', async function () {
        const expectedSID = 'S0045';
        const position: vscode.Position = new vscode.Position(11, expectedSID.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].label, expectedSID);
        assert.strictEqual(results.items[0].kind, vscode.CompletionItemKind.Value);
    });
    it('should provide all completion items containing a software name', async function () {
        const expectedName = 'ADVSTORESHELL';
        const position: vscode.Position = new vscode.Position(12, expectedName.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        const softwareResults: Array<vscode.CompletionItem> = results.items.filter((item: vscode.CompletionItem) => {
            return item instanceof vscode.CompletionItem && softwareRegex.test(`${item.detail}`);
        });
        assert.strictEqual(softwareResults.length, 1);
        assert.ok(softwareResults[0] instanceof vscode.CompletionItem);
        assert.strictEqual(softwareResults[0].label, expectedName);
        assert.strictEqual(softwareResults[0].kind, vscode.CompletionItemKind.Value);
    });
    it('should provide a hover for software IDs', async function () {
        const expectedSID = 'S0045';
        const expectedLink = `[Source Link](https://attack.mitre.org/software/${expectedSID})`;
        const position: vscode.Position = new vscode.Position(11, expectedSID.length);
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

describe('Software Settings', function () {
    // bumping timeout on this due to config updates in afterEach()
    // ... potentially taking a long time
    this.timeout(5000);
    const testPath: string = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'files', 'test.md');
    const testUri: vscode.Uri = vscode.Uri.file(testPath);
    const modifiedConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(configSection);;

    before(async function () {
        await setTestConfig('software', true, modifiedConfig);
    });
    beforeEach(function () {
        ignoreConsoleLogs();
    });
    afterEach(async function () {
        resetState();
    });
    after(async function () {
        await setTestConfig('software', undefined, modifiedConfig);
        await setTestConfig('completionFormat', undefined, modifiedConfig);
    });
    it('completionFormat: should show only an ID when set to id', async function () {
        const sid = 'S0045';
        const expectedDetail: string = sid;
        await setTestConfig('software', true, modifiedConfig);
        await setTestConfig('completionFormat', 'id', modifiedConfig);
        const position: vscode.Position = new vscode.Position(11, sid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show only a name when set to name', async function () {
        const sid = 'S0045';
        const expectedDetail = 'ADVSTORESHELL';
        await setTestConfig('software', true, modifiedConfig);
        await setTestConfig('completionFormat', 'name', modifiedConfig);
        const position: vscode.Position = new vscode.Position(11, sid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show only a link when set to link', async function () {
        const sid = 'S0045';
        const expectedDetail = 'https://attack.mitre.org/software/S0045';
        await setTestConfig('software', true, modifiedConfig);
        await setTestConfig('completionFormat', 'link', modifiedConfig);
        const position: vscode.Position = new vscode.Position(11, sid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show only a name when set to fullname', async function () {
        const sid = 'S0045';
        const expectedDetail = 'ADVSTORESHELL';
        await setTestConfig('software', true, modifiedConfig);
        await setTestConfig('completionFormat', 'fullname', modifiedConfig);
        const position: vscode.Position = new vscode.Position(11, sid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show an ID and name when set to id-name', async function () {
        const sid = 'S0045';
        const expectedDetail = `${sid} ADVSTORESHELL`;
        await setTestConfig('software', true, modifiedConfig);
        await setTestConfig('completionFormat', 'id-name', modifiedConfig);
        const position: vscode.Position = new vscode.Position(11, sid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show an ID and name when set to id-fullname', async function () {
        const sid = 'S0045';
        const expectedDetail = `${sid} ADVSTORESHELL`;
        await setTestConfig('software', true, modifiedConfig);
        await setTestConfig('completionFormat', 'id-fullname', modifiedConfig);
        const position: vscode.Position = new vscode.Position(11, sid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('should enable the Software providers when set to true', async function () {
        await setTestConfig('software', true, modifiedConfig);
        const expectedSID = 'S0045';
        const position: vscode.Position = new vscode.Position(11, expectedSID.length);
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 1);
    });
    it('should disable the Software providers when set to false', async function () {
        await setTestConfig('software', false, modifiedConfig);
        const expectedSID = 'S0045';
        const position: vscode.Position = new vscode.Position(11, expectedSID.length);
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 0);
    });
});

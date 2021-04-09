import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { mitigationRegex } from '../../helpers';
import { configSection, extensionID, ignoreConsoleLogs, resetState, setTestConfig } from '../suite/testHelpers';


describe('Mitigations', function () {
    const testPath: string = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'files', 'test.md');
    const testUri: vscode.Uri = vscode.Uri.file(testPath);
    let ext: vscode.Extension<unknown> | undefined;
    let modifiedConfig: vscode.WorkspaceConfiguration;

    before(async function () {
        ignoreConsoleLogs();
        ext = vscode.extensions.getExtension(extensionID);
        await ext?.activate();
        modifiedConfig = vscode.workspace.getConfiguration(configSection);
        await modifiedConfig.update('mitigations', true, vscode.ConfigurationTarget.Global);
    });
    after(async function () {
        await modifiedConfig.update('mitigations', false, vscode.ConfigurationTarget.Global);
    });
    beforeEach(ignoreConsoleLogs);
    afterEach(resetState);
    it('regex should match mitigation ID', async function () {
        const mid = 'M1047';
        assert.ok(mitigationRegex.test(mid));
    });
    it('should provide one competion item for exact mitigation IDs', async function () {
        const expectedMID = 'M1047';
        const position: vscode.Position = new vscode.Position(13, expectedMID.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].label, expectedMID);
        assert.strictEqual(results.items[0].kind, vscode.CompletionItemKind.Value);
    });
    it('should provide all completion items containing a mitigation name', async function () {
        const expectedName = 'Audit';
        const position: vscode.Position = new vscode.Position(14, expectedName.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        // filter out results from other providers
        const mitigationResults: Array<vscode.CompletionItem> = results.items.filter((item: vscode.CompletionItem) => {
            return item instanceof vscode.CompletionItem && mitigationRegex.test(`${item.detail}`);
        });
        assert.strictEqual(mitigationResults.length, 1);
        assert.ok(mitigationResults[0] instanceof vscode.CompletionItem);
        assert.strictEqual(mitigationResults[0].label, expectedName);
        assert.strictEqual(mitigationResults[0].kind, vscode.CompletionItemKind.Value);
    });
    it('should provide a hover for mitigation IDs', async function () {
        const expectedMID = 'M1047';
        const expectedLink = `[Source Link](https://attack.mitre.org/mitigations/${expectedMID})`;
        const position: vscode.Position = new vscode.Position(13, expectedMID.length);
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

describe('Mitigation Settings', function () {
    // bumping timeout on this due to config updates in afterEach()
    // ... potentially taking a long time
    this.timeout(5000);
    const testPath: string = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'files', 'test.md');
    const testUri: vscode.Uri = vscode.Uri.file(testPath);
    const modifiedConfig: vscode.WorkspaceConfiguration  = vscode.workspace.getConfiguration(configSection);

    before(async function () {
        await setTestConfig('mitigations', true, modifiedConfig);
    });
    beforeEach(function () {
        ignoreConsoleLogs();
    });
    afterEach(function () {
        resetState();
    });
    after(async function () {
        await setTestConfig('mitigations', undefined, modifiedConfig);
        await setTestConfig('completionFormat', undefined, modifiedConfig);
    });
    it('completionFormat: should show only an ID when set to id', async function () {
        const mid = 'M1047';
        const expectedDetail: string = mid;
        await setTestConfig('completionFormat', 'id', modifiedConfig);
        const position: vscode.Position = new vscode.Position(13, mid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show only a name when set to name', async function () {
        const mid = 'M1047';
        const expectedDetail = 'Audit';
        await setTestConfig('completionFormat', 'name', modifiedConfig);
        const position: vscode.Position = new vscode.Position(13, mid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show only a link when set to link', async function () {
        const mid = 'M1047';
        const expectedDetail = 'https://attack.mitre.org/mitigations/M1047';
        await setTestConfig('completionFormat', 'link', modifiedConfig);
        const position: vscode.Position = new vscode.Position(13, mid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show only a name when set to fullname', async function () {
        const mid = 'M1047';
        const expectedDetail = 'Audit';
        await setTestConfig('completionFormat', 'fullname', modifiedConfig);
        const position: vscode.Position = new vscode.Position(13, mid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show an ID and name when set to id-name', async function () {
        const mid = 'M1047';
        const expectedDetail = `${mid} Audit`;
        await setTestConfig('completionFormat', 'id-name', modifiedConfig);
        const position: vscode.Position = new vscode.Position(13, mid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show an ID and name when set to id-fullname', async function () {
        const mid = 'M1047';
        const expectedDetail = `${mid} Audit`;
        await setTestConfig('completionFormat', 'id-fullname', modifiedConfig);
        const position: vscode.Position = new vscode.Position(13, mid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('should enable the Mitigation providers when set to true', async function () {
        const expectedMID = 'M1047';
        const position: vscode.Position = new vscode.Position(13, expectedMID.length);
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 1);
    });
    it('should disable the Mitigation providers when set to false', async function () {
        await setTestConfig('mitigations', false, modifiedConfig);
        const expectedMID = 'M1047';
        const position: vscode.Position = new vscode.Position(13, expectedMID.length);
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 0);
    });
});

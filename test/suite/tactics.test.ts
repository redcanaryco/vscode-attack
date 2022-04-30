import * as assert from 'assert';
import * as vscode from 'vscode';
import { tacticRegex } from '../../src/helpers';
import { configSection, extensionID, ignoreConsoleLogs, resetState, setTestConfig } from './testHelpers';

const testUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/test.md`);

function isTactic(item: vscode.CompletionItem) {
    return (tacticRegex.test(`${item.detail}`) || tacticRegex.test(`${item.label}`)) && !item.label.toString().includes('(technique description)');
}

describe('Tactics', function () {
    this.timeout(5000);
    let ext: vscode.Extension<unknown> | undefined;
    let modifiedConfig: vscode.WorkspaceConfiguration;

    before(async function () {
        ignoreConsoleLogs();
        ext = vscode.extensions.getExtension(extensionID);
        await ext?.activate();
        modifiedConfig = vscode.workspace.getConfiguration(configSection);
        await setTestConfig('completionFormat', 'id', modifiedConfig);
        await setTestConfig('description', 'short', modifiedConfig);
        await setTestConfig('tactics', true, modifiedConfig);
    });
    after(async function () {
        await setTestConfig('tactics', true, modifiedConfig);
    });
    beforeEach(ignoreConsoleLogs);
    afterEach(resetState);
    it('regex should match tactic ID', async function () {
        const tid = 'TA0001';
        assert.ok(tacticRegex.test(tid));
    });
    it('regex should not match tactic name', async function () {
        const tactic = 'Persistence';
        assert.ok(!tacticRegex.test(tactic));
    });
    it('should provide one completion item for exact tactic IDs', async function () {
        const expectedTactic = 'TA0002';
        const position: vscode.Position = new vscode.Position(6, expectedTactic.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        const completionItems: Array<vscode.CompletionItem> = results.items.filter(isTactic);
        assert.strictEqual(completionItems.length, 1);
        assert.ok(completionItems[0] instanceof vscode.CompletionItem);
        assert.strictEqual(completionItems[0].label, expectedTactic);
        assert.strictEqual(completionItems[0].detail, expectedTactic);
        assert.strictEqual(completionItems[0].kind, vscode.CompletionItemKind.Value);
    });
    it('should provide all completion items containing a tactic name', async function () {
        const expectedTactic = 'TA0005';
        const expectedText = 'Defense Evasi';
        const position: vscode.Position = new vscode.Position(7, expectedText.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        // some other providers (probably technique) may return items by searching descriptions
        // ... let's filter these out by just finding the ones from this provider
        const tacticItems: Array<vscode.CompletionItem> = results.items.filter(isTactic);
        assert.strictEqual(tacticItems.length, 1);
        assert.ok(tacticItems[0] instanceof vscode.CompletionItem);
        assert.strictEqual(tacticItems[0].detail, expectedTactic);
        assert.strictEqual(tacticItems[0].kind, vscode.CompletionItemKind.Value);
    });
    it('should provide a hover for tactic IDs', async function () {
        const expectedTactic = 'TA0002';
        const expectedText = 'Execution';
        const position: vscode.Position = new vscode.Position(6, expectedTactic.length);
        const expectedRange: vscode.Range = new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, position.character));
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 1);
        assert.ok(results[0] instanceof vscode.Hover);
        assert.deepStrictEqual(results[0].range, expectedRange);
        const contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
        assert.ok(contents.value.includes(expectedText));
    });
    it('should not provide a hover to terms that do not match tactic IDs', async function () {
        const term = 'the';
        const position: vscode.Position = new vscode.Position(4, term.length);
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 0);
    });
});

describe('Tactic Settings', function () {
    // bumping timeout on this due to config updates in afterEach()
    // ... potentially taking a long time
    this.timeout(5000);
    const modifiedConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(configSection);

    before(async () => {
        await setTestConfig('tactics', true, modifiedConfig);
    });
    beforeEach(() => {
        ignoreConsoleLogs();
    });
    afterEach(async () => {
        resetState();
    });
    after(async () => {
        await setTestConfig('tactics', undefined, modifiedConfig);
        await setTestConfig('completionFormat', undefined, modifiedConfig);
        await setTestConfig('description', undefined, modifiedConfig);
    });
    it('completionFormat: should show only a tactic ID when set to id', async function () {
        const tid = 'TA0002';
        const expectedDetail: string = tid;
        await setTestConfig('completionFormat', 'id', modifiedConfig);
        const position: vscode.Position = new vscode.Position(6, tid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        const completionItems: Array<vscode.CompletionItem> = results.items.filter(isTactic);
        assert.strictEqual(completionItems.length, 1);
        assert.ok(completionItems[0] instanceof vscode.CompletionItem);
        assert.strictEqual(completionItems[0].detail, expectedDetail);
    });
    it('completionFormat: should show only a tactic name when set to name', async function () {
        const tid = 'TA0002';
        const expectedDetail = 'Execution';
        await setTestConfig('completionFormat', 'name', modifiedConfig);
        const position: vscode.Position = new vscode.Position(6, tid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        const completionItems: Array<vscode.CompletionItem> = results.items.filter(isTactic);
        assert.strictEqual(completionItems.length, 1);
        assert.ok(completionItems[0] instanceof vscode.CompletionItem);
        assert.strictEqual(completionItems[0].detail, expectedDetail);
    });
    it('completionFormat: should show only a link when set to link', async function () {
        const tid = 'TA0002';
        const expectedDetail = 'https://attack.mitre.org/tactics/TA0002';
        await setTestConfig('completionFormat', 'link', modifiedConfig);
        const position: vscode.Position = new vscode.Position(6, tid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        const completionItems: Array<vscode.CompletionItem> = results.items.filter(isTactic);
        assert.strictEqual(completionItems.length, 1);
        assert.ok(completionItems[0] instanceof vscode.CompletionItem);
        assert.strictEqual(completionItems[0].detail, expectedDetail);
    });
    it('completionFormat: should show only a tactic name when set to fullname', async function () {
        const tid = 'TA0002';
        const expectedDetail = 'Execution';
        await setTestConfig('completionFormat', 'fullname', modifiedConfig);
        const position: vscode.Position = new vscode.Position(6, tid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        const completionItems: Array<vscode.CompletionItem> = results.items.filter(isTactic);
        assert.strictEqual(completionItems.length, 1);
        assert.ok(completionItems[0] instanceof vscode.CompletionItem);
        assert.strictEqual(completionItems[0].detail, expectedDetail);
    });
    it('completionFormat: should show a tactic ID and tactic name when set to id-name', async function () {
        const tid = 'TA0002';
        const expectedDetail = `${tid} Execution`;
        await setTestConfig('completionFormat', 'id-name', modifiedConfig);
        const position: vscode.Position = new vscode.Position(6, tid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        const completionItems: Array<vscode.CompletionItem> = results.items.filter(isTactic);
        assert.strictEqual(completionItems.length, 1);
        assert.ok(completionItems[0] instanceof vscode.CompletionItem);
        assert.strictEqual(completionItems[0].detail, expectedDetail);
    });
    it('completionFormat: should show a tactic ID and tactic name when set to id-fullname', async function () {
        const tid = 'TA0002';
        const expectedDetail = `${tid} Execution`;
        await setTestConfig('completionFormat', 'id-fullname', modifiedConfig);
        const position: vscode.Position = new vscode.Position(6, tid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        const completionItems: Array<vscode.CompletionItem> = results.items.filter(isTactic);
        assert.strictEqual(completionItems.length, 1);
        assert.ok(completionItems[0] instanceof vscode.CompletionItem);
        assert.strictEqual(completionItems[0].detail, expectedDetail);
    });
    it('should enable the Tactic providers when set to true', async function () {
        await setTestConfig('tactics', true, modifiedConfig);
        const expectedSID = 'TA0002';
        const position: vscode.Position = new vscode.Position(6, expectedSID.length);
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 1);
    });
    it('should disable the Tactic providers when set to false', async function () {
        await setTestConfig('tactics', false, modifiedConfig);
        const expectedSID = 'TA0002';
        const position: vscode.Position = new vscode.Position(6, expectedSID.length);
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 0);
    });
});

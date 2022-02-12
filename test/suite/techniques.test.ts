import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { techniqueRegex } from '../../src/helpers';
import { ATTACKExtensionAPI, configSection, extensionID, ignoreConsoleLogs, resetState, setTestConfig } from './testHelpers';


describe('Techniques', function () {
    this.timeout(5000);
    let exports: ATTACKExtensionAPI;
    const testPath: string = path.resolve(__dirname, '..', '..', '..', 'test', 'files', 'test.md');
    const testUri: vscode.Uri = vscode.Uri.file(testPath);
    let ext: vscode.Extension<unknown> | undefined;
    let modifiedConfig: vscode.WorkspaceConfiguration;

    before(async function () {
        ignoreConsoleLogs();
        ext = vscode.extensions.getExtension(extensionID);
        await ext?.activate();
        exports = ext?.exports;
        modifiedConfig = vscode.workspace.getConfiguration(configSection);
        await setTestConfig('completionFormat', 'id', modifiedConfig);
        await setTestConfig('description', 'short', modifiedConfig);
        await setTestConfig('techniques', true, modifiedConfig);
    });
    after(async function () {
        await setTestConfig('techniques', true, modifiedConfig);
    });
    beforeEach(ignoreConsoleLogs);
    afterEach(resetState);
    it('regex should match technique ID', async function () {
        const tid = 'T1059';
        assert.ok(techniqueRegex.test(tid));
    });
    it('regex should match subtechnique ID', function () {
        const tid = 'T1059.001';
        assert.ok(techniqueRegex.test(tid));
    });
    it('regex should not match technique name', function () {
        const techniqueName = 'PowerShell';
        assert.ok(!techniqueRegex.test(techniqueName));
    });
    it('should provide one completion item for exact TIDs', async function () {
        const expectedTID = 'T1059';
        const position: vscode.Position = new vscode.Position(0, expectedTID.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        // most completion items don't get completely resolved (documentation, whitespace, etc.) until selected
        // ... so only validate the label for now
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].label, expectedTID);
        assert.strictEqual(results.items[0].kind, vscode.CompletionItemKind.Value);
    });
    it('should provide one completion item for exact sub-TIDs', async function () {
        const expectedTID = 'T1059.001';
        const position: vscode.Position = new vscode.Position(1, expectedTID.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        // most completion items don't get completely resolved (documentation, whitespace, etc.) until selected
        // ... so only validate the label for now
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].label, expectedTID);
        assert.strictEqual(results.items[0].kind, vscode.CompletionItemKind.Value);
    });
    it('should provide all completion items containing a technique name', async function () {
        const term = 'PowerShell';
        const expectedNames: Array<string> = ['PowerShell', 'PowerShell Profile'];
        const position: vscode.Position = new vscode.Position(2, term.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        // most completion items don't get completely resolved (documentation, whitespace, etc.) until selected
        // ... so only validate the label for now
        assert.ok(results instanceof vscode.CompletionList);
        const techniqueItems: Array<vscode.CompletionItem> = results.items.filter((item) => {
            return item instanceof vscode.CompletionItem && techniqueRegex.test(`${item.detail}`);
        });
        assert.strictEqual(techniqueItems.length, 2);
        techniqueItems.forEach((item: vscode.CompletionItem) => {
            assert.ok(item instanceof vscode.CompletionItem);
            assert.ok(expectedNames.includes(item.label.toString()));
            assert.strictEqual(item.kind, vscode.CompletionItemKind.Value);
        });
    });
    it('should provide a completion item for lengthy terms in technique descriptions', async function () {
        // this term is not a technique ID or in any technique name
        // so the only way it would return an item is if the descriptions are searched
        const term = 'certutil';
        const expectedLabel = `${term} (technique description)`;
        const expectedTID = 'T1140';
        const position: vscode.Position = new vscode.Position(3, term.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        // items from description searches should have all fields filled out
        assert.ok(results instanceof vscode.CompletionList);
        // filter out results from other providers
        const techniqueItems: Array<vscode.CompletionItem> = results.items.filter((item) => {
            return item instanceof vscode.CompletionItem && item.label.toString().includes('technique description');
        });
        assert.strictEqual(techniqueItems.length, 1);
        assert.ok(techniqueItems[0] instanceof vscode.CompletionItem);
        assert.strictEqual(techniqueItems[0].label, expectedLabel);
        assert.strictEqual(techniqueItems[0].detail, expectedTID);
        assert.strictEqual(techniqueItems[0].kind, vscode.CompletionItemKind.Value);
    });
    it('should not provide completion items for lengthy terms commonly found in technique descriptions', async function () {
        // this term is not a technique ID or in any technique name, and it is long enough to trip
        // the 'lengthy term' heuristic, but it is found in many technique descriptions, so
        // it could return a lot of items when the user doesn't want them
        const term = 'false';
        const position: vscode.Position = new vscode.Position(15, term.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        // filter out results from other providers
        const techniqueItems: Array<vscode.CompletionItem> = results.items.filter((item) => {
            return item instanceof vscode.CompletionItem && item.label.toString().includes('technique description');
        });
        assert.strictEqual(techniqueItems.length, 0);
    });
    it('should not search descriptions if the user is searching for a revoked TID that is not available', async function () {
        // line 5: T1086
        const position: vscode.Position = new vscode.Position(5, 4);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        // if none of the results are of the CompletionItemKind that we use, then VSCode auto-filled
        // the results based on other terms in the document, and our provider did not search descriptions
        assert.ok(!results.items.some((item: vscode.CompletionItem) => { return item.kind === vscode.CompletionItemKind.Value; }));
    });
    it('should not provide techniques marked as revoked', async function () {
        // line 5: T1086
        const position: vscode.Position = new vscode.Position(5, 4);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.ok(!results.items.some((item: vscode.CompletionItem) => { return item.kind === vscode.CompletionItemKind.Value; }));
    });
    it('should add a Deprecated tag for techniques marked as x_mitre_deprecated', async function () {
        const expectedTID = 'T1064';
        const position: vscode.Position = new vscode.Position(8, expectedTID.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].label, expectedTID);
        assert.strictEqual(results.items[0].kind, vscode.CompletionItemKind.Value);
        assert.deepStrictEqual(results.items[0].tags, [vscode.CompletionItemTag.Deprecated]);
    });
    it('should provide a hover for TIDs', async function () {
        const expectedTID = 'T1059';
        const expectedLink = `[Source Link](https://attack.mitre.org/techniques/${expectedTID})`;
        const position: vscode.Position = new vscode.Position(0, expectedTID.length);
        const expectedRange: vscode.Range = new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, position.character));
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        // not sure why this is an Array - might have to do with ProviderResult
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 1);
        assert.ok(results[0] instanceof vscode.Hover);
        assert.deepStrictEqual(results[0].range, expectedRange);
        const contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
        assert.ok(contents.value.includes(expectedLink));
    });
    it('should provide a hover for revoked TIDs', async function () {
        const expectedTID = 'T1086';
        const expectedTitle = 'PowerShell (REVOKED)';
        const position: vscode.Position = new vscode.Position(5, expectedTID.length);
        const expectedRange: vscode.Range = new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, position.character));
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 1);
        assert.ok(results[0] instanceof vscode.Hover);
        assert.deepStrictEqual(results[0].range, expectedRange);
        const contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
        assert.ok(contents.value.includes(expectedTitle));
    });
    it('should not provide a hover to terms that do not match TIDs', async function () {
        const term = 'the';
        const position: vscode.Position = new vscode.Position(4, term.length);
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 0);
    });
    it('should provide all completion items for short terms and let VSCode filter them', async function () {
        const term = 'the';
        const position: vscode.Position = new vscode.Position(4, term.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        // completion provider only applies to non-revoked techniques
        const techniques: Array<Technique> = exports.getCurrentTechniques();
        assert.strictEqual(results.items.length, techniques.length);
    });
});

describe('Technique Settings', function () {
    // bumping timeout on this due to config updates in afterEach()
    // ... potentially taking a long time
    this.timeout(5000);
    const testPath: string = path.resolve(__dirname, '..', '..', '..', 'test', 'files', 'test.md');
    const testUri: vscode.Uri = vscode.Uri.file(testPath);
    const modifiedConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(configSection);

    before(async () => {
        await setTestConfig('techniques', true, modifiedConfig);
    });
    beforeEach(ignoreConsoleLogs);
    afterEach(async () => {
        resetState();
    });
    after(async () => {
        await setTestConfig('techniques', undefined, modifiedConfig);
        await setTestConfig('completionFormat', undefined, modifiedConfig);
        await setTestConfig('description', undefined, modifiedConfig);
    });
    it('completionFormat: should show only a TID when set to id', async function () {
        const tid = 'T1059.001';
        const expectedDetail: string = tid;
        await setTestConfig('completionFormat', 'id', modifiedConfig);
        const position: vscode.Position = new vscode.Position(1, tid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show only a technique name when set to name', async function () {
        const tid = 'T1059.001';
        const expectedDetail = 'PowerShell';
        await setTestConfig('completionFormat', 'name', modifiedConfig);
        const position: vscode.Position = new vscode.Position(1, tid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show only a link when set to link', async function () {
        const tid = 'T1059.001';
        const expectedDetail = 'https://attack.mitre.org/techniques/T1059/001';
        await setTestConfig('completionFormat', 'link', modifiedConfig);
        const position: vscode.Position = new vscode.Position(1, tid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show a sub-technique name and parent technique name (where applicable) when set to fullname', async function () {
        const tid = 'T1059.001';
        const expectedDetail = 'Command and Scripting Interpreter: PowerShell';
        await setTestConfig('completionFormat', 'fullname', modifiedConfig);
        const position: vscode.Position = new vscode.Position(1, tid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show a TID and technique name when set to id-name', async function () {
        const tid = 'T1059.001';
        const expectedDetail = `${tid} PowerShell`;
        await setTestConfig('completionFormat', 'id-name', modifiedConfig);
        const position: vscode.Position = new vscode.Position(1, tid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('completionFormat: should show a TID and full sub-technique name when set to id-fullname', async function () {
        const tid = 'T1059.001';
        const expectedDetail = `${tid} Command and Scripting Interpreter: PowerShell`;
        await setTestConfig('completionFormat', 'id-fullname', modifiedConfig);
        const position: vscode.Position = new vscode.Position(1, tid.length);
        const results = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position);
        assert.ok(results instanceof vscode.CompletionList);
        assert.strictEqual(results.items.length, 1);
        assert.ok(results.items[0] instanceof vscode.CompletionItem);
        assert.strictEqual(results.items[0].detail, expectedDetail);
    });
    it('should enable the Technique providers when set to true', async function () {
        const expectedSID = 'T1059';
        await setTestConfig('techniques', true, modifiedConfig);
        const position: vscode.Position = new vscode.Position(0, expectedSID.length);
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 1);
    });
    it('should disable the Technique providers when set to false', async function () {
        await setTestConfig('techniques', false, modifiedConfig);
        const expectedSID = 'T1059';
        const position: vscode.Position = new vscode.Position(0, expectedSID.length);
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 0);
    });
});

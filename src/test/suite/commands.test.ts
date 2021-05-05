import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import * as search from '../../search';
import { disposables, extensionID, ignoreConsoleLogs, resetState } from '../suite/testHelpers';


describe('Command: search', function () {
    const searchCommand = 'vscode-attack.search';
    let ext: vscode.Extension<unknown> | undefined;

    before(async function () {
        ext = vscode.extensions.getExtension(extensionID);
        await ext?.activate();
        exports = ext?.exports;
    });
    beforeEach(ignoreConsoleLogs);
    afterEach(resetState);
    it('search command should exist', function () {
        vscode.commands.getCommands(true).then((commands: string[]) => {
            assert.ok(commands.includes(searchCommand), `No '${searchCommand}' exists.`);
        });
    });
    it('should open one webpanel for exact TIDs', function () {
        const tid = 'T1059.001';
        const expectedTitle = `${tid}: PowerShell`;
        search.search(exports.getAllTechniques(), tid).then((panels: Array<vscode.WebviewPanel>) => {
            panels.forEach((panel: vscode.WebviewPanel) => { disposables.push(panel); });
            assert.strictEqual(panels.length, 1);
            assert.strictEqual(panels[0].title, expectedTitle);
        });
    });
    it('should open one webpanel for revoked TIDs', async function () {
        const tid = 'T1086';
        const expectedTitle = `${tid}: PowerShell`;
        const expectedText = `<h3>PowerShell (REVOKED)</h3>`;
        search.search(exports.getAllTechniques(), tid).then((panels: Array<vscode.WebviewPanel>) => {
            panels.forEach((panel: vscode.WebviewPanel) => { disposables.push(panel); });
            assert.strictEqual(panels.length, 1);
            assert.strictEqual(panels[0].title, expectedTitle);
            assert.ok(panels[0].webview.html.includes(expectedText));
        });
    });
    it('should open all webpanels containing a technique name', async function () {
        const name = 'PowerShell';
        // Should return both 'PowerShell' and 'PowerShell Profile'
        const expectedTitles: Array<string> = ['T1059.001: PowerShell', 'T1546.013: PowerShell Profile'];
        search.search(exports.getAllTechniques(), name).then((panels: Array<vscode.WebviewPanel>) => {
            panels.forEach((panel: vscode.WebviewPanel) => { disposables.push(panel); });
            assert.strictEqual(panels.length, 2);
            const titles: Array<string> = panels.map<string>((panel: vscode.WebviewPanel) => { return panel.title; });
            assert.deepStrictEqual(titles, expectedTitles);
        });
    });
    it('should open all webpanels for lengthy terms in technique descriptions', async function () {
        // this term is not a technique ID or in any technique name
        // so the only way it would return an item is if the descriptions are searched
        const term = 'certutil';
        const expectedTitle = 'T1140: Deobfuscate/Decode Files or Information';
        search.search(exports.getAllTechniques(), term).then((panels: Array<vscode.WebviewPanel>) => {
            panels.forEach((panel: vscode.WebviewPanel) => { disposables.push(panel); });
            assert.strictEqual(panels.length, 1);
            assert.strictEqual(panels[0].title, expectedTitle);
        });
    });
    it('should not search for short terms in technique descriptions', async function () {
        const term = 'the';
        search.search(exports.getAllTechniques(), term).then((panels: Array<vscode.WebviewPanel>) => {
            panels.forEach((panel: vscode.WebviewPanel) => { disposables.push(panel); });
            assert.strictEqual(panels.length, 0);
        });
    });
});

describe('Command: insertLink', function () {
    const insertLinkCommand = 'vscode-attack.insertLink';
    const testPath: string = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'files', 'test.md');
    const testUri: vscode.Uri = vscode.Uri.file(testPath);
    let ext: vscode.Extension<unknown> | undefined;
    const attackObjects: Array<Group|Mitigation|Software|Tactic|Technique> = [
        {
            deprecated: false,
            description: {
                short: 'test description',
                long: 'longer test description'
            },
            id: 'T1059.001',
            name: 'PowerShell',
            parent: undefined,
            revoked: false,
            subtechnique: true,
            tactics: [],
            url: 'https://attack.mitre.org/techniques/T1059/001',
        }
    ];

    before(async function () {
        ext = vscode.extensions.getExtension(extensionID);
        await ext?.activate();
        exports = ext?.exports;
    });
    // beforeEach(ignoreConsoleLogs);
    afterEach(resetState);
    it('insert link command should exist', async function () {
        const commands: Array<string> = await vscode.commands.getCommands(true);
        assert.ok(commands.includes(insertLinkCommand), `No '${insertLinkCommand}' exists.`);
    });
    it('should insert a link for markdown text', async function () {
        const expectedLink: string = attackObjects[0].url;
        const tid: string = attackObjects[0].id;
        const highlightedText: vscode.Selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, tid.length));
        let editor: vscode.TextEditor = await vscode.window.showTextDocument(testUri);
        editor.selections = [highlightedText];
        vscode.commands.executeCommand('vscode-attack.insertLink', editor, {techniques: attackObjects});
        // close and reopen to get our new document text
        vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        editor = await vscode.window.showTextDocument(testUri);
        const result: vscode.TextLine = editor.document.lineAt(highlightedText.active.line);
        assert.ok(result.text.includes(expectedLink));
    });
    it('should not insert a link when highlighted text is not an ATT&CK object ID', async function () {
        const unExpectedLink: string = attackObjects[0].url;
        const text: string = attackObjects[0].name;
        const highlightedText: vscode.Selection = new vscode.Selection(new vscode.Position(2, 0), new vscode.Position(2, text.length));
        const editor: vscode.TextEditor|undefined = await vscode.window.showTextDocument(testUri);
        editor.selections = [highlightedText];
        vscode.commands.executeCommand('vscode-attack.insertLink', editor, {techniques: attackObjects});
        const result: vscode.TextLine = editor.document.lineAt(highlightedText.active.line);
        assert.ok(!result.text.includes(unExpectedLink));
    });
});

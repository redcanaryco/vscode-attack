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
    it('should open only one page in the webpanel for exact TIDs', function () {
        const tid = 'T1059.001';
        const expectedTitle = `${tid}: PowerShell`;
        search.search(exports.getAllTechniques(), tid).then((panel: vscode.WebviewPanel|undefined) => {
            assert.notStrictEqual(panel, undefined);
            if (panel !== undefined) {
                disposables.push(panel);
                assert.strictEqual(panel.title, expectedTitle);
                // exact TIDs shouldn't return anything with javascript or navigation
                assert.ok(!panel.webview.html.includes('<script'));
                assert.ok(!panel.webview.html.includes('<button'));
            }
        });
    });
    it('should modify the header for revoked TIDs', async function () {
        const tid = 'T1086';
        const expectedTitle = `${tid}: PowerShell`;
        const expectedText = `<h3>PowerShell (REVOKED)</h3>`;
        search.search(exports.getAllTechniques(), tid).then((panel: vscode.WebviewPanel|undefined) => {
            assert.notStrictEqual(panel, undefined);
            if (panel !== undefined) {
                disposables.push(panel);
                assert.strictEqual(panel.title, expectedTitle);
                assert.ok(panel.webview.html.includes(expectedText));
            }
        });
    });
    it('should open a navigatable webpanel containing the first matched technique', async function () {
        const name = 'PowerShell';
        // Should return both 'PowerShell' and 'PowerShell Profile', but only 'PowerShell' should show
        const expectedTitle: string = 'T1059.001: PowerShell';
        search.search(exports.getAllTechniques(), name).then((panel: vscode.WebviewPanel|undefined) => {
            assert.notStrictEqual(panel, undefined);
            if (panel !== undefined) {
                disposables.push(panel);
                assert.strictEqual(panel.title, expectedTitle);
                assert.ok(panel.webview.html.includes('<script'));
                assert.ok(panel.webview.html.includes('<button'));
            }
        });
    });
    it('should open all webpanels for lengthy terms in technique descriptions', async function () {
        // this term is not a technique ID or in any technique name
        // so the only way it would return an item is if the descriptions are searched
        const term = 'certutil';
        const expectedTitle = 'T1140: Deobfuscate/Decode Files or Information';
        search.search(exports.getAllTechniques(), term).then((panel: vscode.WebviewPanel|undefined) => {
            assert.notStrictEqual(panel, undefined);
            if (panel !== undefined) {
                disposables.push(panel);
                assert.strictEqual(panel.title, expectedTitle);
            }
        });
    });
    it('should not search for short terms in technique descriptions', async function () {
        const term = 'the';
        search.search(exports.getAllTechniques(), term).then((panel: vscode.WebviewPanel|undefined) => {
            assert.strictEqual(panel, undefined);
        });
    });
});

describe('Command: insertLink', function () {
    const events: Array<vscode.Disposable> = [];
    const insertLinkCommand = 'vscode-attack.insertLink';
    const testPath: string = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'files', 'links.md');
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
    afterEach(function () {
        // clean up any events that were established during our tests
        let d: vscode.Disposable|undefined = events.pop();
        while (d !== undefined) {
            d.dispose();
            d = events.pop();
        }
        resetState();
    });
    it('insert link command should exist', async function () {
        const commands: Array<string> = await vscode.commands.getCommands(true);
        assert.ok(commands.includes(insertLinkCommand), `No '${insertLinkCommand}' exists.`);
    });
    it('should insert a link for ATT&CK object IDs', function (done) {
        const expectedMarkdown: string = `[${attackObjects[0].id}](${attackObjects[0].url})`;
        const tid: string = attackObjects[0].id;
        const highlightedText: vscode.Selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, tid.length));
        vscode.window.showTextDocument(testUri).then((editor: vscode.TextEditor) => {
            events.push(vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
                if (event.contentChanges.length > 0) {
                    const result: vscode.TextLine = event.document.lineAt(highlightedText.active.line);
                    assert.strictEqual(result.text, expectedMarkdown);
                    done();
                }
            }));
            editor.selections = [highlightedText];
            vscode.commands.executeCommand('vscode-attack.insertLink', editor, {techniques: attackObjects});
        });
    });
    it('should insert a link for ATT&CK object IDs case insensitively', function (done) {
        const expectedMarkdown: string = `[${attackObjects[0].id.toLocaleLowerCase()}](${attackObjects[0].url})`;
        const tid: string = attackObjects[0].id;
        const highlightedText: vscode.Selection = new vscode.Selection(new vscode.Position(5, 0), new vscode.Position(5, tid.length));
        vscode.window.showTextDocument(testUri).then((editor: vscode.TextEditor) => {
            events.push(vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
                if (event.contentChanges.length > 0) {
                    const result: vscode.TextLine = event.document.lineAt(highlightedText.active.line);
                    assert.strictEqual(result.text, expectedMarkdown);
                    done();
                }
            }));
            editor.selections = [highlightedText];
            vscode.commands.executeCommand('vscode-attack.insertLink', editor, {techniques: attackObjects});
        });
    });
    it('should insert a link for ATT&CK object names', function (done) {
        const expectedMarkdown: string = `[${attackObjects[0].name}](${attackObjects[0].url})`;
        const name: string = attackObjects[0].name;
        const highlightedText: vscode.Selection = new vscode.Selection(new vscode.Position(2, 0), new vscode.Position(2, name.length));
        vscode.window.showTextDocument(testUri).then((editor: vscode.TextEditor) => {
            events.push(vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
                if (event.contentChanges.length > 0) {
                    const result: vscode.TextLine = event.document.lineAt(highlightedText.active.line);
                    assert.strictEqual(result.text, expectedMarkdown);
                    done();
                }
            }));
            editor.selections = [highlightedText];
            vscode.commands.executeCommand('vscode-attack.insertLink', editor, {techniques: attackObjects});
        });
    });
    it('should insert a link for ATT&CK object names case insensitively', function (done) {
        const expectedMarkdown: string = `[${attackObjects[0].name.toLocaleLowerCase()}](${attackObjects[0].url})`;
        const name: string = attackObjects[0].name;
        const highlightedText: vscode.Selection = new vscode.Selection(new vscode.Position(6, 0), new vscode.Position(6, name.length));
        vscode.window.showTextDocument(testUri).then((editor: vscode.TextEditor) => {
            events.push(vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
                if (event.contentChanges.length > 0) {
                    const result: vscode.TextLine = event.document.lineAt(highlightedText.active.line);
                    assert.strictEqual(result.text, expectedMarkdown);
                    done();
                }
            }));
            editor.selections = [highlightedText];
            vscode.commands.executeCommand('vscode-attack.insertLink', editor, {techniques: attackObjects});
        });
    });
    it('should do nothing when highlighted text is not an ATT&CK object ID', async function () {
        const text: string = 'certutil';
        const highlightedText: vscode.Selection = new vscode.Selection(new vscode.Position(3, 0), new vscode.Position(3, text.length));
        vscode.window.showTextDocument(testUri).then((editor: vscode.TextEditor) => {
            events.push(vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
                throw new Error(`Text document changed when it should not have: ${JSON.stringify(event.contentChanges)}`);
            }));
            editor.selections = [highlightedText];
            vscode.commands.executeCommand('vscode-attack.insertLink', editor, {techniques: attackObjects});
        });
    });
    it('should preserve trailing whitespace when present', function (done) {
        const expectedMarkdown: string = `[TA0002](https://attack.mitre.org/tactics/TA0002)`;
        const highlightedText: vscode.Selection = new vscode.Selection(new vscode.Position(4, 0), new vscode.Position(5, 0));
        vscode.window.showTextDocument(testUri).then((editor: vscode.TextEditor) => {
            events.push(vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
                if (event.contentChanges.length > 0) {
                    const result: vscode.TextLine = event.document.lineAt(highlightedText.anchor.line);
                    assert.strictEqual(result.text, expectedMarkdown);
                    done();
                }
            }));
            editor.selections = [highlightedText];
            vscode.commands.executeCommand('vscode-attack.insertLink', editor, {techniques: attackObjects});
        });
    });
    it('should identify ATT&CK objects without highlighting text', function (done) {
        const expectedMarkdown: string = `[T1059](https://attack.mitre.org/techniques/T1059)`;
        const tid: string = 'T1059';
        const cursor: vscode.Position = new vscode.Position(0, tid.length-1);
        const highlightedText: vscode.Selection = new vscode.Selection(cursor, cursor);
        vscode.window.showTextDocument(testUri).then((editor: vscode.TextEditor) => {
            events.push(vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
                const result: vscode.TextLine = event.document.lineAt(highlightedText.active.line);
                assert.strictEqual(result.text, expectedMarkdown);
                done();
            }));
            editor.selections = [highlightedText];
            vscode.commands.executeCommand('vscode-attack.insertLink', editor, {techniques: attackObjects});
        });
    });
});

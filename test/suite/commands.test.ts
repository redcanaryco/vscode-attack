import * as assert from 'assert';
import * as vscode from 'vscode';
import * as search from '../../src/search';
import { extensionID, ignoreConsoleLogs, resetState } from './testHelpers';


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
    it('should return one technique for exact TIDs', function () {
        const term = 'T1059.001';
        const results: Array<Technique> = search.doSearch(term, exports.getAllTechniques());
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].id, term);
    });
    it('should still return revoked TIDs', async function () {
        const term = 'T1086';
        const results: Array<Technique> = search.doSearch(term, exports.getAllTechniques());
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].id, term);
    });
    it('should return all techniques with name containing a term', async function () {
        const term = 'PowerShell';
        // Should return both 'PowerShell' and 'PowerShell Profile'
        const expected: Array<string> = new Array<string>('T1059.001', 'T1546.013');
        const results: Array<Technique> = search.doSearch(term, exports.getAllTechniques());
        const actual: Array<string> = results.map<string>((t: Technique) => { return t.id; });
        assert.deepStrictEqual(actual, expected);
    });
    it('should search technique descriptions for a term when it is not in any technique names', function () {
        // this term is not a technique ID or in any technique name
        // so the only way it would return an item is if the descriptions are searched
        const term = 'certutil';
        const expected = 'T1140';       // Deobfuscate/Decode Files or Information
        const results: Array<Technique> = search.doSearch(term, exports.getAllTechniques());
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].id, expected);
    });
    it('should search for short terms in technique names', function () {
        const term = 'xdg';
        const expected = 'T1547.013';   // XDG Autostart Entries
        const results: Array<Technique> = search.doSearch(term, exports.getAllTechniques());
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].id, expected);
    });
    it('should not return anything when an empty string is given', function () {
        const term = '';
        const results: Array<Technique> = search.doSearch(term, exports.getAllTechniques());
        assert.strictEqual(results.length, 0);
    });
});

describe('Command: insertLink', function () {
    const events: Array<vscode.Disposable> = [];
    const insertLinkCommand = 'vscode-attack.insertLink';
    const testUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/links.md`);
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

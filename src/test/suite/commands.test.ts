import * as assert from 'assert';
import * as vscode from 'vscode';
import * as search from '../../search';
import { disposables, extensionID, ignoreConsoleLogs, resetState } from '../suite/testHelpers';


describe('Search Command', function () {
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

import * as vscode from 'vscode';
import { debug } from './configuration';
import { getCurrentTechniques, getRevokedTechniques, log, minTermLength } from './helpers';
import markdownit from 'markdown-it';
const md = markdownit('commonmark');


/*
    Build the technique result page as rendered markdown
*/
function buildTechnique(technique: Technique): string {
    const mdBuilder: vscode.MarkdownString = new vscode.MarkdownString(undefined);
    // title
    let title = '';
    if (technique.parent !== undefined) {
        title += `${technique.parent.name}: `;
    }
    title += `${technique.name}`;
    if (technique.revoked) { title += ' (REVOKED)'; }
    mdBuilder.appendMarkdown(`### ${title}\n`);

    // source link
    if (technique.url !== undefined) {
        mdBuilder.appendMarkdown(`<${technique.url}>\n\n`);
    }
    else {
        mdBuilder.appendMarkdown(`No source link available\n\n`);
    }
    // ID
    mdBuilder.appendMarkdown(`**TID**: ${technique.id}\n\n`);
    // tactics
    if (technique.tactics?.length > 0) {
        mdBuilder.appendMarkdown(`**Tactics**: ${technique.tactics.join(', ')}\n\n`);
    }

    // description
    mdBuilder.appendMarkdown(`#### Description\n\n`);
    mdBuilder.appendMarkdown(technique.description.long);
    return md.render(mdBuilder.value);
}

/*
    Build the webview panel body from the given technique
*/
function buildPageBody(technique: Technique, pageNum: number, numPages: number, enableNav: boolean = false): string {
    if (debug) { log(`search: Opening webview for ${technique.name} (${technique.id})`); }
    let navButtons: string = '';
    if (enableNav) {
        navButtons = [
            '    <hr>',
            `    <button id="previous-technique">&lt;&lt;</button> ${pageNum}/${numPages} <button id="next-technique">&gt;&gt;</button>`,
        ].join('\n');
    }
    return [
        '<body>',
        `    <div id="${technique.id}" class="techniques">\n${buildTechnique(technique)}</div>`,
        navButtons,
        '</body>',
    ].join('\n');
}

/*
    Build the whole webview panel including relevant metadata and resolving script/style paths
*/
function buildPage(body: string, scriptUri: vscode.Uri): string {
    const nonce: string = getNonce();
    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8">',
        `    <meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'nonce-${nonce}\'">`,
        '  </head>',
        '  <body>',
        body,
        '  </body>',
        `<script nonce="${nonce}" src="${scriptUri}"></script>`,
        '</html>'
    ].join('\n');
}

/*
    create a webview which displays the results of the Search command
    and updates the panel as the user clicks through sections
*/
function displayPanel(techniques: Array<Technique>, extensionPath: string): vscode.WebviewPanel {
    const resources: vscode.Uri = vscode.Uri.joinPath(vscode.Uri.file(extensionPath), 'src', 'resources');
    const panelOptions: (vscode.WebviewOptions & vscode.WebviewPanelOptions) = {
        enableScripts: true,
        enableCommandUris: false,
        enableFindWidget: true,
        localResourceRoots: [resources]
    };
    const panel: vscode.WebviewPanel = vscode.window.createWebviewPanel('vscode-attack', `ATT&CK: Search Results`, vscode.ViewColumn.One, panelOptions);
    // Local path to main script run in the webview
    const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(resources, 'navigation.js'));
    // only add navigation buttons + javascript when there is more than one technique
    const enableNavigation: boolean = techniques.length > 1;
    // start with just showing the first returned result
    let currentPosition: number = 0;
    panel.title = techniques[currentPosition].id;
    let body: string = buildPageBody(techniques[currentPosition], currentPosition+1, techniques.length, enableNavigation);
    panel.webview.html = buildPage(body, scriptUri);
    // when the user clicks a nav button, update the webview with the next section
    panel.webview.onDidReceiveMessage((message) => {
        switch (message.command) {
            case 'previous':
                // if currentPosition points to a position outside the techniques array, just wrap it around to the beginning/end of the array
                currentPosition = (currentPosition - 1) < 0 ? techniques.length - 1 : currentPosition - 1;
                break;
            case 'next':
                currentPosition = (currentPosition + 1) >= techniques.length ? 0 : currentPosition + 1;
                break;
        }
        panel.title = techniques[currentPosition].id;
        body = buildPageBody(techniques[currentPosition], currentPosition+1, techniques.length, enableNavigation);
        panel.webview.html = buildPage(body, scriptUri);
    });
    // console.log(`Rendered ${techniques.length} results.`);
    return panel;
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/*
    Search the list of ATT&CK objects for whatever the user is looking for
*/
export async function search(techniques: Array<Technique>, extensionPath: string, input: string|undefined = undefined): Promise<vscode.WebviewPanel|undefined> {
    let panel: vscode.WebviewPanel|undefined = undefined;
    let results: Array<Technique> = new Array<Technique>();
    if (debug) { log('Prompting user for a search term'); }
    if (input === undefined) {
        const inBoxOpt: vscode.InputBoxOptions = {
            placeHolder: 'Technique Name or ID',
            prompt: 'Search for an ATT&CK term'
        };
        input = await vscode.window.showInputBox(inBoxOpt, undefined);
    }
    // if the user cancels the prompt there may be no input to search
    if (input === undefined || input.length < minTermLength) {
        log('No input provided. Cancelling search.');
    }
    else {
        const revokedTechniques: Array<Technique> = getRevokedTechniques(techniques);
        const currentTechniques: Array<Technique> = getCurrentTechniques(techniques);
        // first figure out if the user is searching for a revoked TID
        results = revokedTechniques.filter((t: Technique) => { return t.id.toUpperCase() === input?.toUpperCase(); });
        // if the search term isn't a revoked technique, search the current technique names and IDs
        if (results.length === 0 && input !== undefined) {
            results = currentTechniques.filter((t: Technique) => {
                return (t.id.toUpperCase() === input?.toUpperCase() || t.name.toUpperCase().includes(`${input?.toUpperCase()}`));
            });
        }
        // at this point, if a panel hasn't been created yet, then let's search every technique description
        if (results.length === 0 && input !== undefined) {
            if (debug) { log(`Search term exceeds ${minTermLength} characters: ${input}`); }
            results = currentTechniques.filter((t: Technique) => { return (t.description.long.includes(`${input}`)); });
        }
        // ... and at this point, if there's still no panel, then let's just give up
        if (results.length === 0) {
            if (debug) { log(`Could not find technique matching '${input}'`); }
            vscode.window.showErrorMessage(`ATT&CK: Could not find technique matching '${input}'`);
        }
        else {
            if (debug) { log(`Prompt returned ${input}`); }
            panel = displayPanel(results, extensionPath);
        }
    }
    return panel;
}

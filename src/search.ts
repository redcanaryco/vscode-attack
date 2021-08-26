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
    // some markup contains unintentionally escaped </code> markup
    // usually due to a file path (e.g. <code>%systemdir%\</code>)
    // so let's fix that up so the markdown renders properly
    if (/[^\\]\\\<\/code\>/.test(technique.description.long)) {
        technique.description.long = technique.description.long.replace('\\</code>', '\\\\</code>');
    }
    mdBuilder.appendMarkdown(technique.description.long);
    return md.render(mdBuilder.value);
}

/*
    Build the whole webview panel including relevant metadata and resolving script/style paths
*/
function buildPage(body: string, webview: vscode.Webview, resourceUri: vscode.Uri, enableNavigation: boolean = false): string {
    const scriptUri: vscode.Uri = webview.asWebviewUri(vscode.Uri.joinPath(resourceUri, 'navigation.js'));
    const styleUri: vscode.Uri = webview.asWebviewUri(vscode.Uri.joinPath(resourceUri, 'styles.css'));
    let page: string = `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8">`;
    // define our CSP as only allowing styles and external scripts to be loaded from resources
    let contentSecurityPolicy: string = `default-src \'none\'; style-src ${webview.cspSource}; script-src-elem ${webview.cspSource}`;
    page += `    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}">\n`;
    page += `    <link rel="stylesheet" href="${styleUri}">\n`;
    page += `  </head>\n  <body>\n${body}\n  </body>\n`;
    if (enableNavigation) {
        page += `<script src="${scriptUri}"></script>\n`;
    }
    page += '</html>\n';
    return page;
}

/*
    create a webview which displays the results of the Search command
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
    let currentPosition: number = 0;
    // start with just showing the first returned result
    updatePanel(panel, techniques[currentPosition], currentPosition, techniques.length, resources);
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
        updatePanel(panel, techniques[currentPosition], currentPosition, techniques.length, resources);
    });
    return panel;
}

/*
    updates the panel as the user clicks through sections
*/
function updatePanel(panel: vscode.WebviewPanel, technique: Technique, currentPosition: number, totalTechniques: number, resourceUri: vscode.Uri) {
    if (debug) { log(`search: Opening webview for ${technique.name} (${technique.id})`); }
    let scriptUri: vscode.Uri | undefined = undefined;
    let body: string = `<div id="${technique.id}" class="techniques">\n${buildTechnique(technique)}</div>`;
    // only add navigation buttons + javascript when there is more than one technique
    const enableNavigation: boolean = totalTechniques > 1;
    if (enableNavigation) {
        body += `<hr><button id="previous-technique" class="navigation">&lt;&lt;</button><div id="nav-summary">${currentPosition+1}/${totalTechniques}</div><button id="next-technique" class="navigation">&gt;&gt;</button>`;
        scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(resourceUri, 'navigation.js'));
    }
    // update the panel to display the new technique
    panel.title = `${technique.id}: ${technique.name}`;
    panel.webview.html = buildPage(body, panel.webview, resourceUri, enableNavigation);
}

/*
    Search the list of ATT&CK objects for whatever the user is looking for
*/
export function doSearch(input: string, techniques: Array<Technique>): Array<Technique> {
    let results: Array<Technique> = new Array<Technique>();
    if (input.length === 0) {
        // check input here too just in case
        if (debug) { log('Cancelling search. User provided empty string'); }
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
    }
    return results;
}

/*
    Control flow and asking for/understanding what to do with user input
*/
export async function search(techniques: Array<Technique>, extensionPath: string): Promise<vscode.WebviewPanel|undefined> {
    let panel: vscode.WebviewPanel|undefined = undefined;
    let results: Array<Technique> = new Array<Technique>();
    if (debug) { log('Prompting user for a search term'); }
    const inBoxOpt: vscode.InputBoxOptions = {
        placeHolder: 'Technique Name or ID',
        prompt: 'Search for an ATT&CK term'
    };
    const input: string|undefined = await vscode.window.showInputBox(inBoxOpt, undefined);
    // if the user cancels the prompt there may be no input to search
    if (input === undefined || input.length === 0) {
        log('No input provided. Cancelling search.');
    }
    // user is ok with potentially many results. continue with search
    else if (input.length < minTermLength) {
        log('Search term is very short. Asking user if they want to continue');
        const confirmationMessage = `Searching for '${input}' may return more results than expected.\n\nAre you sure?`;
        const confirmation: string|undefined = await vscode.window.showWarningMessage(confirmationMessage, {modal: true}, 'Ok');
        if (confirmation === undefined) {
            if (debug) { log(`Search for '${input}' cancelled!`); }
        }
        else {
            if (debug) { log(`Received confirmation from user to search for '${input}'`); }
            results = doSearch(input, techniques);
        }
    }
    // user provided a fairly long term to search - possibility of too many results is low
    else {
        results = doSearch(input, techniques);
    }
    // woohoo! got some search results back
    if (results.length > 0) {
        panel = displayPanel(results, extensionPath);
    }
    return panel;
}

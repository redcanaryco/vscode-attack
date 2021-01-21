import * as vscode from 'vscode';
import { debug } from './configuration';
import { getCurrentTechniques, getRevokedTechniques, output } from './helpers';
import markdownit from 'markdown-it';
const md = markdownit('commonmark');


/*
    Build the search result page
*/
function buildSearchResult(technique: Technique): vscode.MarkdownString {
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
    return mdBuilder;
}

/*
    Build the webview panel
*/
function buildPanel(technique: Technique): vscode.WebviewPanel {
    if (debug) { output.appendLine(`search: Opening webview for ${technique.name} (${technique.id})`); }
    // create a webview which displays the relevant data as markdown
    const panel: vscode.WebviewPanel = vscode.window.createWebviewPanel('vscode-attack', `${technique.id}: ${technique.name}`, vscode.ViewColumn.One, {});
    panel.webview.html = md.render(buildSearchResult(technique).value);
    // only return the first result
    return panel;
}

/*
    Search the list of ATT&CK objects for whatever the user is looking for
*/
export async function search(techniques: Array<Technique>, input: string|undefined = undefined): Promise<Array<vscode.WebviewPanel>> {
    const minTermLength = 4;
    let panels: Array<vscode.WebviewPanel> = new Array<vscode.WebviewPanel>();
    if (debug) { output.appendLine(`search: Prompting user for a search term`); }
    if (input === undefined) {
        const inBoxOpt: vscode.InputBoxOptions = {
            placeHolder: 'Technique Name or ID',
            prompt: 'Search for an ATT&CK term'
        };
        input = await vscode.window.showInputBox(inBoxOpt, undefined);
    }
    // if the user cancels the prompt there may be no input to search
    if (input === undefined || input.length < minTermLength) {
        output.appendLine('ATT&CK: No input provided. Cancelling search.');
        console.log('ATT&CK: No input provided. Cancelling search.');
    }
    else {
        const revokedTechniques: Array<Technique> = getRevokedTechniques(techniques);
        const currentTechniques: Array<Technique> = getCurrentTechniques(techniques);
        // first figure out if the user is searching for a revoked TID
        panels = revokedTechniques.filter((t: Technique) => {
            return t.id.toUpperCase() === input?.toUpperCase();
        }).map<vscode.WebviewPanel>((t: Technique) => { return buildPanel(t); });
        // if the search term isn't a revoked technique, search the current technique names and IDs
        // TODO: there's probably a better way to do this sequence of items
        if (panels.length === 0 && input !== undefined) {
            panels = currentTechniques.filter((t: Technique) => {
                return (t.id.toUpperCase() === input?.toUpperCase() || t.name.toUpperCase().includes(`${input?.toUpperCase()}`));
            }).map<vscode.WebviewPanel>((t: Technique) => { return buildPanel(t); });
        }
        // at this point, if a panel hasn't been created yet, then let's search every technique description
        if (panels.length === 0 && input !== undefined) {
            console.log(`Search term exceeds ${minTermLength} characters: ${input}`);
            panels = currentTechniques.filter((t: Technique) => {
                return (t.description.long.includes(`${input}`));
            }).map<vscode.WebviewPanel>((t: Technique) => { return buildPanel(t); });
        }
        // ... and at this point, if there's still no panel, then let's just give up
        if (panels.length === 0) {
            console.log(`search: Could not find technique matching '${input}'`);
            vscode.window.showErrorMessage(`ATT&CK: Could not find technique matching '${input}'`);
        }
        else {
            console.log(`search: Prompt returned '${input}'`);
            if (debug) { output.appendLine(`search: Prompt returned ${input}`); }
        }
    }
    return panels;
}

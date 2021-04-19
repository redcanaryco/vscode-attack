import * as vscode from 'vscode';
import { configSection, debug } from './configuration';
import { output } from './helpers';


/*
    Generate the appropriate link format based on the current editor's file type
    Currently only supports Markdown links, but more may be added in the future
*/
function generateLink(text: string, url: string): string|undefined {
    let link: string|undefined = undefined;
    if (vscode.window.activeTextEditor?.document.languageId === 'markdown') {
        link = `[${text}](${url})`;
    }
    return link;
}

export function insertLink(editor: vscode.TextEditor|undefined, groups: Array<Group>=[],
                           mitigations: Array<Mitigation>=[], software: Array<Software>=[],
                           tactics: Array<Tactic>=[], techniques: Array<Technique>=[]): void {
    if (editor === undefined) {
        // there's no open text document, so there couldn't possibly be highlighted text
        if (debug) { output.appendLine('insertLink: Could not identify an active editor, so no text can be inserted.'); }
        console.log('insertLink: No activeTextEditor found. Could not identify a text selection as a result');
        vscode.window.showWarningMessage('ATT&CK: Could not insert a link, because there is no active text document.');
    }
    else {
        if (debug) { output.appendLine(`insertLink: Getting currently highlighted text`); }
        const currentSelection: vscode.Selection|undefined = editor.selection;
        if (currentSelection === undefined || currentSelection.isEmpty) {
            // we don't actually have text to replace
            // ... this might happen if this command was called without highlighting text first
            if (debug) { output.appendLine(`insertLink: No text has been selected. Cannot insert link`); }
            console.log('insertLink: Empty selection identified. Cannot insert link');
            vscode.window.showWarningMessage('ATT&CK: Could not insert a link, because no text was selected.');
        }
        else {
            const highlightedText = editor.document.getText(currentSelection).trim();
            if (debug) { output.appendLine(`insertLink: Text to insert a link for: '${highlightedText}'`); }
            const configuration: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(configSection);
            let matchingObject: Group|Mitigation|Software|Tactic|Technique|undefined = undefined;
            // search all ATT&CK types for the first matching ID
            if (matchingObject === undefined && configuration.get('groups')) {
                matchingObject = groups.find((g: Group) => { return g.id === highlightedText; });
            }
            if (matchingObject === undefined && configuration.get('mitigations')) {
                matchingObject = mitigations.find((m: Mitigation) => { return m.id === highlightedText; });
            }
            if (matchingObject === undefined && configuration.get('software')) {
                matchingObject = software.find((s: Software) => { return s.id === highlightedText; });
            }
            if (matchingObject === undefined && configuration.get('tactics')) {
                matchingObject = tactics.find((t: Tactic) => { return t.id === highlightedText; });
            }
            if (matchingObject === undefined && configuration.get('techniques')) {
                matchingObject = techniques.find((t: Technique) => { return t.id === highlightedText; });
            }
            if (matchingObject === undefined) {
                // doesn't look like the highlighted text resembles any ATT&CK object we're aware of
                if (debug) { output.appendLine(`insertLink: Did not find a matching object for '${highlightedText}'`); }
                console.log(`insertLink: Did not find a matching object for '${highlightedText}'`);
                vscode.window.showWarningMessage(`ATT&CK: Could not insert a link, because '${highlightedText.substr(0, 20)}' does not match any available ATT&CK objects.`);
                return;
            }
            const link: string|undefined = generateLink(highlightedText, matchingObject.url);
            if (link === undefined) {
                // we should never get here since we should've detected malformed ATT&CK objects on startup
                // ... but still, let's try to inform the user if something weird happens
                output.appendLine(`insertLink: Could not extract URL for ${matchingObject.id}!`);
                console.log(`insertLink: ATT&CK object has no 'url' attribute to extract! ${JSON.stringify(matchingObject)}`);
                vscode.window.showErrorMessage(`ATT&CK: An error occurred while attempting to insert a link - no associated URL found for ${matchingObject.id}!`);
            }
            else {
                // and we're finally at the point where a link can be inserted
                editor.edit((editBuilder: vscode.TextEditorEdit) => {
                    if (debug) { output.appendLine(`insertLink: Found a matching object. Inserting the following text: '${link}'`); }
                    console.log(`insertLink: Found a matching object. Inserting the following text: '${link}'`);
                    editBuilder.replace(currentSelection, link);
                });
            }
        }
    }
}

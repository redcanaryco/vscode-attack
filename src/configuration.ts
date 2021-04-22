import * as vscode from 'vscode';
import { log } from './helpers';

export const configSection = 'vscode-attack';
export let completionFormat = 'id';
export let debug = true;

export function setDebugLogState(): void {
    if (vscode.workspace.getConfiguration(configSection).get('debug')) {
        debug = true;
        log('Debug logging enabled');
    }
    else {
        debug = false;
        log('Debug logging disabled');
    }
}

export async function setCompletionItemFormat(): Promise<void> {
    let newCompletionFormat: string|undefined = vscode.workspace.getConfiguration(configSection).get('completionFormat');
    if (newCompletionFormat === undefined) {
        // TODO: find a way to pull these from settings instead of hardcoding them
        const options: string[] = [ "id", "name", "fullname", "id-name", "id-fullname" ];
        const selection: string|undefined = await vscode.window.showQuickPick(options);
        newCompletionFormat = selection;
    }
    if (newCompletionFormat !== undefined) {
        completionFormat = newCompletionFormat;
        if (debug) { log(`Set completion item format to '${completionFormat}'`); }
    }
}

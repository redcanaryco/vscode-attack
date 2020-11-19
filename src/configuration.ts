import * as vscode from 'vscode';
import { output } from './helpers';

export const configSection: string = 'vscode-attack';
export let completionFormat: string = 'id';
export let debug: boolean = true;

export function setDebugLogState() {
	if (vscode.workspace.getConfiguration(configSection).get('debug')) {
		debug = true;
		output.appendLine('Debug logging enabled');
	}
	else {
		debug = false;
		output.appendLine('Debug logging disabled');
	}
}

export async function setCompletionItemFormat() {
	let newCompletionFormat: string|undefined = vscode.workspace.getConfiguration(configSection).get('completionFormat');
	if (newCompletionFormat === undefined) {
		// TODO: find a way to pull these from settings instead of hardcoding them
		const options: string[] = [ "id", "name", "fullname", "id-name", "id-fullname" ];
		let selection: string|undefined = await vscode.window.showQuickPick(options);
		newCompletionFormat = selection;
	}
	if (newCompletionFormat !== undefined) {
		completionFormat = newCompletionFormat;
		// console.log(`Set completion item format to '${completionFormat}'`);
		if (debug) { output.appendLine(`Set completion item format to '${completionFormat}'`); }
	}
}

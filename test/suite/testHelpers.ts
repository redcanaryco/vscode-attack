import * as vscode from 'vscode';

export const configSection = 'vscode-attack';
export const extensionID = 'redcanary.vscode-attack';
// some tests may want to suppress log messages for cleaner output, so save the log function for restoration later
export const consoleLogger = console.log;
export let fileArtifacts: vscode.Uri[] = [];
export let disposables: vscode.Disposable[] = [];

// public API returned by our extension mostly just defined here
// to make Typescript shut up about functions it thinks aren't available
export interface ATTACKExtensionAPI {
    getAllTechniques: Function;
    getCurrentTechniques: Function;
    getRevokedTechniques: Function;
    getTactics: Function;
}

// ignore messages logged to the console
export function ignoreConsoleLogs(): void {
    console.log = function (): void { /* ignoring console */ };
}

// clean up environment after tests
export function resetState(): void {
    for (let index = 0; index < fileArtifacts.length; index++) {
        const artifact: vscode.Uri|undefined = fileArtifacts.pop();
        if (artifact !== undefined) {
            try {
                vscode.workspace.fs.delete(artifact, {recursive: true, useTrash: false});
            } catch (err) {
                consoleLogger(`Couldn't remove ${artifact}: ${err}`);
            }
        }
    }
    // forcefully dispose of any events set up during tests
    for (let index = 0; index < disposables.length; index++) {
        const disposable: vscode.Disposable|undefined = disposables.pop();
        if (disposable !== undefined) {
            disposable.dispose();
        }
    }
    // reset console.log function
    console.log = consoleLogger;
}

// set a specific configuration value and return the updated configuration
// WorkspaceConfiguration.update() has an 'any' type for the second parameter, so we'll just carry that through
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setTestConfig(id: string, value: any, configuration: vscode.WorkspaceConfiguration): Promise<void> {
    return configuration.update(id, value, vscode.ConfigurationTarget.Global);
}

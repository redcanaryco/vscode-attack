import * as fs from 'fs';
import * as vscode from 'vscode';


export const configSection = 'vscode-attack';
export const extensionID = 'redcanary.vscode-attack';
// some tests may want to suppress log messages for cleaner output, so save the log function for restoration later
export const consoleLogger = console.log;
export let fileArtifacts: string[] = [];
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
    fileArtifacts.forEach((artifactPath: string) => {
        if (fs.existsSync(artifactPath)) {
            // get info about the file, but don't follow symlinks
            const artifactStats: fs.Stats = fs.lstatSync(artifactPath);
            if (artifactStats.isDirectory()) {
                fs.rmdir(artifactPath, (err) => {
                    if (err) { consoleLogger(`Couldn't remove ${artifactPath}: ${err.message}`); }
                });
            }
            else {
                fs.unlink(artifactPath, (err) => {
                    if (err) { consoleLogger(`Couldn't remove ${artifactPath}: ${err.message}`); }
                });
            }
        }
    });
    fileArtifacts = [];
    // forcefully dispose of any events set up during tests
    disposables.forEach((disposable: vscode.Disposable) => {
        disposable.dispose();
    });
    disposables = [];
    // reset console.log function
    console.log = consoleLogger;
}

// set a specific configuration value and return the updated configuration
// WorkspaceConfiguration.update() has an 'any' type for the second parameter, so we'll just carry that through
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setTestConfig(id: string, value: any, configuration: vscode.WorkspaceConfiguration): Promise<void> {
    return configuration.update(id, value, vscode.ConfigurationTarget.Global);
}

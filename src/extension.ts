import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { configSection, setCompletionItemFormat, setDebugLogState } from './configuration';
import { output } from './helpers';
import * as helpers from './helpers';
import { init as initGroups, register as registerGroups } from './groups';
import { init as initMitigations, register as registerMitigations } from './mitigations';
import { init as initSoftware, register as registerSoftware } from './software';
import { init as initTactics, register as registerTactics } from './tactics';
import { init as initTechniques, register as registerTechniques } from './techniques';
import { search } from './search';


// track the providers we have so we can recreate them in case applicableFiles gets updated or they get toggled
const Providers = {
    groups: new Array<vscode.Disposable>(),
    mitigations: new Array<vscode.Disposable>(),
    software: new Array<vscode.Disposable>(),
    tactics: new Array<vscode.Disposable>(),
    techniques: new Array<vscode.Disposable>(),
    disposeAll: function (): void {
        // dispose of all providers at once
        this.groups.forEach((d: vscode.Disposable) => { d.dispose(); });
        this.mitigations.forEach((d: vscode.Disposable) => { d.dispose(); });
        this.software.forEach((d: vscode.Disposable) => { d.dispose(); });
        this.tactics.forEach((d: vscode.Disposable) => { d.dispose(); });
        this.techniques.forEach((d: vscode.Disposable) => { d.dispose(); });
    },
    pushAll: function (list: Array<vscode.Disposable>): void {
        // push all providers to the given list
        // ... should be used to push into the extension's context
        this.groups.forEach((d: vscode.Disposable) => { list.push(d); });
        this.mitigations.forEach((d: vscode.Disposable) => { list.push(d); });
        this.software.forEach((d: vscode.Disposable) => { list.push(d); });
        this.tactics.forEach((d: vscode.Disposable) => { list.push(d); });
        this.techniques.forEach((d: vscode.Disposable) => { list.push(d); });
    },
};
const currentProviders = Object.create(Providers);

/*
    Check the given extension context's global storage for the file with name 'filename'
    Retrieve the file if it exists or update the cache with data from the provided URL if the file cannot be found
*/
export async function cacheData(storageDir: string): Promise<AttackMap|undefined> {
    let result: AttackMap|undefined = undefined;
    if (!fs.existsSync(storageDir)) {
        // cache the newest version of ATT&CK
        // console.log(`Creating global storage directory: '${storageDir}'`);
        fs.mkdirSync(storageDir, {recursive: true});
        result = await helpers.downloadLatestAttackMap(storageDir);
    }
    else {
        // check the cache directory for matching files
        const cachedPath: string|undefined = await helpers.getLatestCacheVersion(storageDir);
        if (cachedPath === undefined) {
            // no files found - download the latest version from GitHub
            result = await helpers.downloadLatestAttackMap(storageDir);
        }
        else {
            // files found - compare the cached version to the newest version on GitHub
            // Example: enterprise-attack.8.0.json => 8.0
            const cachedVersion = path.basename(cachedPath).replace('enterprise-attack.', '').replace('.json', '');
            const availableVersions: Array<string> = await helpers.getVersions();
            const onlineVersion = `${availableVersions.sort()[availableVersions.length - 1]}`;
            if (cachedVersion < onlineVersion) {
                // if online version is newer than the cached one, download and use the online version
                // console.log(`ATT&CK: New map found! Replacing the cached one.`);
                vscode.window.showInformationMessage(`ATT&CK: Identified a new version of the ATT&CK mapping! Replacing cached version.`);
                result = await helpers.downloadLatestAttackMap(storageDir);
            }
            else {
                // otherwise just use the cached one
                output.appendLine(`Cached version is not older than downloaded version. Nothing to do.`);
                // console.log(`ATT&CK: Cached version is not older than downloaded version. Nothing to do.`);
                const cachedData: string = fs.readFileSync(cachedPath, {encoding: 'utf8'});
                result = JSON.parse(cachedData) as AttackMap;
            }
        }
    }
    return result;
}

/*
    Define rules for when to show status bar to the user
*/
function toggleStatusBar(statusBarItem: vscode.StatusBarItem, editor: vscode.TextEditor|undefined): void {
    const applicableFiles: vscode.DocumentSelector|undefined = vscode.workspace.getConfiguration(configSection).get('applicableFiles');
    if (applicableFiles !== undefined && editor !== undefined) {
        // only display the status bar when the user has a relevant file pulled up
        if (vscode.languages.match(applicableFiles, editor.document)) { statusBarItem.show(); }
        else { statusBarItem.hide(); }
    }
    // if we can't find a relevant document selector or the editor is unclear, just keep whatever currently exists
}

/*
    Create a status bar item that will display the current version of ATT&CK in use
*/
async function createStatusBar(storageDir: string): Promise<vscode.StatusBarItem|undefined> {
    let statusBarItem: vscode.StatusBarItem|undefined = undefined;
    const cachedPath: string|undefined = await helpers.getLatestCacheVersion(storageDir);
    if (cachedPath !== undefined) {
        const version = path.basename(cachedPath).replace('enterprise-attack.', '').replace('.json', '');
        const itemText = `ATT&CK v${version}`;
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        statusBarItem.accessibilityInformation = {label: itemText};
        statusBarItem.text = itemText;
        statusBarItem.command = 'vscode-attack.search';
        // set a callback for when the user changes the current editor
        vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor|undefined) => {
            if (statusBarItem !== undefined) { toggleStatusBar(statusBarItem, editor); }
        });
    }
    return statusBarItem;
}

/*
    Check settings, determine which files this extension should apply to, and regenerate extension features
*/
export function registerFeatures(techniques: Array<Technique>, tactics: Array<Tactic>, groups: Array<Group>, software: Array<Software>, mitigations: Array<Mitigation>): void {
    // TODO: Find a way to check if this array has not been changed since the last time and skip this step
    const configuration: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(configSection);
    const applicableFiles: vscode.DocumentSelector|undefined = configuration.get('applicableFiles');
    if (applicableFiles !== undefined) {
        // console.log(`Registering applicable files for the following document filters: ${JSON.stringify(applicableFiles)}`);
        // first destroy the providers we have already registered to avoid duplicate data
        currentProviders.disposeAll();
        // ... then re-register our features and regenerate completions
        if (configuration.get('groups')) { currentProviders.groups = registerGroups(applicableFiles, groups); }
        if (configuration.get('mitigations')) { currentProviders.mitigations = registerMitigations(applicableFiles, mitigations); }
        if (configuration.get('software')) { currentProviders.software = registerSoftware(applicableFiles, software); }
        if (configuration.get('tactics')) { currentProviders.tactics = registerTactics(applicableFiles, tactics); }
        if (configuration.get('techniques')) { currentProviders.techniques = registerTechniques(applicableFiles, techniques); }
    }
    else {
        vscode.window.showWarningMessage("No applicable files set in VSCode ATT&CK Settings. Most features are unavailable until a file type is added.");
        console.log(`Couldn't parse applicableFiles setting: ${JSON.stringify(applicableFiles)}`);
    }
}

export async function activate(context: vscode.ExtensionContext): Promise<Record<string, Function> | undefined> {
    // output channel
    output.clear();
    output.appendLine('Activating MITRE ATT&CK extension');
    // configuration
    setCompletionItemFormat();
    setDebugLogState();
    // data
    let groups: Array<Group> = new Array<Group>();
    let mitigations: Array<Mitigation> = new Array<Mitigation>();
    let software: Array<Software> = new Array<Software>();
    let tactics: Array<Tactic> = new Array<Tactic>();
    let techniques: Array<Technique> = new Array<Technique>();
    const attackData: AttackMap|undefined = await cacheData(context.globalStorageUri.fsPath);
    if (attackData === undefined) {
        output.appendLine(`Could not parse ATT&CK data from cache! Please restart the IDE`);
        vscode.window.showErrorMessage(`ATT&CK: Could not parse ATT&CK data from cache! Please restart the IDE`);
        console.log(`ATT&CK: Could not parse ATT&CK data from cache! Please restart the IDE`);
    }
    else {
        // parse data
        groups = await initGroups(attackData);
        mitigations = await initMitigations(attackData);
        software = await initSoftware(attackData);
        tactics = await initTactics(attackData);
        techniques = await initTechniques(attackData);
        registerFeatures(techniques, tactics, groups, software, mitigations);
        currentProviders.pushAll(context.subscriptions);
        // regenerate output when configuration has changed
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
            if (e.affectsConfiguration(configSection)) {
                setDebugLogState();
                setCompletionItemFormat();
                registerFeatures(techniques, tactics, groups, software, mitigations);
                currentProviders.pushAll(context.subscriptions);
            }
        }));
        // commands
        context.subscriptions.push(vscode.commands.registerCommand('vscode-attack.search', () => { search(techniques); }));
        // window
        const statusBarItem: vscode.StatusBarItem|undefined = await createStatusBar(context.globalStorageUri.fsPath);
        if (statusBarItem !== undefined) {
            context.subscriptions.push(statusBarItem);
            toggleStatusBar(statusBarItem, vscode.window.activeTextEditor);
        }
        // extension API
        const api: Record<string, Function> = {
            getAllTechniques: function (): Array<Technique> { return techniques; },
            getCurrentTechniques: function (): Array<Technique> { return helpers.getCurrentTechniques(techniques); },
            getRevokedTechniques: function (): Array<Technique> { return helpers.getRevokedTechniques(techniques); },
            getTactics: function (): Array<Tactic> { return tactics; },
        };
        return api;
    }
}

// this method is called when your extension is deactivated
export function deactivate(context: vscode.ExtensionContext): void {
    context.subscriptions.forEach((disposable: vscode.Disposable) => {
        disposable.dispose();
    });
    // console.log('Deactivated vscode-attack');
}

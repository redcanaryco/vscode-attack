import { StringDecoder } from 'string_decoder';
import * as vscode from 'vscode';
import { configSection, debug, setCompletionItemFormat, setDebugLogState } from './configuration';
import { log } from './helpers';
import * as helpers from './helpers';
import { init as initGroups, register as registerGroups } from './groups';
import { init as initMitigations, register as registerMitigations } from './mitigations';
import { init as initSoftware, register as registerSoftware } from './software';
import { init as initTactics, register as registerTactics } from './tactics';
import { init as initTechniques, register as registerTechniques } from './techniques';
import { search } from './search';
import { insertLink } from './insertLink';

// track the providers we have so we can recreate them in case applicableFiles gets updated or they get toggled
const Providers = {
    groups: new Array<vscode.Disposable>(),
    mitigations: new Array<vscode.Disposable>(),
    software: new Array<vscode.Disposable>(),
    tactics: new Array<vscode.Disposable>(),
    techniques: new Array<vscode.Disposable>(),
    disposeAll: function (): void {
        // dispose of all providers at once
        if (debug) { log('Disposing of all providers'); }
        this.groups.forEach((d: vscode.Disposable) => { d.dispose(); });
        this.mitigations.forEach((d: vscode.Disposable) => { d.dispose(); });
        this.software.forEach((d: vscode.Disposable) => { d.dispose(); });
        this.tactics.forEach((d: vscode.Disposable) => { d.dispose(); });
        this.techniques.forEach((d: vscode.Disposable) => { d.dispose(); });
    },
    pushAll: function (list: Array<vscode.Disposable>): void {
        // push all providers to the given list
        // ... should be used to push into the extension's context
        if (debug) { log('Building list of all providers'); }
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
export async function cacheData(storageUri: vscode.Uri): Promise<AttackMap|undefined> {
    let result: AttackMap|undefined = undefined;
    log('Checking extension cache for MITRE ATT&CK mapping.');
    // TODO: Figure out if this will be skipped when storageUri exists
    await vscode.workspace.fs.createDirectory(storageUri);
    const cachedPath: vscode.Uri|undefined = await helpers.getLatestCacheVersion(storageUri);
    if (cachedPath === undefined) {
        // no files found - download the latest version from GitHub
        log('Nothing found in extension cache. Downloading latest version of MITRE ATT&CK mapping');
        result = await helpers.downloadLatestAttackMap(storageUri);
    }
    else {
        if (debug) { log(`Using cache path: ${cachedPath}`); }
        // files found - compare the cached version to the newest version on GitHub
        // Example: enterprise-attack.8.0.json => 8.0
        const cachedVersion = helpers.extractAttackVersion(cachedPath);
        if (debug) { log(`Cached version: ${cachedVersion}`); }
        try {
            const availableVersions: Array<string> = await helpers.getVersions();
            const onlineVersion = `${availableVersions.sort(helpers.versionSorter)[availableVersions.length - 1]}`;
            if (debug) { log(`Online version: ${onlineVersion}`); }
            if (helpers.versionSorter(cachedVersion, onlineVersion) < 0) {
                // if online version is newer than the cached one, download and use the online version
                vscode.window.showInformationMessage('ATT&CK: Identified a new version of the ATT&CK mapping! Replacing cached version.');
                log(`Identified a new version of the ATT&CK mapping! Replacing cached map (${cachedVersion}) with downloaded map (${onlineVersion})`);
                const downloadedData: string = await helpers.downloadAttackMap(storageUri, onlineVersion);
                result = JSON.parse(downloadedData) as AttackMap;
            }
            else {
                // otherwise just use the cached one
                log(`Nothing to do. Cached version is on latest ATT&CK version ${onlineVersion}`);
                const contents: Uint8Array = await vscode.workspace.fs.readFile(cachedPath);
                result = JSON.parse(new StringDecoder('utf8').end(Buffer.from(contents))) as AttackMap;
            }
        } catch (error) {
            log(`Could not download ATT&CK version from GitHub. Falling back to cached version ${cachedVersion}.`);
            const contents: Uint8Array = await vscode.workspace.fs.readFile(cachedPath);
            result = JSON.parse(new StringDecoder('utf8').end(Buffer.from(contents))) as AttackMap;
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
async function createStatusBar(storageUri: vscode.Uri): Promise<vscode.StatusBarItem|undefined> {
    let statusBarItem: vscode.StatusBarItem|undefined = undefined;
    const cachedPath: vscode.Uri|undefined = await helpers.getLatestCacheVersion(storageUri);
    if (cachedPath !== undefined) {
        const version: string = helpers.extractAttackVersion(cachedPath);
        const itemText = `ATT&CK v${version}`;
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        statusBarItem.accessibilityInformation = {label: itemText};
        statusBarItem.text = itemText;
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
        if (debug) { log(`Registering applicable files for the following document filters: ${JSON.stringify(applicableFiles)}`); }
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
        vscode.window.showWarningMessage('No applicable files set in VSCode ATT&CK Settings. Most features are unavailable until a file type is added.');
        log('No applicable files set in VSCode ATT&CK Settings. Most features are unavailable until a file type is added.');
    }
}

export async function activate(context: vscode.ExtensionContext): Promise<Record<string, Function> | undefined> {
    // output channel
    helpers.output.clear();
    log('Activating MITRE ATT&CK extension');
    // configuration
    setCompletionItemFormat();
    setDebugLogState();
    // data
    let groups: Array<Group> = new Array<Group>();
    let mitigations: Array<Mitigation> = new Array<Mitigation>();
    let software: Array<Software> = new Array<Software>();
    let tactics: Array<Tactic> = new Array<Tactic>();
    let techniques: Array<Technique> = new Array<Technique>();
    const attackData: AttackMap|undefined = await cacheData(context.globalStorageUri);
    if (attackData === undefined) {
        log('Could not parse ATT&CK data from cache! Please restart the IDE');
        vscode.window.showErrorMessage('ATT&CK: Could not parse ATT&CK data from cache! Please restart the IDE');
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
        if (debug) { log('Registered configuration watcher'); }
        // commands
        if (vscode.workspace.isTrusted) {
            context.subscriptions.push(vscode.commands.registerCommand('vscode-attack.search', () => { search(techniques, context.extensionPath); }));
            if (debug) { log('Registered command: vscode-attack.search'); }
        }
        else {
            const trustWatcher: vscode.Disposable = vscode.workspace.onDidGrantWorkspaceTrust(() => {
                context.subscriptions.push(vscode.commands.registerCommand('vscode-attack.search', () => { search(techniques, context.extensionPath); }));
                if (debug) { log('Registered command: vscode-attack.search'); }
            });
            context.subscriptions.push(trustWatcher);
            if (debug) { log('Registered workspace trust watcher'); }
        }
        context.subscriptions.push(vscode.commands.registerCommand('vscode-attack.insertLink', () => {
            const editor: vscode.TextEditor|undefined = vscode.window.activeTextEditor;
            // assume the user does not want to use links to revoked techniques, which will be redirected
            // ... to the current technique on the site anyway
            insertLink(editor, groups, mitigations, software, tactics, helpers.getCurrentTechniques(techniques));
        }));
        if (debug) { log('Registered command: vscode-attack.insertLink'); }
        // window
        const statusBarItem: vscode.StatusBarItem|undefined = await createStatusBar(context.globalStorageUri);
        if (statusBarItem !== undefined) {
            context.subscriptions.push(statusBarItem);
            toggleStatusBar(statusBarItem, vscode.window.activeTextEditor);
        }
        if (debug) { log('Registered status bar item'); }
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
    log('Deactivated vscode-attack');
}

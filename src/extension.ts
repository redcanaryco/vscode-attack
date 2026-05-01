import { StringDecoder } from 'string_decoder';
import * as vscode from 'vscode';
import { configSection, attackVersion, debug, getEnabledMatrices, MATRIX_CONFIGS, setAttackVersion, setCompletionItemFormat, setDebugLogState } from './configuration';
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
export async function cacheData(storageUri: vscode.Uri): Promise<{ map: AttackMap; version: string }|undefined> {
    let result: AttackMap|undefined = undefined;
    let loadedVersion = '';
    log('Checking extension cache for MITRE ATT&CK mapping.');
    await vscode.workspace.fs.createDirectory(storageUri);
    const enabledMatrices = getEnabledMatrices();
    log(`Enabled matrices: ${enabledMatrices.map(m => m.displayName).join(', ')}`);
    const requestedVersion = attackVersion === 'latest' ? undefined : attackVersion;
    try {
        const availableVersions: Array<string> = await helpers.getVersions();
        const latestVersion = availableVersions.sort(helpers.compareVersions)[availableVersions.length - 1];
        const targetVersion = requestedVersion || latestVersion;
        loadedVersion = targetVersion;
        if (debug) { log(`Target version: ${targetVersion}`); }
        // check if all enabled matrices are already cached at the target version
        let needsDownload = false;
        const cachedMaps: Array<{ map: AttackMap; config: MatrixConfig }> = [];
        for (const matrixConfig of enabledMatrices) {
            if (helpers.compareVersions(targetVersion, matrixConfig.minVersion) < 0) { continue; }
            const cachedFile = vscode.Uri.joinPath(storageUri, `${matrixConfig.type}.${targetVersion}.json`);
            try {
                const contents: Uint8Array = await vscode.workspace.fs.readFile(cachedFile);
                const map = JSON.parse(new StringDecoder('utf8').end(Buffer.from(contents))) as AttackMap;
                cachedMaps.push({ map, config: matrixConfig });
            } catch {
                needsDownload = true;
                break;
            }
        }
        if (needsDownload) {
            log(`Downloading ATT&CK v${targetVersion} for ${enabledMatrices.length} matrices`);
            vscode.window.showInformationMessage(`ATT&CK: Downloading ATT&CK v${targetVersion}.`);
            result = await helpers.downloadMultipleMatrices(storageUri, targetVersion, enabledMatrices);
        } else if (cachedMaps.length > 0) {
            log(`Using cached ATT&CK v${targetVersion} (${cachedMaps.length} matrices)`);
            const allObjects: Array<AttackObject> = [];
            for (const { map, config } of cachedMaps) {
                const tagged = map.objects.map(obj => ({ ...obj, x_mitre_matrix: config.type as MatrixType }));
                allObjects.push(...tagged);
            }
            result = { type: 'bundle', id: 'bundle--cached', spec_version: cachedMaps[0].map.spec_version, objects: allObjects };
        } else {
            result = await helpers.downloadMultipleMatrices(storageUri, targetVersion, enabledMatrices);
        }
    } catch (error) {
        log(`Could not resolve ATT&CK version from GitHub. Attempting fallback to any cached data.`);
        const cachedPath: vscode.Uri|undefined = await helpers.getLatestCacheVersion(storageUri);
        if (cachedPath !== undefined) {
            loadedVersion = helpers.extractAttackVersion(cachedPath);
            const contents: Uint8Array = await vscode.workspace.fs.readFile(cachedPath);
            result = JSON.parse(new StringDecoder('utf8').end(Buffer.from(contents))) as AttackMap;
        }
    }
    if (result !== undefined) { return { map: result, version: loadedVersion }; }
    return undefined;
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
function createStatusBar(version: string): vscode.StatusBarItem|undefined {
    let statusBarItem: vscode.StatusBarItem|undefined = undefined;
    if (version) {
        const itemText = `ATT&CK v${version}`;
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        statusBarItem.accessibilityInformation = {label: itemText};
        statusBarItem.text = itemText;
        statusBarItem.tooltip = 'Click to change ATT&CK version';
        statusBarItem.command = 'vscode-attack.selectVersion';
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

let updateCheckTimer: ReturnType<typeof setInterval> | undefined = undefined;

async function checkForUpdates(storageUri: vscode.Uri, silent: boolean): Promise<void> {
    try {
        const cachedPath = await helpers.getLatestCacheVersion(storageUri);
        if (cachedPath === undefined) { return; }
        const cachedVersion = helpers.extractAttackVersion(cachedPath);
        const availableVersions = await helpers.getVersions();
        const latestVersion = availableVersions.sort(helpers.compareVersions)[availableVersions.length - 1];
        if (helpers.compareVersions(cachedVersion, latestVersion) < 0) {
            const action = await vscode.window.showInformationMessage(
                `ATT&CK: New version ${latestVersion} available (current: ${cachedVersion})`,
                'Update Now', 'Later'
            );
            if (action === 'Update Now') {
                await helpers.downloadRequestedAttackMap(storageUri);
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        } else if (!silent) {
            vscode.window.showInformationMessage(`ATT&CK: You're on the latest version (${latestVersion})`);
        }
    } catch (error) {
        if (!silent) { log(`Update check failed: ${error}`); }
    }
}

function scheduleUpdateChecks(storageUri: vscode.Uri): void {
    if (updateCheckTimer !== undefined) {
        clearInterval(updateCheckTimer);
        updateCheckTimer = undefined;
    }
    const interval = vscode.workspace.getConfiguration(configSection).get<string>('updateCheckInterval');
    let ms: number | undefined;
    if (interval === 'daily') { ms = 24 * 60 * 60 * 1000; }
    else if (interval === 'weekly') { ms = 7 * 24 * 60 * 60 * 1000; }
    if (ms !== undefined) {
        if (debug) { log(`Scheduling update checks (${interval})`); }
        updateCheckTimer = setInterval(() => { checkForUpdates(storageUri, true); }, ms);
    }
}

export async function activate(context: vscode.ExtensionContext): Promise<Record<string, Function> | undefined> {
    // output channel
    helpers.output.clear();
    log('Activating MITRE ATT&CK extension');
    // configuration
    setCompletionItemFormat();
    setDebugLogState();
    setAttackVersion();
    // data
    let groups: Array<Group> = new Array<Group>();
    let mitigations: Array<Mitigation> = new Array<Mitigation>();
    let software: Array<Software> = new Array<Software>();
    let tactics: Array<Tactic> = new Array<Tactic>();
    let techniques: Array<Technique> = new Array<Technique>();
    const cacheResult = await cacheData(context.globalStorageUri);
    if (cacheResult === undefined) {
        log('Could not parse ATT&CK data from cache! Please restart the IDE');
        vscode.window.showErrorMessage('ATT&CK: Could not parse ATT&CK data from cache! Please restart the IDE');
    }
    else {
        const attackData = cacheResult.map;
        const loadedVersion = cacheResult.version;
        // parse data
        groups = await initGroups(attackData);
        mitigations = await initMitigations(attackData);
        software = await initSoftware(attackData);
        tactics = await initTactics(attackData);
        techniques = await initTechniques(attackData);
        registerFeatures(techniques, tactics, groups, software, mitigations);
        currentProviders.pushAll(context.subscriptions);
        // regenerate output when configuration has changed
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e: vscode.ConfigurationChangeEvent) => {
            if (e.affectsConfiguration(configSection)) {
                setDebugLogState();
                setCompletionItemFormat();
                if (e.affectsConfiguration(`${configSection}.attackVersion`) || e.affectsConfiguration(`${configSection}.matrices`)) {
                    const action = await vscode.window.showInformationMessage(
                        'ATT&CK data settings changed. Reload window to apply?', 'Reload', 'Later'
                    );
                    if (action === 'Reload') {
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                } else if (e.affectsConfiguration(`${configSection}.updateCheckInterval`)) {
                    scheduleUpdateChecks(context.globalStorageUri);
                } else {
                    registerFeatures(techniques, tactics, groups, software, mitigations);
                    currentProviders.pushAll(context.subscriptions);
                }
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
        context.subscriptions.push(vscode.commands.registerCommand('vscode-attack.selectVersion', async () => {
            try {
                const availableVersions = await helpers.getVersions();
                const sorted = availableVersions.sort(helpers.compareVersions).reverse();
                const allMatrices = Object.values(MATRIX_CONFIGS);
                const items: vscode.QuickPickItem[] = [
                    { label: 'latest', description: 'Always use the newest version' },
                    ...sorted.map(v => {
                        const matrices = allMatrices
                            .filter(m => helpers.compareVersions(v, m.minVersion) >= 0)
                            .map(m => m.displayName);
                        return { label: v, description: matrices.join(', ') };
                    })
                ];
                const selection = await vscode.window.showQuickPick(items, { placeHolder: 'Select ATT&CK version' });
                if (selection !== undefined) {
                    await vscode.workspace.getConfiguration(configSection).update('attackVersion', selection.label, vscode.ConfigurationTarget.Global);
                }
            } catch (err) {
                vscode.window.showErrorMessage(`ATT&CK: Could not fetch version list. ${err}`);
            }
        }));
        if (debug) { log('Registered command: vscode-attack.selectVersion'); }
        context.subscriptions.push(vscode.commands.registerCommand('vscode-attack.checkForUpdates', async () => {
            await checkForUpdates(context.globalStorageUri, false);
        }));
        if (debug) { log('Registered command: vscode-attack.checkForUpdates'); }
        // periodic update checks
        scheduleUpdateChecks(context.globalStorageUri);
        // window
        const statusBarItem: vscode.StatusBarItem|undefined = createStatusBar(loadedVersion);
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
    if (updateCheckTimer !== undefined) {
        clearInterval(updateCheckTimer);
        updateCheckTimer = undefined;
    }
    context.subscriptions.forEach((disposable: vscode.Disposable) => {
        disposable.dispose();
    });
    log('Deactivated vscode-attack');
}

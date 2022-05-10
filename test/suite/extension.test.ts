import * as assert from 'assert';
import * as os from 'os';
import { StringDecoder } from 'string_decoder';
import * as vscode from 'vscode';
import * as extension from '../../src/extension';
import * as helpers from '../../src/helpers';
import { configSection, consoleLogger, extensionID, fileArtifacts, ignoreConsoleLogs, resetState, setTestConfig } from './testHelpers';


describe('ATT&CK Map Cache', function () {
    beforeEach(ignoreConsoleLogs);
    afterEach(resetState);
    it('should use a cached version of the ATT&CK map if available', async function () {
        const tmpDir: vscode.Uri = vscode.Uri.file(os.tmpdir());
        const tmpPath: vscode.Uri = vscode.Uri.joinPath(tmpDir, 'enterprise-attack.1000.json');
        const oldMapUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack7.json`);
        // copy the ATT&CK map into the test cache and collect the timestamp of the cached data
        await vscode.workspace.fs.createDirectory(tmpDir);
        fileArtifacts.push(tmpDir);
        await vscode.workspace.fs.copy(oldMapUri, tmpPath, {overwrite: true});
        fileArtifacts.push(tmpPath);
        const cachedFileStats: vscode.FileStat = await vscode.workspace.fs.stat(tmpPath);
        // now test cacheData with the same tmp directory, knowing that the file should already exist
        await extension.cacheData(tmpDir);
        const newFileStats: vscode.FileStat = await vscode.workspace.fs.stat(tmpPath);
        // ... and assert that the file was not modified
        assert.strictEqual(cachedFileStats.mtime, newFileStats.mtime, `${new Date(cachedFileStats.mtime).toUTCString()} !== ${new Date(newFileStats.mtime).toUTCString()}`);
    });
    it('should download a new version of the ATT&CK map if none is cached', async function () {
        const tmpDir: vscode.Uri = vscode.Uri.file(os.tmpdir());
        // collect the current timestamp
        const currTime: Date = new Date();
        await extension.cacheData(tmpDir);
        // now test cacheData with the same tmp directory, knowing that the file should already exist
        const tmpPath: vscode.Uri | undefined = await helpers.getLatestCacheVersion(tmpDir);
        assert.ok(tmpPath !== undefined);
        // queue this up to be deleted after the test has finished
        fileArtifacts.push(tmpPath);
        // const cachedFileStats: fs.Stats = fs.statSync(tmpPath.fsPath);
        const cachedFileStats: vscode.FileStat = await vscode.workspace.fs.stat(tmpPath);
        // ... and assert that the modified time is pretty close to our current time
        // allow the cached file to be created within 15 seconds of current time, just for some wiggle room
        assert.ok((currTime.getMilliseconds() - cachedFileStats.mtime) < 15000);
    });
    it('should download a new version of the ATT&CK map if the available one is outdated', async function () {
        const tmpDir: vscode.Uri = vscode.Uri.file(os.tmpdir());
        const tmpPath: vscode.Uri = vscode.Uri.joinPath(tmpDir, 'enterprise-attack.7.2.json');
        const oldMapUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack7.json`);
        const oldContents: Uint8Array = await vscode.workspace.fs.readFile(oldMapUri);
        const oldMap: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(oldContents))) as AttackMap;
        fileArtifacts.push(tmpPath);
        // copy the ATT&CK map v7.2 into the test cache
        await vscode.workspace.fs.copy(oldMapUri, tmpPath, {overwrite: false});
        // now test cacheData with the same tmp directory, knowing that the file should exist but be older than the latest version
        const attackMap: AttackMap | undefined = await extension.cacheData(tmpDir);
        // now check to make sure this is the latest version
        assert.ok(attackMap !== undefined);
        assert.strictEqual(helpers.isAttackMapNewer(attackMap, oldMap), true);
    });
    it.skip('should use a cached version of the ATT&CK map if the online version could not be downloaded', async function () {
        // TODO
    });
});

describe('General Settings', function () {
    let ext: vscode.Extension<unknown> | undefined;
    let modifiedConfig: vscode.WorkspaceConfiguration;
    const testUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/test.md`);

    before(async function () {
        ignoreConsoleLogs();
        ext = vscode.extensions.getExtension(extensionID);
        await ext?.activate();
        exports = ext?.exports;
        modifiedConfig = vscode.workspace.getConfiguration(configSection);
    });
    after(async function () {
        await setTestConfig('debug', undefined, modifiedConfig);
        await setTestConfig('description', undefined, modifiedConfig);
    });
    beforeEach(ignoreConsoleLogs);
    afterEach(resetState);
    it.skip('debug: should enable debug logging when set', async function () {
        await setTestConfig('debug', true, modifiedConfig);
        ext?.activate().then(() => {
            consoleLogger(`extension activated`);
        });
    });
    it.skip('debug: should disable debug logging when unset', async function () {
        await setTestConfig('debug', false, modifiedConfig);
        ext?.activate().then(() => {
            consoleLogger(`extension activated`);
        });
    });
    it('description: should show a one-line description when set to short', async function () {
        const tid = 'T1059.001';
        await setTestConfig('description', 'short', modifiedConfig);
        const position: vscode.Position = new vscode.Position(0, tid.length);
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 1);
        assert.ok(results[0] instanceof vscode.Hover);
        const contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
        // there should be 6 lines for this - a header, the source link, a blank line, the tactics, a blank line, and the one-line description
        const lines: Array<string> = contents.value.split('\n');
        assert.strictEqual(lines.length, 6);
        assert.ok(lines.reverse()[0].length > 0);
    });
    it('description: should show a complete description when set to long', async function () {
        const tid = 'T1059.001';
        await setTestConfig('description', 'long', modifiedConfig);
        const position: vscode.Position = new vscode.Position(0, tid.length);
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 1);
        assert.ok(results[0] instanceof vscode.Hover);
        const contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
        const lines: Array<string> = contents.value.split('\n');
        // 8 lines: header, link, 3-line description + 2 blank lines, and a final blank line
        assert.strictEqual(lines.length, 8);
    });
    it('description: should show only a source link when set to link', async function () {
        const tid = 'T1059.001';
        await setTestConfig('description', 'link', modifiedConfig);
        const position: vscode.Position = new vscode.Position(0, tid.length);
        const results = await vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position);
        assert.ok(results instanceof Array);
        assert.strictEqual(results.length, 1);
        assert.ok(results[0] instanceof vscode.Hover);
        const contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
        // header, link, and 2 blank lines
        const lines: Array<string> = contents.value.split('\n');
        assert.strictEqual(lines.length, 4);
        assert.strictEqual(lines.reverse()[0].length, 0);
    });
    it.skip('applicableFiles: should automatically enable features when applicable file is specified', async function () {
        consoleLogger('Putting this here to avoid linter errors on no-empty-function');
    });
    it.skip('applicableFiles: should ignore entries that do not match document selector types', async function () {
        consoleLogger('Putting this here to avoid linter errors on no-empty-function');
    });
});

describe('Workspace Trust', function () {
    let ext: vscode.Extension<unknown> | undefined;
    let modifiedConfig: vscode.WorkspaceConfiguration;
    const searchCommand = 'vscode-attack.search';

    before(async function () {
        ignoreConsoleLogs();
        ext = vscode.extensions.getExtension(extensionID);
        await ext?.activate();
        modifiedConfig = vscode.workspace.getConfiguration();
    });
    after(async function () {
        await setTestConfig('security.workspace.trust.enabled', undefined, modifiedConfig);
    });
    beforeEach(ignoreConsoleLogs);
    afterEach(resetState);
    it('should enable Search command when workspace is trusted', async function () {
        await setTestConfig('security.workspace.trust.enabled', true, modifiedConfig);
        vscode.commands.getCommands(true).then((commands: string[]) => {
            // consoleLogger(JSON.stringify(modifiedConfig.get('security.workspace.trust.enabled')));
            const command = commands.find((cmd) => { return cmd === searchCommand; });
            assert.strictEqual(searchCommand, command, `No '${searchCommand}' exists.`);
        });
    });
    it('should disable Search command when workspace is untrusted', async function () {
        await setTestConfig('security.workspace.trust.enabled', false, modifiedConfig);
        vscode.commands.getCommands(true).then((commands: string[]) => {
            // consoleLogger(JSON.stringify(modifiedConfig.get('security.workspace.trust.enabled')));
            const command = commands.find((cmd) => { return cmd === searchCommand; });
            assert.strictEqual(undefined, command, `'${searchCommand}' exists when it should not.`);
        });
    });
});

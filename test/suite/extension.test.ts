import * as assert from 'assert';
import * as os from 'os';
import { StringDecoder } from 'string_decoder';
import * as vscode from 'vscode';
import * as extension from '../../src/extension';
import * as helpers from '../../src/helpers';
import { configSection, consoleLogger, extensionID, fileArtifacts, ignoreConsoleLogs, resetState, setTestConfig } from './testHelpers';


describe('Extension', function () {
    this.timeout(10000);

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
        await vscode.workspace.fs.copy(oldMapUri, tmpPath, {overwrite: true});
        // now test cacheData with the same tmp directory, knowing that the file should exist but be older than the latest version
        const attackMap: AttackMap | undefined = await extension.cacheData(tmpDir);
        // now check to make sure this is the latest version
        assert.ok(attackMap !== undefined);
        assert.strictEqual(helpers.isAttackMapNewer(attackMap, oldMap), true);
    });
    it.skip('should use a cached version of the ATT&CK map if the online version could not be downloaded', async function () {
        // TODO
    });
    it.skip('toggleStatusBar: should display to the user when a matching file is active', async function () {
        // TODO
    });
    it.skip('toggleStatusBar: should hide when a non-matching file is active', async function () {
        // TODO
    });
    it.skip('createStatusBar: should create a status bar item from the latest ATT&CK version in the cache directory', async function () {
        // TODO
    });
    it.skip('createStatusBar: should execute thes search command when clicked', async function () {
        // TODO
    });
    it('downloadAttackMap: should download the specified ATT&CK mapping version', async function () {
        const expectedUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack8.json`);
        const contents: Uint8Array = await vscode.workspace.fs.readFile(expectedUri);
        const expectedMap: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(contents))) as AttackMap;
        const version = '8.0';
        const tmpDir: vscode.Uri = vscode.Uri.file(os.tmpdir());
        const tmpPath: vscode.Uri = vscode.Uri.joinPath(tmpDir, `enterprise-attack.v${version}.json`);
        // queue this up to be deleted after the test has finished
        fileArtifacts.push(tmpPath);
        const actualContents: string = await helpers.downloadAttackMap(tmpDir, version);
        assert.notStrictEqual(actualContents, '', 'downloadAttackMap() returned an empty string');
        assert.ok(actualContents !== undefined);
        const actualMapping: AttackMap = JSON.parse(actualContents) as AttackMap;
        assert.deepStrictEqual(expectedMap, actualMapping, 'Parsed ATT&CK maps are not the same');
    }).timeout(5000);
    it('downloadAttackMap: should return an empty string if the provided version does not exist', async function () {
        const version = 'ThisDoesNotExist';
        const tmpDir: vscode.Uri = vscode.Uri.file(os.tmpdir());
        const tmpPath: vscode.Uri = vscode.Uri.joinPath(tmpDir, 'enterprise-attack.json');
        // queue this up to be deleted after the test has finished
        fileArtifacts.push(tmpPath);
        const actualContents: string = await helpers.downloadAttackMap(tmpDir, version);
        assert.strictEqual(actualContents, '', `downloadAttackMap returned something other than an empty string! ${actualContents.substr(0, 10)}...`);
    }).timeout(5000);
    it('getLatestCacheVersion: should return the file if only one is in the cache directory', async function () {
        const tmpDir: vscode.Uri = vscode.Uri.joinPath(vscode.Uri.file(os.tmpdir()), 'getLatestCacheVersionTest1');
        fileArtifacts.push(tmpDir);
        const fileUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack7.json`);
        const expectedPath: vscode.Uri = vscode.Uri.joinPath(tmpDir, `enterprise-attack.7.2.json`);
        await vscode.workspace.fs.copy(fileUri, expectedPath, {overwrite: true});
        fileArtifacts.push(expectedPath);
        const result: vscode.Uri|undefined = await helpers.getLatestCacheVersion(tmpDir);
        assert.strictEqual(result?.fsPath, expectedPath.fsPath);
    });
    it('getLatestCacheVersion: should return the newest file if multiple are in the cache directory', async function () {
        const tmpDir: vscode.Uri = vscode.Uri.joinPath(vscode.Uri.file(os.tmpdir()), 'getLatestCacheVersionTest2');
        fileArtifacts.push(tmpDir);
        const v7Uri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack7.json`);
        const oldPath: vscode.Uri = vscode.Uri.joinPath(tmpDir, 'enterprise-attack.7.2.json');
        await vscode.workspace.fs.copy(v7Uri, oldPath, {overwrite: true});
        fileArtifacts.push(oldPath);
        const v8Uri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack8.json`);
        const expectedPath: vscode.Uri = vscode.Uri.joinPath(tmpDir, 'enterprise-attack.8.0.json');
        await vscode.workspace.fs.copy(v8Uri, expectedPath, {overwrite: true});
        fileArtifacts.push(expectedPath);
        const result: vscode.Uri|undefined = await helpers.getLatestCacheVersion(tmpDir);
        assert.strictEqual(result?.fsPath, expectedPath.fsPath);
    });
    it('getLatestCacheVersion: should return undefined if there are no files in the cache directory', async function () {
        const tmpDir: vscode.Uri = vscode.Uri.joinPath(vscode.Uri.file(os.tmpdir()), 'getLatestCacheVersionTest3');
        await vscode.workspace.fs.createDirectory(tmpDir);
        fileArtifacts.push(tmpDir);
        const result: vscode.Uri|undefined = await helpers.getLatestCacheVersion(tmpDir);
        assert.strictEqual(result, undefined);
    });
    it('getLatestCacheVersion: should throw an exception if the cache directory does not exist', async function () {
        const tmpDir: vscode.Uri = vscode.Uri.joinPath(vscode.Uri.file(os.tmpdir()), 'ThisDoesNotExist');
        const result: vscode.Uri|undefined = await helpers.getLatestCacheVersion(tmpDir);
        assert.strictEqual(result, undefined);
    });
    it('getModifiedTime: should return the modified time of an ATT&CK mapping', async function () {
        const fileUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack7.json`);
        const expectedModifiedTime = '2020-07-02T14:18:03.651Z';
        const contents: Uint8Array = await vscode.workspace.fs.readFile(fileUri);
        const mapping: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(contents)));
        assert.strictEqual(helpers.getModifiedTime(mapping), expectedModifiedTime);
    });
    it('getModifiedTime: should return undefined if no modified time could be parsed', async function () {
        assert.strictEqual(helpers.getModifiedTime({} as AttackMap), undefined);
    });
    it('getVersions: should return all tags matching \'ATT&CK-v\'', async function () {
        const prefix = 'ATT&CK-v';
        const tags: Array<string> | undefined = await helpers.getVersions(prefix);
        assert.ok(tags !== undefined);
        tags.every((refTag: string) => { assert.ok(refTag.match(/[0-9]+.[0-9]+/)); });
    });
    it('getVersions: should return one tag for a very specific prefix', async function () {
        const prefix = 'subtechniques-beta';
        const tags: Array<string> | undefined = await helpers.getVersions(prefix);
        assert.ok(tags !== undefined);
        assert.strictEqual(tags.length, 1);
        assert.strictEqual(tags[0], prefix);
    });
    it('getVersions: should return all tags for an undefined prefix', async function () {
        const tags: Array<string> | undefined = await helpers.getVersions('');
        assert.ok(tags !== undefined);
        // lazy way of checking this and not having to worry about every new tag added afterwards
        // if there's 20+ tags we're most likely catching all of them
        assert.ok(tags.length >= 22);
    });
    it('isAttackMapNewer: should return true if prospective is newer than familiar', async function () {
        const prospectiveUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack8.json`);
        const prospective: Uint8Array = await vscode.workspace.fs.readFile(prospectiveUri);
        const prospectiveMap: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(prospective)));
        const familiarUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack7.json`);
        const familiar: Uint8Array = await vscode.workspace.fs.readFile(familiarUri);
        const familiarMap: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(familiar)));
        assert.strictEqual(helpers.isAttackMapNewer(prospectiveMap, familiarMap), true);
    });
    it('isAttackMapNewer: should return false if prospective is older than familiar', async function () {
        const prospectiveUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack7.json`);
        const prospective: Uint8Array = await vscode.workspace.fs.readFile(prospectiveUri);
        const prospectiveMap: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(prospective)));
        const familiarUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack8.json`);
        const familiar: Uint8Array = await vscode.workspace.fs.readFile(familiarUri);
        const familiarMap: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(familiar)));
        assert.strictEqual(helpers.isAttackMapNewer(prospectiveMap, familiarMap), false);
    });
    it('isAttackMapNewer: should return false if prospective is the same as familiar', async function () {
        const prospectiveUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack8.json`);
        const prospective: Uint8Array = await vscode.workspace.fs.readFile(prospectiveUri);
        const prospectiveMap: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(prospective)));
        const familiarUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack8.json`);
        const familiar: Uint8Array = await vscode.workspace.fs.readFile(familiarUri);
        const familiarMap: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(familiar)));
        assert.strictEqual(helpers.isAttackMapNewer(prospectiveMap, familiarMap), false);
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

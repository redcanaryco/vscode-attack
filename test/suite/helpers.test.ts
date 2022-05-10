import * as assert from 'assert';
import * as os from 'os';
import { StringDecoder } from 'string_decoder';
import * as vscode from 'vscode';
import * as helpers from '../../src/helpers';
import { fileArtifacts, ignoreConsoleLogs, resetState } from './testHelpers';


describe('Helpers: getLatestAttackVersion', function () {
    beforeEach(ignoreConsoleLogs);
    afterEach(resetState);
    it('should return the file if only one is in the cache directory', async function () {
        const tmpDir: vscode.Uri = vscode.Uri.joinPath(vscode.Uri.file(os.tmpdir()), 'getLatestCacheVersionTest1');
        fileArtifacts.push(tmpDir);
        const fileUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack7.json`);
        const expectedPath: vscode.Uri = vscode.Uri.joinPath(tmpDir, `enterprise-attack.7.2.json`);
        await vscode.workspace.fs.copy(fileUri, expectedPath, {overwrite: true});
        fileArtifacts.push(expectedPath);
        const result: vscode.Uri|undefined = await helpers.getLatestCacheVersion(tmpDir);
        assert.strictEqual(result?.fsPath, expectedPath.fsPath);
    });
    it('should return the newest file if multiple are in the cache directory', async function () {
        const tmpDir: vscode.Uri = vscode.Uri.joinPath(vscode.Uri.file(os.tmpdir()), 'getLatestCacheVersionTest2');
        fileArtifacts.push(tmpDir);
        const oldUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack7.json`);
        const oldPath: vscode.Uri = vscode.Uri.joinPath(tmpDir, 'enterprise-attack.7.2.json');
        await vscode.workspace.fs.copy(oldUri, oldPath, {overwrite: true});
        fileArtifacts.push(oldPath);
        const newUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack11.json`);
        const expectedPath: vscode.Uri = vscode.Uri.joinPath(tmpDir, 'enterprise-attack.11.0.json');
        await vscode.workspace.fs.copy(newUri, expectedPath, {overwrite: true});
        fileArtifacts.push(expectedPath);
        const result: vscode.Uri|undefined = await helpers.getLatestCacheVersion(tmpDir);
        assert.strictEqual(result?.fsPath, expectedPath.fsPath);
    });
    it('should return undefined if there are no files in the cache directory', async function () {
        const tmpDir: vscode.Uri = vscode.Uri.joinPath(vscode.Uri.file(os.tmpdir()), 'getLatestCacheVersionTest3');
        await vscode.workspace.fs.createDirectory(tmpDir);
        fileArtifacts.push(tmpDir);
        const result: vscode.Uri|undefined = await helpers.getLatestCacheVersion(tmpDir);
        assert.strictEqual(result, undefined);
    });
    it('should throw an exception if the cache directory does not exist', async function () {
        const tmpDir: vscode.Uri = vscode.Uri.joinPath(vscode.Uri.file(os.tmpdir()), 'ThisDoesNotExist');
        const result: vscode.Uri|undefined = await helpers.getLatestCacheVersion(tmpDir);
        assert.strictEqual(result, undefined);
    });
});

describe('Helpers: downloadAttackMap', function () {
    beforeEach(ignoreConsoleLogs);
    afterEach(resetState);
    it('should download the specified ATT&CK mapping version', async function () {
        const expectedUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack11.json`);
        const contents: Uint8Array = await vscode.workspace.fs.readFile(expectedUri);
        const expectedMap: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(contents))) as AttackMap;
        const version = '11.0';
        const tmpDir: vscode.Uri = vscode.Uri.file(os.tmpdir());
        const tmpPath: vscode.Uri = vscode.Uri.joinPath(tmpDir, `enterprise-attack.${version}.json`);
        // queue this up to be deleted after the test has finished
        fileArtifacts.push(tmpPath);
        const actualContents: string = await helpers.downloadAttackMap(tmpDir, version);
        assert.notStrictEqual(actualContents, '', 'downloadAttackMap() returned an empty string');
        assert.ok(actualContents !== undefined);
        const actualMapping: AttackMap = JSON.parse(actualContents) as AttackMap;
        assert.deepStrictEqual(expectedMap, actualMapping, 'Parsed ATT&CK maps are not the same');
    });
    it('should return an empty string if the provided version does not exist', async function () {
        const version = 'ThisDoesNotExist';
        const tmpDir: vscode.Uri = vscode.Uri.file(os.tmpdir());
        const actualContents: string = await helpers.downloadAttackMap(tmpDir, version);
        assert.strictEqual(actualContents, '', `downloadAttackMap returned something other than an empty string! ${actualContents.substr(0, 10)}...`);
    });
});

describe('Helpers: getModifiedTime', function () {
    beforeEach(ignoreConsoleLogs);
    afterEach(resetState);
    it('should return the modified time of an ATT&CK mapping', async function () {
        const fileUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack7.json`);
        const expectedModifiedTime = '2020-07-02T14:18:03.651Z';
        const contents: Uint8Array = await vscode.workspace.fs.readFile(fileUri);
        const mapping: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(contents)));
        assert.strictEqual(helpers.getModifiedTime(mapping), expectedModifiedTime);
    });
    it('should return undefined if no modified time could be parsed', async function () {
        assert.strictEqual(helpers.getModifiedTime({} as AttackMap), undefined);
    });
});

describe('Helpers: getVersions', function () {
    beforeEach(ignoreConsoleLogs);
    afterEach(resetState);
    it('should return all tags matching \'ATT&CK-v\'', async function () {
        const prefix = 'ATT&CK-v';
        const tags: Array<string> | undefined = await helpers.getVersions(prefix);
        assert.ok(tags !== undefined);
        tags.every((refTag: string) => { assert.ok(refTag.match(/[0-9]+.[0-9]+/)); });
    });
    it('should return one tag for a very specific prefix', async function () {
        const prefix = 'subtechniques-beta';
        const tags: Array<string> | undefined = await helpers.getVersions(prefix);
        assert.ok(tags !== undefined);
        assert.strictEqual(tags.length, 1);
        assert.strictEqual(tags[0], prefix);
    });
    it('should return all tags for an undefined prefix', async function () {
        const tags: Array<string> | undefined = await helpers.getVersions('');
        assert.ok(tags !== undefined);
        // lazy way of checking this and not having to worry about every new tag added afterwards
        // if there's 20+ tags we're most likely catching all of them
        assert.ok(tags.length >= 22);
    });
});

describe('Helpers: isAttackMapNewer', function () {
    beforeEach(ignoreConsoleLogs);
    afterEach(resetState);
    it('should return true if prospective is newer than familiar', async function () {
        const prospectiveUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack11.json`);
        const prospective: Uint8Array = await vscode.workspace.fs.readFile(prospectiveUri);
        const prospectiveMap: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(prospective)));
        const familiarUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack7.json`);
        const familiar: Uint8Array = await vscode.workspace.fs.readFile(familiarUri);
        const familiarMap: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(familiar)));
        assert.strictEqual(helpers.isAttackMapNewer(prospectiveMap, familiarMap), true);
    });
    it('should return false if prospective is older than familiar', async function () {
        const prospectiveUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack7.json`);
        const prospective: Uint8Array = await vscode.workspace.fs.readFile(prospectiveUri);
        const prospectiveMap: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(prospective)));
        const familiarUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack11.json`);
        const familiar: Uint8Array = await vscode.workspace.fs.readFile(familiarUri);
        const familiarMap: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(familiar)));
        assert.strictEqual(helpers.isAttackMapNewer(prospectiveMap, familiarMap), false);
    });
    it('should return false if prospective is the same as familiar', async function () {
        const prospectiveUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack11.json`);
        const prospective: Uint8Array = await vscode.workspace.fs.readFile(prospectiveUri);
        const prospectiveMap: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(prospective)));
        const familiarUri: vscode.Uri = vscode.Uri.file(`${__dirname}/../../../test/files/attack11.json`);
        const familiar: Uint8Array = await vscode.workspace.fs.readFile(familiarUri);
        const familiarMap: AttackMap = JSON.parse(new StringDecoder('utf8').end(Buffer.from(familiar)));
        assert.strictEqual(helpers.isAttackMapNewer(prospectiveMap, familiarMap), false);
    });
});

import * as assert from 'assert';
import { IncomingMessage } from 'http';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as extension from '../../extension';
import * as helpers from '../../helpers';
import * as search from '../../search';

const configSection: string = 'vscode-attack';
const extensionID: string = 'rctgardner.vscode-attack';
// const extensionConfig: string = 'vscode-attack';
const enterpriseAttackFilename: string = 'enterprise-attack.json';
const enterpriseAttackURL: string = 'https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json';
// some tests may want to suppress log messages for cleaner output, so save the log function for restoration later
let consoleLogger = console.log;
let fileArtifacts: string[] = [];
let disposables: vscode.Disposable[] = [];

// public API returned by our extension mostly just defined here
// to make Typescript shut up about functions it thinks aren't available
interface ATTACKExtensionAPI {
	getAllTechniques: Function,
	getCurrentTechniques: Function,
	getRevokedTechniques: Function,
	getTactics: Function,
}

function resetState() {
	fileArtifacts.forEach((artifactPath: string) => {
		if (fs.existsSync(artifactPath)) {
			// get info about the file, but don't follow symlinks
			let artifactStats: fs.Stats = fs.lstatSync(artifactPath);
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
		};
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
function ignoreConsoleLogs() {
	console.log = function () {	/* ignore messages logged to the console */ };
}

describe('Extension', function () {
	this.timeout(10000);

	beforeEach(ignoreConsoleLogs);
	afterEach(resetState);
	it('should use a cached version of the ATT&CK technique data if available', function (done) {
		const tmpDir: string = os.tmpdir();
		const tmpPath: string = path.join(tmpDir, enterpriseAttackFilename);
		// queue this up to be deleted after the test has finished
		fileArtifacts.push(tmpPath);
		let fileContents: string = "";
		// save the ATT&CK mapping to the temp directory first
		// ... so that we know we have a cached version before testing our function
		https.get(enterpriseAttackURL, (res: IncomingMessage) => {
			res.setEncoding('utf8');
			res.on('data', (chunk) => { fileContents = fileContents.concat(chunk); });
			res.on('end', async function () {
				fs.writeFileSync(tmpPath, fileContents.toString());
				// collect the timestamp of the cached data
				let cachedFileStats: fs.Stats = fs.statSync(tmpPath);
				// now test cacheData with the same tmp directory, knowing that the file should already exist
				extension.cacheData(tmpDir).then(() => {
					let newFileStats: fs.Stats = fs.statSync(tmpPath);
					// ... and assert that the file was not modified
					const errMsg: string = `${cachedFileStats.mtime.toUTCString()} !== ${newFileStats.mtime.toUTCString()}`;
					assert.strictEqual(cachedFileStats.mtimeMs, newFileStats.mtimeMs, errMsg);
					done();
				});
			});
		});
	});
	it('should download a new version of the ATT&CK technique data if none is cached', function (done) {
		const tmpDir: string = os.tmpdir();
		// collect the current timestamp
		const currTime: Date = new Date();
		extension.cacheData(tmpDir).then(async () => {
			// now test cacheData with the same tmp directory, knowing that the file should already exist
			const tmpPath: string | undefined = await helpers.getLatestCacheVersion(tmpDir);
			if (tmpPath !== undefined) {
				// queue this up to be deleted after the test has finished
				fileArtifacts.push(tmpPath);
				let cachedFileStats: fs.Stats = fs.statSync(tmpPath);
				// ... and assert that the modified time is pretty close to our current time
				// allow the cached file to be created within 15 seconds of current time, just for some wiggle room
				assert.ok((currTime.getMilliseconds() - cachedFileStats.mtimeMs) < 15000);
				done();
			}
		});
	});
	it('should download a new version of the ATT&CK technique data if the available one is outdated', function (done) {
		const tmpDir: string = os.tmpdir();
		const tmpPath: string = path.join(tmpDir, 'enterprise-attack.7.2.json');
		const oldMapPath: string = path.join(__dirname, '..', '..', '..', 'src', 'test', 'files', 'attack7.json');
		const oldMap: AttackMap = JSON.parse(fs.readFileSync(oldMapPath).toString()) as AttackMap;
		// queue this up to be deleted after the test has finished
		fileArtifacts.push(tmpPath);
		// copy the ATT&CK map v7.2 into the test cache
		fs.copyFileSync(oldMapPath, tmpPath);
		// now test cacheData with the same tmp directory, knowing that the file should exist but be older than the latest version
		extension.cacheData(tmpDir).then((attackMap: AttackMap | undefined) => {
			// now check to make sure this is the latest version
			if (attackMap !== undefined) {
				assert.strictEqual(helpers.isAttackMapNewer(attackMap, oldMap), true);
				done();
			}
		});
	});
	it.skip('toggleStatusBar: should display to the user when a matching file is active', function (done) {
		// TODO
	});
	it.skip('toggleStatusBar: should hide when a non-matching file is active', function (done) {
		// TODO
	});
	it.skip('createStatusBar: should create a status bar item from the latest ATT&CK version in the cache directory', function (done) {
		// TODO
	});
	it.skip('createStatusBar: should execute thes search command when clicked', function (done) {
		// TODO
	});
});

describe('Helpers', function () {
	beforeEach(ignoreConsoleLogs);
	afterEach(resetState);
	it('downloadAttackMap: should download the specified ATT&CK mapping version', function (done) {
		const expectedPath: string = path.join(__dirname, '..', '..', '..', 'src', 'test', 'files', 'attack8.json');
		const expectedMapping: AttackMap = JSON.parse(fs.readFileSync(expectedPath).toString()) as AttackMap;
		const version: string = '8.0';
		const tmpDir: string = os.tmpdir();
		const tmpPath: string = path.join(tmpDir, `enterprise-attack.v${version}.json`);
		// queue this up to be deleted after the test has finished
		fileArtifacts.push(tmpPath);
		helpers.downloadAttackMap(tmpDir, version).then((actualContents: string) => {
			assert.notStrictEqual(actualContents, '', 'downloadAttackMap() returned an empty string');
			if (actualContents !== undefined) {
				const actualMapping: AttackMap = JSON.parse(actualContents) as AttackMap;
				assert.deepStrictEqual(expectedMapping, actualMapping, 'Parsed ATT&CK maps are not the same');
				done();
			}
		});
	}).timeout(5000);
	it('downloadAttackMap: should return an empty string if the provided version does not exist', function (done) {
		const version: string = 'ThisDoesNotExist';
		const tmpDir: string = os.tmpdir();
		const tmpPath: string = path.join(tmpDir, enterpriseAttackFilename);
		// queue this up to be deleted after the test has finished
		fileArtifacts.push(tmpPath);
		helpers.downloadAttackMap(tmpPath, version).then((actualContents: string) => {
			assert.strictEqual(actualContents, '', `downloadAttackMap returned something other than an empty string! ${actualContents.substr(0, 10)}...`);
			done();
		});
	}).timeout(5000);
	it('getLatestCacheVersion: should return the file if only one is in the cache directory', function (done) {
		const tmpDir: string = path.join(os.tmpdir(), 'getLatestCacheVersionTest1');
		fs.mkdirSync(tmpDir);
		const v8Path: string = path.join(__dirname, '..', '..', '..', 'src', 'test', 'files', 'attack7.json');
		const expectedPath: string = path.join(tmpDir, `enterprise-attack.7.2.json`);
		fs.copyFileSync(v8Path, expectedPath);
		fileArtifacts.push(expectedPath);
		helpers.getLatestCacheVersion(tmpDir).then((result: string | undefined) => {
			assert.strictEqual(result, expectedPath);
			done();
		});
	});
	it('getLatestCacheVersion: should return the newest file if multiple are in the cache directory', function (done) {
		const tmpDir: string = path.join(os.tmpdir(), 'getLatestCacheVersionTest2');
		fs.mkdirSync(tmpDir);
		fileArtifacts.push(tmpDir);
		const v7Path: string = path.join(__dirname, '..', '..', '..', 'src', 'test', 'files', 'attack7.json');
		const oldPath: string = path.join(tmpDir, 'enterprise-attack.7.2.json');
		fs.copyFileSync(v7Path, oldPath);
		fileArtifacts.push(oldPath);
		const v8Path: string = path.join(__dirname, '..', '..', '..', 'src', 'test', 'files', 'attack8.json');
		const expectedPath: string = path.join(tmpDir, `enterprise-attack.8.0.json`);
		fs.copyFileSync(v8Path, expectedPath);
		fileArtifacts.push(expectedPath);
		helpers.getLatestCacheVersion(tmpDir).then((result: string | undefined) => {
			assert.strictEqual(result, expectedPath);
			done();
		});
	});
	it('getLatestCacheVersion: should return undefined if there are no files in the cache directory', function (done) {
		const tmpDir: string = path.join(os.tmpdir(), 'getLatestCacheVersionTest3');
		fs.mkdirSync(tmpDir);
		fileArtifacts.push(tmpDir);
		helpers.getLatestCacheVersion(tmpDir).then((result: string | undefined) => {
			assert.strictEqual(result, undefined);
			done();
		});
	});
	it('getLatestCacheVersion: should throw an exception if the cache directory does not exist', function (done) {
		const tmpDir: string = path.join(os.tmpdir(), 'ThisDoesNotExist');
		helpers.getLatestCacheVersion(tmpDir).catch(() => { done(); });
	});
	it('getModifiedTime: should return the modified time of an ATT&CK mapping', function (done) {
		const filePath: string = path.join(__dirname, '..', '..', '..', 'src', 'test', 'files', 'attack7.json');
		const expectedModifiedTime: string = '2020-07-02T14:18:03.651Z';
		const mapString: string = fs.readFileSync(filePath).toString();
		let mapping: AttackMap = JSON.parse(mapString) as AttackMap;
		assert.strictEqual(helpers.getModifiedTime(mapping), expectedModifiedTime);
		done();
	});
	it('getModifiedTime: should return undefined if no modified time could be parsed', function (done) {
		assert.strictEqual(helpers.getModifiedTime({} as AttackMap), undefined);
		done();
	});
	it('getVersions: should return all tags matching \'ATT&CK-v\'', function (done) {
		const prefix = 'ATT&CK-v';
		helpers.getVersions(prefix).then((tags: Array<string> | undefined) => {
			assert.ok(tags !== undefined);
			tags.every((refTag: string) => { assert.ok(refTag.match('[0-9]+\.[0-9]+')); });
			done();
		});
	});
	it('getVersions: should return one tag for a very specific prefix', function (done) {
		const prefix = 'subtechniques-beta';
		helpers.getVersions(prefix).then((tags: Array<string> | undefined) => {
			assert.ok(tags !== undefined);
			assert.strictEqual(tags.length, 1);
			assert.strictEqual(tags[0], prefix);
			done();
		});
	});
	it('getVersions: should return all tags for an undefined prefix', function (done) {
		helpers.getVersions('').then((tags: Array<string> | undefined) => {
			assert.ok(tags !== undefined);
			// lazy way of checking this and not having to worry about every new tag added afterwards
			// if there's 20+ tags we're most likely catching all of them
			assert.ok(tags.length >= 22);
			done();
		});
	});
	it('isAttackMapNewer: should return true if prospective is newer than familiar', function (done) {
		const expected: boolean = true;
		const prospectivePath: string = path.join(__dirname, '..', '..', '..', 'src', 'test', 'files', 'attack8.json');
		const prospective: AttackMap = JSON.parse(fs.readFileSync(prospectivePath).toString()) as AttackMap;
		const familiarPath: string = path.join(__dirname, '..', '..', '..', 'src', 'test', 'files', 'attack7.json');
		const familiar: AttackMap = JSON.parse(fs.readFileSync(familiarPath).toString()) as AttackMap;
		assert.strictEqual(helpers.isAttackMapNewer(prospective, familiar), expected);
		done();
	});
	it('isAttackMapNewer: should return false if prospective is older than familiar', function (done) {
		const expected: boolean = false;
		const prospectivePath: string = path.join(__dirname, '..', '..', '..', 'src', 'test', 'files', 'attack7.json');
		const prospective: AttackMap = JSON.parse(fs.readFileSync(prospectivePath).toString()) as AttackMap;
		const familiarPath: string = path.join(__dirname, '..', '..', '..', 'src', 'test', 'files', 'attack8.json');
		const familiar: AttackMap = JSON.parse(fs.readFileSync(familiarPath).toString()) as AttackMap;
		assert.strictEqual(helpers.isAttackMapNewer(prospective, familiar), expected);
		done();
	});
	it('isAttackMapNewer: should return false if prospective is the same as familiar', function (done) {
		const expected: boolean = false;
		const prospectivePath: string = path.join(__dirname, '..', '..', '..', 'src', 'test', 'files', 'attack8.json');
		const prospective: AttackMap = JSON.parse(fs.readFileSync(prospectivePath).toString()) as AttackMap;
		const familiarPath: string = path.join(__dirname, '..', '..', '..', 'src', 'test', 'files', 'attack8.json');
		const familiar: AttackMap = JSON.parse(fs.readFileSync(familiarPath).toString()) as AttackMap;
		assert.strictEqual(helpers.isAttackMapNewer(prospective, familiar), expected);
		done();
	});
	it('tacticRegex: should match tactic ID', function (done) {
		const tid: string = 'TA0001';
		assert.ok(helpers.tacticRegex.test(tid));
		done();
	});
	it('tacticRegex: should not match tactic name', function (done) {
		const tactic: string = 'Persistence';
		assert.ok(!helpers.tacticRegex.test(tactic));
		done();
	});
	it('techniqueRegex: should match technique ID', function (done) {
		const tid: string = 'T1059';
		assert.ok(helpers.techniqueRegex.test(tid));
		done();
	});
	it('techniqueRegex: should match subtechnique ID', function (done) {
		const tid: string = 'T1059.001';
		assert.ok(helpers.techniqueRegex.test(tid));
		done();
	});
	it('techniqueRegex: should not match technique name', function (done) {
		const techniqueName: string = 'PowerShell';
		assert.ok(!helpers.techniqueRegex.test(techniqueName));
		done();
	});
});

describe('Command: Search', function () {
	const searchCommand: string = 'vscode-attack.search';
	let ext: vscode.Extension<any> | undefined;
	let exports: ATTACKExtensionAPI;

	before(async function () {
		ext = vscode.extensions.getExtension(extensionID);
		await ext?.activate();
		exports = ext?.exports;
	});
	beforeEach(ignoreConsoleLogs);
	afterEach(resetState);
	it('should exist', function (done) {
		vscode.commands.getCommands(true).then((commands: string[]) => {
			assert.ok(commands.includes(searchCommand), `No '${searchCommand}' exists.`);
			done();
		});
	});
	it('should open one webpanel for exact TIDs', function (done) {
		const tid: string = 'T1059.001';
		const expectedTitle: string = `${tid}: PowerShell`;
		// vscode.commands.executeCommand(searchCommand, techniques, tid).then((panels: Array<vscode.WebviewPanel>) => {
		search.search(exports.getAllTechniques(), tid).then((panels: Array<vscode.WebviewPanel>) => {
			panels.forEach((panel: vscode.WebviewPanel) => { disposables.push(panel); });
			assert.strictEqual(panels.length, 1);
			assert.strictEqual(panels[0].title, expectedTitle);
			done();
		});
	});
	it('should open one webpanel for revoked TIDs', function (done) {
		const tid: string = 'T1086';
		const expectedTitle: string = `${tid}: PowerShell`;
		const expectedText: string = `<h3>PowerShell (REVOKED)</h3>`;
		search.search(exports.getAllTechniques(), tid).then((panels: Array<vscode.WebviewPanel>) => {
			panels.forEach((panel: vscode.WebviewPanel) => { disposables.push(panel); });
			assert.strictEqual(panels.length, 1);
			assert.strictEqual(panels[0].title, expectedTitle);
			assert.ok(panels[0].webview.html.includes(expectedText));
			done();
		});
	});
	it('should open all webpanels containing a technique name', function (done) {
		const name: string = 'PowerShell';
		// Should return both 'PowerShell' and 'PowerShell Profile'
		const expectedTitles: Array<string> = ['T1059.001: PowerShell', 'T1546.013: PowerShell Profile'];
		// vscode.commands.executeCommand(searchCommand, techniques, tid).then((panels: Array<vscode.WebviewPanel>) => {
		search.search(exports.getAllTechniques(), name).then((panels: Array<vscode.WebviewPanel>) => {
			panels.forEach((panel: vscode.WebviewPanel) => { disposables.push(panel); });
			assert.strictEqual(panels.length, 2);
			let titles: Array<string> = panels.map<string>((panel: vscode.WebviewPanel) => { return panel.title; });
			assert.deepStrictEqual(titles, expectedTitles);
			done();
		});
	});
	it('should open all webpanels for lengthy terms in technique descriptions', function (done) {
		// this term is not a technique ID or in any technique name
		// so the only way it would return an item is if the descriptions are searched
		const term: string = 'certutil';
		const expectedTitle: string = 'T1140: Deobfuscate/Decode Files or Information';
		// vscode.commands.executeCommand(searchCommand, techniques, tid).then((panels: Array<vscode.WebviewPanel>) => {
		search.search(exports.getAllTechniques(), term).then((panels: Array<vscode.WebviewPanel>) => {
			panels.forEach((panel: vscode.WebviewPanel) => { disposables.push(panel); });
			assert.strictEqual(panels.length, 1);
			assert.strictEqual(panels[0].title, expectedTitle);
			done();
		});
	});
	it('should not search for short terms in technique descriptions', function (done) {
		const term: string = 'the';
		// vscode.commands.executeCommand(searchCommand, techniques, tid).then((panels: Array<vscode.WebviewPanel>) => {
		search.search(exports.getAllTechniques(), term).then((panels: Array<vscode.WebviewPanel>) => {
			panels.forEach((panel: vscode.WebviewPanel) => { disposables.push(panel); });
			assert.strictEqual(panels.length, 0);
			done();
		});
	});
});

describe('Completion Providers', function () {
	this.timeout(15000);
	const testPath: string = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'files', 'test.md');
	const testUri: vscode.Uri = vscode.Uri.file(testPath);
	let ext: vscode.Extension<any> | undefined;
	let exports: ATTACKExtensionAPI;
	let modifiedConfig: vscode.WorkspaceConfiguration;

	before(async function () {
		ignoreConsoleLogs();
		ext = vscode.extensions.getExtension(extensionID);
		await ext?.activate();
		exports = ext?.exports;
		modifiedConfig = vscode.workspace.getConfiguration(configSection);
		await modifiedConfig.update('groups', true, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('mitigations', true, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('software', true, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('tactics', true, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('techniques', true, vscode.ConfigurationTarget.Global);
	});
	after(async function () {
		await modifiedConfig.update('groups', false, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('mitigations', false, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('software', false, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('tactics', true, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('techniques', true, vscode.ConfigurationTarget.Global);
	});
	beforeEach(ignoreConsoleLogs);
	afterEach(resetState);
	it('should provide one completion item for exact TIDs', function (done) {
		const expectedTID: string = 'T1059';
		const position: vscode.Position = new vscode.Position(0, expectedTID.length);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			// most completion items don't get completely resolved (documentation, whitespace, etc.) until selected
			// ... so only validate the label for now
			assert.ok(results instanceof vscode.CompletionList);
			assert.strictEqual(results.items.length, 1);
			assert.ok(results.items[0] instanceof vscode.CompletionItem);
			assert.strictEqual(results.items[0].label, expectedTID);
			assert.strictEqual(results.items[0].kind, vscode.CompletionItemKind.Value);
			done();
		});
	});
	it('should provide one completion item for exact sub-TIDs', function (done) {
		const expectedTID: string = 'T1059.001';
		const position: vscode.Position = new vscode.Position(1, expectedTID.length);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			// most completion items don't get completely resolved (documentation, whitespace, etc.) until selected
			// ... so only validate the label for now
			assert.ok(results instanceof vscode.CompletionList);
			assert.strictEqual(results.items.length, 1);
			assert.ok(results.items[0] instanceof vscode.CompletionItem);
			assert.strictEqual(results.items[0].label, expectedTID);
			assert.strictEqual(results.items[0].kind, vscode.CompletionItemKind.Value);
			done();
		});
	});
	it('should provide all completion items containing a technique name', function (done) {
		const term: string = 'PowerShell';
		const expectedNames: Array<string> = ['PowerShell', 'PowerShell Profile'];
		const position: vscode.Position = new vscode.Position(2, term.length);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			// most completion items don't get completely resolved (documentation, whitespace, etc.) until selected
			// ... so only validate the label for now
			assert.ok(results instanceof vscode.CompletionList);
			let techniqueItems: Array<vscode.CompletionItem> = results.items.filter((item) => {
				return item instanceof vscode.CompletionItem && helpers.techniqueRegex.test(`${item.detail}`);
			});
			assert.strictEqual(techniqueItems.length, 2);
			techniqueItems.forEach((item: vscode.CompletionItem) => {
				assert.ok(item instanceof vscode.CompletionItem);
				assert(expectedNames.includes(item.label));
				assert.strictEqual(item.kind, vscode.CompletionItemKind.Value);
			});
			done();
		});
	});
	it('should provide a completion item for lengthy terms in technique descriptions', function (done) {
		// this term is not a technique ID or in any technique name
		// so the only way it would return an item is if the descriptions are searched
		const term: string = 'certutil';
		const expectedLabel: string = `${term} (technique description)`;
		const expectedTID: string = 'T1140';
		const position: vscode.Position = new vscode.Position(3, term.length);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			// items from description searches should have all fields filled out
			assert.ok(results instanceof vscode.CompletionList);
			// filter out results from other providers
			let techniqueItems: Array<vscode.CompletionItem> = results.items.filter((item) => {
				return item instanceof vscode.CompletionItem && item.label.includes('technique description');
			});
			assert.strictEqual(techniqueItems.length, 1);
			assert.ok(techniqueItems[0] instanceof vscode.CompletionItem);
			assert.strictEqual(techniqueItems[0].label, expectedLabel);
			assert.strictEqual(techniqueItems[0].detail, expectedTID);
			assert.strictEqual(techniqueItems[0].kind, vscode.CompletionItemKind.Value);
			done();
		});
	});
	it('should not provide completion items for lengthy terms commonly found in technique descriptions', function (done) {
		// this term is not a technique ID or in any technique name, and it is long enough to trip
		// the 'lengthy term' heuristic, but it is found in many technique descriptions, so
		// it could return a lot of items when the user doesn't want them
		const term: string = 'false';
		const position: vscode.Position = new vscode.Position(15, term.length);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof vscode.CompletionList);
			// filter out results from other providers
			let techniqueItems: Array<vscode.CompletionItem> = results.items.filter((item) => {
				return item instanceof vscode.CompletionItem && item.label.includes('technique description');
			});
			assert.strictEqual(techniqueItems.length, 0);
			done();
		});
	});
	it('should provide all completion items for short terms and let VSCode filter them', function (done) {
		const term: string = 'the';
		const position: vscode.Position = new vscode.Position(4, term.length);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof vscode.CompletionList);
			// completion provider only applies to non-revoked techniques
			let techniques: Array<Technique> = exports.getCurrentTechniques();
			assert.strictEqual(results.items.length, techniques.length);
			done();
		});
	});
	it('should not search descriptions if the user is searching for a revoked TID that is not available', function (done) {
		// line 5: T1086
		const position: vscode.Position = new vscode.Position(5, 4);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof vscode.CompletionList);
			// if none of the results are of the CompletionItemKind that we use, then VSCode auto-filled
			// the results based on other terms in the document, and our provider did not search descriptions
			assert.ok(!results.items.some((item: vscode.CompletionItem) => { return item.kind === vscode.CompletionItemKind.Value; }));
			done();
		});
	});
	it('should not provide techniques marked as revoked', function (done) {
		// line 5: T1086
		const position: vscode.Position = new vscode.Position(5, 4);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof vscode.CompletionList);
			assert.ok(!results.items.some((item: vscode.CompletionItem) => { return item.kind === vscode.CompletionItemKind.Value; }));
			done();
		});
	});
	it('should add a Deprecated tag for techniques marked as x_mitre_deprecated', function (done) {
		const expectedTID: string = 'T1064';
		const position: vscode.Position = new vscode.Position(8, expectedTID.length);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof vscode.CompletionList);
			assert.strictEqual(results.items.length, 1);
			assert.ok(results.items[0] instanceof vscode.CompletionItem);
			assert.strictEqual(results.items[0].label, expectedTID);
			assert.strictEqual(results.items[0].kind, vscode.CompletionItemKind.Value);
			assert.deepStrictEqual(results.items[0].tags, [vscode.CompletionItemTag.Deprecated]);
			done();
		});
	});
	it('should provide one completion item for exact tactic IDs', function (done) {
		const expectedTactic: string = 'TA0002';
		const position: vscode.Position = new vscode.Position(6, expectedTactic.length);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof vscode.CompletionList);
			assert.strictEqual(results.items.length, 1);
			assert.ok(results.items[0] instanceof vscode.CompletionItem);
			assert.strictEqual(results.items[0].label, expectedTactic);
			assert.strictEqual(results.items[0].detail, expectedTactic);
			assert.strictEqual(results.items[0].kind, vscode.CompletionItemKind.Value);
			done();
		});
	});
	it('should provide all completion items containing a tactic name', function (done) {
		const expectedTactic: string = 'TA0005';
		const expectedText: string = 'Defense Evasi';
		const position: vscode.Position = new vscode.Position(7, expectedText.length);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof vscode.CompletionList);
			// some other providers (probably technique) may return items by searching descriptions
			// ... let's filter these out by just finding the ones from this provider
			let tacticItems: Array<vscode.CompletionItem> = results.items.filter((item) => {
				return item instanceof vscode.CompletionItem && helpers.tacticRegex.test(`${item.detail}`);
			});
			assert.strictEqual(tacticItems.length, 1);
			assert.ok(tacticItems[0] instanceof vscode.CompletionItem);
			assert.strictEqual(tacticItems[0].detail, expectedTactic);
			assert.strictEqual(tacticItems[0].kind, vscode.CompletionItemKind.Value);
			done();
		});
	});
	it('should provide one competion item for exact group IDs', function (done) {
		const expectedGID: string = 'G0007';
		const position: vscode.Position = new vscode.Position(9, expectedGID.length);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof vscode.CompletionList);
			assert.strictEqual(results.items.length, 1);
			assert.ok(results.items[0] instanceof vscode.CompletionItem);
			assert.strictEqual(results.items[0].label, expectedGID);
			assert.strictEqual(results.items[0].kind, vscode.CompletionItemKind.Value);
			done();
		});
	});
	it('should provide all completion items containing a group name', function (done) {
		const expectedName: string = 'APT28';
		const position: vscode.Position = new vscode.Position(10, expectedName.length);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof vscode.CompletionList);
			let groupResults: Array<vscode.CompletionItem> = results.items.filter((item: vscode.CompletionItem) => {
				return item instanceof vscode.CompletionItem && helpers.groupRegex.test(`${item.detail}`);
			});
			assert.strictEqual(groupResults.length, 1);
			assert.ok(groupResults[0] instanceof vscode.CompletionItem);
			assert.strictEqual(groupResults[0].label, expectedName);
			assert.strictEqual(groupResults[0].kind, vscode.CompletionItemKind.Value);
			done();
		});
	});
	it('should provide one competion item for exact software IDs', function (done) {
		const expectedSID: string = 'S0045';
		const position: vscode.Position = new vscode.Position(11, expectedSID.length);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof vscode.CompletionList);
			assert.strictEqual(results.items.length, 1);
			assert.ok(results.items[0] instanceof vscode.CompletionItem);
			assert.strictEqual(results.items[0].label, expectedSID);
			assert.strictEqual(results.items[0].kind, vscode.CompletionItemKind.Value);
			done();
		});
	});
	it('should provide all completion items containing a software name', function (done) {
		const expectedName: string = 'ADVSTORESHELL';
		const position: vscode.Position = new vscode.Position(12, expectedName.length);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof vscode.CompletionList);
			let softwareResults: Array<vscode.CompletionItem> = results.items.filter((item: vscode.CompletionItem) => {
				return item instanceof vscode.CompletionItem && helpers.softwareRegex.test(`${item.detail}`);
			});
			assert.strictEqual(softwareResults.length, 1);
			assert.ok(softwareResults[0] instanceof vscode.CompletionItem);
			assert.strictEqual(softwareResults[0].label, expectedName);
			assert.strictEqual(softwareResults[0].kind, vscode.CompletionItemKind.Value);
			done();
		});
	});
	it('should provide one competion item for exact mitigation IDs', function (done) {
		const expectedMID: string = 'M1047';
		const position: vscode.Position = new vscode.Position(13, expectedMID.length);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof vscode.CompletionList);
			assert.strictEqual(results.items.length, 1);
			assert.ok(results.items[0] instanceof vscode.CompletionItem);
			assert.strictEqual(results.items[0].label, expectedMID);
			assert.strictEqual(results.items[0].kind, vscode.CompletionItemKind.Value);
			done();
		});
	});
	it('should provide all completion items containing a mitigation name', function (done) {
		const expectedName: string = 'Audit';
		const position: vscode.Position = new vscode.Position(14, expectedName.length);
		vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof vscode.CompletionList);
			let mitigationResults: Array<vscode.CompletionItem> = results.items.filter((item: vscode.CompletionItem) => {
				return item instanceof vscode.CompletionItem && helpers.mitigationRegex.test(`${item.detail}`);
			});
			assert.strictEqual(mitigationResults.length, 1);
			assert.ok(mitigationResults[0] instanceof vscode.CompletionItem);
			assert.strictEqual(mitigationResults[0].label, expectedName);
			assert.strictEqual(mitigationResults[0].kind, vscode.CompletionItemKind.Value);
			done();
		});
	});
});

describe('Hover Providers', function () {
	this.timeout(15000);
	const testPath: string = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'files', 'test.md');
	const testUri: vscode.Uri = vscode.Uri.file(testPath);
	let modifiedConfig: vscode.WorkspaceConfiguration;

	before(async function () {
		const ext: vscode.Extension<any> | undefined = vscode.extensions.getExtension(extensionID);
		await ext?.activate();
		// enable all the providers
		modifiedConfig = vscode.workspace.getConfiguration(configSection);
		await modifiedConfig.update('groups', true, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('mitigations', true, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('software', true, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('tactics', true, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('techniques', true, vscode.ConfigurationTarget.Global);
	});
	after(async function () {
		await modifiedConfig.update('groups', false, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('mitigations', false, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('software', false, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('tactics', true, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('techniques', true, vscode.ConfigurationTarget.Global);
	});
	beforeEach(ignoreConsoleLogs);
	afterEach(resetState);
	it('should provide a hover for TIDs', function (done) {
		const expectedTID: string = 'T1059';
		const expectedLink: string = `[Source Link](https://attack.mitre.org/techniques/${expectedTID})`;
		const position: vscode.Position = new vscode.Position(0, expectedTID.length);
		const expectedRange: vscode.Range = new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, position.character));
		vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
			// not sure why this is an Array - might have to do with ProviderResult
			assert.ok(results instanceof Array);
			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof vscode.Hover);
			assert.deepStrictEqual(results[0].range, expectedRange);
			let contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
			assert.ok(contents.value.includes(expectedLink));
			done();
		});
	});
	it('should provide a hover for revoked TIDs', function (done) {
		const expectedTID: string = 'T1086';
		const expectedTitle: string = 'PowerShell (REVOKED)';
		const position: vscode.Position = new vscode.Position(5, expectedTID.length);
		const expectedRange: vscode.Range = new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, position.character));
		vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof Array);
			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof vscode.Hover);
			assert.deepStrictEqual(results[0].range, expectedRange);
			let contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
			assert.ok(contents.value.includes(expectedTitle));
			done();
		});
	});
	it('should not provide a hover to terms that do not match TIDs', function (done) {
		const term: string = 'the';
		const position: vscode.Position = new vscode.Position(4, term.length);
		vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof Array);
			assert.strictEqual(results.length, 0);
			done();
		});
	});
	it('should provide a hover for tactic IDs', function (done) {
		const expectedTactic: string = 'TA0002';
		const expectedText: string = 'Execution';
		const position: vscode.Position = new vscode.Position(6, expectedTactic.length);
		const expectedRange: vscode.Range = new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, position.character));
		vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof Array);
			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof vscode.Hover);
			assert.deepStrictEqual(results[0].range, expectedRange);
			let contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
			assert.ok(contents.value.includes(expectedText));
			done();
		});
	});
	it('should not provide a hover to terms that do not match tactic IDs', function (done) {
		const term: string = 'the';
		const position: vscode.Position = new vscode.Position(4, term.length);
		vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof Array);
			assert.strictEqual(results.length, 0);
			done();
		});
	});
	it('should provide a hover for group IDs', function (done) {
		const expectedGID: string = 'G0007';
		const expectedLink: string = `[Source Link](https://attack.mitre.org/groups/${expectedGID})`;
		const position: vscode.Position = new vscode.Position(9, expectedGID.length);
		const expectedRange: vscode.Range = new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, position.character));
		vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof Array);
			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof vscode.Hover);
			assert.deepStrictEqual(results[0].range, expectedRange);
			let contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
			assert.ok(contents.value.includes(expectedLink));
			done();
		});
	});
	it('should provide a hover for software IDs', function (done) {
		const expectedSID: string = 'S0045';
		const expectedLink: string = `[Source Link](https://attack.mitre.org/software/${expectedSID})`;
		const position: vscode.Position = new vscode.Position(11, expectedSID.length);
		const expectedRange: vscode.Range = new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, position.character));
		vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof Array);
			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof vscode.Hover);
			assert.deepStrictEqual(results[0].range, expectedRange);
			let contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
			assert.ok(contents.value.includes(expectedLink));
			done();
		});
	});
	it('should provide a hover for mitigation IDs', function (done) {
		const expectedMID: string = 'M1047';
		const expectedLink: string = `[Source Link](https://attack.mitre.org/mitigations/${expectedMID})`;
		const position: vscode.Position = new vscode.Position(13, expectedMID.length);
		const expectedRange: vscode.Range = new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, position.character));
		vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
			assert.ok(results instanceof Array);
			assert.strictEqual(results.length, 1);
			assert.ok(results[0] instanceof vscode.Hover);
			assert.deepStrictEqual(results[0].range, expectedRange);
			let contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
			assert.ok(contents.value.includes(expectedLink));
			done();
		});
	});
});

describe('Settings', function () {
	// bumping timeout on this due to config updates in afterEach()
	// ... potentially taking a long time
	this.timeout(15000);

	let ext: vscode.Extension<any> | undefined;
	let modifiedConfig: vscode.WorkspaceConfiguration;
	const testPath: string = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'files', 'test.md');
	const testUri: vscode.Uri = vscode.Uri.file(testPath);

	// set a specific configuration value and return the updated configuration
	async function setTestConfig(id: string, value: any): Promise<vscode.WorkspaceConfiguration> {
		await modifiedConfig.update(id, value, vscode.ConfigurationTarget.Global);
		return vscode.workspace.getConfiguration(configSection);
	};

	beforeEach(() => {
		ignoreConsoleLogs();
		ext = vscode.extensions.getExtension(extensionID);
		modifiedConfig = vscode.workspace.getConfiguration(configSection);
	});
	afterEach(async () => {
		await modifiedConfig.update('debug', false, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('description', 'short', vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('completionFormat', 'id', vscode.ConfigurationTarget.Global);
		const defaultFiles: Array<Object> = [{ "scheme": "file", "language": "markdown" }, { "scheme": "file", "language": "yaml" }];
		await modifiedConfig.update('applicableFiles', defaultFiles, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('groups', false, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('mitigations', false, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('software', false, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('tactics', true, vscode.ConfigurationTarget.Global);
		await modifiedConfig.update('techniques', true, vscode.ConfigurationTarget.Global);
		resetState();
	});
	it.skip('debug: should enable debug logging when set', async function () {
		modifiedConfig = await setTestConfig('debug', true);
		ext?.activate().then(() => {
			consoleLogger(`extension activated`);
		});
	});
	it.skip('debug: should disable debug logging when unset', async function () {
		modifiedConfig = await setTestConfig('debug', false);
		ext?.activate().then(() => {
			consoleLogger(`extension activated`);
		});
	});
	it('description: should show a one-line description when set to short', function (done) {
		const tid: string = 'T1059.001';
		setTestConfig('description', 'short').then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const position: vscode.Position = new vscode.Position(0, tid.length);
			vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof Array);
				assert.strictEqual(results.length, 1);
				assert.ok(results[0] instanceof vscode.Hover);
				let contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
				// there should be only 4 lines for this - a header, the source link, the one-line description, and a blank line
				let lines: Array<string> = contents.value.split('\n');
				assert.strictEqual(lines.length, 4);
				assert(lines.reverse()[0].length > 0);
				done();
			});
		});
	});
	it('description: should show a complete description when set to long', function (done) {
		const tid: string = 'T1059.001';
		setTestConfig('description', 'long').then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const position: vscode.Position = new vscode.Position(0, tid.length);
			vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof Array);
				assert.strictEqual(results.length, 1);
				assert.ok(results[0] instanceof vscode.Hover);
				let contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
				let lines: Array<string> = contents.value.split('\n');
				// 8 lines: header, link, 3-line description + 2 blank lines, and a final blank line
				assert.strictEqual(lines.length, 8);
				done();
			});
		});
	});
	it('description: should show only a source link when set to link', function (done) {
		const tid: string = 'T1059.001';
		setTestConfig('description', 'link').then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const position: vscode.Position = new vscode.Position(0, tid.length);
			vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof Array);
				assert.strictEqual(results.length, 1);
				assert.ok(results[0] instanceof vscode.Hover);
				let contents: vscode.MarkdownString = results[0].contents[0] as vscode.MarkdownString;
				// header, link, and 2 blank lines
				let lines: Array<string> = contents.value.split('\n');
				assert.strictEqual(lines.length, 4);
				assert.strictEqual(lines.reverse()[0].length, 0);
				done();
			});
		});
	});
	it('completionFormat: should show only a TID when set to id', function (done) {
		const tid: string = 'T1059.001';
		const expectedDetail: string = tid;
		setTestConfig('completionFormat', 'id').then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const position: vscode.Position = new vscode.Position(1, tid.length);
			vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof vscode.CompletionList);
				assert.strictEqual(results.items.length, 1);
				assert.ok(results.items[0] instanceof vscode.CompletionItem);
				assert.strictEqual(results.items[0].detail, expectedDetail);
				done();
			});
		});
	});
	it('completionFormat: should show only a tactic ID when set to id', function (done) {
		const tid: string = 'TA0002';
		const expectedDetail: string = tid;
		setTestConfig('completionFormat', 'id').then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const position: vscode.Position = new vscode.Position(6, tid.length);
			vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof vscode.CompletionList);
				assert.strictEqual(results.items.length, 1);
				assert.ok(results.items[0] instanceof vscode.CompletionItem);
				assert.strictEqual(results.items[0].detail, expectedDetail);
				done();
			});
		});
	});
	it('completionFormat: should show only a technique name when set to name', function (done) {
		const tid: string = 'T1059.001';
		const expectedDetail: string = 'PowerShell';
		setTestConfig('completionFormat', 'name').then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const position: vscode.Position = new vscode.Position(1, tid.length);
			vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof vscode.CompletionList);
				assert.strictEqual(results.items.length, 1);
				assert.ok(results.items[0] instanceof vscode.CompletionItem);
				assert.strictEqual(results.items[0].detail, expectedDetail);
				done();
			});
		});
	});
	it('completionFormat: should show only a tactic name when set to name', function (done) {
		const tid: string = 'TA0002';
		const expectedDetail: string = 'Execution';
		setTestConfig('completionFormat', 'name').then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const position: vscode.Position = new vscode.Position(6, tid.length);
			vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof vscode.CompletionList);
				assert.strictEqual(results.items.length, 1);
				assert.ok(results.items[0] instanceof vscode.CompletionItem);
				assert.strictEqual(results.items[0].detail, expectedDetail);
				done();
			});
		});
	});
	it('completionFormat: should show a sub-technique name and parent technique name (where applicable) when set to fullname', function (done) {
		const tid: string = 'T1059.001';
		const expectedDetail: string = 'Command and Scripting Interpreter: PowerShell';
		setTestConfig('completionFormat', 'fullname').then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const position: vscode.Position = new vscode.Position(1, tid.length);
			vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof vscode.CompletionList);
				assert.strictEqual(results.items.length, 1);
				assert.ok(results.items[0] instanceof vscode.CompletionItem);
				assert.strictEqual(results.items[0].detail, expectedDetail);
				done();
			});
		});
	});
	it('completionFormat: should show only a tactic name when set to fullname', function (done) {
		const tid: string = 'TA0002';
		const expectedDetail: string = 'Execution';
		setTestConfig('completionFormat', 'fullname').then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const position: vscode.Position = new vscode.Position(6, tid.length);
			vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof vscode.CompletionList);
				assert.strictEqual(results.items.length, 1);
				assert.ok(results.items[0] instanceof vscode.CompletionItem);
				assert.strictEqual(results.items[0].detail, expectedDetail);
				done();
			});
		});
	});
	it('completionFormat: should show a TID and technique name when set to id-name', function (done) {
		const tid: string = 'T1059.001';
		const expectedDetail: string = `${tid} PowerShell`;
		setTestConfig('completionFormat', 'id-name').then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const position: vscode.Position = new vscode.Position(1, tid.length);
			vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof vscode.CompletionList);
				assert.strictEqual(results.items.length, 1);
				assert.ok(results.items[0] instanceof vscode.CompletionItem);
				assert.strictEqual(results.items[0].detail, expectedDetail);
				done();
			});
		});
	});
	it('completionFormat: should show a tactic ID and tactic name when set to id-name', function (done) {
		const tid: string = 'TA0002';
		const expectedDetail: string = `${tid} Execution`;
		setTestConfig('completionFormat', 'id-name').then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const position: vscode.Position = new vscode.Position(6, tid.length);
			vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof vscode.CompletionList);
				assert.strictEqual(results.items.length, 1);
				assert.ok(results.items[0] instanceof vscode.CompletionItem);
				assert.strictEqual(results.items[0].detail, expectedDetail);
				done();
			});
		});
	});
	it('completionFormat: should show a TID and full sub-technique name when set to id-fullname', function (done) {
		const tid: string = 'T1059.001';
		const expectedDetail: string = `${tid} Command and Scripting Interpreter: PowerShell`;
		setTestConfig('completionFormat', 'id-fullname').then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const position: vscode.Position = new vscode.Position(1, tid.length);
			vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof vscode.CompletionList);
				assert.strictEqual(results.items.length, 1);
				assert.ok(results.items[0] instanceof vscode.CompletionItem);
				assert.strictEqual(results.items[0].detail, expectedDetail);
				done();
			});
		});
	});
	it('completionFormat: should show a tactic ID and tactic name when set to id-fullname', function (done) {
		const tid: string = 'TA0002';
		const expectedDetail: string = `${tid} Execution`;
		setTestConfig('completionFormat', 'id-fullname').then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const position: vscode.Position = new vscode.Position(6, tid.length);
			vscode.commands.executeCommand('vscode.executeCompletionItemProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof vscode.CompletionList);
				assert.strictEqual(results.items.length, 1);
				assert.ok(results.items[0] instanceof vscode.CompletionItem);
				assert.strictEqual(results.items[0].detail, expectedDetail);
				done();
			});
		});
	});
	it('groups: should enable the Group providers when set to true', function (done) {
		setTestConfig('groups', true).then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const expectedGID: string = 'G0007';
			const position: vscode.Position = new vscode.Position(9, expectedGID.length);
			vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof Array);
				assert.strictEqual(results.length, 1);
				done();
			});
		});
	});
	it('groups: should disable the Group providers when set to false', function (done) {
		setTestConfig('groups', false).then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const expectedGID: string = 'G0007';
			const position: vscode.Position = new vscode.Position(9, expectedGID.length);
			vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof Array);
				assert.strictEqual(results.length, 0);
				done();
			});
		});
	});
	it('mitigations: should enable the Mitigation providers when set to true', function (done) {
		setTestConfig('mitigations', true).then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const expectedMID: string = 'M1047';
			const position: vscode.Position = new vscode.Position(13, expectedMID.length);
			vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof Array);
				assert.strictEqual(results.length, 1);
				done();
			});
		});
	});
	it('mitigations: should disable the Mitigation providers when set to false', function (done) {
		setTestConfig('mitigations', false).then((modifiedConfig: vscode.WorkspaceConfiguration) => {
			const expectedMID: string = 'M1047';
			const position: vscode.Position = new vscode.Position(13, expectedMID.length);
			vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof Array);
				assert.strictEqual(results.length, 0);
				done();
			});
		});
	});
	it('software: should enable the Software providers when set to true', function (done) {
		setTestConfig('software', true).then((modifiedConfig: vscode.WorkspaceConfiguration) => {
		const expectedSID: string = 'S0045';
		const position: vscode.Position = new vscode.Position(11, expectedSID.length);
			vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof Array);
				assert.strictEqual(results.length, 1);
				done();
			});
		});
	});
	it('software: should disable the Software providers when set to false', function (done) {
		setTestConfig('software', false).then((modifiedConfig: vscode.WorkspaceConfiguration) => {
		const expectedSID: string = 'S0045';
		const position: vscode.Position = new vscode.Position(11, expectedSID.length);
			vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof Array);
				assert.strictEqual(results.length, 0);
				done();
			});
		});
	});
	it('tactics: should enable the Tactic providers when set to true', function (done) {
		setTestConfig('tactics', true).then((modifiedConfig: vscode.WorkspaceConfiguration) => {
		const expectedSID: string = 'TA0002';
		const position: vscode.Position = new vscode.Position(6, expectedSID.length);
			vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof Array);
				assert.strictEqual(results.length, 1);
				done();
			});
		});
	});
	it('tactics: should disable the Tactic providers when set to false', function (done) {
		setTestConfig('tactics', false).then((modifiedConfig: vscode.WorkspaceConfiguration) => {
		const expectedSID: string = 'TA0002';
		const position: vscode.Position = new vscode.Position(6, expectedSID.length);
			vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof Array);
				assert.strictEqual(results.length, 0);
				done();
			});
		});
	});
	it('techniques: should enable the Technique providers when set to true', function (done) {
		setTestConfig('techniques', true).then((modifiedConfig: vscode.WorkspaceConfiguration) => {
		const expectedSID: string = 'T1059';
		const position: vscode.Position = new vscode.Position(0, expectedSID.length);
			vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof Array);
				assert.strictEqual(results.length, 1);
				done();
			});
		});
	});
	it('techniques: should disable the Technique providers when set to false', function (done) {
		setTestConfig('techniques', false).then((modifiedConfig: vscode.WorkspaceConfiguration) => {
		const expectedSID: string = 'T1059';
		const position: vscode.Position = new vscode.Position(0, expectedSID.length);
			vscode.commands.executeCommand('vscode.executeHoverProvider', testUri, position).then((results: any) => {
				assert.ok(results instanceof Array);
				assert.strictEqual(results.length, 0);
				done();
			});
		});
	});
	it.skip('applicableFiles: should automatically enable features when applicable file is specified', async function () {

	});
	it.skip('applicableFiles: should ignore entries that do not match document selector types', async function () {

	});
});

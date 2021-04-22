import * as fs from 'fs';
import { IncomingMessage } from 'http';
import * as https from 'https';
import * as path from 'path';
import * as vscode from 'vscode';

export const output: vscode.OutputChannel = vscode.window.createOutputChannel("MITRE ATT&CK");
// should match T1059.001
export const techniqueRegex = /T\d{4}([./]\d{3})?/;
// should match TA0001
export const tacticRegex = /TA\d{4}/;
// should match G0073
export const groupRegex = /G\d{4}/;
// should match S0363
export const softwareRegex = /S\d{4}/;
// should match M1036
export const mitigationRegex = /M\d{4}/;

// minimum completion item term length
// everything under this will only show the technique provider's results
export const minTermLength = 5;

/*
    Send a given message to the MITRE ATT&CK output channel with a timestamp
*/
export function log(message: string): void {
    output.appendLine(`[${new Date().toISOString()}] ${message}`);
}

/*
    Parse the last modified time of the given ATT&CK mapping
*/
export function getModifiedTime(mapping: AttackMap): string|undefined {
    const mapMatrices: Array<Matrix> = mapping.objects?.filter((obj: AttackObject) => {
        return obj.type === 'x-mitre-matrix';
    }).map<Matrix>((obj: AttackObject) => {
        return {
            created: obj.created,
            description: obj.description,
            modified: obj.modified,
            name: obj.name
        };
    });
    // there should only be one result in mapMatrices
    // ... but if not just return the last one by default
    return mapMatrices?.pop()?.modified;
}

/*
    Collect all GitHub tags matching the specified prefix
*/
export function getVersions(prefix = 'ATT&CK-v'): Promise<Array<string>> {
    // just a generic GitHub interface - not specific to ATT&CK
    // ... so let's just leave it out of the interfaces module, since it's only useful here
    interface Tag {
        ref: string;
        node_id: string;
        url: string;
        object: {
            sha: string;
            type: string;
            url: string;
        };
    }
    const url = 'https://api.github.com/repos/mitre/cti/git/refs/tags';
    let downloadedData = '';
    const options = {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    return new Promise((resolve, reject) => {
        let filteredTags: Array<string> = new Array<string>();
        https.get(url, options, (res: IncomingMessage) => {
            res.setEncoding('utf8');
            res.on('data', (chunk) => { downloadedData = downloadedData.concat(chunk); });
            res.on('error', (err: Error) => {
                // something bad happened! let the user know
                log(`Could not retrieve the version list! ${err.message}`);
                vscode.window.showErrorMessage(`ATT&CK: Could not retrieve the version list! ${err.message}`);
                reject(err);
            });
            res.on('end', () => {
                const tags: Array<Tag> = JSON.parse(downloadedData) as Array<Tag>;
                // TODO: make this suck less
                if (tags.length !== undefined && tags.length > 0) {
                    filteredTags = tags.filter((tag: Tag) => {
                        // if the user wants all tags, allow them to pass in an undefined prefix
                        return tag.ref.startsWith(`refs/tags/${prefix}`);
                    }).map<string>((t: Tag) => {
                        let label: string = t.ref.replace(`refs/tags/${prefix}`, '');
                        // special case where the user is looking for an exact tag
                        // the replace() method would overwrite the tag
                        if (label === '') { label = prefix; }
                        return label;
                    });
                    resolve(filteredTags);
                }
            });
        });
    });
}

/*
    Compare two ATT&CK maps to see which one is newer. Possible return values:
        true: prospective map is newer than familiar
        false: prospective map is older or the same as familiar
*/
export function isAttackMapNewer(prospective: AttackMap, familiar: AttackMap): boolean {
    // assume they are equivalent
    let result = false;
    const prospectiveTime: string|undefined = getModifiedTime(prospective);
    const familiarTime: string|undefined = getModifiedTime(familiar);
    // make sure something returned - if either is undefined assume they are the same
    if (prospectiveTime !== undefined && familiarTime !== undefined) {
        const prospectiveDate: Date = new Date(prospectiveTime);
        const familiarDate: Date = new Date(familiarTime);
        if (familiarDate < prospectiveDate) {
            result = true;
        }
    }
    return result;
}

/*
    Download a specific version of the MITRE ATT&CK map, save it to disk, and return its contents
*/
export function downloadAttackMap(storageDir: string, version: string): Promise<string> {
    let downloadedData = '';
    return new Promise<string>(function (resolve, reject) {
        getVersions().then((availableVersions: Array<string>) => {
            if (availableVersions.includes(version)) {
                // Example: v8.0 => enterprise-attack.8.0.json
                const storagePath: string = path.join(storageDir, `enterprise-attack.${version}.json`);
                const url = `https://raw.githubusercontent.com/mitre/cti/ATT%26CK-v${version}/enterprise-attack/enterprise-attack.json`;
                https.get(url, (res: IncomingMessage) => {
                    res.setEncoding('utf8');
                    res.on('data', (chunk) => { downloadedData = downloadedData.concat(chunk); });
                    res.on('error', (err: Error) => {
                        // something bad happened! let the user know
                        log(`Something went wrong while downloading ATT&CK mapping! ${err.message}`);
                        vscode.window.showErrorMessage(`ATT&CK: Something went wrong while downloading ATT&CK mapping v${version}! ${err.message}`);
                        reject(err);
                    });
                    res.on('end', () => {
                        // save the JSON file to the global storage path
                        fs.writeFileSync(storagePath, downloadedData.toString());
                        log(`Successfully cached the Enterprise ATT&CK v${version} data @ '${storagePath}'!`);
                        resolve(downloadedData);
                    });
                });
            }
            else {
                log(`Could not find version ${version} in the tags list: ${availableVersions}`);
                resolve(downloadedData);
            }
        });
    });
}

/*
    Download the latest version of the MIRE ATT&CK map - just a wrapper for some repeat code
*/
export async function downloadLatestAttackMap(storageDir: string): Promise<AttackMap|undefined> {
    let result: AttackMap|undefined = undefined;
    const availableVersions: Array<string> = await getVersions();
    // always look for the latest tagged version
    const version = `${availableVersions.sort()[availableVersions.length - 1]}`;
    const downloadedData: string = await downloadAttackMap(storageDir, version);
    // and once it's cached, parse + return it
    result = JSON.parse(downloadedData) as AttackMap;
    return result;
}

/*
    Get the newest version of the ATT&CK map in the specified cache directory
*/
export function getLatestCacheVersion(cacheDir: string): Promise<string|undefined> {
    const pattern = /enterprise-attack\..*\.json/;
    return new Promise<string|undefined>((resolve, reject) => {
        let latestVersionPath: string|undefined = undefined;
        fs.readdir(cacheDir, (err, files) => {
            if (err) {
                log(`Couldn't read files from ${cacheDir}! ${err.message}`);
                reject(err);
            }
            else {
                // sort files matching pattern in ascending order and get the last (most recent) version
                const latestVersionName: string|undefined = files.filter((file: string) => {
                    return file.match(pattern);
                }).sort().pop();
                if (latestVersionName !== undefined) {
                    latestVersionPath = path.join(cacheDir, latestVersionName);
                }
            }
            resolve(latestVersionPath);
        });
    });
}

/*
    Return all non-revoked techniques
*/
export function getCurrentTechniques(techniques: Array<Technique>): Array<Technique> {
    return techniques.filter((technique: Technique) => { return technique.revoked !== true; });
}

/*
    Return all revoked Techniques
*/
export function getRevokedTechniques(techniques: Array<Technique>): Array<Technique> {
    return techniques.filter((technique: Technique) => { return technique.revoked === true; });
}

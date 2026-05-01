import * as vscode from 'vscode';
import { log } from './helpers';

export const configSection = 'vscode-attack';
export let completionFormat = 'id';
export let debug = true;
export let attackVersion = 'latest';

export const MATRIX_CONFIGS: Record<string, MatrixConfig> = {
    'enterprise': {
        type: 'enterprise-attack',
        urlPath: 'enterprise-attack/enterprise-attack.json',
        killChainName: 'mitre-attack',
        displayName: 'Enterprise',
        minVersion: '1.0'
    },
    'mobile': {
        type: 'mobile-attack',
        urlPath: 'mobile-attack/mobile-attack.json',
        killChainName: 'mitre-mobile-attack',
        displayName: 'Mobile',
        minVersion: '5.0'
    },
    'ics': {
        type: 'ics-attack',
        urlPath: 'ics-attack/ics-attack.json',
        killChainName: 'mitre-ics-attack',
        displayName: 'ICS',
        minVersion: '8.0'
    }
};

export function getEnabledMatrices(): Array<MatrixConfig> {
    const enabled = vscode.workspace.getConfiguration(configSection).get<Array<string>>('matrices') || ['enterprise'];
    return enabled.map(key => MATRIX_CONFIGS[key]).filter(cfg => cfg !== undefined);
}

export function getMatrixBadge(matrix: MatrixType): string {
    switch (matrix) {
        case 'enterprise-attack': return '[Enterprise]';
        case 'mobile-attack': return '[Mobile]';
        case 'ics-attack': return '[ICS]';
        default: return '';
    }
}

export function setDebugLogState(): void {
    if (vscode.workspace.getConfiguration(configSection).get('debug')) {
        debug = true;
        log('Debug logging enabled');
    }
    else {
        debug = false;
        log('Debug logging disabled');
    }
}

export function setAttackVersion(): void {
    const configured: string|undefined = vscode.workspace.getConfiguration(configSection).get('attackVersion');
    if (configured !== undefined && configured !== '') {
        attackVersion = configured;
    }
    if (debug) { log(`ATT&CK version set to '${attackVersion}'`); }
}

export async function setCompletionItemFormat(): Promise<void> {
    let newCompletionFormat: string|undefined = vscode.workspace.getConfiguration(configSection).get('completionFormat');
    if (newCompletionFormat === undefined) {
        // TODO: find a way to pull these from settings instead of hardcoding them
        const options: string[] = [ "id", "name", "fullname", "id-name", "id-fullname" ];
        const selection: string|undefined = await vscode.window.showQuickPick(options);
        newCompletionFormat = selection;
    }
    if (newCompletionFormat !== undefined) {
        completionFormat = newCompletionFormat;
        if (debug) { log(`Set completion item format to '${completionFormat}'`); }
    }
}

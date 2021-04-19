import * as vscode from 'vscode';
import { completionFormat, configSection, debug } from './configuration';
import { minTermLength, log, mitigationRegex } from './helpers';

/*
    Build a completion item's insertion text based on settings
    TODO: Generalize this across object types
*/
function buildInsertionText(tool: Mitigation): string {
    let insertionText: string = tool.id;
    if (completionFormat === 'id-name' || completionFormat === 'id-fullname') {
        insertionText = `${tool.id} ${tool.name}`;
    }
    else if (completionFormat === 'name' || completionFormat === 'fullname') {
        insertionText = tool.name;
    }
    return insertionText;
}

/*
    Build a completion item out of a piece of mitigation (either tool or malware)
*/
function buildCompletionItem(label: string, mitigation: Mitigation): vscode.CompletionItem {
    const completionItem: vscode.CompletionItem = new vscode.CompletionItem(label, vscode.CompletionItemKind.Value);
    const insertionText: string = buildInsertionText(mitigation);
    completionItem.detail = insertionText;
    completionItem.insertText = insertionText;
    return completionItem;
}

/*
    Counterpart to buildTechniqueDescription ... but for mitigation
    TODO: Generalize this across object types
*/
function buildMitigationDescription(mitigation: Mitigation, descriptionType: string|undefined = undefined): vscode.MarkdownString {
    if (descriptionType === undefined) { descriptionType = vscode.workspace.getConfiguration(configSection).get('description'); }
    const mdBuilder: vscode.MarkdownString = new vscode.MarkdownString(undefined);
    // title
    mdBuilder.appendMarkdown(`### ${mitigation.name}\n`);
    // source link
    if (mitigation.url !== undefined) { mdBuilder.appendMarkdown(`[Source Link](${mitigation.url})\n\n`); }
    else { mdBuilder.appendMarkdown(`No source link available\n\n`); }
    // description
    if (descriptionType && descriptionType === 'long') { mdBuilder.appendMarkdown(mitigation.description.long); }
    else if (descriptionType && descriptionType === 'short') { mdBuilder.appendMarkdown(mitigation.description.short); }
    return mdBuilder;
}

export async function init(attackData: AttackMap): Promise<Array<Mitigation>> {
    return new Promise((resolve) => {
        let mitigations: Array<Mitigation> = new Array<Mitigation>();
        mitigations = attackData.objects.filter((item: AttackObject) => {
            return item.type === 'course-of-action';
        }).map<Mitigation>((item: AttackObject) => {
            const description: string = item.description !== undefined ? item.description : 'No description available.';
            const mitigation: Mitigation = {
                description: {
                    short: description.split("\n")[0],
                    long: description
                },
                id: '<unknown>',
                name: item.name,
                url: '<unknown>'
            };
            item.external_references?.forEach((reference: ExternalReference) => {
                if (reference.source_name === 'mitre-attack') {
                    mitigation.id = reference.external_id;
                    mitigation.url = reference.url;
                    return; // found what we were looking for - no need to iterate over the rest
                }
            });
            return mitigation;
        });
        // certain techniques have their own mitigation entry with an ID that matches their technique ID
        // ... filter these out, as they are not generally useful
        mitigations = mitigations.filter((mitigation: Mitigation) => { return mitigation.id.match(mitigationRegex); });
        if (debug) { log(`Parsed out ${mitigations.length} mitigations`); }
        resolve(mitigations);
    });
}

export class MitigationHoverProvider implements vscode.HoverProvider {
    public mitigations: Array<Mitigation> = new Array<Mitigation>();

    public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        try {
            return new Promise((resolve) => {
                token.onCancellationRequested(() => {
                    // if this process is cancelled, just return nothing
                    if (debug) { log('Mitigation hover provider cancelled!'); }
                    resolve(undefined);
                });
                let hover: vscode.Hover | undefined = undefined;
                let hoverRange: vscode.Range | undefined = undefined;
                hoverRange = document.getWordRangeAtPosition(position, mitigationRegex);
                if (hoverRange !== undefined) {
                    const hoverTerm: string = document.getText(hoverRange);
                    const currentMitigation: Mitigation | undefined = this.mitigations.find((g: Mitigation) => { return g.id === hoverTerm; });
                    if (currentMitigation !== undefined) {
                        hover = new vscode.Hover(buildMitigationDescription(currentMitigation), hoverRange);
                    }
                }
                resolve(hover);
            });
        } catch (error) {
            log(`MitigationHoverProvider error: ${error}`);
        }
    }
}

export class MitigationCompletionProvider implements vscode.CompletionItemProvider {
    public mitigations: Array<Mitigation> = new Array<Mitigation>();

    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        try {
            return new Promise((resolve) => {
                token.onCancellationRequested(() => {
                    // if this process is cancelled, just return nothing
                    if (debug) { log('Mitigation completion provider cancelled!'); }
                    resolve(undefined);
                });
                let completionItems: Array<vscode.CompletionItem> = new Array<vscode.CompletionItem>();
                let dbgMsg = '';
                const completionRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
                if (completionRange === undefined) {
                    if (debug) { log('MitigationCompletionProvider: No completion item range provided.'); }
                }
                else {
                    const completionTerm: string = document.getText(completionRange);
                    // only return everything if this is a "long" term
                    if (completionTerm.length >= minTermLength) {
                        if (debug) { log(`MitigationCompletionProvider: Completion term: ${completionTerm}`); }
                        // if the user is trying to complete something that matches an exact mitigation ID, just return that one item
                        const mitigation: Mitigation | undefined = this.mitigations.find((g: Mitigation) => { return g.id === completionTerm.toUpperCase(); });
                        if (mitigation !== undefined) {
                            if (debug) { log(`MitigationCompletionProvider: Found exact technique ID '${mitigation.id}'`); }
                            completionItems = [buildCompletionItem(mitigation.id, mitigation)];
                        }
                        else {
                            // if the user is trying to complete a piece of mitigation by name
                            const possibleMitigation: Array<Mitigation> | undefined = this.mitigations.filter((s: Mitigation) => {
                                return s.name.toLowerCase().includes(completionTerm.toLowerCase());
                            });
                            if (possibleMitigation !== undefined) {
                                completionItems = possibleMitigation.map<vscode.CompletionItem>((s: Mitigation) => {
                                    return buildCompletionItem(s.name, s);
                                });
                            }
                        }
                    }
                }
                resolve(completionItems);
            });
        } catch (error) {
            log(`MitigationCompletionProvider error: ${error}`);
        }
    }

    public resolveCompletionItem(item: vscode.CompletionItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem> {
        try {
            return new Promise((resolve) => {
                token.onCancellationRequested(() => {
                    // if this process is cancelled, just return nothing
                    if (debug) { log('Mitigation completion resolver cancelled!'); }
                    resolve(undefined);
                });
                if (debug) { log(`MitigationCompletionProvider: Resolving completion item for '${item.label}'`); }
                item.keepWhitespace = true;
                const mitigation: Mitigation | undefined = this.mitigations.find((g: Mitigation) => {
                    return (g.id === item.label) || (g.name === item.label);
                });
                if (mitigation !== undefined) {
                    item.documentation = buildMitigationDescription(mitigation);
                }
                resolve(item);
            });
        } catch (error) {
            log(`MitigationCompletionProvider error: ${error}`);
        }
    }
}

export function register(filters: vscode.DocumentSelector, mitigations: Array<Mitigation>): Array<vscode.Disposable> {
    log('Registering providers for mitigations');
    // hover provider
    const mitigationHovers: MitigationHoverProvider = new MitigationHoverProvider();
    const mitigationHoverDisposable: vscode.Disposable = vscode.languages.registerHoverProvider(filters, mitigationHovers);
    mitigationHovers.mitigations = mitigations;
    // completion provider
    const mitigationCompletions: MitigationCompletionProvider = new MitigationCompletionProvider();
    mitigationCompletions.mitigations = mitigations;
    const mitigationCompletionDisposable: vscode.Disposable = vscode.languages.registerCompletionItemProvider(filters, mitigationCompletions);
    return [mitigationHoverDisposable, mitigationCompletionDisposable];
}

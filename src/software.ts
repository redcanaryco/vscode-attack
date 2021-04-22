import * as vscode from 'vscode';
import { completionFormat, configSection, debug } from './configuration';
import { minTermLength, log, softwareRegex } from './helpers';

/*
    Build a completion item's insertion text based on settings
    TODO: Generalize this across object types
*/
function buildInsertionText(tool: Software): string {
    let insertionText: string = tool.id;
    if (completionFormat === 'id-name' || completionFormat === 'id-fullname') {
        insertionText = `${tool.id} ${tool.name}`;
    }
    else if (completionFormat === 'name' || completionFormat === 'fullname') {
        insertionText = tool.name;
    }
    else if (completionFormat === 'link') {
        insertionText = tool.url;
    }
    return insertionText;
}

/*
    Build a completion item out of a piece of software (either tool or malware)
*/
function buildCompletionItem(label: string, software: Software): vscode.CompletionItem {
    const completionItem: vscode.CompletionItem = new vscode.CompletionItem(label, vscode.CompletionItemKind.Value);
    const insertionText: string = buildInsertionText(software);
    completionItem.detail = insertionText;
    completionItem.insertText = insertionText;
    return completionItem;
}

/*
    Counterpart to buildTechniqueDescription ... but for software
    TODO: Generalize this across object types
*/
function buildSoftwareDescription(software: Software, descriptionType: string|undefined = undefined): vscode.MarkdownString {
    if (descriptionType === undefined) { descriptionType = vscode.workspace.getConfiguration(configSection).get('description'); }
    const mdBuilder: vscode.MarkdownString = new vscode.MarkdownString(undefined);
    // title
    mdBuilder.appendMarkdown(`### ${software.name}\n`);
    // source link
    if (software.url !== undefined) { mdBuilder.appendMarkdown(`[Source Link](${software.url})\n\n`); }
    else { mdBuilder.appendMarkdown(`No source link available\n\n`); }
    // aliases
    if (software.aliases?.length === 1) { mdBuilder.appendMarkdown(`**Alias**: ${software.aliases.pop()}\n\n`); }
    else if (software.aliases?.length > 1) { mdBuilder.appendMarkdown(`**Aliases**: ${software.aliases.join(', ')}\n\n`); }
    // description
    if (descriptionType && descriptionType === 'long') { mdBuilder.appendMarkdown(software.description.long); }
    else if (descriptionType && descriptionType === 'short') { mdBuilder.appendMarkdown(software.description.short); }
    return mdBuilder;
}

export async function init(attackData: AttackMap): Promise<Array<Software>> {
    return new Promise((resolve) => {
        let softwares: Array<Software> = new Array<Software>();
        softwares = attackData.objects.filter((item: AttackObject) => {
            return item.type === 'malware' || item.type === 'tool';
        }).map<Software>((item: AttackObject) => {
            const description: string = item.description !== undefined ? item.description : 'No description available.';
            const aliases: Array<string> = item.x_mitre_aliases !== undefined ? item.aliases : new Array<string>();
            const software: Software = {
                aliases: aliases,
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
                    software.id = reference.external_id;
                    software.url = reference.url;
                    return; // found what we were looking for - no need to iterate over the rest
                }
            });
            return software;
        });
        if (debug) { log(`Parsed out ${softwares.length} softwares`); }
        resolve(softwares);
    });
}

export class SoftwareHoverProvider implements vscode.HoverProvider {
    public software: Array<Software> = new Array<Software>();

    public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        try {
            return new Promise((resolve) => {
                token.onCancellationRequested(() => {
                    // if this process is cancelled, just return nothing
                    if (debug) { log('SoftwareHoverProvider: Task cancelled!'); }
                    resolve(undefined);
                });
                let hover: vscode.Hover | undefined = undefined;
                let hoverRange: vscode.Range | undefined = undefined;
                hoverRange = document.getWordRangeAtPosition(position, softwareRegex);
                if (hoverRange !== undefined) {
                    const hoverTerm: string = document.getText(hoverRange);
                    const currentSoftware: Software | undefined = this.software.find((g: Software) => { return g.id === hoverTerm; });
                    if (currentSoftware !== undefined) {
                        if (debug) { log(`SoftwareHoverProvider: Found exact Software ID '${currentSoftware.id}'`); }
                        hover = new vscode.Hover(buildSoftwareDescription(currentSoftware), hoverRange);
                    }
                }
                resolve(hover);
            });
        } catch (error) {
            log(`SoftwareHoverProvider error: ${error}`);
        }
    }
}

export class SoftwareCompletionProvider implements vscode.CompletionItemProvider {
    public software: Array<Software> = new Array<Software>();

    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        try {
            return new Promise((resolve) => {
                token.onCancellationRequested(() => {
                    // if this process is cancelled, just return nothing
                    if (debug) { log('SoftwareCompletionProvider: Task cancelled!'); }
                    resolve(undefined);
                });
                let completionItems: Array<vscode.CompletionItem> = new Array<vscode.CompletionItem>();
                let dbgMsg = '';
                const completionRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
                if (completionRange === undefined) {
                    if (debug) { log('SoftwareCompletionProvider: No completion item range provided.'); }
                }
                else {
                    const completionTerm: string = document.getText(completionRange);
                    // only return everything if this is a "long" term
                    if (completionTerm.length >= minTermLength) {
                        if (debug) { log(`SoftwareCompletionProvider: Completion term: ${completionTerm}`); }
                        // if the user is trying to complete something that matches an exact software ID, just return that one item
                        const software: Software | undefined = this.software.find((g: Software) => { return g.id === completionTerm.toUpperCase(); });
                        if (software !== undefined) {
                            if (debug) { log(`SoftwareCompletionProvider: Found exact Software ID '${software.id}'`); }
                            completionItems = [buildCompletionItem(software.id, software)];
                        }
                        else {
                            // if the user is trying to complete a piece of software by name
                            const possibleSoftware: Array<Software> | undefined = this.software.filter((s: Software) => {
                                return s.name.toLowerCase().includes(completionTerm.toLowerCase());
                            });
                            if (possibleSoftware !== undefined) {
                                completionItems = possibleSoftware.map<vscode.CompletionItem>((s: Software) => {
                                    return buildCompletionItem(s.name, s);
                                });
                            }
                        }
                    }
                }
                resolve(completionItems);
            });
        } catch (error) {
            log(`SoftwareCompletionProvider error: ${error}`);
        }
    }

    public resolveCompletionItem(item: vscode.CompletionItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem> {
        try {
            return new Promise((resolve) => {
                token.onCancellationRequested(() => {
                    // if this process is cancelled, just return nothing
                    if (debug) { log('SoftwareCompletionProvider: Resolution task cancelled!'); }
                    resolve(undefined);
                });
                if (debug) { log(`SoftwareCompletionProvider: Resolving completion item for '${item.label}'`); }
                item.keepWhitespace = true;
                const software: Software | undefined = this.software.find((g: Software) => {
                    return (g.id === item.label) || (g.name === item.label);
                });
                if (software !== undefined) {
                    item.documentation = buildSoftwareDescription(software);
                }
                resolve(item);
            });
        } catch (error) {
            log(`SoftwareCompletionProvider error: ${error}`);
        }
    }
}

export function register(filters: vscode.DocumentSelector, tools: Array<Software>): Array<vscode.Disposable> {
    log('Registering providers for Software');
    // hover provider
    const softwareHovers: SoftwareHoverProvider = new SoftwareHoverProvider();
    const softwareHoverDisposable: vscode.Disposable = vscode.languages.registerHoverProvider(filters, softwareHovers);
    softwareHovers.software = tools;
    // completion provider
    const softwareCompletions: SoftwareCompletionProvider = new SoftwareCompletionProvider();
    softwareCompletions.software = tools;
    const softwareCompletionDisposable: vscode.Disposable = vscode.languages.registerCompletionItemProvider(filters, softwareCompletions);
    return [softwareHoverDisposable, softwareCompletionDisposable];
}

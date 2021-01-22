import * as vscode from 'vscode';
import { completionFormat, configSection, debug } from './configuration';
import { minTermLength, output, groupRegex } from './helpers';

/*
    Build a completion item's insertion text based on settings
    TODO: Generalize this across object types
*/
function buildInsertionText(group: Group): string {
    let insertionText: string = group.id;
    if (completionFormat === 'id-name' || completionFormat === 'id-fullname') {
        insertionText = `${group.id} ${group.name}`;
    }
    else if (completionFormat === 'name' || completionFormat === 'fullname') {
        insertionText = group.name;
    }
    return insertionText;
}

/*
    Build a completion item out of a group
*/
function buildCompletionItem(label: string, group: Group): vscode.CompletionItem {
    const completionItem: vscode.CompletionItem = new vscode.CompletionItem(label, vscode.CompletionItemKind.Value);
    const insertionText: string = buildInsertionText(group);
    completionItem.detail = insertionText;
    completionItem.insertText = insertionText;
    return completionItem;
}

/*
    Counterpart to buildTechniqueDescription ... but for groups
    TODO: Generalize this across object types
*/
function buildGroupDescription(group: Group, descriptionType: string|undefined = undefined): vscode.MarkdownString {
    if (descriptionType === undefined) { descriptionType = vscode.workspace.getConfiguration(configSection).get('description'); }
    const mdBuilder: vscode.MarkdownString = new vscode.MarkdownString(undefined);
    // title
    mdBuilder.appendMarkdown(`### ${group.name}\n`);
    // source link
    if (group.url !== undefined) { mdBuilder.appendMarkdown(`[Source Link](${group.url})\n\n`); }
    else { mdBuilder.appendMarkdown(`No source link available\n\n`); }
    // aliases
    if (group.aliases?.length === 1) { mdBuilder.appendMarkdown(`**Alias**: ${group.aliases.pop()}\n\n`); }
    else if (group.aliases?.length > 1) { mdBuilder.appendMarkdown(`**Aliases**: ${group.aliases.join(', ')}\n\n`); }
    // description
    if (descriptionType && descriptionType === 'long') { mdBuilder.appendMarkdown(group.description.long); }
    else if (descriptionType && descriptionType === 'short') { mdBuilder.appendMarkdown(group.description.short); }
    return mdBuilder;
}

export async function init(attackData: AttackMap): Promise<Array<Group>> {
    return new Promise((resolve) => {
        let groups: Array<Group> = new Array<Group>();
        groups = attackData.objects.filter((item: AttackObject) => {
            return item.type === 'intrusion-set';
        }).map<Group>((item: AttackObject) => {
            const description: string = item.description !== undefined ? item.description : 'No description available.';
            const aliases: Array<string> = item.aliases !== undefined ? item.aliases : new Array<string>();
            const group: Group = {
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
                    group.id = reference.external_id;
                    group.url = reference.url;
                    return; // found what we were looking for - no need to iterate over the rest
                }
            });
            return group;
        });
        if (debug) { output.appendLine(`Parsed out ${groups.length} groups`); }
        resolve(groups);
    });
}

export class GroupHoverProvider implements vscode.HoverProvider {
    public groups: Array<Group> = new Array<Group>();

    public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        try {
            return new Promise((resolve) => {
                token.onCancellationRequested(() => {
                    // if this process is cancelled, just return nothing
                    resolve(undefined);
                });
                let hover: vscode.Hover | undefined = undefined;
                let hoverRange: vscode.Range | undefined = undefined;
                hoverRange = document.getWordRangeAtPosition(position, groupRegex);
                if (hoverRange !== undefined) {
                    const hoverTerm: string = document.getText(hoverRange);
                    if (debug) { output.appendLine(`provideHover: Hover term: ${hoverTerm}`); }
                    const currentGroup: Group | undefined = this.groups.find((g: Group) => { return g.id === hoverTerm; });
                    if (currentGroup !== undefined) {
                        hover = new vscode.Hover(buildGroupDescription(currentGroup), hoverRange);
                    }
                }
                resolve(hover);
            });
        } catch (error) {
            output.appendLine(`provideHover error: ${error}`);
        }
    }
}

export class GroupCompletionProvider implements vscode.CompletionItemProvider {
    public groups: Array<Group> = new Array<Group>();

    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        try {
            return new Promise((resolve) => {
                token.onCancellationRequested(() => {
                    // if this process is cancelled, just return nothing
                    resolve(undefined);
                });
                let completionItems: Array<vscode.CompletionItem> = new Array<vscode.CompletionItem>();
                let dbgMsg = '';
                const completionRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
                if (completionRange === undefined) {
                    dbgMsg = `GroupCompletionProvider: No completion item range provided.`;
                    console.log(dbgMsg);
                    if (debug) { output.appendLine(dbgMsg); }
                }
                else {
                    const completionTerm: string = document.getText(completionRange);
                    // only return everything if this is a "long" term
                    if (completionTerm.length >= minTermLength) {
                        dbgMsg = `GroupCompletionProvider: Completion term: ${completionTerm}`;
                        console.log(dbgMsg);
                        if (debug) { output.appendLine(dbgMsg); }
                        // if the user is trying to complete something that matches an exact group ID, just return that one item
                        const group: Group | undefined = this.groups.find((g: Group) => { return g.id === completionTerm.toUpperCase(); });
                        if (group !== undefined) {
                            dbgMsg = `GroupCompletionProvider: Found exact technique ID '${group.id}'`;
                            console.log(dbgMsg);
                            if (debug) { output.appendLine(dbgMsg); }
                            completionItems = [buildCompletionItem(group.id, group)];
                        }
                        else {
                            // if the user is trying to complete a group by name
                            const possibleGroups: Array<Group> | undefined = this.groups.filter((g: Group) => {
                                return g.name.toLowerCase().includes(completionTerm.toLowerCase());
                            });
                            if (possibleGroups !== undefined) {
                                completionItems = possibleGroups.map<vscode.CompletionItem>((g: Group) => {
                                    return buildCompletionItem(g.name, g);
                                });
                            }
                        }
                    }
                }
                resolve(completionItems);
            });
        } catch (error) {
            output.appendLine(`GroupCompletionProvider error: ${error}`);
        }
    }

    public resolveCompletionItem(item: vscode.CompletionItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem> {
        try {
            return new Promise((resolve) => {
                token.onCancellationRequested(() => {
                    // if this process is cancelled, just return nothing
                    resolve(undefined);
                });
                // console.log(`GroupCompletionProvider: Received completion item with label: ${item.label}`);
                item.keepWhitespace = true;
                const group: Group | undefined = this.groups.find((g: Group) => {
                    return (g.id === item.label) || (g.name === item.label);
                });
                if (group !== undefined) {
                    item.documentation = buildGroupDescription(group);
                }
                resolve(item);
            });
        } catch (error) {
            output.appendLine(`GroupCompletionProvider error: ${error}`);
        }
    }
}

export function register(filters: vscode.DocumentSelector, groups: Array<Group>): Array<vscode.Disposable> {
    // hover provider
    const groupHovers: GroupHoverProvider = new GroupHoverProvider();
    const groupHoverDisposable: vscode.Disposable = vscode.languages.registerHoverProvider(filters, groupHovers);
    groupHovers.groups = groups;
    // completion provider
    const groupCompletions: GroupCompletionProvider = new GroupCompletionProvider();
    groupCompletions.groups = groups;
    const groupCompletionDisposable: vscode.Disposable = vscode.languages.registerCompletionItemProvider(filters, groupCompletions);
    return [groupHoverDisposable, groupCompletionDisposable];
}
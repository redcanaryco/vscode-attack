import * as vscode from 'vscode';
import { completionFormat, configSection, debug } from './configuration';
import { minTermLength, log, tacticRegex } from './helpers';

/*
    Build a completion item's insertion text based on settings
*/
function buildInsertionText(tactic: Tactic): string {
    let insertionText: string = tactic.id;
    if (completionFormat === 'id-name' || completionFormat === 'id-fullname') {
        insertionText = `${tactic.id} ${tactic.name}`;
    }
    else if (completionFormat === 'name' || completionFormat === 'fullname') {
        insertionText = tactic.name;
    }
    else if (completionFormat === 'link') {
        insertionText = tactic.url;
    }
    return insertionText;
}

/*
    Build a completion item out of a tactic
*/
function buildCompletionItem(label: string, tactic: Tactic): vscode.CompletionItem {
    const completionItem: vscode.CompletionItem = new vscode.CompletionItem(label, vscode.CompletionItemKind.Value);
    const insertionText: string = buildInsertionText(tactic);
    completionItem.detail = insertionText;
    completionItem.insertText = insertionText;
    return completionItem;
}

/*
    Counterpart to buildTechniqueDescription ... but for tactics
*/
function buildTacticDescription(tactic: Tactic, descriptionType: string|undefined = undefined): vscode.MarkdownString {
    if (descriptionType === undefined) { descriptionType = vscode.workspace.getConfiguration(configSection).get('description'); }
    const mdBuilder: vscode.MarkdownString = new vscode.MarkdownString(undefined);
    // title
    mdBuilder.appendMarkdown(`### ${tactic.name}\n`);
    // source link
    if (tactic.url !== undefined) { mdBuilder.appendMarkdown(`[Source Link](${tactic.url})\n\n`); }
    else { mdBuilder.appendMarkdown(`No source link available\n\n`); }
    // description
    mdBuilder.appendMarkdown(tactic.description.long);
    return mdBuilder;
}

export async function init(attackData: AttackMap): Promise<Tactic[]> {
    return new Promise((resolve) => {
        let tactics: Array<Tactic> = new Array<Tactic>();
        tactics = attackData.objects.filter((item: AttackObject) => {
            return item.type === 'x-mitre-tactic';
        }).map<Tactic>((item: AttackObject) => {
            const description: string = item.description !== undefined ? item.description : 'No description available.';
            const tactic: Tactic = {
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
                    tactic.id = reference.external_id;
                    tactic.url = reference.url;
                    return; // found what we were looking for - no need to iterate over the rest
                }
            });
            return tactic;
        });
        if (debug) { log(`Parsed out ${tactics.length} tactics`); }
        resolve(tactics);
    });
}

export class TacticHoverProvider implements vscode.HoverProvider {
    public tactics: Array<Tactic> = new Array<Tactic>();

    public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        try {
            return new Promise((resolve) => {
                token.onCancellationRequested(() => {
                    // if this process is cancelled, just return nothing
                    if (debug) { log('TacticHoverProvider: Task cancelled!'); }
                    resolve(undefined);
                });
                let hover: vscode.Hover | undefined = undefined;
                // gotta match the following: T1000, T1000.001, T1000/001
                let hoverRange: vscode.Range | undefined = undefined;
                hoverRange = document.getWordRangeAtPosition(position, tacticRegex);
                if (hoverRange !== undefined) {
                    const hoverTerm: string = document.getText(hoverRange);
                    const currentTactic: Tactic | undefined = this.tactics.find((t: Tactic) => { return t.id === hoverTerm; });
                    if (currentTactic !== undefined) {
                        if (debug) { log(`TacticHoverProvider: Found exact Tactic ID '${currentTactic.id}'`); }
                        hover = new vscode.Hover(buildTacticDescription(currentTactic), hoverRange);
                    }
                }
                resolve(hover);
            });
        } catch (error) {
            log(`TacticHoverProvider error: ${error}`);
        }
    }
}

export class TacticCompletionProvider implements vscode.CompletionItemProvider {
    public tactics: Array<Tactic> = new Array<Tactic>();

    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        try {
            return new Promise((resolve) => {
                token.onCancellationRequested(() => {
                    // if this process is cancelled, just return nothing
                    if (debug) { log('TacticCompletionProvider: Task cancelled!'); }
                    resolve(undefined);
                });
                let completionItems: Array<vscode.CompletionItem> = new Array<vscode.CompletionItem>();
                let dbgMsg = '';
                const completionRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
                if (completionRange === undefined) {
                    if (debug) { log('TacticCompletionProvider: No completion item range provided.'); }
                }
                else {
                    const completionTerm: string = document.getText(completionRange);
                    // only return everything if this is a "long" term
                    if (completionTerm.length >= minTermLength) {
                        // if the user is trying to complete something that matches an exact technique ID, just return that one item
                        const tactic: Tactic | undefined = this.tactics.find((t: Tactic) => { return t.id === completionTerm.toUpperCase(); });
                        if (tactic !== undefined) {
                            if (debug) { log(`TacticCompletionProvider: Found exact Tactic ID '${tactic.id}'`); }
                            completionItems = [buildCompletionItem(tactic.id, tactic)];
                        }
                        else {
                            // if the user is trying to complete a technique by name
                            const possibleTactics: Tactic[] | undefined = this.tactics.filter((t: Tactic) => {
                                return t.name.toLowerCase().includes(completionTerm.toLowerCase());
                            });
                            if (possibleTactics !== undefined) {
                                completionItems = possibleTactics.map<vscode.CompletionItem>((t: Tactic) => {
                                    if (debug) { log(`TacticCompletionProvider: Found possible Tactic '${t.name}'`); }
                                    return buildCompletionItem(t.name, t);
                                });
                            }
                        }
                    }
                }
                resolve(completionItems);
            });
        } catch (error) {
            log(`TacticCompletionProvider error: ${error}`);
        }
    }

    public resolveCompletionItem(item: vscode.CompletionItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem> {
        try {
            return new Promise((resolve) => {
                token.onCancellationRequested(() => {
                    // if this process is cancelled, just return nothing
                    if (debug) { log('TacticCompletionProvider: Resolution task cancelled!'); }
                    resolve(undefined);
                });
                if (debug) { log(`TacticCompletionProvider: Resolving completion item for '${item.label}'`); }
                item.keepWhitespace = true;
                const tactic: Tactic | undefined = this.tactics.find((t: Tactic) => {
                    return (t.id === item.label) || (t.name === item.label);
                });
                if (tactic !== undefined) {
                    item.documentation = buildTacticDescription(tactic);
                }
                resolve(item);
            });
        } catch (error) {
            log(`TacticCompletionProvider error: ${error}`);
        }
    }
}

/*
    Register features for the given DocumentFilters and Tactics
*/
export function register(filters: vscode.DocumentSelector, tactics: Array<Tactic>): Array<vscode.Disposable> {
    log('Registering providers for Tactics');
    // hover provider
    const tacticHovers: TacticHoverProvider = new TacticHoverProvider();
    const tacticHoverDisposable: vscode.Disposable = vscode.languages.registerHoverProvider(filters, tacticHovers);
    tacticHovers.tactics = tactics;
    // completion provider
    const tacticCompletions: TacticCompletionProvider = new TacticCompletionProvider();
    tacticCompletions.tactics = tactics;
    const tacticCompletionDisposable: vscode.Disposable = vscode.languages.registerCompletionItemProvider(filters, tacticCompletions);
    return [tacticHoverDisposable, tacticCompletionDisposable];
}

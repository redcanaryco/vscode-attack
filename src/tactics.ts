import * as vscode from 'vscode';
import { completionFormat, configSection, debug } from './configuration';
import { minTermLength, output, tacticRegex } from './helpers';

/*
    Build a completion item out of a tactic
*/
function buildCompletionItem(label: string, tactic: Tactic): vscode.CompletionItem {
    let completionItem: vscode.CompletionItem = new vscode.CompletionItem(label, vscode.CompletionItemKind.Value);
    let insertionText: string = buildInsertionText(tactic);
    completionItem.detail = insertionText;
    completionItem.insertText = insertionText;
    return completionItem;
}

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
    return insertionText;
}

/*
    Counterpart to buildTechniqueDescription ... but for tactics
*/
function buildTacticDescription(tactic: Tactic, descriptionType: string|undefined = undefined): vscode.MarkdownString {
    if (descriptionType === undefined) { descriptionType = vscode.workspace.getConfiguration(configSection).get('description'); }
    let mdBuilder: vscode.MarkdownString = new vscode.MarkdownString(undefined);
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
			let description: string = item.description !== undefined ? item.description : 'No description available.';
			let tactic: Tactic = {
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
		if (debug) { output.appendLine(`Parsed out ${tactics.length} tactics`); }
		resolve(tactics);
	});
}

/*
    Register features for the given DocumentFilters and Tactics
*/
export function register(filters: vscode.DocumentSelector, tactics: Array<Tactic>): Array<vscode.Disposable> {
    // hover provider
    let tacticHovers: TacticHoverProvider = new TacticHoverProvider();
    let tacticHoverDisposable: vscode.Disposable = vscode.languages.registerHoverProvider(filters, tacticHovers);
    tacticHovers.tactics = tactics;
    // completion provider
    let tacticCompletions: TacticCompletionProvider = new TacticCompletionProvider();
    tacticCompletions.tactics = tactics;
    let tacticCompletionDisposable: vscode.Disposable = vscode.languages.registerCompletionItemProvider(filters, tacticCompletions);
    return [tacticHoverDisposable, tacticCompletionDisposable];
}

export class TacticHoverProvider implements vscode.HoverProvider {
    public tactics: Array<Tactic> = new Array<Tactic>();

    public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
		try {
			return new Promise((resolve) => {
				token.onCancellationRequested(() => {
					// if this process is cancelled, just return nothing
					resolve(undefined);
				});
				let hover: vscode.Hover | undefined = undefined;
				// gotta match the following: T1000, T1000.001, T1000/001
                let hoverRange: vscode.Range | undefined = undefined;
                hoverRange = document.getWordRangeAtPosition(position, tacticRegex);
				if (hoverRange !== undefined) {
					let hoverTerm: string = document.getText(hoverRange);
                    if (debug) { output.appendLine(`provideHover: Hover term: ${hoverTerm}`); }
                    let currentTactic: Tactic | undefined = this.tactics.find((t: Tactic) => { return t.id === hoverTerm; });
                    if (currentTactic !== undefined) {
                        hover = new vscode.Hover(buildTacticDescription(currentTactic), hoverRange);
                    }
                }
				resolve(hover);
			});
		} catch (error) {
			output.appendLine(`provideHover error: ${error}`);
		}
	}
}

export class TacticCompletionProvider implements vscode.CompletionItemProvider {
    public tactics: Array<Tactic> = new Array<Tactic>();

	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        try {
            return new Promise((resolve) => {
				token.onCancellationRequested(() => {
					// if this process is cancelled, just return nothing
					resolve(undefined);
                });
                let completionItems: Array<vscode.CompletionItem> = new Array<vscode.CompletionItem>();
                let dbgMsg: string = '';
                let completionRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
                if (completionRange === undefined) {
                    dbgMsg = `TacticCompletionProvider: No completion item range provided.`;
                    console.log(dbgMsg);
                    if (debug) { output.appendLine(dbgMsg); }
                }
                else {
                    let completionTerm: string = document.getText(completionRange);
                    // only return everything if this is a "long" term
                    if (completionTerm.length >= minTermLength) {
                        dbgMsg = `TacticCompletionProvider: Completion term: ${completionTerm}`;
                        console.log(dbgMsg);
                        if (debug) { output.appendLine(dbgMsg); }
                        // if the user is trying to complete something that matches an exact technique ID, just return that one item
                        let tactic: Tactic | undefined = this.tactics.find((t: Tactic) => { return t.id === completionTerm.toUpperCase(); });
                        if (tactic !== undefined) {
                            dbgMsg = `TacticCompletionProvider: Found exact technique ID '${tactic.id}'`;
                            console.log(dbgMsg);
                            if (debug) { output.appendLine(dbgMsg); }
                            completionItems = [buildCompletionItem(tactic.id, tactic)];
                        }
                        else {
                            // if the user is trying to complete a technique by name
                            let possibleTactics: Tactic[] | undefined = this.tactics.filter((t: Tactic) => {
                                return t.name.toLowerCase().includes(completionTerm.toLowerCase());
                            });
                            if (possibleTactics !== undefined) {
                                completionItems = possibleTactics.map<vscode.CompletionItem>((t: Tactic) => {
                                    return buildCompletionItem(t.name, t);
                                });
                            }
                        }
                    }
                }
                resolve(completionItems);
            });
        } catch (error) {
            output.appendLine(`TacticCompletionProvider error: ${error}`);
        }
    }

    public resolveCompletionItem(item: vscode.CompletionItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem> {
        try {
            return new Promise((resolve) => {
                token.onCancellationRequested(() => {
					// if this process is cancelled, just return nothing
					resolve(undefined);
                });
                // console.log(`TacticCompletionProvider: Received completion item with label: ${item.label}`);
                item.keepWhitespace = true;
                let tactic: Tactic | undefined = this.tactics.find((t: Tactic) => {
                    return (t.id === item.label) || (t.name === item.label);
                });
                if (tactic !== undefined) {
                    item.documentation = buildTacticDescription(tactic);
                }
                resolve(item);
            });
        } catch (error) {
            output.appendLine(`TacticCompletionProvider error: ${error}`);
        }
    }
}

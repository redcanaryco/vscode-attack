import * as vscode from 'vscode';
import { completionFormat, configSection, debug } from './configuration';
import { minTermLength, output, mitigationRegex } from './helpers';


/*
    Build a completion item out of a piece of mitigation (either tool or malware)
*/
function buildCompletionItem(label: string, mitigation: Mitigation): vscode.CompletionItem {
    let completionItem: vscode.CompletionItem = new vscode.CompletionItem(label, vscode.CompletionItemKind.Value);
    let insertionText: string = buildInsertionText(mitigation);
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
    let mdBuilder: vscode.MarkdownString = new vscode.MarkdownString(undefined);
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

export async function init(attackData: AttackMap): Promise<Array<Mitigation>> {
    return new Promise((resolve) => {
        let mitigations: Array<Mitigation> = new Array<Mitigation>();
        mitigations = attackData.objects.filter((item: AttackObject) => {
            return item.type === 'course-of-action';
        }).map<Mitigation>((item: AttackObject) => {
            let description: string = item.description !== undefined ? item.description : 'No description available.';
            let mitigation: Mitigation = {
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
        if (debug) { output.appendLine(`Parsed out ${mitigations.length} mitigations`); }
        resolve(mitigations);
    });
}

export function register(filters: vscode.DocumentSelector, mitigations: Array<Mitigation>): Array<vscode.Disposable> {
    // hover provider
    let mitigationHovers: MitigationHoverProvider = new MitigationHoverProvider();
    let mitigationHoverDisposable: vscode.Disposable = vscode.languages.registerHoverProvider(filters, mitigationHovers);
    mitigationHovers.mitigations = mitigations;
    // completion provider
    let mitigationCompletions: MitigationCompletionProvider = new MitigationCompletionProvider();
    mitigationCompletions.mitigations = mitigations;
    let mitigationCompletionDisposable: vscode.Disposable = vscode.languages.registerCompletionItemProvider(filters, mitigationCompletions);
    return [mitigationHoverDisposable, mitigationCompletionDisposable];
}

export class MitigationHoverProvider implements vscode.HoverProvider {
    public mitigations: Array<Mitigation> = new Array<Mitigation>();

    public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
		try {
			return new Promise((resolve) => {
				token.onCancellationRequested(() => {
					// if this process is cancelled, just return nothing
					resolve(undefined);
				});
				let hover: vscode.Hover | undefined = undefined;
                let hoverRange: vscode.Range | undefined = undefined;
                hoverRange = document.getWordRangeAtPosition(position, mitigationRegex);
				if (hoverRange !== undefined) {
					let hoverTerm: string = document.getText(hoverRange);
                    if (debug) { output.appendLine(`provideHover: Hover term: ${hoverTerm}`); }
                    let currentMitigation: Mitigation | undefined = this.mitigations.find((g: Mitigation) => { return g.id === hoverTerm; });
                    if (currentMitigation !== undefined) {
                        hover = new vscode.Hover(buildMitigationDescription(currentMitigation), hoverRange);
                    }
                }
				resolve(hover);
			});
		} catch (error) {
			output.appendLine(`provideHover error: ${error}`);
		}
	}
}

export class MitigationCompletionProvider implements vscode.CompletionItemProvider {
    public mitigations: Array<Mitigation> = new Array<Mitigation>();

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
                    dbgMsg = `MitigationCompletionProvider: No completion item range provided.`;
                    console.log(dbgMsg);
                    if (debug) { output.appendLine(dbgMsg); }
                }
                else {
                    let completionTerm: string = document.getText(completionRange);
                    // only return everything if this is a "long" term
                    if (completionTerm.length >= minTermLength) {
                        dbgMsg = `MitigationCompletionProvider: Completion term: ${completionTerm}`;
                        console.log(dbgMsg);
                        if (debug) { output.appendLine(dbgMsg); }
                        // if the user is trying to complete something that matches an exact mitigation ID, just return that one item
                        let mitigation: Mitigation | undefined = this.mitigations.find((g: Mitigation) => { return g.id === completionTerm.toUpperCase(); });
                        if (mitigation !== undefined) {
                            dbgMsg = `MitigationCompletionProvider: Found exact technique ID '${mitigation.id}'`;
                            console.log(dbgMsg);
                            if (debug) { output.appendLine(dbgMsg); }
                            completionItems = [buildCompletionItem(mitigation.id, mitigation)];
                        }
                        else {
                            // if the user is trying to complete a piece of mitigation by name
                            let possibleMitigation: Array<Mitigation> | undefined = this.mitigations.filter((s: Mitigation) => {
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
            output.appendLine(`MitigationCompletionProvider error: ${error}`);
        }
    }

    public resolveCompletionItem(item: vscode.CompletionItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem> {
        try {
            return new Promise((resolve) => {
                token.onCancellationRequested(() => {
					// if this process is cancelled, just return nothing
					resolve(undefined);
                });
                item.keepWhitespace = true;
                let mitigation: Mitigation | undefined = this.mitigations.find((g: Mitigation) => {
                    return (g.id === item.label) || (g.name === item.label);
                });
                if (mitigation !== undefined) {
                    item.documentation = buildMitigationDescription(mitigation);
                }
                resolve(item);
            });
        } catch (error) {
            output.appendLine(`MitigationCompletionProvider error: ${error}`);
        }
    }
}

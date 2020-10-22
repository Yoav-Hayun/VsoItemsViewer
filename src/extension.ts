// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {VsoItemsProvider, VsoItem} from './VsoItems';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	const vsoItemsProvider:VsoItemsProvider = new VsoItemsProvider();
	await vsoItemsProvider.initialize();

	vscode.window.registerTreeDataProvider('explorer.vso', vsoItemsProvider);
	vscode.commands.registerCommand("vsoItem.open", (node: VsoItem) => node.open());
	vscode.commands.registerCommand("vsoItems.refresh", () => vsoItemsProvider.refresh());

	context.subscriptions.push( vscode.workspace.onDidSaveTextDocument( _ => vsoItemsProvider.refresh() ));
	context.subscriptions.push( vscode.workspace.onDidOpenTextDocument( _ => vsoItemsProvider.refresh() ));
	context.subscriptions.push( vscode.workspace.onDidCloseTextDocument( _ => vsoItemsProvider.refresh() ));
	context.subscriptions.push( vscode.workspace.onDidChangeWorkspaceFolders( _ => vsoItemsProvider.refresh() ));
	context.subscriptions.push( vscode.window.onDidChangeActiveTextEditor( _ => vsoItemsProvider.refresh() ));
}

// this method is called when your extension is deactivated
export function deactivate() {}

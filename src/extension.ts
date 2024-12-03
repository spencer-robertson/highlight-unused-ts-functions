import ts from 'typescript';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	console.info('Export Checker Extension is now active!');

	// declare a timer to delay the decoration update
	let timeout: NodeJS.Timer;

	const editor = vscode.window.activeTextEditor;

	if (!editor) {
		vscode.window.showInformationMessage('No active editor!');
		return;
	}

	const exportDecoration = vscode.window.createTextEditorDecorationType({
		textDecoration: 'underline wavy yellow',
		opacity: '0.7',
		overviewRulerColor: 'yellow',
	});

	triggerUpdateDecorations(editor);

	vscode.workspace.onDidChangeTextDocument(event => {
		if ((event.document.languageId === 'typescript' || event.document.languageId === 'typescriptreact') && vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
			console.log("Triggering 1");
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);

	vscode.window.onDidChangeActiveTextEditor(editor => {
		if (!editor) {
			return;
		}

		const languageId = editor.document.languageId;
		if (languageId === 'typescript' || languageId === 'typescriptreact') {
			console.log("Triggering 3");
			triggerUpdateDecorations(editor);
		}
	});

	function triggerUpdateDecorations(editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor) {
		if (timeout) {
			clearTimeout(timeout as any);
		}
		timeout = setTimeout(() => editor && underlineExportedCommand(editor.document, exportDecoration), 1000);
	}
}

// Command to underline all exported entities
const underlineExportedCommand = async (document: vscode.TextDocument, exportDecoration: vscode.TextEditorDecorationType) => {
	const text = document.getText();
	const ranges: vscode.Range[] = [];
	const noExternalReferences: vscode.Range[] = [];

	// Use TypeScript Compiler API to parse the document and find exported entities
	const sourceFile = ts.createSourceFile(
		document.fileName,
		text,
		ts.ScriptTarget.Latest,
		true
	);

	const addRange = (name: ts.Identifier) => {
		const start = document.positionAt(name.getStart());
		const end = document.positionAt(name.getEnd());
		ranges.push(new vscode.Range(start, end));
	};

	const isExported = (node: ts.Node) => {
		if ('modifiers' in node && node.modifiers) {
			return (node.modifiers as any).some(
				(modifier: any) => modifier.kind === ts.SyntaxKind.ExportKeyword
			);
		}

		return ts.isExportAssignment(node);
	};

	const visit = (node: ts.Node) => {
		// Match exported function declarations
		if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) {
			addRange(node.name);
		}

		// Match exported class declarations
		if (ts.isClassDeclaration(node) && node.name && isExported(node)) {
			addRange(node.name);
		}

		// Match exported variables with arrow functions
		if (ts.isVariableStatement(node) && isExported(node)) {
			const declarationList = node.declarationList.declarations;
			declarationList.forEach((declaration) => {
				if (
					ts.isIdentifier(declaration.name) &&
					declaration.initializer &&
					ts.isArrowFunction(declaration.initializer)
				) {
					addRange(declaration.name);

				}
			});
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);

	for (const range of ranges) {
		// Get all locations where the exported entity is referenced
		const locations = await vscode.commands.executeCommand<vscode.Location[]>(
			'vscode.executeReferenceProvider',
			document.uri,
			range.start
		);

		const externalReferences = locations.filter(
			(location) => location.uri.fsPath !== document.uri.fsPath
		);

		if (externalReferences.length === 0) {
			noExternalReferences.push(range);
		}
	}

	if (noExternalReferences.length === 0 || !vscode.window.activeTextEditor) {
		return;
	}

	vscode.window.activeTextEditor.setDecorations(exportDecoration, noExternalReferences);
};

export function deactivate() {
	console.log('Export Checker Extension is now deactivated!');
}

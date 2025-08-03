import React, { useRef, Suspense } from 'react';
import Editor, { EditorProps, Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

interface CodeEditorProps extends Omit<EditorProps, 'onMount'> {
  onCodeChange?: (value: string) => void;
  onMount?: (editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => void;
  showMinimap?: boolean;
  readOnly?: boolean;
  className?: string;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value = '',
  language = 'javascript',
  theme = 'vs-dark',
  height = '500px',
  width = '100%',
  onCodeChange,
  onMount,
  showMinimap = true,
  readOnly = false,
  className = '',
  ...props
}) => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    
    console.log('🎯 Monaco Editor mounted:', { 
      value: value?.substring(0, 100) + '...', 
      valueLength: value?.length || 0,
      height, 
      width,
      theme,
      language 
    });
    
    // Configure Cypress-specific autocomplete and snippets
    configureCypressSupport(monaco);
    
    // Set editor options
    editor.updateOptions({
      minimap: { enabled: showMinimap },
      readOnly,
      fontSize: 14,
      lineHeight: 1.5,
      formatOnPaste: true,
      formatOnType: true,
      autoIndent: 'advanced',
      wordWrap: 'on',
      lineNumbers: 'on',
      folding: true,
      foldingHighlight: true,
      renderLineHighlight: 'all',
      occurrencesHighlight: 'singleFile',
      selectionHighlight: true,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'blink',
      cursorSmoothCaretAnimation: 'on',
      suggest: {
        showKeywords: true,
        showSnippets: true,
        showFunctions: true,
        showConstructors: true,
        showFields: true,
        showVariables: true,
        showClasses: true,
        showStructs: true,
        showInterfaces: true,
        showModules: true,
        showProperties: true,
        showEvents: true,
        showOperators: true,
        showUnits: true,
        showValues: true,
        showConstants: true,
        showEnums: true,
        showEnumMembers: true,
        showTypeParameters: true,
        showIssues: true,
        showUsers: true,
        showWords: true,
        showColors: true,
        showFiles: true,
        showReferences: true,
        showFolders: true
      }
    });

    // Add keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      // Trigger save action
      const currentValue = editor.getValue();
      if (onCodeChange) {
        onCodeChange(currentValue);
      }
      // Show a visual indicator that save was triggered
      showSaveIndicator(editor);
      
      // Trigger global save event if available
      if (window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('monaco-save', { 
          detail: { value: currentValue } 
        }));
      }
    });

    // Force layout after a short delay to ensure proper rendering
    setTimeout(() => {
      editor.layout();
      console.log('🔄 Forced editor layout refresh');
    }, 100);
    
    // Call the external onMount handler if provided
    if (onMount) {
      onMount(editor, monaco);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    if (onCodeChange && value !== undefined) {
      onCodeChange(value);
    }
  };

  return (
    <div className={`border rounded-lg overflow-hidden ${className}`}>
      <Suspense fallback={
        <div className="flex items-center justify-center h-full bg-gray-50">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
            <span className="text-sm text-gray-600">Loading Monaco Editor...</span>
          </div>
        </div>
      }>
        <Editor
          value={value}
          language={language}
          theme={theme}
          height={height}
          width={width}
          onMount={handleEditorDidMount}
          onChange={handleEditorChange}
          loading={
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
              <span className="ml-2">Initializing Editor...</span>
            </div>
          }
          options={{
            automaticLayout: true,
            fontSize: 14,
            wordWrap: 'on',
            minimap: { enabled: showMinimap },
            readOnly,
          }}
          {...props}
        />
      </Suspense>
    </div>
  );
};

// Configure Cypress-specific language support
function configureCypressSupport(monaco: Monaco) {
  // Add Cypress type definitions
  const cypressTypes = `
declare namespace Cypress {
  interface Chainable {
    visit(url: string, options?: any): Chainable<any>;
    get(selector: string, options?: any): Chainable<any>;
    contains(content: string, options?: any): Chainable<any>;
    click(options?: any): Chainable<any>;
    type(text: string, options?: any): Chainable<any>;
    clear(options?: any): Chainable<any>;
    should(assertion: string, value?: any): Chainable<any>;
    wait(time: number | string): Chainable<any>;
    url(): Chainable<string>;
    title(): Chainable<string>;
    reload(options?: any): Chainable<any>;
    go(direction: string | number): Chainable<any>;
    scrollTo(position: string | number, y?: number): Chainable<any>;
    screenshot(fileName?: string): Chainable<any>;
    viewport(width: number, height: number): Chainable<any>;
    intercept(method: string, url: string, response?: any): Chainable<any>;
    fixture(filePath: string): Chainable<any>;
    task(event: string, arg?: any): Chainable<any>;
    wrap(object: any): Chainable<any>;
    as(alias: string): Chainable<any>;
    then(fn: (result: any) => any): Chainable<any>;
    and(assertion: string, value?: any): Chainable<any>;
    within(fn: () => void): Chainable<any>;
    each(fn: (element: any, index: number) => void): Chainable<any>;
    first(): Chainable<any>;
    last(): Chainable<any>;
    eq(index: number): Chainable<any>;
    find(selector: string): Chainable<any>;
    parent(): Chainable<any>;
    children(): Chainable<any>;
    siblings(): Chainable<any>;
    next(): Chainable<any>;
    prev(): Chainable<any>;
    submit(): Chainable<any>;
    check(): Chainable<any>;
    uncheck(): Chainable<any>;
    select(value: string): Chainable<any>;
    focus(): Chainable<any>;
    blur(): Chainable<any>;
    trigger(event: string): Chainable<any>;
    rightclick(): Chainable<any>;
    dblclick(): Chainable<any>;
    hover(): Chainable<any>;
  }
}

declare const cy: Cypress.Chainable;
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const beforeEach: (fn: () => void) => void;
declare const afterEach: (fn: () => void) => void;
declare const before: (fn: () => void) => void;
declare const after: (fn: () => void) => void;
declare const expect: any;
`;

  // Add Cypress library to TypeScript
  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    cypressTypes,
    'cypress.d.ts'
  );

  // Configure autocomplete suggestions for Cypress commands
  monaco.languages.registerCompletionItemProvider('javascript', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = [
        {
          label: 'cy.visit',
          kind: monaco.languages.CompletionItemKind.Method,
          insertText: "cy.visit('${1:url}');",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Visit a URL',
          range,
        },
        {
          label: 'cy.get',
          kind: monaco.languages.CompletionItemKind.Method,
          insertText: "cy.get('${1:selector}');",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Get element by selector',
          range,
        },
        {
          label: 'cy.contains',
          kind: monaco.languages.CompletionItemKind.Method,
          insertText: "cy.contains('${1:text}');",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Get element containing text',
          range,
        },
        {
          label: 'describe',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "describe('${1:description}', () => {\n\t${2}\n});",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Test suite',
          range,
        },
        {
          label: 'it',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "it('${1:should do something}', () => {\n\t${2}\n});",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Test case',
          range,
        },
        {
          label: 'beforeEach',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "beforeEach(() => {\n\t${1}\n});",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Run before each test',
          range,
        },
        {
          label: 'should',
          kind: monaco.languages.CompletionItemKind.Method,
          insertText: "should('${1:assertion}');",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Assertion',
          range,
        },
        {
          label: 'click',
          kind: monaco.languages.CompletionItemKind.Method,
          insertText: 'click();',
          documentation: 'Click element',
          range,
        },
        {
          label: 'type',
          kind: monaco.languages.CompletionItemKind.Method,
          insertText: "type('${1:text}');",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Type text into element',
          range,
        },
        {
          label: 'wait',
          kind: monaco.languages.CompletionItemKind.Method,
          insertText: "wait(${1:1000});",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Wait for specified time in milliseconds',
          range,
        },
      ];

      return { suggestions };
    },
  });

  // Configure syntax highlighting for Cypress-specific patterns
  monaco.languages.setLanguageConfiguration('javascript', {
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '`', close: '`', notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
    ],
  });
}

function showSaveIndicator(editor: monaco.editor.IStandaloneCodeEditor) {
  // Create a temporary decoration to show save action
  const decoration = editor.createDecorationsCollection([
    {
      range: new monaco.Range(1, 1, 1, 1),
      options: {
        afterContentClassName: 'save-indicator',
        after: {
          content: ' 💾 Saved',
          inlineClassName: 'save-indicator-text'
        }
      }
    }
  ]);

  // Remove the decoration after 2 seconds
  setTimeout(() => {
    decoration.clear();
  }, 2000);
}

export default CodeEditor;
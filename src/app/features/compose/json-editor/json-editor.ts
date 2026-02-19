import {
  Component,
  ElementRef,
  ViewChild,
  input,
  output,
  effect,
  inject,
  PLATFORM_ID,
  OnDestroy,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

declare const window: any;

/**
 * Monaco-based JSON editor.
 * Loads Monaco from CDN on first browser render.
 * Exposes insertAtCursor() for the block palette.
 */
@Component({
  selector: 'app-json-editor',
  standalone: true,
  template: `
    <div class="editor-wrap" #editorContainer></div>
    @if (!monacoReady()) {
      <div class="editor-loading">Loading editor…</div>
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      position: relative;
    }

    .editor-wrap {
      flex: 1;
      min-height: 0;
    }

    .editor-loading {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #1e1e1e;
      color: #666;
      font-family: 'Consolas', monospace;
      font-size: 13px;
    }
  `],
})
export class JsonEditor implements OnDestroy {
  @ViewChild('editorContainer', { static: true }) container!: ElementRef<HTMLDivElement>;

  // Input: current JSON string to display
  value = input<string>('');

  // Outputs
  valueChange = output<string>();
  editorCursorWord = output<string>();
  editorSelection = output<string>();

  private platformId = inject(PLATFORM_ID);
  private editor: any = null;
  private monaco: any = null;
  monacoReady = signal(false);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadMonaco();
    }

    // When value input changes externally (new file loaded), update editor
    effect(() => {
      const newValue = this.value();
      if (this.editor && this.editor.getValue() !== newValue) {
        this.editor.setValue(newValue);
      }
    });
  }

  private loadMonaco() {
    // Already loaded
    if (window.__monacoLoaded) {
      this.initEditor();
      return;
    }

    // Already loading (script tag exists)
    if (window.__monacoLoading) {
      const check = setInterval(() => {
        if (window.__monacoLoaded) {
          clearInterval(check);
          this.initEditor();
        }
      }, 100);
      return;
    }

    window.__monacoLoading = true;

    const script = document.createElement('script');
    script.src =
      'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js';
    script.onload = () => {
      window.require.config({
        paths: {
          vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs',
        },
      });
      window.require(['vs/editor/editor.main'], (monaco: any) => {
        this.monaco = monaco;
        window.__monacoInstance = monaco;
        window.__monacoLoaded = true;
        this.initEditor();
      });
    };
    script.onerror = () => {
      console.error('Failed to load Monaco editor from CDN');
    };
    document.head.appendChild(script);
  }

  private initEditor() {
    const monaco = this.monaco || window.__monacoInstance;
    if (!monaco || !this.container?.nativeElement) return;

    this.editor = monaco.editor.create(this.container.nativeElement, {
      value: this.value() || '',
      language: 'json',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      tabSize: 2,
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      formatOnPaste: true,
      formatOnType: false,
      lineNumbers: 'on',
      folding: true,
      renderWhitespace: 'selection',
    });

    // Emit changes
    this.editor.onDidChangeModelContent(() => {
      this.valueChange.emit(this.editor.getValue());
    });

    // Cursor position → emit debounced word for preview scroll
    let cursorTimer: any;
    this.editor.onDidChangeCursorPosition(() => {
      clearTimeout(cursorTimer);
      cursorTimer = setTimeout(() => {
        if (!this.editor) return;
        const pos = this.editor.getPosition();
        const mdl = this.editor.getModel();
        if (!pos || !mdl) return;
        const word = mdl.getWordAtPosition(pos);
        if (word?.word && word.word.length >= 5) {
          this.editorCursorWord.emit(word.word);
        }
      }, 500);
    });

    // Selection → emit selected text for preview selection
    this.editor.onDidChangeCursorSelection(() => {
      if (!this.editor) return;
      const sel = this.editor.getSelection();
      const mdl = this.editor.getModel();
      if (!sel || !mdl || sel.isEmpty()) return;
      const text = mdl.getValueInRange(sel).trim();
      if (text.length > 1) {
        this.editorSelection.emit(text);
      }
    });

    this.monacoReady.set(true);
  }

  /**
   * Insert a block JSON snippet at the cursor position.
   * Finds the end of the "content" array and inserts there,
   * or falls back to inserting at the cursor.
   */
  insertAtCursor(blockJson: string) {
    if (!this.editor) return;

    const model = this.editor.getModel();
    const position = this.editor.getPosition();
    if (!model || !position) return;

    const fullText = model.getValue();
    const offset = model.getOffsetAt(position);

    // Look at what comes before/after cursor (ignoring whitespace) to decide commas
    const before = fullText.slice(0, offset).trimEnd();
    const after = fullText.slice(offset).trimStart();
    const firstAfter = after[0] ?? '';

    // Need a leading comma if the previous non-whitespace char closes an item
    const needsLeadingComma =
      before.length > 0 && !before.endsWith('[') && !before.endsWith(',');

    // Need a trailing comma if what follows is another item (not end of array/object)
    const needsTrailingComma =
      firstAfter !== '' && firstAfter !== ']' && firstAfter !== '}' && firstAfter !== ',';

    const insertion =
      (needsLeadingComma ? ',\n' : '') +
      blockJson +
      (needsTrailingComma ? ',' : '');

    this.editor.executeEdits('block-palette', [
      {
        range: new (this.monaco || window.__monacoInstance).Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column
        ),
        text: insertion,
        forceMoveMarkers: true,
      },
    ]);

    this.editor.focus();
  }

  /**
   * Replace editor content from an external source (e.g. preview inline edit).
   * Unlike the `value` input, this does not reset the undo history.
   */
  setContent(json: string): void {
    if (!this.editor) return;
    const model = this.editor.getModel();
    if (!model) return;
    // Use pushEditOperations to preserve undo stack instead of setValue
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: json }],
      () => null
    );
  }

  /** Get the current editor content */
  getValue(): string {
    return this.editor?.getValue() ?? this.value();
  }

  /** Format the document JSON */
  formatDocument() {
    this.editor?.getAction('editor.action.formatDocument')?.run();
  }

  /**
   * Find `text` in the model and place the cursor at `charOffset` characters
   * into the first match. Brings Monaco into focus.
   */
  navigateToText(text: string, charOffset = 0, focus = true): void {
    if (!this.editor || !text) return;
    const model = this.editor.getModel();
    if (!model) return;

    const matches = model.findMatches(text, true, false, true, null, false, 1);
    if (!matches.length) return;

    const { range } = matches[0];
    const baseOffset = model.getOffsetAt({
      lineNumber: range.startLineNumber,
      column: range.startColumn,
    });
    const targetPos = model.getPositionAt(baseOffset + charOffset);

    this.editor.setPosition(targetPos);
    this.editor.revealPositionInCenter(targetPos);
    if (focus) this.editor.focus();
  }

  /**
   * Find `text` in the model and select the first occurrence.
   */
  selectText(text: string): void {
    if (!this.editor || !text) return;
    const model = this.editor.getModel();
    if (!model) return;

    const matches = model.findMatches(text, true, false, true, null, false, 1);
    if (!matches.length) return;

    const { range } = matches[0];
    this.editor.setSelection(range);
    this.editor.revealRangeInCenter(range);
    this.editor.focus();
  }

  ngOnDestroy() {
    this.editor?.dispose();
  }
}

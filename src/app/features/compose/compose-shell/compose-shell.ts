import {
  Component,
  ViewChild,
  inject,
  signal,
  computed,
  HostListener,
} from '@angular/core';
import { ServerConfig } from '../compose.service';
import { CommonModule } from '@angular/common';
import { ComposeService } from '../compose.service';
import {
  FileBrowser,
  SectionKey,
} from '../file-browser/file-browser';
import { JsonEditor } from '../json-editor/json-editor';
import { BlockPalette } from '../block-palette/block-palette';
import { ComposePreview } from '../compose-preview/compose-preview';
import { FileEntry } from '../compose.service';

/** Default JSON templates for new files */
function newFileTemplate(section: SectionKey, slug: string): string {
  if (section === 'blog') {
    return JSON.stringify(
      {
        id: slug,
        slug,
        title: 'New Article Title',
        description: 'A short description of the article.',
        author: {
          id: 'joel_hansen',
          name: 'Joel Hansen',
          bio: '',
          avatar: '/meta-images/joel-author.jpg',
        },
        publishedDate: new Date().toISOString().split('T')[0],
        heroImage: { src: '', alt: '' },
        tags: [],
        category: 'General',
        metaDescription: '',
        metaKeywords: [],
        featured: false,
        display: true,
        relatedArticles: [],
        content: [
          { type: 'paragraph', data: { text: 'Start writing here.' } },
        ],
      },
      null,
      2
    );
  }

  if (section === 'resources') {
    return JSON.stringify(
      {
        id: slug,
        slug,
        title: 'Resource Title',
        subtitle: '',
        description: 'Resource description.',
        externalUrl: '',
        category: 'General',
        publishedDate: new Date().toISOString().split('T')[0],
        tags: [],
        metaDescription: '',
        metaKeywords: [],
        featured: false,
        isPaid: false,
        difficulty: 'intermediate',
        display: true,
        relatedResources: [],
      },
      null,
      2
    );
  }

  // artists
  return JSON.stringify(
    {
      id: slug,
      slug,
      name: 'Artist Name',
      shortDescription: 'A short description.',
      longDescription: 'A longer description of the artist.',
      keywords: [],
      metaDescription: '',
      metaKeywords: [],
      publishedDate: new Date().toISOString().split('T')[0],
      featured: false,
      display: true,
      youtubeVideoId: '',
      youtubeVideos: [],
    },
    null,
    2
  );
}

type EditorState = 'idle' | 'loading' | 'saving' | 'deploying' | 'error';

@Component({
  selector: 'app-compose-shell',
  standalone: true,
  imports: [CommonModule, FileBrowser, JsonEditor, BlockPalette, ComposePreview],
  host: {
    '[class.resizing]': 'isDraggingResize()',
  },
  template: `
    <!-- Top toolbar -->
    <div class="toolbar">
      <span class="toolbar-brand">✏ Compose</span>

      <span class="toolbar-file">
        @if (currentFile()) {
          <span class="file-path">{{ currentFile()!.relativePath }}</span>
          @if (isDirty()) {
            <span class="dirty-dot" title="Unsaved changes">●</span>
          }
        } @else {
          <span class="no-file">No file open — select a file on the left</span>
        }
      </span>

      <div class="toolbar-actions">
        <!-- Format -->
        <button
          class="tb-btn"
          (click)="formatDocument()"
          [disabled]="!currentFile()"
          title="Format JSON"
        >
          &#123;&#125; Format
        </button>

        <!-- Save -->
        <button
          class="tb-btn save-btn"
          (click)="saveFile()"
          [disabled]="!isDirty() || state() === 'saving'"
          title="Save file"
        >
          @if (state() === 'saving') { Saving… } @else { ↓ Save }
        </button>

        <!-- Deploy -->
        <button
          class="tb-btn deploy-btn"
          (click)="showDeployDialog.set(true)"
          [disabled]="state() === 'deploying'"
          title="Trigger a Netlify redeploy"
        >
          @if (state() === 'deploying') { Publishing… } @else { ↑ Publish }
        </button>

        <!-- Config -->
        <button
          class="tb-btn config-btn"
          (click)="openConfigDialog()"
          title="Netlify configuration"
        >
          ⚙ Config
        </button>
      </div>
    </div>

    <!-- Pane body — columns adjust based on section -->
    <div class="pane-container" [style.grid-template-columns]="gridTemplate()">
      <!-- Left: file browser -->
      <app-file-browser
        (fileSelected)="onFileSelected($event)"
        (newFileRequested)="onNewFile($event)"
      />

      <!-- Center: Monaco editor -->
      <div class="editor-pane">
        @if (currentFile()) {
          <app-json-editor
            #editor
            [value]="editorValue()"
            (valueChange)="onEditorChange($event)"
            (editorCursorWord)="onEditorCursorWord($event)"
            (editorSelection)="onEditorSelection($event)"
          />
        } @else {
          <div class="editor-empty">
            <p>Select a file from the browser to start editing.</p>
          </div>
        }
        @if (statusMessage()) {
          <div class="status-bar" [class.error]="state() === 'error'">
            {{ statusMessage() }}
          </div>
        }
      </div>

      <!-- Resize handle -->
      <div class="resize-handle" (mousedown)="onResizeStart($event)"></div>

      <!-- Preview pane -->
      <app-compose-preview
        #preview
        [content]="currentEditorContent()"
        [section]="activeSection()"
        (previewClick)="onPreviewClick($event)"
        (previewSelect)="onPreviewSelect($event)"
        (contentChange)="onPreviewContentChange($event)"
      />

      <!-- Block palette — blog only -->
      @if (activeSection() === 'blog') {
        <app-block-palette (blockInserted)="onBlockInsert($event)" />
      }
    </div>

    <!-- Publish dialog -->
    @if (showDeployDialog()) {
      <div class="dialog-backdrop" (click)="showDeployDialog.set(false)">
        <div class="dialog" (click)="$event.stopPropagation()">
          <h3 class="dialog-title">Publish to Netlify</h3>
          <p class="dialog-desc">
            Triggers a Netlify redeploy. Make sure you've saved all files first.
          </p>
          <div class="dialog-actions">
            <button class="tb-btn" (click)="showDeployDialog.set(false)">Cancel</button>
            <button class="tb-btn deploy-btn" (click)="deploy()">Publish ↑</button>
          </div>
        </div>
      </div>
    }

    <!-- Config dialog -->
    @if (showConfigDialog()) {
      <div class="dialog-backdrop" (click)="showConfigDialog.set(false)">
        <div class="dialog config-dialog" (click)="$event.stopPropagation()">
          <h3 class="dialog-title">⚙ Netlify Configuration</h3>
          <p class="dialog-desc">
            Saved to <code>scripts/compose-config.json</code> on this machine only — never committed to git.
          </p>

          <div class="config-fields">
            <label class="config-label">
              <span>Personal Access Token</span>
              <input class="config-input" type="password"
                     [value]="configTokenInput()"
                     (input)="configTokenInput.set($any($event.target).value)"
                     placeholder="Leave blank to keep existing token" />
            </label>
            <label class="config-label">
              <span>JSON Site ID <span class="config-hint">(json.allthethings.dev)</span></span>
              <input class="config-input" type="text"
                     [value]="configSiteIdInput()"
                     (input)="configSiteIdInput.set($any($event.target).value)"
                     placeholder="e.g. 20491b0f-49a7-4951-9310-04003ded9637" />
            </label>
            <label class="config-label">
              <span>Main Site Build Hook URL <span class="config-hint">(allthethings.dev)</span></span>
              <input class="config-input" type="text"
                     [value]="configBuildHookInput()"
                     (input)="configBuildHookInput.set($any($event.target).value)"
                     placeholder="https://api.netlify.com/build_hooks/..." />
            </label>
          </div>

          @if (configSaveStatus()) {
            <p class="config-status">{{ configSaveStatus() }}</p>
          }

          <div class="dialog-actions">
            <button class="tb-btn" (click)="showConfigDialog.set(false)">Cancel</button>
            <button class="tb-btn deploy-btn" (click)="saveConfig()">Save</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: #1e1e1e;
      color: #ccc;
      font-family: 'Consolas', 'Segoe UI', monospace;
      font-size: 13px;
      overflow: hidden;
    }

    /* ── Toolbar ── */
    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 12px;
      height: 40px;
      background: #323233;
      border-bottom: 1px solid #444;
      flex-shrink: 0;
    }

    .toolbar-brand {
      font-weight: 700;
      color: #fff;
      font-size: 13px;
      flex-shrink: 0;
    }

    .toolbar-file {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;
    }

    .file-path {
      color: #9cdcfe;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dirty-dot {
      color: #f48771;
      font-size: 16px;
      line-height: 1;
    }

    .no-file {
      color: #555;
      font-size: 12px;
    }

    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .tb-btn {
      padding: 4px 12px;
      background: #3c3c3c;
      border: 1px solid #555;
      color: #ccc;
      cursor: pointer;
      border-radius: 3px;
      font-size: 12px;
      font-family: inherit;
      transition: background 0.1s;
      white-space: nowrap;
    }

    .tb-btn:hover:not(:disabled) { background: #4c4c4c; color: #fff; }
    .tb-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .save-btn { border-color: #4ec9b0; color: #4ec9b0; }
    .save-btn:hover:not(:disabled) { background: #264f45; }

    .deploy-btn { border-color: #569cd6; color: #569cd6; }
    .deploy-btn:hover:not(:disabled) { background: #1b3a5a; }

    .config-btn { border-color: #888; color: #aaa; }
    .config-btn:hover:not(:disabled) { background: #3c3c3c; color: #fff; border-color: #aaa; }


    /* ── Panes ── */
    .pane-container {
      flex: 1;
      display: grid;
      /* grid-template-columns set via [style] binding */
      width: 100%;       /* constrain so 1fr steals from editor, not grows rightward */
      min-height: 0;
      overflow: hidden;
    }

    /* Prevent grid children from overflowing their columns */
    .pane-container > * { min-width: 0; }

    /* Resizing — lock cursor and suppress text selection across whole shell */
    :host.resizing {
      cursor: col-resize;
      user-select: none;
    }

    /* ── Resize handle ── */
    .resize-handle {
      background: #333;
      cursor: col-resize;
      transition: background 0.15s;
      position: relative;
      /* Widen the interactive hit-area without affecting layout */
    }

    .resize-handle::after {
      content: '';
      position: absolute;
      inset: 0 -4px;
      z-index: 10;
    }

    .resize-handle:hover,
    :host.resizing .resize-handle {
      background: #569cd6;
    }

    /* ── Grid children: fill pane-container height ── */
    app-file-browser,
    .editor-pane,
    .resize-handle,
    app-compose-preview,
    app-block-palette {
      height: 100%;
    }

    /* ── Editor pane ── */
    .editor-pane {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border-left: 1px solid #333;
      border-right: 1px solid #333;
    }

    app-json-editor {
      flex: 1;
      min-height: 0;
    }

    .editor-empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #555;
      font-size: 14px;
    }

    .status-bar {
      padding: 4px 12px;
      font-size: 11px;
      background: #094771;
      color: #ccc;
      border-top: 1px solid #333;
      flex-shrink: 0;
    }

    .status-bar.error { background: #5a1d1d; color: #f48771; }


    /* ── Deploy dialog ── */
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .dialog {
      background: #252526;
      border: 1px solid #555;
      border-radius: 6px;
      padding: 24px;
      width: 480px;
      max-width: 90vw;
    }

    .dialog-title {
      margin: 0 0 12px;
      font-size: 15px;
      color: #fff;
    }

    .dialog-desc {
      color: #999;
      font-size: 12px;
      margin: 0 0 16px;
      line-height: 1.5;
    }

    .dialog-desc code {
      background: #1e1e1e;
      padding: 1px 4px;
      border-radius: 3px;
      font-family: 'Consolas', monospace;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    /* ── Config dialog ── */
    .config-dialog { width: 520px; }

    .config-fields {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-bottom: 16px;
    }

    .config-label {
      display: flex;
      flex-direction: column;
      gap: 5px;
      font-size: 12px;
      color: #aaa;
    }

    .config-hint { color: #666; font-size: 11px; }

    .config-input {
      background: #1e1e1e;
      border: 1px solid #444;
      color: #ccc;
      padding: 6px 10px;
      border-radius: 3px;
      font-family: 'Consolas', monospace;
      font-size: 12px;
      outline: none;
      width: 100%;
      box-sizing: border-box;
    }

    .config-input:focus { border-color: #569cd6; }

    .config-status {
      font-size: 12px;
      color: #4ec9b0;
      margin: 0 0 12px;
      font-family: 'Consolas', monospace;
    }
  `],
})
export class ComposeShell {
  @ViewChild('editor') editorRef!: JsonEditor;
  @ViewChild('preview') previewRef!: ComposePreview;
  private _suppressEditorEvents = false;
  private _pendingPreviewEdits = 0;

  private compose = inject(ComposeService);

  // State
  currentFile = signal<FileEntry | null>(null);
  activeSection = signal<SectionKey>('blog');
  editorValue = signal<string>('');
  currentEditorContent = signal<string>(''); // live editor value for preview
  isDirty = signal(false);
  state = signal<EditorState>('idle');
  statusMessage = signal<string>('');
  previewWidth = signal(300);
  isDraggingResize = signal(false);
  private _lastDragX = 0;

  gridTemplate = computed(() => {
    const pw = this.previewWidth();
    return this.activeSection() === 'blog'
      ? `240px 1fr 4px ${pw}px 240px`
      : `240px 1fr 4px ${pw}px`;
  });

  // Deploy dialog
  showDeployDialog = signal(false);

  // Config dialog
  showConfigDialog = signal(false);
  configTokenInput = signal('');
  configSiteIdInput = signal('');
  configBuildHookInput = signal('');
  configSaveStatus = signal('');

  openConfigDialog(): void {
    this.configSaveStatus.set('');
    this.compose.getServerConfig().subscribe({
      next: (cfg) => {
        this.configTokenInput.set(cfg.netlifyToken);     // already masked by server
        this.configSiteIdInput.set(cfg.netlifySiteId);
        this.configBuildHookInput.set(cfg.mainSiteBuildHook);
        this.showConfigDialog.set(true);
      },
      error: () => this.showConfigDialog.set(true),
    });
  }

  saveConfig(): void {
    const token = this.configTokenInput();
    const payload: any = {
      netlifySiteId: this.configSiteIdInput(),
      mainSiteBuildHook: this.configBuildHookInput(),
    };
    // Only send token if the user typed a new one (not the "***xxxx" masked placeholder)
    if (token && !token.startsWith('***')) {
      payload.netlifyToken = token;
    }

    this.compose.saveServerConfig(payload).subscribe({
      next: () => {
        this.configSaveStatus.set('✓ Saved');
        setTimeout(() => {
          this.configSaveStatus.set('');
          this.showConfigDialog.set(false);
        }, 1200);
      },
      error: (err) => {
        this.configSaveStatus.set(`Error: ${err.error?.error || err.message}`);
      },
    });
  }

  onResizeStart(event: MouseEvent) {
    this._lastDragX = event.clientX;
    this.isDraggingResize.set(true);
    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onResizeMove(event: MouseEvent) {
    if (!this.isDraggingResize()) return;
    // Incremental delta: each frame computes only the change since the last frame.
    // Drag left (clientX decreases) → dx negative → preview grows (steals from editor).
    const dx = event.clientX - this._lastDragX;
    this._lastDragX = event.clientX;
    const next = Math.max(180, Math.min(700, this.previewWidth() - dx));
    this.previewWidth.set(next);
  }

  @HostListener('document:mouseup')
  onResizeEnd() {
    this.isDraggingResize.set(false);
  }

  onFileSelected(event: { file: FileEntry; section: SectionKey }) {
    if (this.isDirty()) {
      const ok = confirm(
        `You have unsaved changes in ${this.currentFile()?.slug}. Discard and open ${event.file.slug}?`
      );
      if (!ok) return;
    }

    this.activeSection.set(event.section);
    this.currentFile.set(event.file);
    this.state.set('loading');
    this.statusMessage.set('');

    this.compose.readFile(event.file.relativePath).subscribe({
      next: ({ content }) => {
        this.editorValue.set(content);
        this.currentEditorContent.set(content);
        this.isDirty.set(false);
        this.state.set('idle');
        this.statusMessage.set(`Opened ${event.file.relativePath}`);
        setTimeout(() => this.statusMessage.set(''), 3000);
      },
      error: (err) => {
        this.state.set('error');
        this.statusMessage.set(`Error: ${err.message}`);
      },
    });
  }

  onNewFile(event: { slug: string; section: SectionKey }) {
    const template = newFileTemplate(event.section, event.slug);
    const sectionDirMap: Record<SectionKey, string> = {
      blog: 'blog/articles',
      resources: 'resources/resources',
      artists: '3d-artist-spotlight/artists',
    };
    const relativePath = `${sectionDirMap[event.section]}/${event.slug}.json`;

    const fakeEntry: FileEntry = {
      filename: `${event.slug}.json`,
      slug: event.slug,
      relativePath,
      mtime: new Date().toISOString(),
      size: template.length,
    };

    this.currentFile.set(fakeEntry);
    this.activeSection.set(event.section);
    this.editorValue.set(template);
    this.currentEditorContent.set(template);
    this.isDirty.set(true);
    this.statusMessage.set(`New file — save to create ${relativePath}`);
  }

  onEditorChange(value: string) {
    this.isDirty.set(value !== this.editorValue());
    // If the change came from a preview inline-edit push, don't re-render the
    // preview — the contenteditable element is the live source of truth right now.
    if (this._pendingPreviewEdits > 0) {
      this._pendingPreviewEdits--;
    } else {
      this.currentEditorContent.set(value);
    }
  }

  onBlockInsert(blockJson: string) {
    this.editorRef?.insertAtCursor(blockJson);
  }

  onPreviewClick(loc: { text: string; offset: number }): void {
    this._suppressEditorEvents = true;
    this.editorRef?.navigateToText(loc.text, loc.offset);
    setTimeout(() => this._suppressEditorEvents = false, 600);
  }

  onPreviewSelect(text: string): void {
    this._suppressEditorEvents = true;
    this.editorRef?.selectText(text);
    setTimeout(() => this._suppressEditorEvents = false, 600);
  }

  onPreviewContentChange(newJson: string): void {
    this._pendingPreviewEdits++;
    this._suppressEditorEvents = true;
    this.editorRef?.setContent(newJson);
    this.isDirty.set(true);
    setTimeout(() => this._suppressEditorEvents = false, 600);
  }

  onEditorCursorWord(word: string): void {
    if (this._suppressEditorEvents) return;
    this.previewRef?.scrollToText(word);
  }

  onEditorSelection(text: string): void {
    if (this._suppressEditorEvents) return;
    // Strip surrounding JSON quotes before searching the rendered preview
    const clean = text.replace(/^"|"$/g, '').trim();
    if (clean.length > 1) {
      this.previewRef?.selectPreviewText(clean);
    }
  }

  formatDocument() {
    this.editorRef?.formatDocument();
  }

  saveFile() {
    const file = this.currentFile();
    if (!file) return;

    const content = this.editorRef ? this.editorRef.getValue() : this.editorValue();

    // Validate JSON before saving
    try {
      JSON.parse(content);
    } catch (e: any) {
      this.state.set('error');
      this.statusMessage.set(`Invalid JSON: ${e.message}`);
      return;
    }

    this.state.set('saving');
    this.statusMessage.set('Saving…');

    this.compose.writeFile(file.relativePath, content).subscribe({
      next: () => {
        this.isDirty.set(false);
        this.state.set('idle');
        this.statusMessage.set(`Saved ${file.relativePath}`);
        this.editorValue.set(content);
        setTimeout(() => this.statusMessage.set(''), 4000);
      },
      error: (err) => {
        this.state.set('error');
        this.statusMessage.set(`Save failed: ${err.message}`);
      },
    });
  }

  deploy() {
    this.showDeployDialog.set(false);
    this.state.set('deploying');
    this.statusMessage.set('Publishing to Netlify…');

    this.compose.deploy('').subscribe({
      next: (result) => {
        this.state.set('idle');
        this.statusMessage.set(result.message || 'Published successfully');
        setTimeout(() => this.statusMessage.set(''), 6000);
      },
      error: (err) => {
        this.state.set('error');
        const msg = err.error?.error || err.message;
        this.statusMessage.set(`Publish failed: ${msg}`);
      },
    });
  }
}

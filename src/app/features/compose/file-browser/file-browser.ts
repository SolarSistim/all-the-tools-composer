import {
  Component,
  inject,
  signal,
  computed,
  output,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComposeService, FileEntry } from '../compose.service';

export type SectionKey = 'blog' | 'resources' | 'artists';

export interface SectionDef {
  key: SectionKey;
  label: string;
  icon: string;
}

export const SECTIONS: SectionDef[] = [
  { key: 'blog', label: 'Blog Articles', icon: '✍' },
  { key: 'resources', label: 'Resources', icon: '📚' },
  { key: 'artists', label: '3D Artists', icon: '🎨' },
];

@Component({
  selector: 'app-file-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Section tabs -->
    <div class="section-tabs">
      @for (sec of sections; track sec.key) {
        <button
          class="tab-btn"
          [class.active]="activeSection() === sec.key"
          (click)="selectSection(sec.key)"
        >
          <span>{{ sec.icon }}</span>
          <span>{{ sec.label }}</span>
        </button>
      }
    </div>

    <!-- File list search -->
    <div class="search-wrap">
      <input
        class="search-input"
        type="text"
        placeholder="Filter files…"
        [(ngModel)]="filterText"
      />
    </div>

    <!-- Files -->
    <div class="file-list">
      @if (loading()) {
        <div class="state-msg">Loading…</div>
      } @else if (error()) {
        <div class="state-msg error">
          {{ error() }}
          <br />
          <small>Is compose-server running on port 3001?</small>
        </div>
      } @else if (filteredFiles().length === 0) {
        <div class="state-msg">No files found.</div>
      } @else {
        @for (file of filteredFiles(); track file.slug) {
          <button
            class="file-item"
            [class.active]="selectedFile()?.slug === file.slug"
            (click)="selectFile(file)"
            [title]="file.relativePath"
          >
            <span class="file-slug">{{ file.slug }}</span>
            <span class="file-size">{{ formatSize(file.size) }}</span>
          </button>
        }
      }
    </div>

    <!-- New file -->
    <div class="new-file-area">
      @if (showNewFileInput()) {
        <div class="new-file-row">
          <input
            class="new-file-input"
            type="text"
            placeholder="new-article-slug"
            [(ngModel)]="newSlug"
            (keydown.enter)="createFile()"
            (keydown.escape)="showNewFileInput.set(false)"
            #newFileInput
          />
          <button class="create-btn" (click)="createFile()">Create</button>
        </div>
      } @else {
        <button class="new-btn" (click)="showNewFileInput.set(true)">
          + New File
        </button>
      }
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #252526;
      color: #ccc;
      font-family: 'Consolas', monospace;
      font-size: 12px;
      border-right: 1px solid #333;
    }

    .section-tabs {
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: 6px;
      border-bottom: 1px solid #333;
    }

    .tab-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      background: transparent;
      border: none;
      color: #999;
      cursor: pointer;
      border-radius: 3px;
      text-align: left;
      font-family: inherit;
      font-size: 12px;
      transition: background 0.1s;
    }

    .tab-btn:hover { background: #2d2d2d; color: #ddd; }
    .tab-btn.active { background: #094771; color: #fff; }

    .search-wrap {
      padding: 6px;
      border-bottom: 1px solid #333;
    }

    .search-input {
      width: 100%;
      box-sizing: border-box;
      background: #3c3c3c;
      border: 1px solid #555;
      color: #ccc;
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 12px;
      font-family: inherit;
    }

    .search-input:focus { outline: none; border-color: #569cd6; }

    .file-list {
      flex: 1;
      overflow-y: auto;
      padding: 4px;
    }

    .state-msg {
      padding: 12px 8px;
      color: #666;
      font-size: 12px;
    }

    .state-msg.error { color: #f48771; }

    .file-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 4px 8px;
      background: transparent;
      border: none;
      color: #ccc;
      cursor: pointer;
      border-radius: 3px;
      text-align: left;
      font-family: inherit;
      font-size: 12px;
      transition: background 0.1s;
    }

    .file-item:hover { background: #2d2d2d; }
    .file-item.active { background: #094771; color: #fff; }

    .file-slug {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-size {
      font-size: 10px;
      color: #666;
      flex-shrink: 0;
      margin-left: 4px;
    }

    .new-file-area {
      padding: 8px;
      border-top: 1px solid #333;
    }

    .new-btn {
      width: 100%;
      padding: 6px;
      background: #094771;
      border: none;
      color: #ccc;
      cursor: pointer;
      border-radius: 3px;
      font-family: inherit;
      font-size: 12px;
      transition: background 0.1s;
    }

    .new-btn:hover { background: #0e639c; color: #fff; }

    .new-file-row {
      display: flex;
      gap: 4px;
    }

    .new-file-input {
      flex: 1;
      background: #3c3c3c;
      border: 1px solid #555;
      color: #ccc;
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 12px;
      font-family: inherit;
    }

    .new-file-input:focus { outline: none; border-color: #569cd6; }

    .create-btn {
      padding: 4px 10px;
      background: #0e639c;
      border: none;
      color: #fff;
      cursor: pointer;
      border-radius: 3px;
      font-size: 12px;
    }

    .create-btn:hover { background: #1177bb; }
  `],
})
export class FileBrowser implements OnInit {
  private compose = inject(ComposeService);

  sections = SECTIONS;
  activeSection = signal<SectionKey>('blog');
  files = signal<FileEntry[]>([]);
  selectedFile = signal<FileEntry | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  showNewFileInput = signal(false);
  filterText = '';
  newSlug = '';

  fileSelected = output<{ file: FileEntry; section: SectionKey }>();
  newFileRequested = output<{ slug: string; section: SectionKey }>();

  filteredFiles = computed(() => {
    const q = this.filterText.toLowerCase();
    if (!q) return this.files();
    return this.files().filter((f) => f.slug.toLowerCase().includes(q));
  });

  ngOnInit() {
    this.loadSection('blog');
  }

  selectSection(key: SectionKey) {
    this.activeSection.set(key);
    this.filterText = '';
    this.loadSection(key);
  }

  private loadSection(key: SectionKey) {
    this.loading.set(true);
    this.error.set(null);
    this.files.set([]);
    this.selectedFile.set(null);

    this.compose.listFiles(key).subscribe({
      next: (files) => {
        this.files.set(files);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message || 'Failed to load files');
        this.loading.set(false);
      },
    });
  }

  selectFile(file: FileEntry) {
    this.selectedFile.set(file);
    this.fileSelected.emit({ file, section: this.activeSection() });
  }

  createFile() {
    const slug = this.newSlug.trim().toLowerCase().replace(/\s+/g, '-');
    if (!slug) return;
    this.newFileRequested.emit({ slug, section: this.activeSection() });
    this.newSlug = '';
    this.showNewFileInput.set(false);
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}K`;
  }
}

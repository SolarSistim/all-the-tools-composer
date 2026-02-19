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
  templateUrl: './file-browser.html',
  styleUrl: './file-browser.scss',
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
  filterText = signal('');
  pendingDelete = signal<FileEntry | null>(null);
  newSlug = '';

  fileSelected = output<{ file: FileEntry; section: SectionKey }>();
  newFileRequested = output<{ slug: string; section: SectionKey }>();
  fileDeleted = output<FileEntry>();

  indexFile = computed<FileEntry | null>(() =>
    this.files().find((f) => f.isIndex) ?? null
  );

  filteredFiles = computed(() => {
    const nonIndex = this.files().filter((f) => !f.isIndex);
    const q = this.filterText().toLowerCase();
    if (!q) return nonIndex;
    return nonIndex.filter((f) => f.slug.toLowerCase().includes(q));
  });

  ngOnInit() {
    this.loadSection('blog');
  }

  selectSection(key: SectionKey) {
    this.activeSection.set(key);
    this.filterText.set('');
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

  requestDelete(file: FileEntry, event: MouseEvent) {
    event.stopPropagation();
    this.pendingDelete.set(file);
  }

  confirmDelete(file: FileEntry) {
    this.compose.deleteFile(file.relativePath).subscribe({
      next: () => {
        this.files.update((fs) => fs.filter((f) => f.slug !== file.slug));
        if (this.selectedFile()?.slug === file.slug) {
          this.selectedFile.set(null);
        }
        this.pendingDelete.set(null);
        this.fileDeleted.emit(file);
      },
      error: (err) => {
        console.error('Delete failed:', err);
        this.pendingDelete.set(null);
      },
    });
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

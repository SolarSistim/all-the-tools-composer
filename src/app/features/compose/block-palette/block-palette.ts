import {
  Component,
  output,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface BlockTemplate {
  type: string;
  label: string;
  group: string;
  icon: string;
  template: object;
}

const BLOCK_TEMPLATES: BlockTemplate[] = [
  // ── Text ─────────────────────────────────────────────────────────────────
  {
    type: 'paragraph',
    label: 'Paragraph',
    group: 'Text',
    icon: '¶',
    template: { type: 'paragraph', data: { text: 'Enter text here.' } },
  },
  {
    type: 'heading',
    label: 'Heading',
    group: 'Text',
    icon: 'H',
    template: { type: 'heading', data: { level: 2, text: 'Section Title', id: 'section-title' } },
  },
  {
    type: 'blockquote',
    label: 'Blockquote',
    group: 'Text',
    icon: '"',
    template: { type: 'blockquote', data: { text: 'Quote text here.', citation: 'Author Name', citationUrl: '' } },
  },
  {
    type: 'list',
    label: 'List',
    group: 'Text',
    icon: '☰',
    template: { type: 'list', data: { style: 'unordered', items: ['Item one', 'Item two', 'Item three'] } },
  },
  // ── Media ─────────────────────────────────────────────────────────────────
  {
    type: 'image',
    label: 'Image',
    group: 'Media',
    icon: '🖼',
    template: {
      type: 'image',
      data: { src: '', alt: '', caption: '', credit: '', creditUrl: '' },
    },
  },
  {
    type: 'gallery',
    label: 'Gallery',
    group: 'Media',
    icon: '⊞',
    template: {
      type: 'gallery',
      data: {
        layout: 'grid',
        images: [
          { src: '', alt: '', caption: '' },
          { src: '', alt: '', caption: '' },
        ],
      },
    },
  },
  {
    type: 'video',
    label: 'Video',
    group: 'Media',
    icon: '▶',
    template: {
      type: 'video',
      data: { url: 'https://www.youtube.com/watch?v=', title: '', platform: 'youtube' },
    },
  },
  {
    type: 'audio',
    label: 'Audio',
    group: 'Media',
    icon: '♪',
    template: {
      type: 'audio',
      data: { src: '', embedUrl: '', title: '', description: '' },
    },
  },
  {
    type: 'moviePoster',
    label: 'Movie Poster',
    group: 'Media',
    icon: '🎬',
    template: {
      type: 'moviePoster',
      data: { src: '', alt: '', caption: '' },
    },
  },
  // ── Code ─────────────────────────────────────────────────────────────────
  {
    type: 'code',
    label: 'Code Block',
    group: 'Code',
    icon: '</>',
    template: {
      type: 'code',
      data: { code: '// your code here', language: 'typescript', filename: '' },
    },
  },
  // ── Layout ───────────────────────────────────────────────────────────────
  {
    type: 'divider',
    label: 'Divider',
    group: 'Layout',
    icon: '—',
    template: { type: 'divider', data: { style: 'line' } },
  },
  {
    type: 'adsense',
    label: 'AdSense',
    group: 'Layout',
    icon: '$',
    template: { type: 'adsense', data: {} },
  },
  // ── CTAs ─────────────────────────────────────────────────────────────────
  {
    type: 'cta',
    label: 'CTA',
    group: 'CTAs',
    icon: '→',
    template: {
      type: 'cta',
      data: {
        title: 'CTA Title',
        description: 'CTA description text.',
        buttonText: 'Learn More',
        buttonUrl: 'https://www.allthethings.dev',
        variant: 'primary',
      },
    },
  },
  {
    type: 'affiliate',
    label: 'Affiliate',
    group: 'CTAs',
    icon: '★',
    template: {
      type: 'affiliate',
      data: {
        name: 'Product Name',
        description: 'Product description.',
        image: '',
        imageAlt: '',
        price: '$0.00',
        priceNote: '',
        link: '',
        buttonText: 'View on Amazon',
        features: [],
        disclosure: 'As an Amazon Associate, we earn from qualifying purchases.',
        rating: 0,
        reviewCount: 0,
      },
    },
  },
  // ── Ratings ──────────────────────────────────────────────────────────────
  {
    type: 'movieRatings',
    label: 'Movie Ratings',
    group: 'Ratings',
    icon: '🍅',
    template: {
      type: 'movieRatings',
      data: {
        title: 'Movie Title',
        year: 2024,
        posterSrc: '',
        posterAlt: '',
        ratingsDate: new Date().toISOString().split('T')[0],
        ratings: [
          { source: 'RottenTomatoesCritic', score: 0, maxScore: 100 },
          { source: 'RottenTomatoesAudience', score: 0, maxScore: 100 },
          { source: 'IMDB', score: 0, maxScore: 10 },
        ],
      },
    },
  },
  {
    type: 'businessRatings',
    label: 'Business Ratings',
    group: 'Ratings',
    icon: '⭐',
    template: {
      type: 'businessRatings',
      data: {
        ratings: [
          { source: 'Google', rating: 0, reviewCount: 0 },
          { source: 'Yelp', rating: 0, reviewCount: 0 },
        ],
      },
    },
  },
  // ── Cross-links ───────────────────────────────────────────────────────────
  {
    type: 'see-also',
    label: 'See Also',
    group: 'Cross-links',
    icon: '↗',
    template: {
      type: 'see-also',
      data: {
        title: 'See Also',
        items: [{ type: 'article', id: 'article-slug', customText: '' }],
      },
    },
  },
  {
    type: 'related-tools',
    label: 'Related Tools',
    group: 'Cross-links',
    icon: '🔧',
    template: {
      type: 'related-tools',
      data: { toolIds: [], auto: false, limit: 3, title: 'Related Tools' },
    },
  },
  {
    type: 'related-resources',
    label: 'Related Resources',
    group: 'Cross-links',
    icon: '📚',
    template: {
      type: 'related-resources',
      data: { resourceIds: [], auto: false, limit: 3, title: 'Related Resources' },
    },
  },
  {
    type: 'tool-showcase',
    label: 'Tool Showcase',
    group: 'Cross-links',
    icon: '🛠',
    template: {
      type: 'tool-showcase',
      data: { toolId: '', customDescription: '', showCTA: true },
    },
  },
  // ── Components ────────────────────────────────────────────────────────────
  {
    type: 'component',
    label: 'Inline Component',
    group: 'Components',
    icon: '⚙',
    template: { type: 'component', data: { componentName: '' } },
  },
];

export const BLOCK_GROUPS = [...new Set(BLOCK_TEMPLATES.map((b) => b.group))];

@Component({
  selector: 'app-block-palette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="palette-header">
      <span class="palette-title">Block Palette</span>
      <input
        class="palette-search"
        type="text"
        placeholder="Search blocks…"
        [(ngModel)]="searchQuery"
        (ngModelChange)="onSearchChange($event)"
      />
    </div>

    <div class="palette-body">
      @for (group of visibleGroups(); track group) {
        <div class="palette-group">
          <div class="group-label">{{ group }}</div>
          @for (block of blocksInGroup(group); track block.type) {
            <button
              class="block-btn"
              (click)="onInsert(block)"
              [title]="'Insert ' + block.label + ' block'"
            >
              <span class="block-icon">{{ block.icon }}</span>
              <span class="block-label">{{ block.label }}</span>
            </button>
          }
        </div>
      }
    </div>

    @if (copied()) {
      <div class="copied-toast">Copied to clipboard!</div>
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #1e1e1e;
      color: #ccc;
      font-family: 'Consolas', monospace;
      font-size: 13px;
    }

    .palette-header {
      padding: 8px;
      border-bottom: 1px solid #333;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .palette-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #888;
    }

    .palette-search {
      background: #2d2d2d;
      border: 1px solid #444;
      color: #ccc;
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 12px;
      width: 100%;
      box-sizing: border-box;
    }

    .palette-search:focus {
      outline: none;
      border-color: #569cd6;
    }

    .palette-body {
      flex: 1;
      overflow-y: auto;
      padding: 4px;
    }

    .palette-group {
      margin-bottom: 4px;
    }

    .group-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #666;
      padding: 6px 6px 2px;
    }

    .block-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 5px 8px;
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

    .block-btn:hover {
      background: #2d2d2d;
      color: #fff;
    }

    .block-icon {
      width: 20px;
      text-align: center;
      font-size: 13px;
      flex-shrink: 0;
    }

    .block-label {
      flex: 1;
    }

    .copied-toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #4ec9b0;
      color: #000;
      padding: 6px 14px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      z-index: 1000;
      animation: fadeIn 0.15s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class BlockPalette {
  blockInserted = output<string>();

  searchQuery = '';
  private _searchSignal = signal('');
  copied = signal(false);
  private copyTimer: any;

  onSearchChange(q: string) {
    this._searchSignal.set(q.toLowerCase());
  }

  filteredBlocks = computed(() => {
    const q = this._searchSignal();
    if (!q) return BLOCK_TEMPLATES;
    return BLOCK_TEMPLATES.filter(
      (b) =>
        b.label.toLowerCase().includes(q) ||
        b.type.toLowerCase().includes(q) ||
        b.group.toLowerCase().includes(q)
    );
  });

  visibleGroups = computed(() => {
    const visible = new Set(this.filteredBlocks().map((b) => b.group));
    return BLOCK_GROUPS.filter((g) => visible.has(g));
  });

  blocksInGroup(group: string): BlockTemplate[] {
    return this.filteredBlocks().filter((b) => b.group === group);
  }

  onInsert(block: BlockTemplate) {
    const json = JSON.stringify(block.template, null, 2);
    this.blockInserted.emit(json);

    // Also copy to clipboard
    navigator.clipboard.writeText(json).then(() => {
      this.copied.set(true);
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    });
  }
}

import { Component, input, computed, output, inject, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SectionKey } from '../file-browser/file-browser';

@Component({
  selector: 'app-compose-preview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="preview-header">
      <span class="preview-label">Preview</span>
    </div>

    <div class="preview-scroll" (mouseup)="onMouseUp($event)">
      @if (!parsed()) {
        <div class="preview-empty">
          @if (content()) {
            <span class="parse-error">⚠ Invalid JSON</span>
          } @else {
            <span>No file open</span>
          }
        </div>
      } @else if (section() === 'blog' && parsed()?.content) {
        <!-- ── Blog article ── -->
        <div class="article-wrap">

          <!-- Hero image -->
          @if (parsed()?.heroImage?.src) {
            <img class="hero-img" [src]="parsed().heroImage.src" [alt]="parsed().heroImage.alt || ''" />
          } @else {
            <div class="hero-placeholder">
              {{ parsed()?.heroImage?.alt || 'Hero Image' }}
            </div>
          }

          <!-- Meta -->
          <div class="article-meta">
            @if (parsed()?.category) {
              <span class="category-badge">{{ parsed().category }}</span>
            }
            <h1 class="article-title">{{ parsed()?.title }}</h1>
            @if (parsed()?.description) {
              <p class="article-desc">{{ parsed().description }}</p>
            }
            <div class="article-byline">
              <span>{{ parsed()?.author?.name }}</span>
              @if (parsed()?.publishedDate) {
                <span class="byline-sep">·</span>
                <span>{{ parsed().publishedDate }}</span>
              }
              @if (parsed()?.readTime || parsed()?.readingTime) {
                <span class="byline-sep">·</span>
                <span>{{ parsed()?.readTime || parsed()?.readingTime }} min read</span>
              }
            </div>
          </div>

          <div class="content-blocks">
            @for (block of parsed()?.content; track $index) {
              <div class="block">
                @switch (block?.type) {

                  @case ('paragraph') {
                    <p class="block-para"
                       contenteditable="true"
                       (input)="onBlockTextInput($index, $event)"
                       (keydown.enter)="$event.preventDefault()"
                       [innerHTML]="block.data?.text"
                    ></p>
                  }

                  @case ('heading') {
                    @if (block.data?.level === 2) {
                      <h2 class="block-h" contenteditable="true"
                          (input)="onBlockTextInput($index, $event)"
                          (keydown.enter)="$event.preventDefault()">{{ block.data.text }}</h2>
                    }
                    @else if (block.data?.level === 3) {
                      <h3 class="block-h" contenteditable="true"
                          (input)="onBlockTextInput($index, $event)"
                          (keydown.enter)="$event.preventDefault()">{{ block.data.text }}</h3>
                    }
                    @else if (block.data?.level === 4) {
                      <h4 class="block-h" contenteditable="true"
                          (input)="onBlockTextInput($index, $event)"
                          (keydown.enter)="$event.preventDefault()">{{ block.data.text }}</h4>
                    }
                    @else {
                      <h5 class="block-h" contenteditable="true"
                          (input)="onBlockTextInput($index, $event)"
                          (keydown.enter)="$event.preventDefault()">{{ block.data?.text }}</h5>
                    }
                  }

                  @case ('blockquote') {
                    <blockquote class="block-quote">
                      <p contenteditable="true"
                         (input)="onBlockTextInput($index, $event)"
                         (keydown.enter)="$event.preventDefault()"
                         [innerHTML]="block.data?.text"></p>
                      @if (block.data?.citation) {
                        <cite>— {{ block.data.citation }}</cite>
                      }
                    </blockquote>
                  }

                  @case ('list') {
                    @if (block.data?.style === 'ordered') {
                      <ol class="block-list">
                        @for (item of block.data?.items; track $index) {
                          <li [innerHTML]="item"></li>
                        }
                      </ol>
                    } @else {
                      <ul class="block-list">
                        @for (item of block.data?.items; track $index) {
                          <li [innerHTML]="item"></li>
                        }
                      </ul>
                    }
                  }

                  @case ('code') {
                    <div class="block-code">
                      @if (block.data?.filename || block.data?.language) {
                        <div class="code-label">{{ block.data?.filename || block.data?.language }}</div>
                      }
                      <pre><code>{{ block.data?.code }}</code></pre>
                    </div>
                  }

                  @case ('image') {
                    <figure class="block-figure">
                      @if (block.data?.src) {
                        <img [src]="block.data.src" [alt]="block.data?.alt || ''" />
                      } @else {
                        <div class="img-placeholder">📷 {{ block.data?.alt || 'Image' }}</div>
                      }
                      @if (block.data?.caption) {
                        <figcaption>{{ block.data.caption }}</figcaption>
                      }
                    </figure>
                  }

                  @case ('gallery') {
                    <div class="block-placeholder">⊞ Gallery — {{ block.data?.images?.length || 0 }} images</div>
                  }

                  @case ('divider') {
                    <hr class="block-hr" />
                  }

                  @case ('cta') {
                    <div class="block-cta">
                      <strong>{{ block.data?.title }}</strong>
                      <p>{{ block.data?.description }}</p>
                      <a class="cta-link">{{ block.data?.buttonText }}</a>
                    </div>
                  }

                  @case ('affiliate') {
                    <div class="block-affiliate">
                      <div class="affiliate-name">{{ block.data?.name }}</div>
                      <p>{{ block.data?.description }}</p>
                      @if (block.data?.price) {
                        <span class="affiliate-price">{{ block.data.price }}</span>
                      }
                    </div>
                  }

                  @case ('video') {
                    <div class="block-placeholder">▶ Video: {{ block.data?.url || block.data?.title || 'YouTube embed' }}</div>
                  }

                  @case ('audio') {
                    <div class="block-placeholder">♪ Audio: {{ block.data?.title || block.data?.src || 'Audio player' }}</div>
                  }

                  @case ('adsense') {
                    <div class="block-placeholder ad-placeholder">$ AdSense Ad</div>
                  }

                  @case ('moviePoster') {
                    <div class="block-placeholder">🎬 Movie Poster{{ block.data?.alt ? ': ' + block.data.alt : '' }}</div>
                  }

                  @case ('movieRatings') {
                    <div class="block-placeholder">🍅 Movie Ratings: {{ block.data?.title }} ({{ block.data?.year }})</div>
                  }

                  @case ('businessRatings') {
                    <div class="block-placeholder">⭐ Business Ratings</div>
                  }

                  @case ('see-also') {
                    <div class="block-placeholder">↗ See Also: {{ seealsoIds(block.data?.items) }}</div>
                  }

                  @case ('related-tools') {
                    <div class="block-placeholder">🔧 Related Tools{{ block.data?.title ? ': ' + block.data.title : '' }}</div>
                  }

                  @case ('related-resources') {
                    <div class="block-placeholder">📚 Related Resources{{ block.data?.title ? ': ' + block.data.title : '' }}</div>
                  }

                  @case ('tool-showcase') {
                    <div class="block-placeholder">🛠 Tool Showcase: {{ block.data?.toolId }}</div>
                  }

                  @case ('component') {
                    <div class="block-placeholder">⚙ Component: {{ block.data?.componentName }}</div>
                  }

                  @default {
                    <div class="block-placeholder unknown">Unknown block type: {{ block?.type }}</div>
                  }
                }
              </div>
            }
          </div>
        </div>

      } @else {
        <!-- ── Resource / Artist or blog without content ── -->
        <div class="meta-card">
          @for (field of metaFields(); track field.key) {
            <div class="meta-row">
              <span class="meta-key">{{ field.key }}</span>
              <span class="meta-val"
                    [class.meta-val-editable]="field.editable"
                    [attr.contenteditable]="field.editable ? 'true' : null"
                    (input)="field.editable && onMetaFieldInput(field.key, $event)"
                    (keydown.enter)="$event.preventDefault()"
                    [innerHTML]="field.value"></span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #fff;
      color: #222;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 15px;
      overflow: hidden;
      border-left: 1px solid #ddd;
    }

    .preview-header {
      display: flex;
      align-items: center;
      padding: 0 12px;
      height: 36px;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
      flex-shrink: 0;
    }

    .preview-label {
      font-family: 'Consolas', monospace;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #888;
    }

    .preview-scroll {
      flex: 1;
      overflow-y: auto;
    }

    .preview-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #aaa;
      font-family: 'Consolas', monospace;
      font-size: 13px;
    }

    .parse-error { color: #e00; }

    /* ── Article layout ── */
    .article-wrap {
      max-width: 680px;
      margin: 0 auto;
      padding: 24px 20px 60px;
    }

    .hero-img {
      width: 100%;
      height: 200px;
      object-fit: cover;
      border-radius: 6px;
      margin-bottom: 20px;
    }

    .hero-placeholder {
      width: 100%;
      height: 160px;
      background: #eee;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #aaa;
      font-family: sans-serif;
      font-size: 13px;
      margin-bottom: 20px;
    }

    .article-meta { margin-bottom: 28px; }

    .category-badge {
      display: inline-block;
      background: #0066cc;
      color: #fff;
      font-family: sans-serif;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 8px;
      border-radius: 3px;
      margin-bottom: 10px;
    }

    .article-title {
      font-size: 26px;
      font-weight: 700;
      line-height: 1.25;
      margin: 0 0 10px;
      color: #111;
    }

    .article-desc {
      font-size: 16px;
      color: #555;
      line-height: 1.5;
      margin: 0 0 12px;
      font-family: sans-serif;
    }

    .article-byline {
      font-family: sans-serif;
      font-size: 13px;
      color: #888;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .byline-sep { color: #ccc; }

    /* ── Content blocks ── */
    .block { margin-bottom: 18px; }

    .block-para {
      margin: 0;
      line-height: 1.7;
      color: #333;
    }

    .block-h {
      font-weight: 700;
      color: #111;
      margin: 0;
      line-height: 1.3;
    }

    h2.block-h { font-size: 22px; }
    h3.block-h { font-size: 19px; }
    h4.block-h { font-size: 16px; }
    h5.block-h { font-size: 14px; }

    .block-quote {
      border-left: 4px solid #0066cc;
      margin: 0;
      padding: 8px 16px;
      background: #f8f8f8;
      border-radius: 0 4px 4px 0;
    }

    .block-quote p { margin: 0 0 6px; color: #444; font-style: italic; }
    .block-quote cite { font-size: 13px; color: #888; font-style: normal; font-family: sans-serif; }

    .block-list {
      padding-left: 24px;
      line-height: 1.7;
      color: #333;
    }

    .block-list li { margin-bottom: 4px; }

    .block-code {
      background: #1e1e1e;
      border-radius: 6px;
      overflow: hidden;
    }

    .code-label {
      background: #333;
      color: #888;
      font-family: 'Consolas', monospace;
      font-size: 11px;
      padding: 4px 12px;
    }

    .block-code pre {
      margin: 0;
      padding: 14px;
      overflow-x: auto;
    }

    .block-code code {
      color: #d4d4d4;
      font-family: 'Consolas', monospace;
      font-size: 12px;
      line-height: 1.6;
    }

    .block-figure { margin: 0; }
    .block-figure img { width: 100%; border-radius: 4px; }
    .block-figure figcaption { font-size: 12px; color: #888; text-align: center; margin-top: 6px; font-family: sans-serif; }

    .img-placeholder {
      background: #eee;
      height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      color: #aaa;
      font-family: sans-serif;
      font-size: 13px;
    }

    .block-hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 8px 0;
    }

    .block-cta {
      background: #f0f7ff;
      border: 1px solid #b3d4f5;
      border-radius: 8px;
      padding: 16px 20px;
    }

    .block-cta strong { font-size: 16px; color: #111; font-family: sans-serif; }
    .block-cta p { color: #555; margin: 6px 0 10px; font-family: sans-serif; font-size: 14px; }

    .cta-link {
      display: inline-block;
      background: #0066cc;
      color: #fff;
      padding: 6px 16px;
      border-radius: 4px;
      font-family: sans-serif;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
    }

    .block-affiliate {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 14px 18px;
    }

    .affiliate-name { font-weight: 700; font-size: 15px; color: #111; font-family: sans-serif; margin-bottom: 6px; }
    .block-affiliate p { color: #555; font-family: sans-serif; font-size: 14px; margin: 0 0 8px; }
    .affiliate-price { font-family: sans-serif; font-size: 14px; font-weight: 700; color: #c00; }

    /* Placeholders for non-rendered blocks */
    .block-placeholder {
      background: #f5f5f5;
      border: 1px dashed #ccc;
      border-radius: 4px;
      padding: 8px 14px;
      color: #888;
      font-family: 'Consolas', monospace;
      font-size: 12px;
    }

    .ad-placeholder { background: #fff8e8; border-color: #f0c040; color: #a06000; }
    .unknown { background: #fff0f0; border-color: #f0a0a0; color: #c00; }

    /* ── Resource / Artist meta card ── */
    .meta-card {
      padding: 20px;
      font-family: sans-serif;
      font-size: 13px;
    }

    .meta-row {
      display: flex;
      gap: 10px;
      padding: 6px 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .meta-key {
      width: 140px;
      flex-shrink: 0;
      color: #888;
      font-weight: 600;
      font-size: 12px;
    }

    .meta-val {
      flex: 1;
      color: #222;
      word-break: break-word;
    }

    /* ── Inline editing ── */
    [contenteditable] {
      outline: none;
      border-radius: 3px;
      cursor: text;
      transition: background 0.12s, box-shadow 0.12s;
    }

    [contenteditable]:hover {
      background: rgba(0, 102, 204, 0.05);
    }

    [contenteditable]:focus {
      background: rgba(0, 102, 204, 0.07);
      box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.22);
    }

    .meta-val-editable { cursor: text; }
  `],
})
export class ComposePreview {
  content = input<string>('');
  section = input<SectionKey>('blog');

  previewClick = output<{ text: string; offset: number }>();
  previewSelect = output<string>();
  contentChange = output<string>();

  private el = inject(ElementRef<HTMLElement>);

  parsed = computed<any>(() => {
    const raw = this.content();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  /** Flat key-value rows for resources / artists */
  metaFields = computed<{ key: string; value: string; editable: boolean }[]>(() => {
    const obj = this.parsed();
    if (!obj || typeof obj !== 'object') return [];

    const SKIP = new Set(['content', 'metaKeywords', 'keywords', 'youtubeVideos']);
    return Object.entries(obj)
      .filter(([k]) => !SKIP.has(k))
      .map(([k, v]) => ({
        key: k,
        value: Array.isArray(v)
          ? (v as any[]).join(', ')
          : typeof v === 'object' && v !== null
          ? JSON.stringify(v)
          : String(v ?? ''),
        editable: typeof v === 'string',
      }));
  });

  /** Scroll the preview to the first occurrence of `text`. */
  scrollToText(text: string): void {
    if (!text) return;
    const container = (this.el.nativeElement as HTMLElement).querySelector('.preview-scroll');
    if (!container) return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if ((node.textContent ?? '').includes(text)) {
        (node as Text).parentElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        break;
      }
    }
  }

  /** Find `text` in the rendered preview DOM and select it with the browser selection. */
  selectPreviewText(text: string): void {
    if (!text) return;
    const container = (this.el.nativeElement as HTMLElement).querySelector('.preview-scroll');
    if (!container) return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const content = node.textContent ?? '';
      const idx = content.indexOf(text);
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + text.length);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        (node as Text).parentElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        break;
      }
    }
  }

  onBlockTextInput(blockIndex: number, event: Event): void {
    const el = event.target as HTMLElement;
    const newText = el.innerText;
    const obj = structuredClone(this.parsed());
    if (!obj?.content?.[blockIndex]?.data) return;
    obj.content[blockIndex].data.text = newText;
    this.contentChange.emit(JSON.stringify(obj, null, 2));
  }

  onMetaFieldInput(key: string, event: Event): void {
    const el = event.target as HTMLElement;
    const newValue = el.innerText;
    const obj = structuredClone(this.parsed());
    if (!obj || typeof obj[key] !== 'string') return;
    obj[key] = newValue;
    this.contentChange.emit(JSON.stringify(obj, null, 2));
  }

  onMouseUp(event: MouseEvent): void {
    // Don't sync clicks/selections inside editable elements back to Monaco
    if ((event.target as HTMLElement)?.isContentEditable) return;

    setTimeout(() => {
      const sel = window.getSelection();
      const selectedText = sel?.toString() ?? '';

      if (selectedText.trim()) {
        this.previewSelect.emit(selectedText);
        return;
      }

      let text = '';
      let offset = 0;

      const caretRange = (document as any).caretRangeFromPoint?.(event.clientX, event.clientY);
      const caretPos   = !caretRange ? (document as any).caretPositionFromPoint?.(event.clientX, event.clientY) : null;

      const node: Node | null = caretRange?.startContainer ?? caretPos?.offsetNode ?? null;
      const rawOffset: number = caretRange?.startOffset ?? caretPos?.offset ?? 0;

      if (node?.nodeType === Node.TEXT_NODE && node.parentElement) {
        const parent = node.parentElement;
        let acc = 0;
        for (const child of Array.from(parent.childNodes)) {
          if (child === node) { offset = acc + rawOffset; break; }
          acc += child.textContent?.length ?? 0;
        }
        text = parent.textContent?.trim() ?? '';
      }

      if (text) {
        this.previewClick.emit({ text, offset });
      }
    }, 0);
  }

  seealsoIds(items: any[]): string {
    if (!Array.isArray(items)) return '';
    return items.map((i) => i?.id ?? '?').join(', ');
  }
}

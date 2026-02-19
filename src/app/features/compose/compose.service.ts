import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface FileEntry {
  filename: string;
  slug: string;
  relativePath: string;
  mtime: string;
  size: number;
  isIndex?: boolean;
}

export interface GitStatus {
  dirty: boolean;
  files: string[];
}

export interface DeployResult {
  success: boolean;
  message: string;
  files?: string[];
  error?: string;
}

export interface ServerConfig {
  netlifyToken: string;     // masked: "***xxxx"
  netlifySiteId: string;
  mainSiteBuildHook: string;
}

export interface PullStatus {
  running: boolean;
  lastPulledAt: string | null;
  counts: { blog?: number; resources?: number; artists?: number };
  contentExists: boolean;
}

export interface PullResult {
  success: boolean;
  message: string;
  counts: { blog: number; resources: number; artists: number };
  lastPulledAt: string;
}

const COMPOSE_API = 'http://localhost:3001/api';

@Injectable({ providedIn: 'root' })
export class ComposeService {
  private http = inject(HttpClient);

  listFiles(section: string): Observable<FileEntry[]> {
    return this.http.get<FileEntry[]>(`${COMPOSE_API}/files/${section}`);
  }

  readFile(relativePath: string): Observable<{ content: string }> {
    return this.http.get<{ content: string }>(
      `${COMPOSE_API}/file?path=${encodeURIComponent(relativePath)}`
    );
  }

  writeFile(relativePath: string, content: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${COMPOSE_API}/file`, {
      path: relativePath,
      content,
    });
  }

  deleteFile(relativePath: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${COMPOSE_API}/file?path=${encodeURIComponent(relativePath)}`
    );
  }

  deploy(message: string): Observable<DeployResult> {
    return this.http.post<DeployResult>(`${COMPOSE_API}/deploy`, { message });
  }

  rebuild(): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${COMPOSE_API}/rebuild`, {});
  }

  getServerConfig(): Observable<ServerConfig> {
    return this.http.get<ServerConfig>(`${COMPOSE_API}/config`);
  }

  saveServerConfig(config: Partial<ServerConfig>): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${COMPOSE_API}/config`, config);
  }

  getPullStatus(): Observable<PullStatus> {
    return this.http.get<PullStatus>(`${COMPOSE_API}/pull-status`);
  }

  pullFromCDN(): Observable<PullResult> {
    return this.http.post<PullResult>(`${COMPOSE_API}/pull`, {});
  }
}

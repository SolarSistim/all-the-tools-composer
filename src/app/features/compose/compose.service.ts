import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface FileEntry {
  filename: string;
  slug: string;
  relativePath: string;
  mtime: string;
  size: number;
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

  deploy(message: string): Observable<DeployResult> {
    return this.http.post<DeployResult>(`${COMPOSE_API}/deploy`, { message });
  }

  getServerConfig(): Observable<ServerConfig> {
    return this.http.get<ServerConfig>(`${COMPOSE_API}/config`);
  }

  saveServerConfig(config: Partial<ServerConfig>): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${COMPOSE_API}/config`, config);
  }
}

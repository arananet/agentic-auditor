import { AuditorService } from './auditor.service';
import { AuditResponse } from '../types';

export interface Job {
  id: string;
  url: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: AuditResponse;
  error?: string;
  createdAt: number;
}

class QueueManager {
  private jobs: Map<string, Job> = new Map();
  private queue: string[] = [];
  private isProcessing = false;
  private auditor = new AuditorService();

  addJob(url: string): string {
    const id = Math.random().toString(36).substring(2, 15);
    this.jobs.set(id, {
      id,
      url,
      status: 'queued',
      createdAt: Date.now()
    });
    this.queue.push(id);
    this.processQueue();
    return id;
  }

  getJobStatus(id: string) {
    const job = this.jobs.get(id);
    if (!job) return null;
    
    // Position is 1-indexed. If processing, position is 0.
    const position = job.status === 'queued' ? this.queue.indexOf(id) + 1 : 0;
    return { ...job, position, queueLength: this.queue.length };
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const id = this.queue.shift()!;
      const job = this.jobs.get(id);
      if (!job) continue;

      job.status = 'processing';
      
      try {
        const result = await this.auditor.runAudit(job.url);
        job.status = 'completed';
        job.result = result;
      } catch (error: any) {
        job.status = 'failed';
        job.error = error.message;
      }
      
      // Keep jobs in memory for 15 minutes max to prevent memory leaks
      setTimeout(() => {
        this.jobs.delete(id);
      }, 15 * 60 * 1000);
    }

    this.isProcessing = false;
  }
}

// Global singleton
export const globalQueue = new QueueManager();

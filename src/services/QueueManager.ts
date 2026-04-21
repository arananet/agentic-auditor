import { AuditorService } from './auditor.service';
import { AuditResponse } from '../types';

export interface Job {
  id: string;
  url: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: AuditResponse;
  error?: string;
  createdAt: number;
  /** Live log lines streamed as each audit step completes */
  log: string[];
  /** Base64 PNG — first capture right after page load */
  screenshotInitial?: string;
  /** Base64 PNG — final page the auditor actually analyzed */
  screenshotFinal?: string;
}

const MAX_QUEUE_SIZE = 50;

class QueueManager {
  private jobs: Map<string, Job> = new Map();
  private queue: string[] = [];
  private isProcessing = false;
  private auditor = new AuditorService();

  addJob(url: string): string {
    // URL deduplication: if the same URL is already queued or processing, return existing job
    const existing = Array.from(this.jobs.entries()).find(
      ([, job]) => job.url === url && (job.status === 'queued' || job.status === 'processing')
    );
    if (existing) return existing[0];

    if (this.queue.length >= MAX_QUEUE_SIZE) {
      throw new Error('Queue is full. Please try again later.');
    }

    const id = Math.random().toString(36).substring(2, 15);
    this.jobs.set(id, {
      id,
      url,
      status: 'queued',
      createdAt: Date.now(),
      log: []
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
        const result = await this.auditor.runAudit(
          job.url,
          (msg) => { job.log.push(msg); },
          (key, data) => {
            if (key === 'initial') job.screenshotInitial = data;
            else job.screenshotFinal = data;
          }
        );
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

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export type EmailStatus = 'scheduled' | 'processing' | 'sent' | 'failed';

export interface EmailItem {
  id: string;
  userId: string;
  batchId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt: string | null;
  status: EmailStatus;
  attempts: number;
  errorMessage: string | null;
  messageId: string | null;
  previewUrl: string | null;
  enqueuedAt: string | null;
  processingStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender?: {
    email: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

export interface ScheduleRequest {
  subject: string;
  body: string;
  recipients: string[];
  startAt: string; // ISO string in UTC
  delayMs: number;
  hourlyLimit: number;
}

export interface ScheduleResponse {
  batchId: string;
  count: number;
}

export interface ApiError {
  message: string;
  details?: Array<{ field: string; message: string }>;
}

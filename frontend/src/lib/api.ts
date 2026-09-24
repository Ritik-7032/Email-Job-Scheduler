import {
  User,
  EmailItem,
  PaginatedResponse,
  ScheduleRequest,
  ScheduleResponse,
  ApiError,
} from '../types/index.ts';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit & { timeoutMs?: number } = {}
  ): Promise<T> {
    const { timeoutMs = 6000, ...fetchOptions } = options;
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const config: RequestInit = {
        ...fetchOptions,
        signal: controller.signal,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
        },
      };

      const res = await fetch(url, config);
      clearTimeout(timeoutId);

      if (!res.ok) {
        let errorData: { error?: ApiError } | null = null;
        try {
          errorData = await res.json();
        } catch {
          // Fallback for non-JSON error bodies
        }

        let message =
          errorData?.error?.message ||
          `Request failed with status ${res.status}: ${res.statusText}`;

        if (errorData?.error?.details && errorData.error.details.length > 0) {
          message = errorData.error.details.map((d) => d.message).join('. ');
        }

        const error: Error & {
          details?: Array<{ field: string; message: string }>;
          status?: number;
        } = new Error(message);
        error.details = errorData?.error?.details;
        error.status = res.status;
        throw error;
      }

      return res.json();
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  // Auth Endpoints
  async getMe(): Promise<User> {
    return this.request<User>('/api/auth/me', { timeoutMs: 5000 });
  }

  async logout(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      '/api/auth/logout',
      {
        method: 'POST',
      }
    );
  }

  // Email Scheduling Endpoints
  async scheduleEmails(data: ScheduleRequest): Promise<ScheduleResponse> {
    return this.request<ScheduleResponse>('/api/emails/schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getScheduledEmails(
    limit = 50,
    offset = 0
  ): Promise<PaginatedResponse<EmailItem>> {
    return this.request<PaginatedResponse<EmailItem>>(
      `/api/emails/scheduled?limit=${limit}&offset=${offset}`
    );
  }

  async getSentEmails(
    limit = 50,
    offset = 0
  ): Promise<PaginatedResponse<EmailItem>> {
    return this.request<PaginatedResponse<EmailItem>>(
      `/api/emails/sent?limit=${limit}&offset=${offset}`
    );
  }
}

export const api = new ApiClient();

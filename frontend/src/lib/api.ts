import {
  User,
  EmailItem,
  PaginatedResponse,
  ScheduleRequest,
  ScheduleResponse,
  ApiError,
} from '../types/index.ts';

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const config: RequestInit = {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const res = await fetch(endpoint, config);

    if (!res.ok) {
      let errorData: { error?: ApiError } | null = null;
      try {
        errorData = await res.json();
      } catch {
        // Fallback for non-JSON error bodies
      }

      const message =
        errorData?.error?.message ||
        `Request failed with status ${res.status}: ${res.statusText}`;

      const error: Error & {
        details?: Array<{ field: string; message: string }>;
        status?: number;
      } = new Error(message);
      error.details = errorData?.error?.details;
      error.status = res.status;
      throw error;
    }

    return res.json();
  }

  // Auth Endpoints
  async getMe(): Promise<User> {
    return this.request<User>('/api/auth/me');
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

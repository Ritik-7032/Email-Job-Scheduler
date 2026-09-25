import {
  User,
  EmailItem,
  PaginatedResponse,
  ScheduleRequest,
  ScheduleResponse,
  ApiError,
} from '../types/index.ts';

class ApiClient {
  private getBaseUrl(): string {
    return (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
  }

  getToken(): string | null {
    return localStorage.getItem('reachinbox_auth_token');
  }

  setToken(token: string): void {
    localStorage.setItem('reachinbox_auth_token', token);
  }

  clearToken(): void {
    localStorage.removeItem('reachinbox_auth_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
    const token = this.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string>),
    };

    const config: RequestInit = {
      ...options,
      credentials: 'include',
      headers,
    };

    const res = await fetch(url, config);

    if (!res.ok) {
      let errorData: { error?: ApiError } | null = null;
      try {
        errorData = await res.json();
      } catch {
        
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
  }
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

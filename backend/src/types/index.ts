import { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export interface ScheduleJobData {
  emailId: string;
}

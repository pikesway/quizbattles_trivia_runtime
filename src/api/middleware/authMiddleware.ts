import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export interface AdminProfile {
  id: string;
  auth_user_id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'editor' | 'reviewer';
  is_active: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email?: string;
  };
  adminProfile: AdminProfile;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: { user }, error } = await supabaseAuth.auth.getUser();

    if (error || !user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      });
      return;
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    const { data: adminProfile, error: profileError } = await supabaseService
      .from('trivia_admin_users')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (profileError) {
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to verify admin status' },
      });
      return;
    }

    if (!adminProfile) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not authorized for admin access' },
      });
      return;
    }

    if (!adminProfile.is_active) {
      res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_DEACTIVATED', message: 'Your admin account has been deactivated' },
      });
      return;
    }

    (req as AuthenticatedRequest).user = user;
    (req as AuthenticatedRequest).adminProfile = adminProfile;
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication failed' },
    });
  }
}

export function requireAdminRole(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.adminProfile || authReq.adminProfile.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'This action requires administrator privileges' },
    });
    return;
  }

  next();
}

export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string;
  const expectedApiKey = process.env.WEBHOOK_API_KEY;

  if (!expectedApiKey) {
    res.status(500).json({
      success: false,
      error: { code: 'CONFIG_ERROR', message: 'Webhook API key not configured' },
    });
    return;
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
    });
    return;
  }

  next();
}

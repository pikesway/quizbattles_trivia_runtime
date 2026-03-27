import { Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { successResponse, errorResponse } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export class UserController {
  private supabase = createClient(supabaseUrl, supabaseServiceKey);

  async listUsers(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('trivia_admin_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.json(successResponse(data || []));
    } catch (err) {
      res.status(500).json(errorResponse('SERVER_ERROR', (err as Error).message));
    }
  }

  async getUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const { data, error } = await this.supabase
        .from('trivia_admin_users')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        res.status(404).json(errorResponse('NOT_FOUND', 'User not found'));
        return;
      }

      res.json(successResponse(data));
    } catch (err) {
      res.status(500).json(errorResponse('SERVER_ERROR', (err as Error).message));
    }
  }

  async updateUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { display_name, role } = req.body;
      const currentUser = req.adminProfile;

      if (id === currentUser.id && role && role !== currentUser.role) {
        res.status(400).json(errorResponse('INVALID_REQUEST', 'Cannot change your own role'));
        return;
      }

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (display_name !== undefined) updateData.display_name = display_name;
      if (role !== undefined) {
        if (!['admin', 'editor', 'reviewer'].includes(role)) {
          res.status(400).json(errorResponse('INVALID_REQUEST', 'Invalid role'));
          return;
        }
        updateData.role = role;
      }

      const { data, error } = await this.supabase
        .from('trivia_admin_users')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      res.json(successResponse(data));
    } catch (err) {
      res.status(500).json(errorResponse('SERVER_ERROR', (err as Error).message));
    }
  }

  async deactivateUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const currentUser = req.adminProfile;

      if (id === currentUser.id) {
        res.status(400).json(errorResponse('INVALID_REQUEST', 'Cannot deactivate your own account'));
        return;
      }

      const { data, error } = await this.supabase
        .from('trivia_admin_users')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      res.json(successResponse(data));
    } catch (err) {
      res.status(500).json(errorResponse('SERVER_ERROR', (err as Error).message));
    }
  }

  async activateUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const { data, error } = await this.supabase
        .from('trivia_admin_users')
        .update({
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      res.json(successResponse(data));
    } catch (err) {
      res.status(500).json(errorResponse('SERVER_ERROR', (err as Error).message));
    }
  }

  async createUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { email, display_name, role, password } = req.body;

      if (!email || !password || !display_name) {
        res.status(400).json(errorResponse('INVALID_REQUEST', 'email, password, and display_name are required'));
        return;
      }

      if (role && !['admin', 'editor', 'reviewer'].includes(role)) {
        res.status(400).json(errorResponse('INVALID_REQUEST', 'Invalid role'));
        return;
      }

      const { data: existingUser } = await this.supabase
        .from('trivia_admin_users')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (existingUser) {
        res.status(400).json(errorResponse('DUPLICATE_EMAIL', 'A user with this email already exists'));
        return;
      }

      const { data: authData, error: authError } = await this.supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) throw authError;

      const { data: adminUser, error: profileError } = await this.supabase
        .from('trivia_admin_users')
        .insert({
          auth_user_id: authData.user.id,
          email: email.toLowerCase(),
          display_name,
          role: role || 'editor',
          is_active: true,
        })
        .select()
        .single();

      if (profileError) throw profileError;

      res.status(201).json(successResponse(adminUser));
    } catch (err) {
      res.status(500).json(errorResponse('SERVER_ERROR', (err as Error).message));
    }
  }
}

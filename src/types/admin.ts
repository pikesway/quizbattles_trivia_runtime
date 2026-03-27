export interface AdminProfile {
  id: string;
  auth_user_id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'editor' | 'reviewer';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type AdminRole = AdminProfile['role'];

import { useState, useEffect } from 'react';
import { Plus, Search, Archive, Copy, CreditCard as Edit2, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Shell {
  id: string;
  internal_name: string;
  slug: string;
  status: string;
  visibility: string;
  topic: string;
  tags: string[];
  default_question_count: number;
  created_at: string;
  updated_at: string;
}

interface ShellListProps {
  onSelectShell: (shell: Shell) => void;
  onCreateShell: () => void;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  ready: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  archived: 'bg-red-100 text-red-700',
};

const visibilityLabels: Record<string, string> = {
  global: 'Global',
  tier_1: 'Tier 1',
  tier_2: 'Tier 2',
  tier_3: 'Tier 3',
  client_specific: 'Client',
  internal_only: 'Internal',
};

export function ShellList({ onSelectShell, onCreateShell }: ShellListProps) {
  const [shells, setShells] = useState<Shell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('');

  useEffect(() => {
    loadShells();
  }, [statusFilter, visibilityFilter]);

  async function loadShells() {
    setLoading(true);
    try {
      let query = supabase
        .from('trivia_shells')
        .select('*')
        .order('updated_at', { ascending: false });

      if (statusFilter) query = query.eq('status', statusFilter);
      if (visibilityFilter) query = query.eq('visibility', visibilityFilter);

      const { data, error } = await query;
      if (error) throw error;
      setShells(data || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function archiveShell(e: React.MouseEvent, shell: Shell) {
    e.stopPropagation();
    if (!confirm(`Archive "${shell.internal_name}"?`)) return;

    try {
      const { error } = await supabase
        .from('trivia_shells')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', shell.id);

      if (error) throw error;
      loadShells();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function cloneShell(e: React.MouseEvent, shell: Shell) {
    e.stopPropagation();
    const newName = prompt('Enter name for cloned shell:', `${shell.internal_name} (Copy)`);
    if (!newName) return;

    const newSlug = prompt('Enter slug for cloned shell:', `${shell.slug}-copy`);
    if (!newSlug) return;

    try {
      const { data: existing } = await supabase
        .from('trivia_shells')
        .select('*')
        .eq('id', shell.id)
        .single();

      if (!existing) throw new Error('Shell not found');

      const { error } = await supabase.from('trivia_shells').insert({
        internal_name: newName,
        slug: newSlug,
        status: 'draft',
        visibility: existing.visibility,
        topic: existing.topic,
        tags: existing.tags,
        default_selection_mode: existing.default_selection_mode,
        default_question_count: existing.default_question_count,
        default_difficulty_mix: existing.default_difficulty_mix,
        default_timer_mode: existing.default_timer_mode,
        default_timer_seconds: existing.default_timer_seconds,
        is_start_screen_enabled: existing.is_start_screen_enabled,
        is_lead_screen_enabled: existing.is_lead_screen_enabled,
        config: existing.config,
      });

      if (error) throw error;
      loadShells();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  const filteredShells = shells.filter(shell =>
    shell.internal_name.toLowerCase().includes(search.toLowerCase()) ||
    shell.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4 sm:mb-0">Trivia Shells</h1>
        <button
          onClick={onCreateShell}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Shell
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search shells..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="relative">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="appearance-none pl-4 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={visibilityFilter}
                onChange={e => setVisibilityFilter(e.target.value)}
                className="appearance-none pl-4 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">All Visibility</option>
                <option value="global">Global</option>
                <option value="tier_1">Tier 1</option>
                <option value="tier_2">Tier 2</option>
                <option value="tier_3">Tier 3</option>
                <option value="client_specific">Client Specific</option>
                <option value="internal_only">Internal Only</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">{error}</div>
        ) : filteredShells.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No shells found</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredShells.map(shell => (
              <div
                key={shell.id}
                onClick={() => onSelectShell(shell)}
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-gray-900 truncate">
                        {shell.internal_name}
                      </h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[shell.status]}`}>
                        {shell.status}
                      </span>
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                        {visibilityLabels[shell.visibility]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 truncate">
                      /{shell.slug} {shell.topic && `| ${shell.topic}`}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {shell.default_question_count} questions | Updated {new Date(shell.updated_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 ml-4">
                    <button
                      onClick={e => { e.stopPropagation(); onSelectShell(shell); }}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={e => cloneShell(e, shell)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                      title="Clone"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {shell.status !== 'archived' && (
                      <button
                        onClick={e => archiveShell(e, shell)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Archive"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

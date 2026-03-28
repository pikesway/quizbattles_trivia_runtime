import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Save, AlertTriangle, CheckCircle, Smartphone, RefreshCw, XCircle, Play, Link2, X, ChevronDown, ChevronUp, Maximize2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../../lib/supabase';
import { ImageInput } from './ImageInput';
import { ScreensEditor } from './ScreensEditor';

interface ValidationIssue {
  code: string;
  message: string;
  field?: string;
}

interface QuestionSupplyHealth {
  total_approved: number;
  by_difficulty: { easy: number; medium: number; hard: number };
  needed: { easy: number; medium: number; hard: number; total: number };
  sufficient: boolean;
  shortages: { easy: number; medium: number; hard: number };
}

interface ValidationData {
  validation: {
    is_valid: boolean;
    blocking_errors: ValidationIssue[];
    warnings: ValidationIssue[];
  };
  question_supply: QuestionSupplyHealth;
  mobile_fit_warnings: Array<{ question_id: string; field: string; message: string }>;
}

type LeadFormFieldType = 'name' | 'email' | 'phone' | 'text';

interface LeadFormField {
  type: LeadFormFieldType;
  label: string;
  placeholder: string;
  required: boolean;
  enabled: boolean;
}

interface LeadFormTermsConfig {
  enabled: boolean;
  text: string;
  required: boolean;
}

interface LeadFormConfig {
  headline: string;
  fields: LeadFormField[];
  terms: LeadFormTermsConfig;
  submit_label: string;
}

interface Shell {
  id: string;
  internal_name: string;
  slug: string;
  status: string;
  visibility: string;
  topic: string;
  tags: string[];
  default_selection_mode: string;
  default_question_count: number;
  default_difficulty_mix: { easy: number; medium: number; hard: number };
  default_timer_mode: string;
  default_timer_seconds: number;
  is_start_screen_enabled: boolean;
  is_lead_screen_enabled: boolean;
  config: {
    theme: {
      font_family: string;
      primary_text_color: string;
      secondary_text_color: string;
      button_fill_color: string;
      button_text_color: string;
      overlay_tint: string;
      correct_feedback_accent: string;
      incorrect_feedback_accent: string;
    };
    backgrounds: {
      default: string;
      start: string | null;
      lead: string | null;
      game: string | null;
      end: string | null;
    };
    screens: {
      start: { headline: string; body: string; button_label: string };
      lead: LeadFormConfig;
      game: { show_progress_bar: boolean; show_question_number: boolean; spacing?: 'compact' | 'comfortable' | 'spacious' };
      end: { headline_template: string; show_score_breakdown: boolean; cta?: { enabled: boolean; label: string }; social_share?: { enabled: boolean; share_text_template: string; share_image_url: string; hashtags: string[]; fallback_url: string } };
      feedback: { correct_headline: string; incorrect_headline: string; show_explanation: boolean };
    };
    score_range_messages: Array<{ min: number; max: number; message: string }>;
  };
}

interface ShellEditorProps {
  shell: Shell | null;
  onBack: () => void;
  onSave: () => void;
}

const APPROVED_FONTS = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
  'Poppins', 'Source Sans Pro', 'Nunito', 'Raleway', 'Work Sans'
];

const DIFFICULTY_PRESETS = {
  balanced: { easy: 20, medium: 60, hard: 20 },
  easier: { easy: 40, medium: 50, hard: 10 },
  harder: { easy: 10, medium: 50, hard: 40 },
};

type TabId = 'basics' | 'defaults' | 'theme' | 'screens' | 'preview' | 'validation';

interface TopicOption {
  topic: string;
  count: number;
}

interface TagOption {
  tag: string;
  count: number;
}

export function ShellEditor({ shell, onBack, onSave }: ShellEditorProps) {
  const [activeTab, setActiveTab] = useState<TabId>('basics');
  const [formData, setFormData] = useState<Partial<Shell>>({});
  const [saving, setSaving] = useState(false);
  const [previewScreen, setPreviewScreen] = useState<'start' | 'game' | 'end'>('start');
  const [validationData, setValidationData] = useState<ValidationData | null>(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showDifficultyAdvanced, setShowDifficultyAdvanced] = useState(false);
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [showTestLinkModal, setShowTestLinkModal] = useState(false);
  const [testToken, setTestToken] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [availableTopics, setAvailableTopics] = useState<TopicOption[]>([]);
  const [availableTags, setAvailableTags] = useState<TagOption[]>([]);
  const [matchingQuestionCount, setMatchingQuestionCount] = useState<number | null>(null);
  const [loadingMatchCount, setLoadingMatchCount] = useState(false);

  const fetchValidation = useCallback(async () => {
    if (!shell?.id) return;

    setValidationLoading(true);
    setValidationError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch(`${supabaseUrl}/functions/v1/admin-shells/${shell.id}/validate`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || 'Failed to fetch validation data');
      }

      const result = await response.json();
      if (result.success) {
        setValidationData(result.data);
      } else {
        throw new Error(result.error?.message || 'Validation failed');
      }
    } catch (err) {
      setValidationError((err as Error).message);
    } finally {
      setValidationLoading(false);
    }
  }, [shell?.id]);

  useEffect(() => {
    if (activeTab === 'validation' && shell?.id) {
      fetchValidation();
    }
  }, [activeTab, shell?.id, fetchValidation]);

  useEffect(() => {
    async function fetchTopicsAndTags() {
      const { data: topicData } = await supabase
        .from('trivia_questions')
        .select('topic')
        .eq('is_active', true)
        .eq('review_state', 'approved')
        .not('topic', 'is', null)
        .neq('topic', '');

      if (topicData) {
        const topicCounts = topicData.reduce((acc: Record<string, number>, row) => {
          const t = row.topic as string;
          acc[t] = (acc[t] || 0) + 1;
          return acc;
        }, {});
        const topics = Object.entries(topicCounts)
          .map(([topic, count]) => ({ topic, count }))
          .sort((a, b) => a.topic.localeCompare(b.topic));
        setAvailableTopics(topics);
      }

      const { data: tagData } = await supabase
        .from('trivia_questions')
        .select('tags')
        .eq('is_active', true)
        .eq('review_state', 'approved')
        .not('tags', 'is', null);

      if (tagData) {
        const tagCounts: Record<string, number> = {};
        tagData.forEach(row => {
          const tags = row.tags as string[];
          if (tags) {
            tags.forEach(tag => {
              tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
          }
        });
        const tags = Object.entries(tagCounts)
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => a.tag.localeCompare(b.tag));
        setAvailableTags(tags);
      }
    }
    fetchTopicsAndTags();
  }, []);

  useEffect(() => {
    async function fetchMatchingCount() {
      const topic = formData.topic;
      const tags = formData.tags || [];

      if (!topic && tags.length === 0) {
        setMatchingQuestionCount(null);
        return;
      }

      setLoadingMatchCount(true);
      try {
        let query = supabase
          .from('trivia_questions')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('review_state', 'approved');

        if (topic) {
          query = query.eq('topic', topic);
        }
        if (tags.length > 0) {
          query = query.overlaps('tags', tags);
        }

        const { count } = await query;
        setMatchingQuestionCount(count || 0);
      } catch {
        setMatchingQuestionCount(null);
      } finally {
        setLoadingMatchCount(false);
      }
    }
    fetchMatchingCount();
  }, [formData.topic, formData.tags]);

  useEffect(() => {
    if (shell) {
      setFormData(shell);
      loadExistingToken(shell.id);
    } else {
      setFormData({
        internal_name: '',
        slug: '',
        status: 'draft',
        visibility: 'internal_only',
        topic: '',
        tags: [],
        default_selection_mode: 'random_per_play',
        default_question_count: 10,
        default_difficulty_mix: { easy: 20, medium: 60, hard: 20 },
        default_timer_mode: 'per_question',
        default_timer_seconds: 15,
        is_start_screen_enabled: true,
        is_lead_screen_enabled: true,
        config: {
          theme: {
            font_family: 'Inter',
            primary_text_color: '#FFFFFF',
            secondary_text_color: '#A0AEC0',
            button_fill_color: '#3182CE',
            button_text_color: '#FFFFFF',
            overlay_tint: 'rgba(0,0,0,0.5)',
            correct_feedback_accent: '#48BB78',
            incorrect_feedback_accent: '#F56565',
          },
          backgrounds: { default: '', start: null, lead: null, game: null, end: null },
          screens: {
            start: { headline: 'Ready to Play?', body: 'Test your knowledge!', button_label: 'Start Quiz' },
            lead: {
              headline: 'Complete Your Entry',
              fields: [
                { type: 'name', label: 'Name', placeholder: 'Enter your name', required: true, enabled: true },
                { type: 'email', label: 'Email', placeholder: 'Enter your email', required: true, enabled: true },
                { type: 'phone', label: 'Phone', placeholder: '10 digit phone number', required: false, enabled: false },
              ],
              terms: {
                enabled: true,
                text: 'By submitting your information you agree to receive promotional communications',
                required: true,
              },
              submit_label: 'Submit',
            },
            game: { show_progress_bar: true, show_question_number: true, spacing: 'comfortable' },
            end: {
              headline_template: 'You scored {score} out of {total}!',
              show_score_breakdown: true,
              cta: { enabled: false, label: 'Continue' },
              social_share: { enabled: false, share_text_template: 'I scored {percentage}% on {quiz_name}!', share_image_url: '', hashtags: [], fallback_url: '' },
            },
            feedback: { correct_headline: 'Correct!', incorrect_headline: 'Not quite!', show_explanation: true },
          },
          score_range_messages: [
            { min: 0, max: 20, message: 'Keep practicing!' },
            { min: 21, max: 50, message: 'Good effort!' },
            { min: 51, max: 80, message: 'Well done!' },
            { min: 81, max: 100, message: 'Excellent!' },
          ],
        },
      });
    }
  }, [shell]);

  async function loadExistingToken(shellId: string) {
    const { data } = await supabase
      .from('trivia_test_tokens')
      .select('token')
      .eq('shell_id', shellId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setTestToken(data.token);
    }
  }

  async function generateTestToken() {
    if (!shell?.id) return;

    setGeneratingToken(true);
    try {
      const token = crypto.randomUUID();

      const { error } = await supabase.from('trivia_test_tokens').insert({
        shell_id: shell.id,
        token,
        is_active: true,
      });

      if (error) throw error;

      setTestToken(token);
      setShowTestLinkModal(true);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setGeneratingToken(false);
    }
  }

  async function revokeTestToken() {
    if (!shell?.id || !testToken) return;

    try {
      await supabase
        .from('trivia_test_tokens')
        .update({ is_active: false })
        .eq('shell_id', shell.id)
        .eq('is_active', true);

      setTestToken(null);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function getTestUrl() {
    const baseUrl = window.location.origin;
    return `${baseUrl}/test/${testToken}`;
  }

  function copyTestLink() {
    navigator.clipboard.writeText(getTestUrl());
    alert('Test link copied to clipboard!');
  }

  function launchTestQuiz() {
    if (testToken) {
      window.open(getTestUrl(), '_blank');
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (shell?.id) {
        const { error } = await supabase
          .from('trivia_shells')
          .update({
            ...formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', shell.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('trivia_shells')
          .insert(formData);

        if (error) throw error;
      }

      onSave();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function updateFormData(path: string, value: unknown) {
    setFormData(prev => {
      const newData = { ...prev };
      const keys = path.split('.');
      let current: Record<string, unknown> = newData as Record<string, unknown>;

      for (let i = 0; i < keys.length - 1; i++) {
        if (current[keys[i]] === undefined) {
          current[keys[i]] = {};
        }
        current = current[keys[i]] as Record<string, unknown>;
      }

      current[keys[keys.length - 1]] = value;
      return newData;
    });
  }

  function getCurrentDifficultyPreset(): string | null {
    const mix = formData.default_difficulty_mix;
    if (!mix) return 'balanced';

    for (const [name, preset] of Object.entries(DIFFICULTY_PRESETS)) {
      if (mix.easy === preset.easy && mix.medium === preset.medium && mix.hard === preset.hard) {
        return name;
      }
    }
    return null;
  }

  function applyDifficultyPreset(preset: keyof typeof DIFFICULTY_PRESETS) {
    updateFormData('default_difficulty_mix', DIFFICULTY_PRESETS[preset]);
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'basics', label: 'Basics' },
    { id: 'defaults', label: 'Defaults' },
    { id: 'theme', label: 'Theme' },
    { id: 'screens', label: 'Screens' },
    { id: 'preview', label: 'Preview' },
    { id: 'validation', label: 'Validation' },
  ];

  const currentBackground = formData.config?.backgrounds?.default || 'https://images.pexels.com/photos/1939485/pexels-photo-1939485.jpeg';
  const theme = formData.config?.theme;
  const difficultyTotal = (formData.default_difficulty_mix?.easy || 0) + (formData.default_difficulty_mix?.medium || 0) + (formData.default_difficulty_mix?.hard || 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {shell ? 'Edit Shell' : 'Create Shell'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {shell?.id && (
            <>
              <button
                onClick={() => testToken ? setShowTestLinkModal(true) : generateTestToken()}
                disabled={generatingToken}
                className="inline-flex items-center px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <Play className="w-4 h-4 mr-2" />
                {generatingToken ? 'Generating...' : 'Test Quiz'}
              </button>
            </>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'basics' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Internal Name</label>
                <input
                  type="text"
                  value={formData.internal_name || ''}
                  onChange={e => updateFormData('internal_name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                <input
                  type="text"
                  value={formData.slug || ''}
                  onChange={e => updateFormData('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status || 'draft'}
                    onChange={e => {
                      const newStatus = e.target.value;
                      const hasTopic = formData.topic && formData.topic.trim().length > 0;
                      const hasTags = formData.tags && formData.tags.length > 0;
                      if (newStatus !== 'draft' && !hasTopic && !hasTags) {
                        alert('Topic or Tags must be selected to move beyond draft status.');
                        return;
                      }
                      updateFormData('status', newStatus);
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="draft">Draft</option>
                    <option value="ready">Ready</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
                  <select
                    value={formData.visibility || 'internal_only'}
                    onChange={e => updateFormData('visibility', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="global">Global</option>
                    <option value="tier_1">Tier 1</option>
                    <option value="tier_2">Tier 2</option>
                    <option value="tier_3">Tier 3</option>
                    <option value="client_specific">Client Specific</option>
                    <option value="internal_only">Internal Only</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Topic</label>
                <select
                  value={formData.topic || ''}
                  onChange={e => updateFormData('topic', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    formData.topic && !availableTopics.some(t => t.topic === formData.topic)
                      ? 'border-orange-400 bg-orange-50'
                      : 'border-gray-200'
                  }`}
                >
                  <option value="">-- Select a topic --</option>
                  {formData.topic && !availableTopics.some(t => t.topic === formData.topic) && (
                    <option value={formData.topic}>{formData.topic} (0 questions - no longer available)</option>
                  )}
                  {availableTopics.map(opt => (
                    <option key={opt.topic} value={opt.topic}>
                      {opt.topic} ({opt.count} questions)
                    </option>
                  ))}
                </select>
                {availableTopics.length === 0 && !formData.topic && (
                  <p className="text-xs text-gray-500 mt-1">No topics available. Add questions with topics first.</p>
                )}
                {formData.topic && !availableTopics.some(t => t.topic === formData.topic) && (
                  <p className="text-xs text-orange-600 mt-1">This topic no longer has any approved questions. Select a different topic.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                {(() => {
                  const unavailableTags = (formData.tags || []).filter(t => !availableTags.some(at => at.tag === t));
                  return (
                    <>
                      {(availableTags.length > 0 || unavailableTags.length > 0) ? (
                        <div className="border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                          <div className="space-y-2">
                            {unavailableTags.map(tag => (
                              <label key={tag} className="flex items-center gap-2 cursor-pointer bg-orange-50 -mx-1 px-1 py-0.5 rounded">
                                <input
                                  type="checkbox"
                                  checked={true}
                                  onChange={() => {
                                    const currentTags = formData.tags || [];
                                    updateFormData('tags', currentTags.filter(t => t !== tag));
                                  }}
                                  className="w-4 h-4 text-orange-600 rounded border-orange-300 focus:ring-orange-500"
                                />
                                <span className="text-sm text-orange-700">{tag}</span>
                                <span className="text-xs text-orange-500">(0 - unavailable)</span>
                              </label>
                            ))}
                            {availableTags.map(opt => (
                              <label key={opt.tag} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={(formData.tags || []).includes(opt.tag)}
                                  onChange={e => {
                                    const currentTags = formData.tags || [];
                                    if (e.target.checked) {
                                      updateFormData('tags', [...currentTags, opt.tag]);
                                    } else {
                                      updateFormData('tags', currentTags.filter(t => t !== opt.tag));
                                    }
                                  }}
                                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">{opt.tag}</span>
                                <span className="text-xs text-gray-400">({opt.count})</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No tags available. Add questions with tags first.</p>
                      )}
                      {unavailableTags.length > 0 && (
                        <p className="text-xs text-orange-600 mt-1">Some selected tags no longer have approved questions.</p>
                      )}
                    </>
                  );
                })()}
                {(formData.tags || []).length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Selected: {(formData.tags || []).join(', ')}
                  </p>
                )}
              </div>

              {(formData.topic || (formData.tags || []).length > 0) && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    {loadingMatchCount ? (
                      <span className="text-sm text-blue-700">Counting matching questions...</span>
                    ) : (
                      <span className="text-sm text-blue-700">
                        <strong>{matchingQuestionCount}</strong> approved questions match current filters
                      </span>
                    )}
                  </div>
                  {matchingQuestionCount !== null && matchingQuestionCount < (formData.default_question_count || 10) && (
                    <p className="text-xs text-orange-600 mt-1">
                      Warning: You need {formData.default_question_count || 10} questions but only {matchingQuestionCount} match.
                    </p>
                  )}
                </div>
              )}

              {!formData.topic && (formData.tags || []).length === 0 && formData.status !== 'draft' && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="text-sm text-orange-700">
                    Either Topic or Tags must be selected to move beyond draft status.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'defaults' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Selection Mode</label>
                <select
                  value={formData.default_selection_mode || 'random_per_play'}
                  onChange={e => updateFormData('default_selection_mode', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="fixed">Fixed</option>
                  <option value="random_per_campaign">Random Per Campaign</option>
                  <option value="random_per_play">Random Per Play</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Question Count</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formData.default_question_count || 10}
                  onChange={e => updateFormData('default_question_count', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Difficulty Mix</label>
                <div className="flex gap-2 mb-3">
                  {(Object.keys(DIFFICULTY_PRESETS) as Array<keyof typeof DIFFICULTY_PRESETS>).map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyDifficultyPreset(preset)}
                      className={`px-4 py-2 text-sm font-medium rounded-lg capitalize ${
                        getCurrentDifficultyPreset() === preset
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowDifficultyAdvanced(!showDifficultyAdvanced)}
                  className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
                >
                  {showDifficultyAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  Advanced (Custom Percentages)
                </button>

                {showDifficultyAdvanced && (
                  <div className="mt-3 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Easy %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={formData.default_difficulty_mix?.easy || 20}
                          onChange={e => updateFormData('default_difficulty_mix.easy', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Medium %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={formData.default_difficulty_mix?.medium || 60}
                          onChange={e => updateFormData('default_difficulty_mix.medium', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Hard %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={formData.default_difficulty_mix?.hard || 20}
                          onChange={e => updateFormData('default_difficulty_mix.hard', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    {difficultyTotal !== 100 && (
                      <p className="text-sm text-red-600 mt-2">
                        Total must equal 100% (currently {difficultyTotal}%)
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timer Mode</label>
                  <select
                    value={formData.default_timer_mode || 'per_question'}
                    onChange={e => updateFormData('default_timer_mode', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="per_question">Per Question</option>
                    <option value="per_quiz">Per Quiz</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timer Seconds</label>
                  <input
                    type="number"
                    min="5"
                    max="600"
                    value={formData.default_timer_seconds || 15}
                    onChange={e => updateFormData('default_timer_seconds', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'theme' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Font Family</label>
                <select
                  value={formData.config?.theme?.font_family || 'Inter'}
                  onChange={e => updateFormData('config.theme.font_family', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {APPROVED_FONTS.map(font => (
                    <option key={font} value={font}>{font}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Primary Text Color</label>
                  <input
                    type="color"
                    value={formData.config?.theme?.primary_text_color || '#FFFFFF'}
                    onChange={e => updateFormData('config.theme.primary_text_color', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Text Color</label>
                  <input
                    type="color"
                    value={formData.config?.theme?.secondary_text_color || '#A0AEC0'}
                    onChange={e => updateFormData('config.theme.secondary_text_color', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Button Fill Color</label>
                  <input
                    type="color"
                    value={formData.config?.theme?.button_fill_color || '#3182CE'}
                    onChange={e => updateFormData('config.theme.button_fill_color', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Button Text Color</label>
                  <input
                    type="color"
                    value={formData.config?.theme?.button_text_color || '#FFFFFF'}
                    onChange={e => updateFormData('config.theme.button_text_color', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Correct Feedback</label>
                  <input
                    type="color"
                    value={formData.config?.theme?.correct_feedback_accent || '#48BB78'}
                    onChange={e => updateFormData('config.theme.correct_feedback_accent', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Incorrect Feedback</label>
                  <input
                    type="color"
                    value={formData.config?.theme?.incorrect_feedback_accent || '#F56565'}
                    onChange={e => updateFormData('config.theme.incorrect_feedback_accent', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Default Background</label>
                  {currentBackground && (
                    <button
                      type="button"
                      onClick={() => setShowBackgroundModal(true)}
                      className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                    >
                      <Maximize2 className="w-4 h-4" />
                      View Full Size
                    </button>
                  )}
                </div>
                <ImageInput
                  label=""
                  value={formData.config?.backgrounds?.default || ''}
                  onChange={(url) => updateFormData('config.backgrounds.default', url)}
                  folder="backgrounds"
                />
                {currentBackground && (
                  <div className="mt-3">
                    <div
                      className="w-full h-48 rounded-lg bg-cover bg-center border border-gray-200 relative cursor-pointer hover:opacity-90 transition-opacity"
                      style={{ backgroundImage: `url(${currentBackground})` }}
                      onClick={() => setShowBackgroundModal(true)}
                    >
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-20 transition-all rounded-lg">
                        <Maximize2 className="w-8 h-8 text-white opacity-0 hover:opacity-100" />
                      </div>
                      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-white/50" />
                      <div className="absolute top-2 right-2 px-2 py-1 bg-black/50 text-white text-xs rounded">
                        Text Safe Zone
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Click to view full image. Dashed line indicates text-safe middle zone.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'screens' && (
            <ScreensEditor
              shellId={shell?.id || null}
              isStartScreenEnabled={formData.is_start_screen_enabled ?? true}
              isLeadScreenEnabled={formData.is_lead_screen_enabled ?? true}
              config={formData.config?.screens || {
                start: { headline: '', body: '', button_label: '' },
                lead: { headline: '', fields: [], terms: { enabled: true, text: '', required: true }, submit_label: '' },
                game: { show_progress_bar: true, show_question_number: true, spacing: 'comfortable' },
                end: { headline_template: '', show_score_breakdown: true, cta: { enabled: false, label: '' }, social_share: { enabled: false, share_text_template: '', share_image_url: '', hashtags: [], fallback_url: '' } },
                feedback: { correct_headline: '', incorrect_headline: '', show_explanation: true },
              }}
              onStartScreenEnabledChange={(enabled) => updateFormData('is_start_screen_enabled', enabled)}
              onLeadScreenEnabledChange={(enabled) => updateFormData('is_lead_screen_enabled', enabled)}
              onConfigChange={updateFormData}
            />
          )}

          {activeTab === 'preview' && (
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1">
                <div className="flex gap-2 mb-4">
                  {(['start', 'game', 'end'] as const).map(screen => (
                    <button
                      key={screen}
                      onClick={() => setPreviewScreen(screen)}
                      className={`px-3 py-1.5 text-sm rounded-lg ${
                        previewScreen === screen
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {screen.charAt(0).toUpperCase() + screen.slice(1)}
                    </button>
                  ))}
                </div>
                <p className="text-sm text-gray-500">
                  This is a visual preview only. Use the "Test Quiz" button to play through the full experience.
                </p>
              </div>

              <div className="flex justify-center">
                <div className="relative">
                  <Smartphone className="w-6 h-6 text-gray-400 absolute -top-8 left-1/2 transform -translate-x-1/2" />
                  <div
                    className="w-72 h-[500px] rounded-3xl overflow-hidden border-4 border-gray-800 shadow-xl"
                    style={{
                      backgroundImage: `url(${currentBackground})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    <div
                      className="w-full h-full flex flex-col items-center justify-center p-6 text-center"
                      style={{ backgroundColor: theme?.overlay_tint || 'rgba(0,0,0,0.5)' }}
                    >
                      {previewScreen === 'start' && (
                        <>
                          <h2
                            className="text-2xl font-bold mb-3"
                            style={{ color: theme?.primary_text_color, fontFamily: theme?.font_family }}
                          >
                            {formData.config?.screens?.start?.headline || 'Ready to Play?'}
                          </h2>
                          <p
                            className="text-sm mb-6"
                            style={{ color: theme?.secondary_text_color, fontFamily: theme?.font_family }}
                          >
                            {formData.config?.screens?.start?.body || 'Test your knowledge!'}
                          </p>
                          <button
                            className="px-6 py-3 rounded-lg font-medium"
                            style={{
                              backgroundColor: theme?.button_fill_color,
                              color: theme?.button_text_color,
                              fontFamily: theme?.font_family,
                            }}
                          >
                            {formData.config?.screens?.start?.button_label || 'Start Quiz'}
                          </button>
                        </>
                      )}

                      {previewScreen === 'game' && (
                        <div className="w-full">
                          <div className="mb-4">
                            <div className="flex justify-between text-xs mb-1" style={{ color: theme?.secondary_text_color }}>
                              <span>Question 1 of {formData.default_question_count}</span>
                              <span>0:15</span>
                            </div>
                            <div className="w-full bg-gray-600 rounded-full h-1">
                              <div className="bg-blue-500 h-1 rounded-full" style={{ width: '10%' }} />
                            </div>
                          </div>
                          <h3
                            className="text-lg font-medium mb-4"
                            style={{ color: theme?.primary_text_color, fontFamily: theme?.font_family }}
                          >
                            Sample question text goes here?
                          </h3>
                          <div className="space-y-2">
                            {['Answer A', 'Answer B', 'Answer C', 'Answer D'].map((ans, i) => (
                              <div
                                key={i}
                                className="p-3 rounded-lg border text-sm text-left"
                                style={{
                                  borderColor: i === 0 ? theme?.button_fill_color : 'rgba(255,255,255,0.2)',
                                  backgroundColor: i === 0 ? 'rgba(255,255,255,0.1)' : 'transparent',
                                  color: theme?.primary_text_color,
                                }}
                              >
                                {ans}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {previewScreen === 'end' && (
                        <>
                          <h2
                            className="text-2xl font-bold mb-2"
                            style={{ color: theme?.primary_text_color, fontFamily: theme?.font_family }}
                          >
                            {(formData.config?.screens?.end?.headline_template || 'You scored {score} out of {total}!')
                              .replace('{score}', '7')
                              .replace('{total}', String(formData.default_question_count || 10))}
                          </h2>
                          <p className="text-4xl font-bold mb-4" style={{ color: theme?.correct_feedback_accent }}>
                            70%
                          </p>
                          <p className="text-sm" style={{ color: theme?.secondary_text_color }}>
                            {formData.config?.score_range_messages?.find(m => 70 >= m.min && 70 <= m.max)?.message || 'Well done!'}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'validation' && (
            <div className="space-y-4">
              {!shell?.id ? (
                <p className="text-gray-500">Save the shell first to see validation results.</p>
              ) : validationLoading ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading validation results...</span>
                </div>
              ) : validationError ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700">{validationError}</p>
                  <button
                    onClick={fetchValidation}
                    className="mt-2 text-sm text-red-600 underline"
                  >
                    Retry
                  </button>
                </div>
              ) : validationData ? (
                <>
                  <div className="flex justify-end">
                    <button
                      onClick={fetchValidation}
                      className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Refresh
                    </button>
                  </div>

                  {validationData.validation.is_valid ? (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-green-800">Validation Passed</h4>
                        <p className="text-sm text-green-700">Shell configuration is valid and ready for use.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                      <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-red-800">Validation Failed</h4>
                        <p className="text-sm text-red-700">Fix the blocking errors below before activating this shell.</p>
                      </div>
                    </div>
                  )}

                  {validationData.validation.blocking_errors.length > 0 && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <h4 className="font-medium text-red-800 mb-2">Blocking Errors</h4>
                      <ul className="text-sm text-red-700 space-y-1">
                        {validationData.validation.blocking_errors.map((error, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{error.message}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {validationData.validation.warnings.length > 0 && (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <h4 className="font-medium text-yellow-800 mb-2">Warnings</h4>
                      <ul className="text-sm text-yellow-700 space-y-1">
                        {validationData.validation.warnings.map((warning, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{warning.message}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <h4 className="font-medium text-gray-800 mb-3">Question Supply Health</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Total Approved</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {validationData.question_supply.total_approved}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Needed</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {validationData.question_supply.needed.total}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Status</p>
                        <p className={`text-lg font-semibold ${validationData.question_supply.sufficient ? 'text-green-600' : 'text-red-600'}`}>
                          {validationData.question_supply.sufficient ? 'Sufficient' : 'Insufficient'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h5 className="text-sm font-medium text-gray-700 mb-2">By Difficulty</h5>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Easy</p>
                          <p className="font-medium">
                            {validationData.question_supply.by_difficulty.easy} / {validationData.question_supply.needed.easy}
                            {validationData.question_supply.shortages.easy > 0 && (
                              <span className="text-red-600 ml-1">(-{validationData.question_supply.shortages.easy})</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Medium</p>
                          <p className="font-medium">
                            {validationData.question_supply.by_difficulty.medium} / {validationData.question_supply.needed.medium}
                            {validationData.question_supply.shortages.medium > 0 && (
                              <span className="text-red-600 ml-1">(-{validationData.question_supply.shortages.medium})</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Hard</p>
                          <p className="font-medium">
                            {validationData.question_supply.by_difficulty.hard} / {validationData.question_supply.needed.hard}
                            {validationData.question_supply.shortages.hard > 0 && (
                              <span className="text-red-600 ml-1">(-{validationData.question_supply.shortages.hard})</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {validationData.mobile_fit_warnings.length > 0 && (
                    <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                      <h4 className="font-medium text-orange-800 mb-2">Mobile Fit Warnings</h4>
                      <ul className="text-sm text-orange-700 space-y-1">
                        {validationData.mobile_fit_warnings.map((warning, i) => (
                          <li key={i}>{warning.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {showBackgroundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-80">
          <div className="relative max-w-4xl w-full max-h-[90vh]">
            <button
              onClick={() => setShowBackgroundModal(false)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300"
            >
              <X className="w-8 h-8" />
            </button>
            <img
              src={currentBackground}
              alt="Background preview"
              className="w-full h-auto max-h-[85vh] object-contain rounded-lg"
            />
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-white/50 pointer-events-none" />
            <p className="text-center text-white text-sm mt-4">
              Full background image. Dashed line indicates text-safe middle zone for mobile display.
            </p>
          </div>
        </div>
      )}

      {showTestLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Test Quiz</h2>
              <button onClick={() => setShowTestLinkModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-800">
                  Test mode sessions are isolated and do not affect production data, analytics, or lead records.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Test Link</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getTestUrl()}
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  />
                  <button
                    onClick={copyTestLink}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    title="Copy link"
                  >
                    <Link2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-center p-4 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="bg-white p-2 rounded-lg inline-block mb-2">
                    <QRCodeSVG value={getTestUrl()} size={128} />
                  </div>
                  <p className="text-xs text-gray-500">QR Code for test link</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={launchTestQuiz}
                  className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 inline-flex items-center justify-center"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Launch Test
                </button>
                <button
                  onClick={revokeTestToken}
                  className="px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100"
                >
                  Revoke Link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

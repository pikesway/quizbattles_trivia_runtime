import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical, Upload, AlertTriangle, Check, Sliders } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ImageInput } from './ImageInput';

type GameScreenSpacingPreset = 'compact' | 'comfortable' | 'spacious';
type GameScreenSpacing = GameScreenSpacingPreset | 'custom';

const SPACING_LIMITS = {
  min: 8,
  max: 60,
  presets: {
    compact: 12,
    comfortable: 24,
    spacious: 40,
  },
} as const;

interface LeadFormField {
  type: 'name' | 'email' | 'phone' | 'text';
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

interface EndScreenCtaConfig {
  enabled: boolean;
  label: string;
}

interface SocialShareConfig {
  enabled: boolean;
  share_text_template: string;
  share_image_url: string;
  hashtags: string[];
  fallback_url: string;
}

interface EndScreenCase {
  id: string;
  shell_id: string;
  min_percentage: number;
  max_percentage: number | null;
  message: string;
  enabled: boolean;
  sort_order: number;
}

interface ScreensConfig {
  start: { headline: string; body: string; button_label: string };
  lead: LeadFormConfig;
  game: { show_progress_bar: boolean; show_question_number: boolean; spacing?: GameScreenSpacing; custom_spacing_value?: number };
  end: { headline_template: string; show_score_breakdown: boolean; cta?: EndScreenCtaConfig; social_share?: SocialShareConfig };
  feedback: { correct_headline: string; incorrect_headline: string; show_explanation: boolean };
}

interface ScreensEditorProps {
  shellId: string | null;
  isStartScreenEnabled: boolean;
  isLeadScreenEnabled: boolean;
  config: ScreensConfig;
  onStartScreenEnabledChange: (enabled: boolean) => void;
  onLeadScreenEnabledChange: (enabled: boolean) => void;
  onConfigChange: (path: string, value: unknown) => void;
}

const SPACING_OPTIONS: { value: GameScreenSpacingPreset; label: string; description: string }[] = [
  { value: 'compact', label: 'Compact', description: 'Tight spacing for longer questions' },
  { value: 'comfortable', label: 'Comfortable', description: 'Balanced spacing (default)' },
  { value: 'spacious', label: 'Spacious', description: 'More breathing room' },
];

const SHARE_TOKENS = [
  { token: '{score}', description: 'Number of correct answers' },
  { token: '{total}', description: 'Total number of questions' },
  { token: '{percentage}', description: 'Score as percentage' },
  { token: '{quiz_name}', description: 'Name of the quiz' },
  { token: '{result_message}', description: 'Score-based result message' },
];

export function ScreensEditor({
  shellId,
  isStartScreenEnabled,
  isLeadScreenEnabled,
  config,
  onStartScreenEnabledChange,
  onLeadScreenEnabledChange,
  onConfigChange,
}: ScreensEditorProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    start: true,
    lead: false,
    game: false,
    end: false,
    feedback: false,
  });
  const [endScreenCases, setEndScreenCases] = useState<EndScreenCase[]>([]);
  const [loadingCases, setLoadingCases] = useState(false);
  const [editingCase, setEditingCase] = useState<EndScreenCase | null>(null);
  const [showCaseModal, setShowCaseModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState('');
  const [caseForm, setCaseForm] = useState({
    min_percentage: 0,
    max_percentage: 100 as number | null,
    message: '',
    enabled: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const fetchEndScreenCases = useCallback(async () => {
    if (!shellId) return;

    setLoadingCases(true);
    try {
      const { data, error } = await supabase
        .from('trivia_end_screen_cases')
        .select('*')
        .eq('shell_id', shellId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setEndScreenCases(data || []);
    } catch (err) {
      console.error('Failed to fetch end screen cases:', err);
    } finally {
      setLoadingCases(false);
    }
  }, [shellId]);

  useEffect(() => {
    fetchEndScreenCases();
  }, [fetchEndScreenCases]);

  async function handleSaveCase() {
    if (!shellId) return;

    try {
      if (editingCase) {
        const { error } = await supabase
          .from('trivia_end_screen_cases')
          .update({
            min_percentage: caseForm.min_percentage,
            max_percentage: caseForm.max_percentage,
            message: caseForm.message,
            enabled: caseForm.enabled,
          })
          .eq('id', editingCase.id);

        if (error) throw error;
      } else {
        const maxOrder = endScreenCases.reduce((max, c) => Math.max(max, c.sort_order), -1);
        const { error } = await supabase
          .from('trivia_end_screen_cases')
          .insert({
            shell_id: shellId,
            min_percentage: caseForm.min_percentage,
            max_percentage: caseForm.max_percentage,
            message: caseForm.message,
            enabled: caseForm.enabled,
            sort_order: maxOrder + 1,
          });

        if (error) throw error;
      }

      await fetchEndScreenCases();
      setShowCaseModal(false);
      setEditingCase(null);
      setCaseForm({ min_percentage: 0, max_percentage: 100, message: '', enabled: true });
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleDeleteCase(caseId: string) {
    if (!confirm('Delete this end screen case?')) return;

    try {
      const { error } = await supabase
        .from('trivia_end_screen_cases')
        .delete()
        .eq('id', caseId);

      if (error) throw error;
      await fetchEndScreenCases();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleToggleCase(caseItem: EndScreenCase) {
    try {
      const { error } = await supabase
        .from('trivia_end_screen_cases')
        .update({ enabled: !caseItem.enabled })
        .eq('id', caseItem.id);

      if (error) throw error;
      await fetchEndScreenCases();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function openEditCase(caseItem: EndScreenCase) {
    setEditingCase(caseItem);
    setCaseForm({
      min_percentage: caseItem.min_percentage,
      max_percentage: caseItem.max_percentage,
      message: caseItem.message,
      enabled: caseItem.enabled,
    });
    setShowCaseModal(true);
  }

  function openAddCase() {
    setEditingCase(null);
    setCaseForm({ min_percentage: 0, max_percentage: 100, message: '', enabled: true });
    setShowCaseModal(true);
  }

  async function handleImportCases() {
    if (!shellId) return;

    setImportError('');
    try {
      const parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed)) {
        throw new Error('JSON must be an array of cases');
      }

      const casesToImport = parsed.map((item, idx) => ({
        shell_id: shellId,
        min_percentage: item.min_percentage,
        max_percentage: item.max_percentage ?? null,
        message: item.message,
        enabled: item.enabled ?? true,
        sort_order: endScreenCases.length + idx,
      }));

      const { error } = await supabase
        .from('trivia_end_screen_cases')
        .insert(casesToImport);

      if (error) throw error;

      await fetchEndScreenCases();
      setShowImportModal(false);
      setImportJson('');
    } catch (err) {
      setImportError((err as Error).message);
    }
  }

  const SectionHeader = ({ title, section, badge }: { title: string; section: string; badge?: string }) => (
    <button
      type="button"
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between p-4 hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-gray-900">{title}</h3>
        {badge && (
          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">{badge}</span>
        )}
      </div>
      {expandedSections[section] ? (
        <ChevronUp className="w-5 h-5 text-gray-400" />
      ) : (
        <ChevronDown className="w-5 h-5 text-gray-400" />
      )}
    </button>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
        <SectionHeader title="Start Screen" section="start" badge={isStartScreenEnabled ? 'Enabled' : 'Disabled'} />
        {expandedSections.start && (
          <div className="p-4 border-t border-gray-200">
            <label className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={isStartScreenEnabled}
                onChange={e => onStartScreenEnabledChange(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Enable Start Screen</span>
            </label>
            {isStartScreenEnabled && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Headline</label>
                  <input
                    type="text"
                    value={config.start?.headline || ''}
                    onChange={e => onConfigChange('config.screens.start.headline', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Body Text</label>
                  <textarea
                    value={config.start?.body || ''}
                    onChange={e => onConfigChange('config.screens.start.body', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Button Label</label>
                  <input
                    type="text"
                    value={config.start?.button_label || ''}
                    onChange={e => onConfigChange('config.screens.start.button_label', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
        <SectionHeader title="Lead Form" section="lead" badge={isLeadScreenEnabled ? 'Enabled' : 'Disabled'} />
        {expandedSections.lead && (
          <div className="p-4 border-t border-gray-200">
            <label className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={isLeadScreenEnabled}
                onChange={e => onLeadScreenEnabledChange(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Enable Lead Form</span>
            </label>
            {isLeadScreenEnabled && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Form Headline</label>
                  <input
                    type="text"
                    value={config.lead?.headline || ''}
                    onChange={e => onConfigChange('config.screens.lead.headline', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  />
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Form Fields</h4>
                  {(config.lead?.fields || []).map((field, index) => (
                    <div key={field.type} className="mb-3 p-3 bg-white rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={field.enabled}
                            onChange={e => {
                              const fields = [...(config.lead?.fields || [])];
                              fields[index] = { ...fields[index], enabled: e.target.checked };
                              onConfigChange('config.screens.lead.fields', fields);
                            }}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-700 capitalize">{field.type}</span>
                        </label>
                        {field.enabled && (
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={e => {
                                const fields = [...(config.lead?.fields || [])];
                                fields[index] = { ...fields[index], required: e.target.checked };
                                onConfigChange('config.screens.lead.fields', fields);
                              }}
                              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                            <span className="text-xs text-gray-500">Required</span>
                          </label>
                        )}
                      </div>
                      {field.enabled && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Label</label>
                            <input
                              type="text"
                              value={field.label}
                              onChange={e => {
                                const fields = [...(config.lead?.fields || [])];
                                fields[index] = { ...fields[index], label: e.target.value };
                                onConfigChange('config.screens.lead.fields', fields);
                              }}
                              className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Placeholder</label>
                            <input
                              type="text"
                              value={field.placeholder}
                              onChange={e => {
                                const fields = [...(config.lead?.fields || [])];
                                fields[index] = { ...fields[index], placeholder: e.target.value };
                                onConfigChange('config.screens.lead.fields', fields);
                              }}
                              className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Terms & Conditions</h4>
                  <div className="p-3 bg-white rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={config.lead?.terms?.enabled ?? true}
                          onChange={e => onConfigChange('config.screens.lead.terms.enabled', e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Show Terms Checkbox</span>
                      </label>
                      {config.lead?.terms?.enabled && (
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.lead?.terms?.required ?? true}
                            onChange={e => onConfigChange('config.screens.lead.terms.required', e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-500">Required</span>
                        </label>
                      )}
                    </div>
                    {config.lead?.terms?.enabled && (
                      <div className="mt-2">
                        <label className="block text-xs text-gray-500 mb-1">Terms Text</label>
                        <textarea
                          value={config.lead?.terms?.text || ''}
                          onChange={e => onConfigChange('config.screens.lead.terms.text', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <label className="block text-xs text-gray-500 mb-1">Submit Button Label</label>
                  <input
                    type="text"
                    value={config.lead?.submit_label || ''}
                    onChange={e => onConfigChange('config.screens.lead.submit_label', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
        <SectionHeader title="Game Screen" section="game" />
        {expandedSections.game && (
          <div className="p-4 border-t border-gray-200 space-y-4">
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.game?.show_progress_bar ?? true}
                  onChange={e => onConfigChange('config.screens.game.show_progress_bar', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Show progress bar</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.game?.show_question_number ?? true}
                  onChange={e => onConfigChange('config.screens.game.show_question_number', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Show question number</span>
              </label>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Layout Spacing</h4>
              <p className="text-xs text-gray-500 mb-3">Controls the spacing between question and answer options</p>
              <div className="grid grid-cols-4 gap-2">
                {SPACING_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onConfigChange('config.screens.game.spacing', opt.value);
                      onConfigChange('config.screens.game.custom_spacing_value', undefined);
                    }}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${
                      (config.game?.spacing || 'comfortable') === opt.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="block text-sm font-medium text-gray-900">{opt.label}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">{opt.description}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    onConfigChange('config.screens.game.spacing', 'custom');
                    if (!config.game?.custom_spacing_value) {
                      onConfigChange('config.screens.game.custom_spacing_value', SPACING_LIMITS.presets.comfortable);
                    }
                  }}
                  className={`p-3 rounded-lg border-2 text-left transition-colors ${
                    config.game?.spacing === 'custom'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="block text-sm font-medium text-gray-900 flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5" />
                    Custom
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">Fine-tune manually</span>
                </button>
              </div>

              {config.game?.spacing === 'custom' && (
                <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">Advanced Spacing</label>
                    <span className="text-sm font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {config.game?.custom_spacing_value ?? SPACING_LIMITS.presets.comfortable}px
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="range"
                      min={SPACING_LIMITS.min}
                      max={SPACING_LIMITS.max}
                      step={1}
                      value={config.game?.custom_spacing_value ?? SPACING_LIMITS.presets.comfortable}
                      onChange={e => onConfigChange('config.screens.game.custom_spacing_value', parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between mt-1 text-xs text-gray-400">
                      <span>{SPACING_LIMITS.min}px</span>
                      <span>{SPACING_LIMITS.max}px</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <span className="text-xs text-gray-500">Presets:</span>
                    {SPACING_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onConfigChange('config.screens.game.custom_spacing_value', SPACING_LIMITS.presets[opt.value])}
                        className={`text-xs px-2 py-0.5 rounded transition-colors ${
                          config.game?.custom_spacing_value === SPACING_LIMITS.presets[opt.value]
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {opt.label} ({SPACING_LIMITS.presets[opt.value]}px)
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-400 mt-2">
                Note: Runtime will auto-adjust spacing if content overflows the screen
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
        <SectionHeader title="End Screen" section="end" />
        {expandedSections.end && (
          <div className="p-4 border-t border-gray-200 space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Headline Template</label>
              <input
                type="text"
                placeholder="Use {score} and {total} placeholders"
                value={config.end?.headline_template || ''}
                onChange={e => onConfigChange('config.screens.end.headline_template', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              />
              <p className="text-xs text-gray-400 mt-1">Example: "You scored {'{score}'} out of {'{total}'}!"</p>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.end?.show_score_breakdown ?? true}
                onChange={e => onConfigChange('config.screens.end.show_score_breakdown', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700">Show score breakdown</span>
            </label>

            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-700">Score-Based Messages</h4>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(true)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                  >
                    <Upload className="w-3 h-3" />
                    Import
                  </button>
                  <button
                    type="button"
                    onClick={openAddCase}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    <Plus className="w-3 h-3" />
                    Add Case
                  </button>
                </div>
              </div>

              {loadingCases ? (
                <p className="text-sm text-gray-500">Loading cases...</p>
              ) : endScreenCases.length === 0 ? (
                <div className="p-4 bg-gray-100 rounded-lg text-center">
                  <p className="text-sm text-gray-600 mb-2">No end screen cases configured</p>
                  <p className="text-xs text-gray-500">Default messages will be shown based on score percentage</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {endScreenCases.map(caseItem => (
                    <div
                      key={caseItem.id}
                      className={`p-3 bg-white rounded-lg border ${caseItem.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
                    >
                      <div className="flex items-start gap-3">
                        <GripVertical className="w-4 h-4 text-gray-300 mt-1 cursor-move" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-blue-600">
                              {caseItem.min_percentage}% - {caseItem.max_percentage ?? 100}%
                            </span>
                            {!caseItem.enabled && (
                              <span className="text-xs text-gray-400">(Disabled)</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 truncate">{caseItem.message}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleCase(caseItem)}
                            className={`p-1 rounded ${caseItem.enabled ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                            title={caseItem.enabled ? 'Disable' : 'Enable'}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditCase(caseItem)}
                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCase(caseItem.id)}
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Call to Action</h4>
              <label className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  checked={config.end?.cta?.enabled ?? false}
                  onChange={e => onConfigChange('config.screens.end.cta.enabled', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Enable CTA button</span>
              </label>
              {config.end?.cta?.enabled && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Button Label (placeholder)</label>
                  <input
                    type="text"
                    placeholder="Continue"
                    value={config.end?.cta?.label || ''}
                    onChange={e => onConfigChange('config.screens.end.cta.label', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  />
                  <p className="text-xs text-gray-400 mt-1">Platform can override this label and destination</p>
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Social Sharing</h4>
              <label className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  checked={config.end?.social_share?.enabled ?? false}
                  onChange={e => onConfigChange('config.screens.end.social_share.enabled', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Enable share button</span>
              </label>
              {config.end?.social_share?.enabled && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Share Text Template</label>
                    <textarea
                      value={config.end?.social_share?.share_text_template || ''}
                      onChange={e => onConfigChange('config.screens.end.social_share.share_text_template', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                      rows={2}
                      placeholder="I scored {percentage}% on {quiz_name}! {result_message}"
                    />
                    <div className="flex flex-wrap gap-1 mt-1">
                      {SHARE_TOKENS.map(t => (
                        <button
                          key={t.token}
                          type="button"
                          onClick={() => {
                            const current = config.end?.social_share?.share_text_template || '';
                            onConfigChange('config.screens.end.social_share.share_text_template', current + t.token);
                          }}
                          className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                          title={t.description}
                        >
                          {t.token}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ImageInput
                    label="Share Image (optional)"
                    value={config.end?.social_share?.share_image_url || ''}
                    onChange={(url) => onConfigChange('config.screens.end.social_share.share_image_url', url)}
                    folder="share-images"
                    placeholder="https://example.com/share-image.jpg"
                  />
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Hashtags (comma-separated)</label>
                    <input
                      type="text"
                      value={(config.end?.social_share?.hashtags || []).join(', ')}
                      onChange={e => {
                        const hashtags = e.target.value.split(',').map(h => h.trim()).filter(Boolean);
                        onConfigChange('config.screens.end.social_share.hashtags', hashtags);
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                      placeholder="trivia, quiz, fun"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Fallback URL (optional)</label>
                    <input
                      type="text"
                      value={config.end?.social_share?.fallback_url || ''}
                      onChange={e => onConfigChange('config.screens.end.social_share.fallback_url', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
        <SectionHeader title="Feedback Modal" section="feedback" />
        {expandedSections.feedback && (
          <div className="p-4 border-t border-gray-200 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Correct Headline</label>
                <input
                  type="text"
                  value={config.feedback?.correct_headline || ''}
                  onChange={e => onConfigChange('config.screens.feedback.correct_headline', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Incorrect Headline</label>
                <input
                  type="text"
                  value={config.feedback?.incorrect_headline || ''}
                  onChange={e => onConfigChange('config.screens.feedback.incorrect_headline', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                />
              </div>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.feedback?.show_explanation ?? true}
                onChange={e => onConfigChange('config.screens.feedback.show_explanation', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700">Show explanation after answer</span>
            </label>
          </div>
        )}
      </div>

      {showCaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {editingCase ? 'Edit End Screen Case' : 'Add End Screen Case'}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={caseForm.min_percentage}
                    onChange={e => setCaseForm({ ...caseForm, min_percentage: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={caseForm.max_percentage ?? ''}
                    onChange={e => setCaseForm({ ...caseForm, max_percentage: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    placeholder="100 (open-ended)"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={caseForm.message}
                  onChange={e => setCaseForm({ ...caseForm, message: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  rows={3}
                  placeholder="Enter the message to display for this score range"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={caseForm.enabled}
                  onChange={e => setCaseForm({ ...caseForm, enabled: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Enabled</span>
              </label>
              {caseForm.min_percentage > (caseForm.max_percentage ?? 100) && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Min cannot be greater than max</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowCaseModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCase}
                disabled={!caseForm.message || caseForm.min_percentage > (caseForm.max_percentage ?? 100)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {editingCase ? 'Save Changes' : 'Add Case'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Import End Screen Cases</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">JSON Format</label>
                <textarea
                  value={importJson}
                  onChange={e => setImportJson(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm"
                  rows={8}
                  placeholder={`[
  { "min_percentage": 0, "max_percentage": 20, "message": "Keep practicing!", "enabled": true },
  { "min_percentage": 21, "max_percentage": 50, "message": "Good effort!", "enabled": true }
]`}
                />
              </div>
              {importError && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{importError}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => { setShowImportModal(false); setImportJson(''); setImportError(''); }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportCases}
                disabled={!importJson.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

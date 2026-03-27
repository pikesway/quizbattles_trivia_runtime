import { useState, useEffect } from 'react';
import { Upload, FileText, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getAuthHeaders, getSupabaseFunctionsUrl } from '../../lib/adminApi';

interface ImportBatch {
  id: string;
  source_type: string;
  source_identifier: string;
  shell_slug: string | null;
  total_items: number;
  success_count: number;
  failure_count: number;
  processing_status: string;
  error_details: Array<{ row?: number; message: string }>;
  created_at: string;
}

interface WebhookLog {
  id: string;
  request_timestamp: string;
  source: string;
  processing_result: string;
  batch_id: string | null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

const webhookStatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  success: 'bg-green-100 text-green-700',
  partial: 'bg-orange-100 text-orange-700',
  failed: 'bg-red-100 text-red-700',
};

export function ImportCenter() {
  const [activeTab, setActiveTab] = useState<'upload' | 'history' | 'webhooks'>('upload');
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [filename, setFilename] = useState('');
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
    created: number;
    errors: number;
  } | null>(null);

  useEffect(() => {
    if (activeTab === 'history') loadBatches();
    if (activeTab === 'webhooks') loadWebhookLogs();
  }, [activeTab]);

  async function loadBatches() {
    setLoading(true);
    const { data, error } = await supabase
      .from('trivia_question_import_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error) setBatches(data || []);
    setLoading(false);
  }

  async function loadWebhookLogs() {
    setLoading(true);
    const { data, error } = await supabase
      .from('trivia_webhook_logs')
      .select('*')
      .order('request_timestamp', { ascending: false })
      .limit(50);

    if (!error) setWebhookLogs(data || []);
    setLoading(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvContent(event.target?.result as string);
    };
    reader.readAsText(file);
  }

  async function handleUpload() {
    if (!csvContent) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(getSupabaseFunctionsUrl('webhook-questions'), {
        method: 'POST',
        headers,
        body: JSON.stringify(parseCSVToWebhookPayload(csvContent, filename)),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Import failed');
      }

      setUploadResult({
        success: true,
        message: 'Import completed',
        created: data.data?.success_count || 0,
        errors: data.data?.failure_count || 0,
      });

      setCsvContent('');
      setFilename('');
    } catch (err) {
      setUploadResult({
        success: false,
        message: (err as Error).message,
        created: 0,
        errors: 0,
      });
    } finally {
      setUploading(false);
    }
  }

  function parseCSVToWebhookPayload(csv: string, filename: string) {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) throw new Error('CSV file is empty');

    const headers = lines[0].split(',').map(h => h.toLowerCase().trim().replace(/"/g, ''));

    const questions = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, j) => { row[h] = values[j] || ''; });

      const answers = [];
      for (let j = 1; j <= 4; j++) {
        const text = row[`answer_${j}`];
        const isCorrect = ['true', '1', 'yes', 'y'].includes((row[`answer_${j}_is_correct`] || '').toLowerCase());
        if (text && text.trim()) {
          answers.push({ text: text.trim(), is_correct: isCorrect });
        }
      }

      if (row.question && answers.length >= 2) {
        questions.push({
          question: row.question.trim(),
          explanation: row.explanation?.trim() || '',
          difficulty: (row.difficulty?.toLowerCase().trim() || 'medium') as 'easy' | 'medium' | 'hard',
          answers,
        });
      }
    }

    return {
      source: `csv-upload:${filename}`,
      topic: questions[0]?.question ? (lines[1].split(',')[0]?.replace(/"/g, '') || 'Imported') : 'Imported',
      tags: [],
      questions,
    };
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"' && !inQuotes) {
        inQuotes = true;
      } else if (char === '"' && inQuotes) {
        if (nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Import Center</h1>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex">
            {[
              { id: 'upload', label: 'CSV Upload', icon: Upload },
              { id: 'history', label: 'Import History', icon: FileText },
              { id: 'webhooks', label: 'Webhook Logs', icon: Clock },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'upload' && (
            <div className="max-w-xl">
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Upload CSV File</h3>
                <p className="text-sm text-gray-500">
                  Upload a CSV file with questions. Required columns: topic, question, difficulty, answer_1, answer_1_is_correct, answer_2, answer_2_is_correct
                </p>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center mb-4">
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <label className="cursor-pointer">
                  <span className="text-blue-600 hover:text-blue-700 font-medium">Choose a file</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
                {filename && (
                  <p className="mt-2 text-sm text-gray-600">{filename}</p>
                )}
              </div>

              <button
                onClick={handleUpload}
                disabled={!csvContent || uploading}
                className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload and Import'}
              </button>

              {uploadResult && (
                <div className={`mt-4 p-4 rounded-lg ${uploadResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-start gap-3">
                    {uploadResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                    <div>
                      <p className={`font-medium ${uploadResult.success ? 'text-green-800' : 'text-red-800'}`}>
                        {uploadResult.message}
                      </p>
                      {uploadResult.success && (
                        <p className="text-sm text-green-700 mt-1">
                          {uploadResult.created} questions created, {uploadResult.errors} errors
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">CSV Format Example</h4>
                <pre className="text-xs text-gray-600 overflow-x-auto">
{`topic,question,explanation,difficulty,answer_1,answer_1_is_correct,answer_2,answer_2_is_correct,answer_3,answer_3_is_correct,answer_4,answer_4_is_correct
Science,"What is H2O?","Water is H2O",easy,Water,true,Fire,false,Air,false,Earth,false`}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              {loading ? (
                <div className="text-center text-gray-500 py-8">Loading...</div>
              ) : batches.length === 0 ? (
                <div className="text-center text-gray-500 py-8">No import history</div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {batches.map(batch => (
                    <div key={batch.id} className="py-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900">{batch.source_identifier}</span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[batch.processing_status]}`}>
                              {batch.processing_status}
                            </span>
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                              {batch.source_type}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500">
                            {batch.total_items} items | {batch.success_count} succeeded | {batch.failure_count} failed
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(batch.created_at).toLocaleString()}
                          </p>
                        </div>

                        {batch.failure_count > 0 && (
                          <button
                            onClick={() => alert(JSON.stringify(batch.error_details, null, 2))}
                            className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg"
                            title="View errors"
                          >
                            <AlertTriangle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'webhooks' && (
            <div>
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-1">Webhook Endpoint</h4>
                <code className="text-sm text-blue-700 break-all">
                  POST {window.location.origin}/functions/v1/webhook-questions
                </code>
              </div>

              {loading ? (
                <div className="text-center text-gray-500 py-8">Loading...</div>
              ) : webhookLogs.length === 0 ? (
                <div className="text-center text-gray-500 py-8">No webhook logs</div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {webhookLogs.map(log => (
                    <div key={log.id} className="py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900">{log.source}</span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${webhookStatusColors[log.processing_result]}`}>
                              {log.processing_result}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400">
                            {new Date(log.request_timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

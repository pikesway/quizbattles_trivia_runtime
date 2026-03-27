import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ReviewItem {
  id: string;
  question_text: string;
  explanation: string;
  topic: string;
  difficulty_level: string;
  source_type: string;
  source_batch_id: string | null;
  answers: Array<{
    id: string;
    answer_text: string;
    is_correct: boolean;
  }>;
}

interface ReviewStats {
  pending_count: number;
  approved_today: number;
  rejected_today: number;
}

const MOBILE_FIT_LIMITS = {
  question: 200,
  answer: 80,
  explanation: 300,
};

export function ReviewQueue() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<ReviewStats>({ pending_count: 0, approved_today: 0, rejected_today: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadQueue();
    loadStats();
  }, []);

  async function loadQueue() {
    setLoading(true);
    try {
      const { data: questions, error: qError } = await supabase
        .from('trivia_questions')
        .select('*')
        .eq('review_state', 'pending_review')
        .order('created_at', { ascending: false })
        .limit(50);

      if (qError) throw qError;

      const questionIds = (questions || []).map(q => q.id);

      let answersData: Record<string, unknown>[] = [];
      if (questionIds.length > 0) {
        const { data } = await supabase
          .from('trivia_answers')
          .select('*')
          .in('question_id', questionIds)
          .order('display_order', { ascending: true });
        answersData = data || [];
      }

      const answersMap = new Map<string, Array<{ id: string; answer_text: string; is_correct: boolean }>>();
      answersData.forEach(answer => {
        const qId = answer.question_id as string;
        const existing = answersMap.get(qId) || [];
        answersMap.set(qId, [...existing, answer as { id: string; answer_text: string; is_correct: boolean }]);
      });

      const itemsWithAnswers = (questions || []).map(q => ({
        ...q,
        answers: answersMap.get(q.id) || [],
      }));

      setItems(itemsWithAnswers);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [pendingResult, reviewsResult] = await Promise.all([
      supabase
        .from('trivia_questions')
        .select('*', { count: 'exact', head: true })
        .eq('review_state', 'pending_review'),
      supabase
        .from('trivia_question_reviews')
        .select('action')
        .gte('created_at', today.toISOString()),
    ]);

    const reviews = reviewsResult.data || [];
    setStats({
      pending_count: pendingResult.count || 0,
      approved_today: reviews.filter(r => r.action === 'approved').length,
      rejected_today: reviews.filter(r => r.action === 'rejected').length,
    });
  }

  async function approveItem(id: string) {
    try {
      const { error } = await supabase
        .from('trivia_questions')
        .update({ review_state: 'approved' })
        .eq('id', id);

      if (error) throw error;

      setItems(prev => prev.filter(item => item.id !== id));
      loadStats();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function rejectItem(id: string) {
    try {
      const { error } = await supabase
        .from('trivia_questions')
        .update({ review_state: 'rejected' })
        .eq('id', id);

      if (error) throw error;

      setItems(prev => prev.filter(item => item.id !== id));
      loadStats();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function bulkApprove() {
    if (selectedIds.size === 0) return;
    setProcessing(true);

    try {
      const { error } = await supabase
        .from('trivia_questions')
        .update({ review_state: 'approved' })
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      setItems(prev => prev.filter(item => !selectedIds.has(item.id)));
      setSelectedIds(new Set());
      loadStats();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setProcessing(false);
    }
  }

  async function bulkReject() {
    if (selectedIds.size === 0) return;
    setProcessing(true);

    try {
      const { error } = await supabase
        .from('trivia_questions')
        .update({ review_state: 'rejected' })
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      setItems(prev => prev.filter(item => !selectedIds.has(item.id)));
      setSelectedIds(new Set());
      loadStats();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setProcessing(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.id)));
    }
  }

  function getMobileFitWarnings(item: ReviewItem): string[] {
    const warnings: string[] = [];

    if (item.question_text.length > MOBILE_FIT_LIMITS.question) {
      warnings.push(`Question too long (${item.question_text.length}/${MOBILE_FIT_LIMITS.question})`);
    }

    if (item.explanation && item.explanation.length > MOBILE_FIT_LIMITS.explanation) {
      warnings.push(`Explanation too long (${item.explanation.length}/${MOBILE_FIT_LIMITS.explanation})`);
    }

    item.answers.forEach((answer, i) => {
      if (answer.answer_text.length > MOBILE_FIT_LIMITS.answer) {
        warnings.push(`Answer ${i + 1} too long (${answer.answer_text.length}/${MOBILE_FIT_LIMITS.answer})`);
      }
    });

    return warnings;
  }

  const difficultyColors: Record<string, string> = {
    easy: 'bg-green-100 text-green-700',
    medium: 'bg-yellow-100 text-yellow-700',
    hard: 'bg-red-100 text-red-700',
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
          <p className="text-sm text-gray-500 mt-1">
            {stats.pending_count} pending | {stats.approved_today} approved today | {stats.rejected_today} rejected today
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-orange-600" />
            <div>
              <p className="text-2xl font-bold text-orange-900">{stats.pending_count}</p>
              <p className="text-sm text-orange-700">Pending Review</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-green-900">{stats.approved_today}</p>
              <p className="text-sm text-green-700">Approved Today</p>
            </div>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <XCircle className="w-8 h-8 text-red-600" />
            <div>
              <p className="text-2xl font-bold text-red-900">{stats.rejected_today}</p>
              <p className="text-sm text-red-700">Rejected Today</p>
            </div>
          </div>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center justify-between">
          <span className="text-sm text-blue-800">
            {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={bulkApprove}
              disabled={processing}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              Approve All
            </button>
            <button
              onClick={bulkReject}
              disabled={processing}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              Reject All
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        {items.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-200">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size === items.length && items.length > 0}
                onChange={selectAll}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Select all</span>
            </label>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <p>All caught up! No questions pending review.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {items.map(item => {
              const warnings = getMobileFitWarnings(item);

              return (
                <div key={item.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-2 mb-2">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${difficultyColors[item.difficulty_level]}`}>
                          {item.difficulty_level}
                        </span>
                        {item.topic && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                            {item.topic}
                          </span>
                        )}
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                          {item.source_type}
                        </span>
                      </div>

                      <p className="text-sm text-gray-900 mb-3">{item.question_text}</p>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {item.answers.map(answer => (
                          <div
                            key={answer.id}
                            className={`p-2 text-xs rounded border ${
                              answer.is_correct
                                ? 'border-green-300 bg-green-50 text-green-800'
                                : 'border-gray-200 text-gray-600'
                            }`}
                          >
                            {answer.is_correct && <CheckCircle className="w-3 h-3 inline mr-1" />}
                            {answer.answer_text}
                          </div>
                        ))}
                      </div>

                      {item.explanation && (
                        <p className="text-xs text-gray-500 mb-3">
                          <strong>Explanation:</strong> {item.explanation}
                        </p>
                      )}

                      {warnings.length > 0 && (
                        <div className="flex items-start gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800 mb-3">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <div>
                            {warnings.map((w, i) => (
                              <div key={i}>{w}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => approveItem(item.id)}
                          className="px-3 py-1.5 bg-green-100 text-green-700 text-xs font-medium rounded-lg hover:bg-green-200"
                        >
                          <CheckCircle className="w-3 h-3 inline mr-1" />
                          Approve
                        </button>
                        <button
                          onClick={() => rejectItem(item.id)}
                          className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-medium rounded-lg hover:bg-red-200"
                        >
                          <XCircle className="w-3 h-3 inline mr-1" />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

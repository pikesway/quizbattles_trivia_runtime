import { useState, useEffect } from 'react';
import { Search, ChevronDown, CheckCircle, XCircle, Eye, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Question {
  id: string;
  question_text: string;
  explanation: string;
  topic: string;
  tags: string[];
  difficulty_level: string;
  review_state: string;
  source_type: string;
  is_active: boolean;
  created_at: string;
}

interface QuestionWithAnswers extends Question {
  answers: Array<{
    id: string;
    answer_text: string;
    is_correct: boolean;
    display_order: number;
  }>;
}

const difficultyColors: Record<string, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  hard: 'bg-red-100 text-red-700',
};

const reviewStateColors: Record<string, string> = {
  pending_review: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export function QuestionBank() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [reviewStateFilter, setReviewStateFilter] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionWithAnswers | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [topics, setTopics] = useState<string[]>([]);

  useEffect(() => {
    loadQuestions();
    loadTopics();
  }, [difficultyFilter, reviewStateFilter]);

  async function loadTopics() {
    const { data } = await supabase
      .from('trivia_questions')
      .select('topic')
      .not('topic', 'eq', '');

    if (data) {
      const uniqueTopics = [...new Set(data.map(d => d.topic))];
      setTopics(uniqueTopics.sort());
    }
  }

  async function loadQuestions() {
    setLoading(true);
    try {
      let query = supabase
        .from('trivia_questions')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (difficultyFilter) query = query.eq('difficulty_level', difficultyFilter);
      if (reviewStateFilter) query = query.eq('review_state', reviewStateFilter);

      const { data, count, error } = await query.range(0, 49);
      if (error) throw error;

      setQuestions(data || []);
      setTotal(count || 0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function viewQuestion(questionId: string) {
    const { data: question, error: qError } = await supabase
      .from('trivia_questions')
      .select('*')
      .eq('id', questionId)
      .single();

    if (qError) {
      alert(qError.message);
      return;
    }

    const { data: answers } = await supabase
      .from('trivia_answers')
      .select('*')
      .eq('question_id', questionId)
      .order('display_order', { ascending: true });

    setSelectedQuestion({ ...question, answers: answers || [] });
  }

  async function approveQuestion(questionId: string) {
    try {
      const { error } = await supabase
        .from('trivia_questions')
        .update({ review_state: 'approved' })
        .eq('id', questionId);

      if (error) throw error;

      loadQuestions();
      if (selectedQuestion?.id === questionId) {
        setSelectedQuestion({ ...selectedQuestion, review_state: 'approved' });
      }
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function rejectQuestion(questionId: string) {
    try {
      const { error } = await supabase
        .from('trivia_questions')
        .update({ review_state: 'rejected' })
        .eq('id', questionId);

      if (error) throw error;

      loadQuestions();
      if (selectedQuestion?.id === questionId) {
        setSelectedQuestion({ ...selectedQuestion, review_state: 'rejected' });
      }
    } catch (err) {
      alert((err as Error).message);
    }
  }

  const filteredQuestions = questions.filter(q =>
    q.question_text.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Question Bank</h1>
          <p className="text-sm text-gray-500 mt-1">{total} questions total</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Question
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search questions..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="relative">
              <select
                value={difficultyFilter}
                onChange={e => setDifficultyFilter(e.target.value)}
                className="appearance-none pl-4 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">All Difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={reviewStateFilter}
                onChange={e => setReviewStateFilter(e.target.value)}
                className="appearance-none pl-4 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">All States</option>
                <option value="pending_review">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">{error}</div>
        ) : filteredQuestions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No questions found</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredQuestions.map(question => (
              <div
                key={question.id}
                className="p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => viewQuestion(question.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 line-clamp-2 mb-2">
                      {question.question_text}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${difficultyColors[question.difficulty_level]}`}>
                        {question.difficulty_level}
                      </span>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${reviewStateColors[question.review_state]}`}>
                        {question.review_state.replace('_', ' ')}
                      </span>
                      {question.topic && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                          {question.topic}
                        </span>
                      )}
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                        {question.source_type}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-4">
                    <button
                      onClick={e => { e.stopPropagation(); viewQuestion(question.id); }}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                      title="View"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {question.review_state === 'pending_review' && (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); approveQuestion(question.id); }}
                          className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
                          title="Approve"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); rejectQuestion(question.id); }}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          title="Reject"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Question Details</h2>
                <button
                  onClick={() => setSelectedQuestion(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Question</label>
                  <p className="text-gray-900">{selectedQuestion.question_text}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Answers</label>
                  <div className="space-y-2">
                    {selectedQuestion.answers.map(answer => (
                      <div
                        key={answer.id}
                        className={`p-3 rounded-lg border ${
                          answer.is_correct
                            ? 'border-green-300 bg-green-50'
                            : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={answer.is_correct ? 'text-green-800' : 'text-gray-700'}>
                            {answer.answer_text}
                          </span>
                          {answer.is_correct && (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedQuestion.explanation && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Explanation</label>
                    <p className="text-gray-700">{selectedQuestion.explanation}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Topic</label>
                    <p className="text-gray-700">{selectedQuestion.topic || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Difficulty</label>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${difficultyColors[selectedQuestion.difficulty_level]}`}>
                      {selectedQuestion.difficulty_level}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t border-gray-200">
                  {selectedQuestion.review_state === 'pending_review' && (
                    <>
                      <button
                        onClick={() => {
                          approveQuestion(selectedQuestion.id);
                          setSelectedQuestion(null);
                        }}
                        className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          rejectQuestion(selectedQuestion.id);
                          setSelectedQuestion(null);
                        }}
                        className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedQuestion(null)}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateQuestionModal
          topics={topics}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadQuestions();
          }}
        />
      )}
    </div>
  );
}

interface CreateQuestionModalProps {
  topics: string[];
  onClose: () => void;
  onCreated: () => void;
}

function CreateQuestionModal({ topics, onClose, onCreated }: CreateQuestionModalProps) {
  const [formData, setFormData] = useState({
    question_text: '',
    explanation: '',
    topic: '',
    tags: '',
    difficulty_level: 'medium',
    answers: [
      { text: '', is_correct: true },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ],
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const difficultyMap: Record<string, number> = { easy: 1, medium: 3, hard: 5 };

      const { data: question, error: qError } = await supabase
        .from('trivia_questions')
        .insert({
          question_text: formData.question_text,
          explanation: formData.explanation,
          topic: formData.topic,
          tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
          difficulty: difficultyMap[formData.difficulty_level],
          difficulty_level: formData.difficulty_level,
          review_state: 'approved',
          source_type: 'manual',
          is_active: true,
        })
        .select()
        .single();

      if (qError) throw qError;

      const answerInserts = formData.answers
        .filter(a => a.text.trim())
        .map((a, i) => ({
          question_id: question.id,
          answer_text: a.text,
          is_correct: a.is_correct,
          display_order: i + 1,
        }));

      const { error: aError } = await supabase
        .from('trivia_answers')
        .insert(answerInserts);

      if (aError) throw aError;

      onCreated();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function setCorrectAnswer(index: number) {
    setFormData(prev => ({
      ...prev,
      answers: prev.answers.map((a, i) => ({ ...a, is_correct: i === index })),
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <form onSubmit={handleSubmit} className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Add Question</h2>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <XCircle className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
              <textarea
                required
                rows={3}
                value={formData.question_text}
                onChange={e => setFormData(prev => ({ ...prev, question_text: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Answers (click to mark correct)</label>
              <div className="space-y-2">
                {formData.answers.map((answer, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      placeholder={`Answer ${index + 1}${index < 2 ? ' (required)' : ''}`}
                      value={answer.text}
                      onChange={e => {
                        const newAnswers = [...formData.answers];
                        newAnswers[index].text = e.target.value;
                        setFormData(prev => ({ ...prev, answers: newAnswers }));
                      }}
                      required={index < 2}
                      className={`flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        answer.is_correct ? 'border-green-300 bg-green-50' : 'border-gray-200'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setCorrectAnswer(index)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium ${
                        answer.is_correct
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {answer.is_correct ? 'Correct' : 'Mark'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Explanation</label>
              <textarea
                rows={2}
                value={formData.explanation}
                onChange={e => setFormData(prev => ({ ...prev, explanation: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Topic</label>
                <input
                  type="text"
                  list="topics"
                  value={formData.topic}
                  onChange={e => setFormData(prev => ({ ...prev, topic: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="topics">
                  {topics.map(t => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
                <select
                  value={formData.difficulty_level}
                  onChange={e => setFormData(prev => ({ ...prev, difficulty_level: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={formData.tags}
                onChange={e => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Question'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

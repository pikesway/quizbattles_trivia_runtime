import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { ShellList } from './ShellList';
import { ShellEditor } from './ShellEditor';
import { QuestionBank } from './QuestionBank';
import { ReviewQueue } from './ReviewQueue';
import { ImportCenter } from './ImportCenter';
import { AdminUsers } from './AdminUsers';

type Page = 'shells' | 'questions' | 'reviews' | 'imports' | 'users';

interface LeadFormField {
  type: 'name' | 'email' | 'phone' | 'text';
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
  enabled: boolean;
}

interface LeadFormConfig {
  headline: string;
  fields: LeadFormField[];
  terms: { enabled: boolean; text: string; required: boolean };
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
      game: { show_progress_bar: boolean; show_question_number: boolean };
      end: { headline_template: string; show_score_breakdown: boolean };
      feedback: { correct_headline: string; incorrect_headline: string; show_explanation: boolean };
    };
    score_range_messages: Array<{ min: number; max: number; message: string }>;
  };
}

export function Admin() {
  const [currentPage, setCurrentPage] = useState<Page>('shells');
  const [selectedShell, setSelectedShell] = useState<Shell | null>(null);
  const [isCreatingShell, setIsCreatingShell] = useState(false);

  function handleNavigate(page: string) {
    setCurrentPage(page as Page);
    setSelectedShell(null);
    setIsCreatingShell(false);
  }

  function renderContent() {
    if (selectedShell || isCreatingShell) {
      return (
        <ShellEditor
          shell={selectedShell}
          onBack={() => {
            setSelectedShell(null);
            setIsCreatingShell(false);
          }}
          onSave={() => {
            setSelectedShell(null);
            setIsCreatingShell(false);
          }}
        />
      );
    }

    switch (currentPage) {
      case 'shells':
        return (
          <ShellList
            onSelectShell={(shell) => setSelectedShell(shell as unknown as Shell)}
            onCreateShell={() => setIsCreatingShell(true)}
          />
        );
      case 'questions':
        return <QuestionBank />;
      case 'reviews':
        return <ReviewQueue />;
      case 'imports':
        return <ImportCenter />;
      case 'users':
        return <AdminUsers />;
      default:
        return null;
    }
  }

  return (
    <AdminLayout currentPage={currentPage} onNavigate={handleNavigate}>
      {renderContent()}
    </AdminLayout>
  );
}

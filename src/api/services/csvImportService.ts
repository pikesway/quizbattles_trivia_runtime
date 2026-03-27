import { ImportRepository } from '../repositories/importRepository';
import { QuestionBankService, CreateQuestionWithAnswersInput } from './questionBankService';
import {
  QuestionImportBatch,
  CSVImportRow,
  DifficultyLevel,
  ImportErrorDetail,
} from '../../types/authoring';

export interface CSVImportResult {
  batch: QuestionImportBatch;
  created_question_ids: string[];
  errors: ImportErrorDetail[];
}

export class CSVImportService {
  private importRepo: ImportRepository;
  private questionService: QuestionBankService;

  constructor() {
    this.importRepo = new ImportRepository();
    this.questionService = new QuestionBankService();
  }

  async importFromCSV(
    csvContent: string,
    filename: string,
    shellSlug?: string,
    userId?: string
  ): Promise<CSVImportResult> {
    const rows = this.parseCSV(csvContent);

    if (rows.length === 0) {
      throw new Error('CSV file is empty or has no valid rows');
    }

    const batch = await this.importRepo.createBatch({
      source_type: 'csv',
      source_identifier: filename,
      shell_slug: shellSlug,
      total_items: rows.length,
      raw_metadata: { filename, row_count: rows.length },
      created_by: userId,
    });

    const createdQuestionIds: string[] = [];
    const errors: ImportErrorDetail[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;

      try {
        const validationErrors = this.validateRow(row, rowNumber);
        if (validationErrors.length > 0) {
          errors.push(...validationErrors);
          continue;
        }

        const questionInput = this.rowToQuestionInput(row, batch.id);
        const question = await this.questionService.createQuestion(questionInput);
        createdQuestionIds.push(question.id);
      } catch (err) {
        errors.push({
          row: rowNumber,
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const successCount = createdQuestionIds.length;
    const failureCount = errors.length;
    const status = failureCount === rows.length ? 'failed' :
                   failureCount > 0 ? 'completed' : 'completed';

    await this.importRepo.updateBatchStatus(
      batch.id,
      status,
      successCount,
      failureCount,
      errors
    );

    const updatedBatch = await this.importRepo.getBatch(batch.id);

    return {
      batch: updatedBatch!,
      created_question_ids: createdQuestionIds,
      errors,
    };
  }

  private parseCSV(content: string): CSVImportRow[] {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];

    const headerLine = lines[0];
    const headers = this.parseCSVLine(headerLine).map(h => h.toLowerCase().trim());

    const requiredHeaders = [
      'topic', 'question', 'difficulty',
      'answer_1', 'answer_1_is_correct',
      'answer_2', 'answer_2_is_correct',
    ];

    for (const required of requiredHeaders) {
      if (!headers.includes(required)) {
        throw new Error(`Missing required header: ${required}`);
      }
    }

    const rows: CSVImportRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = this.parseCSVLine(line);
      const row: Record<string, string> = {};

      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      rows.push(row as unknown as CSVImportRow);
    }

    return rows;
  }

  private parseCSVLine(line: string): string[] {
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

  private validateRow(row: CSVImportRow, rowNumber: number): ImportErrorDetail[] {
    const errors: ImportErrorDetail[] = [];

    if (!row.question || row.question.trim().length === 0) {
      errors.push({ row: rowNumber, field: 'question', message: 'Question text is required' });
    }

    if (!row.topic || row.topic.trim().length === 0) {
      errors.push({ row: rowNumber, field: 'topic', message: 'Topic is required' });
    }

    const difficulty = row.difficulty?.toLowerCase().trim();
    if (!difficulty || !['easy', 'medium', 'hard'].includes(difficulty)) {
      errors.push({
        row: rowNumber,
        field: 'difficulty',
        message: 'Difficulty must be easy, medium, or hard',
        value: row.difficulty,
      });
    }

    const answers = this.extractAnswers(row);
    if (answers.length < 2) {
      errors.push({ row: rowNumber, message: 'At least 2 answers are required' });
    }

    const correctCount = answers.filter(a => a.is_correct).length;
    if (correctCount === 0) {
      errors.push({ row: rowNumber, message: 'At least one answer must be marked as correct' });
    } else if (correctCount > 1) {
      errors.push({ row: rowNumber, message: 'Only one answer can be marked as correct' });
    }

    for (let i = 0; i < answers.length; i++) {
      if (!answers[i].text || answers[i].text.trim().length === 0) {
        errors.push({
          row: rowNumber,
          field: `answer_${i + 1}`,
          message: `Answer ${i + 1} text is empty`,
        });
      }
    }

    return errors;
  }

  private extractAnswers(row: CSVImportRow): Array<{ text: string; is_correct: boolean }> {
    const answers: Array<{ text: string; is_correct: boolean }> = [];

    for (let i = 1; i <= 4; i++) {
      const textKey = `answer_${i}` as keyof CSVImportRow;
      const correctKey = `answer_${i}_is_correct` as keyof CSVImportRow;

      const text = row[textKey];
      const isCorrectStr = row[correctKey];

      if (text && text.trim().length > 0) {
        const isCorrect = this.parseBooleanValue(isCorrectStr);
        answers.push({ text: text.trim(), is_correct: isCorrect });
      }
    }

    return answers;
  }

  private parseBooleanValue(value: string | undefined): boolean {
    if (!value) return false;
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'y';
  }

  private rowToQuestionInput(
    row: CSVImportRow,
    batchId: string
  ): CreateQuestionWithAnswersInput {
    const tags = row.tags
      ? row.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
      : [];

    return {
      question_text: row.question.trim(),
      explanation: row.explanation?.trim() || '',
      topic: row.topic.trim(),
      tags,
      difficulty_level: row.difficulty.toLowerCase().trim() as DifficultyLevel,
      answers: this.extractAnswers(row),
      review_state: 'pending_review',
      source_type: 'csv',
      source_batch_id: batchId,
    };
  }
}

import { ShellRepository } from '../repositories/shellRepository';
import {
  TriviaShell,
  ShellQuestionLink,
  CreateShellInput,
  UpdateShellInput,
  ShellListFilters,
  ShellStatus,
  ShellConfig,
} from '../../types/authoring';

export class ShellService {
  private shellRepo: ShellRepository;

  constructor() {
    this.shellRepo = new ShellRepository();
  }

  async createShell(input: CreateShellInput, userId?: string): Promise<TriviaShell> {
    const slugExists = await this.shellRepo.slugExists(input.slug);
    if (slugExists) {
      throw new Error(`Shell with slug "${input.slug}" already exists`);
    }

    return this.shellRepo.create(input, userId);
  }

  async getShell(id: string): Promise<TriviaShell> {
    const shell = await this.shellRepo.getById(id);
    if (!shell) {
      throw new Error('Shell not found');
    }
    return shell;
  }

  async getShellBySlug(slug: string): Promise<TriviaShell> {
    const shell = await this.shellRepo.getBySlug(slug);
    if (!shell) {
      throw new Error('Shell not found');
    }
    return shell;
  }

  async listShells(filters: ShellListFilters = {}): Promise<TriviaShell[]> {
    return this.shellRepo.list(filters);
  }

  async updateShell(id: string, input: UpdateShellInput, userId?: string): Promise<TriviaShell> {
    const shell = await this.shellRepo.getById(id);
    if (!shell) {
      throw new Error('Shell not found');
    }

    if (input.slug && input.slug !== shell.slug) {
      const slugExists = await this.shellRepo.slugExists(input.slug, id);
      if (slugExists) {
        throw new Error(`Shell with slug "${input.slug}" already exists`);
      }
    }

    if (input.config) {
      input.config = this.mergeConfig(shell.config, input.config);
    }

    return this.shellRepo.update(id, input, userId);
  }

  async updateShellStatus(id: string, status: ShellStatus, userId?: string): Promise<TriviaShell> {
    const shell = await this.shellRepo.getById(id);
    if (!shell) {
      throw new Error('Shell not found');
    }

    this.validateStatusTransition(shell.status, status);

    return this.shellRepo.updateStatus(id, status, userId);
  }

  async cloneShell(id: string, newSlug: string, newName: string, userId?: string): Promise<TriviaShell> {
    const sourceShell = await this.shellRepo.getById(id);
    if (!sourceShell) {
      throw new Error('Source shell not found');
    }

    const slugExists = await this.shellRepo.slugExists(newSlug);
    if (slugExists) {
      throw new Error(`Shell with slug "${newSlug}" already exists`);
    }

    const newShell = await this.shellRepo.create({
      internal_name: newName,
      slug: newSlug,
      topic: sourceShell.topic,
      tags: sourceShell.tags,
      visibility: sourceShell.visibility,
    }, userId);

    await this.shellRepo.update(newShell.id, {
      default_selection_mode: sourceShell.default_selection_mode,
      default_question_count: sourceShell.default_question_count,
      default_difficulty_mix: sourceShell.default_difficulty_mix,
      default_timer_mode: sourceShell.default_timer_mode,
      default_timer_seconds: sourceShell.default_timer_seconds,
      is_start_screen_enabled: sourceShell.is_start_screen_enabled,
      is_lead_screen_enabled: sourceShell.is_lead_screen_enabled,
      config: sourceShell.config,
    }, userId);

    if (sourceShell.default_selection_mode === 'fixed') {
      const links = await this.shellRepo.getQuestionLinks(id);
      for (const link of links) {
        await this.shellRepo.addQuestionLink(newShell.id, link.question_id, link.position, userId);
      }
    }

    return this.shellRepo.getById(newShell.id) as Promise<TriviaShell>;
  }

  async archiveShell(id: string, userId?: string): Promise<TriviaShell> {
    return this.updateShellStatus(id, 'archived', userId);
  }

  async deleteShell(id: string): Promise<void> {
    const shell = await this.shellRepo.getById(id);
    if (!shell) {
      throw new Error('Shell not found');
    }

    if (shell.status === 'active') {
      throw new Error('Cannot delete an active shell. Archive it first.');
    }

    await this.shellRepo.delete(id);
  }

  async getShellQuestions(shellId: string): Promise<ShellQuestionLink[]> {
    const shell = await this.shellRepo.getById(shellId);
    if (!shell) {
      throw new Error('Shell not found');
    }

    return this.shellRepo.getQuestionLinks(shellId);
  }

  async addQuestionToShell(
    shellId: string,
    questionId: string,
    position?: number,
    userId?: string
  ): Promise<ShellQuestionLink> {
    const shell = await this.shellRepo.getById(shellId);
    if (!shell) {
      throw new Error('Shell not found');
    }

    if (shell.default_selection_mode !== 'fixed') {
      throw new Error('Can only add questions to fixed-mode shells');
    }

    const currentCount = await this.shellRepo.getQuestionLinkCount(shellId);
    const finalPosition = position || currentCount + 1;

    return this.shellRepo.addQuestionLink(shellId, questionId, finalPosition, userId);
  }

  async removeQuestionFromShell(shellId: string, questionId: string): Promise<void> {
    const shell = await this.shellRepo.getById(shellId);
    if (!shell) {
      throw new Error('Shell not found');
    }

    await this.shellRepo.removeQuestionLink(shellId, questionId);

    const links = await this.shellRepo.getQuestionLinks(shellId);
    const orderedIds = links.map(l => l.question_id);
    if (orderedIds.length > 0) {
      await this.shellRepo.reorderQuestionLinks(shellId, orderedIds);
    }
  }

  async reorderShellQuestions(shellId: string, orderedQuestionIds: string[]): Promise<void> {
    const shell = await this.shellRepo.getById(shellId);
    if (!shell) {
      throw new Error('Shell not found');
    }

    await this.shellRepo.reorderQuestionLinks(shellId, orderedQuestionIds);
  }

  private validateStatusTransition(currentStatus: ShellStatus, newStatus: ShellStatus): void {
    const allowedTransitions: Record<ShellStatus, ShellStatus[]> = {
      draft: ['ready', 'archived'],
      ready: ['draft', 'active', 'archived'],
      active: ['ready', 'archived'],
      archived: ['draft'],
    };

    if (!allowedTransitions[currentStatus].includes(newStatus)) {
      throw new Error(
        `Cannot transition from ${currentStatus} to ${newStatus}. ` +
        `Allowed transitions: ${allowedTransitions[currentStatus].join(', ')}`
      );
    }
  }

  private mergeConfig(existing: ShellConfig, updates: Partial<ShellConfig>): ShellConfig {
    return {
      theme: updates.theme ? { ...existing.theme, ...updates.theme } : existing.theme,
      backgrounds: updates.backgrounds ? { ...existing.backgrounds, ...updates.backgrounds } : existing.backgrounds,
      screens: updates.screens ? {
        start: updates.screens.start ? { ...existing.screens.start, ...updates.screens.start } : existing.screens.start,
        lead: updates.screens.lead ? { ...existing.screens.lead, ...updates.screens.lead } : existing.screens.lead,
        game: updates.screens.game ? { ...existing.screens.game, ...updates.screens.game } : existing.screens.game,
        end: updates.screens.end ? { ...existing.screens.end, ...updates.screens.end } : existing.screens.end,
        feedback: updates.screens.feedback ? { ...existing.screens.feedback, ...updates.screens.feedback } : existing.screens.feedback,
      } : existing.screens,
      score_range_messages: updates.score_range_messages || existing.score_range_messages,
    };
  }
}

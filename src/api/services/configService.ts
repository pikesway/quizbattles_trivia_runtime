import { GameInstanceConfig, LeadField } from '../../types/trivia';
import { ShellConfigResolver, PlatformOverrides } from './shellConfigResolver';
import { ResolvedShellConfig } from '../../types/authoring';

export interface ConfigResolutionResult {
  config: GameInstanceConfig;
  resolved_shell_config: ResolvedShellConfig | null;
  shell_id: string | null;
}

export class ConfigService {
  private shellResolver: ShellConfigResolver;

  constructor() {
    this.shellResolver = new ShellConfigResolver();
  }

  getMockConfig(): GameInstanceConfig {
    return {
      question_mode: 'random',
      question_count: 10,
      timer: {
        mode: 'per_question',
        seconds: 15,
      },
      scoring_mode: 'accuracy_only',
      end_screen_rules: [
        { min: 0, max: 0, text: 'Try again! Better luck next time.' },
        { min: 1, max: 4, text: 'Not bad! Keep practicing.' },
        { min: 5, max: 7, text: 'Good job! You know your stuff.' },
        { min: 8, max: 9, text: 'Excellent! Almost perfect.' },
        { min: 10, max: 10, text: 'Legend! Perfect score!' },
      ],
      lead_capture: {
        enabled: true,
        fields: [
          { name: 'email', required: true, visible: true },
          { name: 'name', required: false, visible: true },
        ],
      },
      ui: {
        background_url: 'https://images.pexels.com/photos/1939485/pexels-photo-1939485.jpeg',
      },
    };
  }

  async getConfig(_campaignGameInstanceId: string): Promise<GameInstanceConfig> {
    return this.getMockConfig();
  }

  async getConfigFromShell(
    shellIdOrSlug: string,
    platformOverrides?: PlatformOverrides,
    platformLeadCapture?: { enabled: boolean; fields: LeadField[] }
  ): Promise<ConfigResolutionResult> {
    try {
      const resolvedShellConfig = await this.shellResolver.resolveConfig(
        shellIdOrSlug,
        platformOverrides
      );

      const config = this.shellResolver.toGameInstanceConfig(
        resolvedShellConfig,
        platformLeadCapture
      );

      return {
        config,
        resolved_shell_config: resolvedShellConfig,
        shell_id: resolvedShellConfig.shell_id,
      };
    } catch {
      return {
        config: this.getMockConfig(),
        resolved_shell_config: null,
        shell_id: null,
      };
    }
  }

  async getConfigWithFallback(
    shellIdOrSlug: string | undefined,
    _campaignGameInstanceId: string,
    platformOverrides?: PlatformOverrides,
    platformLeadCapture?: { enabled: boolean; fields: LeadField[] }
  ): Promise<ConfigResolutionResult> {
    if (shellIdOrSlug) {
      return this.getConfigFromShell(shellIdOrSlug, platformOverrides, platformLeadCapture);
    }

    return {
      config: this.getMockConfig(),
      resolved_shell_config: null,
      shell_id: null,
    };
  }
}

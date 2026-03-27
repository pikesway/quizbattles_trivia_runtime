export interface PlatformLeadCaptureRequest {
  campaign_id: string;
  data: Record<string, string>;
}

export interface PlatformLeadCaptureResponse {
  lead_id: string;
}

export interface PlatformGamePlayRequest {
  campaign_id: string;
  campaign_game_instance_id: string;
  lead_id: string;
  score: number;
  completion_time_ms: number;
  session_id: string;
}

export class PlatformService {
  private platformBaseUrl: string;

  constructor(platformBaseUrl?: string) {
    this.platformBaseUrl = platformBaseUrl || 'https://platform.bizgamez.com';
  }

  async captureLeadOnPlatform(request: PlatformLeadCaptureRequest): Promise<PlatformLeadCaptureResponse> {
    try {
      const response = await fetch(`${this.platformBaseUrl}/api/leads/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Platform API error: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to capture lead on platform:', error);
      throw new Error('Failed to communicate with platform');
    }
  }

  async recordGamePlayOnPlatform(request: PlatformGamePlayRequest): Promise<void> {
    try {
      const response = await fetch(`${this.platformBaseUrl}/api/game-play/record`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Platform API error: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to record game play on platform:', error);
    }
  }
}

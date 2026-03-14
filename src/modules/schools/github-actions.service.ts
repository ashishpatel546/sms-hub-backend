import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Thin wrapper around the GitHub Actions REST API.
 * Used to trigger a workflow_dispatch event when an admin uploads a new logo,
 * so the school's frontend image is automatically rebuilt with updated PWA icons.
 *
 * Required env vars:
 *   GITHUB_ACTIONS_TOKEN   — fine-grained PAT with "Actions: Write" permission
 *   GITHUB_REPO            — e.g. "myorg/school-management"
 *   GITHUB_FRONTEND_WORKFLOW — e.g. "build-school-frontend.yml"
 */
@Injectable()
export class GithubActionsService {
  private readonly logger = new Logger(GithubActionsService.name);

  private readonly token: string | undefined;
  private readonly repo: string | undefined;
  private readonly workflow: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.token = this.configService.get<string>('GITHUB_ACTIONS_TOKEN');
    this.repo = this.configService.get<string>('GITHUB_REPO');
    this.workflow = this.configService.get<string>('GITHUB_FRONTEND_WORKFLOW');
  }

  /**
   * Dispatch the build-school-frontend workflow for the given school slug.
   * Logs a warning and returns gracefully if GitHub Actions env vars are not configured
   * (e.g. in local development).
   */
  async triggerFrontendRebuild(schoolSlug: string): Promise<void> {
    if (!this.token || !this.repo || !this.workflow) {
      this.logger.warn(
        'GitHub Actions env vars (GITHUB_ACTIONS_TOKEN / GITHUB_REPO / GITHUB_FRONTEND_WORKFLOW) ' +
          'are not set — skipping automatic frontend rebuild trigger.'
      );
      return;
    }

    const url = `https://api.github.com/repos/${this.repo}/actions/workflows/${this.workflow}/dispatches`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { school_slug: schoolSlug },
      }),
    });

    // GitHub returns 204 No Content on success
    if (response.status === 204) {
      this.logger.log(
        `✅ GitHub Actions rebuild triggered for school: ${schoolSlug}`
      );
    } else {
      const body = await response.text();
      this.logger.error(
        `Failed to trigger GitHub Actions for ${schoolSlug}: HTTP ${response.status} — ${body}`
      );
    }
  }
}

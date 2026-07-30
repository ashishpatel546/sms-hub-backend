import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { GlobalConfigService } from '../../common/config/global-config.service';
import {
  CreateLlmTierDto,
  GrantCreditsDto,
  GrantPlanDto,
  CreatePlanDto,
  UpdateAllowedModelsDto,
  UpdateFeatureRolesDto,
  UpdateLlmPricingDto,
  UpdateLlmTiersDto,
  UpdatePlanDto,
  UpdateSettingDto,
} from './dto/ai-admin.dto';

/**
 * Proxies all school-ai admin operations via the INTERNAL_API_KEY.
 * sms-hub-backend never holds a school-ai admin JWT — the internal key
 * gives system-admin-level access to the /internal/hub/* endpoints.
 */
@Injectable()
export class AiAdminService {
  private readonly logger = new Logger(AiAdminService.name);

  constructor(private readonly config: GlobalConfigService) {}

  private get baseUrl(): string {
    return this.config.env.AI_BACKEND_URL;
  }

  private get internalKey(): string {
    return this.config.env.AI_INTERNAL_KEY;
  }

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1/internal${path}`;
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': this.internalKey,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status >= 400 && res.status < 500) {
          // Surface school-ai validation messages (e.g. unknown model) to the UI
          let detail: unknown = text;
          try {
            detail = JSON.parse(text)?.detail ?? text;
          } catch {
            // not JSON — keep raw text
          }
          // FastAPI 422 detail is an array of {type, loc, msg, input} objects
          const message = Array.isArray(detail)
            ? detail.map((d: any) => d?.msg ?? JSON.stringify(d)).join('; ')
            : typeof detail === 'string'
              ? detail
              : JSON.stringify(detail);
          throw new BadRequestException(
            message || `AI backend returned ${res.status}`,
          );
        }
        throw new InternalServerErrorException(
          `AI backend returned ${res.status}: ${text}`,
        );
      }

      // 204 No Content — return empty object
      if (res.status === 204) return {} as T;
      return res.json() as Promise<T>;
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(
        `AI admin call failed [${method} ${path}]: ${err?.message}`,
      );
      throw new InternalServerErrorException(
        'Could not reach AI service. Please try again.',
      );
    }
  }

  getOverview(billingMonth?: string) {
    const qs = billingMonth ? `?billing_month=${billingMonth}` : '';
    return this.call('GET', `/hub/overview${qs}`);
  }

  listUsers(page = 1, limit = 25, search = '', schoolId = '') {
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(search && { search }),
      ...(schoolId && { school_id: schoolId }),
    });
    return this.call('GET', `/hub/users?${qs}`);
  }

  grantCredits(userId: string, dto: GrantCreditsDto) {
    return this.call('POST', `/hub/users/${userId}/grant-credits`, dto);
  }

  grantPlan(userId: string, dto: GrantPlanDto) {
    return this.call('POST', `/hub/users/${userId}/grant-plan`, dto);
  }

  listPlans() {
    return this.call('GET', '/hub/plans');
  }

  createPlan(dto: CreatePlanDto) {
    return this.call('POST', '/hub/plans', dto);
  }

  updatePlan(planId: string, dto: UpdatePlanDto) {
    return this.call('PATCH', `/hub/plans/${planId}`, dto);
  }

  deletePlan(planId: string) {
    return this.call('DELETE', `/hub/plans/${planId}`);
  }

  getSettings() {
    return this.call('GET', '/hub/settings');
  }

  updateSetting(key: string, dto: UpdateSettingDto) {
    return this.call('PUT', `/hub/settings/${key}`, dto);
  }

  getLlmTiers() {
    return this.call('GET', '/hub/llm-tiers');
  }

  updateLlmTiers(dto: UpdateLlmTiersDto) {
    return this.call('PUT', '/hub/llm-tiers', dto);
  }

  createLlmTier(dto: CreateLlmTierDto) {
    return this.call('POST', '/hub/llm-tiers', dto);
  }

  deleteLlmTier(tierId: string) {
    return this.call('DELETE', `/hub/llm-tiers/${tierId}`);
  }

  listLlmModels(provider: string, refresh = false) {
    const qs = new URLSearchParams({
      provider,
      ...(refresh && { refresh: 'true' }),
    });
    return this.call('GET', `/hub/llm-models?${qs}`);
  }

  updateAllowedModels(dto: UpdateAllowedModelsDto) {
    return this.call('PUT', '/hub/llm-models', dto);
  }

  getLlmPricing() {
    return this.call('GET', '/hub/llm-pricing');
  }

  updateLlmPricing(dto: UpdateLlmPricingDto) {
    return this.call('PUT', '/hub/llm-pricing', dto);
  }

  getFeatureRoles() {
    return this.call('GET', '/hub/feature-roles');
  }

  updateFeatureRoles(dto: UpdateFeatureRolesDto) {
    return this.call('PUT', '/hub/feature-roles', dto);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { HubAccessGuard } from '../auth/hub-access.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MinAccess } from '../../common/decorators/min-access.decorator';
import {
  HubAccessLevel,
  HubUserRole,
} from '../hub-users/entities/hub-user.entity';
import { AiAdminService } from './ai-admin.service';
import {
  CreateLlmTierDto,
  CreatePlanDto,
  GrantCreditsDto,
  GrantPlanDto,
  UpdateAllowedModelsDto,
  UpdateFeatureRolesDto,
  UpdateLlmPricingDto,
  UpdateLlmTiersDto,
  UpdatePlanDto,
  UpdateSettingDto,
} from './dto/ai-admin.dto';

/**
 * `@Roles(SYSTEM_ADMIN)` is not access control inside the hub — every hub
 * user carries that role, because it is the cross-service contract
 * `sms-backend` reads off the shared-secret JWT. `@MinAccess` is what
 * actually separates a VIEW operator from an EDIT one here.
 *
 * The split applied below:
 *   VIEW  — reads that answer "what is going on": stats, users, plans.
 *   EDIT  — day-to-day operational changes: granting credits and plans,
 *           authoring plans.
 *   ADMIN — platform configuration and anything with money or capability in
 *           it: settings, model tiers, the allowed-model shortlist, pricing,
 *           and the feature→role map. Read as well as write — the pricing
 *           table and provider shortlist are commercially sensitive, and the
 *           feature→role map is a description of who may do what, which is
 *           the console governing itself.
 */
@ApiTags('AI Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, HubAccessGuard)
@Roles(HubUserRole.SYSTEM_ADMIN)
@Controller('ai-admin')
export class AiAdminController {
  constructor(private readonly svc: AiAdminService) {}

  // ── Overview ───────────────────────────────────────────────────────────────

  @Get('overview')
  @MinAccess(HubAccessLevel.VIEW)
  @ApiOperation({ summary: 'AI platform overview stats' })
  getOverview(@Query('billing_month') billingMonth?: string) {
    return this.svc.getOverview(billingMonth);
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  @Get('users')
  @MinAccess(HubAccessLevel.VIEW)
  @ApiOperation({ summary: 'List AI users (paginated, searchable)' })
  listUsers(
    @Query('page') page = 1,
    @Query('limit') limit = 25,
    @Query('search') search = '',
    @Query('school_id') schoolId = '',
  ) {
    return this.svc.listUsers(+page, +limit, search, schoolId);
  }

  /**
   * Granting credits or a plan gives away something we bill for, and nothing
   * downstream asks a second time — so it is ADMIN rather than EDIT despite
   * being ordinary day-to-day work. Handing out paid capacity is a financial
   * decision, not an operational one.
   */
  @Post('users/:userId/grant-credits')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({ summary: 'Grant bonus credits to a user' })
  grantCredits(@Param('userId') userId: string, @Body() dto: GrantCreditsDto) {
    return this.svc.grantCredits(userId, dto);
  }

  @Post('users/:userId/grant-plan')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({ summary: 'Grant a plan to a user with a custom expiry date' })
  grantPlan(@Param('userId') userId: string, @Body() dto: GrantPlanDto) {
    return this.svc.grantPlan(userId, dto);
  }

  // ── Plans ──────────────────────────────────────────────────────────────────

  @Get('plans')
  @MinAccess(HubAccessLevel.VIEW)
  @ApiOperation({ summary: 'List all AI plans' })
  listPlans() {
    return this.svc.listPlans();
  }

  // Plans are the price list. Creating, repricing or withdrawing one changes
  // what every customer on it is charged, so it sits with the other
  // commercial controls at ADMIN.
  @Post('plans')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({ summary: 'Create a new AI plan' })
  createPlan(@Body() dto: CreatePlanDto) {
    return this.svc.createPlan(dto);
  }

  @Patch('plans/:planId')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({ summary: 'Update an AI plan' })
  updatePlan(@Param('planId') planId: string, @Body() dto: UpdatePlanDto) {
    return this.svc.updatePlan(planId, dto);
  }

  @Delete('plans/:planId')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({ summary: 'Delete an AI plan' })
  deletePlan(@Param('planId') planId: string) {
    return this.svc.deletePlan(planId);
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  @Get('settings')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({ summary: 'List all platform settings' })
  getSettings() {
    return this.svc.getSettings();
  }

  @Put('settings/:key')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({ summary: 'Update a platform setting' })
  updateSetting(@Param('key') key: string, @Body() dto: UpdateSettingDto) {
    return this.svc.updateSetting(key, dto);
  }

  // ── LLM model tiers ────────────────────────────────────────────────────────

  @Get('llm-tiers')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({ summary: 'Get LLM provider/model config per tier' })
  getLlmTiers() {
    return this.svc.getLlmTiers();
  }

  @Put('llm-tiers')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({ summary: 'Update LLM provider/model config per tier' })
  updateLlmTiers(@Body() dto: UpdateLlmTiersDto) {
    return this.svc.updateLlmTiers(dto);
  }

  @Post('llm-tiers')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({ summary: 'Create a new model tier' })
  createLlmTier(@Body() dto: CreateLlmTierDto) {
    return this.svc.createLlmTier(dto);
  }

  @Delete('llm-tiers/:tierId')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({ summary: 'Delete a model tier (must be unused by any plan)' })
  deleteLlmTier(@Param('tierId') tierId: string) {
    return this.svc.deleteLlmTier(tierId);
  }

  @Get('llm-models')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({
    summary: 'List live models from a provider + allowed shortlist',
  })
  listLlmModels(
    @Query('provider') provider: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.svc.listLlmModels(provider, refresh === 'true');
  }

  @Put('llm-models')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({
    summary: 'Update the allowed model shortlist for a provider',
  })
  updateAllowedModels(@Body() dto: UpdateAllowedModelsDto) {
    return this.svc.updateAllowedModels(dto);
  }

  @Get('llm-pricing')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({ summary: 'Get per-model pricing map and USD→INR rate' })
  getLlmPricing() {
    return this.svc.getLlmPricing();
  }

  @Put('llm-pricing')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({ summary: 'Update per-model pricing map and USD→INR rate' })
  updateLlmPricing(@Body() dto: UpdateLlmPricingDto) {
    return this.svc.updateLlmPricing(dto);
  }

  @Get('feature-roles')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({ summary: 'Get feature → allowed roles map' })
  getFeatureRoles() {
    return this.svc.getFeatureRoles();
  }

  @Put('feature-roles')
  @MinAccess(HubAccessLevel.ADMIN)
  @ApiOperation({ summary: 'Update feature → allowed roles map' })
  updateFeatureRoles(@Body() dto: UpdateFeatureRolesDto) {
    return this.svc.updateFeatureRoles(dto);
  }
}

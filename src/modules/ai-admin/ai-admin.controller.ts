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
import { Roles } from '../../common/decorators/roles.decorator';
import { HubUserRole } from '../hub-users/entities/hub-user.entity';
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

@ApiTags('AI Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(HubUserRole.SYSTEM_ADMIN)
@Controller('ai-admin')
export class AiAdminController {
  constructor(private readonly svc: AiAdminService) {}

  // ── Overview ───────────────────────────────────────────────────────────────

  @Get('overview')
  @ApiOperation({ summary: 'AI platform overview stats' })
  getOverview(@Query('billing_month') billingMonth?: string) {
    return this.svc.getOverview(billingMonth);
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List AI users (paginated, searchable)' })
  listUsers(
    @Query('page') page = 1,
    @Query('limit') limit = 25,
    @Query('search') search = '',
    @Query('school_id') schoolId = '',
  ) {
    return this.svc.listUsers(+page, +limit, search, schoolId);
  }

  @Post('users/:userId/grant-credits')
  @ApiOperation({ summary: 'Grant bonus credits to a user' })
  grantCredits(@Param('userId') userId: string, @Body() dto: GrantCreditsDto) {
    return this.svc.grantCredits(userId, dto);
  }

  @Post('users/:userId/grant-plan')
  @ApiOperation({ summary: 'Grant a plan to a user with a custom expiry date' })
  grantPlan(@Param('userId') userId: string, @Body() dto: GrantPlanDto) {
    return this.svc.grantPlan(userId, dto);
  }

  // ── Plans ──────────────────────────────────────────────────────────────────

  @Get('plans')
  @ApiOperation({ summary: 'List all AI plans' })
  listPlans() {
    return this.svc.listPlans();
  }

  @Post('plans')
  @ApiOperation({ summary: 'Create a new AI plan' })
  createPlan(@Body() dto: CreatePlanDto) {
    return this.svc.createPlan(dto);
  }

  @Patch('plans/:planId')
  @ApiOperation({ summary: 'Update an AI plan' })
  updatePlan(@Param('planId') planId: string, @Body() dto: UpdatePlanDto) {
    return this.svc.updatePlan(planId, dto);
  }

  @Delete('plans/:planId')
  @ApiOperation({ summary: 'Delete an AI plan' })
  deletePlan(@Param('planId') planId: string) {
    return this.svc.deletePlan(planId);
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  @Get('settings')
  @ApiOperation({ summary: 'List all platform settings' })
  getSettings() {
    return this.svc.getSettings();
  }

  @Put('settings/:key')
  @ApiOperation({ summary: 'Update a platform setting' })
  updateSetting(@Param('key') key: string, @Body() dto: UpdateSettingDto) {
    return this.svc.updateSetting(key, dto);
  }

  // ── LLM model tiers ────────────────────────────────────────────────────────

  @Get('llm-tiers')
  @ApiOperation({ summary: 'Get LLM provider/model config per tier' })
  getLlmTiers() {
    return this.svc.getLlmTiers();
  }

  @Put('llm-tiers')
  @ApiOperation({ summary: 'Update LLM provider/model config per tier' })
  updateLlmTiers(@Body() dto: UpdateLlmTiersDto) {
    return this.svc.updateLlmTiers(dto);
  }

  @Post('llm-tiers')
  @ApiOperation({ summary: 'Create a new model tier' })
  createLlmTier(@Body() dto: CreateLlmTierDto) {
    return this.svc.createLlmTier(dto);
  }

  @Delete('llm-tiers/:tierId')
  @ApiOperation({ summary: 'Delete a model tier (must be unused by any plan)' })
  deleteLlmTier(@Param('tierId') tierId: string) {
    return this.svc.deleteLlmTier(tierId);
  }

  @Get('llm-models')
  @ApiOperation({ summary: 'List live models from a provider + allowed shortlist' })
  listLlmModels(
    @Query('provider') provider: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.svc.listLlmModels(provider, refresh === 'true');
  }

  @Put('llm-models')
  @ApiOperation({ summary: 'Update the allowed model shortlist for a provider' })
  updateAllowedModels(@Body() dto: UpdateAllowedModelsDto) {
    return this.svc.updateAllowedModels(dto);
  }

  @Get('llm-pricing')
  @ApiOperation({ summary: 'Get per-model pricing map and USD→INR rate' })
  getLlmPricing() {
    return this.svc.getLlmPricing();
  }

  @Put('llm-pricing')
  @ApiOperation({ summary: 'Update per-model pricing map and USD→INR rate' })
  updateLlmPricing(@Body() dto: UpdateLlmPricingDto) {
    return this.svc.updateLlmPricing(dto);
  }

  @Get('feature-roles')
  @ApiOperation({ summary: 'Get feature → allowed roles map' })
  getFeatureRoles() {
    return this.svc.getFeatureRoles();
  }

  @Put('feature-roles')
  @ApiOperation({ summary: 'Update feature → allowed roles map' })
  updateFeatureRoles(@Body() dto: UpdateFeatureRolesDto) {
    return this.svc.updateFeatureRoles(dto);
  }
}

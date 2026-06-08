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
  CreatePlanDto,
  GrantCreditsDto,
  GrantPlanDto,
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
}

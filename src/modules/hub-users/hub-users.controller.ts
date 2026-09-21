import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HubAccessGuard } from '../auth/hub-access.guard';
import { MinAccess } from '../../common/decorators/min-access.decorator';
import { HubAccessLevel } from './entities/hub-user.entity';
import { HubUsersService } from './hub-users.service';
import {
  CreateHubUserDto,
  ResetHubUserPasswordDto,
  UpdateAccessLevelDto,
  UpdateHubUserDto,
  UpdateTotpRequiredDto,
} from './dto/hub-user.dto';

/**
 * Managing who can reach the platform console is itself the highest
 * privilege the console offers, so the whole controller sits behind ADMIN —
 * VIEW and EDIT users never see this surface at all.
 */
@ApiTags('hub-users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, HubAccessGuard)
@MinAccess(HubAccessLevel.ADMIN)
@Controller('hub-users')
export class HubUsersController {
  constructor(private readonly hubUsersService: HubUsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List every hub console user',
    description:
      'Each row carries `totpEnabled` so the console can show who is ' +
      'enrolled. The secret itself never leaves the server — see ' +
      '`HubUsersService.toPublic`.',
  })
  list() {
    return this.hubUsersService.list();
  }

  @Post()
  @ApiOperation({
    summary: 'Invite a hub console user (bootstrap password, forced change)',
  })
  create(@Body() body: CreateHubUserDto, @Request() req: any) {
    return this.hubUsersService.invite(body, req.user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a hub user’s name or email' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateHubUserDto,
  ) {
    return this.hubUsersService.updateProfile(id, body);
  }

  @Patch(':id/access-level')
  @ApiOperation({ summary: 'Change a hub user’s access level' })
  setAccessLevel(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateAccessLevelDto,
    @Request() req: any,
  ) {
    return this.hubUsersService.setAccessLevel(
      id,
      body.accessLevel,
      req.user.sub,
    );
  }

  @Patch(':id/toggle-status')
  @ApiOperation({
    summary: 'Activate or deactivate a hub user (revokes their sessions)',
  })
  toggleStatus(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.hubUsersService.toggleStatus(id, req.user.sub);
  }

  @Post(':id/reset-password')
  @ApiOperation({
    summary: 'Reset the password and revoke every session',
    description:
      "`mode: 'default'` uses the deployment-wide bootstrap password; " +
      "`mode: 'temporary'` generates a random one returned ONCE in " +
      '`temporaryPassword` and never retrievable again. Either way the user ' +
      'must change it at next sign-in. Leaves two-factor enrolment untouched: ' +
      'an enrolled user still has to pass TOTP before the forced password ' +
      'change — see POST :id/reset-totp to clear the second factor.',
  })
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ResetHubUserPasswordDto,
  ) {
    return this.hubUsersService.resetPassword(id, body.mode);
  }

  @Post(':id/reset-totp')
  @ApiOperation({
    summary: 'Clear a user’s two-factor enrolment and recovery codes',
    description:
      'For the operator who lost both their phone and their recovery codes. ' +
      'Clears the secret, the enrolment, the replay watermark and every ' +
      'recovery code, then revokes their sessions. A user with two-factor ' +
      'required must re-enrol at their next sign-in; an optional one signs ' +
      'in with the password only until they choose to enrol again. ' +
      'Idempotent — resetting a user who was never enrolled succeeds and ' +
      'changes nothing. An admin may reset anyone, including themselves.',
  })
  resetTotp(@Param('id', ParseIntPipe) id: number) {
    return this.hubUsersService.resetTotp(id);
  }

  @Patch(':id/totp-required')
  @ApiOperation({
    summary: 'Require (or stop requiring) two-factor for a hub user',
    description:
      'Two-factor is optional by default. `required: true` forces it: a ' +
      'user who has not enrolled must enrol at their next sign-in (their ' +
      'refresh handles are revoked so that comes sooner rather than later), ' +
      'and cannot turn it off afterwards. An already-enrolled user notices ' +
      'nothing. `required: false` returns them to optional and leaves any ' +
      'existing enrolment as it is.',
  })
  setTotpRequired(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTotpRequiredDto,
  ) {
    return this.hubUsersService.setTotpRequired(id, body.required);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a hub user and revoke their sessions' })
  remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.hubUsersService.remove(id, req.user.sub);
  }
}

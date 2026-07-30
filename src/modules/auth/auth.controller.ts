import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Headers,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login — system admin or school owner' })
  login(
    @Body() body: LoginDto,
    @Headers('user-agent') userAgent: string,
    @Headers('x-forwarded-for') forwardedFor: string,
    @Request() req: any,
  ) {
    return this.authService.login(body.email, body.password, {
      deviceInfo: userAgent,
      ipAddress: forwardedFor || req.ip,
    });
  }

  /**
   * Public by design — the caller's access token is expected to be dead by
   * the time they get here. The refresh token in the body is the credential.
   */
  @Public()
  @Post('refresh-token')
  @ApiOperation({ summary: 'Exchange a refresh token for a new access token' })
  refreshToken(
    @Body() body: RefreshTokenDto,
    @Headers('user-agent') userAgent: string,
    @Headers('x-forwarded-for') forwardedFor: string,
    @Request() req: any,
  ) {
    return this.authService.refreshSession(body.refreshToken, {
      deviceInfo: userAgent,
      ipAddress: forwardedFor || req.ip,
    });
  }

  /** Public for the same reason as refresh — logout must work on a dead token. */
  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current session' })
  logout(@Body() body: RefreshTokenDto) {
    return this.authService.logout(body.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke every session for the current admin' })
  logoutAll(@Request() req: any) {
    return this.authService.logoutAll(req.user.sub);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions for the current admin' })
  sessions(
    @Request() req: any,
    @Query('currentRefreshToken') currentRefreshToken?: string,
  ) {
    return this.authService.getSessions(req.user.sub, currentRefreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  me(@Request() req: any) {
    return req.user;
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password on first login' })
  changePassword(@Request() req: any, @Body() body: ChangePasswordDto) {
    return this.authService.changePassword(req.user.sub, body.password);
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { HubUsersService } from '../hub-users/hub-users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly hubUsersService: HubUsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.hubUsersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    };

    if (user.isFirstLogin) {
      return {
        requirePasswordChange: true,
        access_token: this.jwtService.sign(
          { ...payload, isChangePasswordOnly: true },
          { expiresIn: '15m' },
        ),
        role: user.role,
        email: user.email,
      };
    }

    return {
      requirePasswordChange: false,
      access_token: this.jwtService.sign(payload),
      role: user.role,
      email: user.email,
    };
  }

  async changePassword(userId: number, newPassword: string) {
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await this.hubUsersService.updatePassword(userId, newPasswordHash);
    return { success: true };
  }
}

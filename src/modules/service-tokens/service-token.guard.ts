import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ServiceToken } from './entities/service-token.entity';
import { School, SchoolStatus } from '../schools/entities/school.entity';

@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(
    @InjectRepository(ServiceToken)
    private readonly serviceTokenRepository: Repository<ServiceToken>,
    @InjectRepository(School)
    private readonly schoolRepository: Repository<School>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Service token required');
    }

    const rawToken = authHeader.substring(7);
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const serviceToken = await this.serviceTokenRepository.findOne({
      where: { tokenHash },
    });

    if (!serviceToken) {
      throw new UnauthorizedException('Invalid service token');
    }

    const school = await this.schoolRepository.findOne({
      where: { id: serviceToken.schoolId },
    });

    if (!school) {
      throw new UnauthorizedException('School not found');
    }

    if (school.status === SchoolStatus.SUSPENDED) {
      throw new ForbiddenException('School is suspended');
    }

    // Update last used timestamp (fire and forget)
    void this.serviceTokenRepository.update(serviceToken.id, {
      lastUsedAt: new Date(),
    });

    request.school = school;
    return true;
  }
}

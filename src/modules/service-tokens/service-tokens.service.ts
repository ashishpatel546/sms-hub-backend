import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ServiceToken } from './entities/service-token.entity';

@Injectable()
export class ServiceTokensService {
  constructor(
    @InjectRepository(ServiceToken)
    private readonly serviceTokenRepository: Repository<ServiceToken>,
  ) {}

  async generate(schoolId: number, label: string): Promise<{ token: string; id: number }> {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const serviceToken = await this.serviceTokenRepository.save(
      this.serviceTokenRepository.create({ tokenHash, schoolId, label }),
    );

    // Raw token returned only once — never stored in plain text
    return { token: rawToken, id: serviceToken.id };
  }

  async revoke(id: number): Promise<void> {
    await this.serviceTokenRepository.delete(id);
  }

  async findBySchool(schoolId: number): Promise<ServiceToken[]> {
    return this.serviceTokenRepository.find({
      where: { schoolId },
      select: ['id', 'label', 'lastUsedAt', 'createdAt'],
    });
  }
}

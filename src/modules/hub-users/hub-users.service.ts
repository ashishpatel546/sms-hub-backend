import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HubUser, HubUserRole } from './entities/hub-user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class HubUsersService {
  constructor(
    @InjectRepository(HubUser)
    private readonly hubUsersRepository: Repository<HubUser>,
  ) {}

  async findByEmail(email: string): Promise<HubUser | null> {
    return this.hubUsersRepository.findOne({ where: { email } });
  }

  async create(data: {
    email: string;
    password: string;
    role: HubUserRole;
    schoolId?: number;
  }): Promise<HubUser> {
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = this.hubUsersRepository.create({
      email: data.email,
      passwordHash,
      role: data.role,
      schoolId: data.schoolId ?? null,
    });
    return this.hubUsersRepository.save(user);
  }

  async updatePassword(userId: number, newPasswordHash: string): Promise<void> {
    await this.hubUsersRepository.update(userId, {
      passwordHash: newPasswordHash,
      isFirstLogin: false,
    });
  }
}

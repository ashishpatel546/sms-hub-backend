import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { School } from './entities/school.entity';
import { HubUsersService } from '../hub-users/hub-users.service';
import { HubUserRole } from '../hub-users/entities/hub-user.entity';
import { S3Service } from '../s3/s3.service';
import { GithubActionsService } from './github-actions.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { CreateSchoolAdminDto } from './dto/create-school-admin.dto';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

@Injectable()
export class SchoolsService {
  private readonly logger = new Logger(SchoolsService.name);

  constructor(
    @InjectRepository(School)
    private readonly schoolRepository: Repository<School>,
    private readonly hubUsersService: HubUsersService,
    private readonly s3Service: S3Service,
    private readonly dataSource: DataSource,
    private readonly tenantProvisioningService: TenantProvisioningService,
    private readonly githubActionsService: GithubActionsService
  ) {}

  async findAll(): Promise<School[]> {
    return this.schoolRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findBySlug(slug: string): Promise<School> {
    const school = await this.schoolRepository.findOne({ where: { slug } });
    if (!school) throw new NotFoundException(`School '${slug}' not found`);
    return school;
  }

  async create(dto: CreateSchoolDto): Promise<School> {
    const existing = await this.schoolRepository.findOne({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(`Slug '${dto.slug}' is already taken`);
    }

    // 1. Create the schema for the school
    this.logger.log(`Creating schema for school: ${dto.slug}`);
    await this.dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${dto.slug}"`);

    // 2. Save school record
    const school = this.schoolRepository.create({
      name: dto.name,
      slug: dto.slug,
    });
    const savedSchool = await this.schoolRepository.save(school);

    // 3. Run migrations for the new schema
    this.logger.log(`Running migrations for schema: ${dto.slug}`);
    try {
      const backendPath = path.join(process.cwd(), '../backend');
      const { stdout, stderr } = await execAsync('npm run migration:run', {
        cwd: backendPath,
        env: {
          ...process.env,
          DB_SCHEMA: dto.slug,
        },
      });
      this.logger.log(`Migrations output for ${dto.slug}: ${stdout}`);
      if (stderr) {
        this.logger.warn(`Migrations stderr for ${dto.slug}: ${stderr}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to run migrations for schema ${dto.slug}`,
        error.stack
      );
      // We don't throw an error here to prevent rolling back the school creation,
      // but you might want to handle it differently in production.
    }

    // 4. Provision Docker Infrastructure via Compose & S3 Sync
    try {
      this.logger.log(`Provisioning Docker infrastructure for ${dto.slug}`);
      await this.tenantProvisioningService.provisionSchoolInfrastructure(
        dto.slug,
        dto.name
      );
    } catch (error) {
      this.logger.error(
        `Failed to provision infrastructure for ${dto.slug}: ${error.message}`
      );
      // Infrastructure failure should be logged but shouldn't necessarily fail the DB transaction
    }

    return savedSchool;
  }

  async uploadLogo(
    slug: string,
    fileBuffer: Buffer,
    originalName: string
  ): Promise<School> {
    const school = await this.findBySlug(slug);
    const s3Key = await this.s3Service.uploadLogo(
      slug,
      fileBuffer,
      originalName
    );
    school.s3LogoKey = s3Key;
    const saved = await this.schoolRepository.save(school);

    // Trigger a frontend rebuild in CI so PWA icons are regenerated with the new logo.
    // This is fire-and-forget — a failure here should not block the logo upload response.
    this.githubActionsService
      .triggerFrontendRebuild(slug)
      .catch((err) =>
        this.logger.error(`Could not trigger frontend rebuild for ${slug}`, err)
      );

    return saved;
  }

  async getLogoPresignedUrl(slug: string): Promise<{ presignedUrl: string }> {
    const school = await this.findBySlug(slug);
    if (!school.s3LogoKey) {
      throw new NotFoundException(`No logo uploaded for school '${slug}'`);
    }
    const presignedUrl = await this.s3Service.getPresignedUrl(school.s3LogoKey);
    return { presignedUrl };
  }

  async createSchoolAdmin(slug: string, dto: CreateSchoolAdminDto) {
    const school = await this.findBySlug(slug);
    const user = await this.hubUsersService.create({
      email: dto.email,
      password: dto.password,
      role: HubUserRole.SCHOOL_OWNER,
      schoolId: school.id,
    });
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    };
  }
}

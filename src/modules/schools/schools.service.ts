import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { School } from './entities/school.entity';
import { HubUsersService } from '../hub-users/hub-users.service';
import { HubUserRole } from '../hub-users/entities/hub-user.entity';
import { S3Service } from '../s3/s3.service';
import { GithubActionsService } from './github-actions.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { CreateSchoolAdminDto } from './dto/create-school-admin.dto';

@Injectable()
export class SchoolsService {
  private readonly logger = new Logger(SchoolsService.name);

  constructor(
    @InjectRepository(School)
    private readonly schoolRepository: Repository<School>,
    private readonly hubUsersService: HubUsersService,
    private readonly s3Service: S3Service,
    private readonly dataSource: DataSource,
    private readonly githubActionsService: GithubActionsService
  ) {}

  async findAll(): Promise<School[]> {
    return this.schoolRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findBySlug(slug: string): Promise<School> {
    const school = await this.schoolRepository.findOne({ where: { slug } });
    if (!school) {
      throw new NotFoundException(`School '${slug}' not found`);
    }

    return school;
  }

  async create(dto: CreateSchoolDto): Promise<School> {
    const existingSchool = await this.schoolRepository.findOne({
      where: { slug: dto.slug },
    });
    if (existingSchool) {
      throw new ConflictException(`Slug '${dto.slug}' is already taken`);
    }

    const existingSchema = await this.dataSource.query(
      'SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1',
      [dto.slug]
    );
    if (existingSchema.length > 0) {
      throw new ConflictException(
        `Schema '${dto.slug}' already exists. Please use a different slug.`
      );
    }

    await this.createSchoolSchema(dto.slug);

    const school = this.schoolRepository.create({
      name: dto.name,
      slug: dto.slug,
    });

    let savedSchool: School;
    try {
      savedSchool = await this.schoolRepository.save(school);
    } catch (error) {
      await this.dropSchoolSchema(dto.slug);
      throw error;
    }

    this.logger.log(
      `School '${dto.slug}' created. Deploy sms-backend with DB_SCHEMA=${dto.slug} and run migrations to complete setup.`
    );

    return savedSchool;
  }

  async uploadLogo(
    slug: string,
    fileBuffer: Buffer,
    originalName: string
  ): Promise<School> {
    const school = await this.findBySlug(slug);
    const previousKey = school.s3LogoKey;
    const s3Key = await this.s3Service.uploadLogo(
      slug,
      fileBuffer,
      originalName
    );

    if (previousKey && previousKey !== s3Key) {
      await this.s3Service.deleteObject(previousKey);
    }

    school.s3LogoKey = s3Key;
    const savedSchool = await this.schoolRepository.save(school);
    this.triggerFrontendRebuild(slug);

    return savedSchool;
  }

  async deleteLogo(slug: string): Promise<School> {
    const school = await this.findBySlug(slug);
    if (!school.s3LogoKey) {
      throw new NotFoundException(`No logo uploaded for school '${slug}'`);
    }

    await this.s3Service.deleteObject(school.s3LogoKey);
    school.s3LogoKey = null;
    const savedSchool = await this.schoolRepository.save(school);
    this.triggerFrontendRebuild(slug);

    return savedSchool;
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

  private async createSchoolSchema(slug: string): Promise<void> {
    this.logger.log(`Creating schema for school: ${slug}`);
    await this.dataSource.query(`CREATE SCHEMA "${slug}"`);
  }

  private async dropSchoolSchema(slug: string): Promise<void> {
    this.logger.warn(`Dropping schema for school: ${slug}`);
    await this.dataSource.query(`DROP SCHEMA IF EXISTS "${slug}" CASCADE`);
  }

  private triggerFrontendRebuild(slug: string): void {
    this.githubActionsService
      .triggerFrontendRebuild(slug)
      .catch((error) =>
        this.logger.error(
          `Could not trigger frontend rebuild for ${slug}`,
          error
        )
      );
  }
}

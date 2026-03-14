import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { SchoolsService } from './schools.service';
import { ServiceTokensService } from '../service-tokens/service-tokens.service';
import { ServiceTokenGuard } from '../service-tokens/service-token.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { HubUserRole } from '../hub-users/entities/hub-user.entity';
import { CreateSchoolDto } from './dto/create-school.dto';
import { CreateSchoolAdminDto } from './dto/create-school-admin.dto';
import { CreateServiceTokenDto } from './dto/create-service-token.dto';

@ApiTags('schools')
@Controller('schools')
export class SchoolsController {
  constructor(
    private readonly schoolsService: SchoolsService,
    private readonly serviceTokensService: ServiceTokensService,
  ) {}

  // ── School CRUD ──

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(HubUserRole.SYSTEM_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all schools' })
  findAll() {
    return this.schoolsService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(HubUserRole.SYSTEM_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new school' })
  create(@Body() dto: CreateSchoolDto) {
    return this.schoolsService.create(dto);
  }

  @Get(':slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(HubUserRole.SYSTEM_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get school details' })
  findOne(@Param('slug') slug: string) {
    return this.schoolsService.findBySlug(slug);
  }

  // ── Logo ──

  @Post(':slug/logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(HubUserRole.SYSTEM_ADMIN)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload school logo to S3' })
  @UseInterceptors(FileInterceptor('logo'))
  uploadLogo(
    @Param('slug') slug: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.schoolsService.uploadLogo(slug, file.buffer, file.originalname);
  }

  @Get(':slug/logo-url')
  @UseGuards(ServiceTokenGuard)
  @ApiOperation({ summary: 'Get presigned logo URL — called by CI/CD pre-build script' })
  getLogoUrl(@Param('slug') slug: string) {
    return this.schoolsService.getLogoPresignedUrl(slug);
  }

  // ── School Admin User ──

  @Post(':slug/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(HubUserRole.SYSTEM_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a school_owner login for this school' })
  createAdmin(
    @Param('slug') slug: string,
    @Body() dto: CreateSchoolAdminDto,
  ) {
    return this.schoolsService.createSchoolAdmin(slug, dto);
  }

  // ── Service Tokens ──

  @Get(':slug/tokens')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(HubUserRole.SYSTEM_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List service tokens for a school' })
  listTokens(@Param('slug') slug: string) {
    return this.schoolsService.findBySlug(slug).then((school) =>
      this.serviceTokensService.findBySchool(school.id),
    );
  }

  @Post(':slug/tokens')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(HubUserRole.SYSTEM_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a new service token for CI/CD pipeline' })
  generateToken(
    @Param('slug') slug: string,
    @Body() dto: CreateServiceTokenDto,
  ) {
    return this.schoolsService
      .findBySlug(slug)
      .then((school) =>
        this.serviceTokensService.generate(school.id, dto.label),
      );
  }

  @Delete(':slug/tokens/:tokenId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(HubUserRole.SYSTEM_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a service token' })
  revokeToken(@Param('tokenId') tokenId: string) {
    return this.serviceTokensService.revoke(+tokenId);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly tenantConfigsDir: string;

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_S3_REGION') || 'ap-south-1',
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
      },
    });
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET') || 'skool-next-stage';
    
    // Resolve tenant-configs directory at the project root level (above hub-backend)
    this.tenantConfigsDir = path.join(process.cwd(), '..', 'tenant-configs');
  }

  /**
   * Orchestrates the creation of a new school's infrastructure setup
   */
  async provisionSchoolInfrastructure(slug: string, name: string): Promise<void> {
    this.logger.log(`Starting infrastructure provisioning for tenant: ${slug}`);

    try {
      // 1. Determine unique ports based on existing tenants
      const { backendPort, frontendPort } = this.calculateTenantPorts();

      // 2. Generate Docker Compose File
      const composeFilePath = this.generateDockerComposeFile(slug, name, backendPort, frontendPort);

      // 3. Upload to S3 for safe persistence
      await this.uploadConfigToS3(slug, composeFilePath);

      // 4. Trigger Deployment (Only if we aren't explicitly skipping it for local dev)
      // E.g. skip if NODE_ENV=development and SKIP_LOCAL_DOCKER=true
      const skipDocker = this.configService.get<string>('SKIP_LOCAL_DOCKER') === 'true';
      if (!skipDocker) {
        await this.deployTenantContainers(composeFilePath);
      } else {
        this.logger.log(`Skipping 'docker compose up' execution for ${slug} due to SKIP_LOCAL_DOCKER=true`);
      }

      this.logger.log(`Successfully provisioned infrastructure for ${slug}`);
      this.logger.log(`─────────────────────────────────────────────────────`);
      this.logger.log(`  School    : ${name} (${slug})`);
      this.logger.log(`  Backend   : http://localhost:${backendPort}  (API)`);
      this.logger.log(`  Frontend  : http://localhost:${frontendPort} (UI)`);
      this.logger.log(`─────────────────────────────────────────────────────`);
    } catch (error) {
      this.logger.error(`Failed to provision infrastructure for ${slug}: ${error.message}`, error.stack);
      throw new Error(`Tenant infrastructure provisioning failed: ${error.message}`);
    }
  }

  private calculateTenantPorts(): { backendPort: number; frontendPort: number } {
    // Determine ports based on what files already exist in tenant-configs
    // This is a naive implementation; in production, saving ports to DB is safer.
    let count = 0;
    if (fs.existsSync(this.tenantConfigsDir)) {
      const files = fs.readdirSync(this.tenantConfigsDir);
      count = files.filter(f => f.startsWith('docker-compose.')).length;
    }
    
    // Base ports starting points
    const baseBackendPort = 4001;
    const baseFrontendPort = 4002;
    
    // Each tenant takes 2 ports (backend, frontend), so we offset by (count * 2)
    return {
      backendPort: baseBackendPort + (count * 2),
      frontendPort: baseFrontendPort + (count * 2),
    };
  }

  private generateDockerComposeFile(slug: string, name: string, backendPort: number, frontendPort: number): string {
    if (!fs.existsSync(this.tenantConfigsDir)) {
      fs.mkdirSync(this.tenantConfigsDir, { recursive: true });
    }

    const composeFileName = `docker-compose.${slug}.yml`;
    const composeFilePath = path.join(this.tenantConfigsDir, composeFileName);

    // Get base webhook/frontend URL from our server's environment or default it
    const baseFrontendUrl = this.configService.get<string>('FRONTEND_URL') || `http://localhost:${frontendPort}`;

    const composeContent = `version: '3.8'

services:
  backend-${slug}:
    build: 
      context: ./backend
      dockerfile: Dockerfile
    container_name: school-backend-${slug}
    ports:
      - "${backendPort}:3001"
    env_file:
      - ./backend/.env.docker
    environment:
      - DB_SCHEMA=${slug}
      - WHITELIST_TRUSTED_URLS=http://localhost:${frontendPort},${baseFrontendUrl}
      - SUPER_ADMIN_EMAIL=superadmin@${slug}.com
    extra_hosts:
      - "host.docker.internal:host-gateway"

  frontend-${slug}:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: school-frontend-${slug}
    ports:
      - "${frontendPort}:3000"
    environment:
      - NEXT_PUBLIC_SCHOOL_NAME="${name}"
      - NEXT_PUBLIC_SCHOOL_LOGO=/school-assets/logo.png
      - NEXT_PUBLIC_API_URL=http://localhost:${backendPort}
      - NEXT_PUBLIC_FRONTEND_URL=${baseFrontendUrl}
    depends_on:
      - backend-${slug}
`;

    fs.writeFileSync(composeFilePath, composeContent);
    this.logger.log(`Generated docker-compose file: ${composeFilePath}`);
    return composeFilePath;
  }

  private async uploadConfigToS3(slug: string, filePath: string): Promise<void> {
    const fileName = path.basename(filePath);
    const s3Key = `tenant-configs/${fileName}`;
    
    this.logger.log(`Uploading ${fileName} to S3 bucket ${this.bucketName}...`);
    
    const fileContent = fs.readFileSync(filePath);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      Body: fileContent,
      ContentType: 'text/yaml',
    });

    await this.s3Client.send(command);
    this.logger.log(`Successfully backed up ${fileName} to S3.`);
  }

  private async deployTenantContainers(composeFilePath: string): Promise<void> {
    this.logger.log(`Triggering Docker Compose deployment for: ${composeFilePath}`);
    
    // We execute docker compose from the project root (where the subfolders exist)
    const projectRoot = path.join(process.cwd(), '..');
    
    // Use a relative path for the -f flag so the host daemon can resolve it relative to context
    const relativeComposePath = path.relative(projectRoot, composeFilePath);
    
    try {
      const { stdout, stderr } = await execAsync(`docker compose -f ${relativeComposePath} up -d`, {
        cwd: projectRoot,
      });
      
      this.logger.log(`Docker Compose Output: ${stdout}`);
      if (stderr) {
        this.logger.warn(`Docker Compose Stderr: ${stderr}`);
      }
    } catch (error) {
      this.logger.error(`Docker Compose Execution Failed: ${error.message}`);
      throw error;
    }
  }
}

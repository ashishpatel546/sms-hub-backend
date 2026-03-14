import { Injectable, Logger } from '@nestjs/common';
import { S3Service as AwsS3Service } from '@sologence/nest-js-aws-s3';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly bucket: string;

  constructor(
    private readonly s3: AwsS3Service,
    private readonly configService: ConfigService,
  ) {
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET')!;
  }

  async uploadLogo(
    slug: string,
    fileBuffer: Buffer,
    originalName: string,
  ): Promise<string> {
    const ext = originalName.split('.').pop()?.toLowerCase() || 'png';
    const key = `logos/${slug}_logo.${ext}`;

    await this.s3.uploadFile(this.bucket, key, fileBuffer);

    this.logger.log(`Uploaded logo for ${slug} → ${key}`);
    return key;
  }

  async getPresignedUrl(s3Key: string, expiresInSeconds = 900): Promise<string> {
    return this.s3.getSignedUrl(s3Key, expiresInSeconds);
  }
}

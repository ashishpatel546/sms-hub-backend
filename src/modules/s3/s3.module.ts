import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { S3Module as NestJsAwsS3Module } from '@sologence/nest-js-aws-s3';
import { S3Service } from './s3.service';

@Global()
@Module({
  imports: [
    NestJsAwsS3Module.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        awsS3Accesskey: configService.get<string>('AWS_ACCESS_KEY_ID'),
        awsS3SecretKey: configService.get<string>('AWS_SECRET_ACCESS_KEY'),
        awsS3Region: configService.get<string>('AWS_REGION', 'ap-south-1')!,
        awsS3Bucket: configService.get<string>('AWS_S3_BUCKET')!,
      }),
    }),
  ],
  providers: [S3Service],
  exports: [S3Service],
})
export class S3Module {}

import {
  SSMClient,
  GetParametersByPathCommand,
  Parameter,
} from '@aws-sdk/client-ssm';
import { Logger } from '@nestjs/common';

const logger = new Logger('EnvLoader');

export const loadAwsSsmParams = async (): Promise<void> => {
  const isLocal =
    !process.env.NODE_ENV ||
    process.env.NODE_ENV === 'local' ||
    process.env.NODE_ENV === 'development';

  if (isLocal && !process.env.FORCE_AWS_SSM) {
    logger.log(
      '📄 Using local environment config (AWS SSM skipped due to local environment)',
    );
    return;
  }

  const env = process.env.NODE_ENV || 'development';
  const platformPath = `/sms-hub/${env}/`;

  logger.log(
    `🔄 Loading platform environment variables from AWS SSM at [${platformPath}]...`,
  );

  const ssmClient = new SSMClient({
    region: process.env.AWS_REGION || 'ap-south-1',
  });

  try {
    const fetchParams = async (path: string): Promise<Parameter[]> => {
      let nextToken: string | undefined = undefined;
      const allParams: Parameter[] = [];

      do {
        const command = new GetParametersByPathCommand({
          Path: path,
          WithDecryption: true,
          Recursive: true,
          NextToken: nextToken,
        });
        const response = (await ssmClient.send(command)) as any;
        if (response.Parameters) {
          allParams.push(...response.Parameters);
        }
        nextToken = response.NextToken;
      } while (nextToken);

      return allParams;
    };

    const platformParams = await fetchParams(platformPath);

    platformParams.forEach((param) => {
      if (!param.Name || !param.Value) return;
      const envKey = param.Name.replace(platformPath, '');
      if (envKey.includes('/')) return;
      process.env[envKey] = param.Value;
    });

    logger.log(
      `✅ SSM environment variables loaded: ${platformParams.length} params from ${platformPath}`,
    );
  } catch (error) {
    logger.error('❌ Failed to pull variables from AWS SSM', error);
    throw error;
  }
};

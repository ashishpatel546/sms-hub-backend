import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * No `@MinAccess()` on purpose: this is `@Public()`, so there is no token
   * to rank, and load balancers and uptime probes have to be able to reach it
   * without credentials. It returns a fixed string and reads nothing.
   */
  @Public()
  @Get('/health-check')
  healthCheck(): string {
    return this.appService.healthCheck();
  }
}

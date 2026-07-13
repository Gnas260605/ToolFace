import { Controller, Get } from '@nestjs/common';
import { getServerEnv } from '@newsflow/config';
import { SystemInfoResponse } from '@newsflow/contracts';

@Controller('system')
export class SystemController {
  @Get('info')
  getSystemInfo(): SystemInfoResponse {
    const envData = getServerEnv();
    return {
      name: 'NewsFlow AI API',
      version: envData.APP_VERSION,
      environment: envData.NODE_ENV,
    };
  }
}

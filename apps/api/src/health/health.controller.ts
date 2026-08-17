import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

interface HealthResponse {
  status: 'ok';
  service: 'api';
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Process liveness probe' })
  live(): HealthResponse {
    return { status: 'ok', service: 'api' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Dependency readiness probe' })
  async ready(): Promise<HealthResponse> {
    try {
      await Promise.all([this.database.ping(), this.redis.ping()]);
      return { status: 'ok', service: 'api' };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable', service: 'api' });
    }
  }
}

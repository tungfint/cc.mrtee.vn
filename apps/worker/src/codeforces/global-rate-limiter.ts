import { Injectable } from '@nestjs/common';
import { EnvironmentService } from '../config/environment';
import { RedisService } from '../redis/redis.service';

const ALLOCATE_SLOT_SCRIPT = `
local current = redis.call('TIME')
local now = current[1] * 1000 + math.floor(current[2] / 1000)
local interval = tonumber(ARGV[1])
local next_slot = tonumber(redis.call('GET', KEYS[1]) or now)
local slot = math.max(now, next_slot)
redis.call('SET', KEYS[1], slot + interval, 'PX', interval * 20)
return slot - now
`;

@Injectable()
export class GlobalRateLimiter {
  constructor(
    private readonly redis: RedisService,
    private readonly environment: EnvironmentService,
  ) {}

  async acquire(): Promise<void> {
    const delay = Number(
      await this.redis.connection.eval(
        ALLOCATE_SLOT_SCRIPT,
        1,
        'rate-limit:codeforces:next-slot',
        this.environment.values.CF_REQUEST_INTERVAL_MS,
      ),
    );
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

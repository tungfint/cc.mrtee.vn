import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const CONSUME_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {current, redis.call('TTL', KEYS[1])}
`;

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  async consume(bucket: string, limit: number, windowSeconds: number): Promise<void> {
    const result = (await this.redis.connection.eval(
      CONSUME_SCRIPT,
      1,
      `cc:rate:${bucket}`,
      windowSeconds,
    )) as [number, number];
    const [count, retryAfter] = result;
    if (count > limit) {
      throw new HttpException(
        { statusCode: 429, message: 'Quá nhiều yêu cầu, vui lòng thử lại sau', retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

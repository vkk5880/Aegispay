import type { Redis } from 'ioredis';

const LUA_SCRIPT = `
-- KEYS[1]: "aegis:mandate:" .. mandate_id
-- KEYS[2]: "aegis:merchant_exposure:" .. mandate_id .. ":" .. merchant_domain
-- ARGV[1]: requested_cents
-- ARGV[2]: current_unix_ms
-- ARGV[3]: category_id
-- ARGV[4]: merchant_anomaly_score (scaled 0..1000)

local m = redis.call("HMGET", KEYS[1], "max_total", "max_single_merchant", "spent", "expires_ms", "status", "allowed_cats")
if not m[1] then
    return {0, "ERR_MANDATE_NOT_FOUND"}
end

local max_total = tonumber(m[1])
local max_merchant = tonumber(m[2])
local spent = tonumber(m[3])
local expires_ms = tonumber(m[4])
local status = m[5]
local allowed_cats = m[6]

local req_cents = tonumber(ARGV[1])
local now_ms = tonumber(ARGV[2])
local cat_id = ARGV[3]
local anomaly_score = tonumber(ARGV[4])

if status ~= "ACTIVE" then
    return {0, "ERR_MANDATE_STATUS_" .. status}
end
if now_ms > expires_ms then
    redis.call("HSET", KEYS[1], "status", "EXPIRED")
    return {0, "ERR_MANDATE_EXPIRED"}
end
if anomaly_score > 300 then
    return {0, "ERR_MERCHANT_ANOMALY_THRESHOLD_EXCEEDED"}
end
if string.find(allowed_cats, cat_id, 1, true) == nil and allowed_cats ~= "*" then
    return {0, "ERR_CATEGORY_NOT_AUTHORIZED:" .. cat_id}
end

local current_merchant_spent = tonumber(redis.call("GET", KEYS[2]) or "0")
if (current_merchant_spent + req_cents) > max_merchant then
    return {0, "ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP"}
end
if (spent + req_cents) > max_total then
    return {0, "ERR_EXCEEDS_TOTAL_MANDATE_BUDGET"}
end

-- Atomic Reservation
redis.call("HINCRBY", KEYS[1], "spent", req_cents)
redis.call("INCRBY", KEYS[2], req_cents)
return {1, tostring(spent + req_cents)}
`;

export interface ReservationParams {
  mandate_id: string;
  merchant_domain: string;
  requested_cents: number;
  current_unix_ms: number;
  category_id: string;
  merchant_anomaly_score: number;
}

export interface ReservationResult {
  success: boolean;
  new_spent?: number;
  error_code?: string;
}

export class AtomicSpendEnforcer {
  private scriptSha: string | null = null;

  async reserveBudget(redisClient: Redis, params: ReservationParams): Promise<ReservationResult> {
    const keys = [
      `aegis:mandate:${params.mandate_id}`,
      `aegis:merchant_exposure:${params.mandate_id}:${params.merchant_domain}`
    ];
    const argv = [
      params.requested_cents.toString(),
      params.current_unix_ms.toString(),
      params.category_id,
      params.merchant_anomaly_score.toString()
    ];

    if (!this.scriptSha) {
      this.scriptSha = await redisClient.script('LOAD', LUA_SCRIPT) as string;
    }

    try {
      const result = await redisClient.evalsha(
        this.scriptSha,
        keys.length,
        ...keys,
        ...argv
      ) as [number, string];

      const [status, data] = result;

      if (status === 1) {
        return {
          success: true,
          new_spent: parseInt(data, 10)
        };
      } else {
        return {
          success: false,
          error_code: data
        };
      }
    } catch (e: any) {
      if (e.message && e.message.includes('NOSCRIPT')) {
        // Fallback to eval if script is flushed
        const result = await redisClient.eval(
          LUA_SCRIPT,
          keys.length,
          ...keys,
          ...argv
        ) as [number, string];

        const [status, data] = result;

        if (status === 1) {
          return {
            success: true,
            new_spent: parseInt(data, 10)
          };
        } else {
          return {
            success: false,
            error_code: data
          };
        }
      }
      throw e;
    }
  }
}

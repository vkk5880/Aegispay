import type { Redis } from 'ioredis';

export const LUA_SCRIPT = `
-- KEYS[1]: "aegis:{vch_" .. mandate_id .. "}:mandate"
-- KEYS[2]: "aegis:{vch_" .. mandate_id .. "}:exposure:" .. merchant_domain
-- ARGV[1]: requested_cents
-- ARGV[2]: current_unix_ms
-- ARGV[3]: category_id
-- ARGV[4]: merchant_anomaly_score (scaled 0..1000)

local req_cents = tonumber(ARGV[1])
if not req_cents or req_cents <= 0 then
    return {0, "ERR_INVALID_SPEND_AMOUNT"}
end

local m = redis.call("HMGET", KEYS[1], "max_total", "max_single_merchant", "spent", "expires_ms", "status", "allowed_cats")
if not m[1] then
    return {0, "ERR_MANDATE_NOT_FOUND"}
end

local max_total = tonumber(m[1] or "0")
local max_merchant = tonumber(m[2] or "0")
local spent = tonumber(m[3] or "0")
local expires_ms = tonumber(m[4] or "0")
local status = m[5]
local allowed_cats = m[6] or ""

local now_ms = tonumber(ARGV[2] or "0")
local cat_id = ARGV[3] or ""
local anomaly_score = tonumber(ARGV[4] or "0")

if status ~= "ACTIVE" then
    return {0, "ERR_MANDATE_STATUS_" .. (status or "UNKNOWN")}
end
if now_ms > expires_ms then
    redis.call("HSET", KEYS[1], "status", "EXPIRED")
    return {0, "ERR_MANDATE_EXPIRED"}
end
if anomaly_score > 300 then
    return {0, "ERR_MERCHANT_ANOMALY_THRESHOLD_EXCEEDED"}
end
if allowed_cats ~= "*" then
    local bounded_cats = "," .. allowed_cats .. ","
    local bounded_target = "," .. cat_id .. ","
    if string.find(bounded_cats, bounded_target, 1, true) == nil then
        return {0, "ERR_CATEGORY_NOT_AUTHORIZED:" .. cat_id}
    end
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

-- Merchant Exposure TTL matching KEYS[1]
local ttl = redis.call("TTL", KEYS[1])
if ttl and ttl > 0 then
    redis.call("EXPIRE", KEYS[2], ttl)
end

return {1, tostring(spent + req_cents)}
`;

export const ROLLBACK_LUA_SCRIPT = `
-- KEYS[1]: "aegis:{vch_" .. mandate_id .. "}:mandate"
-- KEYS[2]: "aegis:{vch_" .. mandate_id .. "}:exposure:" .. merchant_domain (optional)
-- ARGV[1]: req_cents

local m = redis.call("HMGET", KEYS[1], "spent")
if not m[1] then
    return {0, "ERR_MANDATE_NOT_FOUND"}
end

local req_cents = tonumber(ARGV[1])
local new_spent = redis.call("HINCRBY", KEYS[1], "spent", -req_cents)
if new_spent < 0 then
    redis.call("HSET", KEYS[1], "spent", 0)
    new_spent = 0
end

if #KEYS > 1 and KEYS[2] ~= "" then
    local current_merchant = tonumber(redis.call("GET", KEYS[2]) or "0")
    local new_merchant = redis.call("INCRBY", KEYS[2], -req_cents)
    if new_merchant < 0 then
        redis.call("SET", KEYS[2], 0)
    end
end

return {1, tostring(new_spent)}
`;

export const eval_rollback = ROLLBACK_LUA_SCRIPT;

export interface SpendMandateDbRecord {
  id: string;
  max_total_cents: number;
  max_single_merchant_cents: number;
  spent_cents: number;
  expires_at: Date | string | number;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  allowed_categories?: string[];
}

export type DbMandateLookup = (mandateId: string) => Promise<SpendMandateDbRecord | null>;

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
  private rollbackSha: string | null = null;
  private defaultRedis: Redis | null = null;
  private dbFallback: DbMandateLookup | null = null;

  constructor(defaultRedis?: Redis, dbFallback?: DbMandateLookup) {
    if (defaultRedis) {
      this.defaultRedis = defaultRedis;
    }
    if (dbFallback) {
      this.dbFallback = dbFallback;
    }
  }

  setDbFallback(dbFallback: DbMandateLookup): void {
    this.dbFallback = dbFallback;
  }

  async reserveBudget(redisClient: Redis, params: ReservationParams): Promise<ReservationResult> {
    if (params.requested_cents <= 0) {
      return {
        success: false,
        error_code: 'ERR_INVALID_SPEND_AMOUNT'
      };
    }

    // Format Redis hash tag {vch_...} to guarantee both keys map to the same Redis cluster slot
    const tag = params.mandate_id.startsWith('vch_') ? params.mandate_id : `vch_${params.mandate_id}`;
    const keys = [
      `aegis:{${tag}}:mandate`,
      `aegis:{${tag}}:exposure:${params.merchant_domain}`
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
      let result: [number, string];
      try {
        result = await redisClient.evalsha(
          this.scriptSha,
          keys.length,
          ...keys,
          ...argv
        ) as [number, string];
      } catch (shaErr: any) {
        if (shaErr.message && shaErr.message.includes('NOSCRIPT')) {
          result = await redisClient.eval(
            LUA_SCRIPT,
            keys.length,
            ...keys,
            ...argv
          ) as [number, string];
        } else {
          throw shaErr;
        }
      }

      const [status, data] = result;

      if (status === 1) {
        return {
          success: true,
          new_spent: parseInt(data, 10)
        };
      }

      // If Redis has no mandate (cold restart or eviction), fallback to PostgreSQL state recovery
      if (data === 'ERR_MANDATE_NOT_FOUND' && this.dbFallback) {
        try {
          const dbRecord = await this.dbFallback(params.mandate_id);
          if (!dbRecord) {
            return {
              success: false,
              error_code: 'ERR_MANDATE_NOT_FOUND'
            };
          }

          if (dbRecord.status !== 'ACTIVE') {
            return {
              success: false,
              error_code: `ERR_MANDATE_STATUS_${dbRecord.status}`
            };
          }

          const expiresMs = new Date(dbRecord.expires_at).getTime();
          if (params.current_unix_ms > expiresMs) {
            return {
              success: false,
              error_code: 'ERR_MANDATE_EXPIRED'
            };
          }

          if (params.merchant_anomaly_score > 300) {
            return {
              success: false,
              error_code: 'ERR_MERCHANT_ANOMALY_THRESHOLD_EXCEEDED'
            };
          }

          if (
            dbRecord.allowed_categories &&
            dbRecord.allowed_categories.length > 0 &&
            !dbRecord.allowed_categories.includes('*') &&
            !dbRecord.allowed_categories.includes(params.category_id)
          ) {
            return {
              success: false,
              error_code: `ERR_CATEGORY_NOT_AUTHORIZED:${params.category_id}`
            };
          }

          if (params.requested_cents > dbRecord.max_single_merchant_cents) {
            return {
              success: false,
              error_code: 'ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP'
            };
          }

          if (dbRecord.spent_cents + params.requested_cents > dbRecord.max_total_cents) {
            return {
              success: false,
              error_code: 'ERR_EXCEEDS_TOTAL_MANDATE_BUDGET'
            };
          }

          // Hydrate Redis with PostgreSQL authoritative state
          const allowedCatsStr = dbRecord.allowed_categories ? dbRecord.allowed_categories.join(',') : '*';
          await redisClient.hmset(keys[0], {
            max_total: dbRecord.max_total_cents.toString(),
            max_single_merchant: dbRecord.max_single_merchant_cents.toString(),
            spent: (dbRecord.spent_cents + params.requested_cents).toString(),
            expires_ms: expiresMs.toString(),
            status: 'ACTIVE',
            allowed_cats: allowedCatsStr
          });
          await redisClient.incrby(keys[1], params.requested_cents);

          const ttlSeconds = Math.max(1, Math.floor((expiresMs - params.current_unix_ms) / 1000));
          await redisClient.expire(keys[0], ttlSeconds);
          await redisClient.expire(keys[1], ttlSeconds);

          return {
            success: true,
            new_spent: dbRecord.spent_cents + params.requested_cents
          };
        } catch {
          // Guardrail 3: Fail closed if both Redis and PostgreSQL fail
          if (process.env.NODE_ENV === 'production') {
            return {
              success: false,
              error_code: 'ERR_FAIL_CLOSED_CUSTODIAN_UNREACHABLE'
            };
          }
          return {
            success: false,
            error_code: 'ERR_MANDATE_NOT_FOUND'
          };
        }
      }

      return {
        success: false,
        error_code: data
      };
    } catch (e: any) {
      // Guardrail 3: Fail closed if Redis is unreachable in production
      if (process.env.NODE_ENV === 'production') {
        return {
          success: false,
          error_code: 'ERR_FAIL_CLOSED_CUSTODIAN_UNREACHABLE'
        };
      }
      throw e;
    }
  }

  /**
   * Executes atomic compensating rollback decrementing spent (-req_cents) using Redis hash tags {vch_}.
   * Restores available balance when an authorization fails or cards decline (INSTRUMENT_DECLINED).
   */
  async rollbackReservation(
    redisOrMandateId: Redis | string,
    mandateIdOrReqCents: string | number,
    reqCentsOrDomain?: number | string,
    merchantDomain?: string
  ): Promise<boolean> {
    let client: Redis | null = null;
    let mandateId: string;
    let reqCents: number;
    let domain: string | undefined;

    if (typeof redisOrMandateId === 'string') {
      // Called as: rollbackReservation(mandateId, reqCents, merchantDomain)
      client = this.defaultRedis;
      mandateId = redisOrMandateId;
      reqCents = mandateIdOrReqCents as number;
      domain = reqCentsOrDomain as string | undefined;
    } else {
      // Called as: rollbackReservation(redisClient, mandateId, reqCents, merchantDomain)
      client = redisOrMandateId;
      mandateId = mandateIdOrReqCents as string;
      reqCents = reqCentsOrDomain as number;
      domain = merchantDomain;
    }

    if (!client) {
      // Gracefully succeed if no Redis client configured in current runtime
      return true;
    }

    const tag = mandateId.startsWith('vch_') ? mandateId : `vch_${mandateId}`;
    const keys: string[] = [`aegis:{${tag}}:mandate`];
    if (domain) {
      keys.push(`aegis:{${tag}}:exposure:${domain}`);
    }

    const argv = [reqCents.toString()];

    try {
      if (!this.rollbackSha) {
        this.rollbackSha = await client.script('LOAD', ROLLBACK_LUA_SCRIPT) as string;
      }

      const result = await client.evalsha(
        this.rollbackSha,
        keys.length,
        ...keys,
        ...argv
      ) as [number, string];

      return result[0] === 1;
    } catch (e: any) {
      if (e.message && e.message.includes('NOSCRIPT')) {
        const result = await client.eval(
          ROLLBACK_LUA_SCRIPT,
          keys.length,
          ...keys,
          ...argv
        ) as [number, string];

        return result[0] === 1;
      }
      throw e;
    }
  }
}

export const defaultAtomicSpendEnforcer = new AtomicSpendEnforcer();

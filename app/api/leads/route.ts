import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { leadSchema } from '@/lib/validation';
import { getSupabaseClient } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// In-memory rate limiting (per-IP, resets per deployment instance)
// For production, replace with Redis / Upstash.
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5;               // max 5 submissions per IP per minute

interface RateEntry {
  count: number;
  windowStart: number;
}

const rateMap = new Map<string, RateEntry>();

function getRateLimitInfo(ip: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateMap.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + RATE_LIMIT_WINDOW_MS,
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX - entry.count,
    resetAt: entry.windowStart + RATE_LIMIT_WINDOW_MS,
  };
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// ---------------------------------------------------------------------------
// POST /api/leads
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed, remaining, resetAt } = getRateLimitInfo(ip);

  const rateLimitHeaders = {
    'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.floor(resetAt / 1000)),
    'Content-Type': 'application/json',
  };

  if (!allowed) {
    return NextResponse.json(
      {
        error: 'יותר מדי פניות. נא המתן דקה ונסה שנית.',
        code: 'RATE_LIMITED',
      },
      { status: 429, headers: rateLimitHeaders }
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'גוף הבקשה אינו JSON תקין.', code: 'INVALID_JSON' },
      { status: 400, headers: rateLimitHeaders }
    );
  }

  // ── Validate with Zod ───────────────────────────────────────────────────
  let validatedData;
  try {
    validatedData = leadSchema.parse(rawBody);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'נתונים לא תקינים. נא בדוק את השדות ונסה שנית.',
          code: 'VALIDATION_ERROR',
          details: err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 422, headers: rateLimitHeaders }
      );
    }
    return NextResponse.json(
      { error: 'שגיאה לא צפויה בעת אימות הנתונים.', code: 'UNKNOWN_VALIDATION_ERROR' },
      { status: 500, headers: rateLimitHeaders }
    );
  }

  // ── Insert into Supabase (RLS enforced on anon key) ──────────────────────
  const supabase = getSupabaseClient();

  const { error: dbError } = await supabase.from('leads').insert({
    full_name: validatedData.full_name,
    phone: validatedData.phone,
    email: validatedData.email || null,
    subject: validatedData.subject,
    message: validatedData.message,
    practice_area: validatedData.practice_area || null,
    preferred_contact: validatedData.preferred_contact,
    // consent is confirmed by schema (literal true) — store as timestamp
    consent_given_at: new Date().toISOString(),
    source_url: request.headers.get('referer') || null,
    ip_hash: Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
    )
      .toString('hex')
      .slice(0, 16), // store only partial hash for privacy
  });

  if (dbError) {
    console.error('[leads] Supabase insert error:', dbError.message, dbError.code);
    return NextResponse.json(
      {
        error: 'אירעה שגיאה בשמירת הפנייה. נא נסה שנית או צור קשר בטלפון.',
        code: 'DB_ERROR',
      },
      { status: 500, headers: rateLimitHeaders }
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: 'תודה! פנייתך התקבלה. ניצור איתך קשר בהקדם.',
    },
    { status: 201, headers: rateLimitHeaders }
  );
}

// ── Only POST is supported ───────────────────────────────────────────────
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

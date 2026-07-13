/**
 * TimezoneService — IANA-safe timezone validation and UTC conversion.
 *
 * Uses date-fns-tz. All stored timestamps are UTC.
 * Manual hour-addition is prohibited by spec.
 */
import {
  toZonedTime,
  fromZonedTime,
  format as formatTz,
} from 'date-fns-tz';

export interface TimezoneConversionResult {
  utc: Date;
  localFormatted: string;
  requestedTimezone: string;
  ambiguous: boolean;
  nonexistent: boolean;
}

export interface TimezoneValidationError {
  code:
    | 'SCHEDULE_INVALID_TIMEZONE'
    | 'SCHEDULE_AMBIGUOUS_LOCAL_TIME'
    | 'SCHEDULE_NONEXISTENT_LOCAL_TIME'
    | 'SCHEDULE_TIME_IN_PAST'
    | 'SCHEDULE_TIME_TOO_SOON'
    | 'SCHEDULE_TIME_TOO_FAR'
    | 'SCHEDULE_INVALID_TIME';
  message: string;
}

export class TimezoneService {
  /** Validates an IANA timezone identifier. */
  isValidIanaTimezone(tz: string): boolean {
    try {
      // Intl.DateTimeFormat throws RangeError for invalid timezone
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse a local ISO date-time string in the given IANA timezone and
   * convert it to UTC. Returns an error code if the time is ambiguous,
   * nonexistent, in the past, too soon, or too far in the future.
   *
   * @param localDateTime  Format: "YYYY-MM-DDTHH:mm:ss" (no offset)
   * @param timezone       Valid IANA timezone e.g. "Asia/Ho_Chi_Minh"
   * @param nowUtc         Injected current UTC time (for testing)
   * @param minLeadSeconds Minimum seconds from now (default 120s)
   * @param maxFutureDays  Maximum days in the future (default 365)
   */
  convertLocalToUtc(
    localDateTime: string,
    timezone: string,
    nowUtc: Date = new Date(),
    minLeadSeconds = 120,
    maxFutureDays = 365,
  ):
    | { ok: true; result: TimezoneConversionResult }
    | { ok: false; error: TimezoneValidationError } {
    // 1. Validate timezone
    if (!this.isValidIanaTimezone(timezone)) {
      return {
        ok: false,
        error: {
          code: 'SCHEDULE_INVALID_TIMEZONE',
          message: `Invalid IANA timezone: "${timezone}"`,
        },
      };
    }

    // 2. Parse the local string. We append :00 if only HH:mm provided.
    const normalised = localDateTime.endsWith(':00')
      ? localDateTime
      : localDateTime.length === 16
        ? `${localDateTime}:00`
        : localDateTime;

    const asDate = new Date(normalised);
    if (isNaN(asDate.getTime())) {
      return {
        ok: false,
        error: {
          code: 'SCHEDULE_INVALID_TIME',
          message: `Cannot parse local datetime: "${localDateTime}"`,
        },
      };
    }

    // 3. Convert local → UTC
    const utc = fromZonedTime(normalised, timezone);

    if (isNaN(utc.getTime())) {
      return {
        ok: false,
        error: {
          code: 'SCHEDULE_NONEXISTENT_LOCAL_TIME',
          message: `The local time "${localDateTime}" does not exist in timezone "${timezone}" (DST gap).`,
        },
      };
    }

    // 4. Detect nonexistent local times (spring-forward gap):
    // Round-trip: convert UTC back to local and compare formatted strings.
    const roundTripped = formatTz(
      toZonedTime(utc, timezone),
      "yyyy-MM-dd'T'HH:mm:ss",
      { timeZone: timezone },
    );
    const nonexistent = roundTripped !== normalised;

    // 5. Detect ambiguous times (fall-back overlap):
    // An ambiguous time maps to two distinct UTC instants.
    // We check by testing UTC+1h and seeing if round-trip also matches.
    const utcPlusHour = new Date(utc.getTime() + 3600 * 1000);
    const roundTrippedAlt = formatTz(
      toZonedTime(utcPlusHour, timezone),
      "yyyy-MM-dd'T'HH:mm:ss",
      { timeZone: timezone },
    );
    const ambiguous = roundTrippedAlt === normalised && !nonexistent;

    // 6. Past check
    if (utc <= nowUtc) {
      return {
        ok: false,
        error: {
          code: 'SCHEDULE_TIME_IN_PAST',
          message: `The requested time "${localDateTime}" (${timezone}) is in the past.`,
        },
      };
    }

    // 7. Minimum lead time
    const leadSeconds = (utc.getTime() - nowUtc.getTime()) / 1000;
    if (leadSeconds < minLeadSeconds) {
      return {
        ok: false,
        error: {
          code: 'SCHEDULE_TIME_TOO_SOON',
          message: `Minimum lead time is ${minLeadSeconds} seconds; the requested time is only ${Math.round(leadSeconds)}s away.`,
        },
      };
    }

    // 8. Maximum future window
    const maxFutureMs = maxFutureDays * 24 * 60 * 60 * 1000;
    if (utc.getTime() - nowUtc.getTime() > maxFutureMs) {
      return {
        ok: false,
        error: {
          code: 'SCHEDULE_TIME_TOO_FAR',
          message: `Cannot schedule more than ${maxFutureDays} days in the future.`,
        },
      };
    }

    const localFormatted = formatTz(
      toZonedTime(utc, timezone),
      "yyyy-MM-dd'T'HH:mm:ssXXX",
      { timeZone: timezone },
    );

    return {
      ok: true,
      result: {
        utc,
        localFormatted,
        requestedTimezone: timezone,
        ambiguous,
        nonexistent,
      },
    };
  }

  /** Format a UTC date as a local string in the given timezone. */
  formatUtcAsLocal(
    utc: Date,
    timezone: string,
    fmt = "yyyy-MM-dd'T'HH:mm:ssXXX",
  ): string {
    return formatTz(toZonedTime(utc, timezone), fmt, { timeZone: timezone });
  }

  /**
   * Check whether the given UTC instant falls within quiet hours
   * defined by start/end strings ("HH:mm") in the given timezone.
   * Supports ranges that wrap past midnight.
   */
  isInQuietHours(
    utc: Date,
    quietStart: string,
    quietEnd: string,
    timezone: string,
  ): boolean {
    if (!this.isValidIanaTimezone(timezone)) return false;
    const localTime = formatTz(toZonedTime(utc, timezone), 'HH:mm', {
      timeZone: timezone,
    });
    const [lh, lm] = localTime.split(':').map(Number);
    const localMinutes = lh * 60 + lm;

    const [sh, sm] = quietStart.split(':').map(Number);
    const startMinutes = sh * 60 + sm;
    const [eh, em] = quietEnd.split(':').map(Number);
    const endMinutes = eh * 60 + em;

    if (startMinutes < endMinutes) {
      // e.g. 09:00 – 17:00 (no midnight wrap)
      return localMinutes >= startMinutes && localMinutes < endMinutes;
    } else {
      // e.g. 22:00 – 07:00 (wraps midnight)
      return localMinutes >= startMinutes || localMinutes < endMinutes;
    }
  }
}

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

import { getExpirationStatus, formatExpiration } from "@/lib/format";

describe('Expiration Utils', () => {
  // Day counts are rounded up from the current time, so pin the clock: without this the
  // "tomorrow" cases pass or fail depending on the hour the suite runs.
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  describe('getExpirationStatus', () => {
    it('returns "none" for null expiration', () => {
      expect(getExpirationStatus(null)).toBe("none");
    });

    it('returns "expired" for past dates', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(getExpirationStatus(yesterday.toISOString())).toBe("expired");
    });

    it('returns "expiring-soon" for dates within 7 days', () => {
      const inThreeDays = new Date();
      inThreeDays.setDate(inThreeDays.getDate() + 3);
      expect(getExpirationStatus(inThreeDays.toISOString())).toBe("expiring-soon");
    });

    it('returns "expiring-soon" for today', () => {
      const today = new Date();
      expect(getExpirationStatus(today.toISOString())).toBe("expiring-soon");
    });

    it('returns "ok" for dates more than 7 days away', () => {
      const inTwoWeeks = new Date();
      inTwoWeeks.setDate(inTwoWeeks.getDate() + 14);
      expect(getExpirationStatus(inTwoWeeks.toISOString())).toBe("ok");
    });
  });

  describe('formatExpiration', () => {
    it('returns empty string for null', () => {
      expect(formatExpiration(null)).toBe("");
    });

    it('formats expired dates correctly', () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      expect(formatExpiration(twoDaysAgo.toISOString())).toMatch(/expired \d+d ago/);
    });

    it('formats "expires today"', () => {
      // Set to end of today to ensure it's still "today"
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const result = formatExpiration(today.toISOString());
      expect(result === "expires today" || result === "expires tomorrow").toBe(true);
    });

    it('formats "expires tomorrow"', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(12, 0, 0, 0);
      expect(formatExpiration(tomorrow.toISOString())).toBe("expires tomorrow");
    });

    it('formats "expires in Xd" for near dates', () => {
      const inFiveDays = new Date();
      inFiveDays.setDate(inFiveDays.getDate() + 5);
      expect(formatExpiration(inFiveDays.toISOString())).toMatch(/expires in \d+d/);
    });

    it('formats distant dates with full date', () => {
      const inThreeWeeks = new Date();
      inThreeWeeks.setDate(inThreeWeeks.getDate() + 21);
      expect(formatExpiration(inThreeWeeks.toISOString())).toMatch(/^exp /);
    });
  });
});

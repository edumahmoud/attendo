'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';

/**
 * useAutoRefresh - A hook that provides periodic polling as a fallback
 * for realtime subscriptions. Ensures data stays fresh even if
 * Supabase realtime silently disconnects.
 *
 * @param fetchFn - The function to call periodically
 * @param intervalMs - Polling interval in milliseconds (default: 60000 = 60s)
 * @param enabled - Whether polling is enabled (default: true)
 */
export function useAutoRefresh(
  fetchFn: () => Promise<void> | void,
  intervalMs: number = 60000,
  enabled: boolean = true,
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchRef = useRef(fetchFn);

  // Keep fetchFn ref up to date without re-creating interval
  useEffect(() => {
    fetchRef.current = fetchFn;
  }, [fetchFn]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      fetchRef.current();
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [intervalMs, enabled]);

  // Manual trigger
  const refresh = useCallback(() => {
    fetchRef.current();
  }, []);

  return { refresh };
}

/**
 * useDebouncedCallback - Returns a debounced version of the callback.
 * Useful for realtime event handlers to prevent rapid successive re-fetches.
 *
 * @param callback - The function to debounce
 * @param delayMs - Debounce delay in milliseconds (default: 500)
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delayMs: number = 500,
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedFn = useCallback(
    (...args: unknown[]) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delayMs);
    },
    [delayMs],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedFn;
}

/**
 * useRealtimeStatus - Tracks Supabase realtime connection status.
 * Returns connection state that can be displayed to the user.
 */
export function useRealtimeStatus() {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const markConnected = useCallback(() => {
    setStatus('connected');
    setLastUpdated(new Date());
  }, []);

  const markDisconnected = useCallback(() => {
    setStatus('disconnected');
  }, []);

  const markConnecting = useCallback(() => {
    setStatus('connecting');
  }, []);

  const markUpdated = useCallback(() => {
    setLastUpdated(new Date());
  }, []);

  // Memoize the returned object so it doesn't cause useEffect re-runs
  return useMemo(() => ({
    status,
    lastUpdated,
    markConnected,
    markDisconnected,
    markConnecting,
    markUpdated,
  }), [status, lastUpdated, markConnected, markDisconnected, markConnecting, markUpdated]);
}

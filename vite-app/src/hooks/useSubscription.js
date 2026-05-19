// Subscription state for the current user. Source-of-truth is the
// /api/subscription endpoint; this hook caches the latest response and
// exposes a feature gate `has(featureKey)` for paywall checks.
//
// See MONETIZATION-PLAN.md §11 for the backend design.

import { useEffect, useState, useCallback } from 'react';
import { API_URL } from '../utils/api.js';

// Feature matrix — which tiers unlock which feature keys. Mirror this in
// the server when gating endpoints.
export const FEATURE_MATRIX = {
  free: new Set(['browse', 'save_event_basic', 'track_result_basic']),
  planner_pro: new Set(['browse', 'save_event_unlimited', 'calendar_sync', 'live_updates', 'smart_alerts']),
  replayer_pro: new Set(['browse', 'replayer', 'gif_export', 'video_export', 'instagram_share']),
  manager_pro: new Set(['browse', 'track_result_unlimited', 'pnl_charts', 'export']),
  suite_pro: new Set([
    'browse', 'save_event_unlimited', 'calendar_sync', 'live_updates', 'smart_alerts',
    'replayer', 'gif_export', 'video_export', 'instagram_share',
    'track_result_unlimited', 'pnl_charts', 'export',
    'social_messaging', 'conflict_detection',
  ]),
  suite_pro_plus: new Set([
    'browse', 'save_event_unlimited', 'calendar_sync', 'live_updates', 'smart_alerts',
    'replayer', 'gif_export', 'video_export', 'instagram_share',
    'track_result_unlimited', 'pnl_charts', 'export',
    'social_messaging', 'conflict_detection',
    'table_scanner', 'staking', 'advanced_analytics', 'tax_reports',
    'multiple_profiles', 'priority_support',
  ]),
};

export function useSubscription() {
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) { setSub({ tier: 'free', status: 'free' }); setLoading(false); return; }
    try {
      const res = await fetch(`${API_URL}/subscription`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setSub(await res.json());
      setError(null);
    } catch (e) {
      setError(e);
      // Fail open as free — never block the app because billing is down.
      setSub({ tier: 'free', status: 'free' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const startTrial = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const res = await fetch(`${API_URL}/subscription/trial/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const next = await res.json();
    setSub(next);
    return next;
  }, []);

  const tier = sub?.tier || 'free';
  const feats = FEATURE_MATRIX[tier] || FEATURE_MATRIX.free;

  return {
    sub,
    loading,
    error,
    tier,
    isTrialing: sub?.status === 'trial',
    trialDaysLeft: sub?.trial?.remainingDays ?? null,
    isPro: tier !== 'free',
    isProPlus: tier === 'suite_pro_plus',
    has: (feature) => feats.has(feature),
    refresh,
    startTrial,
  };
}

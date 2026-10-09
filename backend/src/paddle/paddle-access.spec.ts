import { getSubscriptionUiState, hasPaidAccess } from './paddle-access';

describe('paddle-access', () => {
  describe('hasPaidAccess', () => {
    it('grants access for active and trialing', () => {
      expect(hasPaidAccess({ status: 'active' })).toBe(true);
      expect(hasPaidAccess({ status: 'trialing' })).toBe(true);
    });

    it('grants access during past_due (dunning grace period)', () => {
      expect(hasPaidAccess({ status: 'past_due' })).toBe(true);
    });

    it('revokes access only for terminal paused / canceled', () => {
      expect(hasPaidAccess({ status: 'paused' })).toBe(false);
      expect(hasPaidAccess({ status: 'canceled' })).toBe(false);
    });

    it('returns false for missing subscription', () => {
      expect(hasPaidAccess(null)).toBe(false);
      expect(hasPaidAccess(undefined)).toBe(false);
    });

    it('keeps access when a cancel is merely scheduled (still active)', () => {
      expect(
        hasPaidAccess({
          status: 'active',
          scheduledChangeAction: 'cancel',
          scheduledChangeAt: new Date('2030-01-01'),
        }),
      ).toBe(true);
    });

    it('returns false for unknown statuses (fail closed)', () => {
      expect(hasPaidAccess({ status: 'deleted' })).toBe(false);
    });
  });

  describe('getSubscriptionUiState', () => {
    it('returns no-subscription when empty', () => {
      expect(getSubscriptionUiState(null)).toBe('no-subscription');
    });

    it('surfaces scheduled cancel / pause', () => {
      expect(
        getSubscriptionUiState({
          status: 'active',
          scheduledChangeAction: 'cancel',
        }),
      ).toBe('cancel-scheduled');
      expect(
        getSubscriptionUiState({
          status: 'active',
          scheduledChangeAction: 'pause',
        }),
      ).toBe('pause-scheduled');
    });

    it('falls through to raw status otherwise', () => {
      expect(getSubscriptionUiState({ status: 'trialing' })).toBe('trialing');
      expect(getSubscriptionUiState({ status: 'canceled' })).toBe('canceled');
    });
  });
});

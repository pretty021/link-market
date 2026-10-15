import { describe, expect, it } from 'vitest';
import { describePayment } from '@/components/payment-method-picker';

const d = (type: string) => describePayment({ id: type, type, address: 'addr' });

describe('payment method labels', () => {
  it('reads coin and network from the free-text type', () => {
    expect(d('USDT TRC20')).toMatchObject({ code: 'USDT', name: 'Tether USD (Tron)', network: { badge: 'TRX' }, stable: true, popular: true });
    expect(d('usdt erc20').network?.badge).toBe('ETH');
    expect(d('USDT BEP20').network?.badge).toBe('BSC');
    expect(d('USDT Solana').name).toBe('Tether USD (Solana)');
    expect(d('USDT TRC20').warning).toBe('Only send USDT on the Tron (TRC20) network.');
  });

  it('treats ETH / SOL alone as the coin, not a network', () => {
    expect(d('ETH')).toMatchObject({ code: 'ETH', name: 'Ethereum', network: null });
    expect(d('BTC')).toMatchObject({ code: 'BTC', name: 'Bitcoin', network: null, warning: 'Only send BTC to this address.' });
  });

  it('non-crypto methods have no network warning; unknown types keep their own name', () => {
    expect(d('PayPal')).toMatchObject({ code: 'PayPal', name: 'Email transfer', warning: null, popular: true });
    expect(d('Zelle')).toMatchObject({ code: 'Zelle', name: 'Payment address', glyph: 'Z', warning: null });
  });
});

describe('default payment types', () => {
  it('every default type gets its coin and network badge', async () => {
    const { DEFAULT_PAYMENT_TYPES } = await import('@/components/payment-method-picker');
    const seen = DEFAULT_PAYMENT_TYPES.map((t) => `${d(t).code} ${d(t).network?.badge}`);
    expect(seen).toEqual(['USDT TRX', 'USDT BSC', 'USDT SOLANA', 'USDT ETH', 'USDC SOLANA', 'USDC BASE', 'USDC POLYGON', 'USDC ETH']);
    expect(d('USDC Base').warning).toBe('Only send USDC on the Base network.');
  });
});

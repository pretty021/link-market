import { describe, expect, it } from 'vitest';
import { accountInitials } from '@/components/linkedin-card';

describe('account initials on the card cover', () => {
  it('names, short numbers, phone numbers and emails', () => {
    expect(accountInitials('Gregory Yunker')).toBe('GY');
    expect(accountInitials('Test1')).toBe('T');
    expect(accountInitials('1234')).toBe('12');
    expect(accountInitials('+1(919) 483-3934')).toBe('919');
    expect(accountInitials('+1 919 483 3934')).toBe('919');
    expect(accountInitials('9194833934')).toBe('919');
    expect(accountInitials('abc@gmail.com')).toBe('A');
    expect(accountInitials('https://linkedin.com/in/x')).toBe('in');
  });
});

import { z } from 'zod';

/**
 * IMEI validation: exactly 15 digits + Luhn check digit.
 * (Real devices follow this; validating format catches typos at receiving time.)
 */
export const isValidImei = (value) => {
  if (!/^\d{15}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let digit = Number(value[i]);
    // every second digit (from the right) is doubled
    if ((15 - i) % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
};

export const imeiSchema = z
  .string()
  .regex(/^\d{15}$/, 'IMEI must be exactly 15 digits')
  .refine(isValidImei, 'IMEI check digit is invalid (Luhn)');

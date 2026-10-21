import { describe, expect, it } from 'vitest';
import { juntarClasses } from './classes.ts';

describe('juntarClasses', () => {
  it('junta só as classes presentes', () => {
    expect(juntarClasses('botao', undefined, false, null, '', 'principal')).toBe('botao principal');
  });
});

import { describe, expect, it } from 'vitest';
import { fitWithin } from './image';

describe('fitWithin', () => {
  it('leaves small images alone', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('scales a landscape photo so the long side is 1280', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
  });

  it('scales a portrait photo so the long side is 1280', () => {
    expect(fitWithin(3000, 4000)).toEqual({ width: 960, height: 1280 });
  });
});

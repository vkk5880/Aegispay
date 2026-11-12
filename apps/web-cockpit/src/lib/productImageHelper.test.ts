import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getProductImageUrl,
  getAllProductImages,
  FALLBACK_STUDIO_PLACEHOLDER,
} from './productImageHelper.js';

test('productImageHelper: prefers cleaned_url when present', () => {
  const url = getProductImageUrl({
    cleaned_url: 'https://cdn.trychannel3.com/clean.png',
    cleaned_image_url: 'https://cdn.trychannel3.com/secondary.png',
    image_url: 'https://raw.jpg',
  });
  assert.equal(url, 'https://cdn.trychannel3.com/clean.png');
});

test('productImageHelper: falls back to cleaned_image_url if cleaned_url is missing', () => {
  const url = getProductImageUrl({
    cleaned_image_url: 'https://cdn.trychannel3.com/secondary.png',
    image_url: 'https://raw.jpg',
  });
  assert.equal(url, 'https://cdn.trychannel3.com/secondary.png');
});

test('productImageHelper: falls back to raw image_url when cleaned urls are missing', () => {
  const url = getProductImageUrl({
    image_url: 'https://raw.jpg',
  });
  assert.equal(url, 'https://raw.jpg');
});

test('productImageHelper: falls back to images array object cleaned_url or url', () => {
  const url = getProductImageUrl({
    images: [{ url: 'https://images.com/1.png', cleaned_url: 'https://images.com/1-clean.png' }] as any,
  });
  assert.equal(url, 'https://images.com/1-clean.png');

  const rawUrl = getProductImageUrl({
    images: [{ url: 'https://images.com/1.png', cleaned_url: '' }] as any,
  });
  assert.equal(rawUrl, 'https://images.com/1.png');

  const stringArrayUrl = getProductImageUrl({
    images: ['https://images.com/str.png'] as any,
  });
  assert.equal(stringArrayUrl, 'https://images.com/str.png');
});

test('productImageHelper: returns FALLBACK_STUDIO_PLACEHOLDER when object is empty or undefined', () => {
  assert.equal(getProductImageUrl(null), FALLBACK_STUDIO_PLACEHOLDER);
  assert.equal(getProductImageUrl(undefined), FALLBACK_STUDIO_PLACEHOLDER);
  assert.equal(getProductImageUrl({}), FALLBACK_STUDIO_PLACEHOLDER);
  assert.equal(getProductImageUrl({ cleaned_url: '   ' }), FALLBACK_STUDIO_PLACEHOLDER);
});

test('productImageHelper: getAllProductImages de-duplicates and orders studio assets', () => {
  const list = getAllProductImages({
    cleaned_url: 'https://cdn.com/a.png',
    cleaned_image_url: 'https://cdn.com/a.png',
    image_url: 'https://cdn.com/b.png',
    images: [
      { url: 'https://cdn.com/b.png', cleaned_url: 'https://cdn.com/c.png' },
      'https://cdn.com/d.png',
    ] as any,
  });
  assert.equal(list.length, 4);
  assert.equal(list[0], 'https://cdn.com/a.png');
  assert.equal(list[1], 'https://cdn.com/b.png');
  assert.equal(list[2], 'https://cdn.com/c.png');
  assert.equal(list[3], 'https://cdn.com/d.png');
});

test('productImageHelper: getAllProductImages falls back to placeholder when empty', () => {
  const list = getAllProductImages(null);
  assert.deepEqual(list, [FALLBACK_STUDIO_PLACEHOLDER]);
});

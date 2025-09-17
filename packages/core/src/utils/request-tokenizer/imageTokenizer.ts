/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ImageMetadata } from './types.js';

/**
 * Image tokenizer for calculating image tokens based on dimensions
 *
 * Key rules:
 * - 28x28 pixels = 1 token
 * - Minimum: 4 tokens per image
 * - Maximum: 16384 tokens per image
 * - Additional: 2 special tokens (vision_bos + vision_eos)
 * - Supports: PNG, JPEG, WebP, GIF formats
 */
export class ImageTokenizer {
  /** 28x28 pixels = 1 token */
  private static readonly PIXELS_PER_TOKEN = 28 * 28;

  /** Minimum tokens per image */
  private static readonly MIN_TOKENS_PER_IMAGE = 4;

  /** Maximum tokens per image */
  private static readonly MAX_TOKENS_PER_IMAGE = 16384;

  /** Special tokens for vision markers */
  private static readonly VISION_SPECIAL_TOKENS = 2;

  /**
   * Extract image metadata from base64 data
   *
   * @param base64Data Base64-encoded image data (with or without data URL prefix)
   * @param mimeType MIME type of the image
   * @returns Promise resolving to ImageMetadata with dimensions and format info
   */
  async extractImageMetadata(
    base64Data: string,
    mimeType: string,
  ): Promise<ImageMetadata> {
    try {
      const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      const dimensions = await this.extractDimensions(buffer, mimeType);

      return {
        width: dimensions.width,
        height: dimensions.height,
        mimeType,
        dataSize: buffer.length,
      };
    } catch (error) {
      console.warn('Failed to extract image metadata:', error);
      // Return default metadata for fallback
      return {
        width: 512,
        height: 512,
        mimeType,
        dataSize: Math.floor(base64Data.length * 0.75),
      };
    }
  }

  /**
   * Extract image dimensions from buffer based on format
   *
   * @param buffer Binary image data buffer
   * @param mimeType MIME type to determine parsing strategy
   * @returns Promise resolving to width and height dimensions
   */
  private async extractDimensions(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ width: number; height: number }> {
    if (mimeType.includes('png')) {
      return this.extractPngDimensions(buffer);
    }

    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      return this.extractJpegDimensions(buffer);
    }

    if (mimeType.includes('webp')) {
      return this.extractWebpDimensions(buffer);
    }

    if (mimeType.includes('gif')) {
      return this.extractGifDimensions(buffer);
    }

    return { width: 512, height: 512 };
  }

  /**
   * Extract PNG dimensions from IHDR chunk
   * PNG signature: 89 50 4E 47 0D 0A 1A 0A
   * Width/height at bytes 16-19 and 20-23 (big-endian)
   */
  private extractPngDimensions(buffer: Buffer): {
    width: number;
    height: number;
  } {
    if (buffer.length < 24) {
      throw new Error('Invalid PNG: buffer too short');
    }

    // Verify PNG signature
    const signature = buffer.subarray(0, 8);
    const expectedSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    if (!signature.equals(expectedSignature)) {
      throw new Error('Invalid PNG signature');
    }

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);

    return { width, height };
  }

  /**
   * Extract JPEG dimensions from SOF (Start of Frame) markers
   * JPEG starts with FF D8, SOF markers: 0xC0-0xC3, 0xC5-0xC7, 0xC9-0xCB, 0xCD-0xCF
   * Dimensions at offset +5 (height) and +7 (width) from SOF marker
   */
  private extractJpegDimensions(buffer: Buffer): {
    width: number;
    height: number;
  } {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      throw new Error('Invalid JPEG signature');
    }

    let offset = 2;

    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }

      const marker = buffer[offset + 1];

      // SOF markers
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }

      const segmentLength = buffer.readUInt16BE(offset + 2);
      offset += 2 + segmentLength;
    }

    throw new Error('Could not find JPEG dimensions');
  }

  /**
   * Extract WebP dimensions from RIFF container
   * Supports VP8, VP8L, and VP8X formats
   */
  private extractWebpDimensions(buffer: Buffer): {
    width: number;
    height: number;
  } {
    if (buffer.length < 30) {
      throw new Error('Invalid WebP: too short');
    }

    const riffSignature = buffer.subarray(0, 4).toString('ascii');
    const webpSignature = buffer.subarray(8, 12).toString('ascii');

    if (riffSignature !== 'RIFF' || webpSignature !== 'WEBP') {
      throw new Error('Invalid WebP signature');
    }

    const format = buffer.subarray(12, 16).toString('ascii');

    if (format === 'VP8 ') {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      return { width, height };
    } else if (format === 'VP8L') {
      const bits = buffer.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return { width, height };
    } else if (format === 'VP8X') {
      const width = (buffer.readUInt32LE(24) & 0xffffff) + 1;
      const height = (buffer.readUInt32LE(26) & 0xffffff) + 1;
      return { width, height };
    }

    throw new Error('Unsupported WebP format');
  }

  /**
   * Extract GIF dimensions from header
   * Supports GIF87a and GIF89a formats
   */
  private extractGifDimensions(buffer: Buffer): {
    width: number;
    height: number;
  } {
    if (buffer.length < 10) {
      throw new Error('Invalid GIF: too short');
    }

    const signature = buffer.subarray(0, 6).toString('ascii');
    if (signature !== 'GIF87a' && signature !== 'GIF89a') {
      throw new Error('Invalid GIF signature');
    }

    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);

    return { width, height };
  }

  /**
   * Calculate tokens for an image based on its metadata
   *
   * @param metadata Image metadata containing width, height, and format info
   * @returns Total token count including base image tokens and special tokens
   */
  calculateTokens(metadata: ImageMetadata): number {
    return this.calculateTokensWithScaling(metadata.width, metadata.height);
  }

  /**
   * Calculate tokens with scaling logic
   *
   * Steps:
   * 1. Normalize to 28-pixel multiples
   * 2. Scale large images down, small images up
   * 3. Calculate tokens: pixels / 784 + 2 special tokens
   *
   * @param width Original image width in pixels
   * @param height Original image height in pixels
   * @returns Total token count for the image
   */
  private calculateTokensWithScaling(width: number, height: number): number {
    // Normalize to 28-pixel multiples
    let hBar = Math.round(height / 28) * 28;
    let wBar = Math.round(width / 28) * 28;

    // Define pixel boundaries
    const minPixels =
      ImageTokenizer.MIN_TOKENS_PER_IMAGE * ImageTokenizer.PIXELS_PER_TOKEN;
    const maxPixels =
      ImageTokenizer.MAX_TOKENS_PER_IMAGE * ImageTokenizer.PIXELS_PER_TOKEN;

    // Apply scaling
    if (hBar * wBar > maxPixels) {
      // Scale down large images
      const beta = Math.sqrt((height * width) / maxPixels);
      hBar = Math.floor(height / beta / 28) * 28;
      wBar = Math.floor(width / beta / 28) * 28;
    } else if (hBar * wBar < minPixels) {
      // Scale up small images
      const beta = Math.sqrt(minPixels / (height * width));
      hBar = Math.ceil((height * beta) / 28) * 28;
      wBar = Math.ceil((width * beta) / 28) * 28;
    }

    // Calculate tokens
    const imageTokens = Math.floor(
      (hBar * wBar) / ImageTokenizer.PIXELS_PER_TOKEN,
    );

    return imageTokens + ImageTokenizer.VISION_SPECIAL_TOKENS;
  }

  /**
   * Calculate tokens for multiple images serially
   *
   * @param base64DataArray Array of image data with MIME type information
   * @returns Promise resolving to array of token counts in same order as input
   */
  async calculateTokensBatch(
    base64DataArray: Array<{ data: string; mimeType: string }>,
  ): Promise<number[]> {
    const results: number[] = [];

    for (const { data, mimeType } of base64DataArray) {
      try {
        const metadata = await this.extractImageMetadata(data, mimeType);
        results.push(this.calculateTokens(metadata));
      } catch (error) {
        console.warn('Error calculating tokens for image:', error);
        // Return minimum tokens as fallback
        results.push(
          ImageTokenizer.MIN_TOKENS_PER_IMAGE +
            ImageTokenizer.VISION_SPECIAL_TOKENS,
        );
      }
    }

    return results;
  }
}

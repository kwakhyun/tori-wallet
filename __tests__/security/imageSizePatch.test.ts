const { spawnSync } = require('node:child_process');

const parserScript = `
  const { imageSize } = require('image-size');
  try {
    imageSize(Buffer.from(process.argv[1], 'hex'));
    process.exit(2);
  } catch (error) {
    process.exit(String(error && error.message).startsWith('Invalid ') ? 0 : 3);
  }
`;

function expectMalformedImageToTerminate(hex: string) {
  const result = spawnSync(process.execPath, ['-e', parserScript, hex], {
    cwd: process.cwd(),
    timeout: 2_000,
  });

  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).toBe(0);
}

describe('image-size denial-of-service patch', () => {
  it('rejects a zero-length JXL partial-stream box without looping', () => {
    const buffer = Buffer.alloc(40);
    buffer.writeUInt32BE(12, 0);
    buffer.write('JXL ', 4, 'ascii');
    buffer.writeUInt32BE(20, 12);
    buffer.write('ftyp', 16, 'ascii');
    buffer.write('jxl ', 20, 'ascii');
    buffer.writeUInt32BE(0, 32);
    buffer.write('jxlp', 36, 'ascii');

    expectMalformedImageToTerminate(buffer.toString('hex'));
  });

  it('rejects a zero-length ICNS entry without looping', () => {
    const buffer = Buffer.alloc(16);
    buffer.write('icns', 0, 'ascii');
    buffer.writeUInt32BE(16, 4);
    buffer.write('icp4', 8, 'ascii');
    buffer.writeUInt32BE(0, 12);

    expectMalformedImageToTerminate(buffer.toString('hex'));
  });
});

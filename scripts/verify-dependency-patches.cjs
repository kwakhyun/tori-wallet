// Keep exceptions tied to executable checks of the installed packages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { Readable, Writable } = require('node:stream');

async function main() {
  const { nextTick, asyncLoop } = require('@noble/hashes/utils');
  let hostEventHandled = false;
  setTimeout(() => { hostEventHandled = true; }, 0);
  await nextTick();
  assert.equal(hostEventHandled, true, 'KDF scheduling must yield to host events');

  // Native timer latency can exceed the slice budget. It must not force a
  // separate timer for every remaining KDF iteration on a slower device.
  const originalNow = Date.now;
  const originalTimeout = global.setTimeout;
  let elapsed = 0;
  let yields = 0;
  try {
    Date.now = () => elapsed;
    global.setTimeout = callback => {
      yields++;
      elapsed += 50;
      return originalTimeout(callback, 0);
    };
    await asyncLoop(5, 10, () => { elapsed += 5; });
    assert.equal(yields, 2, 'Timer latency must not consume the next CPU slice');
  } finally {
    Date.now = originalNow;
    global.setTimeout = originalTimeout;
  }

  const decode = require('decode-uri-component');
  assert.equal(decode('hello+world%20%ED%86%A0%EB%A6%AC'), 'hello world 토리');
  assert.equal(decode('%FF'.repeat(20000)), '%FF'.repeat(20000));
  assert.equal(decode('%E0%A4%A'), '%E0%A4%A');

  const { sprintf } = require('sprintf-js');
  for (const type of ['f', 'e', 'g']) {
    assert.equal(typeof sprintf(`%.999999${type}`, 1.23), 'string');
  }
  assert.equal(sprintf('%.2f', 1.234), '1.23');

  const braces = require('braces');
  const nested = '{'.repeat(2000) + 'a,b' + '}'.repeat(2000);
  for (const fn of [braces.compile, braces.expand, braces.stringify])
    assert.throws(() => fn(nested), /nesting limit/);
  let ast = { type: 'text', value: 'a' };
  for (let i = 0; i < 10000; i++) ast = { type: 'brace', nodes: [ast] };
  assert.throws(() => braces.compile(ast), /nesting limit/);
  assert.deepEqual(braces.expand('src/{a,b}.ts'), ['src/a.ts', 'src/b.ts']);

  const { parser } = require('stream-json');
  const { streamValues } = require('stream-json/streamers/StreamValues');
  const Assembler = require('stream-json/Assembler');
  const input =
    '{"__proto__":{"isAdmin":true},"nested":{"__proto__":{"flag":true}}}';
  const values = [];
  await pipeline(
    Readable.from([input]),
    parser(),
    streamValues(),
    new Writable({
      objectMode: true,
      write(value, _, cb) {
        values.push(value.value);
        cb();
      },
    }),
  );
  assert.equal(Object.getPrototypeOf(values[0]), Object.prototype);
  assert.equal(values[0].isAdmin, undefined);
  assert.equal(values[0].nested.flag, undefined);
  assert.equal(Object.hasOwn(values[0], '__proto__'), true);
  // Reviver uses a separate assignment path.
  const asm = new Assembler({ reviver: (_, value) => value });
  asm.startObject();
  asm.keyValue('__proto__');
  asm.startObject();
  asm.keyValue('isAdmin');
  asm.trueValue();
  asm.endObject();
  asm.endObject();
  assert.equal(asm.current.isAdmin, undefined);
  assert.equal(Object.hasOwn(asm.current, '__proto__'), true);
  for (const name of ['Pick', 'Ignore', 'Filter', 'Replace']) {
    const Filter = require(`stream-json/filters/${name}`);
    const doc = '{"x":'.repeat(2000) + '1' + '}'.repeat(2000);
    await assert.rejects(
      pipeline(
        Readable.from([doc]),
        parser(),
        new Filter({ filter: 'absent' }),
        new Writable({
          objectMode: true,
          write(_, __, cb) {
            cb();
          },
        }),
      ),
      /nesting limit/,
    );
  }
  // JSONC was introduced after v1; the advisory's entry points do not exist here.
  assert.equal(
    fs.existsSync(
      require('node:path').join(
        require('node:path').dirname(require.resolve('stream-json')),
        'jsonc',
      ),
    ),
    false,
  );

  const { imageSize } = require('image-size');
  const jxl = Buffer.alloc(40);
  jxl.writeUInt32BE(12, 0);
  jxl.write('JXL ', 4);
  jxl.writeUInt32BE(20, 12);
  jxl.write('ftyp', 16);
  jxl.write('jxl ', 20);
  jxl.write('jxlp', 36);
  const icns = Buffer.alloc(16);
  icns.write('icns');
  icns.writeUInt32BE(16, 4);
  icns.write('icp4', 8);
  assert.throws(() => imageSize(jxl), /Invalid/);
  assert.throws(() => imageSize(icns), /Invalid/);
  console.log('Dependency patch regressions passed.');
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

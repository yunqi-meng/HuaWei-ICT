// Decode the publicly served chart payload using the site's own browser codec.
// No downloaded JavaScript is evaluated; the WASM module receives no host imports.
const fs = require('node:fs');
(async () => {
  const [codecFile, inputFile, outputFile] = process.argv.slice(2);
  const { instance } = await WebAssembly.instantiate(fs.readFileSync(codecFile), {});
  const codec = instance.exports;
  const input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const output = input.map(page => ({ slug: page.slug, series: page.series.map(series => {
    const bytes = Buffer.from(series.p, 'base64');
    if (![1, 2].includes(bytes[0]) || bytes.length > codec.inputCap()) throw Error('Unsupported chart encoding');
    new Uint8Array(codec.memory.buffer, codec.inputPtr(), bytes.length).set(bytes);
    const count = codec.decode(bytes.length);
    if (count < 0 || count > 100000) throw Error('Invalid decoded chart size');
    const values = Array.from(new Float64Array(codec.memory.buffer, codec.outputPtr(), count));
    if (!values.every(Number.isFinite) || (bytes[0] === 1 && count % 2)) throw Error('Invalid chart values');
    return { id: series.id, points: bytes[0] === 1 ? Array.from({ length: count / 2 }, (_, i) => values.slice(i * 2, i * 2 + 2)) : values };
  }) }));
  fs.writeFileSync(outputFile, JSON.stringify(output));
})().catch(error => { console.error(error.message); process.exitCode = 1; });

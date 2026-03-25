const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isProduction = process.env.NODE_ENV === 'production';
const isWatch = process.argv.includes('--watch');

const outdir = path.join(__dirname, 'public', 'dist');
if (!fs.existsSync(outdir)) fs.mkdirSync(outdir, { recursive: true });

const files = ['app', 'export', 'staking', 'social', 'replayer'];

const commonOptions = {
  bundle: false,
  minify: isProduction,
  sourcemap: !isProduction,
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  target: 'es2020',
  charset: 'utf8',
};

async function build() {
  const start = Date.now();

  if (isWatch) {
    // Use esbuild's watch mode for each file
    const contexts = await Promise.all(files.map(f =>
      esbuild.context({
        ...commonOptions,
        entryPoints: [path.join(__dirname, 'src', f + '.jsx')],
        outfile: path.join(outdir, f + '.js'),
      })
    ));

    await Promise.all(contexts.map(ctx => ctx.watch()));
    console.log(`[esbuild] Watching ${files.length} files for changes...`);
  } else {
    // One-shot build
    await Promise.all(files.map(f =>
      esbuild.build({
        ...commonOptions,
        entryPoints: [path.join(__dirname, 'src', f + '.jsx')],
        outfile: path.join(outdir, f + '.js'),
      })
    ));
    console.log(`[esbuild] Built ${files.length} files in ${Date.now() - start}ms`);
  }
}

build().catch(err => {
  console.error('[esbuild] Build failed:', err);
  process.exit(1);
});

// Bygger én HTML-fil: dist/huset-mitt.html (artefakt) og dist/huset-mitt-frittstaende.html (åpnes direkte i nettleser)
const fs = require('fs'), path = require('path');
const src = p => fs.readFileSync(path.join(__dirname, 'src', p), 'utf8');
const js = fs.readdirSync(path.join(__dirname, 'src/js')).filter(f => f.endsWith('.js')).sort().map(f => `/* ---- ${f} ---- */\n` + src('js/' + f)).join('\n');
if (js.includes('</script')) throw new Error('JS inneholder </script');
const page = `${src('head.html')}<style>\n${src('styles.css')}\n</style>\n${src('body.html')}<script>\n${js}\n</script>\n`;
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/huset-mitt.html'), page);
const standalone = `<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n${page}</body></html>\n`;
fs.writeFileSync(path.join(__dirname, 'dist/huset-mitt-frittstaende.html'), standalone);
console.log('OK', (page.length / 1024).toFixed(0) + ' KB');

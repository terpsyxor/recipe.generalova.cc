import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access, readdir} from 'node:fs/promises';
import {build,markdown,parse} from './build.mjs';
test('Markdown escapes HTML and handles lists',()=>{assert.equal(markdown('<script>x</script>'),'<p>&lt;script&gt;x&lt;/script&gt;</p>');assert.equal(markdown('- a\n- b\n\n## Title'),'<ul><li>a</li><li>b</li></ul><h2>Title</h2>');});
test('Reject malformed metadata',()=>assert.throws(()=>parse('no frontmatter','bad.md')));
test('Build all pages; every local link and asset resolves',async()=>{await build();const root=new URL('../dist/',import.meta.url);const home=await readFile(new URL('index.html',root),'utf8');assert.equal((home.match(/class="card tone-/g)||[]).length,4);const paths=['index.html','404.html',...(await readdir(new URL('recipes/',root))).map(s=>'recipes/'+s+'/index.html')];for(const p of paths){const html=await readFile(new URL(p,root),'utf8');assert.ok(!html.includes('{{'));for(const m of html.matchAll(/(?:href|src)="(\/[^"#]*)(?:#[^"]*)?"/g)){let target=m[1].slice(1);if(!target||target.endsWith('/'))target+='index.html';await access(new URL(target,root));}}const cake=await readFile(new URL('recipes/pink-cloud/index.html',root),'utf8');assert.ok(cake.includes('110 г'));assert.ok(cake.includes('минимум на 4 часа'));});

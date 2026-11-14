import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access, readdir} from 'node:fs/promises';
import {build,markdown,parse} from './build.mjs';
import {languages,translations} from './i18n.mjs';
test('Markdown escapes HTML and handles lists',()=>{assert.equal(markdown('<script>x</script>'),'<p>&lt;script&gt;x&lt;/script&gt;</p>');assert.equal(markdown('- a\n- b\n\n## Title'),'<ul><li>a</li><li>b</li></ul><h2>Title</h2>');});
test('Reject malformed metadata',()=>assert.throws(()=>parse('no frontmatter','bad.md')));
test('All localized pages, assets and equivalent language links resolve',async()=>{
 await build();const root=new URL('../dist/',import.meta.url);
 const slugs=await readdir(new URL('recipes/',root));
 for(const [lang,c] of Object.entries(languages)){
  const prefix=c.prefix.slice(1);const local=p=>(prefix?prefix+'/':'')+p;
  const home=await readFile(new URL(local('index.html'),root),'utf8');
  assert.equal((home.match(/class="card tone-/g)||[]).length,4);
  for(const slug of [null,...slugs]){
   const p=local(slug?'recipes/'+slug+'/index.html':'index.html');
   const html=await readFile(new URL(p,root),'utf8');
   assert.ok(html.includes(`<html lang="${c.tag}">`));assert.ok(!html.includes('{{'));
   assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
   for(const [other,oc] of Object.entries(languages)){
    const url=oc.prefix+(slug?'/recipes/'+slug+'/':'/');
    assert.ok(html.includes(`href="${url}" lang="${oc.tag}" hreflang="${oc.tag}"`),`${p} has equivalent ${other} link`);
    assert.ok(html.includes(`hreflang="${oc.tag}" href="https://recipe.generalova.cc${url}"`));
   }
   if(lang!=='ru')assert.ok(!/[А-Яа-яЁё]/.test(html.replaceAll('Русский','')),`${p} has no untranslated Russian`);
   for(const m of html.matchAll(/(?:href|src)="(\/[^"#]*)(?:#[^"]*)?"/g)){
    let target=m[1].slice(1);if(!target||target.endsWith('/'))target+='index.html';await access(new URL(target,root));
   }
   if(slug)assert.ok(html.includes(`data-copied="${translations[lang].copied}"`));
  }
  const error=await readFile(new URL(local('404.html'),root),'utf8');assert.ok(error.includes(translations[lang].notFound));
  const cake=await readFile(new URL(local('recipes/pink-cloud/index.html'),root),'utf8');assert.ok(cake.includes('170 °C'));assert.ok(cake.includes('30–35'));
 }
 const map=await readFile(new URL('sitemap.xml',root),'utf8');assert.equal((map.match(/<loc>/g)||[]).length,15);
});

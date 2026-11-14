import {languages, translations} from './i18n.mjs';
import {readFile, readdir, mkdir, rm, writeFile, cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'dist');
const site = (process.env.SITE_URL || 'https://recipe.generalova.cc').replace(/\/$/, '');
if (!/^https?:\/\/[^\s]+$/.test(site)) throw new Error('SITE_URL must be an absolute HTTP(S) URL');
export const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Deliberately small, safe Markdown: headings, paragraphs, lists, bold. No raw HTML.
export function markdown(source) {
 let html='', list='';
 const close = () => {if(list){html+=`</${list}>`;list='';}};
 const inline = s => escape(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
 for(const line of source.split('\n')) {
  const h=line.match(/^(#{1,3}) (.+)$/), li=line.match(/^(- |\d+\. )(.+)$/);
  if(li){const type=li[1]==='- '?'ul':'ol';if(list!==type){close();list=type;html+=`<${type}>`;}html+=`<li>${inline(li[2])}</li>`;}
  else {close();if(h)html+=`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;else if(line.trim())html+=`<p>${inline(line)}</p>`;}
 }close();return html;
}
export function parse(source, filename) {
 const match=source.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
 if(!match)throw new Error(`${filename}: missing front matter`);
 const data={};for(const line of match[1].split('\n')){const i=line.indexOf(':');if(i<1)throw new Error(`${filename}: invalid metadata`);data[line.slice(0,i)]=line.slice(i+1).trim();}
 for(const key of ['title','slug','category','description','time','servings'])if(!data[key])throw new Error(`${filename}: missing ${key}`);
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug))throw new Error(`${filename}: invalid slug`);
 if(data.image && !/^\/images\/[a-z0-9-]+\.(png|jpg|webp)$/.test(data.image))throw new Error(`${filename}: invalid local image path`);
 return {...data,body:match[2]};
}
export async function build(){
 const files=(await readdir(path.join(root,'recipes'))).filter(f=>f.endsWith('.md')).sort();
 const all={};
 for(const lang of Object.keys(languages)){
  const dir=path.join(root,'recipes',lang==='ru'?'':lang);
  all[lang]=await Promise.all(files.map(async f=>parse(await readFile(path.join(dir,f),'utf8'),`${lang}/${f}`)));
  if(new Set(all[lang].map(r=>r.slug)).size!==files.length)throw new Error('Duplicate recipe slug');
  if(lang!=='ru')for(let i=0;i<files.length;i++)if(all[lang][i].slug!==all.ru[i].slug)throw new Error(`Translation slug mismatch: ${lang}/${files[i]}`);
 }
 const layout=await readFile(path.join(root,'templates/layout.html'),'utf8');
 await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});await cp(path.join(root,'public'),out,{recursive:true});
 const urls=[];
 for(const [lang,config] of Object.entries(languages)){
 const t=translations[lang],recipes=all[lang],base=config.prefix,home=base+'/';
 const lines=s=>escape(s).replace(/\|/g,'<br>');
 const route=(l,slug)=>languages[l].prefix+(slug?`/recipes/${slug}/`:'/');
 const render=(title,description,slug,content,is404=false)=>{
  const current=is404?base+'/404.html':route(lang,slug);
  const switcher=`<nav class="language-switch" aria-label="${escape(t.language)}">${Object.entries(languages).map(([l,c])=>`<a href="${route(l,slug)}" lang="${c.tag}" hreflang="${c.tag}" title="${c.label}" aria-label="${c.label}"${l===lang?' aria-current="page"':''}>${l.toUpperCase()}</a>`).join('')}</nav>`;
  const alternates=is404?'<meta name="robots" content="noindex">':Object.entries(languages).map(([l,c])=>`<link rel="alternate" hreflang="${c.tag}" href="${escape(site+route(l,slug))}">`).join('')+`<link rel="alternate" hreflang="x-default" href="${escape(site+route('ru',slug))}">`;
  const data={...t,title,description,url:site+current,lang:config.tag,locale:config.locale,home,brandPlain:t.brand.replace('|',' '),brand:lines(t.brand),switcher,alternates,content};
  const raw=new Set(['brand','switcher','alternates','content']);
  return layout.replace(/{{(\w+)}}/g,(_,k)=>{if(!(k in data))throw new Error('Unknown template key '+k);return raw.has(k)?data[k]:escape(data[k]);});
 };
 const save=async(rel,html)=>{const dest=path.join(out,rel);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,html);};
 const photo=r=>r.image?`<img src="${escape(r.image)}" alt="${escape(r.title+' — '+t.serving)}" width="1536" height="1024" loading="lazy" decoding="async">`:'';
 const cards=recipes.map((r,i)=>`<a class="card tone-${i%4}" href="${route(lang,r.slug)}" data-category="${escape(r.category)}" data-search="${escape(r.title+' '+r.description)}"><div class="card-art">${photo(r)}</div><div class="card-body"><span class="eyebrow">${escape(r.category)}</span><h3>${escape(r.title)}</h3><p>${escape(r.description)}</p><div class="card-meta"><span>${escape(r.time)}</span><span>${escape(t.read)} ↗</span></div></div></a>`).join('');
 const categories=[...new Set(recipes.map(r=>r.category))];
 const cake=recipes.find(r=>r.slug==='pink-cloud');
 const feature=cake?`<a class="hero-feature" href="${route(lang,cake.slug)}"><img src="${escape(cake.image)}" alt="${escape(cake.title+' — '+t.serving)}" width="1536" height="1024" fetchpriority="high"><div class="feature-caption"><div><span class="eyebrow">${escape(t.featured)}</span><h2>${escape(cake.title)}</h2></div><span class="round-arrow" aria-hidden="true">↗</span></div></a>`:'';
 const content=`<section class="hero"><div class="hero-copy"><p class="eyebrow">${escape(t.kicker)}</p><h1>${lines(t.headline)}</h1><p class="intro">${lines(t.intro)}</p><a class="button" href="#recipes">${escape(t.choose)} <span>↗</span></a><div class="hero-bottom"><span class="little-line"></span>${escape(t.occasion)}</div></div>${feature}</section><section id="recipes"><div class="section-heading"><div><p class="eyebrow">${escape(t.collection)}</p><h2>${escape(t.question)}</h2></div><span>${escape(t.count)} ${recipes.length}</span></div><div class="filters" hidden><div class="chips"><button class="chip active" data-filter="" aria-pressed="true">${escape(t.all)}</button>${categories.map(c=>`<button class="chip" data-filter="${escape(c)}" aria-pressed="false">${escape(c)}</button>`).join('')}</div><label class="search"><span class="sr-only">${escape(t.search)}</span><input type="search" placeholder="${escape(t.placeholder)}" id="search"></label></div><div class="cards">${cards}</div><p id="empty" role="status" hidden>${escape(t.empty)}</p></section>`;
 await save(base.slice(1)+'/index.html',render(t.homeTitle,t.homeDescription,null,content));urls.push(home);
 for(const r of recipes){
  const content=`<a class="back" href="${home}#recipes">← ${escape(t.all)}</a><article class="recipe"><header class="recipe-heading"><p class="eyebrow">${escape(r.category)}</p><h1>${escape(r.title)}</h1><p class="intro">${escape(r.description)}</p><div class="recipe-meta"><span>◷ ${escape(r.time)}</span><span>${escape(t.servings)}: ${escape(r.servings)}</span></div><div class="actions" hidden><button id="share" data-copied="${escape(t.copied)}" data-fallback="${escape(t.copyFallback)}">${escape(t.share)} ↗</button><button id="print">${escape(t.print)}</button></div><p id="share-status" role="status"></p></header><figure class="recipe-photo">${photo(r)}</figure><div class="recipe-content">${markdown(r.body)}</div></article>`;
  await save(route(lang,r.slug).slice(1)+'index.html',render(r.title+' · '+t.recipeSuffix,r.description,r.slug,content));urls.push(route(lang,r.slug));
 }
 await save(base.slice(1)+'/404.html',render(t.notFound,t.missing,null,`<section class="hero"><div class="hero-copy"><h1>${lines(t.missingHeading)}</h1><p>${escape(t.backQuestion)}</p><a class="button" href="${home}">${escape(t.openBook)}</a></div></section>`,true));
 }
 await writeFile(path.join(out,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(p=>`<url><loc>${escape(site+p)}</loc></url>`).join('')+'</urlset>');
 await writeFile(path.join(out,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
 console.log(`Built ${files.length} recipes in 3 languages in dist/`);
}
if(process.argv[1]===fileURLToPath(import.meta.url)) await build();

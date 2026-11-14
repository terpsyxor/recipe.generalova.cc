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
 const recipes=await Promise.all(files.map(async f=>parse(await readFile(path.join(root,'recipes',f),'utf8'),f)));
 if(new Set(recipes.map(r=>r.slug)).size!==recipes.length)throw new Error('Duplicate recipe slug');
 const layout=await readFile(path.join(root,'templates/layout.html'),'utf8');
 const render=(title,description,url,content)=>layout.replace(/{{(title|description|url|content)}}/g,(_,k)=>k==='content'?content:escape({title,description,url}[k]));
 await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});await cp(path.join(root,'public'),out,{recursive:true});
 const photo = r => r.image ? `<img src="${escape(r.image)}" alt="${escape(r.title)} — вариант подачи" width="1536" height="1024" loading="lazy" decoding="async">` : ''; 
 const cards=recipes.map((r,i)=>`<a class="card tone-${i%4}" href="/recipes/${r.slug}/" data-category="${escape(r.category)}" data-search="${escape(r.title+' '+r.description)}"><div class="card-art">${photo(r)}</div><div class="card-body"><span class="eyebrow">${escape(r.category)}</span><h3>${escape(r.title)}</h3><p>${escape(r.description)}</p><div class="card-meta"><span>${escape(r.time)}</span><span>Читать рецепт ↗</span></div></div></a>`).join('');
 const categories=[...new Set(recipes.map(r=>r.category))];
 const home=`<section class="hero"><div class="hero-copy"><p class="eyebrow">ГОТОВИТЬ — В УДОВОЛЬСТВИЕ</p><h1>Хорошая еда.<br>Дома.</h1><p class="intro">Немного вдохновения и понятные рецепты.<br>Всё, чтобы приготовить что-то вкусное.</p><a class="button" href="#recipes">Найти свой рецепт <span>↗</span></a><div class="hero-bottom"><span class="little-line"></span> На каждый день и особый случай</div></div><a class="hero-feature" href="/recipes/pink-cloud/"><img src="/images/pink-cloud.webp" alt="Торт с клубникой и малиной — вариант подачи" width="1536" height="1024" fetchpriority="high"><div class="feature-caption"><div><span class="eyebrow">РЕЦЕПТ ДЛЯ ВДОХНОВЕНИЯ</span><h2>Розовое облако</h2></div><span class="round-arrow" aria-hidden="true">↗</span></div></a></section><section id="recipes"><div class="section-heading"><div><p class="eyebrow">СОХРАНЯЙТЕ. ГОТОВЬТЕ. ДЕЛИТЕСЬ.</p><h2>Что приготовим?</h2></div><span>${recipes.length} рецепта в коллекции</span></div><div class="filters" hidden><div class="chips"><button class="chip active" data-filter="" aria-pressed="true">Все рецепты</button>${categories.map(c=>`<button class="chip" data-filter="${escape(c)}" aria-pressed="false">${escape(c)}</button>`).join('')}</div><label class="search"><span class="sr-only">Поиск рецептов</span><input type="search" placeholder="Найти что-нибудь вкусное…" id="search"></label></div><div class="cards">${cards}</div><p id="empty" role="status" hidden>Ничего не нашлось. Попробуйте другое название или категорию.</p></section>`;
 await writeFile(path.join(out,'index.html'),render('Просто вкусно · Домашние рецепты','Любимые домашние рецепты: торты, салаты и блюда на каждый день.',site+'/',home));
 for(const r of recipes){const dir=path.join(out,'recipes',r.slug);await mkdir(dir,{recursive:true});const content=`<a class="back" href="/#recipes">← Все рецепты</a><article class="recipe"><header class="recipe-heading"><p class="eyebrow">${escape(r.category)}</p><h1>${escape(r.title)}</h1><p class="intro">${escape(r.description)}</p><div class="recipe-meta"><span>◷ ${escape(r.time)}</span><span>Порции: ${escape(r.servings)}</span></div><div class="actions" hidden><button id="share">Поделиться ↗</button><button id="print">Распечатать</button></div><p id="share-status" role="status"></p></header><figure class="recipe-photo">${photo(r)}</figure><div class="recipe-content">${markdown(r.body)}</div></article>`;await writeFile(path.join(dir,'index.html'),render(r.title+' · Домашние рецепты',r.description,site+'/recipes/'+r.slug+'/',content));}
 await writeFile(path.join(out,'404.html'),render('Рецепт не найден','Этой страницы нет.',site+'/',`<section class="hero"><div><h1>Кажется, здесь<br>пока пусто.</h1><p>Вернёмся к рецептам?</p><a class="button" href="/">Открыть книгу рецептов</a></div></section>`));
 await writeFile(path.join(out,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+['/',...recipes.map(r=>'/recipes/'+r.slug+'/')].map(p=>`<url><loc>${escape(site+p)}</loc></url>`).join('')+'</urlset>');
 await writeFile(path.join(out,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
 console.log(`Built ${recipes.length} recipes in dist/`);
}
if(process.argv[1]===fileURLToPath(import.meta.url)) await build();

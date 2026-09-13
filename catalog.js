import { FILE_ACCEPT, filterMaterials } from './platform-utils.js';

const e = (value = '') => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
export const SUBJECTS = ['Химия', 'Жалпы химия', 'Бейорганикалық химия', 'Органикалық химия', 'Аналитикалық химия', 'Физикалық химия'];
export const CATEGORIES = ['Теория', 'Зертханалық жұмыс', 'Тапсырмалар', 'Оқу бағдарламасы', 'Презентация', 'Қауіпсіздік', 'Басқа'];
const distinct = values => [...new Set(values.filter(Boolean))];
const options = (values, value = '', empty = 'Барлығы') => `<option value="">${empty}</option>${distinct(values).map(option => `<option value="${e(option)}" ${option === value ? 'selected' : ''}>${e(option)}</option>`).join('')}`;
const filenameTitle = filename => String(filename || '').replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
const comparable = value => filenameTitle(value).toLocaleLowerCase('kk').replace(/[\s–—-]+/g, ' ');
const fileLabel = row => {
  const extension = String(row.filename || '').split('.').pop().toUpperCase();
  if (/^(PDF|DOCX?|PPTX?|XLSX?|PNG|JPE?G|WEBP|GIF|MP4|WEBM|MP3|WAV|ZIP)$/.test(extension)) return extension;
  return ({ image: 'Сурет', video: 'Видео', audio: 'Аудио', file: 'Файл' })[row.type] || String(row.type || 'Файл').toUpperCase();
};

export function materialRows(items, resources, kind) {
  const byId = new Map(items.map(item => [item.id, item]));
  const fileCounts = new Map();
  resources.forEach(resource => fileCounts.set(resource.item_id, (fileCounts.get(resource.item_id) || 0) + 1));
  return resources.flatMap(resource => {
    const item = byId.get(resource.item_id);
    if (!item) return [];
    const type = kind(resource);
    const category = resource.category || ((item.category && item.category !== 'Басқа') ? item.category : /жұмыс|парағы|тапсырма/i.test(resource.filename) ? 'Тапсырмалар' : type === 'ppt' ? 'Презентация' : /жоспар|силлабус|бағдарлама/i.test(resource.filename) ? 'Оқу бағдарламасы' : 'Теория');
    return [{ ...resource, title: resource.title || ((!item.description || fileCounts.get(item.id) > 1) ? filenameTitle(resource.filename) : item.title), description: resource.description || item.description || '', category, subject: resource.subject || item.subject || 'Химия', path: item.path, type, published: !!item.is_published && resource.is_published !== false && resource.is_published !== 0, editId: 'resource:' + resource.id }];
  });
}

export function cards(rows, admin = false) {
  return rows.map(row => {
    const editId = row.editId || row.item_id;
    const description = row.description && comparable(row.description) !== comparable(row.title) && comparable(row.description) !== comparable(row.filename) ? row.description : '';
    const showFilename = admin && !row.draft && comparable(row.filename) !== comparable(row.title);
    return `<article class="material-card${row.draft ? ' material-draft' : ''}">
      <div class="material-meta"><span class="file-type file-type-${e(row.type || 'file')}">${e(fileLabel(row))}</span><span class="material-category">${e(row.category || 'Оқу материалы')}</span>${admin ? `<span class="status-badge ${row.published ? 'is-published' : 'is-hidden'}">${row.published ? 'Жарияланған' : 'Жасырылған'}</span>` : ''}</div>
      <div class="material-copy"><h3>${e(row.title)}</h3>${description ? `<p>${e(description)}</p>` : ''}</div>
      <div class="material-details"><span>${e(row.subject || 'Химия')}</span>${showFilename ? `<small class="material-filename" title="${e(row.filename)}">${e(row.filename)}</small>` : ''}</div>
      ${row.draft ? '<p class="draft-hint">Файл әлі қосылмаған. «Өңдеу» арқылы файл жүктеңіз.</p>' : `<div class="material-actions"><button class="material-open" data-open-resource="${e(row.id)}" aria-label="${e(row.title)} — ашу">Ашу <span aria-hidden="true">↗</span></button><button data-download-resource="${e(row.id)}" aria-label="${e(row.title)} — жүктеп алу">Жүктеп алу <span aria-hidden="true">↓</span></button></div>`}
      ${admin ? `<div class="material-admin-actions" aria-label="Материалды басқару"><button data-edit-material="${e(editId)}">Өңдеу</button><button data-publish-material="${e(editId)}">${row.published ? 'Жасыру' : 'Жариялау'}</button><button class="danger-link" data-action="${row.draft ? 'delete' : 'delete-resource'}" data-id="${e(row.draft ? row.item_id : row.id)}" data-item="${e(row.item_id)}" data-title="${e(row.title)}" aria-label="${e(row.title)} — өшіру">Өшіру</button></div>` : ''}
    </article>`;
  }).join('');
}

export function catalogView(rows, filters = {}, admin = false) {
  const visible = filterMaterials(rows, filters);
  return `<section class="catalog-head"><div><span class="eyebrow">${admin ? 'Материалдарды басқару' : 'Оқу кітапханасы'}</span><h1>Материалдар</h1><p>${admin ? 'Файл қосыңыз, мәліметін өңдеңіз және жариялануын басқарыңыз.' : 'Қажетті материалды тауып, онлайн ашыңыз немесе жүктеп алыңыз.'}</p></div>${admin ? '<a href="/admin/material/new" class="primary-button">+ Материал қосу</a>' : ''}</section>
  <form id="catalog-filters" class="catalog-filters" role="search" aria-label="Материалдарды іздеу және сүзу">
    <label class="search-field">Материал іздеу<input name="query" type="search" value="${e(filters.query)}" placeholder="Мысалы, химиялық байланыс" autocomplete="off" aria-controls="catalog-results"/></label>
    <label>Категория<select name="category">${options([...CATEGORIES, ...rows.map(row => row.category)], filters.category)}</select></label>
    <label>Пән<select name="subject">${options([...SUBJECTS, ...rows.map(row => row.subject)], filters.subject)}</select></label>
    <label>Файл түрі<select name="type"><option value="">Барлығы</option>${[['pdf', 'PDF'], ['doc', 'DOC / DOCX'], ['ppt', 'PPT / PPTX'], ['image', 'Сурет'], ['video', 'Видео'], ['audio', 'Аудио'], ['xls', 'Excel'], ['file', 'Басқа']].map(([value, label]) => `<option value="${value}" ${filters.type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <div class="filter-footer"><span>Нәтижелер бірден жаңарады</span><button type="reset" class="filter-reset">Сүзгілерді тазарту</button></div>
  </form><div id="catalog-results" aria-live="polite" aria-atomic="false">${catalogResults(visible, admin)}</div>`;
}

export function catalogResults(rows, admin = false) {
  return `<p class="result-count"><strong>${rows.length}</strong> материал табылды</p><div class="materials-grid">${cards(rows, admin) || `<div class="empty-library"><span class="empty-icon" aria-hidden="true">⌕</span><h2>Материал табылмады</h2><p>Іздеу сөзін қысқартыңыз немесе жоғарыдағы сүзгілерді тазалаңыз.</p>${admin ? '<a class="secondary-button" href="/admin/material/new">+ Материал қосу</a>' : ''}</div>`}</div>`;
}

export function materialEditor(item, parents, resources = []) {
  const editing = !!item.id;
  const resourceEdit = item.id?.startsWith('resource:');
  return `<section class="material-editor"><a class="back-link" href="/admin/materials">← Материалдар</a><h1>${editing ? 'Материалды өңдеу' : 'Материал қосу'}</h1><p class="editor-intro">${resourceEdit ? 'Өзгерістер тек осы файлға қолданылады.' : 'Файлды таңдап, атауын және тақырыбын көрсетіңіз.'}</p>
  <form id="material-form" data-id="${e(item.id)}">
    ${resourceEdit ? '' : `<label class="file-drop">${editing ? 'Қосымша файл таңдау' : '1. Файл таңдау'}<input name="file" type="file" accept="${FILE_ACCEPT}" aria-describedby="file-format-help" ${editing ? '' : 'required'}/><small id="file-format-help">PDF, DOC/DOCX, PPT/PPTX, Excel, сурет, видео, аудио немесе ZIP. Ең көбі 20 MB.</small></label>`}
    <label>Материал атауы<input name="title" value="${e(item.title)}" placeholder="Мысалы, Химиялық байланыс — 8-сынып" required maxlength="180"/></label>
    <label>Қысқаша сипаттама<textarea name="description" required maxlength="1500" rows="3" placeholder="Материалда не бар және кімге арналған?">${e(item.description)}</textarea></label>
    <div class="form-columns"><label>Пән<select name="subject" required>${options([...SUBJECTS, item.subject], item.subject || 'Химия', 'Пәнді таңдаңыз')}</select></label><label>Категория<select name="category" required>${options([...CATEGORIES, item.category], item.category, 'Категорияны таңдаңыз')}</select></label></div>
    <label>Тақырып / сынып<select name="parent_id" ${resourceEdit ? 'disabled' : 'required'}>${options([], null, 'Тақырыпты таңдаңыз')}${parents.map(parent => `<option value="${e(parent.id)}" ${parent.id === item.parent_id ? 'selected' : ''}>${e(parent.title)}</option>`).join('')}</select></label>
    ${resources.length ? `<div class="uploaded-file-list"><strong>Жүктелген файлдар</strong><ul>${resources.map(resource => `<li>${e(resource.filename)}</li>`).join('')}</ul></div>` : ''}
    <label class="checkbox-label publish-material"><input type="checkbox" name="published" ${item.is_published ? 'checked' : ''}/><span>Материалды жариялау<small>Белгіленбесе, материал тек басқару панелінде сақталады.</small></span></label>
    <p class="form-error" id="material-error" role="alert"></p><div id="upload-status" role="status" aria-live="polite"></div>
    <div class="material-form-actions"><button class="primary-button" type="submit">${editing ? 'Өзгерістерді сақтау' : 'Материалды жүктеу'}</button><a class="secondary-button" href="/admin/materials">Бас тарту</a></div>
  </form></section>`;
}

export function homeView(rows, topics, user, popular = []) {
  return `<section class="welcome"><div class="welcome-content"><span class="eyebrow">Химия · Мектептен университетке</span><h1>Химияны үйренуге арналған білім беру платформасы</h1><p>Оқу материалдарын, тапсырмаларды және пайдалы ресурстарды бір жерден табыңыз.</p><div class="welcome-actions"><a class="primary-button" href="/materials">Материалдарды көру <span aria-hidden="true">→</span></a><a class="secondary-button" href="${user ? '/kabinet' : '/login'}">${user ? 'Менің профилім' : 'Кіру / Тіркелу'}</a></div></div><div class="welcome-library" aria-label="Кітапхана туралы"><span class="library-mark" aria-hidden="true">H<span>2</span>O</span><strong>Білім — тәжірибеден</strong><p>Теориядан зертханалық жұмысқа дейін.</p><div class="library-summary"><span><b>${rows.length}</b> материал</span><span><b>${topics.length}</b> оқу бағыты</span></div></div></section>
  <section class="home-section"><header><h2>Соңғы қосылған материалдар</h2><a href="/materials">Барлығын көру <span aria-hidden="true">→</span></a></header><div class="materials-grid">${cards(rows.slice(0, 3)) || '<div class="empty-library"><h3>Оқу кітапханасы дайындалуда</h3><p>Материалдар жарияланғаннан кейін осы жерде пайда болады.</p></div>'}</div></section>
  <section class="home-section"><header><h2>Негізгі тақырыптар</h2><a href="/topics">Барлық тақырыптар <span aria-hidden="true">→</span></a></header><div class="topic-links">${topics.map((topic, index) => `<a href="${e(topic.path)}"><span>${String(index + 1).padStart(2, '0')}</span><strong>${e(topic.title)}</strong><b aria-hidden="true">↗</b></a>`).join('')}</div></section>
  ${popular.length ? `<section class="home-section"><header><h2>Танымал материалдар</h2><span class="section-note">Ең көп қаралған</span></header><div class="materials-grid">${cards(popular)}</div></section>` : ''}`;
}

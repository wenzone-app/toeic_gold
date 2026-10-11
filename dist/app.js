let lesson, days = [], view = 'lesson', part = 0, quizIndex = 0, currentDay = 28, groups = [];
let renderedAnnotations = new Map();
const openNotes = new Set();
const noteTimers = new Map();
const noteFilters = {type: 'all', status: 'all', day: 'all'};
const STORAGE_KEY = 'toeic-studio';
const NOTE_LIMIT = 2000;
const defaultState = {completedDays: [], scores: {}, currentDay: 28, annotations: {}};
let state = {...defaultState};

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  state = {...defaultState, ...saved};
  if (!Array.isArray(state.completedDays)) state.completedDays = [];
  if (saved.done && !state.completedDays.includes(28)) state.completedDays.push(28);
  if (!state.scores || typeof state.scores !== 'object' || Array.isArray(state.scores)) state.scores = {};
  if (!state.annotations || typeof state.annotations !== 'object' || Array.isArray(state.annotations)) state.annotations = {};
} catch {}

const day28Groups = [
  {name: '學習概覽', ids: [0]}, {name: '30 個核心單字', ids: [1]},
  {name: '文法總複習', ids: [2, 3, 4, 5, 6, 7]}, {name: '聽力階段模考', ids: [8, 9, 10, 11]},
  {name: '雙篇閱讀', ids: [12, 13]}, {name: 'Part 5 仿真題', ids: [14]},
  {name: '階段小考與解析', ids: [15, 16]}, {name: '錯題回收與作業', ids: [17, 18, 19, 20]}
];
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const isCompleted = day => state.completedDays.includes(day);
const isPlainObject = value => value && typeof value === 'object' && !Array.isArray(value);
const stripMarkdown = text => String(text || '').replace(/[#>*_`|\[\]-]/g, ' ').replace(/\s+/g, ' ').trim();
const anchorId = key => `annotation-${[...key].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 7)}`;

function save() {
  state.currentDay = currentDay;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateProgress();
    return true;
  } catch {
    return false;
  }
}

function updateProgress() {
  const completed = new Set(state.completedDays).size;
  $('#progress').innerHTML = `${completed} <small>/ 90 天</small>`;
  $('#bar').style.width = `${completed * 100 / 90}%`;
}

function inline(text) {
  return esc(text).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
}

function md(text) {
  let output = '', table = false, list = false;
  for (const line of String(text || '').split('\n')) {
    if (!line.startsWith('|') && table) { output += '</tbody></table>'; table = false; }
    if (!/^[-*] /.test(line) && list) { output += '</ul>'; list = false; }
    if (/^\|/.test(line)) {
      if (/^\|[\s:|-]+\|$/.test(line)) continue;
      if (!table) { output += '<table><tbody>'; table = true; }
      output += '<tr>' + line.split('|').slice(1, -1).map(cell => '<td>' + inline(cell.trim()) + '</td>').join('') + '</tr>';
      continue;
    }
    if (/^[-*] /.test(line)) {
      if (!list) { output += '<ul>'; list = true; }
      output += '<li>' + inline(line.slice(2)) + '</li>';
      continue;
    }
    if (/^#{1,4} /.test(line)) output += '<h3>' + inline(line.replace(/^#+ /, '')) + '</h3>';
    else if (line.startsWith('>')) output += '<blockquote>' + inline(line.slice(1).trim()) + '</blockquote>';
    else if (line === '---') output += '<hr>';
    else if (line.trim()) output += '<p>' + inline(line) + '</p>';
  }
  return output + (table ? '</tbody></table>' : '') + (list ? '</ul>' : '');
}

function bullets(items = []) { return items.map(item => `- ${item}`).join('\n'); }

function normalizeLesson(data, day) {
  if (Array.isArray(data.sections)) return data;
  if (!data.course || !data.lesson) throw new Error('Unsupported lesson format');
  const vocabulary = (data.vocabulary || []).map(item => ({...item, phrase: item.phrase || item.collocation || ''}));
  const vocabularyTable = ['| Word | 中文 | TOEIC 搭配 |', '|---|---|---|', ...vocabulary.map(item => `| ${item.word} | ${item.meaning} | ${item.phrase} |`)].join('\n');
  const listening = (data.listening || []).map(item => `### ${item.id}｜${item.topic}\n\n技能：${(item.skills || []).join(' / ')}\n\n> ${item.summary}`).join('\n\n---\n\n');
  const readingDocuments = (data.reading?.documents || []).map((document, index) => `### Document ${index + 1}｜${document.type}\n\n${bullets(document.keyFacts)}`).join('\n\n');
  const errorTags = ['| Code | 類型 |', '|---|---|', ...(data.errorTags || []).map(tag => `| ${tag.code} | ${tag.name} |`)].join('\n');
  const difficulty = Object.entries(data.adaptiveDifficulty || {}).map(([score, next]) => `- **${score} 題正確**：${next}`).join('\n');
  return {
    day: data.course.day || day, title: data.lesson.title, courseTitle: data.course.title,
    minutes: data.course.estimatedMinutes, level: data.course.level, vocabulary, quizzes: [],
    sections: [
      {title: '學習目標', markdown: `## Day ${data.course.day}｜${data.lesson.title}\n\n${bullets(data.lesson.objectives)}\n\n建議時間：**${data.course.estimatedMinutes} 分鐘**。`},
      {title: '今日核心單字', markdown: vocabularyTable},
      {title: data.grammar?.topic || 'Grammar', markdown: `目標速度：**每題 ${data.grammar?.targetSecondsPerQuestion || '-'} 秒**\n\n${bullets(data.grammar?.rules)}`},
      {title: 'Listening｜同義轉換與意圖', markdown: listening || '本日沒有聽力摘要。'},
      {title: `Reading｜${data.reading?.topic || '閱讀訓練'}`, markdown: `題型：**${data.reading?.type || 'reading'}**\n\n${readingDocuments}`},
      {title: '錯題標記與作業', markdown: `${errorTags}\n\n### 今日複習策略\n\n${bullets(data.homework?.reviewStrategy)}\n\nPart 5：**${data.homework?.part5?.questions || 0} 題**，第二次限時 **${data.homework?.part5?.secondAttemptTimeLimitSeconds || 0} 秒**。\n\n階段練習目標：**${data.homework?.quiz?.targetCorrect || 0} 題正確**。`},
      {title: '下一步難度', markdown: `${difficulty}\n\n### Day ${data.nextDay?.day || Number(day) + 1} 預告\n\n${bullets(data.nextDay?.focus)}`}
    ]
  };
}

function makeGroups() {
  if (lesson.day === 28 && lesson.sections.length >= 21) return day28Groups;
  return lesson.sections.map((section, index) => ({name: section.title.replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*/, ''), ids: [index]}));
}

function annotationKey(type, ...parts) { return `${type}:${currentDay}:${parts.join(':')}`; }
function getAnnotation(key) { return state.annotations[key] || null; }
function registerAnnotation(key, meta) { renderedAnnotations.set(key, meta); return key; }

function updateAnnotation(key, patch, fallbackMeta) {
  const current = state.annotations[key] || fallbackMeta || renderedAnnotations.get(key);
  if (!current) return;
  const next = {...current, ...patch, updatedAt: new Date().toISOString()};
  next.note = String(next.note || '').slice(0, NOTE_LIMIT);
  next.favorite = Boolean(next.favorite);
  if (!next.favorite && !next.note.trim()) delete state.annotations[key];
  else state.annotations[key] = next;
  save();
}

function annotationTools(key, meta, options = {}) {
  registerAnnotation(key, meta);
  const item = getAnnotation(key), favorite = Boolean(item?.favorite), note = item?.note || '';
  const expanded = openNotes.has(key) || (options.alwaysOpen && Boolean(note));
  return `<div class="annotation-tools"><button type="button" class="icon-action ${favorite ? 'active' : ''}" data-favorite="${esc(key)}" aria-pressed="${favorite}" aria-label="${favorite ? '取消收藏' : '加入收藏'}">${favorite ? '★ 已收藏' : '☆ 收藏'}</button><button type="button" class="icon-action ${note ? 'has-note' : ''}" data-note-toggle="${esc(key)}" aria-expanded="${expanded}">✎ ${note ? '編輯筆記' : '寫筆記'}</button></div><div class="note-editor ${expanded ? 'open' : ''}" data-note-panel="${esc(key)}"><label>我的筆記<textarea maxlength="${NOTE_LIMIT}" data-note-editor="${esc(key)}" placeholder="記下容易忘、還不理解或想再次複習的地方…">${esc(note)}</textarea></label><div class="note-meta"><span data-note-status>最多 ${NOTE_LIMIT.toLocaleString()} 字</span><button type="button" class="text-action" data-delete-note="${esc(key)}" ${note ? '' : 'disabled'}>清除筆記</button></div></div>`;
}

function navigate(nextView) {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  view = nextView;
  document.querySelectorAll('.nav').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  render();
}

function updateLessonHeader() {
  const completed = isCompleted(currentDay), vocabularyCount = lesson.vocabulary?.length || 0;
  const questionCount = lesson.quizzes?.reduce((sum, quiz) => sum + quiz.questions.length, 0) || 0;
  const minuteText = lesson.durationMinutes?.max ? `${lesson.durationMinutes.min}–${lesson.durationMinutes.max}` : lesson.minutes;
  $('.page-top .eyebrow').textContent = `DAY ${String(currentDay).padStart(2, '0')} · TOEIC TRAINING`;
  $('.day-badge strong').textContent = currentDay;
  $('.stats > div:nth-child(2) strong').innerHTML = `${esc(minuteText)} <small>分鐘</small>`;
  $('.stats > div:nth-child(3) strong').textContent = lesson.level || '依教材';
  $('.lesson-intro').innerHTML = `<div class="eyebrow">DAY ${currentDay} LESSON</div><h2>${esc(lesson.title)}</h2><p>${esc(lesson.source || lesson.courseTitle || 'TOEIC 金色證書 90 天訓練')}</p><span class="pill">${lesson.sections.length} 個章節</span><span class="pill">${vocabularyCount} 個單字</span><span class="pill">${questionCount} 題練習</span>${completed ? '<span class="pill">✓ 已完成</span>' : ''}`;
}

function renderSection(section, index, showTitle = true) {
  const canSpeak = /listening|聽力/i.test(section.title) && /聽力稿：/.test(section.markdown);
  const controls = canSpeak ? `<div class="listen"><button class="secondary" data-speak="${index}">▶ 朗讀聽力稿</button><button class="secondary" data-stop>停止</button></div>` : '';
  const title = showTitle ? `<h3>${esc(section.title)}</h3>` : '';
  const key = annotationKey('section', index);
  const meta = {type: 'section', day: currentDay, ref: {sectionIndex: index}, title: section.title, summary: stripMarkdown(section.markdown).slice(0, 180)};
  return `<section class="annotated-section" id="${anchorId(key)}">${title}${annotationTools(key, meta)}${controls}${md(section.markdown)}</section>`;
}

function renderLesson() {
  const group = groups[part], completeLabel = isCompleted(currentDay) ? '已完成今日學習' : '完成今日學習';
  const sourceLink = lesson.sourceUrl ? `<br><a href="${esc(lesson.sourceUrl)}" target="_blank" rel="noopener">原始課程連結</a>` : '';
  const showSectionTitles = lesson.day === 28 || group.ids.length > 1;
  return `<div class="lesson-layout"><div><section class="card lesson-intro"></section><article class="card"><div class="section-head"><h2>${esc(group.name)}</h2><span class="muted">${part + 1} / ${groups.length}</span></div><div class="read-area">${group.ids.map(index => renderSection(lesson.sections[index], index, showSectionTitles)).join('')}</div><div class="section-head lesson-pager"><button class="secondary" id="previous" ${part === 0 ? 'disabled' : ''}>上一節</button><button class="primary" id="next">${part === groups.length - 1 ? completeLabel : '下一節'}</button></div></article></div><div><nav class="card toc" aria-label="教材章節"><h3>Day ${currentDay} 學習路線</h3>${groups.map((item, index) => `<button data-part="${index}" class="${index === part ? 'active' : ''}">${String(index + 1).padStart(2, '0')}　${esc(item.name)}</button>`).join('')}</nav><div class="notice">Day ${currentDay} 教材已完整匯入。${sourceLink}</div></div></div>`;
}

function renderCalendar() {
  const availableCount = days.filter(day => day.available).length;
  return `<div class="card"><div class="section-head"><h2>課程目錄</h2><span class="muted">${availableCount} / 90 天已匯入</span></div><div class="calendar">${days.map(day => `<button class="day ${day.available ? 'available' : ''}" ${day.available ? `data-open-day="${day.day}"` : 'disabled'} aria-label="Day ${day.day} ${esc(day.title)}"><span>DAY</span><b>${day.day}</b><span>${day.available ? (isCompleted(day.day) ? '已完成' : '開始學習') : '待匯入'}</span></button>`).join('')}</div></div>`;
}

function renderWords() {
  if (!lesson.vocabulary?.length) return '<div class="card">本日沒有單字資料。</div>';
  return `<div class="words">${lesson.vocabulary.map((word, index) => {
    const wordId = word.id ?? index + 1, key = annotationKey('word', wordId);
    const meta = {type: 'word', day: currentDay, ref: {wordId, wordIndex: index}, title: word.word, summary: [word.meaning, word.phrase].filter(Boolean).join(' · ')};
    return `<article class="card word" id="${anchorId(key)}"><div class="word-head"><strong>${esc(word.word)}</strong><button type="button" class="speak-word" data-word="${index}" aria-label="朗讀 ${esc(word.word)}">♫ 發音</button></div><small>${esc(word.partOfSpeech || '')} ${esc(word.meaning)}</small><span>${esc(word.phrase || '')}</span>${annotationTools(key, meta)}</article>`;
  }).join('')}</div><p class="muted">使用「發音」聆聽單字；收藏與筆記會保存在此瀏覽器。</p>`;
}

function getSavedScore() { return state.scores[currentDay]?.[quizIndex]; }

function renderQuiz() {
  if (!lesson.quizzes?.length) return '<div class="card">本日沒有測驗資料。</div>';
  if (!lesson.quizzes[quizIndex]) quizIndex = 0;
  const quiz = lesson.quizzes[quizIndex], savedScore = getSavedScore();
  return `<div class="listen">${lesson.quizzes.map((item, index) => `<button class="${index === quizIndex ? 'primary' : 'secondary'}" data-quiz="${index}">${esc(item.title)} · ${item.questions.length} 題</button>`).join('')}</div><div class="notice">提交後會顯示正解與解析。${savedScore != null ? ` 上次成績：${savedScore} / ${quiz.questions.length}` : ''}</div><form id="quiz-form" class="card">${quiz.questions.map((question, index) => {
    const key = annotationKey('question', quiz.id || quizIndex, question.id);
    const meta = {type: 'question', day: currentDay, ref: {quizId: quiz.id || quizIndex, questionId: question.id}, title: `${quiz.title} · 第 ${index + 1} 題`, summary: stripMarkdown(question.prompt).slice(0, 180)};
    return `<section class="quiz-q" id="${anchorId(key)}"><h3><span class="muted">${String(index + 1).padStart(2, '0')} / ${quiz.questions.length}</span><br>${inline(question.prompt)}</h3>${annotationTools(key, meta)}${Object.entries(question.options).map(([option, value]) => `<label class="option"><input required type="radio" name="q${esc(question.id)}" value="${option}"><span>${option}. ${inline(value)}</span></label>`).join('')}<div class="feedback"></div></section>`;
  }).join('')}<div class="score" id="result" role="status"></div><button class="primary" type="submit">提交答案</button> <button class="secondary" type="button" id="retry">重新作答</button></form>`;
}

function annotationTypeLabel(type) { return ({word: '單字', section: '教材', question: '題目'})[type] || type; }

function renderNotes() {
  const all = Object.entries(state.annotations).filter(([, item]) => item && (item.favorite || String(item.note || '').trim()));
  const dayValues = [...new Set(all.map(([, item]) => Number(item.day)).filter(Boolean))].sort((a, b) => a - b);
  const filtered = all.filter(([, item]) => {
    if (noteFilters.type !== 'all' && item.type !== noteFilters.type) return false;
    if (noteFilters.status === 'favorite' && !item.favorite) return false;
    if (noteFilters.status === 'note' && !String(item.note || '').trim()) return false;
    return noteFilters.day === 'all' || Number(item.day) === Number(noteFilters.day);
  }).sort((a, b) => String(b[1].updatedAt || '').localeCompare(String(a[1].updatedAt || '')));
  const filters = `<div class="note-filters"><label>內容類型<select data-note-filter="type"><option value="all">全部</option><option value="word" ${noteFilters.type === 'word' ? 'selected' : ''}>單字</option><option value="section" ${noteFilters.type === 'section' ? 'selected' : ''}>教材</option><option value="question" ${noteFilters.type === 'question' ? 'selected' : ''}>題目</option></select></label><label>顯示<select data-note-filter="status"><option value="all">收藏與筆記</option><option value="favorite" ${noteFilters.status === 'favorite' ? 'selected' : ''}>只看收藏</option><option value="note" ${noteFilters.status === 'note' ? 'selected' : ''}>只看筆記</option></select></label><label>課程<select data-note-filter="day"><option value="all">全部 Day</option>${dayValues.map(day => `<option value="${day}" ${Number(noteFilters.day) === day ? 'selected' : ''}>Day ${day}</option>`).join('')}</select></label></div>`;
  const backup = `<div class="backup-actions"><button class="secondary" type="button" id="export-data">匯出學習資料</button><label class="secondary file-action">匯入學習資料<input type="file" id="import-data" accept="application/json,.json"></label></div>`;
  const cards = filtered.length ? filtered.map(([key, item]) => {
    const meta = {type: item.type, day: item.day, ref: item.ref, title: item.title, summary: item.summary};
    registerAnnotation(key, meta);
    return `<article class="card note-card" id="${anchorId(key)}"><div class="note-card-head"><div><span class="note-kind">Day ${item.day} · ${annotationTypeLabel(item.type)}</span><h2>${esc(item.title)}</h2></div><button type="button" class="secondary" data-open-annotation="${esc(key)}">回到內容</button></div><p>${esc(item.summary || '')}</p>${annotationTools(key, meta, {alwaysOpen: true})}${item.note ? '' : '<p class="muted">這個項目目前只有收藏，尚未加入筆記。</p>'}</article>`;
  }).join('') : '<div class="card empty-notes"><h2>目前沒有符合條件的收藏或筆記</h2><p>你可以在單字、教材章節或測驗題旁按「收藏」或「寫筆記」。</p></div>';
  return `<section class="card notes-toolbar"><div class="section-head"><div><h2>收藏與筆記</h2><p class="muted">共 ${all.length} 筆，依最近更新排序。</p></div>${backup}</div>${filters}</section><div class="notes-list">${cards}</div>`;
}

function render() {
  renderedAnnotations = new Map();
  if (view === 'notes') {
    $('#page-title').textContent = '收藏與筆記';
    $('#page-sub').textContent = '集中整理容易忘、還不理解或想再次複習的內容。';
    $('#content').innerHTML = renderNotes();
    bind();
    return;
  }
  if (!lesson) return;
  const titles = {
    lesson: [lesson.title, lesson.courseTitle || lesson.source || `Day ${currentDay} 每日教材`],
    calendar: ['你的 90 天學習旅程', '選擇已匯入的日期，開始或繼續學習。'],
    words: [`Day ${currentDay} 核心單字`, `${lesson.vocabulary?.length || 0} 個單字，搭配一起記更牢。`],
    quiz: [`Day ${currentDay} 階段練習`, '完成作答後提交，立即查看答案與解析。']
  };
  $('#page-title').textContent = titles[view][0]; $('#page-sub').textContent = titles[view][1];
  if (view === 'lesson') $('#content').innerHTML = renderLesson();
  else if (view === 'calendar') $('#content').innerHTML = renderCalendar();
  else if (view === 'words') $('#content').innerHTML = renderWords();
  else $('#content').innerHTML = renderQuiz();
  if (view === 'lesson') updateLessonHeader();
  bind();
}

function speak(text) {
  if (!('speechSynthesis' in window)) { alert('此瀏覽器不支援語音朗讀。'); return; }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US'; utterance.rate = .88;
  speechSynthesis.speak(utterance);
}

async function loadDay(day, nextView = 'lesson') {
  $('#content').innerHTML = '<div class="card">正在載入教材…</div>';
  try {
    const response = await fetch(`data/day-${day}.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    lesson = normalizeLesson(await response.json(), day); currentDay = day; part = 0; quizIndex = 0; groups = makeGroups();
    save(); navigate(nextView); return true;
  } catch (error) {
    console.error(error); $('#content').innerHTML = `<div class="card">Day ${day} 教材載入失敗，請稍後再試。</div>`; return false;
  }
}

function scrollToKey(key) { requestAnimationFrame(() => document.getElementById(anchorId(key))?.scrollIntoView({behavior: 'smooth', block: 'center'})); }

async function openAnnotation(key) {
  const item = state.annotations[key];
  if (!item || !await loadDay(Number(item.day), item.type === 'word' ? 'words' : item.type === 'question' ? 'quiz' : 'lesson')) return;
  if (item.type === 'section') {
    const sectionIndex = Number(item.ref?.sectionIndex), groupIndex = groups.findIndex(group => group.ids.includes(sectionIndex));
    if (groupIndex >= 0) part = groupIndex;
    render();
  } else if (item.type === 'question') {
    const index = lesson.quizzes.findIndex(quiz => String(quiz.id) === String(item.ref?.quizId));
    if (index >= 0) quizIndex = index;
    render();
  }
  scrollToKey(key);
}

function scheduleNoteSave(textarea) {
  const key = textarea.dataset.noteEditor, meta = renderedAnnotations.get(key) || state.annotations[key];
  const status = textarea.closest('.note-editor')?.querySelector('[data-note-status]');
  if (status) status.textContent = '儲存中…';
  clearTimeout(noteTimers.get(key));
  noteTimers.set(key, setTimeout(() => {
    updateAnnotation(key, {note: textarea.value}, meta);
    const button = textarea.closest('.note-editor')?.previousElementSibling?.querySelector('[data-note-toggle]');
    if (button) { button.classList.toggle('has-note', Boolean(textarea.value.trim())); button.textContent = `✎ ${textarea.value.trim() ? '編輯筆記' : '寫筆記'}`; }
    const clearButton = textarea.closest('.note-editor')?.querySelector('[data-delete-note]');
    if (clearButton) clearButton.disabled = !textarea.value;
    if (status) status.textContent = save() ? '已儲存' : '儲存失敗，請確認瀏覽器空間';
    noteTimers.delete(key);
  }, 300));
}

function exportData() {
  const payload = {app: 'toeic-studio', schemaVersion: 1, exportedAt: new Date().toISOString(), state: {completedDays: state.completedDays, scores: state.scores, currentDay: state.currentDay, annotations: state.annotations}};
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'}), url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `toeic-studio-backup-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function validateBackup(payload) {
  if (!isPlainObject(payload) || payload.app !== 'toeic-studio' || payload.schemaVersion !== 1 || !isPlainObject(payload.state)) throw new Error('這不是支援的 TOEIC Studio 備份檔。');
  const incoming = payload.state;
  if (!Array.isArray(incoming.completedDays) || !incoming.completedDays.every(day => Number.isInteger(day) && day >= 1 && day <= 90)) throw new Error('完成進度格式不正確。');
  if (!isPlainObject(incoming.scores) || !isPlainObject(incoming.annotations)) throw new Error('成績或註記格式不正確。');
  const scores = {};
  for (const [day, values] of Object.entries(incoming.scores)) {
    if (!/^\d+$/.test(day) || !isPlainObject(values) || !Object.values(values).every(score => Number.isFinite(score) && score >= 0)) throw new Error('成績資料包含無效內容。');
    scores[day] = {...values};
  }
  const annotations = {};
  for (const [key, item] of Object.entries(incoming.annotations)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || !isPlainObject(item) || !['word', 'section', 'question'].includes(item.type)) throw new Error('註記資料包含無效內容。');
    if (!Number.isInteger(Number(item.day)) || Number(item.day) < 1 || Number(item.day) > 90 || !key.startsWith(`${item.type}:${Number(item.day)}:`) || !isPlainObject(item.ref)) throw new Error('註記來源格式不正確。');
    if (typeof item.note !== 'string' || item.note.length > NOTE_LIMIT || typeof item.favorite !== 'boolean') throw new Error(`筆記必須是 ${NOTE_LIMIT.toLocaleString()} 字以內的純文字。`);
    if (typeof item.title !== 'string' || item.title.length > 300 || typeof item.summary !== 'string' || item.summary.length > 500 || typeof item.updatedAt !== 'string') throw new Error('註記顯示資料格式不正確。');
    annotations[key] = {type: item.type, day: Number(item.day), ref: item.ref, title: item.title, summary: item.summary, favorite: item.favorite, note: item.note, updatedAt: item.updatedAt};
  }
  return {completedDays: incoming.completedDays, scores, annotations};
}

async function importData(file, input) {
  try {
    const incoming = validateBackup(JSON.parse(await file.text()));
    const scoreCount = Object.values(incoming.scores).reduce((sum, values) => sum + Object.keys(values).length, 0);
    const message = `備份內容：\n• ${incoming.completedDays.length} 個完成日\n• ${scoreCount} 筆測驗成績\n• ${Object.keys(incoming.annotations).length} 筆收藏／筆記\n\n合併後，相同項目的匯入資料會覆蓋本機資料。要繼續嗎？`;
    if (!confirm(message)) return;
    const current = currentDay;
    state.completedDays = [...new Set([...state.completedDays, ...incoming.completedDays])].sort((a, b) => a - b);
    for (const [day, values] of Object.entries(incoming.scores)) state.scores[day] = {...(state.scores[day] || {}), ...values};
    state.annotations = {...state.annotations, ...incoming.annotations}; currentDay = current; save(); render(); alert('學習資料已成功合併。');
  } catch (error) {
    alert(`無法匯入：${error.message}`);
  } finally { input.value = ''; }
}

function bind() {
  document.querySelectorAll('[data-part]').forEach(button => button.onclick = () => { part = Number(button.dataset.part); render(); });
  $('#previous')?.addEventListener('click', () => { part--; render(); });
  $('#next')?.addEventListener('click', () => { if (part < groups.length - 1) part++; else if (!isCompleted(currentDay)) { state.completedDays.push(currentDay); save(); } render(); window.scrollTo({top: 240, behavior: 'smooth'}); });
  document.querySelectorAll('[data-open-day]').forEach(button => button.onclick = () => loadDay(Number(button.dataset.openDay)));
  document.querySelectorAll('[data-word]').forEach(button => button.onclick = () => speak(lesson.vocabulary[Number(button.dataset.word)].word));
  document.querySelectorAll('[data-speak]').forEach(button => button.onclick = () => { const markdown = lesson.sections[Number(button.dataset.speak)].markdown; const script = markdown.split('聽力稿：')[1]?.split('答案：')[0] || markdown; speak(script.replace(/^>\s?/gm, '').trim()); });
  document.querySelectorAll('[data-stop]').forEach(button => button.onclick = () => speechSynthesis.cancel());
  document.querySelectorAll('[data-quiz]').forEach(button => button.onclick = () => { quizIndex = Number(button.dataset.quiz); render(); });
  document.querySelectorAll('[data-favorite]').forEach(button => button.onclick = () => { const key = button.dataset.favorite, current = getAnnotation(key); updateAnnotation(key, {favorite: !current?.favorite}, renderedAnnotations.get(key)); render(); scrollToKey(key); });
  document.querySelectorAll('[data-note-toggle]').forEach(button => button.onclick = () => { const key = button.dataset.noteToggle; if (openNotes.has(key)) openNotes.delete(key); else openNotes.add(key); render(); scrollToKey(key); if (openNotes.has(key)) requestAnimationFrame(() => document.querySelector(`[data-note-editor="${CSS.escape(key)}"]`)?.focus()); });
  document.querySelectorAll('[data-note-editor]').forEach(textarea => textarea.addEventListener('input', () => scheduleNoteSave(textarea)));
  document.querySelectorAll('[data-delete-note]').forEach(button => button.onclick = () => { const key = button.dataset.deleteNote; clearTimeout(noteTimers.get(key)); noteTimers.delete(key); updateAnnotation(key, {note: ''}, renderedAnnotations.get(key)); if (!getAnnotation(key)) openNotes.delete(key); render(); scrollToKey(key); });
  document.querySelectorAll('[data-open-annotation]').forEach(button => button.onclick = () => openAnnotation(button.dataset.openAnnotation));
  document.querySelectorAll('[data-note-filter]').forEach(select => select.onchange = () => { noteFilters[select.dataset.noteFilter] = select.value; render(); });
  $('#export-data')?.addEventListener('click', exportData);
  $('#import-data')?.addEventListener('change', event => { const file = event.target.files?.[0]; if (file) importData(file, event.target); });
  $('#retry')?.addEventListener('click', render);
  $('#quiz-form')?.addEventListener('submit', event => {
    event.preventDefault(); const quiz = lesson.quizzes[quizIndex], formData = new FormData(event.target); let score = 0;
    quiz.questions.forEach(question => { const answer = formData.get('q' + question.id), correct = answer === question.answer; if (correct) score++; const explanation = question.explanation ? `<br>${inline(question.explanation)}` : ''; const key = annotationKey('question', quiz.id || quizIndex, question.id); document.getElementById(anchorId(key)).querySelector('.feedback').innerHTML = `<p class="${correct ? 'correct' : 'wrong'}">${correct ? '✓ 答對了' : `答錯了 · 你的答案 ${esc(answer)}`} · 正確答案 ${question.answer}：${inline(question.options[question.answer])}${explanation}</p>`; });
    if (!state.scores[currentDay]) state.scores[currentDay] = {}; state.scores[currentDay][quizIndex] = score; save();
    const percentage = score / quiz.questions.length; $('#result').textContent = `${score} / ${quiz.questions.length} · ${percentage >= .9 ? '掌握得很好！' : percentage >= .75 ? '再複習幾個觀念就更穩了。' : '回到教材，釐清錯題的判斷依據。'}`; $('#result').scrollIntoView({behavior: 'smooth', block: 'center'});
  });
}

document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => navigate(button.dataset.view));

async function start() {
  try {
    const response = await fetch('data/curriculum.json'); if (!response.ok) throw new Error(`HTTP ${response.status}`); days = await response.json();
    const availableDays = days.filter(day => day.available).map(day => day.day), preferredDay = availableDays.includes(Number(state.currentDay)) ? Number(state.currentDay) : availableDays[0];
    await loadDay(preferredDay || 28);
  } catch { $('#content').innerHTML = '<div class="card">課程目錄載入失敗，請重新整理頁面再試一次。</div>'; }
}

start();

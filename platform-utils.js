export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const FILE_ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.mp3,.wav,.zip';
export function validateFile(file) {
  if (!file) throw new Error('Файл таңдалмады');
  if (!file.size) throw new Error('Бос файлды жүктеуге болмайды');
  if (file.size > MAX_FILE_SIZE) throw new Error('Файл көлемі 20 MB-тан аспауы керек');
  const extension = '.' + file.name.split('.').pop().toLowerCase();
  if (!FILE_ACCEPT.split(',').includes(extension)) throw new Error('Бұл файл түріне қолдау көрсетілмейді');
}
export function errorMessage(error) {
  const raw = String(error?.message || error || '');
  if (/invalid login|invalid credentials/i.test(raw)) return 'Email/логин немесе пароль қате';
  if (/email not confirmed/i.test(raw)) return 'Email мекенжайыңызды хаттағы сілтеме арқылы растаңыз';
  if (/Database error saving new user/i.test(raw)) return 'Тіркелу орындалмады. Басқа логинді қолданып көріңіз немесе әкімшіге хабарласыңыз';
  if (/already registered|already been registered/i.test(raw)) return 'Бұл email бұрын тіркелген. Кіру бетін ашыңыз';
  if (/rate limit|too many requests/i.test(raw)) return 'Әрекет саны шектелді. Біраздан кейін қайталаңыз';
  if (/row-level security|permission denied|forbidden|JWT/i.test(raw)) return 'Бұл әрекетке рұқсатыңыз жоқ. Қайта кіріп көріңіз';
  if (/bucket not found/i.test(raw)) return 'Файл қоймасы бапталмаған. Әкімшіге хабарласыңыз';
  if (/timeout|timed out|aborted/i.test(raw)) return 'Сұрау уақыты аяқталды. Қайта әрекет жасап көріңіз';
  if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) return 'Байланыс үзілді. Интернетті тексеріп, қайта әрекет жасаңыз';
  if (/duplicate key|unique constraint/i.test(raw)) return 'Бұл атау, логин немесе сілтеме бұрын қолданылған';
  if (/schema cache|does not exist/i.test(raw)) return 'Сервер баптауларын жаңарту қажет. Әкімшіге хабарласыңыз';
  return raw || 'Сұрау орындалмады. Қайта әрекет жасап көріңіз';
}
export function uploadRequest(url, headers, file, onProgress = () => {}) {
  validateFile(file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url); xhr.timeout = 180000;
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded * 95 / event.total)); };
    xhr.onerror = () => reject(new Error('Байланыс үзілді. Файл жүктелмеді'));
    xhr.ontimeout = () => reject(new Error('Жүктеу уақыты аяқталды. Қайта әрекет жасап көріңіз'));
    xhr.onabort = () => reject(new Error('Жүктеу тоқтатылды'));
    xhr.onload = () => {
      let data; try { data = JSON.parse(xhr.responseText); } catch { data = {}; }
      if (xhr.status < 200 || xhr.status >= 300) reject(new Error(errorMessage(data.message || data.error || 'Файл жүктелмеді')));
      else resolve(data);
    };
    xhr.send(file);
  });
}
export function filterMaterials(rows, {query = '', category = '', subject = '', type = ''} = {}) {
  const term = query.trim().toLocaleLowerCase('kk');
  return rows.filter(row => (!term || `${row.title} ${row.filename}`.toLocaleLowerCase('kk').includes(term)) && (!category || row.category === category) && (!subject || row.subject === subject) && (!type || row.type === type));
}

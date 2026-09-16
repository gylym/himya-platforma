# Химия платформасы: 2026-09-16 жаңартуы

## Аудит және шешім

Бастапқы commit: `7133bd8`. Тармақ: `feat/learning-redox-experience`.

Қаралған файлдар: app.js, store.js, catalog.js, platform-utils.js, config.js, index.html, 404.html, Python сервері, tests/, Supabase миграциялары және берілген redox_kmno4_lab.html.

Қолданыстағы сайтта жария материалдар тізімі жүктелді. Кодта Supabase тіркелу/кіру, токен жаңарту, прогресс, әкімші рөлдері және жабық Storage интеграциясы бар. Бүкіл өндірістік сценарийлер тексерілген деп есептеуге болмайды. config.js бұрыннан бар `ekseiqhgrgifqmpnfzul` жобасын көрсетеді. Жаңа ақылы қызмет немесе жоба жасалған жоқ.

Анықталған олқылықтар: email callback қабылдау, пароль қалпына келтіру, профиль өңдеу интерфейсі және ұпай/нәтижесі бар толық ойын болмаған. HTML үлгісі сыртқы CSS айнымалыларына тәуелді фрагмент: оның бастапқы механикасы реакцияны бір батырмамен көрсету. Барлық ортада Fe²⁺/Fe³⁺ және I⁻/I₂ ғана болады деген қарапайым модель қосымша химиялық реакцияларды ескермейді. Ойын сульфит теңдеулері мен нақты көрсетілген орта шарттарына негізделді.

Технологиялар сақталды: framework немесе frontend runtime тәуелділігі қосылмады. Legacy әкімші/материалдар мүмкіндіктері сақталды. app.js толық қайта жазылған жоқ; жаңа оқу мүмкіндіктері бөлек модульдерге шығарылды.

## Құрылым

| Файл | Міндеті |
|---|---|
| learning.js | Сабақ, ойын күйі, нәтиже, профиль және қалпына келтіру беттері |
| learning-api.js | Auth callback, email, профиль, ойын нәтижелерінің API шекарасы |
| redox-data.js | 9 сұрақ, деңгейлер, түсіндірмелер, ұпай есебі |
| experience.css | Жасыл/бейтарап дизайн жүйесі, responsive зертхана |
| app.js | Қолданыстағы маршруттармен және сессиямен біріктіру |
| build.mjs | Тек ашық активтерді жинау, cache revision, public env конфигурация |
| preview.mjs | Тек рұқсат етілген активтерді беретін localhost preview |
| supabase/migrations/202609160001_redox_game.sql | Нәтижелер, RLS, серверлік есептеу, қайталама сақтауды болдырмау |
| supabase/tests/redox_rls.sql | Екі қолданушымен транзакциялық қауіпсіздік тексеруі |

Оқу жолы: `/` → `/learn/redox` → `/games/redox` → `/results` → `/kabinet`.
Профиль: `/profile`. Қалпына келтіру: `/forgot-password` → email → `/reset-password`.

Әр ойын: 3 тапсырма, 100 ұпай/дұрыс жауап, уақыт шектеуі жоқ, түсіндірме, қайталау. Сервер клиент ұпайына сенбейді: тек жауаптар қабылданады. Жетістіктер сақталған нәтижелерден есептеледі. Қонақ ойыны тек ашық бет жадында қалады; refresh кезінде жоғалады, бұл интерфейсте көрсетілген. Тіркелген қолданушы «Нәтижені сақтау» батырмасын қолданады. Нәтижелер журналы соңғы 100 әрекетті көрсетеді.

## Іске қосу және жинақтау

Node.js 24 ұсынылады. Қосымша npm пакеттері қажет емес.

```sh
node preview.mjs
# http://127.0.0.1:4173/
node --test tests/platform.mjs tests/redox.mjs
python3 tests/integration.py
python3 tests/security.py
python3 tests/smoke.py # preview сервері жұмыс істеп тұрғанда
node build.mjs
```

`dist/` — GitHub Pages үшін дайын ашық активтер. `preview.mjs` бастапқы файлдарды көрсетеді және config.js-тағы Supabase-тің ашық контентін оқиды. Preview деректер базасын көшірмейді. Бұрынғы `python3 server.py` / `start.sh` жергілікті SQLite режимі сақталған; жаңа cloud-профиль, email және ойын сақтау мүмкіндіктері Supabase талап етеді және ол болмаса нақты қате көрсетеді.

`.env.example` — үлгі. `.env` браузерде автоматты оқылмайды. Құрастыруда SUPABASE_URL және SUPABASE_ANON_KEY орта айнымалыларын беріңіз; екеуі жоқ болса қазіргі public config.js сақталады. Build тек `sb_publishable_…` кілтін қабылдайды. service_role, secret key және дерекқор паролі frontend-ке берілмейді.

## Supabase баптау

1. Supabase Dashboard-қа кіріп, қолданыстағы `ekseiqhgrgifqmpnfzul` жобасына қолжетімділікті тексеріңіз. Деректерді басқа жобаға көшірмеңіз. Жобаның Free тарифі Dashboard арқылы расталды; ақылы опциялар қосылмаған.
2. Бұрынғы миграциялардың қолданылғанын тексеріңіз. Бар production жобаға ескі бастапқы SQL-ды қайта іске қоспаңыз. Жаңа `202609160001_redox_game.sql` миграциясын SQL Editor немесе қалыпты migration pipeline арқылы бір рет қолданыңыз.
3. Auth → URL Configuration:
   - Site URL: `https://gylym.github.io/himya-platforma/`
   - Redirect URLs: `https://gylym.github.io/himya-platforma/`
   - Жергілікті тест үшін: `http://127.0.0.1:4173/`
   - Ішкі жол preview үшін: `http://127.0.0.1:4173/himya-platforma/`
4. Email provider және Confirm email параметрін тексеріңіз. Recovery/confirmation сілтемесі түбірге қайтады; клиент hash-токенді URL-дан дереу алып, Auth арқылы тексереді, сосын `/reset-password` немесе `/kabinet` ашады.
5. Хат жеткізуін нақты тест email-мен тексеріңіз. Supabase әдепкі SMTP қызметінің адресат және rate limit шектеулері бар; ашық тіркелу үшін аккаунтқа тиесілі SMTP қажет болуы мүмкін. Бұл жұмыста ақылы SMTP алынған жоқ. [Supabase Auth нұсқаулығы](https://supabase.com/docs/guides/auth/passwords).
6. Staging ішінде `supabase/tests/redox_rls.sql` орындаңыз. Ол екі уақытша user жасап, RLS/RPC оқшаулауын тексереді және бәрін rollback жасайды. SQL Editor-дің auto-commit ерекшелігін ескеріп, бүкіл файлды бір скрипт ретінде орындаңыз.

## Жариялау

Preview-ді тексеріңіз → Supabase миграциясы мен redirect/SMTP конфигурациясын аяқтаңыз → feature тармағын PR арқылы main-ге біріктіріңіз. `.github/workflows/validate.yml` feature/PR тексерулерін жүргізеді. `.github/workflows/pages.yml` main үшін тесттер, build және Pages deploy орындайды.

`/himya-platforma/` base жолы мен 404.html history fallback сақталған. Build барлық JS импорттары мен CSS/JS сілтемелеріне commit revision қосады. Миграцияны қолданбай production-ға жариялау ойынның cloud сақтауын іске қоспайды. Frontend rollback үшін бұрынғы commit-ті қайта жариялауға болады; жаңа game_results кестесін жою қажет емес.

## Тексеру шектері

Тексеру есебі `QA-REDOX.md` файлында. Екінші кезеңде migration live жобада орындалды; ойынның cloud сақтау/қайта ашу, сессия refresh, профиль сақтау және live RLS тексерулері өтті. Custom SMTP бапталмағандықтан нақты email жеткізу және password recovery end-to-end расталмаған. Толық күйі QA-REDOX.md ішінде.

## Химия дереккөздері

- Берілген `redox_kmno4_lab.html`: бастапқы визуалды идея.
- [Brno University of Technology: Basic Chemistry laboratory sessions](https://www.che.fce.vutbr.cz/wp-content/uploads/sites/15/2019/07/BC01-lab_sessions.pdf): Mn²⁺ / MnO₂ / MnO₄²⁻ түстері мен ортаға тәуелділігі.
- [Maritime University of Szczecin: Oxidation and reduction reactions](https://pm.szczecin.pl/uploads/imfich/zaklad-chemii/8090_TCh_Oxidation_and_reduction_reactions_in_solutions.pdf): KMnO₄ және сульфиттің әр ортадағы реакциялары.

Мәтіндер қазақша қайта жазылды; теңдеулер атом және заряд сақталуы бойынша тексерілді. Бұл виртуалды оқу моделі, нақты зертханалық тәжірибенің толық механизмі емес.

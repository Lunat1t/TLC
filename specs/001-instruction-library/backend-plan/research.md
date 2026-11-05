# Исследование бэкенда

## Supabase

Решение: сначала проверить URL, проект, историю миграций, объекты, grants и schema cache; использовать тестовую базу. PGRST202/PGRST205 указывают на недоступный в API объект, но не доказывают конкретную причину. Альтернатива — применить все SQL вслепую — отвергнута, поскольку миграции изменяют политики существующих profiles. Источник: https://docs.postgrest.org/en/v16/references/errors.html

## Сессия

Решение: дождаться проверки пользователя и обновления cookies в middleware, проверять роль на сервере, убрать неявное подключение к запасному проекту. Текущий вызов не ожидается. Наличие cookies или client metadata само по себе не подтверждает роль. Источник: https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs&queryGroups=framework

## PDF и версии

Обновлённое решение 2026-11-05: Google Drive хранит сам PDF; опубликованная карточка ведёт на TLC download route, который запрашивает у Drive `webContentLink` и отвечает редиректом. Supabase хранит только Drive file ID и метаданные; публичный RPC каталога раскрывает лишь `has_pdf`. Подключение PDF включает permission `anyone:reader`, чтобы скачивание работало без Google-входа. PDF-байты не проксируются через Next.js и не участвуют в шаговом запуске/прогрессе. Ссылка остаётся работоспособной после удаления карточки из каталога, пока Drive permission не отозван. Копия в Supabase Storage не нужна; отдельная закреплённая ревизия не требуется для этого простого download-потока.

### Загрузка PDF напрямую в Drive

Для PDF до 100 000 000 байт браузер напрямую передаёт файл в Google Drive по resumable session URI. Next.js/Vercel API создаёт сессию, проверяет владельца, размер и PDF-подпись, включает `anyone:reader` и сохраняет карточку с Drive file ID в Supabase. При нажатии TLC получает официальный `webContentLink` у Drive и перенаправляет браузер; сами PDF-байты не проходят через Vercel. Это обходит лимит Vercel Function request body в 4.5 MB; URI сессии является временной capability и возвращается только редактору с `Cache-Control: private, no-store`. Google документирует [browser download через `webContentLink`](https://developers.google.com/workspace/drive/api/guides/manage-downloads) и [resumable session uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads). Лимит Vercel: https://vercel.com/docs/functions/limitations .

## Уточнённые решения 2026-11-05

- PDF до 100 000 000 байт включительно; загрузка напрямую в Drive.
- Последнее уточнение пользователя: карточка начинает скачивание по Drive download URL без Google-входа. Встроенный PDF просмотр, Range/progress и launch gate не относятся к PDF-потоку. Потеря сети/прогресс всё ещё применимы к пошаговой сборке с изображениями.
- Решение: нижняя навигация по выбранному компоненту https://21st.dev/r/arunachalam/bottom-nav-bar, плюс свайп и доступные кнопки. Исходный registry, лицензия и зависимости требуют проверки до интеграции; каталог подтверждает существование компонента: https://21st.dev/community/components/explore/nav-menu . Уровень и косметика — будущее, не текущая задача.

## Компонент нижней навигации 21st.dev (проверка 2026-11-05)

Официальная [страница компонента](https://mcp.21st.dev/@arunachalam/components/bottom-nav-bar) описывает сенсорную pill-панель и указывает зависимости `lucide-react` и `framer-motion`; описание упоминает Tailwind CSS v4, тогда как TLC сейчас использует Tailwind CSS v3. В исходнике, предоставленном пользователем, `lucide-react` уже используется в проекте, `framer-motion` отсутствует.

На странице компонента конкретная лицензия не опубликована. [Условия 21st.dev](https://docs.21st.dev/terms) требуют видимую ссылку на исходный компонент при копировании и распространении; changelog 21st.dev поясняет, что лицензия показывается только после подтверждения. Поэтому исходный registry-компонент и удалённый `npx shadcn` не используем. Вместо него реализуем собственную TLC-панель на уже установленном `lucide-react` и CSS, сохраняя согласованные функции: две реальные страницы «Проекты» и «Инструкции», touch-свайп, кнопочную навигацию и reduced-motion. Это избегает добавления зависимости анимации.

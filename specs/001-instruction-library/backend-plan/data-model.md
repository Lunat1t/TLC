# Модель: дополнение к существующей data-model.md

- Instruction: id, slug, kit, title, summary, status draft/published/archived, подтверждение прав; публикация требует полного описания и материала.
- InstructionAsset: instruction_id, kind, MIME, размер от 1 до 100 000 000 байт включительно для PDF и согласованный источник: Drive file ID и revision ID для PDF либо Storage object key для изображений. Новые ограничения вводить после аудита существующих данных.
- StudentSession: student_id, auth_session_id, generation, last_seen и ended_at; один текущий планшет, generation увеличивается транзакционно при замене.
- Selection: student_id, instruction_id, selection_version и status; замена выбора закрывает прежнюю сборку с сохранением прогресса согласно спецификации.
- AssemblyLaunch: student_id, selection_version, admin_id, idempotency_key, status и неизменяемый snapshot карточки, шагов и Drive file/revision. Состояния: pending, opened, completed, closed, superseded; версия удерживается до завершения открытого запуска, замена планшета её не меняет.
- Progress: launch_id, шаг или текущая страница PDF (целое число от 1 до количества страниц), версия и время; проверка принадлежности запуску и защита от устаревшей записи.
- RLS и проверенные серверные функции должны совместно требовать владельца запуска, активный планшет и материал из snapshot; прямой Data API не должен обходить проверки.

#!/usr/bin/env python3
"""Собирает SQL-импорт каталога LEGO EV3 из списка PDF в папке Google Drive.

Вход: JSON-массив [{"name": "0001 - Тележка - legoev3-instruction-0001.pdf", "id": "<Drive file id>", "size": 1593030}, ...]
Выход: SQL по образцу spike-prime-drive-20261113.sql (идемпотентный, права на публикацию не утверждает).

Основной файл инструкции: «NNNN - Название - legoev3-instruction-NNNN.pdf».
Исключение: «0103 - … - legoev3-instruction-0102.pdf» (в названии файла опечатка, номер берётся из префикса).
Дополнительные файлы (исследование, лекция, программа, план занятия, «-2») отдельными инструкциями не импортируются.

Запуск: python3 scripts/imports/build_ev3_import.py drive-list.json > scripts/imports/ev3-drive-YYYYMMDD.sql
"""
import json
import re
import sys

NAME = re.compile(r"(\d{4}) - (.+) - legoev3-instruction-(.+)\.pdf")


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main(path: str) -> None:
    files = json.load(open(path, encoding="utf-8"))
    primary, extra, unknown = [], [], []
    for item in files:
        m = NAME.fullmatch(item["name"])
        if not m:
            unknown.append(item["name"])
            continue
        code, title, suffix = m.groups()
        if suffix == code or (code == "0103" and suffix == "0102"):
            primary.append((code, title, item["id"], int(item["size"])))
        else:
            extra.append(item["name"])
    primary.sort(key=lambda row: (row[1].casefold(), row[0]))
    rows = []
    for index, (code, title, file_id, size) in enumerate(primary, start=1):
        rows.append(f"  ({sql_text('ev3-' + code)}, {sql_text(f'{title} ({code})')}, {sql_text(file_id)}, {size}, {index * 2})")
    print(f"-- TLC LEGO EV3 PDF catalogue imported from Google Drive.")
    print(f"-- {len(primary)} primary instructions; {len(extra)} supplementary PDFs (research, lecture, program, lesson plan) are not imported as independent instructions.")
    if unknown:
        print("-- Unrecognised file names skipped: " + ", ".join(unknown))
    print("-- Idempotent: skips existing Drive file IDs and already-used slugs without modifying existing records.")
    print("-- The importer does not assert publication rights on behalf of any user.")
    print("WITH source(slug, title, file_id, file_size, sort_order) AS (\n VALUES")
    print(",\n".join(rows))
    print("""), created AS (
 INSERT INTO public.instructions (slug,title,summary,kit,topics,status,published_at)
 SELECT s.slug, s.title, '', 'ev3', ARRAY['LEGO EV3'], 'published',
        now() - (s.sort_order * interval '1 millisecond')
 FROM source s
 WHERE NOT EXISTS (
   SELECT 1 FROM public.instruction_assets a
   WHERE a.source_provider = 'google_drive' AND a.source_file_id = s.file_id
 )
 ON CONFLICT (slug) DO NOTHING
 RETURNING id, slug
)
INSERT INTO public.instruction_assets (instruction_id,kind,mime_type,byte_size,source_provider,source_file_id,is_current)
SELECT c.id, 'document', 'application/pdf', s.file_size, 'google_drive', s.file_id, true
FROM created c JOIN source s ON c.slug = s.slug;""")


if __name__ == "__main__":
    main(sys.argv[1])

# Implementation Plan: Индивидуальный пульт Pybricks

**Branch**: `001-instruction-library` (рабочая ветка; контекст Spec Kit `002-custom-controller`) | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)

## Summary

Пульт с двумя виртуальными стиками: левый смешивает скорости пары приводных моторов для движения и поворота, правый пропорционально управляет отдельным мотором действия с фиксацией. Скорости и назначения хранятся локально и в профиле ученика Supabase Auth. Программа Pybricks обнаруживает моторы и не привязана к имени хаба.

## Technical Context

**Language/Version**: TypeScript 5.7, JavaScript ES modules, MicroPython/Pybricks 3.x  
**Primary Dependencies**: Next.js 15, React 19, Supabase SSR, Web Bluetooth, Pybricks BLE profile  
**Storage**: Supabase Auth user metadata через авторизованный API; локальная копия раскладки  
**Testing**: `npm test`, `npx tsc --noEmit`, `npm run build`, проверка на хабе  
**Target Platform**: HTTPS браузер с Web Bluetooth и совместимый Powered Up хаб  
**Project Type**: веб приложение + программа хаба  
**Performance Goals**: отправлять только актуальную команду, остановить мотор при отсутствии команд более 600 мс  
**Constraints**: установка программы через Pybricks Code  
**Scale/Scope**: один профиль на ученика, до 6 моторных портов; два порта движения и один необязательный порт действия

## Constitution Check

`.specify/memory/constitution.md` содержит незаполненный шаблон. Специальных проектных ворот нет. Безопасность моторов и проверка пользователя являются воротами этого плана. Они проходят при наличии аварийной остановки, таймаута хаба и проверки сессии в API.

## Project Structure

```text
public/controller.html
public/controller.js
public/controller-model.js
public/controller.css
public/hub_program.py
src/app/api/controller-layout/route.ts
src/lib/controller-layout.ts
tests/controller-model.test.js
specs/002-custom-controller/
```

**Structure Decision**: оставить экран статическим модулем, чтобы Web Bluetooth запускался непосредственно по нажатию ученика; добавить Next API для авторизованного облачного хранения и сохранить чтение прежних пользовательских раскладок с преобразованием назначений портов.

## Post-design Constitution Check

Контракт ограничивает порты и команды, Supabase Auth разрешает изменение только собственного профиля, а хаб самостоятельно останавливает моторы по таймауту. Ворота пройдены. Аппаратная проверка остается приемочным шагом.

# Как этим должен пользоваться аналитик

Главная идея: пользователь **не должен вручную думать про все сущности**. В нормальном code-review UX он работает с тремя простыми действиями:

```text
1. Отметить: Source / Sink / Guard / Transform / Note
2. Связать: этот source -> этот sink, этот guard защищает этот flow
3. Проверить: создать check, приложить evidence, получить finding
```

А `Assets`, `Imports`, `Candidates`, `Objects`, `Relations` и т.д. — это внутренний слой, который делает эти действия устойчивыми, дедуплицируемыми и переиспользуемыми.

---

# 1. Что есть что с точки зрения пользователя

## 1.1. Assets — “что мы проверяем”

`Asset` — это кусок scope.

Примеры:

```text
repo: payment-service
repo: shared-auth-lib
url: https://pay.example.com
url group: external blackbox scope
openapi: payment-openapi.yaml
```

Пользовательский смысл:

> “Я сейчас проверяю вот этот репозиторий / сервис / URL / спецификацию”.

В VS Code это должно быть просто выбранное состояние:

```text
Assessment: Payment Review
Asset: payment-service @ commit abc123
```

Пользователь редко работает с Asset напрямую после выбора. Asset нужен, чтобы все marks/candidates/evidence были привязаны к правильному repo/URL.

---

## 1.2. Imports — “что загрузили от инструментов”

`Import` / `ImportBatch` — это пачка данных от внешнего инструмента.

Примеры:

```text
Joern export: найденные Runtime.exec / $where / render_template_string
LLM analysis: предварительные source/sink/check suggestions
Semgrep export: dangerous callsites
OpenAPI import: endpoints/parameters
Blackbox scan: URLs, params, responses
```

Пользовательский смысл:

> “Я загрузил результаты инструмента, но ещё не решил, что из этого правда”.

Import не должен сразу создавать финальную истину. Он создаёт `Candidates`.

---

## 1.3. Candidates — “предложения, которые надо принять или отклонить”

`Candidate` — это неподтверждённое предложение.

Примеры:

```text
Joern suggests: this line is a sink
LLM suggests: q may flow to MongoDB $where
Semgrep suggests: subprocess call is dangerous
OpenAPI suggests: POST /search has parameter q
```

Пользовательский смысл:

> “Система предлагает. Я принимаю, отклоняю или связываю”.

Очень важно: candidate — это не vulnerability. Это “входящее предложение”.

---

## 1.4. Objects — “адресуемые вещи”

`Object` — это то, на что можно сослаться.

Примеры:

```text
file src/api/search.py
function search_orders()
line 57 MongoDB $where callsite
endpoint POST /api/search
parameter q
config key smtp.host
```

Пользовательский смысл:

> “Конкретная точка в коде или blackbox scope”.

Пользователь не должен вручную создавать `Object` в обычном режиме. Когда он кликает `Sink` на строке, backend сам создаёт object для этой строки, если object ещё нет.

---

## 1.5. Marks — “быстрая разметка”

`Mark` — главный объект для VS Code UX.

Примеры:

```text
SOURCE на параметре q
SINK на MongoDB $where
GUARD на validate_url()
TRANSFORM на url_decode()
NOTE на подозрительном месте
```

Пользовательский смысл:

> “Я как аналитик отметил эту точку”.

Сейчас extension уже умеет:

```text
Source | Sink | Guard | Transform | Create Check
```

Это правильно. Нужно добавить слой “после клика показать, что можно связать”.

---

## 1.6. Relations — “связи между всем”

`Relation` — универсальная связь.

Примеры:

```text
Source POSSIBLY_FLOWS_TO Sink
Guard GUARDED_BY Flow
Check CHECKS Sink
Evidence SUPPORTS Check
Case PART_OF Mark
Finding GENERATED_FROM Check
Candidate DUPLICATE_OF Mark
```

Пользовательский смысл:

> “Это связано с этим”.

Relation не должна быть сложной для пользователя. В UI это должно выглядеть как простые действия:

```text
Link to recent Source
Link to recent Sink
Add to current Case
This guard protects this flow
This evidence supports this check
```

---

## 1.7. Cases — “рабочее расследование”

`Case` — папка расследования вокруг гипотезы.

Примеры:

```text
Possible Mongo $where NoSQLi
Possible SSRF through callback_url
Possible Jinja SSTI in mail template
File upload to pickle deserialization
```

Пользовательский смысл:

> “Я нашёл подозрительную историю и собираю всё вокруг неё”.

Case содержит:

```text
source marks
sink marks
relations
checks
evidence
notes
eventual finding
```

Case нужен, чтобы не превращать каждую мысль сразу в finding.

---

## 1.8. Checks — “что надо проверить”

`Check` — проверяемая задача.

Примеры:

```text
User-controlled q cannot reach MongoDB $where
callback_url is protected against SSRF
Jinja template body is not user-controlled
File upload cannot reach pickle.loads
```

Пользовательский смысл:

> “Вот конкретная проверка. Её надо выполнить и поставить статус”.

Статусы:

```text
NOT_STARTED
IN_PROGRESS
CHECKED_OK
CHECKED_WEAK
FAILED
NOT_APPLICABLE
BLOCKED
```

---

## 1.9. Evidence — “чем доказываем”

`Evidence` — доказательство.

Примеры:

```text
code snippet
HTTP request
HTTP response
Joern path
Semgrep result
manual note
screenshot reference
command output
```

Пользовательский смысл:

> “Почему я так решил”.

Evidence можно прикрепить к:

```text
Check
Relation
Case
Finding
Mark
Object
```

Но в UI надо показывать проще:

```text
Attach selected code as evidence
Attach HTTP response
Attach note
Attach tool output
```

---

## 1.10. Findings — “что уйдёт в отчёт”

`Finding` — итоговая проблема.

Примеры:

```text
MongoDB $where NoSQL injection in search endpoint
SSRF through callback_url
Unsafe pickle deserialization
```

Пользовательский смысл:

> “Это уже подтверждённая или оформленная проблема”.

Finding должен появляться из:

```text
FAILED Check
CONFIRMED Case
```

Не напрямую из LLM/Joern.

---

## 1.11. Coverage — “что не закрыто”

`Coverage` — список дыр в работе.

Примеры:

```text
5 sinks without checks
12 candidates not reviewed
3 cases without checks
2 failed checks without findings
4 findings without evidence
```

Пользовательский смысл:

> “Что я забыл проверить или оформить”.

Coverage — это не граф. Это actionable todo-list.

---

# 2. Как это должно ощущаться в VS Code

Сейчас у тебя есть строка:

```text
Source | Sink | Guard | Transform | Create Check | Attach Evidence | Open Review Context | Custom title...
```

Это правильная база, но UX должен стать контекстным.

## 2.1. Верхняя строка действий

Для текущей строки:

```text
[SOURCE] [SINK] [GUARD] [TRANSFORM] [CHECK] [EVIDENCE] [CASE] [LINK] [CONTEXT]
```

Но кнопки должны менять смысл, если есть импортированный candidate.

Например на строке есть Joern candidate “MongoDB $where sink”:

```text
[Accept Sink: Joern] [Reject] [Create Case] [Create Check] [Evidence] [Context]
```

Если candidate нет:

```text
[Mark Source] [Mark Sink] [Mark Guard] [Mark Transform] [Create Check] [Attach Evidence]
```

---

# 3. Идеальный one-click UX

## Сценарий A: пользователь нашёл sink

Пользователь стоит на строке:

```python
db.users.find({"$where": "this.name == '" + q + "'"})
```

Нажимает:

```text
Sink
```

Система делает за один клик:

```text
1. Создаёт Object для текущей строки, если его нет.
2. Создаёт Mark(kind=SINK).
3. Показывает mini-toast:
   "Sink marked: MongoDB $where call"
4. Добавляет mark в Recent Marks.
5. Справа показывает Suggested next actions.
```

Suggested next actions:

```text
- Create Case: Possible database injection
- Create Check: User input cannot reach this sink
- Link to recent Source: q
- Accept matching candidate from Joern
- Attach selected code as evidence
```

То есть первый клик всегда быстрый, а связывание — в следующем маленьком блоке, без формы.

---

## Сценарий B: candidate уже есть

Если на строке уже есть candidate:

```text
Candidate:
Joern: MongoDB $where sink, HIGH confidence
```

Кнопка должна быть не просто `Sink`, а:

```text
Accept Sink
```

Нажатие делает:

```text
1. Candidate -> ACCEPTED.
2. Создаёт/переиспользует Object.
3. Создаёт Mark SINK.
4. Если duplicate — merge вместо нового mark.
5. Показывает:
   "Accepted Joern candidate as Sink"
```

Пользователь не должен выбирать из большой формы.

---

## Сценарий C: пользователь нашёл source

Пользователь стоит на обработке request param:

```python
q = request.json["q"]
```

Нажимает:

```text
Source
```

Система:

```text
1. Создаёт Object для строки.
2. Создаёт Mark SOURCE.
3. Показывает Recent Sinks nearby / in current file / in current case.
```

Toast:

```text
Source marked: q
Quick link:
[Link to MongoDB $where sink] [Create Case] [Create Check]
```

---

## Сценарий D: связать source и sink

После отметки source и sink должен быть “one-click link”.

В панели:

```text
Recent Marks
SOURCE q                        [link →]
SINK   MongoDB $where            [← link]
```

Пользователь нажимает:

```text
Link source -> sink
```

Система создаёт:

```text
Relation:
SOURCE_MARK POSSIBLY_FLOWS_TO SINK_MARK
```

И предлагает:

```text
[Create Case] [Create Check] [Attach Evidence]
```

Для простоты UX можно сделать кнопку:

```text
Create Flow Case
```

Она делает сразу:

```text
1. Relation POSSIBLY_FLOWS_TO
2. Case "Possible q -> MongoDB $where"
3. Check "q cannot reach MongoDB $where as query fragment"
```

Но важно: это должно быть опциональное smart action, не всегда.

---

# 4. Правая панель VS Code: Review Context

Главная панель должна быть не списком всех сущностей, а “что известно здесь”.

```text
┌─────────────────────────────────────────────┐
│ AppSec Context                              │
│ payment-service / src/api/search.py:57      │
├─────────────────────────────────────────────┤
│ Candidates                                  │
│ [HIGH] Joern: MongoDB $where sink            │
│        [Accept] [Reject] [Merge]             │
│ [MED]  LLM: q may reach this sink            │
│        [Accept Relation] [Add to Case]       │
├─────────────────────────────────────────────┤
│ Marks                                       │
│ [SINK] MongoDB $where                        │
│        [Create Case] [Create Check]          │
├─────────────────────────────────────────────┤
│ Relations                                   │
│ q POSSIBLY_FLOWS_TO MongoDB $where           │
│        [Confirm] [Dismiss] [Evidence]        │
├─────────────────────────────────────────────┤
│ Cases                                       │
│ Possible Mongo $where NoSQLi                 │
│        [Open] [Add current line]             │
├─────────────────────────────────────────────┤
│ Checks                                      │
│ q cannot reach $where as JS expression       │
│        [OK] [Weak] [Failed] [N/A] [Evidence] │
├─────────────────────────────────────────────┤
│ Quick Actions                               │
│ [Mark Sink] [Attach Evidence] [Create Check] │
└─────────────────────────────────────────────┘
```

Пользователь видит только релевантное текущей строке.

---

# 5. “Recent tray” — чтобы связывать без возни

Нужна маленькая панель “недавно отмеченное”.

```text
Recent AppSec Marks
┌─────────────────────────────────────────────┐
│ SOURCE q                  src/api/search.py:31 │
│ SINK   MongoDB $where     src/api/search.py:57 │
│ GUARD  validate_role      src/auth.py:22        │
└─────────────────────────────────────────────┘
```

Когда пользователь создаёт новый mark, он попадает сюда.

Действия:

```text
drag source onto sink
click "link"
click "add both to case"
click "create check"
```

В VS Code можно сделать без drag-and-drop:

```text
[Link selected source to this sink]
[Link this source to recent sink]
[Add recent marks to case]
```

Это очень важно: source и sink часто находятся в разных файлах. Recent tray делает связывание быстрым.

---

# 6. Мини-потоки “один клик плюс подсказка”

## 6.1. Mark Sink

```text
Click Sink
  -> Object created/reused
  -> Mark SINK created
  -> Suggested:
       Create Case
       Create Check
       Link to recent Source
       Attach Evidence
```

## 6.2. Mark Source

```text
Click Source
  -> Object created/reused
  -> Mark SOURCE created
  -> Suggested:
       Link to recent Sink
       Create Case
       Create Check
```

## 6.3. Mark Guard

```text
Click Guard
  -> Mark GUARD created
  -> Suggested:
       Link guard to existing flow
       Add to current case
       Create check: guard cannot be bypassed
```

## 6.4. Create Check

```text
Click Create Check
  -> if current line has Mark:
       prefill from Mark
  -> if current line has Candidate:
       prefill from Candidate
  -> if current Case exists:
       attach to Case
  -> create Check with NOT_STARTED
```

No large form. Only optional title override.

## 6.5. Attach Evidence

```text
Select code
Click Attach Evidence
  -> Evidence CODE_SNIPPET created
  -> link to current Check if opened
  -> else link to current Case
  -> else link to current Mark
```

---

# 7. Candidate UX: не “список мусора”, а “inbox”

В Web UI Candidate Inbox должен быть как triage.

```text
Candidate Inbox
┌────────────────────────────────────────────────────────────┐
│ Filters: [NEW] [HIGH] [JOERN] [Current Asset] [Sinks]       │
├────────────────────────────────────────────────────────────┤
│ HIGH  SINK      MongoDB $where       src/api/search.py:57   │
│       source: Joern                                         │
│       [Accept] [Reject] [Open in VS Code] [Create Case]      │
├────────────────────────────────────────────────────────────┤
│ MED   RELATION  q may reach $where   src/api/search.py       │
│       source: LLM                                           │
│       [Accept Relation] [Add to Case] [Reject]               │
└────────────────────────────────────────────────────────────┘
```

Но в VS Code candidate должен показываться **только если относится к текущей строке/функции/файлу**.

---

# 8. Case UX: собрать расследование одним кликом

Когда есть source и sink, пользователь должен видеть:

```text
Create Case from Source/Sink
```

Case создаётся с дефолтным названием:

```text
Possible q -> MongoDB $where
```

Внутрь автоматически добавляются:

```text
source mark
sink mark
relation, если есть
current evidence, если selected
candidate, если accepted
```

Case detail:

```text
Case: Possible q -> MongoDB $where
Status: Investigating
Severity hint: High

Flow:
SOURCE q  →  SINK MongoDB $where

Checks:
[ ] User-controlled q cannot reach $where as JavaScript expression
[ ] Query is parameterized or structurally constrained
[ ] Error/boolean oracle is not exposed

Evidence:
- code snippet search.py:57
- Joern path controller -> service -> repository
```

---

# 9. Check UX: не форма, а быстрые шаблоны

При `Create Check` система должна предлагать smart templates по текущему mark:

Если current mark = `SINK` с `sink_type=DATABASE_OPERATION`:

```text
Suggested checks:
[+] User-controlled input cannot reach this database operation
[+] Query structure cannot be attacker-controlled
[+] Error/boolean oracle is not exposed
[+] Database privileges do not allow file/OS side effects
```

Если current mark = `SINK` с `TEMPLATE_RENDERER`:

```text
[+] User-controlled template body cannot reach renderer
[+] Escaping/sandbox cannot be bypassed
[+] Persisted template fragments are not rendered later
```

Если current mark = `GUARD`:

```text
[+] Guard cannot be bypassed
[+] Validation happens before sink
[+] Canonicalization order is safe
```

Пользователь кликает один шаблон — check создаётся.

---

# 10. Evidence UX: выделил код → evidence

Самый удобный поток:

```text
1. Выделил 5 строк кода.
2. Нажал Attach Evidence.
3. Выбрал target:
   - current check
   - current case
   - current relation
   - current mark
4. Done.
```

Если открыт check/case в context panel, target выбирается автоматически.

Evidence title генерируется:

```text
Code snippet: src/api/search.py:57-62
```

---

# 11. Coverage UX: не отчёт, а “что сделать дальше”

Coverage должен быть списком рабочих проблем.

```text
Coverage
┌─────────────────────────────────────────────┐
│ 12 NEW candidates not reviewed              │
│ [Open Candidate Inbox]                      │
├─────────────────────────────────────────────┤
│ 5 SINK marks without checks                 │
│ [Create checks] [Open sinks]                │
├─────────────────────────────────────────────┤
│ 3 Cases without checks                      │
│ [Open cases]                                │
├─────────────────────────────────────────────┤
│ 2 Failed checks without findings            │
│ [Create findings]                           │
├─────────────────────────────────────────────┤
│ 4 Findings without evidence                 │
│ [Attach evidence]                           │
└─────────────────────────────────────────────┘
```

Coverage не должен требовать понимания graph.

---

# 12. Самый простой пользовательский путь

## Whitebox path

```text
1. Открываю repo в VS Code.
2. Выбираю Assessment + Asset.
3. Открываю подозрительный файл.
4. Вижу candidates от Joern/LLM рядом со строками.
5. Нажимаю Accept Sink.
6. Иду к request param, нажимаю Source.
7. Нажимаю Link Source -> Recent Sink.
8. Нажимаю Create Case.
9. Нажимаю Create Check.
10. Выделяю код, нажимаю Attach Evidence.
11. Ставлю Check FAILED.
12. Нажимаю Convert to Finding.
```

Всё. Это основной UX.

---

# 13. Что нужно добавить в extension поверх текущего

У тебя уже есть:

```text
Source
Sink
Guard
Transform
Create Check
```

Добавить обязательно:

```text
1. Review Context side panel.
2. Candidate cards near current location.
3. Accept/Reject/Merge candidate.
4. Recent Marks tray.
5. Link Source -> Sink.
6. Create Case from current Mark/Relation.
7. Attach Evidence from selection.
8. Quick suggested actions after every mark.
9. Gutter icons for SINK/SOURCE/GUARD/TRANSFORM.
10. CodeLens summary: "AppSec: 1 Sink, 2 Candidates, 1 Check".
```

---

# 14. UI-логика кнопок в текущей строке

## Если ничего нет

```text
Source | Sink | Guard | Transform | Create Check | Attach Evidence | Custom title
```

## Если есть candidate

```text
Accept Sink: Joern | Reject | Merge | Create Case | Create Check | Attach Evidence
```

## Если уже есть mark

```text
SINK marked | Create Case | Create Check | Link to Source | Attach Evidence | Dismiss
```

## Если есть source и recent sink

```text
SOURCE marked | Link to recent Sink | Create Flow Case | Create Check
```

## Если есть check

```text
Check: NOT_STARTED | OK | Weak | Failed | N/A | Attach Evidence | Finding
```

---

# 15. Главное правило для удобства

Не заставлять пользователя создавать сущности вручную.

Правильное поведение:

```text
Click Sink
  -> Object auto-created
  -> Mark auto-created
  -> Candidate auto-accepted/merged if matched
  -> Suggested next actions shown
```

```text
Click Attach Evidence
  -> Evidence auto-created from selected code
  -> Linked to current check/case/mark automatically
```

```text
Click Create Case
  -> Case auto-created from current mark/relation
  -> Current context auto-linked
```

```text
Click Create Check
  -> Check title auto-generated from mark/case/relation
  -> Current context auto-linked
```

Пользователь должен редактировать детали только если хочет, а не потому что без формы действие невозможно.

---

# 16. Как это объяснить агенту

Вот готовая формулировка:

```text
Сделай UX вокруг текущей строки кода.

Главный сценарий:
пользователь открыл файл в VS Code, поставил курсор на строку, extension запросил ReviewContext и показал всё, что уже известно по этой строке: candidates, marks, relations, cases, checks, evidence.

Пользователь должен иметь one-click actions:
- mark as Source/Sink/Guard/Transform;
- accept/reject/merge matching candidate;
- link current source to recent sink;
- link current sink to recent source;
- create case from current mark/relation;
- create check from current mark/relation/case;
- attach selected code as evidence;
- set check status;
- convert failed check to finding.

Не заставляй пользователя вручную создавать Object. Object должен создаваться/переиспользоваться автоматически при mark/candidate accept.

Не заставляй пользователя вручную заполнять длинные формы. Title/check шаблоны должны генерироваться из текущего контекста, с возможностью override.

Добавь Recent Marks tray:
- последние SOURCE/SINK/GUARD/TRANSFORM marks;
- быстрые действия link source->sink, add to case, create check.

Добавь Context Panel:
- Current Location;
- Candidates;
- Marks;
- Relations;
- Cases;
- Checks;
- Evidence;
- Suggested Actions.

Кнопки должны быть контекстными:
- если есть matching candidate, показывать Accept Sink/Source вместо generic Sink/Source;
- если mark уже есть, показывать Create Case/Create Check/Link/Attach Evidence;
- если есть check, показывать status actions and attach evidence;
- если есть failed check, показывать Convert to Finding.

Цель: исследуя код, аналитик должен обогащать assessment без возни: один клик отмечает, один клик связывает, один клик создаёт case/check/evidence.
```

Итоговая формула UX:

```text
Open code line
  -> See what is known
  -> Click mark
  -> Click link
  -> Click case/check
  -> Attach evidence
  -> Finding if failed
```

Внутренние сущности остаются мощными, но пользователь видит простую механику:

```text
Отметить → Связать → Проверить → Доказать → Оформить
```

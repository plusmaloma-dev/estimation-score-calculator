# Federation Source Request

Use this checklist/message to request official Egyptian Estimation rule evidence before changing scoring behavior.

## Purpose

US-216A is blocked because repeated public English and Arabic searches have not produced a retrievable detailed official scoring rulebook. This request keeps source capture actionable without mixing Egyptian Estimation with Planning Poker or changing code from incomplete evidence.

## Requested sources

Ask for any official or user-confirmed material that covers:

- Current official Egyptian Estimation rules or laws.
- Tournament regulations, if scoring is documented separately from game laws.
- Scoring tables for normal bids, Dash, Dash Call, WITH, high contracts, risk, double risk, and consecutive all-loser multipliers.
- Suit/trump hierarchy, including No Trump treatment.
- Any official amendments, publication dates, version numbers, or committee decisions.

## Minimum evidence to record

For each source received, capture:

- Document title.
- Source owner or issuing committee.
- URL, file name, or sender.
- Publication/update date, if available.
- Relevant section/page for each scoring rule.
- Whether the rule is official tournament policy or a table/house rule.

## English request message template

```text
Hello,

We are maintaining an Egyptian Estimation score calculator and want to keep the scoring engine aligned with official Egyptian Estimation rules rather than Planning Poker or unrelated card-game rules.

Could you please share the latest official Estimation rules, laws, tournament regulations, or scoring tables used by the federation/committee? We especially need references for normal bid scoring, Dash, Dash Call, WITH, high contracts, risk, double risk, all-loser multipliers, and trump/suit hierarchy.

If there are multiple versions, please indicate the current approved version, publication date, and whether the document applies to official tournaments or only informal/table play.

Thank you.
```

## Arabic request message template

```text
السلام عليكم،

نحن نعمل على تطوير حاسبة نقاط للعبة الاستيميشن المصرية، ونرغب في التأكد من أن قواعد التسجيل المستخدمة في التطبيق متوافقة مع القواعد الرسمية للاستيميشن المصري، وليست مرتبطة بأي مفاهيم تخص Planning Poker أو ألعاب ورق أخرى.

هل يمكن تزويدنا بآخر نسخة معتمدة من قواعد أو قوانين الاستيميشن، أو لوائح البطولات، أو جداول احتساب النقاط المستخدمة من الاتحاد/اللجنة؟ نحتاج بشكل خاص إلى مراجع واضحة لطريقة احتساب النقاط في الحالات التالية: العطاءات العادية، الداش، داش كول، الويذ، العقود العالية، الريسك، الدبل ريسك، مضاعفات خسارة جميع اللاعبين، وترتيب الألوان/الترامب بما في ذلك نو ترامب.

في حال وجود أكثر من نسخة، نرجو توضيح النسخة المعتمدة حاليًا، وتاريخ إصدارها أو تحديثها، وما إذا كانت خاصة بالبطولات الرسمية أم باللعب الودي/قواعد الطاولة.

شكرًا جزيلًا.
```

## Evidence intake notes

When a source is received, keep the original language and add an English summary only as a helper note. Do not translate a rule into implementation behavior until the relevant section/page has been recorded and compared against `PROJECT_RULES.md`.

## Handling received evidence

1. Add the source details to `FEDERATION_RULE_REVIEW.md`.
2. Compare against `PROJECT_RULES.md` only after the source is concrete.
3. Create US-216B differences only for sourced or explicitly user-confirmed differences.
4. Create US-216C implementation tasks only after accepted differences are clear.
5. Do not change scoring code from absent, ambiguous, or unrelated sources.

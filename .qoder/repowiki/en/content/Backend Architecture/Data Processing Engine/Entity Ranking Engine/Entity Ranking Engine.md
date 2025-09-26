# Entity Ranking Engine

<cite>
**Referenced Files in This Document**   
- [app/api/overview/route.ts](file://app/api/overview/route.ts)
- [lib/report/slice.ts](file://lib/report/slice.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [SQL-Based Entity Ranking](#sql-based-entity-ranking)
3. [In-Memory Aggregation and Text Processing](#in-memory-aggregation-and-text-processing)
4. [Specialized Ranking Logic](#specialized-ranking-logic)
5. [Text Normalization and Filtering](#text-normalization-and-filtering)
6. [Scalability Considerations](#scalability-considerations)

## Introduction

The entity ranking engine processes Telegram message data to identify top users, links, words, threads, helpers, errors, hashtags, and mentions. It combines SQL-based aggregation for structured data with in-memory processing for text analysis, enabling comprehensive insights from chat activity. The system is implemented across two primary files: `app/api/overview/route.ts` handles real-time analytics endpoints, while `lib/report/slice.ts` provides reusable reporting functionality.

**Section sources**
- [app/api/overview/route.ts](file://app/api/overview/route.ts#L1-L50)
- [lib/report/slice.ts](file://lib/report/slice.ts#L1-L50)

## SQL-Based Entity Ranking

The engine uses SQL GROUP BY clauses combined with ORDER BY and LIMIT to extract ranked lists from raw message data. This approach efficiently aggregates data at the database level before transmission to the application layer.

For user ranking, a LEFT JOIN between messages and users tables groups by user identifiers, counting messages per user and ordering by frequency:

```mermaid
flowchart TD
A["SELECT m.user_id, u.username, u.first_name, u.last_name, COUNT(*) AS cnt"] --> B["FROM messages m LEFT JOIN users u ON u.id = m.user_id"]
B --> C["WHERE sent_at >= $1 AND sent_at < $2"]
C --> D["GROUP BY user_id, username, first_name, last_name"]
D --> E["ORDER BY cnt DESC LIMIT 10"]
```

**Diagram sources**
- [app/api/overview/route.ts](file://app/api/overview/route.ts#L92-L123)

Forwarded content analysis employs Common Table Expressions (CTEs) with UNION ALL to consolidate data from different forwarding fields in the JSON message structure, then groups by chat or user identifiers:

```mermaid
flowchart TD
F["WITH f AS ( SELECT (raw_message->'forward_from_chat'->>'id') AS chat_id ... UNION ALL SELECT (raw_message->'forward_origin'->'chat'->>'id') AS chat_id ... )"] --> G["SELECT chat_id, title, username, COUNT(*)::int AS cnt"]
G --> H["FROM f WHERE chat_id IS NOT NULL"]
H --> I["GROUP BY chat_id, title, username"]
I --> J["ORDER BY cnt DESC LIMIT 20"]
```

**Diagram sources**
- [app/api/overview/route.ts](file://app/api/overview/route.ts#L294-L329)
- [app/api/overview/route.ts](file://app/api/overview/route.ts#L407-L435)

KPI calculations use aggregate functions with FILTER clauses to compute multiple metrics in a single query, improving efficiency:

```mermaid
flowchart TD
K["SELECT COUNT(*)::int AS total_msgs"] --> L["COUNT(DISTINCT user_id)::int AS unique_users"]
L --> M["COUNT(*) FILTER (WHERE raw_message ? 'reply_to_message')::int AS replies"]
M --> N["COUNT(*) FILTER (WHERE text ILIKE '%http%')::int AS with_links"]
N --> O["FROM messages WHERE sent_at >= $1 AND sent_at < $2"]
```

**Diagram sources**
- [lib/report/slice.ts](file://lib/report/slice.ts#L145-L176)

## In-Memory Aggregation and Text Processing

After retrieving relevant message text data via SQL queries, the engine performs in-memory aggregation using Map objects for word frequency counting and link extraction.

Word frequency analysis follows this process:
1. Extract all alphanumeric tokens using regex matching
2. Convert to lowercase for case normalization
3. Filter by minimum length and stopword removal
4. Count frequencies using Map object
5. Sort and limit results

```mermaid
flowchart TD
P["Extract text rows from database"] --> Q["For each message text"]
Q --> R["Match /[a-zA-Zа-яА-Я0-9ё]+/g"]
R --> S["Convert to lowercase"]
S --> T["Filter w.length >= 3 && !STOPWORDS.has(w)"]
T --> U["Update Map<string, number> frequency count"]
U --> V["Sort entries by count descending"]
V --> W["Slice top N results"]
```

**Diagram sources**
- [app/api/overview/route.ts](file://app/api/overview/route.ts#L125-L137)
- [app/api/overview/route.ts](file://app/api/overview/route.ts#L27-L37)

Link extraction uses regex parsing to identify URLs within message text, with additional normalization to standardize URL formats:

```mermaid
flowchart TD
X["For each message text"] --> Y["Match /(https?:\/\/\\S+)/g"]
Y --> Z["Normalize URL: lowercase protocol/host, remove default ports, trim trailing slashes"]
Z --> AA["Add to Map<string, number>"]
AA --> AB["Sort by frequency, limit results"]
```

**Diagram sources**
- [lib/report/slice.ts](file://lib/report/slice.ts#L51-L83)
- [app/api/overview/route.ts](file://app/api/overview/route.ts#L21-L25)

## Specialized Ranking Logic

The engine implements specialized ranking logic for complex entities like threads, helpers, and unanswered questions.

Thread depth analysis uses recursive CTEs to trace reply chains back to their root messages, enabling accurate thread popularity measurement:

```mermaid
flowchart TD
AC["WITH RECURSIVE chain AS ( SELECT message_id AS reply_id, user_id AS reply_user_id, message_id AS current_id, (raw_message->'reply_to_message'->>'message_id') AS parent_id FROM messages WHERE raw_message ? 'reply_to_message' UNION ALL SELECT chain.reply_id, chain.reply_user_id, p.message_id AS current_id, (p.raw_message->'reply_to_message'->>'message_id') AS parent_id FROM chain JOIN messages p ON p.message_id::text = chain.parent_id )"] --> AD["SELECT c.reply_user_id AS helper_user_id, username, first_name, last_name, COUNT(*)::int AS cnt FROM ( SELECT reply_id, reply_user_id, current_id AS root_id FROM chain WHERE parent_id IS NULL ) c JOIN messages root_msg ON root_msg.message_id::text = c.root_id LEFT JOIN users u ON u.id = c.reply_user_id WHERE c.reply_user_id <> root_msg.user_id GROUP BY reply_user_id, username, first_name, last_name ORDER BY cnt DESC LIMIT 10"]
```

**Diagram sources**
- [app/api/overview/route.ts](file://app/api/overview/route.ts#L444-L470)

Helper identification applies heuristic-based logic to distinguish genuine contributions from self-replies by ensuring the helper user ID differs from the thread originator:

```mermaid
flowchart TD
AE["Identify reply chains using recursive CTE"] --> AF["Trace each reply to root message"]
AF --> AG["Group replies by helper user_id"]
AG --> AH["Exclude cases where helper_user_id equals root_msg.user_id"]
AH --> AI["Count valid contributions, order by frequency"]
```

**Diagram sources**
- [app/api/overview/route.ts](file://app/api/overview/route.ts#L444-L470)

Error token detection employs pattern matching with regular expressions to identify technical issues mentioned in messages:

```mermaid
flowchart TD
AJ["Define errorRegex = /([A-Z_]{3,}|[Ee]rror|Exception|ECONN|429|403|Forbidden|timeout|rate\s*limit)/g"] --> AK["For each message text, find matches"]
AK --> AL["Normalize tokens: uppercase sequences kept as-is, others lowercased"]
AL --> AM["Count frequencies using Map<string, number>"]
AM --> AN["Sort by count, limit to top results"]
```

**Diagram sources**
- [lib/report/slice.ts](file://lib/report/slice.ts#L85-L90)
- [app/api/overview/route.ts](file://app/api/overview/route.ts#L444-L470)

## Text Normalization and Filtering

The engine applies several text processing techniques to improve ranking quality.

Stopword filtering removes common words that lack analytical value using a predefined set of English and Russian stopwords:

```mermaid
flowchart TD
AO["const STOPWORDS = new Set<string>([ 'the','and','for','with','that','this', ... 'и','в','во','не','что','он', ... ])"] --> AP["Filter extracted words: w.length >= 3 && !STOPWORDS.has(w)"]
```

**Diagram sources**
- [app/api/overview/route.ts](file://app/api/overview/route.ts#L27-L37)

Case normalization ensures consistent token comparison by converting all text to lowercase before analysis:

```mermaid
flowchart TD
AQ["text.toLowerCase()"] --> AR["Match /[a-zA-Zа-яА-Я0-9ё]+/g"]
AR --> AS["Process tokens with uniform case"]
```

**Diagram sources**
- [app/api/overview/route.ts](file://app/api/overview/route.ts#L32-L37)

Preview truncation improves UI performance by limiting text display length with ellipsis handling:

```mermaid
flowchart TD
AT["function truncatePreview(text: string, limit = 180): string"] --> AU["const t = text.trim()"]
AU --> AV["if (t.length <= limit) return t"]
AV --> AW["return t.slice(0, limit - 1) + '…'"]
```

**Diagram sources**
- [lib/report/slice.ts](file://lib/report/slice.ts#L73-L77)

## Scalability Considerations

The entity ranking engine addresses scalability concerns through several design patterns when processing large message volumes.

Query optimization uses parameterized queries with date-based filtering to limit result sets:

```mermaid
flowchart TD
AX["Define time window: since, until"] --> AY["Use baseWhere = sent_at >= $1 AND sent_at < $2"]
AY --> AZ["Apply additional filters only when needed"]
AZ --> BA["Fetch only essential fields for text processing"]
```

**Diagram sources**
- [lib/report/slice.ts](file://lib/report/slice.ts#L145-L176)

Memory-efficient processing batches operations to avoid excessive memory consumption:

```mermaid
flowchart TD
BB["For large root ID sets, process in chunks of 1000"] --> BC["const chunkSize = 1000"]
BC --> BD["for (let i = 0; i < rootIds.length; i += chunkSize)"]
BD --> BE["Process chunk, then proceed to next"]
```

**Diagram sources**
- [app/api/overview/route.ts](file://app/api/overview/route.ts#L139-L163)

Connection pooling manages database resources efficiently:

```mermaid
flowchart TD
BF["const pool = new Pool({ max: 5 })"] --> BG["Reuse connections across requests"]
BG --> BH["Release client in finally block"]
```

**Diagram sources**
- [lib/report/slice.ts](file://lib/report/slice.ts#L10-L15)
import pool from './db'

const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] as const
export type BloomLevel = (typeof BLOOM_LEVELS)[number]

function numToBloom(n: number): BloomLevel {
  if (!isFinite(n)) return 'understand'
  const idx = Math.max(0, Math.min(5, Math.round(n) - 1))
  return BLOOM_LEVELS[idx]
}

export interface ConceptActivity {
  subtopic: string
  askCount: number
  lastAskedAt: string
  dominantCognitiveLevel: BloomLevel | null
  recencyScore: number
}

export interface WeakSpot {
  subtopic: string
  subject: string
  askCount: number
  confusionRate: number
  weaknessScore: number
  dominantCognitiveLevel: BloomLevel | null
  status: 'active' | 'revisit'
}

export interface ProgressData {
  summary: {
    totalAsksThisWeek: number
    totalEvents: number
    weakSpotCount: number
    avgCognitiveLevel: BloomLevel
  }
  topicActivity: ConceptActivity[]
  weakSpots: WeakSpot[]
  cognitiveDistribution: Record<BloomLevel, number>
  dailyCounts: Array<{ day: string; count: number }>
}

export async function getProgressData(topic?: string): Promise<ProgressData> {
  const sc = topic ? 'AND subject = $1' : ''
  const p  = topic ? [topic] : []

  const [weekRow, avgRow, totalRow, activityRows, weakRows, dailyRows, distRow] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM progress_events WHERE created_at >= NOW() - INTERVAL '7 days' ${sc}`,
      p
    ),
    pool.query<{ avg_bloom: string | null }>(
      `SELECT AVG(CASE cognitive_level
         WHEN 'remember'  THEN 1.0 WHEN 'understand' THEN 2.0
         WHEN 'apply'     THEN 3.0 WHEN 'analyze'    THEN 4.0
         WHEN 'evaluate'  THEN 5.0 WHEN 'create'     THEN 6.0
       END) AS avg_bloom
       FROM progress_events WHERE cognitive_level IS NOT NULL ${sc}`,
      p
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM progress_events WHERE 1=1 ${sc}`,
      p
    ),
    pool.query<{
      subtopic: string; ask_count: string; last_asked_at: string
      dominant_cognitive_level: string | null; recency_score: string
    }>(
      topic
        ? `SELECT
             LOWER(TRIM(subtopic)) AS subtopic,
             COUNT(*) AS ask_count,
             MAX(created_at) AS last_asked_at,
             MODE() WITHIN GROUP (ORDER BY cognitive_level NULLS LAST) AS dominant_cognitive_level,
             SUM(EXP(-EXTRACT(EPOCH FROM (NOW() - created_at)) / 604800.0)) AS recency_score
           FROM progress_events
           WHERE subtopic IS NOT NULL AND subtopic != '' AND subject = $1
           GROUP BY LOWER(TRIM(subtopic))
           ORDER BY recency_score DESC
           LIMIT 20`
        : `SELECT
             subject AS subtopic,
             COUNT(*) AS ask_count,
             MAX(created_at) AS last_asked_at,
             MODE() WITHIN GROUP (ORDER BY cognitive_level NULLS LAST) AS dominant_cognitive_level,
             SUM(EXP(-EXTRACT(EPOCH FROM (NOW() - created_at)) / 604800.0)) AS recency_score
           FROM progress_events
           GROUP BY subject
           ORDER BY recency_score DESC
           LIMIT 20`,
      p
    ),
    pool.query<{
      subtopic: string; subject: string; ask_count: string; confusion_rate: string
      weakness_score: string; dominant_cognitive_level: string | null; resolved: boolean
    }>(
      `WITH signals AS (
         -- Inferred signal: Haiku confidence classification on every ask (weight 1)
         SELECT
           LOWER(TRIM(subtopic)) AS subtopic,
           subject,
           cognitive_level,
           created_at,
           CASE WHEN confidence_signal = 'low' THEN 1.0 ELSE 0.0 END AS confusion,
           1.0  AS weight,
           TRUE AS is_event,
           (confidence_signal = 'low') AS is_low_event,
           FALSE AS is_negative_fb,
           FALSE AS is_positive_fb
         FROM progress_events
         WHERE subtopic IS NOT NULL AND subtopic != '' ${sc}
         UNION ALL
         -- Explicit signal: user clicked got it / don't get it (weight 2)
         SELECT
           LOWER(TRIM(subtopic)) AS subtopic,
           subject,
           NULL AS cognitive_level,
           created_at,
           CASE WHEN feedback = 'negative' THEN 1.0 ELSE 0.0 END AS confusion,
           2.0   AS weight,
           FALSE AS is_event,
           FALSE AS is_low_event,
           (feedback = 'negative') AS is_negative_fb,
           (feedback = 'positive') AS is_positive_fb
         FROM messages
         WHERE feedback IS NOT NULL AND subtopic IS NOT NULL AND subtopic != '' ${sc}
       ),
       cs AS (
         SELECT
           subtopic,
           MODE() WITHIN GROUP (ORDER BY subject) AS subject,
           COUNT(*) FILTER (WHERE is_event) AS ask_count,
           MODE() WITHIN GROUP (ORDER BY cognitive_level NULLS LAST)
             FILTER (WHERE cognitive_level IS NOT NULL) AS dominant_cognitive_level,
           -- Recency-decayed blend (~2-week e-folding): recent signals dominate stale ones
           SUM(confusion * weight * EXP(-EXTRACT(EPOCH FROM (NOW() - created_at)) / 1209600.0))
             / NULLIF(SUM(weight * EXP(-EXTRACT(EPOCH FROM (NOW() - created_at)) / 1209600.0)), 0) AS confusion_rate,
           AVG(CASE cognitive_level
             WHEN 'remember'  THEN 1.0 WHEN 'understand' THEN 2.0
             WHEN 'apply'     THEN 3.0 WHEN 'analyze'    THEN 4.0
             WHEN 'evaluate'  THEN 5.0 WHEN 'create'     THEN 6.0
             ELSE NULL
           END) AS avg_bloom,
           MAX(created_at) FILTER (WHERE is_positive_fb) AS last_positive_at,
           MAX(created_at) FILTER (WHERE is_negative_fb) AS last_negative_fb_at,
           MAX(created_at) FILTER (WHERE is_low_event)   AS last_low_event_at
         FROM signals
         GROUP BY subtopic
         HAVING COUNT(*) FILTER (WHERE is_event) >= 3
       )
       SELECT subtopic, subject, ask_count, confusion_rate, dominant_cognitive_level,
         -- Breakthrough rule: an explicit "got it" resolves the spot.
         -- An explicit "don't get it" after it reactivates immediately; an INFERRED
         -- low-confidence signal only reactivates if it lands well after the click
         -- (>5 min), so same-burst classification noise can't cancel a breakthrough.
         (last_positive_at IS NOT NULL
           AND (last_negative_fb_at IS NULL OR last_positive_at > last_negative_fb_at)
           AND (last_low_event_at IS NULL
                OR last_low_event_at < last_positive_at + INTERVAL '5 minutes')) AS resolved,
         CASE WHEN avg_bloom IS NOT NULL AND avg_bloom > 0
           THEN ask_count * confusion_rate * (1.0 / avg_bloom)
           ELSE ask_count * confusion_rate
         END AS weakness_score
       FROM cs
       ORDER BY resolved ASC, weakness_score DESC
       LIMIT 5`,
      p
    ),
    pool.query<{ day: string; count: string }>(
      `SELECT
         DATE(created_at)::text AS day,
         COUNT(*)::text AS count
       FROM progress_events
       WHERE created_at >= NOW() - INTERVAL '90 days' ${sc}
       GROUP BY day
       ORDER BY day`,
      p
    ),
    pool.query<{ remember: string; understand: string; apply: string; analyze: string; evaluate: string; create: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN cognitive_level = 'remember'  THEN 1 ELSE 0 END), 0) AS remember,
         COALESCE(SUM(CASE WHEN cognitive_level = 'understand' THEN 1 ELSE 0 END), 0) AS understand,
         COALESCE(SUM(CASE WHEN cognitive_level = 'apply'     THEN 1 ELSE 0 END), 0) AS apply,
         COALESCE(SUM(CASE WHEN cognitive_level = 'analyze'   THEN 1 ELSE 0 END), 0) AS analyze,
         COALESCE(SUM(CASE WHEN cognitive_level = 'evaluate'  THEN 1 ELSE 0 END), 0) AS evaluate,
         COALESCE(SUM(CASE WHEN cognitive_level = 'create'    THEN 1 ELSE 0 END), 0) AS create
       FROM progress_events WHERE cognitive_level IS NOT NULL ${sc}`,
      p
    ),
  ])

  const weakSpots: WeakSpot[] = weakRows.rows.map(r => ({
    subtopic:                r.subtopic,
    subject:                 r.subject,
    askCount:                parseInt(r.ask_count, 10),
    confusionRate:           parseFloat(r.confusion_rate),
    weaknessScore:           parseFloat(r.weakness_score),
    dominantCognitiveLevel:  r.dominant_cognitive_level as BloomLevel | null,
    status:                  r.resolved ? 'revisit' : 'active',
  }))

  const avgBloomNum = parseFloat(avgRow.rows[0].avg_bloom ?? '2')
  const dist        = distRow.rows[0]

  return {
    summary: {
      totalAsksThisWeek: parseInt(weekRow.rows[0].count, 10),
      totalEvents:       parseInt(totalRow.rows[0].count, 10),
      weakSpotCount:     weakSpots.filter(s => s.status === 'active').length,
      avgCognitiveLevel: numToBloom(avgBloomNum),
    },
    topicActivity: activityRows.rows.map(r => ({
      subtopic:               r.subtopic,
      askCount:               parseInt(r.ask_count, 10),
      lastAskedAt:            r.last_asked_at,
      dominantCognitiveLevel: r.dominant_cognitive_level as BloomLevel | null,
      recencyScore:           parseFloat(r.recency_score),
    })),
    weakSpots,
    dailyCounts: dailyRows.rows.map(r => ({ day: r.day, count: parseInt(r.count, 10) })),
    cognitiveDistribution: {
      remember:  parseInt(dist?.remember  ?? '0', 10),
      understand: parseInt(dist?.understand ?? '0', 10),
      apply:     parseInt(dist?.apply     ?? '0', 10),
      analyze:   parseInt(dist?.analyze   ?? '0', 10),
      evaluate:  parseInt(dist?.evaluate  ?? '0', 10),
      create:    parseInt(dist?.create    ?? '0', 10),
    },
  }
}

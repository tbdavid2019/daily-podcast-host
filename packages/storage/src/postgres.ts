import type { EpisodeLookup, EpisodeRecord, EpisodeStore, RunHistoryRecord, RunHistoryStore } from './types.js'

export interface PostgresQueryResult<T> {
  rows: T[]
}

export interface PostgresClient {
  query<T>(sql: string, params?: unknown[]): Promise<PostgresQueryResult<T>>
}

interface EpisodeRow {
  env: string
  variant: string
  episode_date: string
  title: string
  intro_content: string
  blog_content: string
  dialogue_json: string
  stories_json: string
  story_summaries_json: string
  generated_at: number
}

interface RunRow {
  env: string
  variant: string
  episode_date: string
  phase: RunHistoryRecord['phase']
  status: RunHistoryRecord['status']
  attempts: number
  error_message: string | null
  created_at: number
  updated_at: number
}

export class PostgresEpisodeStore implements EpisodeStore, RunHistoryStore {
  constructor(private readonly client: PostgresClient) {}

  async saveEpisode(record: EpisodeRecord) {
    await this.client.query(
      `insert into episodes (
        env, variant, episode_date, title, intro_content, blog_content,
        dialogue_json, stories_json, story_summaries_json, generated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      on conflict (env, variant, episode_date) do update set
        title = excluded.title,
        intro_content = excluded.intro_content,
        blog_content = excluded.blog_content,
        dialogue_json = excluded.dialogue_json,
        stories_json = excluded.stories_json,
        story_summaries_json = excluded.story_summaries_json,
        generated_at = excluded.generated_at`,
      [
        record.env,
        record.variant,
        record.date,
        record.title,
        record.introContent,
        record.blogContent,
        JSON.stringify(record.dialogue),
        JSON.stringify(record.stories),
        JSON.stringify(record.storySummaries),
        record.generatedAt,
      ],
    )
  }

  async getEpisode(lookup: EpisodeLookup) {
    const result = await this.client.query<EpisodeRow>(
      `select env, variant, episode_date, title, intro_content, blog_content,
        dialogue_json, stories_json, story_summaries_json, generated_at
      from episodes
      where env = $1 and variant = $2 and episode_date = $3
      limit 1`,
      [lookup.env, lookup.variant, lookup.date],
    )

    return result.rows[0] ? mapEpisodeRow(result.rows[0]) : null
  }

  async listEpisodes(env: string, variant: string, limit: number) {
    const result = await this.client.query<EpisodeRow>(
      `select env, variant, episode_date, title, intro_content, blog_content,
        dialogue_json, stories_json, story_summaries_json, generated_at
      from episodes
      where env = $1 and variant = $2
      order by episode_date desc
      limit $3`,
      [env, variant, limit],
    )

    return result.rows.map(mapEpisodeRow)
  }

  async saveRun(record: RunHistoryRecord) {
    await this.client.query(
      `insert into workflow_runs (
        env, variant, episode_date, phase, status, attempts, error_message, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict (env, variant, episode_date, phase) do update set
        status = excluded.status,
        attempts = excluded.attempts,
        error_message = excluded.error_message,
        updated_at = excluded.updated_at`,
      [
        record.env,
        record.variant,
        record.date,
        record.phase,
        record.status,
        record.attempts,
        record.errorMessage ?? null,
        record.createdAt,
        record.updatedAt,
      ],
    )
  }

  async getRun(env: string, variant: string, date: string, phase: RunHistoryRecord['phase']) {
    const result = await this.client.query<RunRow>(
      `select env, variant, episode_date, phase, status, attempts, error_message, created_at, updated_at
      from workflow_runs
      where env = $1 and variant = $2 and episode_date = $3 and phase = $4
      limit 1`,
      [env, variant, date, phase],
    )

    return result.rows[0]
      ? {
          env: result.rows[0].env,
          variant: result.rows[0].variant,
          date: result.rows[0].episode_date,
          phase: result.rows[0].phase,
          status: result.rows[0].status,
          attempts: result.rows[0].attempts,
          errorMessage: result.rows[0].error_message ?? undefined,
          createdAt: result.rows[0].created_at,
          updatedAt: result.rows[0].updated_at,
        }
      : null
  }
}

function mapEpisodeRow(row: EpisodeRow): EpisodeRecord {
  return {
    env: row.env,
    variant: row.variant,
    date: row.episode_date,
    title: row.title,
    introContent: row.intro_content,
    blogContent: row.blog_content,
    dialogue: JSON.parse(row.dialogue_json),
    stories: JSON.parse(row.stories_json),
    storySummaries: JSON.parse(row.story_summaries_json),
    generatedAt: row.generated_at,
  }
}

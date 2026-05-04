export interface WorkflowParams {
  today?: string
  force?: boolean
  variant?: string
  phase?: 'script' | 'audio'
  type?: string
}

export interface PodcastDialogueLine {
  speaker: '男' | '女'
  text: string
}

export interface PodcastScriptResponse {
  title?: string
  dialogue: PodcastDialogueLine[]
}

export type StorySource =
  | 'hacker-news'
  | 'github-trending'
  | 'product-hunt'
  | 'dev-to'
  | 'reddit'

export interface Story {
  id?: string
  title?: string
  url?: string
  content?: string
  summary?: string
  source?: StorySource
  sourceUrl?: string
  score?: number
  comments?: number
  time?: number
  description?: string
  votes?: number
  stars?: number
  upvotes?: number
  subreddit?: string
  hackerNewsUrl?: string
}

export interface GeneratedScriptData {
  title?: string
  dialogue: PodcastDialogueLine[]
  blogContent: string
  introContent: string
  stories: Story[]
  storySummaries: string[]
  displayDate: string
  generatedAt?: number
}

export interface ArticleRecord {
  title: string
  date: string
  updatedAt: number
  introContent: string
  blogContent: string
  podcastContent: string
  stories: Story[]
  audio: string
  variant: string
}

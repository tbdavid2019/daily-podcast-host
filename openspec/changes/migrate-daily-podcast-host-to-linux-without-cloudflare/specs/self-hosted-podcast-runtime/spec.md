## ADDED Requirements

### Requirement: Linux-hosted application stack
The system SHALL run the podcast web application and generation pipeline on a Linux host using Docker Compose without requiring Cloudflare Workers, Wrangler, OpenNext, KV, R2, or Cloudflare Workflow at runtime.

#### Scenario: Full stack boot
- **WHEN** an operator starts the deployment with the supported Compose command
- **THEN** the web, worker, Redis, database, object storage, and reverse proxy services SHALL start with the environment needed for the application to function

#### Scenario: No Cloudflare runtime dependency
- **WHEN** the Linux-hosted system is executing web requests or background jobs
- **THEN** no runtime path SHALL require Cloudflare bindings or `cloudflare:workers` APIs to complete the request or job

### Requirement: Podcast-compatible audio delivery
The system SHALL preserve podcast-client-compatible audio serving behavior for generated episodes.

#### Scenario: Audio exists for an episode
- **WHEN** a client requests an episode audio file that has already been generated
- **THEN** the system SHALL return the audio with headers and response semantics compatible with standard podcast playback

#### Scenario: Partial content request
- **WHEN** a client sends a valid byte range request for an existing episode audio file
- **THEN** the system SHALL return a partial content response that supports ranged playback

### Requirement: RSS publication gating
The system SHALL expose podcast enclosures in RSS only for episodes with audio that is already available in object storage.

#### Scenario: Audio not yet generated
- **WHEN** an episode record exists but the final audio object does not exist
- **THEN** the RSS output SHALL omit the enclosure for that episode

#### Scenario: Audio generated successfully
- **WHEN** the final audio object exists for an episode
- **THEN** the RSS output SHALL include an enclosure URL for that episode

## ADDED Requirements

### Requirement: Durable episode persistence
The system SHALL store durable episode metadata in a database-backed store rather than in transient cache infrastructure.

#### Scenario: Generated episode is saved
- **WHEN** script generation completes successfully for a date and variant
- **THEN** the episode title, content, stories, dialogue, and generation metadata SHALL be persisted in the durable store

#### Scenario: Web reads episode data
- **WHEN** the web layer renders a homepage entry, post page, or RSS item
- **THEN** it SHALL read episode data through the storage abstraction rather than directly from Cloudflare KV

### Requirement: Ephemeral workflow state isolation
The system SHALL store workflow locks, dedupe markers, retry state, and short-lived cache separately from durable episode records.

#### Scenario: Duplicate run protection
- **WHEN** the same daily generation request is triggered while an equivalent run is already active
- **THEN** the transient workflow state store SHALL prevent a duplicate run from starting

#### Scenario: Durable content survives transient state expiration
- **WHEN** transient workflow keys expire or are cleared
- **THEN** previously generated durable episode records SHALL remain available to the web and RSS layers

### Requirement: Object storage audio persistence
The system SHALL store generated audio assets in S3-compatible object storage through an audio storage abstraction.

#### Scenario: Final audio upload
- **WHEN** audio generation completes for an episode
- **THEN** the final audio SHALL be written to object storage using the configured path convention

#### Scenario: Audio existence check
- **WHEN** the web or RSS layer needs to determine whether audio is ready
- **THEN** it SHALL query the audio storage abstraction for object existence

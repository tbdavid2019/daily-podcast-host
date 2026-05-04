## ADDED Requirements

### Requirement: Daily pipeline orchestration
The system SHALL orchestrate the daily script and audio pipeline through a Node-based job execution layer.

#### Scenario: Scheduled daily run
- **WHEN** the configured daily schedule triggers
- **THEN** the system SHALL enqueue or start a generation run for the configured date and default variant

#### Scenario: Script precedes audio
- **WHEN** a daily generation run is executed
- **THEN** script generation SHALL complete before audio generation begins for the same episode

### Requirement: Retryable job execution
The system SHALL support retries for recoverable job failures during script or audio generation.

#### Scenario: Recoverable generation failure
- **WHEN** a generation job fails with a retryable error
- **THEN** the orchestration layer SHALL retry the job according to configured retry policy

#### Scenario: Exhausted retries
- **WHEN** a generation job continues failing after all retries are exhausted
- **THEN** the system SHALL record the failed run state for later inspection or replay

### Requirement: Manual targeted replay
The system SHALL support manual replay of a generation run for a specific date and variant.

#### Scenario: Manual replay request
- **WHEN** an operator invokes the supported replay command for a date and variant
- **THEN** the orchestration layer SHALL execute the generation pipeline for that target without requiring a Cloudflare workflow trigger

#### Scenario: Replay with duplicate protection
- **WHEN** an operator invokes a replay while an equivalent run is already active
- **THEN** the orchestration layer SHALL prevent or explicitly reject the duplicate execution

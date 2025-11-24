import { ApiProperty } from '@nestjs/swagger';

export const uploadOutcomeValues = [
  'uploaded',
  'skipped-no-change',
  'skipped-running',
  'disabled',
  'error',
] as const;

export type UploadOutcome = (typeof uploadOutcomeValues)[number];

export class AnalyticsUploadStatusDto {
  @ApiProperty({
    description: 'Indicates whether the uploader is currently running',
    example: false,
  })
  running!: boolean;

  @ApiProperty({
    description: 'ISO timestamp of the last upload attempt',
    example: '2025-01-01T12:00:00.000Z',
    nullable: true,
    required: false,
  })
  lastAttemptAt?: string | null;

  @ApiProperty({
    description: 'ISO timestamp of the last successful upload',
    example: '2025-01-01T12:00:20.000Z',
    nullable: true,
    required: false,
  })
  lastSuccessAt?: string | null;

  @ApiProperty({
    description: 'Hash of the last payload that was processed',
    example: 'a8f5f167f44f4964e6c998dee827110c',
    nullable: true,
    required: false,
  })
  lastHash?: string | null;

  @ApiProperty({
    description: 'Most recent HTTP status code returned by the remote endpoint',
    example: 200,
    nullable: true,
    required: false,
  })
  lastResponseCode?: number | null;

  @ApiProperty({
    description: 'Duration in milliseconds for the most recent attempt',
    example: 845,
    nullable: true,
    required: false,
  })
  lastDurationMs?: number | null;

  @ApiProperty({
    description: 'Reason why the last attempt was skipped',
    example: 'no-change',
    nullable: true,
    required: false,
  })
  lastSkipReason?: string | null;

  @ApiProperty({
    description: 'Reason of the last failure if any',
    example: 'ECONNREFUSED: Remote analytics endpoint unreachable',
    nullable: true,
    required: false,
  })
  lastError?: string | null;
}

export class TriggerUploadResponseDto {
  @ApiProperty({
    description: 'Outcome of the latest upload attempt',
    enum: uploadOutcomeValues,
    example: 'uploaded',
  })
  outcome!: UploadOutcome;

  @ApiProperty({
    description: 'Human readable context about the attempt outcome',
    example: 'Analytics snapshot uploaded',
    required: false,
  })
  message?: string;

  @ApiProperty({
    description: 'Snapshot of the uploader internal state after the attempt',
    type: AnalyticsUploadStatusDto,
  })
  status!: AnalyticsUploadStatusDto;
}


export const GOOGLE_DRIVE_CONNECTION_REPOSITORY = Symbol(
  'GoogleDriveConnectionRepository',
);

export interface GoogleDriveConnectionRecord {
  readonly userId: string;
  readonly googleEmail: string;
  readonly refreshTokenEncrypted: string;
  readonly scopes: string;
  readonly connectedAt: Date;
  readonly updatedAt: Date;
}

export interface SaveGoogleDriveConnectionInput {
  readonly userId: string;
  readonly googleEmail: string;
  readonly refreshTokenEncrypted: string;
  readonly scopes: string;
}

export interface GoogleDriveConnectionRepository {
  findByUserId(userId: string): Promise<GoogleDriveConnectionRecord | null>;
  upsert(input: SaveGoogleDriveConnectionInput): Promise<void>;
  deleteByUserId(userId: string): Promise<void>;
}

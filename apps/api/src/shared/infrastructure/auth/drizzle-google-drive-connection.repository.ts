import { Inject, Injectable } from '@nestjs/common';
import {
  eq,
  googleDriveConnections,
  type Database,
} from '@kora/db';
import {
  GOOGLE_DRIVE_CONNECTION_REPOSITORY,
  type GoogleDriveConnectionRecord,
  type GoogleDriveConnectionRepository,
  type SaveGoogleDriveConnectionInput,
} from '../../application/ports/google-drive-connection.repository';
import { DATABASE } from '../database/database.module';

@Injectable()
export class DrizzleGoogleDriveConnectionRepository
  implements GoogleDriveConnectionRepository
{
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findByUserId(
    userId: string,
  ): Promise<GoogleDriveConnectionRecord | null> {
    const rows = await this.database
      .select({
        userId: googleDriveConnections.userId,
        googleEmail: googleDriveConnections.googleEmail,
        refreshTokenEncrypted: googleDriveConnections.refreshTokenEncrypted,
        scopes: googleDriveConnections.scopes,
        connectedAt: googleDriveConnections.connectedAt,
        updatedAt: googleDriveConnections.updatedAt,
      })
      .from(googleDriveConnections)
      .where(eq(googleDriveConnections.userId, userId))
      .limit(1);

    return rows[0] ?? null;
  }

  async upsert(input: SaveGoogleDriveConnectionInput): Promise<void> {
    const now = new Date();

    await this.database
      .insert(googleDriveConnections)
      .values({
        userId: input.userId,
        googleEmail: input.googleEmail,
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        scopes: input.scopes,
        connectedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: googleDriveConnections.userId,
        set: {
          googleEmail: input.googleEmail,
          refreshTokenEncrypted: input.refreshTokenEncrypted,
          scopes: input.scopes,
          connectedAt: now,
          updatedAt: now,
        },
      });
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.database
      .delete(googleDriveConnections)
      .where(eq(googleDriveConnections.userId, userId));
  }
}

void GOOGLE_DRIVE_CONNECTION_REPOSITORY;

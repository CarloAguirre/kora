import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppConfigService } from '../../../../config/app-config.service';
import { GoogleDriveFolderClient } from './google-drive-folder.client';

describe('GoogleDriveFolderClient · NestJS dependency injection', () => {
  it('resuelve el proveedor estándar sin registrar un String para el token delegado', async () => {
    const module = await Test.createTestingModule({
      providers: [
        GoogleDriveFolderClient,
        { provide: AppConfigService, useValue: { googleDrive: { enabled: false } } },
      ],
    }).compile();

    try {
      const client = module.get(GoogleDriveFolderClient);
      expect(client).toBeInstanceOf(GoogleDriveFolderClient);
      expect(client.isConfigured()).toBe(false);
    } finally {
      await module.close();
    }
  });

  it('permite crear un lector puntual con token OAuth de un usuario', () => {
    const config = { googleDrive: { enabled: false } } as AppConfigService;
    const client = new GoogleDriveFolderClient(config, 'token-temporal');
    expect(client.isConfigured()).toBe(true);
  });
});
